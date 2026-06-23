import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Vpc, IpAddresses, SubnetType } from "aws-cdk-lib/aws-ec2";
import { EnvConfig } from "../config/env.js";

interface NetworkStackProps extends StackProps {
  config: EnvConfig;
}

// VPC: ECS/RDS 가 들어갈 네트워크. 퍼블릭(ALB) + 프라이빗(앱·DB).
export class NetworkStack extends Stack {
  public readonly vpc: Vpc;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);
    const { config } = props;

    this.vpc = new Vpc(this, "Vpc", {
      vpcName: `${config.prefix}-vpc`,
      ipAddresses: IpAddresses.cidr("10.0.0.0/16"),
      maxAzs: 2,
      natGateways: config.natGateways, // dev=1(비용 절감), prod=2
      subnetConfiguration: [
        { name: "public", subnetType: SubnetType.PUBLIC, cidrMask: 24 },
        { name: "app", subnetType: SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: "data", subnetType: SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });
  }
}
