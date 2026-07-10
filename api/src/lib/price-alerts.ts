import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { securities, userSecurities, paperPositions, notifications, userLlmSettings } from "@reportlens/db";
import { db } from "../db.js";
import { liveQuote } from "./price-service.js";
import { kisEnabled } from "./kis.js";

// 관심/보유 종목 가격 조기경보. 사실 기반(예측 아님): 전일대비 급락 + 매수가 대비 손절 라인.
// API 프로세스에서 장중 주기 실행(sweepPriceAlerts). 하루 1회/조건 중복 방지. 임계값은 유저별 설정.
const DEFAULT_DROP = 5; // 전일대비 급락 기본 임계(%)
const DEFAULT_STOP = 10; // 매수가 대비 손절 기본 라인(%)

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

  // 실제 보유 평단/순주수 + 모의 전용 판별 (경보는 실제만: 모의 종목 제외)
  const positions = await db.select().from(paperPositions);
  const held = new Map<string, { buyShares: number; buyCost: number; net: number }>();
  const hasReal = new Set<string>(); // user:security 에 실제 거래 있음
  const hasSim = new Set<string>(); // 모의 거래 있음
  for (const p of positions) {
    if (!p.securityId) continue;
    const key = `${p.userId}:${p.securityId}`;
    if (p.simulated) { hasSim.add(key); continue; }
    hasReal.add(key);
    if (p.buyPrice == null) continue;
    const h = held.get(key) ?? { buyShares: 0, buyCost: 0, net: 0 };
    if (p.side === "sell") h.net -= p.shares;
    else { h.buyShares += p.shares; h.buyCost += p.shares * p.buyPrice; h.net += p.shares; }
    held.set(key, h);
  }
  // 모의 전용(모의 거래만, 실제 없음)이면 경보 제외
  const simOnly = (userId: string, secId: string) => hasSim.has(`${userId}:${secId}`) && !hasReal.has(`${userId}:${secId}`);

  // 오늘 이미 보낸 price 알림(중복 방지). title 을 키로.
  const today = seoulDay();
  const existing = await db
    .select({ userId: notifications.userId, title: notifications.title })
    .from(notifications)
    .where(and(eq(notifications.kind, "price"), gte(notifications.createdAt, sql`${today}::date`)));
  const sent = new Set(existing.map((e) => `${e.userId}:${e.title}`));

  // 유저별 경보 설정(임계값·끄기)
  const userIds = [...new Set(regs.map((r) => r.userId))];
  const cfgs = await db.select({ userId: userLlmSettings.userId, drop: userLlmSettings.alertDropPct, stop: userLlmSettings.alertStopPct, off: userLlmSettings.alertsOff }).from(userLlmSettings).where(inArray(userLlmSettings.userId, userIds));
  const cfgByUser = new Map(cfgs.map((c) => [c.userId, c]));

  const rows: { userId: string; kind: string; securityId: string; title: string; body: string; matched: string }[] = [];
  const openSecById = new Map(openSecs.map((s) => [s.id, s]));
  for (const reg of regs) {
    const cfg = cfgByUser.get(reg.userId);
    if (cfg?.off) continue; // 경보 끔
    const dropPct = cfg?.drop ?? DEFAULT_DROP;
    const stopPct = cfg?.stop ?? DEFAULT_STOP;
    const sec = openSecById.get(reg.securityId);
    const q = sec ? quote.get(sec.id) : null;
    if (!sec || !q) continue;
    if (simOnly(reg.userId, sec.id)) continue; // 모의 전용 종목은 경보 제외(실제만)
    const fmtP = sec.isOverseas ? `$${q.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `${Math.round(q.price).toLocaleString()}원`;

    // 1) 전일대비 급락 (관심+보유)
    if (q.changeRate != null && q.changeRate <= -dropPct) {
      const title = `${sec.name} 급락 경보`;
      if (!sent.has(`${reg.userId}:${title}`)) {
        rows.push({ userId: reg.userId, kind: "price", securityId: sec.id, title, body: `전일 대비 ${q.changeRate.toFixed(1)}% · 현재 ${fmtP}`, matched: `관심/보유 종목이 오늘 ${dropPct}% 이상 하락` });
        sent.add(`${reg.userId}:${title}`);
      }
    }
    // 2) 매수가 대비 손절 라인 (실제 보유). 종목별 설정(reg.stopPct) 우선, 없으면 전역.
    const h = held.get(`${reg.userId}:${sec.id}`);
    const effStop = reg.stopPct ?? stopPct;
    if (h && h.net > 0 && h.buyShares > 0) {
      const avg = h.buyCost / h.buyShares;
      const downPct = ((q.price - avg) / avg) * 100;
      if (downPct <= -effStop) {
        const title = `${sec.name} 손절 라인 도달`;
        if (!sent.has(`${reg.userId}:${title}`)) {
          const fmtAvg = sec.isOverseas ? `$${avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `${Math.round(avg).toLocaleString()}원`;
          rows.push({ userId: reg.userId, kind: "price", securityId: sec.id, title, body: `매수가 대비 ${downPct.toFixed(1)}% · 평단 ${fmtAvg} → ${fmtP}`, matched: `보유 종목이 평단 대비 ${effStop}% 이상 하락(손절선)` });
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
