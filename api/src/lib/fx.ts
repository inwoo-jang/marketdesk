// USD→KRW 환율(무료·키없음, Frankfurter/ECB). 해외 주식 원화 환산용.
// 현재 환율은 1시간 캐시, 과거(매수일) 환율은 값이 안 변하므로 영구 캐시.

const histCache = new Map<string, number>();
let cur: { rate: number; at: number } | null = null;
const CUR_TTL = 60 * 60 * 1000;

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

async function fetchRate(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { rates?: { KRW?: number } };
    return j.rates?.KRW ?? null;
  } catch {
    return null;
  }
}

// 현재 USD/KRW. 실패 시 마지막 캐시 or null.
export async function currentFx(): Promise<number | null> {
  if (cur && Date.now() - cur.at < CUR_TTL) return cur.rate;
  const r = await fetchRate("https://api.frankfurter.app/latest?from=USD&to=KRW");
  if (r != null) cur = { rate: r, at: Date.now() };
  return cur?.rate ?? null;
}

// 특정 날짜의 USD/KRW(가장 가까운 직전 영업일). 오늘 이후면 현재값.
export async function fxOn(date: string): Promise<number | null> {
  if (date >= today()) return currentFx();
  if (histCache.has(date)) return histCache.get(date)!;
  const r = await fetchRate(`https://api.frankfurter.app/${date}?from=USD&to=KRW`);
  if (r != null) histCache.set(date, r);
  return r;
}
