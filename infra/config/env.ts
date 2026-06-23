import { RemovalPolicy } from "aws-cdk-lib";
import { InstanceType, InstanceClass, InstanceSize } from "aws-cdk-lib/aws-ec2";

export type EnvName = "dev" | "prod";

export interface EnvConfig {
  envName: EnvName;
  /** AWS 계정/리전. 미지정 시 CDK_DEFAULT_* 사용(synth는 자격증명 없이도 동작) */
  account?: string;
  region: string;
  /** 모든 리소스 이름 접두 */
  prefix: string;
  db: {
    instanceType: InstanceType;
    allocatedStorageGb: number;
    multiAz: boolean;
    deletionProtection: boolean;
    removalPolicy: RemovalPolicy;
  };
  /** dev 는 NAT 비용 절감 등 */
  natGateways: number;
}

const REGION = process.env.CDK_DEFAULT_REGION ?? "ap-northeast-2"; // 서울
const ACCOUNT = process.env.CDK_DEFAULT_ACCOUNT;

const dev: EnvConfig = {
  envName: "dev",
  account: ACCOUNT,
  region: REGION,
  prefix: "reportlens-dev",
  db: {
    instanceType: InstanceType.of(InstanceClass.BURSTABLE4_GRAVITON, InstanceSize.MICRO), // t4g.micro
    allocatedStorageGb: 20,
    multiAz: false,
    deletionProtection: false,
    removalPolicy: RemovalPolicy.DESTROY,
  },
  natGateways: 1,
};

const prod: EnvConfig = {
  envName: "prod",
  account: ACCOUNT,
  region: REGION,
  prefix: "reportlens-prod",
  db: {
    instanceType: InstanceType.of(InstanceClass.BURSTABLE4_GRAVITON, InstanceSize.SMALL), // t4g.small
    allocatedStorageGb: 50,
    multiAz: true,
    deletionProtection: true,
    removalPolicy: RemovalPolicy.RETAIN,
  },
  natGateways: 2,
};

const configs: Record<EnvName, EnvConfig> = { dev, prod };

export function getConfig(envName: string | undefined): EnvConfig {
  const key = (envName ?? "dev") as EnvName;
  const cfg = configs[key];
  if (!cfg) {
    throw new Error(`알 수 없는 env: ${envName}. dev | prod 중 하나 (예: cdk synth --context env=dev)`);
  }
  return cfg;
}
