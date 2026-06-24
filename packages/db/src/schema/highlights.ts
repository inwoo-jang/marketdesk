import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { reports } from "./reports";

// highlights: 유저가 리포트 본문에서 형광펜으로 칠한 구간.
// 분석 본문(data-highlight-root) 의 textContent 기준 문자 offset 으로 위치 저장(콘텐츠 결정적이라 재현 가능).
// color 는 프리셋 5색 키(yellow|green|blue|pink|purple). text 는 검증·표시용 스냅샷.
export const highlights = pgTable(
  "highlights",
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
    color: text("color").notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("highlights_report_idx").on(t.reportId, t.userId)],
);

export type HighlightColor = "yellow" | "green" | "blue" | "pink" | "purple";
