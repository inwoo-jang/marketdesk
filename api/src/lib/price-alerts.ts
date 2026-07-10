import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { securities, userSecurities, paperPositions, notifications } from "@reportlens/db";
import { db } from "../db.js";
import { liveQuote } from "./price-service.js";
import { kisEnabled } from "./kis.js";

// 관심/보유 종목 가격 조기경보. 사실 기반(예측 아님): 전일대비 급락 + 매수가 대비 손절 라인.
// API 프로세스에서 장중 주기 실행(sweepPriceAlerts). 하루 1회/조건 중복 방지.
const DROP_PCT = 5; // 전일대비 급락 임계(%)
const STOP_PCT = 10; // 매수가 대비 손절 라인(%)

type Sec = typeof securities.$inferSelect;

function tzMinutesWeekday(tz: string) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  const wd = get("weekday");
  return { minutes: hour * 60 + Number(get("minute")), weekend: wd === "Sat" || wd === "Sun" };
}

// 장중 여부: 국내 KST 09:00~15:30, 해외 ET 09:30~16:00 (평일).
function isMarketOpen(sec: Sec): boolean {
  if (sec.isOverseas) {
    const { minutes, weekend } = tzMinutesWeekday("America/New_York");
    return !weekend && minutes >= 570 && minutes < 960;
  }
  const { minutes, weekend } = tzMinutesWeekday("Asia/Seoul");
  return !weekend && minutes >= 540 && minutes < 930;
}

const seoulDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

export async function sweepPriceAlerts(): Promise<void> {
  if (!kisEnabled()) return;
  const regs = await db.select().from(userSecurities);
  if (regs.length === 0) return;

  const secIds = [...new Set(regs.map((r) => r.securityId))];
  const secs = await db.select().from(securities).where(inArray(securities.id, secIds));
  const openSecs = secs.filter(isMarketOpen);
  if (openSecs.length === 0) return;

  // 종목 시세 1회씩(유저 공유)
  const quote = new Map<string, { price: number; changeRate: number | null }>();
  for (const s of openSecs) {
    const q = await liveQuote(s).catch(() => null);
    if (q?.price) quote.set(s.id, { price: q.price, changeRate: q.changeRate });
  }

  // 실제 보유 평단/순주수 (user:security → {avg, net})
  const positions = await db.select().from(paperPositions).where(eq(paperPositions.simulated, false));
  const held = new Map<string, { buyShares: number; buyCost: number; net: number }>();
  for (const p of positions) {
    if (!p.securityId || p.buyPrice == null) continue;
    const key = `${p.userId}:${p.securityId}`;
    const h = held.get(key) ?? { buyShares: 0, buyCost: 0, net: 0 };
    if (p.side === "sell") h.net -= p.shares;
    else { h.buyShares += p.shares; h.buyCost += p.shares * p.buyPrice; h.net += p.shares; }
    held.set(key, h);
  }

  // 오늘 이미 보낸 price 알림(중복 방지). title 을 키로.
  const today = seoulDay();
  const existing = await db
    .select({ userId: notifications.userId, title: notifications.title })
    .from(notifications)
    .where(and(eq(notifications.kind, "price"), gte(notifications.createdAt, sql`${today}::date`)));
  const sent = new Set(existing.map((e) => `${e.userId}:${e.title}`));

  const rows: { userId: string; kind: string; securityId: string; title: string; body: string; matched: string }[] = [];
  const openSecById = new Map(openSecs.map((s) => [s.id, s]));
  for (const reg of regs) {
    const sec = openSecById.get(reg.securityId);
    const q = sec ? quote.get(sec.id) : null;
    if (!sec || !q) continue;
    const fmtP = sec.isOverseas ? `$${q.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `${Math.round(q.price).toLocaleString()}원`;

    // 1) 전일대비 급락 (관심+보유)
    if (q.changeRate != null && q.changeRate <= -DROP_PCT) {
      const title = `${sec.name} 급락 경보`;
      if (!sent.has(`${reg.userId}:${title}`)) {
        rows.push({ userId: reg.userId, kind: "price", securityId: sec.id, title, body: `전일 대비 ${q.changeRate.toFixed(1)}% · 현재 ${fmtP}`, matched: `관심/보유 종목이 오늘 ${DROP_PCT}% 이상 하락` });
        sent.add(`${reg.userId}:${title}`);
      }
    }
    // 2) 매수가 대비 손절 라인 (실제 보유)
    const h = held.get(`${reg.userId}:${sec.id}`);
    if (h && h.net > 0 && h.buyShares > 0) {
      const avg = h.buyCost / h.buyShares;
      const downPct = ((q.price - avg) / avg) * 100;
      if (downPct <= -STOP_PCT) {
        const title = `${sec.name} 손절 라인 도달`;
        if (!sent.has(`${reg.userId}:${title}`)) {
          const fmtAvg = sec.isOverseas ? `$${avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `${Math.round(avg).toLocaleString()}원`;
          rows.push({ userId: reg.userId, kind: "price", securityId: sec.id, title, body: `매수가 대비 ${downPct.toFixed(1)}% · 평단 ${fmtAvg} → ${fmtP}`, matched: `보유 종목이 평단 대비 ${STOP_PCT}% 이상 하락(손절선)` });
          sent.add(`${reg.userId}:${title}`);
        }
      }
    }
  }

  if (rows.length > 0) {
    await db.insert(notifications).values(rows);
    console.log(`가격 경보 ${rows.length}건 생성`);
  }
}
