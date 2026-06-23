# @reportlens/db — 공유 DB 스키마 (Drizzle)

마켓데스크의 DB **원천(source of truth)**. api/worker/mcp 가 import 해 재사용.

## 구조
```
src/schema/      테이블 정의(Drizzle, snake_case)
  enums.ts       닫힌 상태값 pgEnum
  users.ts       users · lenses · user_lenses
  industries.ts  industries · user_industries
  reports.ts     reports · report_pages
  entries.ts     entries · entry_numbers
  rollups.ts     rollups · rollup_facts · rollup_sources
  settings.ts    user_llm_settings · export_jobs
src/index.ts     createDb(connectionString) 팩토리 + 스키마 re-export
migrations/      drizzle-kit 생성 SQL (커밋 대상)
erd/             ERDCloud import 스냅샷
```

## 명령 (루트에서)
```
pnpm db:generate   # 스키마 변경 → 새 마이그레이션 SQL 생성
pnpm db:migrate    # 마이그레이션 적용
pnpm db:push       # 개발 중 빠른 동기화(마이그레이션 없이)
pnpm db:studio     # Drizzle Studio (브라우저 DB 뷰어)
```

## 로컬 셋업
1. `cp .env.example .env` 후 `DATABASE_URL` 확인 (로컬 Homebrew Postgres 기준)
2. `createdb reportlens_dev`
3. `pnpm db:migrate`

## 원칙 (AGENTS.md)
- DB는 마이그레이션 코드로만. 콘솔 수작업 금지.
- 모든 사용자 데이터에 `user_id` 스코핑(API 계층에서 강제, FK/제약으로 무결성 보강).
- 시크릿 평문 커밋 금지. 운영 `DATABASE_URL`/BYO 키는 Secrets Manager·KMS.
