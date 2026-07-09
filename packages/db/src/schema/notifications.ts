import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { industries } from "./industries";
import { reports } from "./reports";

// notifications: 유저 알림. 현재는 논리 붕괴 트리거 발화(새로 추가한 콘텐츠가 활성 트리거와 매칭) 용도.
// 콘텐츠 분석을 기다리지 않아도 나중에 벨/대시보드에서 확인.
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").default("trigger").notNull(), // 'trigger'
    industryId: uuid("industry_id").references(() => industries.id, { onDelete: "cascade" }),
    reportId: uuid("report_id").references(() => reports.id, { onDelete: "cascade" }), // 발화시킨 새 콘텐츠
    title: text("title"), // 예: "[반도체] 흐름 위험 신호 감지"
    body: text("body"), // 신호(트리거) 문구
    detail: text("detail"), // 매칭된 리포트 제목 등
    matched: text("matched"), // 왜 감지됐는지 = 겹친 키워드(쉼표 구분)
    read: boolean("read").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.read, t.createdAt)],
);
