import { Hono } from "hono";
import { z } from "zod";
import { and, eq, or, ilike, sql, desc } from "drizzle-orm";
import { securities, userSecurities, paperPositions, paperNotes, reports } from "@reportlens/db";
import { db } from "../db.js";
import { requireUser, type AppEnv } from "../auth.js";
import { getSeries, latestClose, closeOn, liveQuote } from "../lib/price-service.js";
import { askLLM } from "../define.js";

export const stocksRoute = new Hono<AppEnv>();
stocksRoute.use("*", requireUser);

type Security = typeof securities.$inferSelect;
type Position = typeof paperPositions.$inferSelect;

// 매수 lot 들 + 현재가 → 손익 요약. 매수 없으면 관심만.
function summarize(positions: Position[], close: number | null) {
  const totalShares = positions.reduce((s, p) => s + p.shares, 0);
  const totalCost = positions.reduce((s, p) => s + p.shares * (p.buyPrice ?? 0), 0);
  const avgBuy = totalShares > 0 ? totalCost / totalShares : null;
  const marketValue = close != null ? totalShares * close : null;
  const pnl = marketValue != null ? marketValue - totalCost : null;
  const pnlPct = pnl != null && totalCost > 0 ? (pnl / totalCost) * 100 : null;
  return {
    watchOnly: positions.length === 0,
    totalShares,
    totalCost,
    avgBuy,
    close,
    marketValue,
    pnl,
    pnlPct,
  };
}

async function findSecurity(id: string): Promise<Security | null> {
  const [s] = await db.select().from(securities).where(eq(securities.id, id)).limit(1);
  return s ?? null;
}

// GET /search?q= : 종목 자동완성(이름/코드). 국내 마스터 + 이미 등록된 해외.
stocksRoute.get("/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 1) return c.json({ results: [] });
  const norm = q.replace(/[\s()·.,\-&]/g, "").toLowerCase();
  const rows = await db
    .select({ id: securities.id, code: securities.code, name: securities.name, market: securities.market, isOverseas: securities.isOverseas })
    .from(securities)
    .where(or(ilike(securities.nameNorm, `${norm}%`), ilike(securities.nameNorm, `%${norm}%`), eq(securities.code, q)))
    .limit(12);
  // 접두 일치를 앞으로
  rows.sort((a, b) => {
    const an = a.name.replace(/[\s()·.,\-&]/g, "").toLowerCase();
    const bn = b.name.replace(/[\s()·.,\-&]/g, "").toLowerCase();
    return (an.startsWith(norm) ? 0 : 1) - (bn.startsWith(norm) ? 0 : 1);
  });
  return c.json({ results: rows });
});

// GET / : 내 종목 목록(관심 + 모의매수). 각 종목 손익 요약 포함.
stocksRoute.get("/", async (c) => {
  const user = c.get("user");
  const regs = await db
    .select({ security: securities, createdAt: userSecurities.createdAt })
    .from(userSecurities)
    .innerJoin(securities, eq(securities.id, userSecurities.securityId))
    .where(eq(userSecurities.userId, user.id))
    .orderBy(desc(userSecurities.createdAt));
  const positions = await db
    .select()
    .from(paperPositions)
    .where(eq(paperPositions.userId, user.id));
  const bySec = new Map<string, Position[]>();
  for (const p of positions) {
    if (!p.securityId) continue;
    (bySec.get(p.securityId) ?? bySec.set(p.securityId, []).get(p.securityId)!).push(p);
  }
  const items = [];
  for (const r of regs) {
    const last = await latestClose(r.security);
    const summary = summarize(bySec.get(r.security.id) ?? [], last?.close ?? null);
    items.push({
      security: { id: r.security.id, code: r.security.code, name: r.security.name, market: r.security.market, isOverseas: r.security.isOverseas },
      ...summary,
    });
  }
  return c.json({ items });
});

// POST /watch : 관심 등록(매수 없이).
stocksRoute.post("/watch", async (c) => {
  const user = c.get("user");
  const parsed = z.object({ securityId: z.string().uuid() }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid" }, 400);
  const sec = await findSecurity(parsed.data.securityId);
  if (!sec) return c.json({ error: "종목을 찾을 수 없어요." }, 404);
  await db
    .insert(userSecurities)
    .values({ userId: user.id, securityId: sec.id })
    .onConflictDoNothing();
  return c.json({ ok: true, securityId: sec.id });
});

// POST /positions : 모의매수 기록. buyPrice 비우면 매수일 종가 자동.
stocksRoute.post("/positions", async (c) => {
  const user = c.get("user");
  const parsed = z
    .object({
      securityId: z.string().uuid(),
      buyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      shares: z.number().positive(),
      buyPrice: z.number().positive().optional(),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "입력을 확인해 주세요." }, 400);
  const sec = await findSecurity(parsed.data.securityId);
  if (!sec) return c.json({ error: "종목을 찾을 수 없어요." }, 404);
  let buyPrice = parsed.data.buyPrice ?? null;
  if (buyPrice == null) buyPrice = await closeOn(sec, parsed.data.buyDate);
  await db.insert(userSecurities).values({ userId: user.id, securityId: sec.id }).onConflictDoNothing();
  const [pos] = await db
    .insert(paperPositions)
    .values({ userId: user.id, securityId: sec.id, name: sec.name, buyDate: parsed.data.buyDate, shares: parsed.data.shares, buyPrice })
    .returning();
  return c.json({ ok: true, position: pos });
});

// DELETE /positions/:id : 매수 lot 삭제.
stocksRoute.delete("/positions/:id", async (c) => {
  const user = c.get("user");
  await db.delete(paperPositions).where(and(eq(paperPositions.id, c.req.param("id")), eq(paperPositions.userId, user.id)));
  return c.json({ ok: true });
});

// DELETE /notes/:id : 투자일지 메모 삭제.
stocksRoute.delete("/notes/:id", async (c) => {
  const user = c.get("user");
  await db.delete(paperNotes).where(and(eq(paperNotes.id, c.req.param("id")), eq(paperNotes.userId, user.id)));
  return c.json({ ok: true });
});

// DELETE /:securityId : 내 종목에서 제거(관심 + 매수 + 일지 정리).
stocksRoute.delete("/:securityId", async (c) => {
  const user = c.get("user");
  const sid = c.req.param("securityId");
  await db.delete(paperPositions).where(and(eq(paperPositions.securityId, sid), eq(paperPositions.userId, user.id)));
  await db.delete(userSecurities).where(and(eq(userSecurities.securityId, sid), eq(userSecurities.userId, user.id)));
  return c.json({ ok: true });
});

// GET /:securityId : 상세(종목 + 매수 + 손익 요약 + 현재가).
stocksRoute.get("/:securityId", async (c) => {
  const user = c.get("user");
  const sec = await findSecurity(c.req.param("securityId"));
  if (!sec) return c.json({ error: "종목을 찾을 수 없어요." }, 404);
  const positions = await db
    .select()
    .from(paperPositions)
    .where(and(eq(paperPositions.userId, user.id), eq(paperPositions.securityId, sec.id)))
    .orderBy(paperPositions.buyDate);
  const quote = await liveQuote(sec);
  const summary = summarize(positions, quote?.price ?? null);
  return c.json({
    security: { id: sec.id, code: sec.code, name: sec.name, market: sec.market, isOverseas: sec.isOverseas },
    quote,
    positions,
    summary,
  });
});

// GET /:securityId/series?period=M|D : 시세 시계열(캐시).
stocksRoute.get("/:securityId/series", async (c) => {
  const sec = await findSecurity(c.req.param("securityId"));
  if (!sec) return c.json({ error: "종목을 찾을 수 없어요." }, 404);
  const period = c.req.query("period") === "D" ? "D" : "M";
  const bars = await getSeries(sec, period);
  return c.json({ period, bars });
});

// GET /:securityId/notes : 투자일지(최신순).
stocksRoute.get("/:securityId/notes", async (c) => {
  const user = c.get("user");
  const sid = c.req.param("securityId");
  const notes = await db
    .select()
    .from(paperNotes)
    .innerJoin(paperPositions, eq(paperNotes.positionId, paperPositions.id))
    .where(and(eq(paperNotes.userId, user.id), eq(paperPositions.securityId, sid)))
    .orderBy(desc(paperNotes.noteDate), desc(paperNotes.createdAt));
  return c.json({ notes: notes.map((n) => n.paper_notes) });
});

// POST /:securityId/notes : 일지 추가. positionId 없으면 그 종목의 대표 lot 에 연결.
stocksRoute.post("/:securityId/notes", async (c) => {
  const user = c.get("user");
  const sid = c.req.param("securityId");
  const parsed = z
    .object({ noteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), body: z.string().min(1).max(2000), positionId: z.string().uuid().optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "메모를 확인해 주세요." }, 400);
  // 연결할 lot: 지정 or 그 종목의 가장 오래된 매수. 매수가 없으면 일지 불가 → 안내.
  let positionId = parsed.data.positionId;
  if (!positionId) {
    const [p] = await db
      .select({ id: paperPositions.id })
      .from(paperPositions)
      .where(and(eq(paperPositions.userId, user.id), eq(paperPositions.securityId, sid)))
      .orderBy(paperPositions.buyDate)
      .limit(1);
    positionId = p?.id;
  }
  if (!positionId) return c.json({ error: "먼저 모의매수를 기록하면 일지를 쓸 수 있어요." }, 400);
  const [note] = await db
    .insert(paperNotes)
    .values({ userId: user.id, positionId, noteDate: parsed.data.noteDate, body: parsed.data.body })
    .returning();
  return c.json({ ok: true, note });
});

// GET /:securityId/articles : 관련 기사(내 자료 중 종목명 언급). 외부 뉴스는 추후.
stocksRoute.get("/:securityId/articles", async (c) => {
  const user = c.get("user");
  const sec = await findSecurity(c.req.param("securityId"));
  if (!sec) return c.json({ error: "종목을 찾을 수 없어요." }, 404);
  const like = `%${sec.name}%`;
  const rows = await db
    .select({ id: reports.id, title: reports.title, company: reports.company, pubDate: reports.pubDate, docType: reports.docType, createdAt: reports.createdAt })
    .from(reports)
    .where(and(eq(reports.userId, user.id), or(ilike(reports.title, like), eq(reports.company, sec.name))))
    .orderBy(desc(sql`coalesce(${reports.pubDate}, ${reports.createdAt}::date)`))
    .limit(20);
  return c.json({ articles: rows });
});

// POST /:securityId/analyze : 최근 등락 + 관련 기사 → 상승/하락 가능 요인(가설). 투자권유 아님.
stocksRoute.post("/:securityId/analyze", async (c) => {
  const user = c.get("user");
  const sec = await findSecurity(c.req.param("securityId"));
  if (!sec) return c.json({ error: "종목을 찾을 수 없어요." }, 404);
  const bars = await getSeries(sec, "M");
  if (bars.length < 2) return c.json({ analysis: "가격 데이터가 아직 부족해요." });
  const recent = bars.slice(-6);
  const first = recent[0].close;
  const last = recent[recent.length - 1].close;
  const pct = (((last - first) / first) * 100).toFixed(1);
  const moves = recent.map((b) => `${b.date.slice(0, 7)} ${Math.round(b.close)}`).join(", ");
  const like = `%${sec.name}%`;
  const arts = await db
    .select({ title: reports.title, pubDate: reports.pubDate })
    .from(reports)
    .where(and(eq(reports.userId, user.id), or(ilike(reports.title, like), eq(reports.company, sec.name))))
    .orderBy(desc(sql`coalesce(${reports.pubDate}, ${reports.createdAt}::date)`))
    .limit(8);
  const artLines = arts.map((a) => `- ${a.pubDate ?? ""} ${a.title ?? ""}`.trim()).join("\n") || "(관련 자료 없음)";
  const prompt =
    `역할: 초보 투자자를 돕는 분석 보조. 아래 한 종목의 최근 주가 흐름과 내 자료 제목을 근거로 "왜 이렇게 움직였을 가능성이 있는지" 가설을 정리하라.\n` +
    `규칙:\n- 확정 단정 금지, "가능성/추정" 표현. 투자 권유·매수매도 의견 금지.\n- 3개 이내 불릿, 각 60자 이내. 근거가 자료 제목이면 짧게 인용.\n- 데이터로 알 수 없으면 솔직히 "자료만으로는 단정 어려움" 명시.\n` +
    `종목: ${sec.name} (${sec.market})\n최근 6개월 종가: ${moves}\n6개월 변동: ${pct}%\n관련 내 자료:\n${artLines}\n`;
  const analysis = await askLLM(prompt, 500);
  return c.json({ analysis: analysis || "분석을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.", pct: Number(pct) });
});
