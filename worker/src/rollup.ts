import { and, eq, gte, lt } from "drizzle-orm";
import { rollups, rollupFacts, rollupSources, entries, reports, industries } from "@reportlens/db";
import { db } from "./db.js";
import { getProvider } from "./providers/index.js";

type Rollup = typeof rollups.$inferSelect;

function nextMonthStart(periodKey: string): string {
  const [y, m] = periodKey.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

// 월별 롤업 1건 처리: 그 산업·그 달 엔트리 → 흐름 한 줄 + 공통/엇갈림(하위 엔트리만 근거).
export async function processRollup(r: Rollup): Promise<void> {
  try {
    if (!r.industryId) throw new Error("industry_id 없음");
    const start = `${r.periodKey}-01`;
    const end = nextMonthStart(r.periodKey);

    const rows = await db
      .select({ id: entries.id, frame: entries.frame, title: reports.title })
      .from(entries)
      .innerJoin(reports, eq(entries.reportId, reports.id))
      .where(
        and(
          eq(entries.userId, r.userId),
          eq(entries.industryId, r.industryId),
          gte(entries.entryDate, start),
          lt(entries.entryDate, end),
        ),
      );

    const [ind] = await db
      .select({ name: industries.name })
      .from(industries)
      .where(eq(industries.id, r.industryId))
      .limit(1);
    const industryName = ind?.name ?? "산업";

    if (rows.length === 0) {
      await db
        .update(rollups)
        .set({ oneLiner: "이 달 분석된 리포트가 없습니다.", status: "done", updatedAt: new Date() })
        .where(eq(rollups.id, r.id));
      return;
    }

    const digest = rows
      .map((e) => `- ${e.title ?? "제목 없음"}: ${e.frame?.summary ?? ""} ${e.frame?.facts?.what ?? ""}`.trim())
      .join("\n");

    const provider = getProvider();
    const result = await provider.rollup(industryName, r.periodKey, digest);

    await db.delete(rollupFacts).where(eq(rollupFacts.rollupId, r.id));
    await db.delete(rollupSources).where(eq(rollupSources.rollupId, r.id));
    if (result.facts.length > 0) {
      await db
        .insert(rollupFacts)
        .values(result.facts.map((f, i) => ({ rollupId: r.id, factType: f.type, content: f.content, sort: i })));
    }
    await db
      .insert(rollupSources)
      .values(rows.map((e) => ({ rollupId: r.id, entryId: e.id })))
      .onConflictDoNothing();
    await db
      .update(rollups)
      .set({ oneLiner: result.oneLiner, status: "done", updatedAt: new Date() })
      .where(eq(rollups.id, r.id));
    console.log(`롤업 완료 ${r.id} (${industryName} ${r.periodKey}, 엔트리 ${rows.length})`);
  } catch (e) {
    console.error(`롤업 실패 ${r.id}:`, e);
    await db.update(rollups).set({ status: "failed", updatedAt: new Date() }).where(eq(rollups.id, r.id));
  }
}
