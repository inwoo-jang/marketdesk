import { and, eq, gte, lt, sql } from "drizzle-orm";
import { rollups, entries, reportIndustries } from "@reportlens/db";
import { db } from "./db.js";

// 산업 흐름 중 '요약이 비었는데(placeholder/null) 실제로는 그 산업 태그 원문이 있는' 칸을 재큐잉.
// (커버리지 버그로 primary 아닌 태그 리포트가 빠져 비어버린 칸 복구). 내용 있는 칸·직접 편집분은 건드리지 않음.
function periodRange(periodType: string, periodKey: string): { start: string; end: string } {
  if (periodType === "year") {
    const y = Number(periodKey);
    return { start: `${y}-01-01`, end: `${y + 1}-01-01` };
  }
  const [y, m] = periodKey.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return { start: `${periodKey}-01`, end: `${ny}-${String(nm).padStart(2, "0")}-01` };
}

async function run() {
  const rus = await db.select().from(rollups).where(eq(rollups.scope, "industry"));
  let requeued = 0;
  let checked = 0;
  for (const r of rus) {
    if (!r.industryId) continue;
    const empty = !r.oneLiner || r.oneLiner.startsWith("이 기간");
    if (!empty) continue; // 내용 있으면 보존
    checked++;
    const { start, end } = periodRange(r.periodType, r.periodKey);
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(entries)
      .innerJoin(reportIndustries, and(eq(reportIndustries.reportId, entries.reportId), eq(reportIndustries.industryId, r.industryId)))
      .where(and(eq(entries.userId, r.userId), gte(entries.entryDate, start), lt(entries.entryDate, end)));
    if ((row?.n ?? 0) > 0) {
      await db.update(rollups).set({ status: "pending", updatedAt: new Date() }).where(eq(rollups.id, r.id));
      requeued++;
    }
  }
  console.log(`빈 산업 흐름 ${checked}개 중, 원문 있는 ${requeued}개 재큐잉(워커가 새로 요약).`);
  process.exit(0);
}

run();
