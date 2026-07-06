import { pgTable, uuid, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { users } from "./users";

// user_company_favorites: 기업리포트에서 계열(group) 또는 개별 기업(company)을 즐겨찾기(별표).
// 산업 즐겨찾기(user_industries)와 대칭. value=계열명 또는 기업명(정규화 전 표시값).
export const userCompanyFavorites = pgTable(
  "user_company_favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // 'group' | 'company'
    value: text("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.value] })],
);
