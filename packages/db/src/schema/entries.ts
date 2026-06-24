import { pgTable, uuid, text, integer, boolean, date, jsonb, timestamp, unique, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { reports } from "./reports";
import { industries } from "./industries";
import { lenses } from "./users";
import { entryStatus, llmProvider } from "./enums";

// frame jsonb: 문서타입(산업/기업/뉴스) 공통 분석 구조 + 관점 레이어(투자/취업).
// 리포트당 1엔트리. perspectives 는 사용자가 켠 렌즈만 채움.
export type InvestmentPerspective = {
  valuation?: string;
  points?: string[];
  downside?: string[];
  opinion?: string;
};
export type CareerPerspective = {
  direction?: string;
  jobFit?: string;
  aiInsight?: string;
  interviewHooks?: string[];
  motivation?: string;
};
export type AnalysisSource = { item: string; source: string; date: string };
export type EntryFrame = {
  highlight?: string; // 가장 중요한 한 가지(강조용 핵심 takeaway)
  summary?: string;
  facts?: { what?: string; numbers?: string; sourceDate?: string };
  drivers?: string[];
  risks?: string[];
  perspectives?: {
    investment?: InvestmentPerspective;
    career?: CareerPerspective;
  };
  sources?: AnalysisSource[];
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
    lensKey: text("lens_key").references(() => lenses.key), // nullable: 새 모델은 리포트당 1엔트리(관점은 frame 내부)
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
