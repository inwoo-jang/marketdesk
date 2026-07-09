import { pgEnum } from "drizzle-orm/pg-core";

// 닫힌 상태값은 DB 레벨 enum 으로 무결성 보장. 확장 가능성 있는 것만 text 유지(lens_key 는 lenses FK).

export const authProvider = pgEnum("auth_provider", ["google", "kakao"]);
export const sourceType = pgEnum("source_type", ["broker", "public"]); // public = Phase2 자동수집
export const parseStatus = pgEnum("parse_status", ["pending", "parsing", "parsed", "failed"]);
export const entryStatus = pgEnum("entry_status", ["draft", "saved"]);
export const llmProvider = pgEnum("llm_provider", ["gemini", "claude", "codex", "mcp"]);
export const periodType = pgEnum("period_type", ["month", "year"]); // year = Phase2
export const factType = pgEnum("fact_type", ["common", "conflict", "trigger"]); // trigger = 논리 붕괴 트리거
export const llmTier = pgEnum("llm_tier", ["default", "byo", "mcp"]);
export const exportScope = pgEnum("export_scope", ["entry", "rollup"]);
export const jobStatus = pgEnum("job_status", ["pending", "done", "failed"]);
export const docType = pgEnum("doc_type", ["industry", "company", "news"]); // 문서 타입(AI 분류)
export const inputFormat = pgEnum("input_format", ["pdf", "text", "image"]); // image=Phase2
export const userPlan = pgEnum("user_plan", ["free", "pro"]); // 요금 플랜
