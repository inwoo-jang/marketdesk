# 배포 런북 (Sprint 0 인프라)

마켓데스크 AWS 인프라를 실제로 올리는 절차. CDK 코드(`infra/`)는 `cdk synth` 까지 검증됨. 여기서부터는 **장인우 AWS 계정·크리덴셜이 필요**하므로 단계별로 확인하며 진행한다.

> 스택 의존성: network -> data -> auth -> compute. `--all` 로 배포하면 CDK 가 순서를 자동 정렬한다.
> region: `ap-northeast-2`(서울). env: `dev` | `prod`.

---

## 0. 사전 준비 (1회)

1. AWS 계정 + 관리자 권한 IAM 사용자(또는 IAM Identity Center).
2. 로컬에 AWS CLI 설치 후 자격증명 설정:
   ```
   aws configure                 # Access Key / Secret / region=ap-northeast-2
   aws sts get-caller-identity   # 계정 확인
   ```
3. infra 의존성 설치:
   ```
   cd infra && pnpm install
   ```
4. **CDK 부트스트랩** (계정·리전당 1회, CDK 가 쓰는 S3/ECR/role 생성):
   ```
   pnpm exec cdk bootstrap aws://<ACCOUNT_ID>/ap-northeast-2
   ```

---

## 1. IdP(구글·카카오) 자격증명 주입 (auth 배포 전 필수)

AuthStack 은 클라이언트 ID/시크릿을 **SSM 파라미터 + Secrets Manager** 에서 읽는다(코드/문서에 평문 금지). 배포 전에 값을 넣어둬야 한다. 아래는 `dev` 기준(`prod` 는 prefix 만 `reportlens-prod`).

### 1-1. 구글 OAuth 앱
- Google Cloud Console -> API 및 서비스 -> 사용자 인증 정보 -> OAuth 클라이언트 ID(웹).
- 승인된 리디렉션 URI: `https://reportlens-dev.auth.ap-northeast-2.amazoncognito.com/oauth2/idpresponse`
  (Cognito Hosted UI 도메인. 도메인 prefix 는 `reportlens-dev` 로 코드에 설정됨.)
- 발급된 Client ID / Client Secret 을 저장:
  ```
  aws ssm put-parameter --name "/reportlens-dev/google/client-id" --type String --value "<GOOGLE_CLIENT_ID>"
  aws secretsmanager create-secret --name "reportlens-dev/google" \
    --secret-string '{"client_secret":"<GOOGLE_CLIENT_SECRET>"}'
  ```

### 1-2. 카카오 OAuth 앱
- Kakao Developers -> 내 애플리케이션 -> 앱 생성. 카카오 로그인 활성화, OpenID Connect 활성화.
- Redirect URI: 위와 동일한 Cognito `/oauth2/idpresponse`.
- REST API 키 = client-id, 보안 -> Client Secret 발급 = client-secret:
  ```
  aws ssm put-parameter --name "/reportlens-dev/kakao/client-id" --type String --value "<KAKAO_REST_API_KEY>"
  aws ssm put-parameter --name "/reportlens-dev/kakao/client-secret" --type String --value "<KAKAO_CLIENT_SECRET>"
  ```
  > 주의: 현재 코드는 카카오 시크릿을 일반 String 파라미터로 읽는다(`valueForStringParameter` 는 SecureString 을 복호화하지 못함). 운영 강화 시 Secrets Manager 로 옮긴다(백로그).

---

## 2. 배포

```
# dev 전체
pnpm deploy:dev      # = cdk deploy --all --context env=dev

# prod 전체
pnpm deploy:prod
```
- 변경분 미리보기: `pnpm exec cdk diff --context env=dev`
- 개별 스택: `pnpm exec cdk deploy reportlens-dev-data --context env=dev`

배포가 끝나면 출력(Outputs)에 ALB DNS, Cognito User Pool ID, Client ID 등이 찍힌다.

---

## 3. 배포 후 마무리

### 3-1. DB 초기 마이그레이션 (RDS)
RDS 는 프라이빗(격리) 서브넷이라 로컬에서 바로 접속 불가. 둘 중 하나로 터널 연결 후 마이그레이션.
- 권장: SSM Session Manager 포트포워딩(배스천 EC2 또는 ECS exec). 터널로 `localhost:5432 -> RDS:5432` 연결.
- DB 자격증명은 Secrets Manager `reportlens-dev/db-credentials` 에 자동 생성됨(host/port/dbname/username/password).
  ```
  export DATABASE_URL="postgres://reportlens_app:<PW>@localhost:5432/reportlens"
  pnpm db:migrate
  ```

### 3-2. API 컨테이너 이미지 (Sprint 1)
ComputeStack 은 지금 placeholder 이미지(nginx)로 떠 있다. Sprint 1 에서 `api/` 빌드 -> ECR push -> ComputeStack 이미지 교체 후 재배포.

### 3-3. Vercel(프론트) 연결 + 콜백 URL 갱신
1. Vercel 에서 `web/` 프로젝트 연결, 도메인 확인(예: `reportlens.vercel.app`).
2. 실제 도메인을 `infra/bin/app.ts` 의 `callbackUrls`/`logoutUrls` 에 반영 후 `pnpm deploy:dev` 재배포(Cognito 콜백 갱신).
3. Vercel 환경변수: API(ALB) URL, Cognito User Pool ID / Client ID / 도메인.

---

## 4. 정리(삭제)

```
pnpm destroy:dev     # dev 전체 삭제
```
- `prod` 는 RDS `deletionProtection` + `RemovalPolicy.RETAIN` 이라 수동 보호. 삭제 시 콘솔에서 보호 해제 필요.

---

## 체크리스트

- [ ] aws configure + get-caller-identity 확인
- [ ] cdk bootstrap 완료
- [ ] 구글/카카오 OAuth 앱 생성 + redirect URI 등록
- [ ] SSM/Secrets 에 IdP 자격증명 주입(dev)
- [ ] pnpm deploy:dev 성공
- [ ] RDS 터널 + pnpm db:migrate 성공
- [ ] (Sprint 1) api 이미지 ECR + ComputeStack 교체
- [ ] Vercel 연결 + 콜백 URL 갱신 재배포
