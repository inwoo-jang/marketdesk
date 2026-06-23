import { Stack, StackProps, Duration, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Vpc, SubnetType, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { Key } from "aws-cdk-lib/aws-kms";
import { Bucket, BlockPublicAccess, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { Queue } from "aws-cdk-lib/aws-sqs";
import {
  DatabaseInstance,
  DatabaseInstanceEngine,
  PostgresEngineVersion,
  Credentials,
} from "aws-cdk-lib/aws-rds";
import { EnvConfig } from "../config/env.js";

interface DataStackProps extends StackProps {
  config: EnvConfig;
  vpc: Vpc;
}

// 데이터 계층: KMS(BYO 키 암호화) · S3(원본 PDF) · SQS(추출 큐) · RDS PostgreSQL.
export class DataStack extends Stack {
  public readonly kmsKey: Key;
  public readonly uploadsBucket: Bucket;
  public readonly extractionQueue: Queue;
  public readonly db: DatabaseInstance;
  public readonly dbSecurityGroup: SecurityGroup;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const { config, vpc } = props;

    // KMS: BYO Claude 키 암호화 등 앱 시크릿용.
    this.kmsKey = new Key(this, "AppKey", {
      alias: `${config.prefix}-app`,
      enableKeyRotation: true,
      removalPolicy: config.db.removalPolicy,
    });

    // S3: 업로드 원본 PDF. 프라이빗(사용자별 prefix 는 앱이 키로 격리).
    this.uploadsBucket = new Bucket(this, "UploadsBucket", {
      bucketName: `${config.prefix}-uploads`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: config.db.removalPolicy,
      autoDeleteObjects: config.envName === "dev",
    });

    // SQS: 추출 작업 큐 + DLQ.
    const dlq = new Queue(this, "ExtractionDlq", {
      queueName: `${config.prefix}-extraction-dlq`,
      retentionPeriod: Duration.days(14),
    });
    this.extractionQueue = new Queue(this, "ExtractionQueue", {
      queueName: `${config.prefix}-extraction`,
      visibilityTimeout: Duration.minutes(15), // 파싱+LLM 장기작업
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
    });

    // RDS PostgreSQL: 격리 서브넷, 자격증명은 Secrets Manager 자동 생성.
    this.dbSecurityGroup = new SecurityGroup(this, "DbSg", {
      vpc,
      description: `${config.prefix} RDS SG`,
      allowAllOutbound: true,
    });

    this.db = new DatabaseInstance(this, "Postgres", {
      engine: DatabaseInstanceEngine.postgres({ version: PostgresEngineVersion.VER_16_4 }),
      instanceType: config.db.instanceType,
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
      securityGroups: [this.dbSecurityGroup],
      allocatedStorage: config.db.allocatedStorageGb,
      maxAllocatedStorage: config.db.allocatedStorageGb * 5,
      multiAz: config.db.multiAz,
      databaseName: "reportlens",
      credentials: Credentials.fromGeneratedSecret("reportlens_app", {
        secretName: `${config.prefix}/db-credentials`,
      }),
      deletionProtection: config.db.deletionProtection,
      removalPolicy: config.db.removalPolicy,
      storageEncrypted: true,
      backupRetention: Duration.days(config.envName === "prod" ? 7 : 1),
    });
  }
}
