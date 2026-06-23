# AGENTS.md — 리포트렌즈 코딩 에이전트 규약

Claude Code · Cursor 등 코딩 에이전트가 이 프로젝트에서 따를 규칙. (사람도 읽으면 됨)

## 프로젝트
- 산업리포트를 목적별 렌즈(취업·투자)로 구조화 요약·누적하고 PDF로 내보내는 개인화 도구.
- **혼자 하는 프로젝트** (장인우, 비개발자 PM). 상용화 가능한 구조가 목표.
- 상세 맥락: `README.md`, `PRD_리포트렌즈_v0.1.md`, `build/아키텍처_DB설계_v0.1.md`.

## 스택 (확정)
ECS Fargate + ALB · RDS PostgreSQL · S3 · Cognito(구글·카카오) · SQS 워커 · Vercel · CDK · CloudWatch.
LLM = 멀티프로바이더 라우터: 기본 Gemini(Flash 초벌 → Pro 핵심요약) / BYO Claude 키(KMS 암호화) / MCP 서버.

## 모노레포 구조 (목표)
```
web/     프론트 (Vercel, 디자인 시안 design/ 기반)
api/     백엔드 API (Fargate)
worker/  추출 워커 (SQS 소비, 파싱+LLM)
mcp/     리포트렌즈 MCP 서버 (사용자 Claude로 구동)
infra/   IaC (CDK)
```

## 코딩 규칙
1. **오픈소스 먼저.** 맨땅 코딩 전 GeekNews(news.hada.io)+GitHub에서 찾고 라이선스(MIT/Apache 우선) 확인. (스킬: inwoo-vibe-coding) 후보: kordoc·contextgem·markpdfdown(문서 파싱).
2. **수직 슬라이스로** 쌓기. 한 기능을 백+프론트 끝까지. 백엔드만 다 만들고 붙이지 않는다.
3. **한 번에 하나, 검증하며.** 통빌드 금지. 작동 확인 후 다음.
4. **DB는 마이그레이션 코드로**(Prisma/Drizzle). 콘솔 수작업 금지. 모든 사용자 데이터에 `user_id` 스코핑(API 계층에서 강제).
5. **시크릿·키는 코드/문서에 평문 금지** → Secrets Manager / KMS. BYO Claude 키는 암호화 저장, 절대 로깅 X.
6. **LLM 호출은 프로바이더 추상화(라우터)** 통해서. 파싱·틀 스키마·가드레일은 프로바이더 무관 공통 코어로(웹·MCP 재사용).

## 가드레일 (제품 핵심)
- 리포트에 없는 숫자·전망 **생성 금지**. 핵심숫자엔 출처 페이지 `[p.N]` 인용, 없으면 "명시 없음".
- 입력은 **사용자 본인 업로드(BYO)만**. 외부 자동수집·크롤링 금지(네이버 robots·약관 위반 확인됨).
- 출력은 변형적 요약(원문 장문 복제 금지). 투자 관련은 "투자조언 아님" 면책.
- 월/연 롤업은 하위 일별 엔트리만 근거(새 수치 생성 금지).

## 진행 관리
- 노션 보드의 Sprints/Tasks로 관리. 태스크 Status: Not started → In progress → Done.
- 빌드 순서: Sprint 0 인프라 → S1 인증·업로드 → S2 AI코어 → S3 시간뷰·롤업 → S4 PDF·배포 → S5 MCP.

## 컨벤션
- 한국어 커뮤니케이션. 문서·커밋 메시지에서 em dash(—) 사용 금지.
- 팀/담당자 표현 쓰지 않는다(혼자 하는 프로젝트).
- 결정은 노션 Decision Log에 기록(날짜/결정/이유).
