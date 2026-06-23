import { pgTable, uuid, text, integer, date, timestamp, unique, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { industries } from "./industries";
import { sourceType, parseStatus } from "./enums";

// reports: 업로드한 원본 메타.
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    industryId: uuid("industry_id").references(() => industries.id),
    title: text("title"),
    broker: text("broker"), // 증권사
    analyst: text("analyst"),
    pubDate: date("pub_date"),
    sourceType: sourceType("source_type"), // 'broker'(수동) | 'public'(Phase2)
    fileKey: text("file_key"), // S3 객체 키
    fileSize: integer("file_size"),
    pageCount: integer("page_count"),
    parseStatus: parseStatus("parse_status").default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("reports_user_industry_date_idx").on(t.userId, t.industryId, t.pubDate)],
);

// report_pages: 페이지 단위 텍스트([p.N] 인용·룰매칭 검증용).
export const reportPages = pgTable(
  "report_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    pageNo: integer("page_no").notNull(),
    text: text("text"),
  },
  (t) => [unique("report_pages_report_page_uq").on(t.reportId, t.pageNo)],
);
