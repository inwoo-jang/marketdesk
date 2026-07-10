"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { api, type StockDetail, type PriceBar, type PaperNote, type RelatedArticle } from "@/lib/api";
import { PriceChart } from "@/components/price-chart";
import { ConfirmModal } from "@/components/confirm-modal";

const fmtMoney = (v: number | null, overseas: boolean) =>
  v == null ? "-" : overseas ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `${Math.round(v).toLocaleString()}원`;
const fmtPct = (v: number | null) => (v == null ? "-" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

export default function StockDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [period, setPeriod] = useState<"M" | "D">("M");
  const [bars, setBars] = useState<PriceBar[]>([]);
  const [notes, setNotes] = useState<PaperNote[]>([]);
  const [articles, setArticles] = useState<RelatedArticle[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [noteDate, setNoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [addBuy, setAddBuy] = useState(false);

  const overseas = detail?.security.isOverseas ?? false;

  const loadDetail = () => api.stockDetail(id).then(setDetail).catch(() => {});
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
  const { security, quote, positions, summary } = detail;
  const markers = positions.map((p) => ({ date: p.buyDate }));

  async function addNote() {
    if (!noteBody.trim()) return;
    await api.addStockNote(id, { noteDate, body: noteBody.trim() });
    setNoteBody("");
    loadNotes();
  }
  async function runAnalyze() {
    setAnalyzing(true);
    const r = await api.analyzeStock(id).catch(() => ({ analysis: "분석을 가져오지 못했어요." }));
    setAnalysis(r.analysis);
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
          </div>
        </div>
        <button onClick={() => setConfirmRemove(true)} className="text-xs text-ink-muted hover:text-red-600">삭제</button>
      </div>

      {/* 차트 */}
      <section className="mt-5 rounded-card bg-card p-4 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-ink-muted">주가 흐름 <span className="font-normal">(참고용)</span></p>
          <div className="flex gap-1 text-xs">
            <button onClick={() => setPeriod("M")} className={`rounded px-2 py-0.5 ${period === "M" ? "bg-primary/10 font-semibold text-primary" : "text-ink-muted"}`}>월봉</button>
            <button onClick={() => setPeriod("D")} className={`rounded px-2 py-0.5 ${period === "D" ? "bg-primary/10 font-semibold text-primary" : "text-ink-muted"}`}>일봉</button>
          </div>
        </div>
        <PriceChart bars={bars} markers={markers} positive={summary.pnlPct != null ? summary.pnlPct >= 0 : undefined} />
        {markers.length > 0 && <p className="mt-1 text-[11px] text-ink-muted">◦ 점선은 모의매수 시점</p>}
      </section>

      {/* 모의 손익 */}
      <section className="mt-4 rounded-card bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-muted">모의 손익</h2>
          <button onClick={() => setAddBuy((v) => !v)} className="text-xs font-medium text-primary">+ 매수 기록</button>
        </div>
        {addBuy && <QuickBuy securityId={id} onDone={() => { setAddBuy(false); loadDetail(); }} />}
        {summary.watchOnly ? (
          <p className="mt-2 text-sm text-ink-sub">관심 등록만 되어 있어요. 매수를 기록하면 평가손익이 보여요.</p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <span className={`text-xl font-extrabold ${(summary.pnl ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {(summary.pnl ?? 0) >= 0 ? "+" : ""}{Math.round(summary.pnl ?? 0).toLocaleString()}원
              </span>
              <span className={`text-sm font-semibold ${(summary.pnlPct ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtPct(summary.pnlPct)}</span>
              <span className="text-xs text-ink-muted">평단 {fmtMoney(summary.avgBuy, overseas)} · {summary.totalShares}주</span>
            </div>
            <div className="mt-3 space-y-1">
              {positions.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-bg-deep/40 px-3 py-2 text-xs">
                  <span className="text-ink-sub">{p.buyDate} · {p.shares}주 · {fmtMoney(p.buyPrice, overseas)}</span>
                  <button onClick={async () => { await api.deletePosition(p.id); loadDetail(); }} className="text-ink-muted hover:text-red-600">삭제</button>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* 투자일지 */}
      <section className="mt-4 rounded-card bg-card p-5 shadow-card">
        <h2 className="text-sm font-semibold text-ink-muted">투자일지</h2>
        <p className="mt-0.5 text-xs text-ink-muted">왜 오른/내린 것 같은지, 왜 주목했는지 기록해요.</p>
        <div className="mt-3">
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
          {notes.map((n) => (
            <div key={n.id} className="border-l-2 border-line pl-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-muted">{n.noteDate}</span>
                <button onClick={async () => { await api.deleteStockNote(n.id); loadNotes(); }} className="text-[11px] text-ink-muted hover:text-red-600">삭제</button>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{n.body}</p>
            </div>
          ))}
          {notes.length === 0 && <p className="text-sm text-ink-muted">아직 메모가 없어요.</p>}
        </div>
      </section>

      {/* AI 분석 */}
      <section className="mt-4 rounded-card bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-muted">AI 등락 요인 분석</h2>
          <button onClick={runAnalyze} disabled={analyzing} className="rounded-lg border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50">
            {analyzing ? "분석 중..." : analysis ? "다시 분석" : "분석하기"}
          </button>
        </div>
        {analysis && <p className="mt-3 whitespace-pre-wrap text-sm text-ink-sub">{analysis}</p>}
        {analysis && <p className="mt-2 text-[11px] text-ink-muted">가설이에요. 투자 판단·권유가 아닙니다.</p>}
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

function QuickBuy({ securityId, onDone }: { securityId: string; onDone: () => void }) {
  const [buyDate, setBuyDate] = useState(new Date().toISOString().slice(0, 10));
  const [shares, setShares] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    const sh = Number(shares);
    if (!sh || sh <= 0) return;
    setBusy(true);
    await api.addPosition({ securityId, buyDate, shares: sh, buyPrice: buyPrice ? Number(buyPrice) : undefined }).catch(() => {});
    setBusy(false);
    onDone();
  }
  return (
    <div className="mt-3 rounded-lg border border-line bg-bg-deep/30 p-3">
      <div className="flex flex-wrap gap-2">
        <input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} className="rounded-lg border border-line bg-card px-2 py-1 text-xs" />
        <input type="number" min="0" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="주수" className="w-20 rounded-lg border border-line bg-card px-2 py-1 text-xs" />
        <input type="number" min="0" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} placeholder="단가(자동)" className="w-28 rounded-lg border border-line bg-card px-2 py-1 text-xs" />
        <button onClick={save} disabled={busy} className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">추가</button>
      </div>
    </div>
  );
}
