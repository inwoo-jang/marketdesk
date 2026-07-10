"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type SecurityLite, type PriceBar } from "@/lib/api";
import { PriceChart } from "./price-chart";

const money = (v: number | null, overseas: boolean) =>
  v == null ? "-" : overseas ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `${Math.round(v).toLocaleString()}원`;
const fmtPct = (v: number | null) => (v == null ? "" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

// 흐름보드 종목 클릭 시 인라인 주가 미니차트. 이름 → 종목 해석 후 시세 표시.
export function StockPeek({ name, onClose }: { name: string; onClose: () => void }) {
  const [sec, setSec] = useState<SecurityLite | null | undefined>(undefined); // undefined=로딩, null=못찾음
  const [bars, setBars] = useState<PriceBar[]>([]);
  const [price, setPrice] = useState<number | null>(null);
  const [changeRate, setChangeRate] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setSec(undefined); setBars([]); setPrice(null); setChangeRate(null);
    api.stockSearch(name)
      .then((r) => {
        if (!alive) return;
        const exact = r.results.find((x) => x.name === name) ?? r.results[0] ?? null;
        setSec(exact);
        if (exact) {
          api.stockDetail(exact.id).then((d) => { if (alive) { setPrice(d.quote?.price ?? null); setChangeRate(d.quote?.changeRate ?? null); } }).catch(() => {});
          api.stockSeries(exact.id, "M").then((s) => { if (alive) setBars(s.bars); }).catch(() => {});
        }
      })
      .catch(() => alive && setSec(null));
    return () => { alive = false; };
  }, [name]);

  const overseas = sec?.isOverseas ?? false;

  return (
    <div className="mt-2 rounded-card border border-primary/20 bg-card p-4 shadow-card">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink">{name}</span>
            {sec && <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] text-ink-muted">{sec.market}</span>}
          </div>
          {sec && (
            <div className="mt-0.5 flex items-baseline gap-2 text-sm">
              <span className="font-semibold text-ink">{money(price, overseas)}</span>
              {changeRate != null && <span className={changeRate >= 0 ? "text-emerald-600" : "text-red-600"}>전일 {fmtPct(changeRate)}</span>}
            </div>
          )}
        </div>
        <button onClick={onClose} className="text-xs text-ink-muted hover:text-ink">닫기</button>
      </div>

      {sec === undefined && <p className="mt-3 text-sm text-ink-muted">시세 불러오는 중...</p>}
      {sec === null && <p className="mt-3 text-sm text-ink-muted">시세 정보를 찾지 못했어요. (비상장이거나 미지원 종목)</p>}
      {sec && bars.length > 1 && (
        <div className="mt-2">
          <PriceChart bars={bars} height={120} overseas={overseas} current={price} />
        </div>
      )}
      {sec && (
        <div className="mt-2 flex gap-3 text-xs">
          <Link href={`/stocks/${sec.id}`} className="font-semibold text-primary hover:underline">내 종목에서 보기 →</Link>
          <span className="text-ink-muted">참고용 시세, 투자 권유 아님</span>
        </div>
      )}
    </div>
  );
}
