import { eq, and, isNull } from "drizzle-orm";
import { reports, reportPages, entries, entryNumbers, industries, reportIndustries, userLenses } from "@reportlens/db";
import { db } from "./db.js";
import { readUpload } from "./storage.js";
import { parsePdf, buildDocument, type ParsedPage } from "./parsing.js";
import { verifyNumbers } from "./guardrail.js";
import { getProvider } from "./providers/index.js";

type Report = typeof reports.$inferSelect;

// 리포트 1건 처리: 파싱 → 산업·타입 AI분류 → 렌즈/직무별 추출 → 가드레일 → 기록.
export async function processReport(report: Report): Promise<void> {
  await db.update(reports).set({ parseStatus: "parsing" }).where(eq(reports.id, report.id));
  try {
    if (!report.fileKey) throw new Error("file_key 없음");
    const bytes = await readUpload(report.fileKey);

    // 입력 형식별 파싱(text=단일 페이지, pdf=unpdf). image 는 Phase2.
    let pageCount: number;
    let pages: ParsedPage[];
    if (report.inputFormat === "text") {
      const text = new TextDecoder().decode(bytes);
      pages = [{ pageNo: 1, text }];
      pageCount = 1;
    } else {
      ({ pageCount, pages } = await parsePdf(bytes));
    }

    await db.delete(reportPages).where(eq(reportPages.reportId, report.id));
    if (pages.length > 0) {
      await db.insert(reportPages).values(pages.map((p) => ({ reportId: report.id, pageNo: p.pageNo, text: p.text })));
    }
    await db.update(reports).set({ pageCount }).where(eq(reports.id, report.id));

    const document = buildDocument(pages);
    const provider = getProvider();

    // AI 메타 추출(제목·발간일·요약·타입·멀티산업) + 카탈로그 매칭. 확인된 산업은 덮지 않음.
    const catalog = await db
      .select({ id: industries.id, name: industries.name })
      .from(industries)
      .where(isNull(industries.userId));
    const meta = await provider.analyze(document, catalog.map((c) => c.name));
    const matchedRows = catalog.filter((c) => meta.industries.includes(c.name));
    const primaryId = report.industryConfirmed ? report.industryId : (matchedRows[0]?.id ?? report.industryId);

    await db
      .update(reports)
      .set({
        docType: meta.docType,
        summary: meta.summary,
        title: meta.title ?? report.title,
        ...(meta.pubDate ? { pubDate: meta.pubDate } : {}),
        ...(report.industryConfirmed ? {} : { industryId: primaryId }),
      })
      .where(eq(reports.id, report.id));

    // 멀티 산업 태그(확인 전엔 AI 결과로 교체). 자동 팔로우는 하지 않음(사용자가 직접 핀).
    if (!report.industryConfirmed && matchedRows.length > 0) {
      await db.delete(reportIndustries).where(eq(reportIndustries.reportId, report.id));
      await db
        .insert(reportIndustries)
        .values(matchedRows.map((r) => ({ reportId: report.id, industryId: r.id })))
        .onConflictDoNothing();
    }

    // 취업 렌즈용 직무(user_lenses.config.jobRole)
    const [jobLens] = await db
      .select({ config: userLenses.config })
      .from(userLenses)
      .where(and(eq(userLenses.userId, report.userId), eq(userLenses.lensKey, "job")))
      .limit(1);
    const jobRole = jobLens?.config?.jobRole;

    const lensKeys = report.requestedLenses ?? [];
    const entryDate = meta.pubDate ?? report.pubDate ?? new Date().toISOString().slice(0, 10);
    const industryId = primaryId;

    for (const lensKey of lensKeys) {
      const extracted = await provider.extract(document, lensKey, {
        jobRole: lensKey === "job" ? jobRole : undefined,
        docType: meta.docType,
      });
      const numbers = verifyNumbers(extracted.numbers, pages);

      const [entry] = await db
        .insert(entries)
        .values({
          userId: report.userId,
          reportId: report.id,
          industryId,
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
            industryId,
            entryDate,
            status: "draft",
            provider: provider.providerKey,
            model: provider.model,
            updatedAt: new Date(),
          },
        })
        .returning();

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
    console.log(
      `처리 완료 ${report.id} (페이지 ${pageCount}, 산업 ${meta.industries.join("/") || "미매칭"}, 타입 ${meta.docType}, 렌즈 ${lensKeys.join(",")})`,
    );
  } catch (e) {
    console.error(`처리 실패 ${report.id}:`, e);
    await db.update(reports).set({ parseStatus: "failed" }).where(eq(reports.id, report.id));
  }
}
