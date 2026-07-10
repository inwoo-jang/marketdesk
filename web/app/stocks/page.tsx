"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type StockSummary, type SecurityLite, type DiaryItem } from "@/lib/api";
import { stockMenuLabel } from "@/components/app-nav";

const fmtMoney = (v: number | null | undefined, overseas: boolean | null | undefined) => {
  if (v == null) return "-";
  return overseas ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `${Math.round(v).toLocaleString()}원`;
};
const fmtPct = (v: number | null) => (v == null ? "-" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

export default function StocksPage() {
  const [tab, setTab] = useState<"info" | "diary">("info");
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
        <TabBtn active={tab === "diary"} onClick={() => setTab("diary")}>모의매수 다이어리</TabBtn>
      </div>

      {tab === "info" ? <InfoTab showInvest={showInvest} /> : <DiaryTab showInvest={showInvest} />}
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

// ─── 종목 정보 탭: 관심/보유 종목 목록 + 주가 정보 ───
function InfoTab({ showInvest }: { showInvest: boolean }) {
  const [items, setItems] = useState<StockSummary[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [sort, setSort] = useState<"recent" | "pnl">("recent");
  const load = () => api.myStocks().then((r) => setItems(r.items)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

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
          <p className="text-xs font-semibold text-ink-muted">모의 포트폴리오</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span className={`text-xl font-extrabold ${totals.pnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {totals.pnl >= 0 ? "+" : ""}{Math.round(totals.pnl).toLocaleString()}원
            </span>
            <span className={`text-sm font-semibold ${(totals.pct ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtPct(totals.pct)}</span>
            <span className="text-xs text-ink-muted">평가액 {Math.round(totals.value).toLocaleString()}원 · 원금 {Math.round(totals.cost).toLocaleString()}원</span>
          </div>
          <p className="mt-2 text-[11px] text-ink-muted">참고용 모의 기록이에요. 실제 투자 권유가 아닙니다.</p>
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
          <Link key={it.security.id} href={`/stocks/${it.security.id}`} className="flex items-center justify-between rounded-card bg-card p-4 shadow-card hover:bg-bg-deep/40">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold text-ink">{it.security.name}</span>
                <span className="shrink-0 rounded bg-ink/5 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">{it.security.market}</span>
                {it.watchOnly && <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">관심</span>}
              </div>
              <div className="mt-1 text-xs text-ink-muted">
                현재가 {fmtMoney(it.close, it.security.isOverseas)}
                {!it.watchOnly && it.avgBuy != null && <> · 평단 {fmtMoney(it.avgBuy, it.security.isOverseas)} · {it.totalShares}주</>}
              </div>
            </div>
            {!it.watchOnly && showInvest && it.pnlPct != null && (
              <div className="shrink-0 text-right">
                <div className={`text-sm font-bold ${it.pnlPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtPct(it.pnlPct)}</div>
                <div className={`text-xs ${(it.pnl ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {(it.pnl ?? 0) >= 0 ? "+" : ""}{Math.round(it.pnl ?? 0).toLocaleString()}원
                </div>
              </div>
            )}
          </Link>
        ))}
      </div>

      {adding && <AddStockModal invest={showInvest} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </>
  );
}

// ─── 모의매수 다이어리 탭: 전 종목 매수·일지 시간순 ───
function DiaryTab({ showInvest }: { showInvest: boolean }) {
  const [items, setItems] = useState<DiaryItem[] | null>(null);
  const load = () => api.stockDiary().then((r) => setItems(r.items)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  // 날짜별 그룹
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
          아직 기록이 없어요. 위에서 오늘의 공부를 남겨보세요.
        </div>
      )}
      <div className="mt-5 space-y-5">
        {groups.map(([date, evs]) => (
          <div key={date} className="relative pl-5">
            <div className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-primary" />
            <div className="absolute left-[3px] top-4 bottom-0 w-px bg-line" />
            <p className="text-xs font-semibold text-ink-muted">{date}</p>
            <div className="mt-2 space-y-2">
              {evs.map((e) => (
                <Link
                  key={e.kind + e.id}
                  href={e.securityId ? `/stocks/${e.securityId}` : "#"}
                  className="block rounded-card bg-card p-3 shadow-card hover:bg-bg-deep/40"
                >
                  <div className="flex items-center gap-2">
                    {e.kind === "buy" ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">매수</span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">메모</span>
                    )}
                    <span className="font-semibold text-ink">{e.name ?? "종목"}</span>
                    {e.market && <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[10px] text-ink-muted">{e.market}</span>}
                  </div>
                  {e.kind === "buy" ? (
                    <p className="mt-1 text-sm text-ink-sub">{e.shares}주 매수 · {fmtMoney(e.buyPrice, e.isOverseas)}</p>
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{e.body}</p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function DiaryComposer({ onDone }: { onDone: () => void }) {
  const [picked, setPicked] = useState<SecurityLite | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SecurityLite[]>([]);
  const [body, setBody] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (picked) return;
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 1) { setResults([]); return; }
    timer.current = setTimeout(() => api.stockSearch(q.trim()).then((r) => setResults(r.results)).catch(() => setResults([])), 200);
  }, [q, picked]);

  async function save() {
    if (!picked || !body.trim()) return;
    setBusy(true);
    await api.addStockNote(picked.id, { noteDate: date, body: body.trim() }).catch(() => {});
    setBusy(false);
    setBody(""); setPicked(null); setQ("");
    onDone();
  }

  return (
    <section className="mt-4 rounded-card bg-card p-4 shadow-card">
      <p className="text-xs font-semibold text-ink-muted">오늘의 공부 기록</p>
      {!picked ? (
        <div className="relative mt-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="종목 검색 후 선택" className="w-full rounded-lg border border-line bg-bg-deep/30 px-3 py-2 text-sm outline-none focus:border-primary" />
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-line bg-card shadow-card">
              {results.map((r) => (
                <button key={r.id} onClick={() => { setPicked(r); setResults([]); }} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-bg-deep">
                  <span className="font-medium text-ink">{r.name}</span>
                  <span className="text-xs text-ink-muted">{r.code} · {r.market}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-center justify-between rounded-lg bg-bg-deep/40 px-3 py-2">
            <span className="font-semibold text-ink">{picked.name}</span>
            <button onClick={() => setPicked(null)} className="text-xs text-ink-muted hover:text-ink">변경</button>
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="왜 샀는지, 오늘 배운 것, 다음에 볼 것" className="mt-2 w-full resize-none rounded-lg border border-line bg-bg-deep/30 px-3 py-2 text-sm outline-none focus:border-primary" />
          <div className="mt-2 flex items-center justify-between">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-line bg-bg-deep/30 px-2 py-1 text-xs outline-none focus:border-primary" />
            <button onClick={save} disabled={busy || !body.trim()} className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">기록</button>
          </div>
        </>
      )}
    </section>
  );
}

// ─── 종목 추가 모달: 검색 + 가나다/영문 브라우즈 ───
// key=백엔드 그룹, label=표시. "A"는 영문 전체(A-Z), "#"은 숫자·기타.
const GROUPS: { key: string; label: string }[] = [
  ..."ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ".split("").map((g) => ({ key: g, label: g })),
  { key: "A", label: "A-Z" },
  { key: "#", label: "#" },
];

function AddStockModal({ invest, onClose, onDone }: { invest: boolean; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SecurityLite[]>([]);
  const [group, setGroup] = useState("ㄱ");
  const [browse, setBrowse] = useState<SecurityLite[]>([]);
  const [picked, setPicked] = useState<SecurityLite | null>(null);
  const [mode, setMode] = useState<"watch" | "buy">(invest ? "buy" : "watch");
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

  async function submit() {
    if (!picked) return;
    setBusy(true); setErr("");
    try {
      if (mode === "watch") await api.watchStock(picked.id);
      else {
        const sh = Number(shares);
        if (!sh || sh <= 0) { setErr("주수를 입력해 주세요."); setBusy(false); return; }
        await api.addPosition({ securityId: picked.id, buyDate, shares: sh, buyPrice: buyPrice ? Number(buyPrice) : undefined });
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
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="종목명 검색 (예: 삼성전자)" className="mt-3 w-full rounded-lg border border-line bg-bg-deep/30 px-3 py-2 text-sm outline-none focus:border-primary" />
            {!searching && (
              <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
                {GROUPS.map((g) => (
                  <button key={g.key} onClick={() => setGroup(g.key)} className={`shrink-0 rounded-md px-2 py-1 text-xs ${group === g.key ? "bg-primary/10 font-semibold text-primary" : "text-ink-muted hover:bg-bg-deep"}`}>{g.label}</button>
                ))}
              </div>
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
              <button onClick={() => setMode("watch")} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${mode === "watch" ? "border-primary bg-primary/10 text-primary" : "border-line text-ink-sub"}`}>관심만 등록</button>
              <button onClick={() => setMode("buy")} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${mode === "buy" ? "border-primary bg-primary/10 text-primary" : "border-line text-ink-sub"}`}>모의매수 기록</button>
            </div>
            {mode === "buy" && (
              <div className="mt-3 space-y-2">
                <label className="block text-xs text-ink-muted">매수일
                  <input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-bg-deep/30 px-3 py-2 text-sm outline-none focus:border-primary" />
                </label>
                <div className="flex gap-2">
                  <label className="block flex-1 text-xs text-ink-muted">주수
                    <input type="number" min="0" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="10" className="mt-1 w-full rounded-lg border border-line bg-bg-deep/30 px-3 py-2 text-sm outline-none focus:border-primary" />
                  </label>
                  <label className="block flex-1 text-xs text-ink-muted">매수단가 (비우면 자동)
                    <input type="number" min="0" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} placeholder="매수일 종가" className="mt-1 w-full rounded-lg border border-line bg-bg-deep/30 px-3 py-2 text-sm outline-none focus:border-primary" />
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
