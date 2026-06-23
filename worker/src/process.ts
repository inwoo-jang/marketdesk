import { eq } from "drizzle-orm";
import { reports, reportPages, entries, entryNumbers } from "@reportlens/db";
import { db } from "./db.js";
import { readUpload } from "./storage.js";
import { parsePdf, buildDocument } from "./parsing.js";
import { verifyNumbers } from "./guardrail.js";
import { getProvider } from "./providers/index.js";

type Report = typeof reports.$inferSelect;

// 리포트 1건 처리: 파싱 → 페이지 저장 → 렌즈별 추출 → 가드레일 → entries/entry_numbers 기록.
export async function processReport(report: Report): Promise<void> {
  await db.update(reports).set({ parseStatus: "parsing" }).where(eq(reports.id, report.id));
  try {
    if (!report.fileKey) throw new Error("file_key 없음");
    const bytes = await readUpload(report.fileKey);
    const { pageCount, pages } = await parsePdf(bytes);

    // report_pages 교체
    await db.delete(reportPages).where(eq(reportPages.reportId, report.id));
    if (pages.length > 0) {
      await db.insert(reportPages).values(pages.map((p) => ({ reportId: report.id, pageNo: p.pageNo, text: p.text })));
    }
    await db.update(reports).set({ pageCount }).where(eq(reports.id, report.id));

    const document = buildDocument(pages);
    const provider = getProvider();
    const lensKeys = report.requestedLenses ?? [];
    const entryDate = report.pubDate ?? new Date().toISOString().slice(0, 10);

    for (const lensKey of lensKeys) {
      const extracted = await provider.extract(document, lensKey);
      const numbers = verifyNumbers(extracted.numbers, pages);

      // entries upsert (report, lens) 유니크
      const [entry] = await db
        .insert(entries)
        .values({
          userId: report.userId,
          reportId: report.id,
          industryId: report.industryId,
          lensKey,
          entryDate,
          frame: extracted.frame,
          status: "draft",
          provider: provider.providerKey,
          model: provider.model,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [entries.reportId, entries.lensKey],
          set: {
            frame: extracted.frame,
            industryId: report.industryId,
            entryDate,
            status: "draft",
            provider: provider.providerKey,
            model: provider.model,
            updatedAt: new Date(),
          },
        })
        .returning();

      // entry_numbers 교체
      await db.delete(entryNumbers).where(eq(entryNumbers.entryId, entry.id));
      if (numbers.length > 0) {
        await db.insert(entryNumbers).values(
          numbers.map((n) => ({
            entryId: entry.id,
            label: n.label,
            value: n.value,
            pageNo: n.pageNo,
            verified: n.verified ?? false,
          })),
        );
      }
    }

    await db.update(reports).set({ parseStatus: "parsed" }).where(eq(reports.id, report.id));
    console.log(`처리 완료 ${report.id} (페이지 ${pageCount}, 렌즈 ${lensKeys.join(",")})`);
  } catch (e) {
    console.error(`처리 실패 ${report.id}:`, e);
    await db.update(reports).set({ parseStatus: "failed" }).where(eq(reports.id, report.id));
  }
}
