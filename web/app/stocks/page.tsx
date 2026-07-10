"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type StockSummary, type SecurityLite, type DiaryItem, type StockDetail, type NoteCategory, type PriceBar } from "@/lib/api";
import { stockMenuLabel } from "@/components/app-nav";
import { PriceChart } from "@/components/price-chart";

const fmtMoney = (v: number | null | undefined, overseas: boolean | null | undefined) => {
  if (v == null) return "-";
  return overseas ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `${Math.round(v).toLocaleString()}원`;
};
const fmtPct = (v: number | null) => (v == null ? "-" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

export default function StocksPage() {
  const [tab, setTab] = useState<"info" | "sim" | "diary">("info");
  const [label, setLabel] = useState("내 종목");
  const [showInvest, setShowInvest] = useState(true);

  useEffect(() => {
    api.myLenses().then(({ enabled }) => {
      setLabel(stockMenuLabel(enabled));
      setShowInvest(enabled.includes("invest") || !enabled.includes("job"));
    }).catch(() => {});
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-bold">{label}</h1>

      <div className="mt-4 flex gap-1 border-b border-line">
        <TabBtn active={tab === "info"} onClick={() => setTab("info")}>종목 정보</TabBtn>
        <TabBtn active={tab === "sim"} onClick={() => setTab("sim")}>모의 종목</TabBtn>
        <TabBtn active={tab === "diary"} onClick={() => setTab("diary")}>다이어리</TabBtn>
      </div>

      {tab === "info" && <InfoTab key="info" showInvest={showInvest} simulated={false} />}
      {tab === "sim" && <InfoTab key="sim" showInvest simulated />}
      {tab === "diary" && <DiaryTab />}
    </main>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${active ? "border-primary text-primary" : "border-transparent text-ink-muted hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

// ─── 종목 정보(실제) / 모의 종목 탭: 목록 + 손익 요약 ───
function InfoTab({ showInvest, simulated }: { showInvest: boolean; simulated: boolean }) {
  const [items, setItems] = useState<StockSummary[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [sort, setSort] = useState<"recent" | "pnl">("recent");
  const load = () => api.myStocks(simulated).then((r) => setItems(r.items)).catch(() => setItems([]));
  useEffect(() => { load(); }, [simulated]);

  const sorted = useMemo(() => {
    if (!items) return [];
    const arr = [...items];
    if (sort === "pnl") arr.sort((a, b) => (b.pnlPct ?? -Infinity) - (a.pnlPct ?? -Infinity));
    return arr;
  }, [items, sort]);

  const totals = useMemo(() => {
    const withPos = (items ?? []).filter((i) => !i.watchOnly && i.marketValue != null);
    const cost = withPos.reduce((s, i) => s + i.totalCost, 0);
    const value = withPos.reduce((s, i) => s + (i.marketValue ?? 0), 0);
    const pnl = value - cost;
    return { cost, value, pnl, pct: cost > 0 ? (pnl / cost) * 100 : null, count: withPos.length };
  }, [items]);

  return (
    <>
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setSort("recent")} className={sort === "recent" ? "font-semibold text-primary" : "text-ink-muted"}>최근순</button>
          <span className="text-ink-muted">·</span>
          <button onClick={() => setSort("pnl")} className={sort === "pnl" ? "font-semibold text-primary" : "text-ink-muted"}>수익률순</button>
        </div>
        <button onClick={() => setAdding(true)} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90">+ 종목 추가</button>
      </div>

      {showInvest && totals.count > 0 && (
        <section className="mt-4 rounded-card bg-card p-5 shadow-card">
          <p className="text-xs font-semibold text-ink-muted">{simulated ? "모의 포트폴리오" : "내 포트폴리오"}</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span className={`text-xl font-extrabold ${totals.pnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {totals.pnl >= 0 ? "+" : ""}{Math.round(totals.pnl).toLocaleString()}원
            </span>
            <span className={`text-sm font-semibold ${(totals.pct ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtPct(totals.pct)}</span>
            <span className="text-xs text-ink-muted">평가액 {Math.round(totals.value).toLocaleString()}원 · 원금 {Math.round(totals.cost).toLocaleString()}원</span>
          </div>
          <p className="mt-2 text-[11px] text-ink-muted">{simulated ? "참고용 모의 기록이에요. 실제 투자 권유가 아닙니다." : "직접 입력한 실제 보유 기록이에요."}</p>
        </section>
      )}

      <div className="mt-3 space-y-2">
        {items == null && <p className="text-ink-muted">불러오는 중...</p>}
        {items != null && items.length === 0 && (
          <div className="rounded-card border border-dashed border-line p-10 text-center text-ink-muted">
            아직 등록한 종목이 없어요. <b className="text-ink">+ 종목 추가</b>로 시작해 보세요.
          </div>
        )}
        {sorted.map((it) => (
          <Link
            key={it.security.id}
            href={`/stocks/${it.security.id}`}
            className="flex items-center justify-between rounded-card bg-card p-4 shadow-card hover:bg-bg-deep/40"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {simulated ? (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-violet-400" title="모의 종목" />
                ) : !it.watchOnly ? (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" title="보유 종목" />
                ) : null}
                <span className="truncate font-semibold text-ink">{it.security.name}</span>
                <span className="shrink-0 rounded bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">{it.security.market}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
                <span>{fmtMoney(it.close, it.security.isOverseas)}</span>
                {it.changeRate != null && (
                  <span className={`font-medium ${it.changeRate >= 0 ? "text-emerald-600" : "text-red-600"}`}>전일 {fmtPct(it.changeRate)}</span>
                )}
                {!it.watchOnly && it.avgBuy != null && <span>· 평단 {fmtMoney(it.avgBuy, it.security.isOverseas)} · {it.totalShares}주</span>}
              </div>
            </div>
            {!it.watchOnly && showInvest && it.pnlPct != null && (
              <div className="shrink-0 text-right">
                <div className="text-[10px] text-ink-muted">{simulated ? "모의 수익률" : "수익률"}</div>
                <div className={`text-sm font-bold ${it.pnlPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtPct(it.pnlPct)}</div>
                <div className={`text-xs ${(it.pnl ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {(it.pnl ?? 0) >= 0 ? "+" : ""}{Math.round(it.pnl ?? 0).toLocaleString()}원
                </div>
              </div>
            )}
          </Link>
        ))}
      </div>

      {adding && <AddStockModal invest={showInvest} simulated={simulated} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </>
  );
}

// 다이어리 카테고리 6종: 매수·매도(거래) + 상승·하락·유지·메모(기록)
type DiaryCat = "buy" | "sell" | NoteCategory;
const DIARY_CATS: { key: DiaryCat; label: string; chip: string }[] = [
  { key: "buy", label: "매수", chip: "bg-emerald-100 text-emerald-700" },
  { key: "sell", label: "매도", chip: "bg-rose-100 text-rose-700" },
  { key: "up", label: "상승", chip: "bg-emerald-100 text-emerald-700" },
  { key: "down", label: "하락", chip: "bg-red-100 text-red-700" },
  { key: "hold", label: "유지", chip: "bg-slate-100 text-slate-600" },
  { key: "memo", label: "메모", chip: "bg-ink/5 text-ink-muted" },
];
const NOTE_CATS = DIARY_CATS.filter((c) => c.key !== "buy" && c.key !== "sell");
const catOf = (k?: NoteCategory | null) => DIARY_CATS.find((c) => c.key === k);

// ─── 다이어리 탭: 매수/매도/상승/하락/유지/메모 + AI, 전 종목 시간순 ───
function DiaryTab() {
  const [items, setItems] = useState<DiaryItem[] | null>(null);
  const load = () => api.stockDiary().then((r) => setItems(r.items)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  const groups = useMemo(() => {
    const m = new Map<string, DiaryItem[]>();
    for (const it of items ?? []) {
      if (!m.has(it.date)) m.set(it.date, []);
      m.get(it.date)!.push(it);
    }
    return [...m.entries()];
  }, [items]);

  return (
    <>
      <DiaryComposer onDone={load} />
      {items == null && <p className="mt-4 text-ink-muted">불러오는 중...</p>}
      {items != null && items.length === 0 && (
        <div className="mt-4 rounded-card border border-dashed border-line p-10 text-center text-ink-muted">
          아직 기록이 없어요. 위에서 매수·매도나 오늘의 메모를 남겨보세요.
        </div>
      )}
      <div className="mt-5 space-y-5">
        {groups.map(([date, evs]) => (
          <div key={date} className="relative pl-5">
            <div className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-primary" />
            <div className="absolute bottom-0 left-[3px] top-4 w-px bg-line" />
            <p className="text-xs font-semibold text-ink-muted">{date}</p>
            <div className="mt-2 space-y-2">
              {evs.map((e) => {
                const cat = catOf(e.category);
                return (
                  <Link key={e.kind + e.id} href={e.securityId ? `/stocks/${e.securityId}` : "#"} className="block rounded-card bg-card p-3 shadow-card hover:bg-bg-deep/40">
                    <div className="flex items-center gap-2">
                      {e.kind === "buy" && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">매수</span>}
                      {e.kind === "sell" && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">매도</span>}
                      {e.kind === "note" && cat && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cat.chip}`}>{cat.label}</span>}
                      {e.kind === "note" && !cat && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">메모</span>}
                      {e.kind !== "note" && e.simulated && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">모의</span>}
                      <span className="font-semibold text-ink">{e.name ?? "종목"}</span>
                      {e.market && <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] text-ink-muted">{e.market}</span>}
                    </div>
                    {e.kind !== "note" ? (
                      <>
                        <p className="mt-1 text-sm text-ink-sub">{e.shares}주 · {fmtMoney(e.buyPrice, e.isOverseas)}</p>
                        {e.reason && <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{e.reason}</p>}
                      </>
                    ) : (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{e.body}</p>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function DiaryComposer({ onDone }: { onDone: () => void }) {
  const [mine, setMine] = useState<StockSummary[]>([]);
  const [cat, setCat] = useState<DiaryCat>("buy");
  const [picked, setPicked] = useState<SecurityLite | null>(null);
  const [holding, setHolding] = useState<StockDetail | null>(null);
  const [bars, setBars] = useState<PriceBar[]>([]);
  const [period, setPeriod] = useState<"Y" | "M" | "D">("M");
  const [real, setReal] = useState(true); // 실제/모의
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SecurityLite[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [text, setText] = useState("");
  const [ai, setAi] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isTrade = cat === "buy" || cat === "sell";

  useEffect(() => { api.myStocks().then((r) => setMine(r.items)).catch(() => {}); }, []);
  useEffect(() => {
    if (picked) return;
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 1) { setResults([]); return; }
    timer.current = setTimeout(() => api.stockSearch(q.trim()).then((r) => setResults(r.results)).catch(() => setResults([])), 200);
  }, [q, picked]);
  useEffect(() => {
    if (!picked) return;
    api.stockSeries(picked.id, period).then((r) => setBars(r.bars)).catch(() => setBars([]));
  }, [picked, period]);

  function pick(s: SecurityLite) {
    setPicked(s); setResults([]); setAi(null); setCat("buy");
    api.stockDetail(s.id).then(setHolding).catch(() => setHolding(null));
  }
  function reset() {
    setPicked(null); setHolding(null); setBars([]); setQ(""); setShares(""); setPrice(""); setText(""); setAi(null);
  }
  async function runAi() {
    if (!picked) return;
    setAiBusy(true);
    const r = await api.analyzeStock(picked.id).catch(() => ({ analysis: "분석을 가져오지 못했어요." }));
    setAi(r.analysis);
    setAiBusy(false);
  }
  async function save() {
    if (!picked) return;
    setBusy(true);
    try {
      if (isTrade) {
        const sh = Number(shares);
        if (!sh || sh <= 0) { setBusy(false); return; }
        await api.addPosition({ securityId: picked.id, side: cat as "buy" | "sell", simulated: !real, buyDate: date, shares: sh, buyPrice: price ? Number(price) : undefined, reason: text.trim() || undefined });
      } else {
        if (!text.trim()) { setBusy(false); return; }
        await api.addStockNote(picked.id, { noteDate: date, body: text.trim(), category: cat as NoteCategory });
      }
      reset();
      onDone();
    } catch { /* noop */ }
    setBusy(false);
  }

  const overseas = holding?.security.isOverseas ?? false;
  const held = holding?.summary;
  const markers = (holding?.positions ?? []).map((p) => ({ date: p.buyDate }));

  return (
    <section className="mt-4 rounded-card bg-card p-4 shadow-card">
      {!picked ? (
        <>
          {/* 내 종목 우선 선택 */}
          {mine.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-ink-muted">내 종목에서</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {mine.map((m) => (
                  <button
                    key={m.security.id}
                    onClick={() => pick(m.security)}
                    className="rounded-full border border-line bg-bg-deep/30 px-3 py-1 text-sm font-medium text-ink hover:border-primary hover:text-primary"
                  >
                    {m.security.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* 그 외 검색 */}
          <div className="relative mt-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="그 외 종목 검색" className="w-full rounded-lg border border-line bg-bg-deep/30 px-3 py-2 text-sm outline-none focus:border-primary" />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-line bg-card shadow-card">
                {results.map((r) => (
                  <button key={r.id} onClick={() => pick(r)} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-bg-deep">
                    <span className="font-medium text-ink">{r.name}</span>
                    <span className="text-xs text-ink-muted">{r.code} · {r.market}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-lg bg-bg-deep/40 px-3 py-2">
            <div>
              <span className="font-semibold text-ink">{picked.name}</span>
              {held && !held.watchOnly && (
                <span className="ml-2 text-xs text-ink-muted">보유 {held.totalShares}주 · 평단 {fmtMoney(held.avgBuy, overseas)}</span>
              )}
            </div>
            <button onClick={reset} className="text-xs text-ink-muted hover:text-ink">변경</button>
          </div>

          {/* 그 종목의 주가 흐름 - 연/월/일 */}
          {bars.length > 1 && (
            <div className="mt-2 rounded-lg border border-line bg-bg-deep/20 p-2">
              <div className="mb-1 flex justify-end gap-1 text-[11px]">
                {(["Y", "M", "D"] as const).map((p) => (
                  <button key={p} onClick={() => setPeriod(p)} className={`rounded px-1.5 py-0.5 ${period === p ? "bg-primary/10 font-semibold text-primary" : "text-ink-muted"}`}>{p === "Y" ? "연" : p === "M" ? "월" : "일"}</button>
                ))}
              </div>
              <PriceChart bars={bars} markers={markers} height={110} />
            </div>
          )}

          {/* 거래 / 기록 버튼 분리 */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-ink-muted">거래</span>
              <button onClick={() => setCat("buy")} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${cat === "buy" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>매수</button>
              <button onClick={() => setCat("sell")} className={`rounded-lg px-3 py-1.5 text-sm font-bold ${cat === "sell" ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-700 hover:bg-rose-100"}`}>매도</button>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-ink-muted">기록</span>
              {NOTE_CATS.map((c) => (
                <button key={c.key} onClick={() => setCat(c.key)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${cat === c.key ? c.chip : "text-ink-muted hover:bg-bg-deep"}`}>{c.label}</button>
              ))}
            </div>
          </div>

          {isTrade ? (
            <div className="mt-3 space-y-2">
              {/* 실제/모의 구분 */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-ink-muted">기록 대상</span>
                <button onClick={() => setReal(true)} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${real ? "bg-primary/10 text-primary" : "text-ink-muted hover:bg-bg-deep"}`}>실제 보유</button>
                <button onClick={() => setReal(false)} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${!real ? "bg-violet-100 text-violet-700" : "text-ink-muted hover:bg-bg-deep"}`}>모의</button>
              </div>
              <div className="flex flex-wrap gap-2">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-line bg-bg-deep/30 px-2 py-1.5 text-xs outline-none focus:border-primary" />
                <input type="number" min="0" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="주수" className="w-20 rounded-lg border border-line bg-bg-deep/30 px-2 py-1.5 text-xs outline-none focus:border-primary" />
                <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={`${cat === "buy" ? "매수" : "매도"}가(자동)`} className="w-28 rounded-lg border border-line bg-bg-deep/30 px-2 py-1.5 text-xs outline-none focus:border-primary" />
              </div>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={`${cat === "buy" ? "매수" : "매도"} 이유 (선택)`} className="w-full resize-none rounded-lg border border-line bg-bg-deep/30 px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-line bg-bg-deep/30 px-2 py-1.5 text-xs outline-none focus:border-primary" />
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="왜 오른/내린 것 같은지, 오늘 배운 것" className="flex-1 resize-none rounded-lg border border-line bg-bg-deep/30 px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
          )}

          <div className="mt-2 flex items-center justify-between">
            <button onClick={runAi} disabled={aiBusy} className="text-xs font-semibold text-primary hover:text-primary/70 disabled:opacity-50">
              {aiBusy ? "AI 분석 중..." : "AI 등락 요인 도움받기"}
            </button>
            <button onClick={save} disabled={busy} className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">
              {cat === "buy" ? "매수 기록" : cat === "sell" ? "매도 기록" : "기록"}
            </button>
          </div>
          {ai && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-bg-deep/40 p-2 text-xs text-ink-sub">{ai}</p>}
        </>
      )}
    </section>
  );
}

// ─── 종목 추가 모달: 검색 + 한/영 브라우즈 ───
const KO_TABS = "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ".split("");
const EN_TABS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function AddStockModal({ invest, simulated, onClose, onDone }: { invest: boolean; simulated: boolean; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SecurityLite[]>([]);
  const [mine, setMine] = useState<SecurityLite[]>([]);
  const [hangul, setHangul] = useState(true); // 한/영 토글
  const [group, setGroup] = useState("ㄱ");
  const [browse, setBrowse] = useState<SecurityLite[]>([]);
  const [picked, setPicked] = useState<SecurityLite | null>(null);
  const [mode, setMode] = useState<"watch" | "buy" | "sell">("buy");
  const [buyDate, setBuyDate] = useState(new Date().toISOString().slice(0, 10));
  const [shares, setShares] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searching = q.trim().length >= 1;

  useEffect(() => {
    if (picked || !searching) { setResults([]); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => api.stockSearch(q.trim()).then((r) => setResults(r.results)).catch(() => setResults([])), 200);
  }, [q, picked, searching]);

  useEffect(() => {
    if (picked || searching) return;
    api.stockBrowse(group).then((r) => setBrowse(r.results)).catch(() => setBrowse([]));
  }, [group, picked, searching]);

  useEffect(() => { api.myStocks(false).then((r) => setMine(r.items.map((i) => i.security))).catch(() => {}); }, []);

  async function submit() {
    if (!picked) return;
    setBusy(true); setErr("");
    try {
      if (mode === "watch") await api.watchStock(picked.id);
      else {
        const sh = Number(shares);
        if (!sh || sh <= 0) { setErr("주수를 입력해 주세요."); setBusy(false); return; }
        await api.addPosition({ securityId: picked.id, side: mode, simulated, buyDate, shares: sh, buyPrice: buyPrice ? Number(buyPrice) : undefined });
      }
      onDone();
    } catch {
      setErr("저장에 실패했어요. 잠시 후 다시 시도해 주세요."); setBusy(false);
    }
  }

  const list = searching ? results : browse;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-md rounded-card bg-card p-5 shadow-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-ink">종목 추가</h3>

        {!picked ? (
          <>
            {!searching && mine.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-ink-muted">내 종목에서</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {mine.map((s) => (
                    <button key={s.id} onClick={() => setPicked(s)} className="rounded-full border border-line bg-bg-deep/30 px-3 py-1 text-sm font-medium text-ink hover:border-primary hover:text-primary">{s.name}</button>
                  ))}
                </div>
              </div>
            )}
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="그 외 종목 검색 (예: 삼성전자)" className="mt-3 w-full rounded-lg border border-line bg-bg-deep/30 px-3 py-2 text-sm outline-none focus:border-primary" />
            {!searching && (
              <>
                <div className="mt-2 flex gap-1">
                  <button onClick={() => { setHangul(true); setGroup("ㄱ"); }} className={`rounded-md px-3 py-1 text-xs font-semibold ${hangul ? "bg-primary/10 text-primary" : "text-ink-muted hover:bg-bg-deep"}`}>한글</button>
                  <button onClick={() => { setHangul(false); setGroup("A"); }} className={`rounded-md px-3 py-1 text-xs font-semibold ${!hangul ? "bg-primary/10 text-primary" : "text-ink-muted hover:bg-bg-deep"}`}>영문</button>
                </div>
                <div className="mt-1.5 flex gap-1 overflow-x-auto pb-1">
                  {["#", ...(hangul ? KO_TABS : EN_TABS), "#"].map((g, i) => (
                    <button key={g + i} onClick={() => setGroup(g)} className={`shrink-0 rounded-md px-2 py-1 text-xs ${group === g ? "bg-primary/10 font-semibold text-primary" : "text-ink-muted hover:bg-bg-deep"}`}>{g}</button>
                  ))}
                </div>
              </>
            )}
            <div className="mt-2 max-h-72 overflow-y-auto">
              {list.map((r) => (
                <button key={r.id} onClick={() => setPicked(r)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-bg-deep">
                  <span className="font-medium text-ink">{r.name}</span>
                  <span className="text-xs text-ink-muted">{r.code} · {r.market}</span>
                </button>
              ))}
              {list.length === 0 && <p className="px-3 py-4 text-center text-sm text-ink-muted">{searching ? "검색 결과가 없어요." : "이 그룹에 종목이 없어요."}</p>}
            </div>
          </>
        ) : (
          <>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-bg-deep/40 px-3 py-2">
              <span className="font-semibold text-ink">{picked.name}</span>
              <button onClick={() => setPicked(null)} className="text-xs text-ink-muted hover:text-ink">다시 선택</button>
            </div>
            <div className="mt-3 flex gap-2">
              {!simulated && (
                <button onClick={() => setMode("watch")} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${mode === "watch" ? "border-primary bg-primary/10 text-primary" : "border-line text-ink-sub"}`}>관심만</button>
              )}
              <button onClick={() => setMode("buy")} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${mode === "buy" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-line text-ink-sub"}`}>{simulated ? "모의 매수" : "매수"}</button>
              <button onClick={() => setMode("sell")} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${mode === "sell" ? "border-rose-500 bg-rose-50 text-rose-700" : "border-line text-ink-sub"}`}>{simulated ? "모의 매도" : "매도"}</button>
            </div>
            {mode !== "watch" && (
              <div className="mt-3 space-y-2">
                <label className="block text-xs text-ink-muted">{mode === "buy" ? "매수" : "매도"}일
                  <input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-bg-deep/30 px-3 py-2 text-sm outline-none focus:border-primary" />
                </label>
                <div className="flex gap-2">
                  <label className="block flex-1 text-xs text-ink-muted">주수
                    <input type="number" min="0" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="10" className="mt-1 w-full rounded-lg border border-line bg-bg-deep/30 px-3 py-2 text-sm outline-none focus:border-primary" />
                  </label>
                  <label className="block flex-1 text-xs text-ink-muted">{mode === "buy" ? "매수" : "매도"}단가 (비우면 현재가)
                    <input type="number" min="0" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} placeholder="현재가 자동" className="mt-1 w-full rounded-lg border border-line bg-bg-deep/30 px-3 py-2 text-sm outline-none focus:border-primary" />
                  </label>
                </div>
              </div>
            )}
            {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={onClose} disabled={busy} className="flex-1 rounded-lg border border-line px-4 py-2 text-sm text-ink-sub hover:bg-bg-deep disabled:opacity-50">취소</button>
              <button onClick={submit} disabled={busy} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{busy ? "저장 중..." : "추가"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
