import { Stack, StackProps, Duration } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Vpc, SecurityGroup, CfnSecurityGroupIngress } from "aws-cdk-lib/aws-ec2";
import { Cluster, ContainerImage, Secret as EcsSecret, ContainerInsights } from "aws-cdk-lib/aws-ecs";
import { ApplicationLoadBalancedFargateService } from "aws-cdk-lib/aws-ecs-patterns";
import { Key } from "aws-cdk-lib/aws-kms";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { DatabaseInstance } from "aws-cdk-lib/aws-rds";
import { UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import { EnvConfig } from "../config/env.js";

interface ComputeStackProps extends StackProps {
  config: EnvConfig;
  vpc: Vpc;
  db: DatabaseInstance;
  dbSecurityGroup: SecurityGroup;
  uploadsBucket: Bucket;
  extractionQueue: Queue;
  kmsKey: Key;
  userPool: UserPool;
  userPoolClient: UserPoolClient;
}

// 컴퓨팅: ECS Fargate + ALB 로 API 서버 구동.
// 컨테이너 이미지는 Sprint 1 에서 api/ 빌드 산출물로 교체(지금은 플레이스홀더).
export class ComputeStack extends Stack {
  public readonly api: ApplicationLoadBalancedFargateService;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);
    const { config, vpc, db, dbSecurityGroup, uploadsBucket, extractionQueue, kmsKey, userPool, userPoolClient } = props;

    const cluster = new Cluster(this, "Cluster", {
      clusterName: `${config.prefix}-cluster`,
      vpc,
      containerInsightsV2: config.envName === "prod" ? ContainerInsights.ENABLED : ContainerInsights.DISABLED,
    });

    const dbSecret = db.secret!; // 자동 생성된 자격증명 시크릿

    this.api = new ApplicationLoadBalancedFargateService(this, "ApiService", {
      cluster,
      serviceName: `${config.prefix}-api`,
      cpu: 256,
      memoryLimitMiB: 512,
      desiredCount: config.envName === "prod" ? 2 : 1,
      publicLoadBalancer: true,
      taskImageOptions: {
        // 플레이스홀더. Sprint 1 에 api/ 이미지로 교체(ECR).
        image: ContainerImage.fromRegistry("public.ecr.aws/nginx/nginx:latest"),
        containerPort: 3000,
        environment: {
          NODE_ENV: config.envName === "prod" ? "production" : "development",
          AWS_REGION: config.region,
          UPLOADS_BUCKET: uploadsBucket.bucketName,
          EXTRACTION_QUEUE_URL: extractionQueue.queueUrl,
          APP_KMS_KEY_ARN: kmsKey.keyArn,
          COGNITO_USER_POOL_ID: userPool.userPoolId,
          COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
        },
        secrets: {
          DB_HOST: EcsSecret.fromSecretsManager(dbSecret, "host"),
          DB_PORT: EcsSecret.fromSecretsManager(dbSecret, "port"),
          DB_NAME: EcsSecret.fromSecretsManager(dbSecret, "dbname"),
          DB_USER: EcsSecret.fromSecretsManager(dbSecret, "username"),
          DB_PASSWORD: EcsSecret.fromSecretsManager(dbSecret, "password"),
        },
      },
    });

    // 헬스체크 경로(API 가 /health 제공 전까지는 nginx 기본 200)
    this.api.targetGroup.configureHealthCheck({
      path: "/",
      healthyHttpCodes: "200-399",
      interval: Duration.seconds(30),
    });

    // DB 접속 허용: 크로스스택 순환을 피하려고 ComputeStack 에 인그레스 리소스를 직접 둔다
    // (db.connections.allowDefaultPortFrom 은 DataStack SG 를 ComputeStack 에서 변형하려다 실패).
    new CfnSecurityGroupIngress(this, "DbIngressFromApi", {
      groupId: dbSecurityGroup.securityGroupId,
      ipProtocol: "tcp",
      fromPort: 5432,
      toPort: 5432,
      sourceSecurityGroupId: this.api.service.connections.securityGroups[0].securityGroupId,
      description: "api -> postgres",
    });

    // 권한: 시크릿/큐/버킷/KMS
    const taskRole = this.api.taskDefinition.taskRole;
    dbSecret.grantRead(taskRole);
    extractionQueue.grantSendMessages(taskRole);
    uploadsBucket.grantReadWrite(taskRole);
    kmsKey.grantEncryptDecrypt(taskRole);

    // 오토스케일(prod)
    if (config.envName === "prod") {
      const scaling = this.api.service.autoScaleTaskCount({ minCapacity: 2, maxCapacity: 6 });
      scaling.scaleOnCpuUtilization("Cpu", { targetUtilizationPercent: 60 });
    }
  }
}
