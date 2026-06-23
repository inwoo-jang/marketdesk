# worker — 추출 워커 (Python)

SQS 소비 → PDF 파싱(PyMuPDF/kordoc) → 렌즈별 LLM 추출 → 가드레일(출처 룰매칭) → DB 기록.
PoC: 루트 `poc/poc_extract.py`.

자체 venv 사용(pnpm 워크스페이스 제외). DB는 `@reportlens/db` 마이그레이션 스키마를 공유(읽기는 자체 클라이언트).

> Sprint 2에서 본격 구현.
