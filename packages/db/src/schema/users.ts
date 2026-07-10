import { pgTable, uuid, text, boolean, integer, bigint, date, jsonb, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { authProvider, userPlan } from "./enums";

// users: 인증은 Cognito, DB엔 프로필 미러.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  cognitoSub: text("cognito_sub").notNull().unique(),
  email: text("email"),
  provider: authProvider("provider"),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  plan: userPlan("plan").default("free").notNull(), // free=하루 3회, pro=상향/BYO
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// usage_daily: 사용량 미터링(무료 한도 게이팅). 추출 요청 1건 = count +1.
export const usageDaily = pgTable(
  "usage_daily",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day").notNull(), // KST 기준 날짜 문자열
    count: integer("count").default(0).notNull(),
    // 실제 토큰 사용량(워커가 LLM 응답 usageMetadata 로 누적). 무료 한도·요금 산정 근거.
    inputTokens: bigint("input_tokens", { mode: "number" }).default(0).notNull(),
    outputTokens: bigint("output_tokens", { mode: "number" }).default(0).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

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
    config: jsonb("config").$type<{ jobRole?: string }>(), // 취업 렌즈 직무 등 렌즈별 설정
  },
  (t) => [primaryKey({ columns: [t.userId, t.lensKey] })],
);
