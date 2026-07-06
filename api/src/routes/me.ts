import { Hono } from "hono";
import { z } from "zod";
import { eq, and, inArray, desc, sql, isNull, gte, lt, getTableColumns } from "drizzle-orm";
import {
  lenses,
  userLenses,
  industries,
  userIndustries,
  entries,
  entryNumbers,
  reports,
  reportIndustries,
  rollups,
  rollupFacts,
  usageDaily,
  highlights,
  userLlmSettings,
  publicContents,
  userPublicHidden,
  userPublicBookmark,
  JOB_ROLES,
  type EntryFrame,
} from "@reportlens/db";
import { db } from "../db.js";
import { storage } from "../storage.js";
import { env } from "../env.js";
import { defineTerm } from "../define.js";
import { requireUser, type AppEnv, type AppUser } from "../auth.js";

// 무료 한도: 하루 3회 분석. pro 는 무제한. (BYO Claude 키도 Pro 기능)
const FREE_DAILY_LIMIT = 3;
const seoulDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

async function bumpUsage(userId: string, day: string) {
  await db
    .insert(usageDaily)
    .values({ userId, day, count: 1 })
    .onConflictDoUpdate({ target: [usageDaily.userId, usageDaily.day], set: { count: sql`${usageDaily.count} + 1` } });
}

// 분석 1건 소비(게이팅). ok=false 면 한도 초과.
async function consumeAnalysis(user: AppUser): Promise<{ ok: boolean; used: number; limit: number | null }> {
  // 개발자 모드: 무제한(게이팅·집계 우회)
  if (env.devUnlimited) return { ok: true, used: 0, limit: null };
  const day = seoulDay();
  if (user.plan === "pro") {
    await bumpUsage(user.id, day);
    return { ok: true, used: 0, limit: null };
  }
  const [row] = await db
    .select({ count: usageDaily.count })
    .from(usageDaily)
    .where(and(eq(usageDaily.userId, user.id), eq(usageDaily.day, day)))
    .limit(1);
  const used = row?.count ?? 0;
  if (used >= FREE_DAILY_LIMIT) return { ok: false, used, limit: FREE_DAILY_LIMIT };
  await bumpUsage(user.id, day);
  return { ok: true, used: used + 1, limit: FREE_DAILY_LIMIT };
}

const QUOTA_MSG = "무료 한도(하루 3회 분석)를 다 썼어요. Pro 로 업그레이드하거나 본인 API 키를 등록하면 계속할 수 있어요.";

// /api/me/* : 로그인 사용자 스코핑(requireUser). 모든 쿼리에 user.id 강제.
export const meRoute = new Hono<AppEnv>();
meRoute.use("*", requireUser);

const defineSchema = z.object({ term: z.string().min(1).max(40), context: z.string().optional() });

// POST /api/me/define - 용어를 100자 이내로 설명(단어 클릭 풀이). 한도 게이팅 없음(마이크로 호출).
meRoute.post("/define", async (c) => {
  const parsed = defineSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid body" }, 400);
  const definition = await defineTerm(parsed.data.term, parsed.data.context);
  return c.json({ term: parsed.data.term, definition });
});

// ===== 형광펜 하이라이트(리포트 본문) =====
const highlightSchema = z.object({
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0),
  color: z.enum(["yellow", "green", "blue", "pink", "purple"]),
  text: z.string().min(1).max(2000),
});

async function ownReport(userId: string, reportId: string) {
  const [r] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.id, reportId), eq(reports.userId, userId)))
    .limit(1);
  return r;
}

// GET /api/me/reports/:id/highlights
meRoute.get("/reports/:id/highlights", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!(await ownReport(user.id, id))) return c.json({ error: "리포트 없음" }, 404);
  const rows = await db
    .select()
    .from(highlights)
    .where(and(eq(highlights.reportId, id), eq(highlights.userId, user.id)))
    .orderBy(highlights.startOffset);
  return c.json({ highlights: rows });
});

// POST /api/me/reports/:id/highlights
meRoute.post("/reports/:id/highlights", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const parsed = highlightSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid body" }, 400);
  if (parsed.data.endOffset <= parsed.data.startOffset) return c.json({ error: "invalid range" }, 400);
  if (!(await ownReport(user.id, id))) return c.json({ error: "리포트 없음" }, 404);
  const [row] = await db
    .insert(highlights)
    .values({ userId: user.id, reportId: id, ...parsed.data })
    .returning();
  return c.json({ highlight: row });
});

// DELETE /api/me/highlights/:hid
meRoute.delete("/highlights/:hid", async (c) => {
  const user = c.get("user");
  await db.delete(highlights).where(and(eq(highlights.id, c.req.param("hid")), eq(highlights.userId, user.id)));
  return c.json({ ok: true });
});

// ===== 분석 엔진(LLM) 설정 — 개발자 계정만 로컬 Claude CLI 선택 가능 =====
const isDeveloper = (user: AppUser) => !!user.email && env.devEmails.includes(user.email.toLowerCase());

// 이 사용자의 리포트에 적용할 분석 엔진 결정. 개발자가 claude 선택 시에만 claude, 그 외 gemini(기본).
async function resolveProvider(user: AppUser): Promise<"claude" | "gemini"> {
  if (!isDeveloper(user)) return "gemini";
  const [s] = await db
    .select({ p: userLlmSettings.analysisProvider })
    .from(userLlmSettings)
    .where(eq(userLlmSettings.userId, user.id))
    .limit(1);
  return s?.p === "claude" ? "claude" : "gemini";
}

// GET /api/me/llm - 분석 엔진 설정(개발자 여부 + 현재 선택)
meRoute.get("/llm", async (c) => {
  const user = c.get("user");
  const provider = await resolveProvider(user);
  return c.json({ isDeveloper: isDeveloper(user), provider });
});

// PUT /api/me/llm - 분석 엔진 변경(개발자만). { provider: 'claude'|'gemini' }
meRoute.put("/llm", async (c) => {
  const user = c.get("user");
  if (!isDeveloper(user)) return c.json({ error: "개발자 계정만 변경할 수 있어요." }, 403);
  const parsed = z.object({ provider: z.enum(["claude", "gemini"]) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid body" }, 400);
  await db
    .insert(userLlmSettings)
    .values({ userId: user.id, analysisProvider: parsed.data.provider })
    .onConflictDoUpdate({
      target: userLlmSettings.userId,
      set: { analysisProvider: parsed.data.provider, updatedAt: new Date() },
    });
  return c.json({ isDeveloper: true, provider: parsed.data.provider });
});

// ===== 공개소스 콘텐츠(전역 공유) + 유저별 숨김/즐겨찾기 =====
async function myPublicSets(userId: string) {
  const [hidden, marks] = await Promise.all([
    db.select({ id: userPublicHidden.contentId }).from(userPublicHidden).where(eq(userPublicHidden.userId, userId)),
    db.select({ id: userPublicBookmark.contentId }).from(userPublicBookmark).where(eq(userPublicBookmark.userId, userId)),
  ]);
  return { hidden: new Set(hidden.map((r) => r.id)), bookmarked: new Set(marks.map((r) => r.id)) };
}

const shapePublic = (r: typeof publicContents.$inferSelect & { industryName: string | null }, bookmarked: boolean) => ({
  id: r.id,
  source: r.source,
  sourceUrl: r.sourceUrl,
  title: r.title,
  summary: r.summary,
  industryId: r.industryId,
  industryName: r.industryName,
  docType: r.docType,
  pubDate: r.pubDate,
  isBookmarked: bookmarked,
});

async function fetchPublic(where: ReturnType<typeof and> | ReturnType<typeof eq> | undefined) {
  return db
    .select({
      id: publicContents.id,
      source: publicContents.source,
      sourceUrl: publicContents.sourceUrl,
      title: publicContents.title,
      summary: publicContents.summary,
      industryId: publicContents.industryId,
      industryName: industries.name,
      docType: publicContents.docType,
      pubDate: publicContents.pubDate,
      createdAt: publicContents.createdAt,
    })
    .from(publicContents)
    .leftJoin(industries, eq(industries.id, publicContents.industryId))
    .where(where)
    .orderBy(desc(publicContents.pubDate), desc(publicContents.createdAt))
    .limit(200);
}

// GET /api/me/public/contents?industryId=&docType= - 공개 콘텐츠(내 숨김 제외) + 즐겨찾기 플래그
meRoute.get("/public/contents", async (c) => {
  const user = c.get("user");
  const industryId = c.req.query("industryId");
  const docTypeQ = c.req.query("docType");
  const conds = [];
  if (industryId) conds.push(eq(publicContents.industryId, industryId));
  if (docTypeQ === "industry" || docTypeQ === "company" || docTypeQ === "news")
    conds.push(eq(publicContents.docType, docTypeQ));
  const { hidden, bookmarked } = await myPublicSets(user.id);
  const rows = await fetchPublic(conds.length ? and(...conds) : undefined);
  const contents = rows.filter((r) => !hidden.has(r.id)).map((r) => shapePublic(r, bookmarked.has(r.id)));
  return c.json({ contents });
});

// GET /api/me/public/hidden - 내가 숨긴 공개 콘텐츠(다시 공개용)
meRoute.get("/public/hidden", async (c) => {
  const user = c.get("user");
  const { hidden, bookmarked } = await myPublicSets(user.id);
  if (hidden.size === 0) return c.json({ contents: [] });
  const rows = await fetchPublic(inArray(publicContents.id, [...hidden]));
  return c.json({ contents: rows.map((r) => shapePublic(r, bookmarked.has(r.id))) });
});

// GET /api/me/public/bookmarks - 즐겨찾기 따로보기
meRoute.get("/public/bookmarks", async (c) => {
  const user = c.get("user");
  const { bookmarked } = await myPublicSets(user.id);
  if (bookmarked.size === 0) return c.json({ contents: [] });
  const rows = await fetchPublic(inArray(publicContents.id, [...bookmarked]));
  return c.json({ contents: rows.map((r) => shapePublic(r, true)) });
});

// 숨김 추가/해제
meRoute.post("/public/:id/hide", async (c) => {
  const user = c.get("user");
  await db
    .insert(userPublicHidden)
    .values({ userId: user.id, contentId: c.req.param("id") })
    .onConflictDoNothing();
  return c.json({ ok: true });
});
meRoute.delete("/public/:id/hide", async (c) => {
  const user = c.get("user");
  await db
    .delete(userPublicHidden)
    .where(and(eq(userPublicHidden.userId, user.id), eq(userPublicHidden.contentId, c.req.param("id"))));
  return c.json({ ok: true });
});

// 즐겨찾기 추가/해제
meRoute.post("/public/:id/bookmark", async (c) => {
  const user = c.get("user");
  await db
    .insert(userPublicBookmark)
    .values({ userId: user.id, contentId: c.req.param("id") })
    .onConflictDoNothing();
  return c.json({ ok: true });
});
meRoute.delete("/public/:id/bookmark", async (c) => {
  const user = c.get("user");
  await db
    .delete(userPublicBookmark)
    .where(and(eq(userPublicBookmark.userId, user.id), eq(userPublicBookmark.contentId, c.req.param("id"))));
  return c.json({ ok: true });
});

// ===== 흐름 보드: 월/년 × 산업/기업/뉴스 타임라인 =====
type Dim = "industry" | "company" | "news";
const isDim = (v: unknown): v is Dim => v === "industry" || v === "company" || v === "news";

// 최근 n개 기간키(최신→과거, 보드 왼쪽이 최신). month='YYYY-MM', year='YYYY'.
function periodKeys(period: "month" | "year", n: number): string[] {
  const now = new Date();
  const keys: string[] = [];
  if (period === "year") {
    const y = now.getFullYear();
    for (let i = 0; i < n; i++) keys.push(String(y - i));
  } else {
    for (let i = 0; i < n; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
  }
  return keys;
}

// periodType+periodKey → [start,end)
function periodRange(period: "month" | "year", periodKey: string): { start: string; end: string } {
  if (period === "year") {
    const y = Number(periodKey);
    return { start: `${y}-01-01`, end: `${y + 1}-01-01` };
  }
  const [y, m] = periodKey.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return { start: `${periodKey}-01`, end: `${ny}-${String(nm).padStart(2, "0")}-01` };
}

function boardMatch(userId: string, dim: Dim, key: string, periodType: "month" | "year") {
  const conds = [eq(rollups.userId, userId), eq(rollups.scope, dim), eq(rollups.periodType, periodType)];
  if (dim === "industry") conds.push(eq(rollups.industryId, key));
  else if (dim === "company") conds.push(eq(rollups.companyName, key));
  return and(...conds);
}

// dim 의 대상 키 목록(rows/generate-all 공용). industry=★관심 산업, company=내 회사들, news=단일.
async function boardKeys(userId: string, dim: Dim): Promise<{ key: string; label: string }[]> {
  if (dim === "news") return [{ key: "all", label: "경제뉴스" }];
  if (dim === "company") {
    const rows = await db
      .selectDistinct({ company: reports.company })
      .from(reports)
      .where(and(eq(reports.userId, userId), sql`${reports.company} is not null`));
    return rows.map((r) => r.company).filter((c): c is string => !!c).map((c) => ({ key: c, label: c }));
  }
  const inds = await db
    .select({ id: industries.id, name: industries.name })
    .from(userIndustries)
    .innerJoin(industries, eq(industries.id, userIndustries.industryId))
    .where(eq(userIndustries.userId, userId))
    .orderBy(industries.sort, industries.name);
  return inds.map((i) => ({ key: i.id, label: i.name }));
}

// 한 (dim,key)의 기간 시리즈 칸들
async function buildCells(userId: string, dim: Dim, key: string, period: "month" | "year") {
  const rows = await db.select().from(rollups).where(boardMatch(userId, dim, key, period));
  const ids = rows.map((r) => r.id);
  const facts = ids.length ? await db.select().from(rollupFacts).where(inArray(rollupFacts.rollupId, ids)) : [];
  const factsBy = new Map<string, typeof facts>();
  for (const f of facts) factsBy.set(f.rollupId, [...(factsBy.get(f.rollupId) ?? []), f]);
  const byKey = new Map(rows.map((r) => [r.periodKey, r]));
  const n = period === "year" ? 5 : 12;
  return periodKeys(period, n).map((pk) => {
    const r = byKey.get(pk);
    return {
      periodKey: pk,
      rollup: r ? { id: r.id, oneLiner: r.oneLiner, status: r.status, facts: factsBy.get(r.id) ?? [] } : null,
    };
  });
}

// GET /api/me/board?dim=&key=&period= - 단일 (dim,key)
meRoute.get("/board", async (c) => {
  const user = c.get("user");
  const dim: Dim = isDim(c.req.query("dim")) ? (c.req.query("dim") as Dim) : "industry";
  const period = c.req.query("period") === "year" ? "year" : "month";
  const key = c.req.query("key") ?? "all";
  if (dim !== "news" && key === "all") return c.json({ error: "key 필요" }, 400);
  let label = "경제뉴스";
  if (dim === "industry") {
    const [ind] = await db.select({ name: industries.name }).from(industries).where(eq(industries.id, key)).limit(1);
    label = ind?.name ?? "산업";
  } else if (dim === "company") label = key;
  return c.json({ dim, key, period, label, cells: await buildCells(user.id, dim, key, period) });
});

// GET /api/me/board/rows?dim=&period= - 산업 선택 없이 모든 대상(관심 산업/기업/뉴스)의 타임라인 행
meRoute.get("/board/rows", async (c) => {
  const user = c.get("user");
  const dim: Dim = isDim(c.req.query("dim")) ? (c.req.query("dim") as Dim) : "industry";
  const period = c.req.query("period") === "year" ? "year" : "month";
  const keys = await boardKeys(user.id, dim);
  const rows = [];
  for (const k of keys) rows.push({ dim, key: k.key, label: k.label, cells: await buildCells(user.id, dim, k.key, period) });
  return c.json({ dim, period, rows });
});

// GET /api/me/board/feed?dim=&key=&period=&periodKey= - 한 칸의 흐름 요약 + 근거 원문 리포트
meRoute.get("/board/feed", async (c) => {
  const user = c.get("user");
  const dim: Dim = isDim(c.req.query("dim")) ? (c.req.query("dim") as Dim) : "industry";
  const period = c.req.query("period") === "year" ? "year" : "month";
  const key = c.req.query("key") ?? "all";
  const periodKey = c.req.query("periodKey") ?? "";
  if (!periodKey) return c.json({ error: "periodKey 필요" }, 400);
  const { start, end } = periodRange(period, periodKey);

  let label = "경제흐름";
  let scopeCond;
  if (dim === "company") {
    scopeCond = eq(reports.company, key);
    label = key;
  } else if (dim === "news") {
    scopeCond = eq(reports.docType, "news");
  } else {
    scopeCond = eq(entries.industryId, key);
    const [ind] = await db.select({ name: industries.name }).from(industries).where(eq(industries.id, key)).limit(1);
    label = ind?.name ?? "산업";
  }

  // 근거 리포트(엔트리 기준 그 기간·scope)
  const rows = await db
    .selectDistinct({ id: reports.id })
    .from(entries)
    .innerJoin(reports, eq(entries.reportId, reports.id))
    .where(and(eq(entries.userId, user.id), scopeCond, gte(entries.entryDate, start), lt(entries.entryDate, end)));
  const ids = rows.map((r) => r.id);
  const reps = ids.length ? await attachIndustries(await db.select().from(reports).where(inArray(reports.id, ids))) : [];
  reps.sort((a, b) => new Date(b.pubDate ?? b.createdAt).getTime() - new Date(a.pubDate ?? a.createdAt).getTime());

  const [ru] = await db
    .select()
    .from(rollups)
    .where(and(boardMatch(user.id, dim, key, period), eq(rollups.periodKey, periodKey)))
    .limit(1);
  const facts = ru ? await db.select().from(rollupFacts).where(eq(rollupFacts.rollupId, ru.id)) : [];

  return c.json({
    dim,
    key,
    period,
    periodKey,
    label,
    rollup: ru ? { oneLiner: ru.oneLiner, status: ru.status, facts } : null,
    reports: reps,
  });
});

// POST /api/me/board/generate-all - 대상×기간의 빈 칸을 한 번에 pending 으로(워커가 이어 처리). { dim, period }
meRoute.post("/board/generate-all", async (c) => {
  const user = c.get("user");
  const b = await c.req.json().catch(() => ({}));
  const dim: Dim = isDim(b.dim) ? b.dim : "industry";
  const period = b.period === "year" ? "year" : "month";
  const quota = await consumeAnalysis(user);
  if (!quota.ok) return c.json({ error: QUOTA_MSG, quota }, 402);

  const keys = await boardKeys(user.id, dim);
  const provider = await resolveProvider(user);
  const n = period === "year" ? 5 : 12;
  const pks = periodKeys(period, n);
  let queued = 0;
  for (const k of keys) {
    const existing = await db.select().from(rollups).where(boardMatch(user.id, dim, k.key, period));
    const doneKeys = new Set(existing.filter((r) => r.status === "done").map((r) => r.periodKey));
    for (const pk of pks) {
      if (doneKeys.has(pk)) continue; // 이미 생성된 칸은 건너뜀(빈 칸만)
      await db.delete(rollups).where(and(boardMatch(user.id, dim, k.key, period), eq(rollups.periodKey, pk)));
      await db.insert(rollups).values({
        userId: user.id,
        scope: dim,
        industryId: dim === "industry" ? k.key : null,
        companyName: dim === "company" ? k.key : null,
        periodType: period,
        periodKey: pk,
        llmProvider: provider,
        status: "pending",
      });
      queued++;
    }
  }
  return c.json({ queued });
});

// POST /api/me/board/generate - 한 칸 생성(워커가 LLM 처리). { dim, key, period, periodKey }
meRoute.post("/board/generate", async (c) => {
  const user = c.get("user");
  const b = await c.req.json().catch(() => ({}));
  const dim: Dim = isDim(b.dim) ? b.dim : "industry";
  const period = b.period === "year" ? "year" : "month";
  const key = typeof b.key === "string" ? b.key : "all";
  const periodKey = typeof b.periodKey === "string" ? b.periodKey : "";
  if (!periodKey) return c.json({ error: "periodKey 필요" }, 400);
  if (dim !== "news" && (!key || key === "all")) return c.json({ error: "key 필요" }, 400);

  const quota = await consumeAnalysis(user);
  if (!quota.ok) return c.json({ error: QUOTA_MSG, quota }, 402);

  await db.delete(rollups).where(and(boardMatch(user.id, dim, key, period), eq(rollups.periodKey, periodKey)));
  const [rollup] = await db
    .insert(rollups)
    .values({
      userId: user.id,
      scope: dim,
      industryId: dim === "industry" ? key : null,
      companyName: dim === "company" ? key : null,
      periodType: period,
      periodKey,
      llmProvider: await resolveProvider(user),
      status: "pending",
    })
    .returning();
  return c.json({ rollup });
});

// GET /api/me/board/scopes - 보드 선택지(★ 관심 산업 + 내 기업 목록)
meRoute.get("/board/scopes", async (c) => {
  const user = c.get("user");
  const inds = await db
    .select({ id: industries.id, name: industries.name })
    .from(userIndustries)
    .innerJoin(industries, eq(industries.id, userIndustries.industryId))
    .where(eq(userIndustries.userId, user.id))
    .orderBy(industries.sort, industries.name);
  const companyRows = await db
    .selectDistinct({ company: reports.company })
    .from(reports)
    .where(and(eq(reports.userId, user.id), sql`${reports.company} is not null`));
  const companies = companyRows.map((r) => r.company).filter((x): x is string => !!x);
  return c.json({ industries: inds, companies });
});

// GET /api/me/lenses - 내가 켠 렌즈 + 취업 직무(config.jobRole)
meRoute.get("/lenses", async (c) => {
  const user = c.get("user");
  const rows = await db
    .select({ lensKey: userLenses.lensKey, enabled: userLenses.enabled, config: userLenses.config })
    .from(userLenses)
    .where(eq(userLenses.userId, user.id));
  const enabled = rows.filter((r) => r.enabled).map((r) => r.lensKey);
  const jobRole = rows.find((r) => r.lensKey === "job")?.config?.jobRole;
  return c.json({ enabled, jobRole });
});

const JOB_ROLE_KEYS = JOB_ROLES.map((r) => r.key) as string[];
const setLensesSchema = z.object({
  keys: z.array(z.string()).min(1, "렌즈를 1개 이상 선택하세요"),
  jobRole: z.string().optional(),
});

// PUT /api/me/lenses - 내 렌즈 설정(전체 교체). 취업 렌즈면 직무(jobRole) config 저장.
meRoute.put("/lenses", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const parsed = setLensesSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid body", detail: parsed.error.flatten() }, 400);

  const valid = await db.select({ key: lenses.key }).from(lenses).where(inArray(lenses.key, parsed.data.keys));
  const validKeys = valid.map((v) => v.key);
  if (validKeys.length === 0) return c.json({ error: "유효한 렌즈가 없습니다" }, 400);

  const jobRole = parsed.data.jobRole && JOB_ROLE_KEYS.includes(parsed.data.jobRole) ? parsed.data.jobRole : undefined;

  await db.transaction(async (tx) => {
    await tx.delete(userLenses).where(eq(userLenses.userId, user.id));
    await tx.insert(userLenses).values(
      validKeys.map((key) => ({
        userId: user.id,
        lensKey: key,
        enabled: true,
        config: key === "job" && jobRole ? { jobRole } : null,
      })),
    );
  });

  return c.json({ enabled: validKeys, jobRole });
});

// ---- 산업 ----

// GET /api/me/industries - 내가 팔로우한 산업(상세)
meRoute.get("/industries", async (c) => {
  const user = c.get("user");
  const rows = await db
    .select({
      id: industries.id,
      name: industries.name,
      slug: industries.slug,
      iconColor: industries.iconColor,
      isCustom: industries.userId, // null=글로벌
      sort: userIndustries.sort,
    })
    .from(userIndustries)
    .innerJoin(industries, eq(userIndustries.industryId, industries.id))
    .where(eq(userIndustries.userId, user.id))
    .orderBy(userIndustries.sort);
  return c.json({ industries: rows.map((r) => ({ ...r, isCustom: r.isCustom !== null })) });
});

const followSchema = z.object({ industryId: z.string().uuid() });

// POST /api/me/industries/follow - 기존 산업(글로벌/커스텀) 팔로우
meRoute.post("/industries/follow", async (c) => {
  const user = c.get("user");
  const parsed = followSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid body" }, 400);

  // 글로벌이거나 본인 소유 커스텀만 팔로우 가능(타인 커스텀 차단)
  const [ind] = await db.select().from(industries).where(eq(industries.id, parsed.data.industryId)).limit(1);
  if (!ind) return c.json({ error: "산업 없음" }, 404);
  if (ind.userId !== null && ind.userId !== user.id) return c.json({ error: "접근 불가" }, 403);

  await db
    .insert(userIndustries)
    .values({ userId: user.id, industryId: ind.id })
    .onConflictDoNothing();
  return c.json({ ok: true });
});

// DELETE /api/me/industries/:id - 언팔로우
meRoute.delete("/industries/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await db.delete(userIndustries).where(and(eq(userIndustries.userId, user.id), eq(userIndustries.industryId, id)));
  return c.json({ ok: true });
});

const createIndustrySchema = z.object({
  name: z.string().min(1).max(40),
  iconColor: z.string().optional(),
});

// POST /api/me/industries - 커스텀 산업 생성 + 자동 팔로우
meRoute.post("/industries", async (c) => {
  const user = c.get("user");
  const parsed = createIndustrySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid body", detail: parsed.error.flatten() }, 400);

  const name = parsed.data.name.trim();
  const slug = name.toLowerCase().replace(/\s+/g, "-");

  const created = await db
    .insert(industries)
    .values({ userId: user.id, name, slug, iconColor: parsed.data.iconColor ?? "#8A93A8" })
    .onConflictDoNothing()
    .returning();

  // (user_id, slug) 중복이면 기존 것 사용
  const [ind] = created.length
    ? created
    : await db.select().from(industries).where(and(eq(industries.userId, user.id), eq(industries.slug, slug))).limit(1);

  await db.insert(userIndustries).values({ userId: user.id, industryId: ind.id }).onConflictDoNothing();
  return c.json({ industry: ind });
});

// GET /api/me/entries/recent - 최근 엔트리(Sprint2 추출 전까지는 비어있음)
meRoute.get("/entries/recent", async (c) => {
  const user = c.get("user");
  const rows = await db
    .select()
    .from(entries)
    .where(eq(entries.userId, user.id))
    .orderBy(desc(entries.createdAt))
    .limit(10);
  return c.json({ entries: rows });
});

// ---- 월별 롤업 ----

// GET /api/me/industries/:id/rollups - 그 산업의 월별 롤업 목록(+공통/엇갈림)
meRoute.get("/industries/:id/rollups", async (c) => {
  const user = c.get("user");
  const industryId = c.req.param("id");
  const rows = await db
    .select()
    .from(rollups)
    .where(and(eq(rollups.userId, user.id), eq(rollups.industryId, industryId), eq(rollups.periodType, "month")))
    .orderBy(desc(rollups.periodKey));
  const ids = rows.map((r) => r.id);
  const facts = ids.length ? await db.select().from(rollupFacts).where(inArray(rollupFacts.rollupId, ids)) : [];
  const byRollup = new Map<string, typeof facts>();
  for (const f of facts) {
    const arr = byRollup.get(f.rollupId) ?? [];
    arr.push(f);
    byRollup.set(f.rollupId, arr);
  }
  return c.json({ rollups: rows.map((r) => ({ ...r, facts: byRollup.get(r.id) ?? [] })) });
});

const createRollupSchema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/, "YYYY-MM 형식") });

// POST /api/me/industries/:id/rollups - 월별 롤업 생성 요청(워커가 LLM 으로 처리). period=YYYY-MM
meRoute.post("/industries/:id/rollups", async (c) => {
  const user = c.get("user");
  const industryId = c.req.param("id");
  const parsed = createRollupSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid body", detail: parsed.error.flatten() }, 400);

  const [ind] = await db.select().from(industries).where(eq(industries.id, industryId)).limit(1);
  if (!ind) return c.json({ error: "산업 없음" }, 404);
  if (ind.userId !== null && ind.userId !== user.id) return c.json({ error: "접근 불가" }, 403);

  // 롤업도 LLM 호출 → 무료 한도 게이팅
  const quota = await consumeAnalysis(user);
  if (!quota.ok) return c.json({ error: QUOTA_MSG, quota }, 402);

  const period = parsed.data.period;
  // 같은 (산업, 월) 롤업 재생성: 기존 삭제(facts/sources cascade) 후 pending 생성
  await db
    .delete(rollups)
    .where(
      and(
        eq(rollups.userId, user.id),
        eq(rollups.industryId, industryId),
        eq(rollups.periodType, "month"),
        eq(rollups.periodKey, period),
      ),
    );
  const [rollup] = await db
    .insert(rollups)
    .values({
      userId: user.id,
      industryId,
      periodType: "month",
      periodKey: period,
      llmProvider: await resolveProvider(user),
      status: "pending",
    })
    .returning();
  return c.json({ rollup });
});

// ---- 리포트 업로드 ----

// 리포트 행에 산업 태그(멀티) 부착
async function attachIndustries<T extends { id: string }>(rows: T[]) {
  if (rows.length === 0) return rows.map((r) => ({ ...r, industries: [] as { id: string; name: string }[] }));
  const ids = rows.map((r) => r.id);
  const tags = await db
    .select({ reportId: reportIndustries.reportId, id: industries.id, name: industries.name })
    .from(reportIndustries)
    .innerJoin(industries, eq(industries.id, reportIndustries.industryId))
    .where(inArray(reportIndustries.reportId, ids));
  const by = new Map<string, { id: string; name: string }[]>();
  for (const t of tags) {
    const arr = by.get(t.reportId) ?? [];
    arr.push({ id: t.id, name: t.name });
    by.set(t.reportId, arr);
  }
  return rows.map((r) => ({ ...r, industries: by.get(r.id) ?? [] }));
}

// GET /api/me/reports?industryId=&docType= - 내 리포트(산업 태그·문서타입 필터, 산업은 멀티 조인)
meRoute.get("/reports", async (c) => {
  const user = c.get("user");
  const industryId = c.req.query("industryId");
  const docType = c.req.query("docType");
  const view = c.req.query("view"); // all(기본, 숨김 제외) | bookmarks | hidden
  const conds = [eq(reports.userId, user.id)];
  if (docType === "industry" || docType === "company" || docType === "news") conds.push(eq(reports.docType, docType));
  if (view === "hidden") conds.push(eq(reports.hidden, true));
  else conds.push(eq(reports.hidden, false)); // all·bookmarks 는 숨김 제외
  if (view === "bookmarks") conds.push(eq(reports.bookmarked, true));

  const rows = industryId
    ? await db
        .select(getTableColumns(reports))
        .from(reports)
        .innerJoin(
          reportIndustries,
          and(eq(reportIndustries.reportId, reports.id), eq(reportIndustries.industryId, industryId)),
        )
        .where(and(...conds))
        .orderBy(desc(reports.createdAt))
        .limit(50)
    : await db
        .select()
        .from(reports)
        .where(and(...conds))
        .orderBy(desc(reports.createdAt))
        .limit(50);

  return c.json({ reports: await attachIndustries(rows) });
});

// 리포트 숨김/책갈피 토글(본인 리포트)
const setReportFlag = (userId: string, id: string, patch: { hidden: boolean } | { bookmarked: boolean }) =>
  db.update(reports).set(patch).where(and(eq(reports.id, id), eq(reports.userId, userId)));
meRoute.post("/reports/:id/hide", async (c) => {
  await setReportFlag(c.get("user").id, c.req.param("id"), { hidden: true });
  return c.json({ ok: true });
});
meRoute.delete("/reports/:id/hide", async (c) => {
  await setReportFlag(c.get("user").id, c.req.param("id"), { hidden: false });
  return c.json({ ok: true });
});
meRoute.post("/reports/:id/bookmark", async (c) => {
  await setReportFlag(c.get("user").id, c.req.param("id"), { bookmarked: true });
  return c.json({ ok: true });
});
meRoute.delete("/reports/:id/bookmark", async (c) => {
  await setReportFlag(c.get("user").id, c.req.param("id"), { bookmarked: false });
  return c.json({ ok: true });
});

// POST /api/me/reports - 업로드(multipart). PDF 파일 또는 텍스트 입력. report 생성(parse_status=pending).
// 산업은 선택(미지정 시 워커가 AI 매칭). 실제 파싱/추출은 워커가 큐로 처리.
meRoute.post("/reports", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const file = body["file"];
  const text = typeof body["text"] === "string" ? body["text"].trim() : "";

  // 입력: PDF 파일 또는 텍스트
  let inputFormat: "pdf" | "text";
  let bytes: Uint8Array;
  let baseName: string;
  if (file instanceof File) {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) return c.json({ error: "PDF 파일만 업로드할 수 있습니다" }, 400);
    if (file.size > env.maxUploadMb * 1024 * 1024)
      return c.json({ error: `파일이 너무 큽니다(최대 ${env.maxUploadMb}MB)` }, 400);
    inputFormat = "pdf";
    bytes = new Uint8Array(await file.arrayBuffer());
    baseName = file.name.replace(/\.pdf$/i, "");
  } else if (text.length > 0) {
    inputFormat = "text";
    bytes = new TextEncoder().encode(text);
    const titleField = typeof body["title"] === "string" ? body["title"].trim() : "";
    baseName = titleField || text.split("\n")[0].slice(0, 40) || "텍스트 노트";
  } else {
    return c.json({ error: "PDF 파일 또는 텍스트를 입력하세요" }, 400);
  }

  // 산업(선택): 글로벌이거나 본인 소유만. 미지정이면 워커 AI 매칭.
  const industryId = typeof body["industryId"] === "string" && body["industryId"] ? body["industryId"] : null;
  if (industryId) {
    const [ind] = await db.select().from(industries).where(eq(industries.id, industryId)).limit(1);
    if (!ind) return c.json({ error: "산업 없음" }, 404);
    if (ind.userId !== null && ind.userId !== user.id) return c.json({ error: "접근 불가" }, 403);
  }

  // 렌즈: 요청값을 사용자가 켠 렌즈로 한정. 미지정이면 켠 렌즈 전체.
  const enabledRows = await db
    .select({ lensKey: userLenses.lensKey })
    .from(userLenses)
    .where(and(eq(userLenses.userId, user.id), eq(userLenses.enabled, true)));
  const enabled = enabledRows.map((r) => r.lensKey);
  let requested = enabled;
  const raw = body["lensKeys"];
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) requested = arr.filter((k): k is string => typeof k === "string" && enabled.includes(k));
    } catch {
      /* 무시하고 enabled 사용 */
    }
  }
  if (requested.length === 0) return c.json({ error: "추출할 렌즈가 없습니다. 먼저 렌즈를 켜세요." }, 400);

  // 무료 한도 게이팅(업로드=분석 1건)
  const quota = await consumeAnalysis(user);
  if (!quota.ok) return c.json({ error: QUOTA_MSG, quota }, 402);

  const filename = inputFormat === "pdf" ? baseName + ".pdf" : baseName + ".txt";
  const { fileKey, size } = await storage.save(user.id, filename, bytes);
  const llmProvider = await resolveProvider(user); // 개발자=설정값(claude 가능), 일반=gemini

  const [report] = await db
    .insert(reports)
    .values({
      userId: user.id,
      industryId,
      industryConfirmed: industryId !== null, // 수동 지정이면 확인된 것으로
      title: baseName,
      inputFormat,
      fileKey,
      fileSize: size,
      requestedLenses: requested,
      llmProvider,
      parseStatus: "pending",
    })
    .returning();

  return c.json({ report });
});

// DELETE /api/me/reports/:id - 리포트 삭제(엔트리·숫자·페이지·태그 cascade + 파일)
meRoute.delete("/reports/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const [report] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, id), eq(reports.userId, user.id)))
    .limit(1);
  if (!report) return c.json({ error: "리포트 없음" }, 404);
  if (report.fileKey) await storage.remove(report.fileKey).catch(() => {});
  await db.delete(reports).where(eq(reports.id, id));
  return c.json({ ok: true });
});

const setIndustrySchema = z.object({ industryId: z.string().uuid().nullable() });

// PUT /api/me/reports/:id/industry - AI 매칭 산업 확인/수정. 확인 시 자동 팔로우.
meRoute.put("/reports/:id/industry", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const parsed = setIndustrySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid body" }, 400);

  const [report] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, id), eq(reports.userId, user.id)))
    .limit(1);
  if (!report) return c.json({ error: "리포트 없음" }, 404);

  const industryId = parsed.data.industryId;
  if (industryId) {
    const [ind] = await db.select().from(industries).where(eq(industries.id, industryId)).limit(1);
    if (!ind) return c.json({ error: "산업 없음" }, 404);
    if (ind.userId !== null && ind.userId !== user.id) return c.json({ error: "접근 불가" }, 403);
    await db.insert(userIndustries).values({ userId: user.id, industryId }).onConflictDoNothing(); // 확인 시 핀
  }

  await db.update(reports).set({ industryId, industryConfirmed: true }).where(eq(reports.id, id));
  // 멀티 태그를 사용자가 고른 산업으로 확정(없으면 비움)
  await db.delete(reportIndustries).where(eq(reportIndustries.reportId, id));
  if (industryId) {
    await db.insert(reportIndustries).values({ reportId: id, industryId }).onConflictDoNothing();
  }
  await db.update(entries).set({ industryId }).where(eq(entries.reportId, id));
  return c.json({ ok: true, industryId });
});

// GET /api/me/reports/:id - 리포트 1건 + 추출 작업 상태(AI 요약 작업 상태 조회)
meRoute.get("/reports/:id", async (c) => {
  const user = c.get("user");
  const [report] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, c.req.param("id")), eq(reports.userId, user.id)))
    .limit(1);
  if (!report) return c.json({ error: "리포트 없음" }, 404);
  return c.json({ report: (await attachIndustries([report]))[0] });
});

// POST /api/me/reports/:id/extract - 추출 재요청(AI 요약 생성 요청). parse_status=pending 으로 큐잉.
// 운영(SQS)에서는 여기서 메시지 enqueue. 로컬은 워커가 pending 을 폴링.
meRoute.post("/reports/:id/extract", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const [report] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, id), eq(reports.userId, user.id)))
    .limit(1);
  if (!report) return c.json({ error: "리포트 없음" }, 404);
  if (report.parseStatus === "parsing") return c.json({ error: "이미 처리 중입니다" }, 409);
  if (!report.requestedLenses || report.requestedLenses.length === 0)
    return c.json({ error: "추출할 렌즈가 없습니다" }, 400);

  // 재추출도 분석 1건으로 게이팅
  const quota = await consumeAnalysis(user);
  if (!quota.ok) return c.json({ error: QUOTA_MSG, quota }, 402);

  await db
    .update(reports)
    .set({ parseStatus: "pending", llmProvider: await resolveProvider(user) })
    .where(eq(reports.id, id));
  return c.json({ ok: true, parseStatus: "pending" });
});

// GET /api/me/usage - 오늘 분석 사용량/한도(UI 표시용)
meRoute.get("/usage", async (c) => {
  const user = c.get("user");
  const day = seoulDay();
  const [row] = await db
    .select({ count: usageDaily.count })
    .from(usageDaily)
    .where(and(eq(usageDaily.userId, user.id), eq(usageDaily.day, day)))
    .limit(1);
  const used = row?.count ?? 0;
  // 개발자 모드면 무제한(plan=pro 와 동일 표시)
  const limit = env.devUnlimited || user.plan === "pro" ? null : FREE_DAILY_LIMIT;
  const plan = env.devUnlimited ? "pro" : user.plan;
  return c.json({ plan, used, limit, remaining: limit === null ? null : Math.max(0, limit - used) });
});

// GET /api/me/reports/:id/entries - 리포트의 렌즈별 엔트리 + 핵심숫자(검토 화면용)
meRoute.get("/reports/:id/entries", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const [report] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, id), eq(reports.userId, user.id)))
    .limit(1);
  if (!report) return c.json({ error: "리포트 없음" }, 404);

  const entryRows = await db.select().from(entries).where(eq(entries.reportId, id)).orderBy(entries.lensKey);
  const ids = entryRows.map((e) => e.id);
  const numbers = ids.length
    ? await db.select().from(entryNumbers).where(inArray(entryNumbers.entryId, ids))
    : [];
  const byEntry = new Map<string, typeof numbers>();
  for (const n of numbers) {
    const arr = byEntry.get(n.entryId) ?? [];
    arr.push(n);
    byEntry.set(n.entryId, arr);
  }
  return c.json({
    report: (await attachIndustries([report]))[0],
    entries: entryRows.map((e) => ({ ...e, numbers: byEntry.get(e.id) ?? [] })),
  });
});

// frame 은 문서타입 공통 분석 구조(AnalysisFrame). 편집 저장은 전체 frame 을 받아 병합.
const saveEntrySchema = z.object({
  frame: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["draft", "saved"]).optional(),
});

// PUT /api/me/entries/:id - 엔트리 검토/수정 저장(요약 엔트리 저장 API)
meRoute.put("/entries/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const parsed = saveEntrySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid body", detail: parsed.error.flatten() }, 400);

  const [existing] = await db
    .select()
    .from(entries)
    .where(and(eq(entries.id, id), eq(entries.userId, user.id)))
    .limit(1);
  if (!existing) return c.json({ error: "엔트리 없음" }, 404);

  const next = {
    frame: parsed.data.frame
      ? ({ ...(existing.frame ?? {}), ...parsed.data.frame } as EntryFrame)
      : existing.frame,
    status: parsed.data.status ?? existing.status,
    updatedAt: new Date(),
  };
  const [updated] = await db.update(entries).set(next).where(eq(entries.id, id)).returning();
  return c.json({ entry: updated });
});
