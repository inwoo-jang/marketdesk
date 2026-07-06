import { companyGroups, normCompany, displayGroupName } from "@reportlens/db";
import { db } from "./db.js";

// 공정위 기업집단포털 오픈API → 대기업집단 소속회사(계열사) 전체 매핑 적재.
// 실행: pnpm --filter @reportlens/worker ingest:groups
const ENDPOINT = "https://apis.data.go.kr/1130000/appnGroupAffiList/appnGroupAffiListApi";
const YEAR = process.env.GROUP_API_YEAR ?? "2026";

const pick = (block: string, tag: string): string => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() : "";
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
    const url = `${ENDPOINT}?serviceKey=${encodeURIComponent(key)}&pageNo=${page}&numOfRows=1000&resultType=xml&presentnYear=${YEAR}`;
    const res = await fetch(url);
    const xml = await res.text();
    const code = pick(xml, "resultCode");
    if (res.status !== 200 || (code && code !== "00")) {
      console.error(`API 오류(status ${res.status}, resultCode ${code}): ${pick(xml, "resultMsg") || xml.slice(0, 150)}`);
      process.exit(1);
    }
    const items = [...xml.matchAll(/<appnGroupAffi>([\s\S]*?)<\/appnGroupAffi>/gi)].map((m) => m[1]);
    for (const b of items) {
      const rawGroup = pick(b, "unityGrupNm"); // 기업집단명(음차)
      const name = pick(b, "entrprsNm"); // 소속회사명
      if (!rawGroup || !name) continue;
      const group = displayGroupName(rawGroup); // 에스케이→SK 등 표시명
      const normName = normCompany(name);
      if (!normName) continue;
      await db
        .insert(companyGroups)
        .values({ normName, name, groupName: group, source: "kftc" })
        .onConflictDoUpdate({ target: companyGroups.normName, set: { groupName: group, name, source: "kftc", updatedAt: new Date() } });
      upserts++;
    }
    console.log(`page ${page}: ${items.length}건 (누적 ${upserts})`);
    if (items.length < 1000) break;
    page++;
  }
  console.log(`계열 매핑 적재 완료(${YEAR}): ${upserts}건`);
  process.exit(0);
}

run();
