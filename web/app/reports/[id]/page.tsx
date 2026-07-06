"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Report, type EntryFull, type EntryFrame, type Industry } from "@/lib/api";
import { WordLookup } from "@/components/word-lookup";
import { Highlighter } from "@/components/highlighter";
import { MemoLayer } from "@/components/memo";

const DOC_TYPE_LABEL: Record<string, string> = { industry: "산업 리포트", company: "기업 리포트", news: "경제뉴스" };

export default function ReportReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [entry, setEntry] = useState<EntryFull | null>(null);
  const [catalog, setCatalog] = useState<Industry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hlKey, setHlKey] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [d, { industries }] = await Promise.all([api.reportEntries(id), api.industries()]);
    setReport(d.report);
    setEntry(d.entries[0] ?? null);
    setCatalog(industries);
    setHlKey((k) => k + 1);
    setLoaded(true);
  }, [id]);

  useEffect(() => {
    load().catch(() => setLoaded(true));
  }, [load]);

  useEffect(() => {
    if (report && (report.parseStatus === "pending" || report.parseStatus === "parsing")) {
      const t = setInterval(() => load().catch(() => {}), 2500);
      return () => clearInterval(t);
    }
  }, [report, load]);

  async function reExtract() {
    await api.reExtract(id).catch((e) => alert(e instanceof Error ? e.message : "실패"));
    await load();
  }
  async function remove() {
    if (!confirm("이 리포트를 삭제할까요? 분석 결과도 함께 삭제됩니다.")) return;
    await api.deleteReport(id);
    router.push("/");
  }

  if (!loaded) return <main className="p-12 text-ink-muted">불러오는 중...</main>;
  if (!report)
    return (
      <main className="p-12 text-ink-sub">
        리포트를 찾을 수 없어요. <a href="/" className="text-primary">대시보드</a>
      </main>
    );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <a href="/" className="text-sm text-ink-sub hover:text-ink">← 대시보드</a>
        <div className="flex items-center gap-3">
          {report.parseStatus === "parsed" && (
            <a href={`/reports/${id}/print`} className="text-sm text-primary hover:underline">PDF 내보내기</a>
          )}
          <button onClick={remove} className="text-sm text-ink-muted hover:text-red-500">삭제</button>
        </div>
      </div>
      <div className="mt-3 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold">{report.title ?? "리포트"}</h1>
        <StatusBadge status={report.parseStatus} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        {report.docType && <span className="rounded bg-ink/5 px-2 py-0.5">{DOC_TYPE_LABEL[report.docType]}</span>}
        {report.pubDate && <span>발간 {report.pubDate}</span>}
        <span>· 추가 {new Date(report.createdAt).toLocaleDateString("ko-KR")}</span>
      </div>

      <IndustryRow report={report} catalog={catalog} onSaved={load} />

      {report.parseStatus !== "parsed" ? (
        <div className="mt-6 rounded-card bg-card p-8 text-center shadow-card">
          <p className="text-ink-sub">
            {report.parseStatus === "failed" ? "추출 실패." : "분석 중... (처리되면 자동 갱신)"}
          </p>
          <button onClick={reExtract} className="mt-4 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white">
            {report.parseStatus === "failed" ? "다시 분석" : "지금 분석"}
          </button>
        </div>
      ) : entry ? (
        <div ref={contentRef}>
          <AnalysisCard entry={entry} onSaved={load} />
        </div>
      ) : (
        <p className="mt-6 text-ink-sub">분석 결과가 없어요.</p>
      )}

      {report.parseStatus === "parsed" && entry && (
        <>
          <Highlighter reportId={id} rootRef={contentRef} ready={loaded} reloadKey={hlKey} />
          <MemoLayer reportId={id} rootRef={contentRef} ready={loaded} reloadKey={hlKey} />
          <WordLookup targetRef={contentRef} contextText={`${report.title ?? ""} ${entry.frame?.summary ?? ""}`} />
        </>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: Report["parseStatus"] }) {
  const map: Record<string, { t: string; c: string }> = {
    parsed: { t: "완료", c: "bg-success-bg text-success-text" },
    pending: { t: "분석중", c: "bg-ink/5 text-ink-muted" },
    parsing: { t: "분석중", c: "bg-primary/10 text-primary" },
    failed: { t: "실패", c: "bg-red-50 text-red-500" },
  };
  const s = map[status] ?? map.pending;
  return <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${s.c}`}>{s.t}</span>;
}

function IndustryRow({ report, catalog, onSaved }: { report: Report; catalog: Industry[]; onSaved: () => void }) {
  const [value, setValue] = useState(report.industryId ?? "");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api.setReportIndustry(report.id, value || null);
      onSaved();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-card bg-card p-4 shadow-card">
      <span className="text-sm font-semibold text-ink-muted">산업</span>
      {!report.industryConfirmed && report.industryId && (
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">AI 추정</span>
      )}
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-primary"
      >
        <option value="">미지정</option>
        {catalog.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      {value !== (report.industryId ?? "") || !report.industryConfirmed ? (
        <button onClick={save} disabled={saving} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          {saving ? "..." : report.industryConfirmed ? "변경" : "확인"}
        </button>
      ) : (
        <span className="text-xs text-success-text">확인됨 ✓</span>
      )}
    </div>
  );
}

// 읽기/편집 겸용 텍스트
function TextBlock({ value, edit, onChange, rows = 2 }: { value?: string; edit: boolean; onChange: (v: string) => void; rows?: number }) {
  if (edit)
    return (
      <textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full resize-y rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-primary"
      />
    );
  return <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{value?.trim() || <span className="text-ink-muted">명시 없음</span>}</p>;
}
// 읽기/편집 겸용 리스트(편집은 줄바꿈 구분). tone 으로 마커 색 구분(동인=파랑, 리스크=주황).
function ListBlock({
  items,
  edit,
  onChange,
  tone = "default",
}: {
  items?: string[];
  edit: boolean;
  onChange: (v: string[]) => void;
  tone?: "default" | "driver" | "risk";
}) {
  if (edit)
    return (
      <textarea
        value={(items ?? []).join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
        rows={Math.max(2, (items ?? []).length)}
        className="w-full resize-y rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-primary"
        placeholder="한 줄에 하나씩"
      />
    );
  if (!items || items.length === 0) return <p className="text-sm text-ink-muted">명시 없음</p>;
  const dot = tone === "risk" ? "bg-amber-500" : tone === "driver" ? "bg-primary" : "bg-ink-muted";
  return (
    <ul className="space-y-1.5 text-sm text-ink">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
          <span className="leading-relaxed">{it}</span>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold text-ink-muted">{title}</h3>
      {children}
    </div>
  );
}

function AnalysisCard({ entry, onSaved }: { entry: EntryFull; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<EntryFrame>(entry.frame ?? {});
  const [saving, setSaving] = useState(false);
  const inv = f.perspectives?.investment;
  const car = f.perspectives?.career;

  // 중첩 업데이트 헬퍼
  const set = (patch: Partial<EntryFrame>) => setF((p) => ({ ...p, ...patch }));
  const setInv = (patch: Partial<NonNullable<NonNullable<EntryFrame["perspectives"]>["investment"]>>) =>
    setF((p) => ({ ...p, perspectives: { ...p.perspectives, investment: { ...p.perspectives?.investment, ...patch } } }));
  const setCar = (patch: Partial<NonNullable<NonNullable<EntryFrame["perspectives"]>["career"]>>) =>
    setF((p) => ({ ...p, perspectives: { ...p.perspectives, career: { ...p.perspectives?.career, ...patch } } }));

  async function save() {
    setSaving(true);
    try {
      await api.saveEntry(entry.id, { frame: f, status: "saved" });
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-6 space-y-6 rounded-card bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-muted">
          {entry.provider ?? "mock"} · {entry.status === "saved" ? "저장됨" : "초안"}
        </span>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="rounded border border-line px-2 py-1 text-xs hover:bg-bg-deep">
            수정
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              {saving ? "저장 중..." : "저장"}
            </button>
            <button onClick={() => { setF(entry.frame ?? {}); setEditing(false); }} className="text-xs text-ink-sub">취소</button>
          </div>
        )}
      </div>

      <div data-highlight-root className="space-y-6">
      {/* 핵심 하이라이트 */}
      {editing ? (
        <Section title="⭐ 핵심 하이라이트">
          <TextBlock value={f.highlight} edit onChange={(v) => set({ highlight: v })} rows={2} />
        </Section>
      ) : (
        f.highlight?.trim() && (
          <div className="rounded-xl border-l-4 border-primary bg-primary/5 p-4">
            <div className="mb-0.5 text-xs font-semibold text-primary">⭐ 핵심</div>
            <p className="text-[15px] font-semibold leading-snug text-ink">{f.highlight.replace(/\*\*/g, "")}</p>
          </div>
        )
      )}

      <Section title="① 한 줄 요약">
        <TextBlock value={f.summary} edit={editing} onChange={(v) => set({ summary: v })} />
      </Section>

      <Section title="② 핵심 사실">
        <div className="space-y-2">
          <TextBlock value={f.facts?.what} edit={editing} onChange={(v) => set({ facts: { ...f.facts, what: v } })} />
          <div className="text-xs text-ink-muted">숫자</div>
          <TextBlock value={f.facts?.numbers} edit={editing} onChange={(v) => set({ facts: { ...f.facts, numbers: v } })} />
          <div className="text-xs text-ink-muted">출처 기준일</div>
          <TextBlock value={f.facts?.sourceDate} edit={editing} onChange={(v) => set({ facts: { ...f.facts, sourceDate: v } })} rows={1} />
        </div>
      </Section>

      <Section title="③ 동인 · 맥락">
        <ListBlock items={f.drivers} edit={editing} onChange={(v) => set({ drivers: v })} tone="driver" />
      </Section>

      <Section title="④ 리스크 · 쟁점">
        <ListBlock items={f.risks} edit={editing} onChange={(v) => set({ risks: v })} tone="risk" />
      </Section>

      {(inv || (editing && entry.frame?.perspectives?.investment)) && (
        <div className="rounded-xl bg-bg-deep p-4">
          <h3 className="mb-2 text-sm font-bold">💰 투자 관점</h3>
          <div className="space-y-2">
            <Section title="밸류에이션"><TextBlock value={inv?.valuation} edit={editing} onChange={(v) => setInv({ valuation: v })} rows={1} /></Section>
            <Section title="투자 포인트"><ListBlock items={inv?.points} edit={editing} onChange={(v) => setInv({ points: v })} /></Section>
            <Section title="하방 리스크"><ListBlock items={inv?.downside} edit={editing} onChange={(v) => setInv({ downside: v })} /></Section>
            <Section title="잠정 의견"><TextBlock value={inv?.opinion} edit={editing} onChange={(v) => setInv({ opinion: v })} /></Section>
          </div>
        </div>
      )}

      {(car || (editing && entry.frame?.perspectives?.career)) && (
        <div className="rounded-xl bg-bg-deep p-4">
          <h3 className="mb-2 text-sm font-bold">🎯 취업 관점</h3>
          <div className="space-y-2">
            <Section title="회사·산업 방향성"><TextBlock value={car?.direction} edit={editing} onChange={(v) => setCar({ direction: v })} /></Section>
            <Section title="내 직무와의 접점"><TextBlock value={car?.jobFit} edit={editing} onChange={(v) => setCar({ jobFit: v })} /></Section>
            <Section title="AI·프로덕트 시사점"><TextBlock value={car?.aiInsight} edit={editing} onChange={(v) => setCar({ aiInsight: v })} /></Section>
            <Section title="면접·자소서 활용"><ListBlock items={car?.interviewHooks} edit={editing} onChange={(v) => setCar({ interviewHooks: v })} /></Section>
            <Section title="지원동기 연결 한 문장"><TextBlock value={car?.motivation} edit={editing} onChange={(v) => setCar({ motivation: v })} rows={1} /></Section>
          </div>
        </div>
      )}

      {/* ⑥ 출처 + 핵심숫자(가드레일) */}
      <Section title="⑥ 핵심숫자 · 출처">
        {entry.numbers.length === 0 ? (
          <p className="text-sm text-ink-sub">추출된 숫자가 없어요.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {entry.numbers.map((n) => (
              <span
                key={n.id}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
                  n.verified ? "border-success-text/30 bg-success-bg" : "border-line bg-bg-deep"
                }`}
                title={n.verified ? "출처 페이지에서 확인됨" : "출처 미확인"}
              >
                <span className="font-semibold">{n.label}</span>
                <span>{n.value}</span>
                {n.pageNo != null && <span className="text-xs text-ink-muted">[p.{n.pageNo}]</span>}
                {n.verified ? (
                  <span className="text-xs font-medium text-success-text">✓</span>
                ) : (
                  <span className="text-xs text-amber-600">미확인</span>
                )}
              </span>
            ))}
          </div>
        )}
        {(f.sources ?? []).length > 0 && (
          <ul className="mt-2 text-xs text-ink-muted">
            {(f.sources ?? []).map((s, i) => (
              <li key={i}>· {s.item} {s.source && `(${s.source}${s.date ? `, ${s.date}` : ""})`}</li>
            ))}
          </ul>
        )}
      </Section>
      </div>
    </section>
  );
}
