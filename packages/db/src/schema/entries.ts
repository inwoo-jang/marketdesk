import { pgTable, uuid, text, integer, boolean, date, jsonb, timestamp, unique, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { reports } from "./reports";
import { industries } from "./industries";
import { lenses } from "./users";
import { entryStatus, llmProvider } from "./enums";

// frame jsonb 형태(틀): 가드레일 기반 구조화 요약.
export type EntryFrame = {
  new_biz?: string;
  core_biz_structural?: string;
  core_biz_short?: string;
  overseas?: string;
  insight?: string;
};

// entries: 리포트 × 렌즈 = 1엔트리. 멀티렌즈 = (report, lens)별 분리.
export const entries = pgTable(
  "entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    industryId: uuid("industry_id").references(() => industries.id),
    lensKey: text("lens_key")
      .notNull()
      .references(() => lenses.key),
    entryDate: date("entry_date").notNull(),
    frame: jsonb("frame").$type<EntryFrame>(),
    status: entryStatus("status").default("draft").notNull(),
    // 생성 출처 기록(투명성·eval). 모델 ID는 자유 텍스트(예: gemini-pro / claude-sonnet).
    provider: llmProvider("provider"),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [
    unique("entries_report_lens_uq").on(t.reportId, t.lensKey),
    index("entries_user_industry_lens_date_idx").on(t.userId, t.industryId, t.lensKey, t.entryDate),
  ],
);

// entry_numbers: 핵심숫자 + 출처 페이지 + 룰매칭 검증(verified).
export const entryNumbers = pgTable("entry_numbers", {
  id: uuid("id").primaryKey().defaultRandom(),
  entryId: uuid("entry_id")
    .notNull()
    .references(() => entries.id, { onDelete: "cascade" }),
  label: text("label"), // 'WTI'
  value: text("value"), // '84.9$ -6%'
  pageNo: integer("page_no"), // 출처 [p.N]
  verified: boolean("verified"), // 해당 페이지 텍스트에 값 존재 확인
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
