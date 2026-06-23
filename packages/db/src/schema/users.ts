import { pgTable, uuid, text, boolean, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { authProvider } from "./enums";

// users: 인증은 Cognito, DB엔 프로필 미러.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  cognitoSub: text("cognito_sub").notNull().unique(),
  email: text("email"),
  provider: authProvider("provider"),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// lenses: 프리셋 렌즈 카탈로그(향후 커스텀). key 가 자연키 PK.
export const lenses = pgTable("lenses", {
  key: text("key").primaryKey(), // 'job' | 'invest' | (Phase2: realestate, expert)
  label: text("label").notNull(),
  description: text("description"),
  isPreset: boolean("is_preset").default(true).notNull(),
  sort: integer("sort"),
});

// user_lenses: 사용자가 켠 렌즈(멀티).
export const userLenses = pgTable(
  "user_lenses",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lensKey: text("lens_key")
      .notNull()
      .references(() => lenses.key),
    enabled: boolean("enabled").default(true).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lensKey] })],
);
