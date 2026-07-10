"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type StockSummary, type SecurityLite, type DiaryItem, type StockDetail, type NoteCategory, type PriceBar } from "@/lib/api";
import { stockMenuLabel } from "@/components/app-nav";
import { PriceChart } from "@/components/price-chart";
import { BookmarkIcon } from "@/components/bookmark-icon";
import { MarketStatus } from "@/components/market-status";
import { StockPicker } from "@/components/stock-picker";
import { ConfirmModal } from "@/components/confirm-modal";

const fmtMoney = (v: number | null | undefined, overseas: boolean | null | undefined) => {
  if (v == null) return "-";
  return overseas ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `${Math.round(v).toLocaleString()}원`;
};
const fmtPct = (v: number | null) => (v == null ? "-" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

type StockTab = "info" | "sim" | "diary";

export default function StocksPage() {
  const [tab, setTab] = useState<StockTab>("info");
  const [label, setLabel] = useState("내 종목");
  const [showInvest, setShowInvest] = useState(true);

  useEffect(() => {
    api.myLenses().then(({ enabled }) => {
      setLabel(stockMenuLabel(enabled));
      setShowInvest(enabled.includes("invest") || !enabled.includes("job"));
    }).catch(() => {});
  }, []);

  // 탭을 URL 에 동기화(뒤로가기 시 탭·스크롤 유지). 마운트 시 복원, 변경 시 replaceState.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "sim" || t === "diary") setTab(t);
  }, []);
  function changeTab(t: StockTab) {
    setTab(t);
    window.history.replaceState(null, "", t === "info" ? "/stocks" : `/stocks?tab=${t}`);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold">{label}</h1>
        <MarketStatus />
      </div>

      <div className="mt-4 flex gap-1 border-b border-line">
        <TabBtn active={tab === "info"} onClick={() => changeTab("info")}>종목 정보</TabBtn>
        <TabBtn active={tab === "sim"} onClick={() => changeTab("sim")}>모의 종목</TabBtn>
        <TabBtn active={tab === "diary"} onClick={() => changeTab("diary")}>다이어리</TabBtn>
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
  const [q, setQ] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [liveAt, setLiveAt] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const nowHHMMSS = () => new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const load = () => api.myStocks(simulated).then((r) => { setItems(r.items); setLiveAt(nowHHMMSS()); }).catch(() => setItems([]));
  useEffect(() => { load(); }, [simulated]);

  // 실시간 새로고침: 보유/관심 종목 현재가를 서버에서 동시 호출(제한 병렬)해 일괄 갱신.
  async function refreshLive() {
    setRefreshing(true);
    const r = await api.myStocks(simulated, true).catch(() => null);
    if (r) {
      setItems(r.items);
      setLiveAt(nowHHMMSS());
    }
    setRefreshing(false);
  }

  // 모의 종목 리셋: 모의 매매·메모 전체 삭제(실제 보유는 유지).
  async function doReset() {
    setConfirmReset(false);
    setItems(null);
    await api.resetSimStocks().catch(() => {});
    load();
  }

  function toggleBookmark(id: string, on: boolean) {
    setItems((prev) => (prev ? prev.map((i) => (i.security.id === id ? { ...i, bookmarked: on } : i)) : prev));
    api.bookmarkStock(id, on).then(load).catch(() => {});
  }

  const sorted = useMemo(() => {
    if (!items) return [];
    let arr = [...items];
    const nq = q.trim().toLowerCase();
    if (nq) arr = arr.filter((i) => i.security.name.toLowerCase().includes(nq) || i.security.code.includes(nq));
    if (sort === "pnl") arr.sort((a, b) => (b.pnlPct ?? -Infinity) - (a.pnlPct ?? -Infinity));
    return arr;
  }, [items, sort, q]);

  const totals = useMemo(() => {
    const all = (items ?? []).filter((i) => !i.watchOnly);
    const held = all.filter((i) => i.totalShares > 0 && i.marketValue != null);
    const heldCost = held.reduce((s, i) => s + i.totalCost, 0);
    const heldValue = held.reduce((s, i) => s + (i.marketValue ?? 0), 0);
    const unrealized = held.reduce((s, i) => s + (i.unrealizedPnl ?? ((i.marketValue ?? 0) - i.totalCost)), 0);
    const totalPnl = all.reduce((s, i) => s + (i.pnl ?? 0), 0); // 실현 포함
    const realizedGain = all.reduce((s, i) => s + (i.realizedGain ?? 0), 0);
    const realizedLoss = all.reduce((s, i) => s + (i.realizedLoss ?? 0), 0);
    return {
      heldCost,
      heldValue,
      unrealized,
      unrealizedPct: heldCost > 0 ? (unrealized / heldCost) * 100 : null,
      totalPnl,
      realizedGain,
      realizedLoss,
      heldCount: held.length,
      hasAny: all.length > 0,
    };
  }, [items]);

  return (
    <>
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setSort("recent")} className={sort === "recent" ? "font-semibold text-primary" : "text-ink-muted"}>최근순</button>
          <span className="text-ink-muted">·</span>
          <button onClick={() => setSort("pnl")} className={sort === "pnl" ? "font-semibold text-primary" : "text-ink-muted"}>수익률순</button>
        </div>
        <div className="flex items-center gap-2">
          {liveAt && (
            <span className="hidden text-[11px] text-ink-muted sm:inline">
              {refreshing ? "갱신 중…" : `기준 ${liveAt}`}
            </span>
          )}
          <button
            onClick={refreshLive}
            disabled={refreshing || (items?.length ?? 0) === 0}
            title="현재가 실시간 새로고침"
            aria-busy={refreshing}
            className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-sub transition-colors hover:bg-bg-deep active:bg-bg-deep/70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className={`inline-block ${refreshing ? "animate-spin" : ""}`}>↻</span>
            {refreshing ? "갱신 중" : "실시간"}
          </button>
          <button onClick={() => setAdding(true)} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 active:scale-[0.98]">+ 종목 추가</button>
        </div>
      </div>

      {(items?.length ?? 0) > 8 && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`내 종목 검색 (${items?.length ?? 0}개)`}
          className="mt-3 w-full rounded-lg border border-line bg-bg-deep/30 px-3 py-2 text-sm outline-none focus:border-primary"
        />
      )}

      {showInvest && totals.hasAny && (
        <section className="mt-4 rounded-card border border-primary/20 bg-primary/[0.04] p-5 shadow-card">
          <p className="text-xs font-semibold text-ink-muted">{simulated ? "모의 포트폴리오" : "내 포트폴리오"}</p>
          {/* 메인: 보유 평가손익 */}
          {totals.heldCount > 0 ? (
            <>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-xs text-ink-muted">보유 평가손익</span>
                <span className={`text-xl font-extrabold ${totals.unrealized >= 0 ? "text-red-600" : "text-blue-600"}`}>
                  {totals.unrealized >= 0 ? "+" : ""}{Math.round(totals.unrealized).toLocaleString()}원
                </span>
                <span className={`text-sm font-semibold ${(totals.unrealizedPct ?? 0) >= 0 ? "text-red-600" : "text-blue-600"}`}>{fmtPct(totals.unrealizedPct)}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-ink-muted">평가액 {Math.round(totals.heldValue).toLocaleString()}원 · 원금 {Math.round(totals.heldCost).toLocaleString()}원</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-sub">현재 보유 중인 종목이 없어요.</p>
          )}
          {/* 참고: 총손익 + 과거 실현 수익/손실 */}
          <div className="mt-2 border-t border-line pt-2 text-[11px] text-ink-muted">
            <span>총손익(실현 포함) </span>
            <span className={`font-semibold ${totals.totalPnl >= 0 ? "text-red-600" : "text-blue-600"}`}>{totals.totalPnl >= 0 ? "+" : ""}{Math.round(totals.totalPnl).toLocaleString()}원</span>
            {(totals.realizedGain > 0 || totals.realizedLoss < 0) && (
              <span> · 과거 실현 수익 <span className="text-red-600">+{Math.round(totals.realizedGain).toLocaleString()}원</span> · 실현 손실 <span className="text-blue-600">{Math.round(totals.realizedLoss).toLocaleString()}원</span></span>
            )}
          </div>
          <p className="mt-2 text-[11px] text-ink-muted">{simulated ? "참고용 모의 기록이에요. 실제 투자 권유가 아닙니다." : "직접 입력한 실제 보유 기록이에요."}</p>
        </section>
      )}

      {/* 모의 포트폴리오 바로 밑, 작게. 보유만 종료되고 기록은 다이어리에 남음. */}
      {simulated && (items?.length ?? 0) > 0 && (
        <div className="mt-1.5 text-right">
          <button
            onClick={() => setConfirmReset(true)}
            title="모의 보유 종료(기록은 다이어리에 남음)"
            className="text-[11px] text-ink-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-red-600 active:text-red-700"
          >
            모의 리셋
          </button>
        </div>
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
            className="relative flex items-center gap-3 rounded-card bg-card p-4 shadow-card hover:bg-bg-deep/40"
          >
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleBookmark(it.security.id, !it.bookmarked); }}
              title={it.bookmarked ? "책갈피 해제" : "책갈피"}
              className="absolute left-2 top-0"
            >
              <BookmarkIcon filled={it.bookmarked} className={`h-5 w-5 ${it.bookmarked ? "text-primary" : "text-ink-muted/40"}`} />
            </button>
            {/* 맨 앞 점: 실제 보유=파랑 · 모의 보유=연한 하늘 · 둘 다면 점 2개 · 청산=회색 · 관심=투명 */}
            <span className="flex shrink-0 items-center gap-0.5">
              {it.heldReal && <span title="실제 보유" className="h-2.5 w-2.5 rounded-full bg-blue-600" />}
              {it.heldSim && <span title="모의 보유" className="h-2.5 w-2.5 rounded-full bg-sky-300" />}
              {!it.heldReal && !it.heldSim && (
                <span
                  title={it.watchOnly ? undefined : "청산"}
                  className={`h-2.5 w-2.5 rounded-full ${it.watchOnly ? "bg-transparent" : "bg-ink/25"}`}
                />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold text-ink">{it.security.name}</span>
                <span className="shrink-0 rounded bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">{it.security.market}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
                <span>
                  {fmtMoney(it.close, it.security.isOverseas)}
                  {it.security.isOverseas && it.close != null && it.fxNow ? ` (₩${Math.round(it.close * it.fxNow).toLocaleString()})` : ""}
                </span>
                {it.changeRate != null && (
                  <span className={`font-medium ${it.changeRate >= 0 ? "text-red-600" : "text-blue-600"}`}>전일 {fmtPct(it.changeRate)}</span>
                )}
                {!it.watchOnly && it.avgBuy != null && it.totalShares > 0 && (
                  <span>
                    · 평단 {fmtMoney(it.avgBuy, it.security.isOverseas)}
                    {it.security.isOverseas && it.avgBuyKRW != null ? ` (₩${Math.round(it.avgBuyKRW).toLocaleString()})` : ""}
                    {" "}· {it.totalShares}주 · 매수 {Math.round(it.totalCost).toLocaleString()}원
                  </span>
                )}
              </div>
            </div>
            {!it.watchOnly && showInvest && it.totalShares > 0 ? (() => {
              const unreal = it.unrealizedPnl ?? ((it.marketValue ?? 0) - it.totalCost);
              const unrealPct = it.totalCost > 0 ? (unreal / it.totalCost) * 100 : null;
              return (
                <div className="shrink-0 text-right">
                  <div className="text-[10px] text-ink-muted">{simulated ? "모의 평가손익" : "평가손익"}</div>
                  <div className={`text-sm font-bold ${unreal >= 0 ? "text-red-600" : "text-blue-600"}`}>{fmtPct(unrealPct)}</div>
                  <div className={`text-xs ${unreal >= 0 ? "text-red-600" : "text-blue-600"}`}>{unreal >= 0 ? "+" : ""}{Math.round(unreal).toLocaleString()}원</div>
                </div>
              );
            })() : (!it.watchOnly && it.totalShares <= 0 ? (
              <div className="shrink-0 text-right">
                <div className="text-[10px] text-ink-muted">실현 실적</div>
                <div className={`text-sm font-bold ${(it.realizedPnl ?? 0) >= 0 ? "text-red-600" : "text-blue-600"}`}>{(it.realizedPnl ?? 0) >= 0 ? "+" : ""}{Math.round(it.realizedPnl ?? 0).toLocaleString()}원</div>
              </div>
            ) : null)}
          </Link>
        ))}
      </div>

      {adding && <AddStockModal invest={showInvest} simulated={simulated} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
      <ConfirmModal
        open={confirmReset}
        title="모의 종목을 리셋할까요?"
        message="현재 모의 보유가 모두 종료 처리돼요. 기록은 삭제되지 않고 다이어리에 '종료된 모의'로 회색으로 남아 복습할 수 있어요. 실제 보유는 그대로예요."
        confirmLabel="리셋"
        onConfirm={doReset}
        onCancel={() => setConfirmReset(false)}
      />
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
  const [filter, setFilter] = useState<"all" | "real" | "sim">("all");
  const load = () => api.stockDiary().then((r) => setItems(r.items)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  // 필터: 거래·메모 모두 실제/모의로 구분(투자일지 메모=실제, 다이어리 메모=모의).
  const filtered = useMemo(() => {
    const arr = items ?? [];
    if (filter === "all") return arr;
    return arr.filter((it) => (filter === "sim" ? it.simulated : !it.simulated));
  }, [items, filter]);

  const groups = useMemo(() => {
    const m = new Map<string, DiaryItem[]>();
    for (const it of filtered) {
      if (!m.has(it.date)) m.set(it.date, []);
      m.get(it.date)!.push(it);
    }
    return [...m.entries()];
  }, [filtered]);

  return (
    <>
      <DiaryComposer onDone={load} />
      <div className="mt-4 flex gap-1">
        {([{ k: "all", label: "전체" }, { k: "real", label: "실제" }, { k: "sim", label: "모의" }] as const).map((f) => (
          <button key={f.k} onClick={() => setFilter(f.k)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === f.k ? "bg-primary/10 text-primary" : "text-ink-muted hover:bg-bg-deep"}`}>{f.label}</button>
        ))}
      </div>
      {items == null && <p className="mt-4 text-ink-muted">불러오는 중...</p>}
      {items != null && filtered.length === 0 && (
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
              {evs.map((e) => <DiaryEntry key={e.kind + e.id} e={e} onChanged={load} />)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// 다이어리 한 항목: 보기 + 인라인 수정(거래 사유·주수·단가 / 메모 카테고리·본문).
function DiaryEntry({ e, onChanged }: { e: DiaryItem; onChanged: () => void }) {
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const isTrade = e.kind !== "note";

  async function runAi() {
    if (!e.securityId) return;
    setAiBusy(true);
    const r = await api.analyzeStock(e.securityId).catch(() => ({ analysis: "분석을 가져오지 못했어요." }));
    setAi(r.analysis);
    setAiBusy(false);
  }
  const [date, setDate] = useState(e.date);
  const [shares, setShares] = useState(e.shares != null ? String(e.shares) : "");
  const [price, setPrice] = useState(e.buyPrice != null ? String(e.buyPrice) : "");
  const [reason, setReason] = useState(e.reason ?? "");
  const [body, setBody] = useState(e.body ?? "");
  const [ncat, setNcat] = useState<NoteCategory>((e.category as NoteCategory) ?? "memo");
  const cat = catOf(e.category);

  async function save() {
    setBusy(true);
    try {
      if (isTrade) {
        const sh = Number(shares);
        if (!sh || sh <= 0) { setBusy(false); return; }
        await api.updatePosition(e.id, { buyDate: date, shares: sh, buyPrice: price ? Number(price) : null, reason: reason.trim() || null });
      } else {
        if (!body.trim()) { setBusy(false); return; }
        await api.updateStockNote(e.id, { noteDate: date, body: body.trim(), category: ncat });
      }
      setEdit(false); onChanged();
    } catch { /* noop */ }
    setBusy(false);
  }
  async function del() {
    setBusy(true);
    if (isTrade) await api.deletePosition(e.id).catch(() => {});
    else await api.deleteStockNote(e.id).catch(() => {});
    onChanged();
  }

  if (edit) {
    return (
      <div className="rounded-card border border-primary/40 bg-card p-3 shadow-card">
        <div className="text-xs font-semibold text-ink-muted">{e.name} · {isTrade ? (e.kind === "buy" ? "매수" : "매도") : "메모"} 수정</div>
        {isTrade ? (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-2">
              <input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} className="rounded-lg border border-line bg-bg-deep/30 px-2 py-1.5 text-xs" />
              <input type="number" min="0" value={shares} onChange={(ev) => setShares(ev.target.value)} placeholder="주수" className="w-20 rounded-lg border border-line bg-bg-deep/30 px-2 py-1.5 text-xs" />
              <input type="number" min="0" value={price} onChange={(ev) => setPrice(ev.target.value)} placeholder="단가" className="w-28 rounded-lg border border-line bg-bg-deep/30 px-2 py-1.5 text-xs" />
            </div>
            <textarea value={reason} onChange={(ev) => setReason(ev.target.value)} rows={2} placeholder="사유" className="w-full resize-none rounded-lg border border-line bg-bg-deep/30 px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-center gap-1">
              <input type="date" value={date} onChange={(ev) => setDate(ev.target.value)} className="rounded-lg border border-line bg-bg-deep/30 px-2 py-1.5 text-xs" />
              {NOTE_CATS.map((c) => (
                <button key={c.key} onClick={() => setNcat(c.key as NoteCategory)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${ncat === c.key ? c.chip : "text-ink-muted hover:bg-bg-deep"}`}>{c.label}</button>
              ))}
            </div>
            <textarea value={body} onChange={(ev) => setBody(ev.target.value)} rows={2} className="w-full resize-none rounded-lg border border-line bg-bg-deep/30 px-3 py-2 text-sm outline-none focus:border-primary" />
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <button onClick={save} disabled={busy} className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">저장</button>
          <button onClick={() => setEdit(false)} className="rounded-lg border border-line px-3 py-1 text-xs text-ink-sub">취소</button>
          {e.securityId && (
            <button onClick={runAi} disabled={aiBusy} className="rounded-lg px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50">
              {aiBusy ? "AI 분석 중..." : "AI 도움받기"}
            </button>
          )}
          <button onClick={del} disabled={busy} className="ml-auto rounded-lg px-3 py-1 text-xs text-ink-muted hover:text-red-600">삭제</button>
        </div>
        {ai && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-bg-deep/40 p-2 text-xs text-ink-sub">{ai}</p>}
      </div>
    );
  }

  // 종료된 모의(리셋됨): 기록은 남기되 회색으로 흐리게 구분.
  const dim = !!e.archived;
  return (
    <div className={`group flex overflow-hidden rounded-card shadow-card ${dim ? "bg-bg-deep/30" : "bg-card hover:bg-bg-deep/40"}`}>
      <div className={`flex w-6 shrink-0 items-center justify-center ${
        dim ? "bg-slate-200 text-slate-400" : e.kind === "note" ? "bg-ink/5 text-ink-muted" : e.simulated ? "bg-sky-100 text-sky-600" : "bg-blue-600 text-white"
      }`}>
        <span className="text-[11px] font-bold" style={{ writingMode: "vertical-rl" }}>{dim ? "종료" : e.kind === "note" ? "기록" : e.simulated ? "모의" : "실제"}</span>
      </div>
      <div className="flex flex-1 items-start justify-between gap-2 p-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {e.kind === "buy" && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${dim ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-700"}`}>매수</span>}
            {e.kind === "sell" && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${dim ? "bg-slate-100 text-slate-500" : "bg-rose-100 text-rose-700"}`}>매도</span>}
            {e.kind === "note" && cat && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${dim ? "bg-slate-100 text-slate-500" : cat.chip}`}>{cat.label}</span>}
            {e.securityId ? (
              <Link href={`/stocks/${e.securityId}`} className={`font-semibold hover:text-primary ${dim ? "text-ink-muted" : "text-ink"}`}>{e.name ?? "종목"}</Link>
            ) : (
              <span className={`font-semibold ${dim ? "text-ink-muted" : "text-ink"}`}>{e.name ?? "종목"}</span>
            )}
            {e.market && <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] text-ink-muted">{e.market}</span>}
            {dim && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">종료된 모의</span>}
            <button onClick={() => setEdit(true)} className="text-[11px] text-ink-muted opacity-0 group-hover:opacity-100 hover:text-primary">수정</button>
          </div>
          {isTrade ? (
            <>
              <p className="mt-1 text-xs text-ink-muted">{e.shares}주</p>
              {e.reason && <p className={`mt-0.5 whitespace-pre-wrap text-sm ${dim ? "text-ink-muted" : "text-ink"}`}>{e.reason}</p>}
            </>
          ) : (
            <p className={`mt-1 whitespace-pre-wrap text-sm ${dim ? "text-ink-muted" : "text-ink"}`}>{e.body}</p>
          )}
        </div>
        {/* 오른쪽: 구매가/현재/수익률(해외는 원화 환산) */}
        {isTrade && (() => {
          const bp = e.buyPrice ?? null;
          const cl = e.close ?? null;
          const sh = e.shares ?? 0;
          const ov = e.isOverseas ?? false;
          const fxB = ov ? (e.buyFx ?? e.fxNow ?? 1) : 1; // 매수 시점 환율
          const fxN = ov ? (e.fxNow ?? 1) : 1; // 현재 환율
          const costPer = bp != null ? bp * fxB : null; // 원화 매수 단가
          const curPer = cl != null ? cl * fxN : null; // 원화 현재가
          const pct = costPer != null && curPer != null && costPer > 0 ? ((curPer - costPer) / costPer) * 100 : null;
          const amt = costPer != null && curPer != null ? (curPer - costPer) * sh : null;
          const gain = (pct ?? 0) >= 0;
          return (
            <div className="shrink-0 text-right text-xs">
              <div className="text-ink-muted">
                {e.kind === "sell" ? "매도가" : "구매가"} <span className="text-ink">{fmtMoney(bp, ov)}</span>
                {ov && costPer != null ? <span className="text-ink-muted"> (₩{Math.round(costPer).toLocaleString()})</span> : null}
              </div>
              <div className="text-ink-muted">
                현재 <span className="text-ink">{fmtMoney(cl, ov)}</span>
                {ov && curPer != null ? <span className="text-ink-muted"> (₩{Math.round(curPer).toLocaleString()})</span> : null}
              </div>
              {pct != null && (
                <div className={`font-bold ${dim ? "text-ink-muted" : gain ? "text-red-600" : "text-blue-600"}`}>
                  {gain ? "+" : ""}{pct.toFixed(1)}% · {gain ? "+" : ""}{Math.round(amt ?? 0).toLocaleString()}원
                </div>
              )}
              {ov && <div className="text-[10px] text-ink-muted">환율 {Math.round(fxB)}→{Math.round(fxN)}</div>}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function DiaryComposer({ onDone }: { onDone: () => void }) {
  const [cat, setCat] = useState<DiaryCat>("buy");
  const [picked, setPicked] = useState<SecurityLite | null>(null);
  const [holding, setHolding] = useState<StockDetail | null>(null);
  const [bars, setBars] = useState<PriceBar[]>([]);
  const [period, setPeriod] = useState<"Y" | "M" | "D">("M");
  const [real, setReal] = useState(true); // 실제/모의
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [text, setText] = useState("");
  const [ai, setAi] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  const isTrade = cat === "buy" || cat === "sell";

  useEffect(() => {
    if (!picked) return;
    api.stockSeries(picked.id, period).then((r) => setBars(r.bars)).catch(() => setBars([]));
  }, [picked, period]);

  function pick(s: SecurityLite) {
    setPicked(s); setAi(null); setCat("buy");
    api.stockDetail(s.id).then(setHolding).catch(() => setHolding(null));
  }
  function reset() {
    setPicked(null); setHolding(null); setBars([]); setShares(""); setPrice(""); setText(""); setAi(null);
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
        // 다이어리 메모는 모의로 분류(투자일지=실제와 구분)
        await api.addStockNote(picked.id, { noteDate: date, body: text.trim(), category: cat as NoteCategory, simulated: true });
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
        <StockPicker onPick={pick} placeholder="종목 검색 (내 종목 우선)" />
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
              <PriceChart bars={bars} markers={markers} height={110} overseas={overseas} current={holding?.quote?.price} />
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
                <button onClick={() => setReal(false)} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${!real ? "bg-sky-100 text-sky-700" : "text-ink-muted hover:bg-bg-deep"}`}>모의</button>
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
  const [hangul, setHangul] = useState(true); // 한/영 토글
  const [group, setGroup] = useState("ㄱ");
  const [browse, setBrowse] = useState<SecurityLite[]>([]);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [picked, setPicked] = useState<SecurityLite | null>(null);
  const [mode, setMode] = useState<"watch" | "buy" | "sell">("buy");
  const [buyDate, setBuyDate] = useState(new Date().toISOString().slice(0, 10));
  const [shares, setShares] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (picked || !browseOpen) return;
    api.stockBrowse(group).then((r) => setBrowse(r.results)).catch(() => setBrowse([]));
  }, [group, picked, browseOpen]);

  async function submit() {
    if (!picked) return;
    setBusy(true); setErr("");
    try {
      if (mode === "watch") await api.watchStock(picked.id);
      else {
        const sh = Number(shares);
        if (!sh || sh <= 0) { setErr("주수를 입력해 주세요."); setBusy(false); return; }
        await api.addPosition({ securityId: picked.id, side: mode, simulated, buyDate, shares: sh, buyPrice: buyPrice ? Number(buyPrice) : undefined, reason: reason.trim() || undefined });
      }
      onDone();
    } catch {
      setErr("저장에 실패했어요. 잠시 후 다시 시도해 주세요."); setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-md rounded-card bg-card p-5 shadow-card" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-ink">종목 추가</h3>

        {!picked ? (
          <div className="mt-3">
            <StockPicker onPick={setPicked} autoFocus placeholder="종목 검색 (내 종목 우선)" />
            {/* 가나다·영문으로 훑어보기 */}
            <button onClick={() => setBrowseOpen((v) => !v)} className="mt-2 text-xs font-medium text-ink-muted hover:text-ink">
              {browseOpen ? "▴ 가나다·영문 접기" : "▾ 가나다·영문으로 찾기"}
            </button>
            {browseOpen && (
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
                <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-line">
                  {browse.map((r) => (
                    <button key={r.id} onClick={() => setPicked(r)} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-bg-deep">
                      <span className="font-medium text-ink">{r.name}</span>
                      <span className="text-xs text-ink-muted">{r.code} · {r.market}</span>
                    </button>
                  ))}
                  {browse.length === 0 && <p className="px-3 py-4 text-center text-sm text-ink-muted">이 그룹에 종목이 없어요.</p>}
                </div>
              </>
            )}
          </div>
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
                <label className="block text-xs text-ink-muted">{mode === "buy" ? "매수" : "매도"} 이유 (선택)
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="왜 사는지 / 파는지" className="mt-1 w-full resize-none rounded-lg border border-line bg-bg-deep/30 px-3 py-2 text-sm outline-none focus:border-primary" />
                </label>
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
