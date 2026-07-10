import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../env.js";

// 한국투자증권 KIS Developers 시세 클라이언트. 읽기 전용(주문 없음).
// 토큰은 24h 유효 + 발급 유량제한이 있어 메모리+파일로 캐시(개발 재시작 대비).

export type Bar = {
  date: string; // YYYY-MM-DD
  close: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
};

export type Quote = {
  price: number; // 현재가
  changeRate: number | null; // 전일 대비 등락률(%)
  currency: string; // KRW | USD ...
};

export const kisEnabled = (): boolean => !!(env.kisAppKey && env.kisAppSecret);

const TOKEN_FILE = path.join(env.uploadDir, ".kis-token.json");
let mem: { token: string; expiresAt: number } | null = null;

async function loadTokenFromFile(): Promise<void> {
  if (mem) return;
  try {
    const raw = await readFile(TOKEN_FILE, "utf8");
    const j = JSON.parse(raw) as { token: string; expiresAt: number };
    if (j.token && j.expiresAt > Date.now()) mem = j;
  } catch {
    /* 없음 */
  }
}

async function getToken(): Promise<string> {
  await loadTokenFromFile();
  if (mem && mem.expiresAt > Date.now() + 60_000) return mem.token;

  const res = await fetch(`${env.kisBaseUrl}/oauth2/tokenP`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: env.kisAppKey, appsecret: env.kisAppSecret }),
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!j.access_token) throw new Error(`KIS 토큰 발급 실패: ${j.error_description ?? res.status}`);
  // expires_in(초) 보수적으로 사용. 실패 시 12h.
  const ttl = (j.expires_in ?? 43200) * 1000;
  mem = { token: j.access_token, expiresAt: Date.now() + ttl };
  writeFile(TOKEN_FILE, JSON.stringify(mem)).catch(() => {});
  return mem.token;
}

async function kisGet(pathname: string, trId: string, params: Record<string, string>): Promise<any> {
  const token = await getToken();
  const qs = new URLSearchParams(params);
  const res = await fetch(`${env.kisBaseUrl}${pathname}?${qs}`, {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: env.kisAppKey,
      appsecret: env.kisAppSecret,
      tr_id: trId,
      custtype: "P",
    },
  });
  const j = (await res.json()) as any;
  if (j.rt_cd && j.rt_cd !== "0") throw new Error(`KIS ${trId} 오류: ${j.msg1 ?? j.rt_cd}`);
  return j;
}

const yyyymmdd = (d: string) => d.replace(/-/g, "");
const toDate = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const num = (s: unknown): number | null => {
  if (s === undefined || s === null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// 국내 기간별 시세(일 D / 월 M / 년 Y). code=단축코드. 최근 100건 제한 → 필요 구간만 요청.
export async function domesticBars(code: string, period: "D" | "M" | "Y", from: string, to: string): Promise<Bar[]> {
  const j = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice", "FHKST03010100", {
    FID_COND_MRKT_DIV_CODE: "J",
    FID_INPUT_ISCD: code,
    FID_INPUT_DATE_1: yyyymmdd(from),
    FID_INPUT_DATE_2: yyyymmdd(to),
    FID_PERIOD_DIV_CODE: period,
    FID_ORG_ADJ_PRC: "0",
  });
  const rows: any[] = j.output2 ?? [];
  return rows
    .filter((r) => r.stck_bsop_date && r.stck_clpr)
    .map((r) => ({
      date: toDate(r.stck_bsop_date),
      close: Number(r.stck_clpr),
      open: num(r.stck_oprc),
      high: num(r.stck_hgpr),
      low: num(r.stck_lwpr),
      volume: num(r.acml_vol),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// 해외 기간별 시세(일 0 / 주 1 / 월 2). excd=거래소(NAS/NYS/AMS...), symb=티커.
export async function overseasBars(excd: string, symb: string, period: "D" | "M", to: string): Promise<Bar[]> {
  const gubn = period === "M" ? "2" : "0";
  const j = await kisGet("/uapi/overseas-price/v1/quotations/dailyprice", "HHDFS76240000", {
    AUTH: "",
    EXCD: excd,
    SYMB: symb,
    GUBN: gubn,
    BYMD: yyyymmdd(to),
    MODP: "1",
  });
  const rows: any[] = j.output2 ?? [];
  return rows
    .filter((r) => r.xymd && r.clos)
    .map((r) => ({
      date: toDate(r.xymd),
      close: Number(r.clos),
      open: num(r.open),
      high: num(r.high),
      low: num(r.low),
      volume: num(r.tvol),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// 국내 현재가
export async function domesticQuote(code: string): Promise<Quote> {
  const j = await kisGet("/uapi/domestic-stock/v1/quotations/inquire-price", "FHKST01010100", {
    FID_COND_MRKT_DIV_CODE: "J",
    FID_INPUT_ISCD: code,
  });
  const o = j.output ?? {};
  return { price: Number(o.stck_prpr), changeRate: num(o.prdy_ctrt), currency: "KRW" };
}

// 해외 현재체결가
export async function overseasQuote(excd: string, symb: string): Promise<Quote> {
  const j = await kisGet("/uapi/overseas-price/v1/quotations/price", "HHDFS00000300", {
    AUTH: "",
    EXCD: excd,
    SYMB: symb,
  });
  const o = j.output ?? {};
  return { price: Number(o.last), changeRate: num(o.rate), currency: "USD" };
}
