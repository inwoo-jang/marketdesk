import { pgTable, uuid, text, integer, boolean, date, timestamp, unique, index, primaryKey } from "drizzle-orm/pg-core";
import { users } from "./users";
import { industries } from "./industries";
import { securities } from "./stocks";
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
    title: text("title"), // AI 추출 제목(없으면 파일명 폴백)
    summary: text("summary"), // AI 한줄요약(피드 미리보기)
    broker: text("broker"), // 증권사(해당 시)
    analyst: text("analyst"),
    pubDate: date("pub_date"), // AI 추출 발간일
    sourceType: sourceType("source_type"), // 'broker'(수동) | 'public'(Phase2)
    docType: docType("doc_type"), // industry|company|news (AI 분류)
    company: text("company"), // AI 추출 회사명(기업 문서). 흐름 보드 기업별 묶음용
    securityId: uuid("security_id").references(() => securities.id, { onDelete: "set null" }), // company 를 종목 마스터에 해석한 링크(흐름↔종목 조인용). null=미해석
    inputFormat: inputFormat("input_format").default("pdf").notNull(), // pdf|text|image
    fileKey: text("file_key"), // S3 객체 키(text 입력도 .txt 로 저장)
    fileSize: integer("file_size"),
    pageCount: integer("page_count"),
    // 업로드 시 사용자가 고른 렌즈(추출 대상). Sprint2 워커가 이 렌즈들로 entries 생성.
    requestedLenses: text("requested_lenses").array(),
    // 분석 엔진(claude|codex|gemini). 업로드 시 사용자 설정으로 결정해 고정. null=워커 env 기본.
    llmProvider: text("llm_provider"),
    // 유저 정리용(리포트는 단일 소유라 컬럼으로 충분). 숨김=피드 제외, 책갈피=즐겨찾기.
    hidden: boolean("hidden").default(false).notNull(),
    bookmarked: boolean("bookmarked").default(false).notNull(),
    contentHash: text("content_hash"), // 업로드 내용 SHA-256(정확 중복 감지)
    simhash: text("simhash"), // 본문 SimHash 64bit hex(유사 중복 감지)
    dupOf: uuid("dup_of"), // 유사 중복이면 원본 리포트 id(사용자가 병합·숨김 결정)
    parseStatus: parseStatus("parse_status").default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("reports_user_industry_date_idx").on(t.userId, t.industryId, t.pubDate),
    index("reports_user_hash_idx").on(t.userId, t.contentHash),
    // 목록/피드(문서타입 필터, 숨김 제외) + 처리 중 2.5초 폴링 반복 경로.
    index("reports_user_doctype_idx").on(t.userId, t.docType, t.hidden),
    // 역방향: 이 종목이 등장한 원문/흐름(종목 상세 → 흐름).
    index("reports_user_security_idx").on(t.userId, t.securityId),
  ],
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

// report_industries: 리포트 ↔ 산업 멀티(N:N). AI 가 여러 산업으로 태깅 가능.
export const reportIndustries = pgTable(
  "report_industries",
  {
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    industryId: uuid("industry_id")
      .notNull()
      .references(() => industries.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.reportId, t.industryId] })],
);
