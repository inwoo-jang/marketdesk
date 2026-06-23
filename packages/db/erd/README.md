# ERD

ERD 시각화 스냅샷. 원천(source of truth)은 Drizzle 스키마(`../src/schema`)이고, 이 폴더는 ERD 도구로 가져가기 위한 스냅샷이다. 두 포맷 제공:

| 파일 | 도구 | 비고 |
|---|---|---|
| `reportlens_erdcloud.sql` | [ERDCloud](https://www.erdcloud.com/) | DDL Import. 인라인 enum·인라인 FK |
| `reportlens.dbml` | [dbdiagram.io](https://dbdiagram.io) | DBML. Postgres enum/관계 네이티브, `@dbml/cli` 검증 통과 |

## ERDCloud로 가져오기 (reportlens_erdcloud.sql)

1. https://www.erdcloud.com/ 로그인 → 새 ERD 생성
2. 좌하단 **Import** 클릭
3. `reportlens_erdcloud.sql` 전체 복사 → 붙여넣기 → Import
4. 14개 테이블이 생성되고 FK 관계선이 자동 연결됨. 배치만 정리하면 끝.

> 이 SQL은 ERDCloud 파서 호환용으로 다듬은 스냅샷이다(`CREATE TYPE` enum 제거 → 컬럼 인라인 enum, FK 테이블 내부 인라인). 실제 DB 생성은 이 파일이 아니라 `../migrations/0000_init.sql`(Drizzle 생성)로 한다.

## dbdiagram.io로 가져오기 (reportlens.dbml)

1. https://dbdiagram.io → 새 다이어그램
2. 좌측 에디터에 `reportlens.dbml` 전체 붙여넣기 → 즉시 렌더
3. (선택) `npx -p @dbml/cli dbml2sql reportlens.dbml --postgres` 로 SQL 역생성·검증 가능

## 스키마가 바뀌면

1. `../src/schema/*.ts` 수정
2. `pnpm db:generate` 로 새 마이그레이션 생성(원천 갱신)
3. 이 폴더의 `reportlens_erdcloud.sql` 도 같은 변경을 반영(스냅샷 동기화) 후 ERDCloud에 재import

## 테이블 (14)

users · lenses · user_lenses · industries · user_industries · reports · report_pages · entries · entry_numbers · rollups · rollup_facts · rollup_sources · user_llm_settings · export_jobs
