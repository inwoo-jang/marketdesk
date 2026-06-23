import { pgTable, uuid, text, integer, timestamp, unique, primaryKey } from "drizzle-orm/pg-core";
import { users } from "./users";
import { industries } from "./industries";
import { lenses } from "./users";
import { entries } from "./entries";
import { periodType, factType, jobStatus } from "./enums";

// rollups: 월별/연별 요약의 요약. 하위 엔트리만 근거(새 수치 생성 금지). 생성은 워커가 LLM 으로 비동기 처리.
export const rollups = pgTable(
  "rollups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    industryId: uuid("industry_id").references(() => industries.id),
    lensKey: text("lens_key").references(() => lenses.key), // nullable: 산업 전체 롤업(관점 무관)
    periodType: periodType("period_type").notNull(), // 'month'(MVP) | 'year'(Phase2)
    periodKey: text("period_key").notNull(), // '2026-06'
    oneLiner: text("one_liner"),
    status: jobStatus("status").default("pending").notNull(), // pending|done|failed (워커 생성)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [
    unique("rollups_scope_period_uq").on(t.userId, t.industryId, t.lensKey, t.periodType, t.periodKey),
  ],
);

// rollup_facts: 공통팩트 / 엇갈림.
export const rollupFacts = pgTable("rollup_facts", {
  id: uuid("id").primaryKey().defaultRandom(),
  rollupId: uuid("rollup_id")
    .notNull()
    .references(() => rollups.id, { onDelete: "cascade" }),
  factType: factType("fact_type").notNull(), // 'common' | 'conflict'
  content: text("content"),
  sort: integer("sort"),
});

// rollup_sources: 근거 엔트리 join (N:N).
export const rollupSources = pgTable(
  "rollup_sources",
  {
    rollupId: uuid("rollup_id")
      .notNull()
      .references(() => rollups.id, { onDelete: "cascade" }),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.rollupId, t.entryId] })],
);
