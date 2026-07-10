import { eq, and, isNull, ne, isNotNull, inArray, desc } from "drizzle-orm";
import { reports, reportPages, entries, industries, reportIndustries, userLenses, rollups, rollupFacts, notifications } from "@reportlens/db";
import { db } from "./db.js";
import { readUpload } from "./storage.js";
import { parsePdf, buildDocument, stripControlChars, type ParsedPage } from "./parsing.js";
import { getProvider } from "./providers/index.js";
import type { Provider } from "./providers/types.js";
import { simhash, hamming, tokenCount } from "./simhash.js";

const SIMHASH_DUP_THRESHOLD = 4; // Hamming 거리 이하면 유사 중복(64bit 중). 오탐 줄이려 6→4.
const SIMHASH_MIN_TOKENS = 200; // 짧은 문서는 SimHash 오탐이 잦아 유사 판정에서 제외

type Report = typeof reports.$inferSelect;

// 제목에서 출처·시리즈 코드 군더더기 제거(예: "(EPS LIVE #218)", 끝의 "#12", "Vol.3").
function cleanTitle(t: string | null | undefined): string | null {
  if (!t) return t ?? null;
  return t
    .replace(/\s*[([][^)\]]*(#\d+|LIVE|Vol\.?\s*\d+|리서치센터|데일리|위클리|weekly|daily)[^)\]]*[)\]]\s*$/gi, "")
    .replace(/\s*[-–|]\s*#?\d+\s*$/g, "")
    .replace(/\s+#\d+\s*$/g, "")
    .trim();
}

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
      const text = stripControlChars(new TextDecoder().decode(bytes));
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
    const provider = getProvider(report.llmProvider); // 리포트에 박힌 엔진(개발자=로컬 CLI 가능)

    const sim = simhash(document);

    // 분류+분석 통합 호출(문서 1회 전송으로 2회 왕복 제거). 직무·렌즈는 호출 전에 준비.
    const catalog = await db
      .select({ id: industries.id, name: industries.name })
      .from(industries)
      .where(isNull(industries.userId));
    const [jobLens] = await db
      .select({ config: userLenses.config })
      .from(userLenses)
      .where(and(eq(userLenses.userId, report.userId), eq(userLenses.lensKey, "job")))
      .limit(1);
    const jobRole = jobLens?.config?.jobRole;
    const lensKeys = report.requestedLenses ?? [];
    // 대형 PDF(수십 페이지)는 원문 전체 전송 시 LLM 지연·타임아웃 → 상한(앞부분=핵심). 분류·분석 공통.
    const extractDoc = document.length > 24000 ? document.slice(0, 24000) : document;

    const { meta, frame } = await provider.analyzeExtract(
      extractDoc,
      catalog.map((c) => c.name),
      { lenses: lensKeys, jobRole },
    );
    const matchedRows = catalog.filter((c) => meta.industries.includes(c.name));
    const primaryId = report.industryConfirmed ? report.industryId : (matchedRows[0]?.id ?? report.industryId);

    // 유사 중복 감지: 본문 SimHash 비교. 단, (1) 짧은 문서 제외 (2) 산업 카테고리가 겹치는 리포트만 후보.
    // 산업이 정해진 뒤(메타 분석 후) 판정해야 카테고리 교집합을 확인할 수 있음.
    const newIndIds = new Set<string>(matchedRows.map((r) => r.id));
    if (report.industryId) newIndIds.add(report.industryId);
    let dupOf: string | null = null;
    if (tokenCount(document) >= SIMHASH_MIN_TOKENS && newIndIds.size > 0) {
      const others = await db
        .select({ id: reports.id, simhash: reports.simhash })
        .from(reports)
        .innerJoin(reportIndustries, eq(reportIndustries.reportId, reports.id))
        .where(
          and(
            eq(reports.userId, report.userId),
            eq(reports.parseStatus, "parsed"),
            ne(reports.id, report.id),
            isNull(reports.dupOf),
            isNotNull(reports.simhash),
            inArray(reportIndustries.industryId, [...newIndIds]),
          ),
        );
      const seen = new Set<string>();
      for (const o of others) {
        if (seen.has(o.id)) continue; // 산업 조인으로 같은 리포트가 여러 번 나올 수 있음
        seen.add(o.id);
        if (o.simhash && hamming(sim, o.simhash) <= SIMHASH_DUP_THRESHOLD) {
          dupOf = o.id;
          break;
        }
      }
    }

    await db
      .update(reports)
      .set({
        docType: meta.docType,
        summary: meta.summary,
        title: cleanTitle(meta.title) ?? report.title,
        company: meta.company,
        simhash: sim,
        dupOf,
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

    const entryDate = meta.pubDate ?? report.pubDate ?? new Date().toISOString().slice(0, 10);
    const industryId = primaryId;

    await db.delete(entries).where(eq(entries.reportId, report.id)); // 재추출 시 교체
    await db
      .insert(entries)
      .values({
        userId: report.userId,
        reportId: report.id,
        industryId,
        lensKey: null,
        entryDate,
        frame,
        status: "draft",
        provider: provider.providerKey,
        model: provider.model,
        updatedAt: new Date(),
      });

    // 흐름 자동 갱신: 이 자료가 속한 산업/기업/뉴스의 월·년 롤업을 pending 으로(워커가 이어서 처리).
    // 비치명적: 롤업 큐잉 실패가 리포트 분석 성공을 무효화하지 않도록 격리.
    try {
      await enqueueFlowRollups(report, entryDate, meta.docType, meta.company);
    } catch (e) {
      console.error(`흐름 큐잉 실패(분석은 성공) ${report.id}:`, e instanceof Error ? e.message : e);
    }

    // 논리 붕괴 트리거 발화 감지: 이 새 자료가 활성 트리거(내 산업 최신 롤업의 trigger)와 매칭되면 알림 생성.
    try {
      const repText = [meta.title, frame.summary, frame.facts?.what, ...(frame.drivers ?? []), ...(frame.risks ?? [])]
        .filter(Boolean)
        .join(" ");
      const indNameById = new Map(catalog.map((c) => [c.id, c.name]));
      await detectTriggerHits(provider, report, [...newIndIds], indNameById, repText, cleanTitle(meta.title) ?? report.title);
    } catch (e) {
      console.error(`트리거 발화 감지 실패(분석은 성공) ${report.id}:`, e instanceof Error ? e.message : e);
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

// 의미 토큰(길이 2+) — 트리거↔새자료 매칭용(P2/P3 와 동일 기준).
function sigTokenSet(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^0-9a-z가-힣]+/g, " ").trim().split(" ").filter((t) => t.length >= 2));
}

// 발화 감지: 새 자료(repText)가 내 산업의 '최신 월별 롤업' 트리거와 의미토큰 2개 이상 겹치면 알림 생성.
// 콘텐츠 유입이 전부 수동이라, 유저가 자료를 추가하는 이 순간이 곧 발화 감지 이벤트.
async function detectTriggerHits(
  provider: Provider,
  report: Report,
  indIds: string[],
  indNameById: Map<string, string>,
  repText: string,
  detailTitle: string | null,
): Promise<void> {
  if (indIds.length === 0) return;
  const rus = await db
    .select({ id: rollups.id, industryId: rollups.industryId, periodKey: rollups.periodKey })
    .from(rollups)
    .where(
      and(
        eq(rollups.userId, report.userId),
        eq(rollups.scope, "industry"),
        inArray(rollups.industryId, indIds),
        eq(rollups.periodType, "month"),
        eq(rollups.status, "done"),
      ),
    )
    .orderBy(desc(rollups.periodKey));
  const latestByInd = new Map<string, string>(); // 산업 → 최신 롤업 id
  for (const r of rus) if (r.industryId && !latestByInd.has(r.industryId)) latestByInd.set(r.industryId, r.id);
  const rollupToInd = new Map([...latestByInd.entries()].map(([ind, rid]) => [rid, ind]));
  const ruIds = [...latestByInd.values()];
  if (ruIds.length === 0) return;

  const triggers = await db
    .select({ rollupId: rollupFacts.rollupId, content: rollupFacts.content })
    .from(rollupFacts)
    .where(and(inArray(rollupFacts.rollupId, ruIds), eq(rollupFacts.factType, "trigger")));
  if (triggers.length === 0) return;

  // 1단계(싼 필터): 의미토큰 2개+ 겹치는 신호만 후보. 겹침 없으면 LLM 호출 스킵(토큰 절약).
  const repTok = sigTokenSet(repText);
  const candidates: { indId: string; content: string }[] = [];
  const seen = new Set<string>();
  for (const t of triggers) {
    if (!t.content) continue;
    const tt = sigTokenSet(t.content);
    let inter = 0;
    for (const x of tt) if (repTok.has(x)) inter++;
    if (inter < 2) continue;
    const indId = rollupToInd.get(t.rollupId);
    if (!indId) continue;
    const key = `${indId}:${t.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ indId, content: t.content });
  }
  if (candidates.length === 0) return;

  // 2단계(정밀): 후보만 LLM 이 실제 해당 여부 + 근거 판단(단어 우연 겹침 오탐 제거).
  const judged = await provider.judgeTriggers(repText, candidates.map((c) => c.content));
  const values = judged
    .map((j) => {
      const c = candidates[j.index];
      if (!c) return null;
      return {
        userId: report.userId,
        kind: "trigger",
        industryId: c.indId,
        reportId: report.id,
        title: `[${indNameById.get(c.indId) ?? "산업"}] 흐름 위험 신호 감지`,
        body: c.content,
        detail: detailTitle,
        matched: j.basis, // 근거(자료의 어느 부분이 이 신호와 관련되는지)
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  await db.delete(notifications).where(eq(notifications.reportId, report.id)); // 재추출 시 교체
  if (values.length > 0) await db.insert(notifications).values(values);
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
      const [existing] = await db.select({ id: rollups.id }).from(rollups).where(and(...match)).limit(1);
      if (existing) {
        // 기존 요약·팩트는 그대로 두고 상태만 pending 으로 재큐잉 → 재생성 완료 시점에 교체(그 전까진 옛 내용 유지)
        await db.update(rollups).set({ status: "pending", llmProvider: report.llmProvider }).where(eq(rollups.id, existing.id));
      } else {
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
