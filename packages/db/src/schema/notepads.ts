import { pgTable, uuid, text, timestamp, unique } from "drizzle-orm/pg-core";
import { users } from "./users";

// notepads: 자유 형식 메모(서식 있는 HTML). 컨텍스트별 1개.
// scopeType='board' scopeKey='month'|'year' (흐름보드 월/년 맨 밑), scopeType='report' scopeKey=리포트id (기사 밑).
export const notepads = pgTable(
  "notepads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scopeType: text("scope_type").notNull(),
    scopeKey: text("scope_key").notNull(),
    content: text("content").notNull().default(""), // 서식 포함 HTML(위생 처리 후 저장)
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("notepads_scope_uq").on(t.userId, t.scopeType, t.scopeKey)],
);
