import { companyGroups, normCompany } from "@reportlens/db";
import { db } from "./db.js";

// 공정위 기업집단포털 오픈API → 대기업집단 소속회사(계열사) 전체 매핑 적재.
// 승인 후 ~1시간 뒤 키 활성. 실행: pnpm --filter @reportlens/worker ingest:groups
// 태그명은 실제 응답으로 확정(첫 페이지 파싱 실패 시 raw 덤프).
const ENDPOINT = "https://apis.data.go.kr/1130000/appnGroupAffiList/appnGroupAffiListApi";
const GROUP_TAGS = ["기업집단명", "afsGroupNm", "groupNm", "grpNm", "afhGroupNm"];
const CO_TAGS = ["소속회사명", "coNm", "companyNm", "corpNm", "affiNm", "afhCoNm"];

const pick = (block: string, tags: string[]): string => {
  for (const t of tags) {
    const m = block.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i"));
    if (m) return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
  }
  return "";
};

async function run() {
  const key = process.env.GROUP_API_KEY;
  if (!key) {
    console.error("GROUP_API_KEY 없음(worker/.env)");
    process.exit(1);
  }
  let page = 1;
  let upserts = 0;
  for (;;) {
    const url = `${ENDPOINT}?serviceKey=${encodeURIComponent(key)}&pageNo=${page}&numOfRows=1000&resultType=xml`;
    const res = await fetch(url);
    const xml = await res.text();
    if (res.status !== 200 || xml.includes("Unauthorized") || xml.includes("SERVICE_KEY")) {
      console.error(`API 오류(status ${res.status}). 키 활성화 전이거나 파라미터 문제. 응답: ${xml.slice(0, 200)}`);
      process.exit(1);
    }
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
    if (page === 1 && items.length === 0) {
      console.error("item 파싱 0건. 응답 태그 확인 필요. RAW(2000):\n" + xml.slice(0, 2000));
      process.exit(1);
    }
    for (const b of items) {
      const group = pick(b, GROUP_TAGS);
      const name = pick(b, CO_TAGS);
      if (!group || !name) continue;
      const normName = normCompany(name);
      if (!normName) continue;
      await db
        .insert(companyGroups)
        .values({ normName, name, groupName: group, source: "kftc" })
        .onConflictDoUpdate({ target: companyGroups.normName, set: { groupName: group, name, source: "kftc", updatedAt: new Date() } });
      upserts++;
    }
    console.log(`page ${page}: ${items.length}건`);
    if (items.length < 1000) break;
    page++;
  }
  console.log(`계열 매핑 적재 완료: ${upserts}건`);
  process.exit(0);
}

run();
