import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  date,
  doublePrecision,
  bigint,
  unique,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// securities: 종목 마스터. 국내는 KRX 리스트로 자동, 해외/미매칭은 수동 보완.
// KIS 조회 키 - 국내: code(단축코드) + 시장통합 'J'. 해외: excd(거래소) + code(티커).
export const securities = pgTable(
  "securities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(), // 005930 | AAPL
    name: text("name").notNull(), // 삼성전자 | Apple Inc
    nameNorm: text("name_norm").notNull(), // 매칭용 정규화 이름(공백·특수문자 제거, 소문자)
    market: text("market").notNull(), // KOSPI | KOSDAQ | NAS | NYS | AMS ...
    isOverseas: boolean("is_overseas").default(false).notNull(),
    excd: text("excd"), // 해외 거래소 코드(KIS): NAS/NYS/AMS/HKS/TSE/SHS/SZS
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("securities_code_market_uk").on(t.code, t.market), index("securities_name_norm_idx").on(t.nameNorm)],
);

// price_bars: KIS 시세 캐시. period 'D'(일봉)·'M'(월봉). 재조회 최소화(서버 부담·유량 제한 대비).
export const priceBars = pgTable(
  "price_bars",
  {
    securityId: uuid("security_id")
      .notNull()
      .references(() => securities.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // 'D' | 'M'
    date: date("date").notNull(), // YYYY-MM-DD
    close: doublePrecision("close").notNull(),
    open: doublePrecision("open"),
    high: doublePrecision("high"),
    low: doublePrecision("low"),
    volume: bigint("volume", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.securityId, t.period, t.date] })],
);

// price_sync: (종목,기간)별 마지막 조회 시각. 신선도 판단용(장중 재조회 억제).
export const priceSync = pgTable(
  "price_sync",
  {
    securityId: uuid("security_id")
      .notNull()
      .references(() => securities.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.securityId, t.period] })],
);

// user_securities: '내 종목' 등록(관심). 매수가 없어도 여기 있으면 목록에 노출.
export const userSecurities = pgTable(
  "user_securities",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    securityId: uuid("security_id")
      .notNull()
      .references(() => securities.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.securityId] })],
);

// paper_positions: 모의 매수 기록(한 행 = 한 매수). 같은 종목 여러 번 매수 가능.
export const paperPositions = pgTable("paper_positions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  securityId: uuid("security_id").references(() => securities.id, { onDelete: "set null" }), // 미해결 시 null
  name: text("name").notNull(), // 표시명(미해결이어도 유지)
  buyDate: date("buy_date").notNull(),
  shares: doublePrecision("shares").notNull(),
  buyPrice: doublePrecision("buy_price"), // null 이면 매수일 종가로 자동 채움
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// paper_notes: 투자일지. 종목 단위로 날짜별 "왜 오른/내린 것 같은지" 누적.
// 관심만 등록한 종목(매수 없음)에도 메모 가능하도록 종목에 직접 연결(positionId 선택).
export const paperNotes = pgTable(
  "paper_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    securityId: uuid("security_id")
      .notNull()
      .references(() => securities.id, { onDelete: "cascade" }),
    positionId: uuid("position_id").references(() => paperPositions.id, { onDelete: "set null" }),
    noteDate: date("note_date").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("paper_notes_security_idx").on(t.securityId)],
);
