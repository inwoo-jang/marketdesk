# infra — IaC (AWS CDK)

ECS Fargate + ALB / RDS PostgreSQL / S3 / Cognito / SQS / Secrets Manager / KMS / CloudWatch.

## 스택 (4)
- `reportlens-{env}-network` — VPC(퍼블릭/앱/데이터 서브넷, NAT)
- `reportlens-{env}-data` — KMS · S3(업로드) · SQS(추출 큐+DLQ) · RDS PostgreSQL
- `reportlens-{env}-auth` — Cognito User Pool + 구글/카카오 IdP + Hosted UI
- `reportlens-{env}-compute` — ECS Fargate + ALB (API, 지금은 placeholder 이미지)

env: `dev` | `prod` (`config/env.ts`). 둘 다 `cdk synth` 통과 확인됨.

## 명령
```
pnpm --filter @reportlens/infra typecheck
pnpm --filter @reportlens/infra synth -- --context env=dev
pnpm deploy:dev      # cdk deploy --all --context env=dev
pnpm deploy:prod
pnpm destroy:dev
```

## 실제 배포
AWS 계정·크리덴셜이 필요하다. 절차는 [DEPLOY.md](DEPLOY.md) 참조
(부트스트랩 -> IdP 자격증명 주입 -> deploy -> RDS 마이그레이션 -> Vercel 연결).

## 메모
- 컨테이너 이미지는 Sprint 1 에서 `api/` 빌드 산출물(ECR)로 교체.
- 시크릿 평문 금지: IdP 자격증명은 SSM/Secrets, BYO 키는 KMS.
