# 마켓데스크 (MarketDesk)

산업·기업 리포트와 경제뉴스는 매일 쌓이는데, 읽는 목적은 사람마다 다릅니다. 마켓데스크는 내가 올린 문서를 취업(직무별)·투자 같은 내 관점으로 정리해 주고, 산업별로 모아 흐름까지 짚어 줍니다.

> 혼자 하는 사이드 프로젝트 (장인우 · Plan B). 프로토타입이 아니라 상용화 가능한 구조가 목표.
> 문서 갱신: 2026-06-23

---

## 지금 어디까지 왔나

- ✅ **기획 6종 + PoC**: PRD · 유저플로우 · 와이어프레임 · 기능명세 · 디자인 시안 · PoC(증권 PDF → 틀+렌즈 추출 검증)
- ✅ **Sprint 0 (인프라)**: 모노레포 · DB 스키마 · CDK 4스택(synth 통과) · CI. *코드 완료, 실제 AWS 배포는 출시 시점.*
- ✅ **Sprint 1 (인증·산업·업로드)**: 로그인 → 렌즈 온보딩 → 대시보드 → PDF 업로드. *로컬 풀스택 동작.*
- 🔵 **Sprint 2 (AI 코어)**: PDF 파싱 → 렌즈별 추출 → 출처 가드레일 → 검토 화면까지 동작. *프로토타입 피드백 반영해 개편 중* (산업별 대시보드 / AI 산업·타입 매칭 / 취업 직무 / 산업 표준세트 / 텍스트 입력 / 리포트 가독성).

> 개발은 **로컬 우선**. 로컬 Postgres + mock LLM 으로 끝까지 돌아가고, AWS·실제 LLM 은 출시 단계에 붙입니다.

## 확정 스택

| 영역 | 선택 | 로컬 개발 |
|---|---|---|
| 프론트 | Next.js (App Router) · Vercel | localhost:3000 |
| API | Hono (TypeScript) · ECS Fargate | localhost:8787 |
| 워커 | Node·TypeScript (PDF 파싱 `unpdf`) · SQS 소비 | DB 폴링 |
| DB | RDS PostgreSQL · Drizzle ORM | 로컬 Postgres |
| 스토리지 | S3 (프라이빗·사용자별 prefix) | 로컬 디스크 |
| 인증 | Cognito + 구글·카카오 | dev 로그인(쿠키 세션) |
| 비동기 | SQS + 추출 워커 | DB 폴링 큐 |
| LLM | 멀티프로바이더 — 기본 **Gemini** / BYO Claude 키 / MCP | **mock**(키 불필요) |
| IaC·관측 | CDK · CloudWatch | - |

자세한 설계: [`build/아키텍처_DB설계_v0.1.md`](build/아키텍처_DB설계_v0.1.md)

## 무엇을 다루나

- **입력 형식**: PDF · 텍스트(붙여넣기). *이미지(스크린샷)는 다음 단계.*
- **문서 타입**: 산업리포트 · 기업리포트 · 경제뉴스 — 업로드 시 **AI 가 자동 분류**.
- **산업**: 표준 22개 세트(반도체·AI·IT·소프트웨어·자동차·석유화학·금융 등). 업로드 문서의 산업을 **AI 가 자동 매칭**(사용자 확인·수정 가능).
- **렌즈(목적)**: 취업(직무 15종 중 선택) · 투자. 복수 선택 가능, 렌즈별로 분리 저장.
- **추출 틀**(문서타입 공통): ①한줄요약 ②핵심사실 ③동인·맥락 ④리스크·쟁점 ⑤관점레이어(투자/취업) ⑥핵심숫자(출처 `[p.N]`). 리포트당 1분석.
- **읽기 보조**: 핵심 하이라이트 강조 + 단어 풀이(본문 단어 클릭/검색 → AI 100자 설명, 맥락 반영, 약어 정식명 병기) + 형광펜 하이라이트(5색, 직접 칠하기·삭제, 영구 저장).
- **가드레일**: 리포트에 없는 숫자 생성 금지, 핵심숫자는 출처 페이지 룰매칭 검증(verified), 투자 면책.
- **요금**: 무료 = 하루 3회 분석. 초과 시 유료 플랜 또는 본인 API 키(BYO, Pro 기능). 실결제 연동은 출시 단계.

## 모노레포 구조

```
마켓데스크/
├─ web/        프론트 (Next.js, Vercel)
├─ api/        백엔드 API (Hono, Fargate)
├─ worker/     추출 워커 (Node/TS: 파싱 + LLM 추출 + 가드레일)
├─ mcp/        마켓데스크 MCP 서버 (Phase 2)
├─ infra/      IaC (AWS CDK) — DEPLOY.md 참고
├─ packages/db 공유 DB 스키마 (Drizzle, source of truth) + ERD
├─ design/     HTML 시안 / poc/ 추출 검증 / build/ 아키텍처·스프린트
└─ AGENTS.md   코딩 에이전트 규약
```

## 로컬 실행

사전: PostgreSQL 16 (로컬 실행 중), Node 20+, pnpm 9.

```
pnpm install
pnpm db:migrate        # 스키마 생성
pnpm db:seed           # 렌즈·산업 시드
pnpm dev               # api + web + worker 동시 실행
```
→ 브라우저 http://localhost:3000 (dev 로그인 → 온보딩 → 대시보드 → 업로드 → 검토)

> `.env` 는 각 패키지의 `.env.example` 참고해서 생성(`api/.env`, `web/.env.local`, `worker/.env`, `packages/db/.env`). 실제 LLM 을 쓰려면 `worker/.env` 의 `LLM_PROVIDER=gemini` + `GEMINI_API_KEY`.

## 노션 빌드 보드
https://app.notion.com/p/387445fbc7c081b597fcec5551fd6400
- Sprints(S0~S5) + Tasks(Type/Status) + 스프린트별 보드

## 로드맵

- **Sprint 2 마무리**: AI 코어 개편(산업별 대시보드 · AI 매칭 · 직무 · 텍스트 입력 · 가독성)
- **Sprint 3**: 시간뷰(일/월) · 월별 롤업(요약의 요약)
- **Sprint 4**: PDF 내보내기 · BYO Claude 키 · QA · AWS 배포
- **Sprint 5**: MCP 서버(사용자 Claude로 추출, Phase 2)
- **기본 공개 콘텐츠(전용 스프린트)**: 업로드 없이도 보이는 산업별 콘텐츠 — 공개·허용 소스만(KIET/KOTRA/KIEP/공공기관). 증권사 크롤링은 금지.
- **백로그**: 이미지 입력(비전/OCR) · 연별 롤업 · 실결제(Stripe) 연동

## 참고 (스킬)
빌드: `inwoo-build-spec` · `inwoo-build-db` · `inwoo-build-sprint` · `inwoo-build-infra` (오케스트레이터: `inwoo-build-workflow`)
코딩: `inwoo-vibe-coding` (오픈소스 우선) · QA: `product-workflow:qa`
