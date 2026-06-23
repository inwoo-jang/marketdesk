import { pgTable, uuid, text, integer, boolean, date, timestamp, unique, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { industries } from "./industries";
import { sourceType, parseStatus, docType, inputFormat } from "./enums";

// reports: 업로드한 원본 메타.
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    industryId: uuid("industry_id").references(() => industries.id), // AI 매칭(확인 전 추정)
    industryConfirmed: boolean("industry_confirmed").default(false).notNull(),
    title: text("title"),
    broker: text("broker"), // 증권사(해당 시)
    analyst: text("analyst"),
    pubDate: date("pub_date"),
    sourceType: sourceType("source_type"), // 'broker'(수동) | 'public'(Phase2)
    docType: docType("doc_type"), // industry|company|news (AI 분류)
    inputFormat: inputFormat("input_format").default("pdf").notNull(), // pdf|text|image
    fileKey: text("file_key"), // S3 객체 키(text 입력도 .txt 로 저장)
    fileSize: integer("file_size"),
    pageCount: integer("page_count"),
    // 업로드 시 사용자가 고른 렌즈(추출 대상). Sprint2 워커가 이 렌즈들로 entries 생성.
    requestedLenses: text("requested_lenses").array(),
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
