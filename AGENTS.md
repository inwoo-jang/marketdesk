# AGENTS.md — 리포트렌즈 코딩 에이전트 규약

Claude Code · Cursor 등 코딩 에이전트가 이 프로젝트에서 따를 규칙. (사람도 읽으면 됨)
갱신: 2026-06-23

## 프로젝트
- 산업·기업 리포트와 경제뉴스를 목적별 렌즈(취업·투자)로 구조화 요약·누적하고 PDF로 내보내는 개인화 도구.
- **혼자 하는 프로젝트** (장인우, 비개발자 PM). 상용화 가능한 구조가 목표.
- 개발은 **로컬 우선**(로컬 Postgres + mock LLM). AWS·실제 LLM 은 출시 단계에 연결.
- 상세 맥락: `README.md`, `PRD_리포트렌즈_v0.1.md`, `build/아키텍처_DB설계_v0.1.md`.

## 스택 (확정)
- 프론트 = **Next.js**(App Router) · Vercel. API = **Hono(TypeScript)** · ECS Fargate + ALB.
- 워커 = **Node/TypeScript** (PDF 파싱 `unpdf`, 텍스트 입력 지원, 이미지는 Phase 2). SQS 소비(로컬은 DB 폴링).
- DB = **RDS PostgreSQL + Drizzle ORM**(마이그레이션은 `packages/db` 가 source of truth). S3 · Cognito(구글·카카오) · Secrets Manager · KMS · CloudWatch · CDK.
- LLM = 멀티프로바이더 라우터: 기본 **Gemini** / 로컬 **mock**(키 불필요) / BYO Claude 키(KMS 암호화) / MCP 서버.

## 모노레포 구조
```
web/        프론트 (Next.js, Vercel)
api/        백엔드 API (Hono, Fargate)
worker/     추출 워커 (Node/TS: 파싱 + LLM 추출 + 가드레일)
mcp/        리포트렌즈 MCP 서버 (Phase 2)
infra/      IaC (CDK) + DEPLOY.md
packages/db 공유 DB 스키마(Drizzle) + 마이그레이션 + ERD  ← 모든 패키지의 DB 원천
```
- pnpm 워크스페이스. 로컬 통합 실행 `pnpm dev`(api+web+worker). 패키지별 `typecheck` 스크립트 보유.
- 프론트(web)는 `@reportlens/db` 를 import 하지 않는다(서버 전용 코드 번들 유입 방지). web 은 API 로만 데이터 접근.

## 코딩 규칙
1. **오픈소스 먼저.** 맨땅 코딩 전 GeekNews+GitHub에서 찾고 라이선스(MIT/Apache) 확인. (스킬: inwoo-vibe-coding)
2. **수직 슬라이스로** 쌓기. 한 기능을 백+프론트 끝까지. 백엔드만 다 만들고 붙이지 않는다.
3. **한 번에 하나, 검증하며.** 통빌드 금지. 작동 확인(타입체크·로컬 실행) 후 다음.
4. **DB는 마이그레이션 코드로**(Drizzle). 콘솔 수작업 금지. 스키마 변경 시 `pnpm db:generate` 후 커밋. 모든 사용자 데이터에 `user_id` 스코핑(API 의 `requireUser` 미들웨어로 강제).
5. **시크릿·키는 코드/문서에 평문 금지** → Secrets Manager / KMS. `.env` 는 커밋 금지(`.env.example` 만). BYO 키는 암호화 저장, 절대 로깅 X.
6. **LLM 호출은 프로바이더 추상화(라우터)** 통해서. 파싱·틀 스키마·가드레일은 프로바이더 무관 공통 코어로(웹·MCP 재사용).
7. **인증은 추상화 뒤에**. 로컬은 dev 로그인(쿠키 세션), 운영은 Cognito JWT. `getCurrentUser()` 구현만 교체.

## 가드레일 (제품 핵심)
- 리포트에 없는 숫자·전망 **생성 금지**. 핵심숫자엔 출처 페이지 `[p.N]` 인용 + **룰매칭 검증(entry_numbers.verified)**, 없으면 "명시 없음".
- 입력은 **사용자 본인 업로드(BYO)만**. 외부 자동수집·크롤링 금지(네이버 robots·약관 위반 확인됨).
- 출력은 변형적 요약(원문 장문 복제 금지). 투자 관련은 "투자조언 아님" 면책.
- 월/연 롤업은 하위 일별 엔트리만 근거(새 수치 생성 금지).
- 산업·문서타입은 **AI 가 자동 분류·매칭**하되 사용자가 확인·수정.
- **요금·한도**: 무료 = 하루 3회 분석. 초과 시 유료 플랜 또는 BYO 키(BYO Claude 도 Pro 기능). 추출 요청 시 사용량 게이팅. 실결제는 출시 단계.
- **자동수집 경계**: 증권사 리포트 크롤링 금지(BYO 업로드만). 기본 공개 콘텐츠는 공개·허용 소스(KIET/KOTRA/KIEP/공공기관)만, robots·약관 개별 확인. 별도 스프린트.

## 진행 관리
- 노션 보드의 Sprints/Tasks로 관리. 태스크 Status: Not started → In progress → Done. **태스크 완료 시 바로 노션 반영.**
- 빌드 순서: S0 인프라 → S1 인증·산업·업로드 → S2 AI코어 → S3 시간뷰·롤업 → S4 PDF·배포 → S5 MCP.

## 컨벤션
- 한국어 커뮤니케이션. 문서·커밋 메시지에서 em dash(—) 사용 금지.
- 팀/담당자 표현 쓰지 않는다(혼자 하는 프로젝트).
- 결정은 노션 Decision Log에 기록(날짜/결정/이유).
