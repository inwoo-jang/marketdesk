import { pgTable, uuid, text, timestamp, customType } from "drizzle-orm/pg-core";
import { users } from "./users";
import { llmTier, exportScope, jobStatus } from "./enums";

// bytea 커스텀 타입(Drizzle 기본 미제공). KMS 암호화된 BYO 키 저장용.
const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

// user_llm_settings: BYO 키 · 티어. claude_key_enc 는 KMS 암호화, 절대 로깅 금지.
export const userLlmSettings = pgTable("user_llm_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  tier: llmTier("tier").default("default").notNull(), // default(Gemini) | byo(Claude 키) | mcp
  // 개발자 계정 분석 엔진 선호(claude=로컬 CLI 무제한 | gemini). null=기본(gemini). 일반 사용자는 무시.
  analysisProvider: text("analysis_provider"),
  claudeKeyEnc: bytea("claude_key_enc"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

// export_jobs: PDF 내보내기 작업.
export const exportJobs = pgTable("export_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  scope: exportScope("scope").notNull(), // 'entry' | 'rollup'
  refId: uuid("ref_id"),
  status: jobStatus("status").default("pending").notNull(),
  fileKey: text("file_key"), // S3
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
