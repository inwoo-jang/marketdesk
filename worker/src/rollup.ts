import { and, eq, gte, lt } from "drizzle-orm";
import { rollups, rollupFacts, rollupSources, entries, reports, industries, publicContents } from "@reportlens/db";
import { db } from "./db.js";
import { getProvider } from "./providers/index.js";

type Rollup = typeof rollups.$inferSelect;

// periodType+periodKey → [start, end) (date 문자열). month='YYYY-MM', year='YYYY'.
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

function stripPeriodLead(text: string, periodKey: string): string {
  const original = text.trim();
  if (!original) return original;

  let pattern: RegExp | null = null;
  if (/^\d{4}-\d{2}$/.test(periodKey)) {
    const [year, month] = periodKey.split("-");
    const m = String(Number(month));
    pattern = new RegExp(
      `^\\s*(?:${year}\\s*년\\s*0?${m}\\s*월|${year}[.-]0?${m})(?:\\s*(?:에는|에서는|은|는|의|엔|에))?\\s*[,·:：\\-]?\\s*`,
    );
  } else if (/^\d{4}$/.test(periodKey)) {
    pattern = new RegExp(`^\\s*${periodKey}\\s*년(?:\\s*(?:에는|에서는|은|는|의|엔|에))?\\s*[,·:：\\-]?\\s*`);
  }

  if (!pattern) return original;
  const stripped = original.replace(pattern, "").trim();
  return stripped || original;
}

// 롤업 1건 처리: scope(산업/기업/뉴스) × 기간(월/년) 엔트리 → 흐름 한 줄 + 공통/엇갈림(하위 엔트리만 근거).
export async function processRollup(r: Rollup): Promise<void> {
  try {
    const { start, end } = periodRange(r.periodType, r.periodKey);

    let scopeCond;
    let label: string;
    if (r.scope === "company") {
      if (!r.companyName) throw new Error("company_name 없음");
      scopeCond = eq(reports.company, r.companyName);
      label = r.companyName;
    } else if (r.scope === "news") {
      scopeCond = eq(reports.docType, "news");
      label = "경제뉴스";
    } else {
      if (!r.industryId) throw new Error("industry_id 없음");
      scopeCond = eq(entries.industryId, r.industryId);
      const [ind] = await db.select({ name: industries.name }).from(industries).where(eq(industries.id, r.industryId)).limit(1);
      label = ind?.name ?? "산업";
    }

    const rows = await db
      .select({ id: entries.id, frame: entries.frame, title: reports.title })
      .from(entries)
      .innerJoin(reports, eq(entries.reportId, reports.id))
      .where(and(eq(entries.userId, r.userId), scopeCond, gte(entries.entryDate, start), lt(entries.entryDate, end)));

    const industryName = label;

    // 산업 흐름엔 공공 콘텐츠(정책브리핑 등)의 중요한 정책도 함께 반영
    const pubRows =
      r.scope === "industry" && r.industryId
        ? await db
            .select({ title: publicContents.title, summary: publicContents.summary })
            .from(publicContents)
            .where(and(eq(publicContents.industryId, r.industryId), gte(publicContents.pubDate, start), lt(publicContents.pubDate, end)))
        : [];

    if (rows.length === 0 && pubRows.length === 0) {
      await db
        .update(rollups)
        .set({
          ...(r.oneLiner ? {} : { oneLiner: "이 기간 분석된 자료가 없습니다." }),
          status: "done",
          updatedAt: new Date(),
        })
        .where(eq(rollups.id, r.id));
      return;
    }

    const reportDigest = rows
      .map((e) => `- ${e.title ?? "제목 없음"}: ${e.frame?.summary ?? ""} ${e.frame?.facts?.what ?? ""}`.trim())
      .join("\n");
    const pubDigest = pubRows.map((p) => `- [공공/정책] ${p.title}: ${p.summary ?? ""}`.trim()).join("\n");
    const digest = [reportDigest, pubDigest].filter(Boolean).join("\n");

    const provider = getProvider(r.llmProvider); // 생성 시 고정된 엔진(개발자=로컬 CLI 가능)
    const result = await provider.rollup(industryName, r.periodKey, digest);
    const oneLiner = stripPeriodLead(result.oneLiner, r.periodKey);

    await db.delete(rollupFacts).where(eq(rollupFacts.rollupId, r.id));
    await db.delete(rollupSources).where(eq(rollupSources.rollupId, r.id));
    if (result.facts.length > 0) {
      await db
        .insert(rollupFacts)
        .values(result.facts.map((f, i) => ({ rollupId: r.id, factType: f.type, content: f.content, sort: i })));
    }
    if (rows.length > 0) {
      await db
        .insert(rollupSources)
        .values(rows.map((e) => ({ rollupId: r.id, entryId: e.id })))
        .onConflictDoNothing();
    }
    await db
      .update(rollups)
      .set({ oneLiner, status: "done", updatedAt: new Date() })
      .where(eq(rollups.id, r.id));
    console.log(`롤업 완료 ${r.id} (${industryName} ${r.periodKey}, 엔트리 ${rows.length})`);
  } catch (e) {
    console.error(`롤업 실패 ${r.id}:`, e);
    await db.update(rollups).set({ status: "failed", updatedAt: new Date() }).where(eq(rollups.id, r.id));
  }
}
