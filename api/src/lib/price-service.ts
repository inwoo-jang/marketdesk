import { and, eq, sql } from "drizzle-orm";
import { securities, priceBars, priceSync } from "@reportlens/db";
import { db } from "../db.js";
import { domesticBars, overseasBars, domesticQuote, overseasQuote, kisEnabled, type Bar, type Quote } from "./kis.js";

type Security = typeof securities.$inferSelect;

// 신선도(ms): 일봉 4h, 월봉·연봉 20h. 지나면 KIS 재조회.
const TTL: Record<string, number> = { D: 4 * 60 * 60 * 1000, M: 20 * 60 * 60 * 1000, Y: 20 * 60 * 60 * 1000 };

// 오늘(KST) 문자열. Date 직접 사용은 지양하지만 여기선 조회 구간 계산용.
function today(): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // KST 근사
  return now.toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000 - n * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

async function isFresh(securityId: string, period: string): Promise<boolean> {
  const [row] = await db
    .select({ fetchedAt: priceSync.fetchedAt })
    .from(priceSync)
    .where(and(eq(priceSync.securityId, securityId), eq(priceSync.period, period)))
    .limit(1);
  if (!row) return false;
  return Date.now() - row.fetchedAt.getTime() < (TTL[period] ?? TTL.D);
}

async function fetchBars(sec: Security, period: "D" | "M" | "Y"): Promise<Bar[]> {
  const to = today();
  if (sec.isOverseas) {
    if (!sec.excd) return [];
    // 해외는 연봉 미지원 → 월봉으로 대체(프론트에서 연 단위 표시)
    return overseasBars(sec.excd, sec.code, period === "Y" ? "M" : period, to);
  }
  // 국내: 연봉 최대(약 20년), 월봉 수 년, 일봉 최근 ~160일(KIS 1회 100건 제한)
  const from = period === "Y" ? daysAgo(20 * 365) : period === "M" ? daysAgo(6 * 365) : daysAgo(160);
  return domesticBars(sec.code, period, from, to);
}

async function cache(securityId: string, period: string, bars: Bar[]): Promise<void> {
  if (bars.length > 0) {
    await db
      .insert(priceBars)
      .values(bars.map((b) => ({ securityId, period, date: b.date, close: b.close, open: b.open, high: b.high, low: b.low, volume: b.volume })))
      .onConflictDoUpdate({
        target: [priceBars.securityId, priceBars.period, priceBars.date],
        set: { close: sqlClose, open: sqlOpen, high: sqlHigh, low: sqlLow, volume: sqlVol },
      });
  }
  await db
    .insert(priceSync)
    .values({ securityId, period, fetchedAt: new Date() })
    .onConflictDoUpdate({ target: [priceSync.securityId, priceSync.period], set: { fetchedAt: new Date() } });
}

// onConflict set 은 excluded 값으로 갱신
const sqlClose = sql`excluded.close`;
const sqlOpen = sql`excluded.open`;
const sqlHigh = sql`excluded.high`;
const sqlLow = sql`excluded.low`;
const sqlVol = sql`excluded.volume`;

// 시세 시계열: 캐시 신선하면 그대로, 아니면 KIS 재조회 후 반환.
export async function getSeries(sec: Security, period: "D" | "M" | "Y"): Promise<{ date: string; close: number }[]> {
  if (kisEnabled() && !(await isFresh(sec.id, period))) {
    try {
      const bars = await fetchBars(sec, period);
      await cache(sec.id, period, bars);
    } catch (e) {
      console.error(`시세 조회 실패(${sec.name} ${period}):`, (e as Error).message);
    }
  }
  const rows = await db
    .select({ date: priceBars.date, close: priceBars.close })
    .from(priceBars)
    .where(and(eq(priceBars.securityId, sec.id), eq(priceBars.period, period)))
    .orderBy(priceBars.date);
  return rows;
}

// 목록용 가벼운 종가 조회: DB 캐시의 최신 2봉만 읽어 즉시 반환(KIS 미조회·신선도 검사 없음).
// 목록 화면은 이걸로 즉시 뜨고, 최신화는 실시간 새로고침 버튼/상세/15분 스윕이 담당.
export async function latestCachedClose(sec: Security): Promise<{ close: number; changeRate: number | null } | null> {
  const rows = await db
    .select({ date: priceBars.date, close: priceBars.close })
    .from(priceBars)
    .where(and(eq(priceBars.securityId, sec.id), eq(priceBars.period, "D")))
    .orderBy(sql`${priceBars.date} desc`)
    .limit(2);
  const last = rows[0];
  if (!last) return null;
  const prev = rows[1];
  const changeRate = prev && prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : null;
  return { close: last.close, changeRate };
}

// 최근 종가 + 전일대비(등락률). 일봉 캐시 최신 2개로 계산. 없으면 null.
export async function latestClose(sec: Security): Promise<{ close: number; date: string; changeRate: number | null } | null> {
  const series = await getSeries(sec, "D");
  const last = series[series.length - 1];
  if (!last) return null;
  const prev = series[series.length - 2];
  const changeRate = prev && prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : null;
  return { close: last.close, date: last.date, changeRate };
}

// 매수일 종가(단가 자동): 그 날짜의 일봉 종가. 없으면 그 이전 최근 거래일.
export async function closeOn(sec: Security, date: string): Promise<number | null> {
  const series = await getSeries(sec, "D");
  const onOrBefore = series.filter((b) => b.date <= date);
  const pick = onOrBefore[onOrBefore.length - 1] ?? series[0];
  return pick ? pick.close : null;
}

// 실시간 현재가(상세 화면용). 실패 시 최근 종가로 폴백.
// 전일대비는 KIS 등락률 대신 일봉(어제 종가) 기준으로 계산 → 국내·해외 일관.
export async function liveQuote(sec: Security): Promise<Quote | null> {
  let price: number | null = null;
  let currency = sec.isOverseas ? "USD" : "KRW";
  if (kisEnabled()) {
    try {
      const q = sec.isOverseas && sec.excd ? await overseasQuote(sec.excd, sec.code) : await domesticQuote(sec.code);
      price = q.price;
      currency = q.currency;
    } catch (e) {
      console.error(`현재가 조회 실패(${sec.name}):`, (e as Error).message);
    }
  }
  const series = await getSeries(sec, "D");
  if (price == null) {
    const last = series[series.length - 1];
    if (!last) return null;
    price = last.close;
  }
  // 전일대비: 직전 거래일 종가 대비(오늘 봉이 있으면 어제, 없으면 그제)
  const prev = series[series.length - 2]?.close;
  const changeRate = prev && prev > 0 ? ((price - prev) / prev) * 100 : null;
  return { price, changeRate, currency };
}
