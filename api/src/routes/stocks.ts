import { Hono } from "hono";
import { z } from "zod";
import { and, eq, or, ilike, sql, desc, inArray } from "drizzle-orm";
import { securities, userSecurities, paperPositions, paperNotes, reports } from "@reportlens/db";
import { db } from "../db.js";
import { requireUser, type AppEnv } from "../auth.js";
import { getSeries, latestClose, closeOn, liveQuote } from "../lib/price-service.js";
import { askLLM } from "../define.js";

export const stocksRoute = new Hono<AppEnv>();
stocksRoute.use("*", requireUser);

type Security = typeof securities.$inferSelect;
type Position = typeof paperPositions.$inferSelect;

// 매수/매도 거래 + 현재가 → 손익 요약(평균원가법). 거래 없으면 관심만.
function summarize(trades: Position[], close: number | null) {
  const buys = trades.filter((t) => t.side !== "sell");
  const sells = trades.filter((t) => t.side === "sell");
  const buyShares = buys.reduce((s, p) => s + p.shares, 0);
  const buyCost = buys.reduce((s, p) => s + p.shares * (p.buyPrice ?? 0), 0);
  const avgBuy = buyShares > 0 ? buyCost / buyShares : null;
  const sellShares = sells.reduce((s, p) => s + p.shares, 0);
  // 실현손익: 매도가 - 평단
  const realizedPnl = avgBuy != null ? sells.reduce((s, p) => s + p.shares * ((p.buyPrice ?? 0) - avgBuy), 0) : 0;
  const netShares = buyShares - sellShares;
  const costBasis = avgBuy != null ? avgBuy * netShares : 0; // 남은 보유분 원가
  const marketValue = close != null ? netShares * close : null;
  const unrealizedPnl = marketValue != null && avgBuy != null ? (close! - avgBuy) * netShares : null;
  const pnl = unrealizedPnl != null ? unrealizedPnl + realizedPnl : realizedPnl || null;
  const pnlPct = pnl != null && buyCost > 0 ? (pnl / buyCost) * 100 : null;
  return {
    watchOnly: trades.length === 0,
    totalShares: netShares, // 보유 순주수
    totalCost: costBasis,
    avgBuy,
    close,
    marketValue,
    realizedPnl,
    unrealizedPnl,
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

// 초성 그룹 → 한글 음절 경계. ㄱ은 가~까 포함(< 나). ㅎ은 하~힣.
const KO_GROUPS: { g: string; start: string; end: string }[] = [
  { g: "ㄱ", start: "가", end: "나" }, { g: "ㄴ", start: "나", end: "다" }, { g: "ㄷ", start: "다", end: "라" },
  { g: "ㄹ", start: "라", end: "마" }, { g: "ㅁ", start: "마", end: "바" }, { g: "ㅂ", start: "바", end: "사" },
  { g: "ㅅ", start: "사", end: "아" }, { g: "ㅇ", start: "아", end: "자" }, { g: "ㅈ", start: "자", end: "차" },
  { g: "ㅊ", start: "차", end: "카" }, { g: "ㅋ", start: "카", end: "타" }, { g: "ㅌ", start: "타", end: "파" },
  { g: "ㅍ", start: "파", end: "하" }, { g: "ㅎ", start: "하", end: "힣" },
];

// GET /browse?group=ㄱ|A|# : 이름순 종목 리스트(가나다 → 영문 → 기타). 페이지네이션.
stocksRoute.get("/browse", async (c) => {
  const group = c.req.query("group") ?? "ㄱ";
  const offset = Math.max(0, Number(c.req.query("offset") ?? 0));
  const LIMIT = 60;
  let cond;
  const ko = KO_GROUPS.find((k) => k.g === group);
  if (ko) {
    cond = ko.g === "ㅎ"
      ? and(sql`${securities.name} >= ${ko.start}`, sql`${securities.name} <= ${ko.end}`)
      : and(sql`${securities.name} >= ${ko.start}`, sql`${securities.name} < ${ko.end}`);
  } else if (/^[A-Za-z]$/.test(group)) {
    cond = ilike(securities.name, `${group}%`); // 알파벳 한 글자(대소문자 무시)
  } else {
    cond = sql`${securities.name} !~ '^[가-힣A-Za-z]'`; // 숫자·기타
  }
  const rows = await db
    .select({ id: securities.id, code: securities.code, name: securities.name, market: securities.market, isOverseas: securities.isOverseas })
    .from(securities)
    .where(cond)
    .orderBy(securities.name)
    .limit(LIMIT + 1)
    .offset(offset);
  const hasMore = rows.length > LIMIT;
  return c.json({ group, results: rows.slice(0, LIMIT), hasMore });
});

// GET /?sim=1 : 내 종목 목록. sim=0(기본)=실제 보유+관심, sim=1=모의 연습.
stocksRoute.get("/", async (c) => {
  const user = c.get("user");
  const sim = c.req.query("sim") === "1";
  const positions = await db
    .select()
    .from(paperPositions)
    .where(and(eq(paperPositions.userId, user.id), eq(paperPositions.simulated, sim)));
  const bySec = new Map<string, Position[]>();
  for (const p of positions) {
    if (!p.securityId) continue;
    (bySec.get(p.securityId) ?? bySec.set(p.securityId, []).get(p.securityId)!).push(p);
  }
  // 실제 탭: 관심(user_securities) + 실제 보유. 모의 탭: 모의 거래가 있는 종목만.
  let regs: { security: Security; createdAt: Date }[];
  if (sim) {
    const ids = [...bySec.keys()];
    regs = ids.length
      ? (await db.select().from(securities).where(inArray(securities.id, ids))).map((s) => ({ security: s, createdAt: new Date(0) }))
      : [];
  } else {
    regs = await db
      .select({ security: securities, createdAt: userSecurities.createdAt })
      .from(userSecurities)
      .innerJoin(securities, eq(securities.id, userSecurities.securityId))
      .where(eq(userSecurities.userId, user.id))
      .orderBy(desc(userSecurities.createdAt));
  }
  const items = [];
  for (const r of regs) {
    const last = await latestClose(r.security);
    const summary = summarize(bySec.get(r.security.id) ?? [], last?.close ?? null);
    items.push({
      security: { id: r.security.id, code: r.security.code, name: r.security.name, market: r.security.market, isOverseas: r.security.isOverseas },
      changeRate: last?.changeRate ?? null,
      ...summary,
    });
  }
  return c.json({ items });
});

// GET /diary : 모의매수 다이어리(전 종목 매수+일지 시간순). 주식공부 일기 느낌.
stocksRoute.get("/diary", async (c) => {
  const user = c.get("user");
  const buys = await db
    .select({
      id: paperPositions.id,
      date: paperPositions.buyDate,
      securityId: paperPositions.securityId,
      name: securities.name,
      market: securities.market,
      isOverseas: securities.isOverseas,
      side: paperPositions.side,
      simulated: paperPositions.simulated,
      shares: paperPositions.shares,
      buyPrice: paperPositions.buyPrice,
      reason: paperPositions.reason,
    })
    .from(paperPositions)
    .leftJoin(securities, eq(securities.id, paperPositions.securityId))
    .where(eq(paperPositions.userId, user.id));
  const notes = await db
    .select({
      id: paperNotes.id,
      date: paperNotes.noteDate,
      securityId: paperNotes.securityId,
      name: securities.name,
      market: securities.market,
      isOverseas: securities.isOverseas,
      category: paperNotes.category,
      body: paperNotes.body,
    })
    .from(paperNotes)
    .leftJoin(securities, eq(securities.id, paperNotes.securityId))
    .where(eq(paperNotes.userId, user.id));
  const items = [
    ...buys.map((b) => ({ kind: (b.side === "sell" ? "sell" : "buy") as "buy" | "sell", id: b.id, date: b.date, securityId: b.securityId, name: b.name, market: b.market, isOverseas: b.isOverseas, simulated: b.simulated, shares: b.shares as number | undefined, buyPrice: b.buyPrice as number | null | undefined, reason: b.reason as string | null | undefined, category: null as string | null, body: undefined as string | undefined })),
    ...notes.map((n) => ({ kind: "note" as const, id: n.id, date: n.date, securityId: n.securityId, name: n.name, market: n.market, isOverseas: n.isOverseas, simulated: false, shares: undefined as number | undefined, buyPrice: undefined as number | null | undefined, reason: undefined as string | null | undefined, category: n.category, body: n.body })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
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

// POST /positions : 모의 매수/매도 기록. buyPrice 비우면 거래일 종가 자동. reason=거래 사유.
stocksRoute.post("/positions", async (c) => {
  const user = c.get("user");
  const parsed = z
    .object({
      securityId: z.string().uuid(),
      side: z.enum(["buy", "sell"]).optional(),
      simulated: z.boolean().optional(),
      buyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      shares: z.number().positive(),
      buyPrice: z.number().positive().optional(),
      reason: z.string().max(1000).optional(),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "입력을 확인해 주세요." }, 400);
  const sec = await findSecurity(parsed.data.securityId);
  if (!sec) return c.json({ error: "종목을 찾을 수 없어요." }, 404);
  const side = parsed.data.side ?? "buy";
  const simulated = parsed.data.simulated ?? false;
  let buyPrice = parsed.data.buyPrice ?? null;
  if (buyPrice == null) {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
    // 오늘 거래면 실시간 현재가, 과거면 그 날 종가로 체결
    if (parsed.data.buyDate === today) {
      const q = await liveQuote(sec);
      buyPrice = q?.price ?? (await closeOn(sec, parsed.data.buyDate));
    } else {
      buyPrice = await closeOn(sec, parsed.data.buyDate);
    }
  }
  await db.insert(userSecurities).values({ userId: user.id, securityId: sec.id }).onConflictDoNothing();
  const [pos] = await db
    .insert(paperPositions)
    .values({ userId: user.id, securityId: sec.id, name: sec.name, side, simulated, buyDate: parsed.data.buyDate, shares: parsed.data.shares, buyPrice, reason: parsed.data.reason ?? null })
    .returning();
  return c.json({ ok: true, position: pos });
});

// PUT /positions/:id : 거래 수정(side·날짜·주수·단가·사유).
stocksRoute.put("/positions/:id", async (c) => {
  const user = c.get("user");
  const parsed = z
    .object({
      side: z.enum(["buy", "sell"]).optional(),
      buyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      shares: z.number().positive().optional(),
      buyPrice: z.number().positive().nullable().optional(),
      reason: z.string().max(1000).nullable().optional(),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "입력을 확인해 주세요." }, 400);
  const set: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.side !== undefined) set.side = d.side;
  if (d.buyDate !== undefined) set.buyDate = d.buyDate;
  if (d.shares !== undefined) set.shares = d.shares;
  if (d.buyPrice !== undefined) set.buyPrice = d.buyPrice;
  if (d.reason !== undefined) set.reason = d.reason;
  if (Object.keys(set).length === 0) return c.json({ ok: true });
  const [pos] = await db
    .update(paperPositions)
    .set(set)
    .where(and(eq(paperPositions.id, c.req.param("id")), eq(paperPositions.userId, user.id)))
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
  const close = quote?.price ?? null;
  const summary = summarize(positions.filter((p) => !p.simulated), close); // 실제 보유
  const simSummary = summarize(positions.filter((p) => p.simulated), close); // 모의
  return c.json({
    security: { id: sec.id, code: sec.code, name: sec.name, market: sec.market, isOverseas: sec.isOverseas },
    quote,
    positions,
    summary,
    simSummary,
  });
});

// GET /:securityId/series?period=M|D : 시세 시계열(캐시).
stocksRoute.get("/:securityId/series", async (c) => {
  const sec = await findSecurity(c.req.param("securityId"));
  if (!sec) return c.json({ error: "종목을 찾을 수 없어요." }, 404);
  const pq = c.req.query("period");
  const period = pq === "D" ? "D" : pq === "Y" ? "Y" : "M";
  const bars = await getSeries(sec, period);
  return c.json({ period, bars });
});

// GET /:securityId/notes : 투자일지(최신순). 종목 단위.
stocksRoute.get("/:securityId/notes", async (c) => {
  const user = c.get("user");
  const sid = c.req.param("securityId");
  const notes = await db
    .select()
    .from(paperNotes)
    .where(and(eq(paperNotes.userId, user.id), eq(paperNotes.securityId, sid)))
    .orderBy(desc(paperNotes.noteDate), desc(paperNotes.createdAt));
  return c.json({ notes });
});

// POST /:securityId/notes : 일지 추가(관심만 종목에도 가능).
stocksRoute.post("/:securityId/notes", async (c) => {
  const user = c.get("user");
  const sid = c.req.param("securityId");
  const parsed = z
    .object({
      noteDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      body: z.string().min(1).max(2000),
      category: z.enum(["up", "down", "hold", "memo"]).optional(),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "메모를 확인해 주세요." }, 400);
  const sec = await findSecurity(sid);
  if (!sec) return c.json({ error: "종목을 찾을 수 없어요." }, 404);
  // 관심 등록도 보장(일지 쓰면 내 종목에 포함)
  await db.insert(userSecurities).values({ userId: user.id, securityId: sid }).onConflictDoNothing();
  const [note] = await db
    .insert(paperNotes)
    .values({ userId: user.id, securityId: sid, noteDate: parsed.data.noteDate, body: parsed.data.body, category: parsed.data.category ?? null })
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
