"use client";

import { useId } from "react";
import type { PriceBar } from "@/lib/api";

type Marker = { date: string; label?: string };

const money = (v: number, overseas: boolean) =>
  overseas ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `${Math.round(v).toLocaleString()}원`;
const shortDate = (d: string) => (d.length >= 10 ? d.slice(5).replace("-", ".") : d);

// 자체 SVG 라인차트. 최고/최저를 그 지점(날짜)에 마커+금액으로 표시. 참고용.
export function PriceChart({
  bars,
  markers = [],
  height = 160,
  positive,
  overseas = false,
}: {
  bars: PriceBar[];
  markers?: Marker[];
  height?: number;
  positive?: boolean;
  overseas?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  if (bars.length < 2) {
    return <div className="flex h-32 items-center justify-center text-sm text-ink-muted">표시할 시세가 아직 없어요.</div>;
  }
  const W = 640;
  const H = height;
  const pad = { t: 6, r: 8, b: 6, l: 8 };
  const closes = bars.map((b) => b.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (i / (bars.length - 1)) * iw;
  const y = (v: number) => pad.t + (1 - (v - min) / span) * ih;
  // 백분율(HTML 오버레이 위치용)
  const xPct = (i: number) => (x(i) / W) * 100;
  const yPct = (v: number) => (y(v) / H) * 100;

  const first = bars[0].close;
  const last = bars[bars.length - 1].close;
  const up = positive ?? last >= first;
  const stroke = up ? "#16a34a" : "#dc2626";
  const pct = first > 0 ? ((last - first) / first) * 100 : 0;

  const maxIdx = closes.indexOf(max);
  const minIdx = closes.indexOf(min);

  const line = bars.map((b, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(b.close).toFixed(1)}`).join(" ");
  const area = `${line} L${x(bars.length - 1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${x(0).toFixed(1)},${(pad.t + ih).toFixed(1)} Z`;

  const idxByDate = (d: string) => {
    let best = -1;
    for (let i = 0; i < bars.length; i++) if (bars[i].date >= d) { best = i; break; }
    return best;
  };

  // 지점 라벨(최고/최저): 화면 안에 들어오게 좌우 정렬 조정
  const anchor = (i: number) => (xPct(i) > 70 ? "right-0 text-right" : xPct(i) < 30 ? "left-0 text-left" : "-translate-x-1/2 text-center");

  return (
    <div className="w-full">
      <div className="mb-1 text-center text-[11px]">
        <span className={up ? "text-emerald-600" : "text-red-600"}>
          현재 <b>{money(last, overseas)}</b> ({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)
        </span>
      </div>

      <div className="relative w-full" style={{ height }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none" role="img" aria-label="주가 차트">
          <defs>
            <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#g${uid})`} />
          <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {markers.map((m, k) => {
            const i = idxByDate(m.date);
            if (i < 0) return null;
            return <line key={k} x1={x(i)} y1={pad.t} x2={x(i)} y2={pad.t + ih} stroke="#6b7280" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />;
          })}
        </svg>

        {/* HTML 오버레이: 최고/최저/현재 점 + 금액·날짜 */}
        <div className="pointer-events-none absolute inset-0">
          {/* 최고 */}
          <div className="absolute" style={{ left: `${xPct(maxIdx)}%`, top: `${yPct(max)}%` }}>
            <div className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-500" />
            <div className={`absolute bottom-1 whitespace-nowrap text-[10px] font-semibold text-red-600 ${anchor(maxIdx)}`}>
              최고 {money(max, overseas)}<span className="ml-0.5 font-normal text-ink-muted">{shortDate(bars[maxIdx].date)}</span>
            </div>
          </div>
          {/* 최저 */}
          <div className="absolute" style={{ left: `${xPct(minIdx)}%`, top: `${yPct(min)}%` }}>
            <div className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-500" />
            <div className={`absolute top-1 whitespace-nowrap text-[10px] font-semibold text-blue-600 ${anchor(minIdx)}`}>
              최저 {money(min, overseas)}<span className="ml-0.5 font-normal text-ink-muted">{shortDate(bars[minIdx].date)}</span>
            </div>
          </div>
          {/* 현재(마지막) */}
          <div className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: `${xPct(bars.length - 1)}%`, top: `${yPct(last)}%`, backgroundColor: stroke }} />
        </div>
      </div>

      <div className="mt-0.5 flex justify-between text-[10px] text-ink-muted">
        <span>{bars[0].date}</span>
        <span>{bars[bars.length - 1].date}</span>
      </div>
    </div>
  );
}
