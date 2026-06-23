# 리포트렌즈 (ReportLens)

산업리포트는 매일 쌓이는데, 읽는 목적은 사람마다 다릅니다. 리포트렌즈는 내가 올린 리포트를 취업·투자 같은 내 관점으로 정리해 주고, 하루치를 모아 산업의 흐름까지 짚어 줍니다.

> 혼자 하는 사이드 프로젝트 (장인우 · Plan B). 프로토타입이 아니라 상용화 가능한 구조가 목표.

---

## 지금 어디까지 왔나

- ✅ **기획 6종 완료**: PRD · 유저플로우 · 와이어프레임 · 기능명세서(xlsx) · 디자인 시안 · PoC
- ✅ **PoC 검증**: 실제 증권사 PDF → 정해진 틀 + 렌즈별 추출 + 출처 인용 작동 확인
- ✅ **빌드 Phase 0~1**: 스택 확정 · DB 스키마 설계 · 스프린트/태스크 분해(노션)
- ⏭️ **다음 = Sprint 0 (인프라 스캐폴딩)** ← 여기서 시작

## 확정 스택

| 영역 | 선택 |
|---|---|
| 컴퓨팅 | ECS Fargate + ALB |
| DB | RDS PostgreSQL |
| 스토리지 | S3 (프라이빗·사용자별 prefix) |
| 인증 | Cognito + 구글·카카오 소셜 |
| 비동기 | SQS + 추출 워커 |
| LLM | 멀티프로바이더 — 기본 Gemini(Flash→Pro) / BYO Claude 키 / MCP 서버 |
| 프론트 | Vercel |
| IaC·관측 | CDK · CloudWatch |

자세한 설계: [`build/아키텍처_DB설계_v0.1.md`](build/아키텍처_DB설계_v0.1.md)

## 폴더 구조

```
리포트렌즈/
├─ README.md                  ← 지금 이 파일 (시작 가이드)
├─ AGENTS.md                  ← 코딩 에이전트 규약 (Claude Code/Cursor용)
├─ PRD_리포트렌즈_v0.1.md
├─ 유저플로우_리포트렌즈_v0.1.md
├─ 와이어프레임_리포트렌즈_v0.1.md
├─ 디자인방향_리포트렌즈.md
├─ 기능명세서.xlsx            (목록 19 / 상세 70, MVP 확정)
├─ design/                    HTML 시안 (dashboard / entry-review / monthly-rollup)
├─ poc/                       추출 검증 + 실행 스크립트(poc_extract.py)
└─ build/                     아키텍처·DB설계 / 스프린트·태스크
```

> 빌드 시작하면 여기에 모노레포(`web/ api/ worker/ mcp/ infra/`)가 추가됩니다.

## 노션 빌드 보드
https://app.notion.com/p/387445fbc7c081b597fcec5551fd6400
- Sprints(캘린더, S0~S5) + Tasks(46개, Type/Sub Type/Status) + 스프린트별 태스크 표

## 다음 할 일 (Sprint 0 · 인프라)
1. 모노레포 구조 세팅 (web/api/worker/mcp/infra)
2. AWS 환경(dev/prod) + CDK 골격
3. RDS 프로비저닝 + 마이그레이션 도구 + 초기 스키마
4. S3 / Cognito(구글·카카오) / CI / Vercel 연결

→ Claude Code에서 `"리포트렌즈 빌드 이어서, Sprint 0부터"` 라고 하면 됩니다.

## 참고 (스킬)
빌드: `inwoo-build-spec` · `inwoo-build-db` · `inwoo-build-sprint` · `inwoo-build-infra` (오케스트레이터: `inwoo-build-workflow`)
코딩: `inwoo-vibe-coding` (오픈소스 우선) · QA: `product-workflow:qa`
