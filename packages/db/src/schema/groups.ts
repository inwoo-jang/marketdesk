import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

// company_groups: 대기업집단 계열사 매핑(공정위 기업집단포털 오픈API + 시드). 전역 참조 데이터.
// reports.company(AI 추출명)를 norm_name 으로 정규화 매칭 → group_name(계열)으로 묶기.
export const companyGroups = pgTable(
  "company_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    normName: text("norm_name").notNull().unique(), // 매칭 키(공백·(주)·주식회사 제거, 소문자)
    name: text("name").notNull(), // 표시용 원명
    groupName: text("group_name").notNull(), // 계열(기업집단명): SK, 삼성 ...
    source: text("source").default("kftc").notNull(), // kftc(공정위) | seed
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("company_groups_group_idx").on(t.groupName)],
);

// 회사명 정규화(매칭용): 공백 제거, (주)/주식회사/㈜ 제거, 소문자.
export function normCompany(name: string): string {
  return name
    .replace(/\(주\)|주식회사|㈜/g, "")
    .replace(/\s+/g, "")
    .toLowerCase()
    .trim();
}
