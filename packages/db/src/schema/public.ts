import { pgTable, uuid, text, date, timestamp, index, primaryKey } from "drizzle-orm/pg-core";
import { users } from "./users";
import { industries } from "./industries";
import { docType } from "./enums";

// public_contents: 공개소스(정책브리핑 등 허용 기관)에서 수집한 핵심 콘텐츠. 전역 공유(유저 소유 아님).
// 저작권 안전: 원문 재호스팅 없이 제목 + 우리 AI 요약 + 출처 링크만 저장. pub_date = 추가일 개념.
export const publicContents = pgTable(
  "public_contents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(), // 'korea.kr' 등
    sourceUrl: text("source_url").notNull().unique(), // 원문 링크(중복 방지 키)
    title: text("title").notNull(),
    summary: text("summary"), // 우리 AI 한줄요약
    industryId: uuid("industry_id").references(() => industries.id), // AI 매칭 산업(핵심만 적재)
    docType: docType("doc_type"), // industry|company|news
    pubDate: date("pub_date"), // 발간일(= 추가일)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("public_contents_industry_idx").on(t.industryId, t.pubDate)],
);

// 유저별 숨김(공개 콘텐츠 대상). 숨긴 항목에서 다시 공개 가능.
export const userPublicHidden = pgTable(
  "user_public_hidden",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contentId: uuid("content_id")
      .notNull()
      .references(() => publicContents.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.contentId] })],
);

// 유저별 즐겨찾기(책갈피). 즐겨찾기 따로보기.
export const userPublicBookmark = pgTable(
  "user_public_bookmark",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contentId: uuid("content_id")
      .notNull()
      .references(() => publicContents.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.contentId] })],
);
