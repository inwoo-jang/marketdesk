"use client";

import { useId } from "react";
import type { PriceBar } from "@/lib/api";

type Marker = { date: string; label?: string };

const money = (v: number, overseas: boolean) =>
  overseas ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `${Math.round(v).toLocaleString()}원`;

// 자체 SVG 라인차트(외부 라이브러리 없음). 최고/현재/최저 금액 + 날짜 표시. 참고용.
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
  positive?: boolean; // 수익 색. 미지정 시 첫→끝 비교
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

  const first = bars[0].close;
  const last = bars[bars.length - 1].close;
  const up = positive ?? last >= first;
  const stroke = up ? "#16a34a" : "#dc2626"; // 상승 초록 / 하락 빨강
  const pct = first > 0 ? ((last - first) / first) * 100 : 0;

  const line = bars.map((b, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(b.close).toFixed(1)}`).join(" ");
  const area = `${line} L${x(bars.length - 1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${x(0).toFixed(1)},${(pad.t + ih).toFixed(1)} Z`;

  const idxByDate = (d: string) => {
    let best = -1;
    for (let i = 0; i < bars.length; i++) if (bars[i].date >= d) { best = i; break; }
    return best;
  };

  return (
    <div className="w-full">
      {/* 금액: 최고 / 현재(등락) / 최저 */}
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-ink-muted">최고 <b className="text-ink">{money(max, overseas)}</b></span>
        <span className={up ? "text-emerald-600" : "text-red-600"}>
          현재 <b>{money(last, overseas)}</b> ({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)
        </span>
        <span className="text-ink-muted">최저 <b className="text-ink">{money(min, overseas)}</b></span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" role="img" aria-label="주가 차트" style={{ height }}>
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
          return (
            <g key={k}>
              <line x1={x(i)} y1={pad.t} x2={x(i)} y2={pad.t + ih} stroke="#6b7280" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
              <circle cx={x(i)} cy={y(bars[i].close)} r="3.5" fill="#fff" stroke={stroke} strokeWidth="2" />
            </g>
          );
        })}
        {/* 마지막 점 강조 */}
        <circle cx={x(bars.length - 1)} cy={y(last)} r="3" fill={stroke} />
      </svg>

      {/* 날짜 범위 */}
      <div className="mt-0.5 flex justify-between text-[10px] text-ink-muted">
        <span>{bars[0].date}</span>
        <span>{bars[bars.length - 1].date}</span>
      </div>
    </div>
  );
}
