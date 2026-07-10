"use client";

import { useId } from "react";
import type { PriceBar } from "@/lib/api";

type Marker = { date: string; label?: string };

// 자체 SVG 라인차트(외부 라이브러리 없음). 매수 시점 마커 지원. 참고용.
export function PriceChart({
  bars,
  markers = [],
  height = 160,
  positive,
}: {
  bars: PriceBar[];
  markers?: Marker[];
  height?: number;
  positive?: boolean; // 수익 여부(색). 미지정 시 첫→끝 비교
}) {
  const uid = useId().replace(/:/g, "");
  if (bars.length < 2) {
    return <div className="flex h-40 items-center justify-center text-sm text-ink-muted">표시할 시세가 아직 없어요.</div>;
  }
  const W = 640;
  const H = height;
  const pad = { t: 8, r: 8, b: 18, l: 8 };
  const closes = bars.map((b) => b.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (i / (bars.length - 1)) * iw;
  const y = (v: number) => pad.t + (1 - (v - min) / span) * ih;

  const up = positive ?? bars[bars.length - 1].close >= bars[0].close;
  const stroke = up ? "#16a34a" : "#dc2626"; // 상승 초록 / 하락 빨강

  const line = bars.map((b, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(b.close).toFixed(1)}`).join(" ");
  const area = `${line} L${x(bars.length - 1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${x(0).toFixed(1)},${(pad.t + ih).toFixed(1)} Z`;

  const idxByDate = (d: string) => {
    // 마커 날짜 이상 첫 지점(가장 가까운 거래일)
    let best = -1;
    for (let i = 0; i < bars.length; i++) if (bars[i].date >= d) { best = i; break; }
    return best;
  };

  const firstDate = bars[0].date;
  const lastDate = bars[bars.length - 1].date;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" role="img" aria-label="주가 차트">
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
      <text x={pad.l} y={H - 4} className="fill-ink-muted" fontSize="10">{firstDate}</text>
      <text x={W - pad.r} y={H - 4} textAnchor="end" className="fill-ink-muted" fontSize="10">{lastDate}</text>
    </svg>
  );
}
