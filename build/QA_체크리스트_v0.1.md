# 마켓데스크 QA 체크리스트 (인수조건) v0.1

> 로컬(mock/claude) 기준 인수 검증. 갱신: 2026-06-24. 통합 스모크 E2E + 라우트 점검 결과.

## 인수 조건 (Acceptance Criteria)

| # | 기능 | 인수 조건 | 결과 |
|---|---|---|---|
| 1 | 인증 | dev 로그인 → 세션 유지, /api/auth/me 사용자 반환 | ✅ |
| 2 | 온보딩 | 취업 렌즈 선택 시 직무 저장, GET /me/lenses 에 jobRole 반영 | ✅ |
| 3 | 업로드 | PDF·텍스트 업로드 → report(pending) 생성, 산업 비우면 AI 매칭 | ✅ |
| 4 | 추출 | 워커가 처리 → parsed, frame 6키(summary/facts/drivers/risks/perspectives/sources) | ✅ |
| 5 | 문서타입/산업 | AI 가 산업(멀티)·타입(산업/기업/뉴스) 자동 분류 | ✅ (반도체/AI, industry) |
| 6 | 관점 레이어 | 켠 렌즈만 채움(투자/취업), 취업은 직무 반영 | ✅ (career+investment) |
| 7 | 가드레일 | 핵심숫자 출처 룰매칭, 환각은 verified=false | ✅ (2/3, 환각 거름) |
| 8 | 산업 대시보드 | 홈=내 산업(핀)+전체보기, /industry/[id] 피드(월 그룹) | ✅ |
| 9 | 월별 롤업 | 그 산업·그 달 엔트리 → one_liner + 공통/엇갈림 + 근거 | ✅ |
| 10 | 검토/수정 | 엔트리 읽기/편집 토글 저장, 산업 확인/수정 | ✅ |
| 11 | 삭제 | 리포트 삭제 시 엔트리·숫자·태그·파일 cascade | ✅ |
| 12 | 요금 한도 | 무료 하루 3회, 초과 시 402(Pro/BYO 안내) | ✅ |
| 13 | PDF 내보내기 | 검토→인쇄 뷰(①~⑥+관점+면책), 브라우저 PDF 저장 | ✅ (라우트 200) |
| 14 | LLM 라우터 | mock(키 불필요)/claude(CLI)/gemini 전환 | ✅ (mock·claude 검증) |

## 라우트 점검 (HTTP 200)
`/` · `/login` · `/upload` · `/settings` · `/docs/industry|company|news` · `/industry/[id]` · `/reports/[id]` · `/reports/[id]/print`

## 가드레일 정책 점검
- 리포트에 없는 숫자 생성 금지 + 출처 페이지 검증(verified) — 동작
- 입력은 사용자 업로드(BYO)만, 외부 크롤링 없음 — 준수
- 투자 면책("투자조언 아님, 참고용") — 추출·PDF 에 표기
- 롤업은 하위 엔트리만 근거(새 사실 생성 금지) — 프롬프트 강제

## 배포 단계로 이월(로컬 검증 불가)
- BYO Claude 키 설정(KMS 암호화) — 운영 KMS 필요
- AWS 배포(ECS/RDS/S3/Cognito) — 계정 필요, infra/DEPLOY.md
- 서버사이드 PDF(export_jobs/S3)·모니터링(CloudWatch)
- Cognito 실제 소셜 로그인(현재 dev 로그인 대체)

## 알려진 한계
- mock 프로바이더는 플레이스홀더(실내용은 claude/gemini 필요)
- 이미지(스크린샷) 입력 미지원(Phase 2)
- 연별 롤업 미지원(Phase 2)
