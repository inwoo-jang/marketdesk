import { Stack, StackProps, SecretValue, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  UserPool,
  UserPoolClient,
  UserPoolIdentityProviderGoogle,
  UserPoolIdentityProviderOidc,
  UserPoolClientIdentityProvider,
  ProviderAttribute,
  OAuthScope,
} from "aws-cdk-lib/aws-cognito";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { EnvConfig } from "../config/env.js";

interface AuthStackProps extends StackProps {
  config: EnvConfig;
  /** OAuth 콜백 URL (프론트 도메인). 배포 후 확정값으로 갱신 */
  callbackUrls: string[];
  logoutUrls: string[];
}

// 인증: Cognito User Pool + 구글/카카오 소셜.
// IdP 자격증명은 배포 전 SSM/Secrets 에 넣어둠(런북 참조). synth 는 토큰이라 값 없이도 통과.
export class AuthStack extends Stack {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);
    const { config } = props;

    this.userPool = new UserPool(this, "UserPool", {
      userPoolName: `${config.prefix}-users`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      removalPolicy: config.envName === "prod" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // 구글
    const google = new UserPoolIdentityProviderGoogle(this, "Google", {
      userPool: this.userPool,
      clientId: StringParameter.valueForStringParameter(this, `/${config.prefix}/google/client-id`),
      clientSecretValue: SecretValue.secretsManager(`${config.prefix}/google`, {
        jsonField: "client_secret",
      }),
      scopes: ["openid", "email", "profile"],
      attributeMapping: {
        email: ProviderAttribute.GOOGLE_EMAIL,
        fullname: ProviderAttribute.GOOGLE_NAME,
      },
    });

    // 카카오 (OIDC)
    const kakao = new UserPoolIdentityProviderOidc(this, "Kakao", {
      userPool: this.userPool,
      name: "Kakao",
      clientId: StringParameter.valueForStringParameter(this, `/${config.prefix}/kakao/client-id`),
      clientSecret: StringParameter.valueForStringParameter(this, `/${config.prefix}/kakao/client-secret`),
      issuerUrl: "https://kauth.kakao.com",
      scopes: ["openid", "account_email", "profile_nickname"],
      attributeMapping: {
        email: ProviderAttribute.other("email"),
        fullname: ProviderAttribute.other("nickname"),
      },
    });

    // Hosted UI 도메인
    this.userPool.addDomain("Domain", {
      cognitoDomain: { domainPrefix: config.prefix },
    });

    this.userPoolClient = new UserPoolClient(this, "WebClient", {
      userPool: this.userPool,
      userPoolClientName: `${config.prefix}-web`,
      generateSecret: false, // SPA(PKCE)
      supportedIdentityProviders: [
        UserPoolClientIdentityProvider.GOOGLE,
        UserPoolClientIdentityProvider.custom("Kakao"),
      ],
      oAuth: {
        callbackUrls: props.callbackUrls,
        logoutUrls: props.logoutUrls,
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
      },
    });
    this.userPoolClient.node.addDependency(google, kakao);
  }
}
