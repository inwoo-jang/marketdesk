import { pgTable, uuid, text, integer, timestamp, primaryKey, unique } from "drizzle-orm/pg-core";
import { users } from "./users";

// industries: 글로벌 카탈로그(user_id NULL) + 사용자 커스텀(user_id 값).
export const industries = pgTable(
  "industries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }), // NULL = 글로벌
    name: text("name").notNull(), // 반도체, 2차전지 ...
    slug: text("slug").notNull(),
    iconColor: text("icon_color"),
    sort: integer("sort"),
  },
  (t) => [unique("industries_user_slug_uq").on(t.userId, t.slug)],
);

// user_industries: 관심 산업 팔로우/정렬.
export const userIndustries = pgTable(
  "user_industries",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    industryId: uuid("industry_id")
      .notNull()
      .references(() => industries.id, { onDelete: "cascade" }),
    sort: integer("sort"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.industryId] })],
);
