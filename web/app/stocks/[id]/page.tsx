"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { api, type StockDetail, type PriceBar, type PaperNote, type PaperPosition, type RelatedArticle } from "@/lib/api";
import { PriceChart } from "@/components/price-chart";
import { ConfirmModal } from "@/components/confirm-modal";

const fmtMoney = (v: number | null, overseas: boolean) =>
  v == null ? "-" : overseas ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `${Math.round(v).toLocaleString()}원`;
const fmtPct = (v: number | null) => (v == null ? "-" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

const NOTE_CATS: { key: "up" | "down" | "hold" | "memo"; label: string; chip: string }[] = [
  { key: "up", label: "상승", chip: "bg-emerald-100 text-emerald-700" },
  { key: "down", label: "하락", chip: "bg-red-100 text-red-700" },
  { key: "hold", label: "유지", chip: "bg-slate-100 text-slate-600" },
  { key: "memo", label: "메모", chip: "bg-ink/5 text-ink-muted" },
];

export default function StockDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [period, setPeriod] = useState<"Y" | "M" | "D">("M");
  const [bars, setBars] = useState<PriceBar[]>([]);
  const [notes, setNotes] = useState<PaperNote[]>([]);
  const [articles, setArticles] = useState<RelatedArticle[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [noteCat, setNoteCat] = useState<"up" | "down" | "hold" | "memo">("up");
  const [noteDate, setNoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [sources, setSources] = useState<{ title: string; uri: string }[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [quoteAt, setQuoteAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const overseas = detail?.security.isOverseas ?? false;

  const loadDetail = () => api.stockDetail(id).then((d) => { setDetail(d); setQuoteAt(new Date()); }).catch(() => {});
  async function refreshPrice() {
    setRefreshing(true);
    await Promise.all([loadDetail(), api.stockSeries(id, period).then((r) => setBars(r.bars)).catch(() => {})]);
    setRefreshing(false);
  }
  const loadNotes = () => api.stockNotes(id).then((r) => setNotes(r.notes)).catch(() => {});
  useEffect(() => {
    loadDetail();
    loadNotes();
    api.stockArticles(id).then((r) => setArticles(r.articles)).catch(() => {});
  }, [id]);
  useEffect(() => {
    api.stockSeries(id, period).then((r) => setBars(r.bars)).catch(() => setBars([]));
  }, [id, period]);

  if (!detail) return <main className="p-12 text-ink-muted">불러오는 중...</main>;
  const { security, quote, positions, summary, simSummary } = detail;
  const realPositions = positions.filter((p) => !p.simulated);
  const simPositions = positions.filter((p) => p.simulated);
  const markers = positions.map((p) => ({ date: p.buyDate }));

  async function addNote() {
    if (!noteBody.trim()) return;
    await api.addStockNote(id, { noteDate, body: noteBody.trim(), category: noteCat });
    setNoteBody("");
    loadNotes();
  }
  async function runAnalyze(web: boolean) {
    setAnalyzing(true);
    setSources([]);
    const r = await api.analyzeStock(id, web).catch(() => ({ analysis: "분석을 가져오지 못했어요.", sources: [] as { title: string; uri: string }[] }));
    setAnalysis(r.analysis);
    setSources(r.sources ?? []);
    setAnalyzing(false);
  }
  async function remove() {
    await api.removeStock(id);
    router.push("/stocks");
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <button onClick={() => router.push("/stocks")} className="text-sm text-ink-muted hover:text-ink">← 목록으로</button>

      {/* 헤더 */}
      <div className="mt-3 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{security.name}</h1>
            <span className="rounded bg-ink/5 px-2 py-0.5 text-xs font-medium text-ink-muted">{security.market}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-semibold text-ink">{fmtMoney(quote?.price ?? summary.close, overseas)}</span>
            {quote?.changeRate != null && (
              <span className={`text-sm font-medium ${quote.changeRate >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                전일 {fmtPct(quote.changeRate)}
              </span>
            )}
            <button
              onClick={refreshPrice}
              disabled={refreshing}
              title="현재가 새로고침"
              className="text-ink-muted hover:text-primary disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <path d="M21 3v6h-6" />
              </svg>
            </button>
          </div>
          {quoteAt && (
            <p className="mt-0.5 text-[11px] text-ink-muted">
              {quoteAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준 · 새로고침하면 갱신
            </p>
          )}
        </div>
        <button onClick={() => setConfirmRemove(true)} className="text-xs text-ink-muted hover:text-red-600">삭제</button>
      </div>

      {/* 차트 */}
      <section className="mt-5 rounded-card bg-card p-4 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-ink-muted">주가 흐름 <span className="font-normal">(참고용)</span></p>
          <div className="flex gap-1 text-xs">
            {(["Y", "M", "D"] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={`rounded px-2 py-0.5 ${period === p ? "bg-primary/10 font-semibold text-primary" : "text-ink-muted"}`}>{p === "Y" ? "연봉" : p === "M" ? "월봉" : "일봉"}</button>
            ))}
          </div>
        </div>
        <PriceChart bars={bars} markers={markers} overseas={overseas} current={quote?.price ?? summary.close} positive={summary.pnlPct != null ? summary.pnlPct >= 0 : undefined} />
        {markers.length > 0 && <p className="mt-1 text-[11px] text-ink-muted">◦ 점선은 매수/매도 시점</p>}
      </section>

      {/* 실제 보유 손익 */}
      <PnlSection
        securityId={id}
        title="내 손익"
        simulated={false}
        summary={summary}
        positions={realPositions}
        overseas={overseas}
        currentPrice={quote?.price ?? summary.close}
        onChanged={loadDetail}
      />

      {/* 모의 손익 - 모의 거래가 있을 때만 */}
      {!simSummary.watchOnly && (
        <PnlSection
          securityId={id}
          title="모의 손익"
          simulated
          summary={simSummary}
          positions={simPositions}
          overseas={overseas}
          currentPrice={quote?.price ?? summary.close}
          onChanged={loadDetail}
        />
      )}

      {/* 투자일지 */}
      <section className="mt-4 rounded-card bg-card p-5 shadow-card">
        <h2 className="text-sm font-semibold text-ink-muted">투자일지</h2>
        <p className="mt-0.5 text-xs text-ink-muted">왜 오른/내린 것 같은지, 왜 주목했는지 기록해요.</p>
        <div className="mt-3">
          <div className="mb-2 flex gap-1">
            {NOTE_CATS.map((c) => (
              <button key={c.key} onClick={() => setNoteCat(c.key)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${noteCat === c.key ? c.chip : "text-ink-muted hover:bg-bg-deep"}`}>{c.label}</button>
            ))}
          </div>
          <textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder="예: 신제품 발표 기대감으로 오른 듯. 다음 실적 발표 확인."
            rows={2}
            className="w-full resize-none rounded-lg border border-line bg-bg-deep/30 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="mt-2 flex items-center justify-between">
            <input type="date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} className="rounded-lg border border-line bg-bg-deep/30 px-2 py-1 text-xs outline-none focus:border-primary" />
            <button onClick={addNote} disabled={!noteBody.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">기록</button>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {notes.map((n) => {
            const cat = NOTE_CATS.find((c) => c.key === n.category);
            return (
              <div key={n.id} className="border-l-2 border-line pl-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                    {cat && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${cat.chip}`}>{cat.label}</span>}
                    {n.noteDate}
                  </span>
                  <button onClick={async () => { await api.deleteStockNote(n.id); loadNotes(); }} className="text-[11px] text-ink-muted hover:text-red-600">삭제</button>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{n.body}</p>
              </div>
            );
          })}
          {notes.length === 0 && <p className="text-sm text-ink-muted">아직 메모가 없어요.</p>}
        </div>
      </section>

      {/* AI 분석 */}
      <section className="mt-4 rounded-card bg-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink-muted">AI 등락 요인 분석</h2>
          <div className="flex gap-1.5">
            <button onClick={() => runAnalyze(false)} disabled={analyzing} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-sub hover:bg-bg-deep disabled:opacity-50">
              내 자료로
            </button>
            <button onClick={() => runAnalyze(true)} disabled={analyzing} className="rounded-lg border border-primary bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50">
              웹 검색
            </button>
          </div>
        </div>
        {analyzing && <p className="mt-3 text-sm text-ink-muted">분석 중...</p>}
        {analysis && !analyzing && <p className="mt-3 whitespace-pre-wrap text-sm text-ink-sub">{analysis}</p>}
        {sources.length > 0 && !analyzing && (
          <div className="mt-2 space-y-0.5">
            <p className="text-[11px] font-semibold text-ink-muted">출처</p>
            {sources.slice(0, 5).map((s, i) => (
              <a key={i} href={s.uri} target="_blank" rel="noreferrer" className="block truncate text-[11px] text-primary hover:underline">· {s.title || s.uri}</a>
            ))}
          </div>
        )}
        {analysis && !analyzing && <p className="mt-2 text-[11px] text-ink-muted">가설이에요. 투자 판단·권유가 아닙니다.</p>}
      </section>

      {/* 관련 기사 */}
      <section className="mt-4 rounded-card bg-card p-5 shadow-card">
        <h2 className="text-sm font-semibold text-ink-muted">관련 자료</h2>
        <p className="mt-0.5 text-xs text-ink-muted">내가 올린 리포트·뉴스 중 이 종목을 언급한 자료예요.</p>
        <div className="mt-3 space-y-1.5">
          {articles.map((a) => (
            <a key={a.id} href={`/reports/${a.id}`} className="block rounded-lg px-2 py-1.5 hover:bg-bg-deep/40">
              <span className="text-sm text-ink">{a.title ?? "제목 없음"}</span>
              <span className="ml-2 text-xs text-ink-muted">{a.pubDate ?? ""}</span>
            </a>
          ))}
          {articles.length === 0 && <p className="text-sm text-ink-muted">아직 이 종목을 언급한 내 자료가 없어요.</p>}
        </div>
      </section>

      <ConfirmModal
        open={confirmRemove}
        title="내 종목에서 삭제할까요?"
        message="이 종목의 모의매수 기록과 투자일지도 함께 삭제돼요."
        confirmLabel="삭제"
        onConfirm={remove}
        onCancel={() => setConfirmRemove(false)}
      />
    </main>
  );
}

// 손익 섹션(실제/모의 공용): 요약 + 거래 lot + 거래 추가.
function PnlSection({
  securityId, title, simulated, summary, positions, overseas, currentPrice, onChanged,
}: {
  securityId: string;
  title: string;
  simulated: boolean;
  summary: StockDetail["summary"];
  positions: PaperPosition[];
  overseas: boolean;
  currentPrice?: number | null;
  onChanged: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  return (
    <section className="mt-4 rounded-card bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
          {title}
          {simulated && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">모의</span>}
        </h2>
        <button onClick={() => setAddOpen((v) => !v)} className="text-xs font-medium text-primary">+ 거래 기록</button>
      </div>
      {addOpen && <QuickBuy securityId={securityId} simulated={simulated} currentPrice={currentPrice} overseas={overseas} onDone={() => { setAddOpen(false); onChanged(); }} />}
      {summary.watchOnly ? (
        <p className="mt-2 text-sm text-ink-sub">아직 거래 기록이 없어요. {simulated ? "모의 매수" : "매수"}를 기록하면 손익이 보여요.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className={`text-xl font-extrabold ${(summary.pnl ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {(summary.pnl ?? 0) >= 0 ? "+" : ""}{Math.round(summary.pnl ?? 0).toLocaleString()}원
            </span>
            <span className={`text-sm font-semibold ${(summary.pnlPct ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtPct(summary.pnlPct)}</span>
            <span className="text-xs text-ink-muted">평단 {fmtMoney(summary.avgBuy, overseas)} · {summary.totalShares}주</span>
            {summary.realizedPnl != null && summary.realizedPnl !== 0 && (
              <span className="text-xs text-ink-muted">실현 {Math.round(summary.realizedPnl).toLocaleString()}원</span>
            )}
          </div>
          <div className="mt-3 space-y-1">
            {positions.map((p) => (
              <PositionRow key={p.id} p={p} overseas={overseas} onChanged={onChanged} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function QuickBuy({ securityId, simulated, currentPrice, overseas, onDone }: { securityId: string; simulated: boolean; currentPrice?: number | null; overseas: boolean; onDone: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [buyDate, setBuyDate] = useState(today);
  const [shares, setShares] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const priceHint = currentPrice != null ? (overseas ? `$${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `${Math.round(currentPrice).toLocaleString()}`) : "자동";
  async function save() {
    const sh = Number(shares);
    if (!sh || sh <= 0) return;
    setBusy(true);
    await api.addPosition({ securityId, side, simulated, buyDate, shares: sh, buyPrice: buyPrice ? Number(buyPrice) : undefined }).catch(() => {});
    setBusy(false);
    onDone();
  }
  return (
    <div className="mt-3 rounded-lg border border-line bg-bg-deep/30 p-3">
      <div className="mb-2 flex items-center gap-1">
        <button onClick={() => setSide("buy")} className={`rounded px-2.5 py-1 text-xs font-bold ${side === "buy" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700"}`}>매수</button>
        <button onClick={() => setSide("sell")} className={`rounded px-2.5 py-1 text-xs font-bold ${side === "sell" ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-700"}`}>매도</button>
        {currentPrice != null && buyDate === today && (
          <span className="ml-1 text-[11px] text-ink-muted">현재가 <b className="text-ink">{priceHint}{overseas ? "" : "원"}</b> · 단가 비우면 현재가로 체결</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} className="rounded-lg border border-line bg-card px-2 py-1 text-xs" />
        <input type="number" min="0" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="주수" className="w-20 rounded-lg border border-line bg-card px-2 py-1 text-xs" />
        <input type="number" min="0" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} placeholder={`단가(${priceHint})`} className="w-28 rounded-lg border border-line bg-card px-2 py-1 text-xs" />
        <button onClick={save} disabled={busy} className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">기록</button>
      </div>
    </div>
  );
}

// 거래 한 줄: 보기(매수/매도·날짜·주수·단가·사유) + 수정/삭제.
function PositionRow({ p, overseas, onChanged }: { p: PaperPosition; overseas: boolean; onChanged: () => void }) {
  const [edit, setEdit] = useState(false);
  const [side, setSide] = useState<"buy" | "sell">(p.side);
  const [buyDate, setBuyDate] = useState(p.buyDate);
  const [shares, setShares] = useState(String(p.shares));
  const [buyPrice, setBuyPrice] = useState(p.buyPrice != null ? String(p.buyPrice) : "");
  const [busy, setBusy] = useState(false);
  async function save() {
    const sh = Number(shares);
    if (!sh || sh <= 0) return;
    setBusy(true);
    await api.updatePosition(p.id, { side, buyDate, shares: sh, buyPrice: buyPrice ? Number(buyPrice) : null }).catch(() => {});
    setBusy(false); setEdit(false); onChanged();
  }
  if (edit) {
    return (
      <div className="rounded-lg border border-primary/40 bg-bg-deep/30 p-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setSide("buy")} className={`rounded px-2 py-1 font-semibold ${side === "buy" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700"}`}>매수</button>
          <button onClick={() => setSide("sell")} className={`rounded px-2 py-1 font-semibold ${side === "sell" ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-700"}`}>매도</button>
          <input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} className="rounded border border-line bg-card px-2 py-1" />
          <input type="number" min="0" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="주수" className="w-16 rounded border border-line bg-card px-2 py-1" />
          <input type="number" min="0" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} placeholder="단가" className="w-24 rounded border border-line bg-card px-2 py-1" />
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={save} disabled={busy} className="rounded bg-primary px-3 py-1 font-semibold text-white disabled:opacity-50">저장</button>
          <button onClick={() => setEdit(false)} className="rounded border border-line px-3 py-1 text-ink-sub">취소</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between rounded-lg bg-bg-deep/40 px-3 py-2 text-xs">
      <span className="text-ink-sub">
        <span className={`mr-1 font-semibold ${p.side === "sell" ? "text-rose-600" : "text-emerald-600"}`}>{p.side === "sell" ? "매도" : "매수"}</span>
        {p.buyDate} · {p.shares}주 · {fmtMoney(p.buyPrice, overseas)}
        {p.reason && <span className="ml-1 text-ink-muted">— {p.reason}</span>}
      </span>
      <span className="flex shrink-0 gap-2">
        <button onClick={() => setEdit(true)} className="text-ink-muted hover:text-primary">수정</button>
        <button onClick={async () => { await api.deletePosition(p.id); onChanged(); }} className="text-ink-muted hover:text-red-600">삭제</button>
      </span>
    </div>
  );
}
