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

// 대기업집단 한글 음차 ↔ 영문 이니셜(공정위 공식명은 음차, AI 추출명은 영문). 긴 것 먼저.
const TRANS: [string, string][] = [
  ["케이티앤지", "KT&G"],
  ["에이치디씨", "HDC"],
  ["에스티엑스", "STX"],
  ["케이씨씨", "KCC"],
  ["에이치엠엠", "HMM"],
  ["오씨아이", "OCI"],
  ["비지에프", "BGF"],
  ["에이피알", "APR"],
  ["에스엔티", "SNT"],
  ["이앤에이", "E&A"],
  ["포스코", "POSCO"],
  ["에스케이", "SK"],
  ["에이치디", "HD"],
  ["에이치엘", "HL"],
  ["엘에스", "LS"],
  ["지에스", "GS"],
  ["케이티", "KT"],
  ["씨제이", "CJ"],
  ["케이지", "KG"],
  ["티씨씨", "TCC"],
  ["디알비", "DRB"],
  ["아이에스", "IS"],
  ["엘지", "LG"],
  ["디엘", "DL"],
  ["디비", "DB"],
  ["디엔", "DN"],
  ["에스엠", "SM"],
];
const transliterate = (s: string): string => {
  let r = s;
  for (const [k, v] of TRANS) if (r.includes(k)) r = r.split(k).join(v);
  return r;
};

// 흔한 축약 별칭(AI 추출명 → 공식명). 정규화 결과가 키와 같으면 값으로 치환.
const ALIAS: Record<string, string> = {
  현대차: "현대자동차",
  현대건설기계: "hd현대건설기계",
  현대중공업: "hd현대중공업",
};

// 회사명 정규화(매칭용): (주)/유한회사 등 제거, 음차→영문, 공백 제거, 소문자, 별칭 치환.
export function normCompany(name: string): string {
  const s = transliterate(name.replace(/\(주\)|\(유\)|주식회사|유한회사|㈜/g, "").replace(/\s+/g, ""))
    .toLowerCase()
    .trim();
  return ALIAS[s] ?? s;
}

// 그룹(기업집단) 표시명: 음차→영문(에스케이→SK, 엘지→LG, 엘에스→LS ...).
export function displayGroupName(name: string): string {
  return transliterate(name.trim());
}
