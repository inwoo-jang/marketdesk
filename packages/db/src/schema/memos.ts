import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { reports } from "./reports";

// memos: 리포트 본문의 단어/문장에 붙인 메모. 본문엔 밑줄만, 내용은 우측 메모란에 표시.
// 위치는 highlights 와 동일하게 data-highlight-root textContent 기준 offset.
export const memos = pgTable(
  "memos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    anchorText: text("anchor_text").notNull(), // 앵커 텍스트 스냅샷(검증·표시)
    note: text("note").notNull(), // 메모 내용
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("memos_report_idx").on(t.reportId, t.userId)],
);
