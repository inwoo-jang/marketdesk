"use client";

import { useEffect, useRef, useState } from "react";
import { api, type SecurityLite, type StockSummary } from "@/lib/api";

// 검색형 종목 선택기(100+ 종목 대비). 내 종목 우선 + 전체 검색. 칩 벽 대신 리스트.
export function StockPicker({ onPick, autoFocus, placeholder }: { onPick: (s: SecurityLite) => void; autoFocus?: boolean; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [mine, setMine] = useState<StockSummary[]>([]);
  const [results, setResults] = useState<SecurityLite[]>([]);
  const [open, setOpen] = useState(false); // 포커스 시에만 드롭다운
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { api.myStocks(false).then((r) => setMine(r.items)).catch(() => {}); }, []);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 1) { setResults([]); return; }
    timer.current = setTimeout(() => api.stockSearch(q.trim()).then((r) => setResults(r.results)).catch(() => setResults([])), 200);
  }, [q]);

  const nq = q.trim().toLowerCase();
  // 내 종목: 검색어 있으면 필터, 없으면 책갈피 우선 상위 8개(myStocks 는 책갈피 우선 정렬됨)
  const myFiltered = nq
    ? mine.filter((m) => m.security.name.toLowerCase().includes(nq) || m.security.code.toLowerCase().includes(nq)).slice(0, 20)
    : mine.slice(0, 8);
  const myIds = new Set(myFiltered.map((m) => m.security.id));
  const others = results.filter((r) => !myIds.has(r.id));

  return (
    <div className="relative">
      <input
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? "종목 검색 (내 종목 우선)"}
        className="w-full rounded-lg border border-line bg-bg-deep/30 px-3 py-2 text-sm outline-none focus:border-primary"
      />
      {open && (
      <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-line bg-card shadow-card">
        {myFiltered.length > 0 && <p className="bg-bg-deep/40 px-3 py-1 text-[10px] font-semibold text-ink-muted">내 종목</p>}
        {myFiltered.map((m) => (
          <button key={m.security.id} onClick={() => onPick(m.security)} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-bg-deep">
            <span className="flex items-center gap-1 font-medium text-ink">
              {m.bookmarked && <span className="text-primary">★</span>}
              {m.security.name}
            </span>
            <span className="text-xs text-ink-muted">{m.security.code} · {m.security.market}</span>
          </button>
        ))}
        {nq && others.length > 0 && <p className="bg-bg-deep/40 px-3 py-1 text-[10px] font-semibold text-ink-muted">전체</p>}
        {nq && others.map((r) => (
          <button key={r.id} onClick={() => onPick(r)} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-bg-deep">
            <span className="font-medium text-ink">{r.name}</span>
            <span className="text-xs text-ink-muted">{r.code} · {r.market}</span>
          </button>
        ))}
        {nq && myFiltered.length === 0 && others.length === 0 && <p className="px-3 py-4 text-center text-sm text-ink-muted">검색 결과가 없어요.</p>}
        {!nq && myFiltered.length === 0 && <p className="px-3 py-4 text-center text-sm text-ink-muted">위에 종목명을 입력해 검색하세요.</p>}
      </div>
      )}
    </div>
  );
}
