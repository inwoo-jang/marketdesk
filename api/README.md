# api — 백엔드 API (ECS Fargate)

CRUD API 서버. DB 접근은 `@reportlens/db`(Drizzle) 재사용.
멀티테넌트 user_id 스코핑은 이 계층에서 강제(Cognito JWT 기반).

> Sprint 1에서 스캐폴딩 예정.
