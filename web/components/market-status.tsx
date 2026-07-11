"use client";

import { useEffect, useState } from "react";

// 장 상태 위젯: 국내(KRX)·미국(NYSE/NASDAQ) 정규/장전/장후/마감 실시간.
// 브라우저 시계 + 타임존 기반(서버 호출 없음). 공휴일은 반영 안 됨(참고용).

type Sess = { label: string; dot: string };
const REGULAR: Sess = { label: "정규", dot: "bg-emerald-500" };
const PRE: Sess = { label: "장전", dot: "bg-amber-500" };
const POST: Sess = { label: "장후", dot: "bg-amber-500" };
const CLOSED: Sess = { label: "마감", dot: "bg-ink/25" };

function tzParts(tz: string, now: Date) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  const minute = Number(get("minute"));
  const wd = get("weekday");
  return { minutes: hour * 60 + minute, weekend: wd === "Sat" || wd === "Sun", hhmm: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
}

// 국내: 장전 08:00~09:00 · 정규 09:00~15:30 · 장후(시간외) 15:30~18:00
function krxSession(now: Date): Sess {
  const { minutes, weekend } = tzParts("Asia/Seoul", now);
  if (weekend) return CLOSED;
  if (minutes >= 480 && minutes < 540) return PRE;
  if (minutes >= 540 && minutes < 930) return REGULAR;
  if (minutes >= 930 && minutes < 1080) return POST;
  return CLOSED;
}
// 미국(ET): 장전 04:00~09:30 · 정규 09:30~16:00 · 장후 16:00~20:00
function usSession(now: Date): Sess {
  const { minutes, weekend } = tzParts("America/New_York", now);
  if (weekend) return CLOSED;
  if (minutes >= 240 && minutes < 570) return PRE;
  if (minutes >= 570 && minutes < 960) return REGULAR;
  if (minutes >= 960 && minutes < 1200) return POST;
  return CLOSED;
}
function usDst(now: Date): boolean {
  const n = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "short" }).formatToParts(now).find((p) => p.type === "timeZoneName")?.value;
  return n === "EDT"; // EDT=써머타임, EST=일반
}

function Row({ label, sess, time, hours, extra }: { label: string; sess: Sess; time: string; hours: string; extra?: string }) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span className={`h-1.5 w-1.5 rounded-full ${sess.dot}`} />
      <span className="font-semibold text-ink">{label}</span>
      <span className="text-ink-muted">{sess.label}</span>
      <span className="tabular-nums text-ink-sub">현재 {time}</span>
      <span className="tabular-nums text-ink-muted">· 장 {hours}</span>
      {extra && <span className="text-ink-muted">· {extra}</span>}
    </div>
  );
}

export function MarketStatus() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2 text-[11px] shadow-card">
      <Row label="국내" sess={krxSession(now)} time={tzParts("Asia/Seoul", now).hhmm} hours="09:00~15:30" />
      <Row label="미국" sess={usSession(now)} time={tzParts("America/New_York", now).hhmm} hours="09:30~16:00" extra={usDst(now) ? "써머타임" : "일반"} />
    </div>
  );
}
