import { eq, and, isNull } from "drizzle-orm";
import { reports, reportPages, entries, entryNumbers, industries, reportIndustries, userLenses, rollups } from "@reportlens/db";
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
    const provider = getProvider(report.llmProvider); // 리포트에 박힌 엔진(개발자=claude 가능)

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
        company: meta.company,
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

    // 리포트당 1개 분석(공통 틀 + 켠 렌즈 관점). 가드레일용 numbers 동반.
    // 대형 PDF(수십 페이지)는 원문 전체 전송 시 LLM 지연·타임아웃 → 상한(앞부분=핵심). 페이지 마커 유지.
    const extractDoc = document.length > 24000 ? document.slice(0, 24000) : document;
    const extracted = await provider.extract(extractDoc, { docType: meta.docType, lenses: lensKeys, jobRole });
    const numbers = verifyNumbers(extracted.numbers, pages);

    await db.delete(entries).where(eq(entries.reportId, report.id)); // 재추출 시 교체(엔트리 삭제 시 numbers cascade)
    const [entry] = await db
      .insert(entries)
      .values({
        userId: report.userId,
        reportId: report.id,
        industryId,
        lensKey: null,
        entryDate,
        frame: extracted.frame,
        status: "draft",
        provider: provider.providerKey,
        model: provider.model,
        updatedAt: new Date(),
      })
      .returning();

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

    // 흐름 자동 갱신: 이 자료가 속한 산업/기업/뉴스의 월·년 롤업을 pending 으로(워커가 이어서 처리).
    // 비치명적: 롤업 큐잉 실패가 리포트 분석 성공을 무효화하지 않도록 격리.
    try {
      await enqueueFlowRollups(report, entryDate, meta.docType, meta.company);
    } catch (e) {
      console.error(`흐름 큐잉 실패(분석은 성공) ${report.id}:`, e instanceof Error ? e.message : e);
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

// 업로드 분석 완료 시 그 자료가 속한 산업/기업/뉴스의 월·년 흐름(롤업)을 pending 으로 갱신.
async function enqueueFlowRollups(report: Report, entryDate: string, docType: string, company: string | null): Promise<void> {
  const periods = [
    { periodType: "month" as const, periodKey: entryDate.slice(0, 7) },
    { periodType: "year" as const, periodKey: entryDate.slice(0, 4) },
  ];
  const upsert = async (scope: "industry" | "company" | "news", opts: { industryId?: string; companyName?: string }) => {
    for (const p of periods) {
      const match = [
        eq(rollups.userId, report.userId),
        eq(rollups.scope, scope),
        eq(rollups.periodType, p.periodType),
        eq(rollups.periodKey, p.periodKey),
      ];
      if (scope === "industry" && opts.industryId) match.push(eq(rollups.industryId, opts.industryId));
      else if (scope === "company" && opts.companyName) match.push(eq(rollups.companyName, opts.companyName));
      await db.delete(rollups).where(and(...match));
      await db.insert(rollups).values({
        userId: report.userId,
        scope,
        industryId: opts.industryId ?? null,
        companyName: opts.companyName ?? null,
        periodType: p.periodType,
        periodKey: p.periodKey,
        llmProvider: report.llmProvider,
        status: "pending",
      });
    }
  };
  const indRows = await db
    .select({ industryId: reportIndustries.industryId })
    .from(reportIndustries)
    .where(eq(reportIndustries.reportId, report.id));
  for (const { industryId } of indRows) await upsert("industry", { industryId });
  if (docType === "news") await upsert("news", {});
  if (docType === "company" && company) await upsert("company", { companyName: company });
}
