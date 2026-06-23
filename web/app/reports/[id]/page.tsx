"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, type Report, type EntryFull, type EntryFrame, type Industry } from "@/lib/api";

const LENS_LABEL: Record<string, string> = { job: "취업", invest: "투자" };
const DOC_TYPE_LABEL: Record<string, string> = { industry: "산업 리포트", company: "기업 리포트", news: "경제뉴스" };
const FRAME_FIELDS: { key: keyof EntryFrame; label: string }[] = [
  { key: "new_biz", label: "🚀 신사업" },
  { key: "core_biz_structural", label: "🏭 기존사업 · 구조적" },
  { key: "core_biz_short", label: "🏭 기존사업 · 단기" },
  { key: "overseas", label: "🌍 해외상황" },
  { key: "insight", label: "🎯 인사이트" },
];

export default function ReportReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [entries, setEntries] = useState<EntryFull[]>([]);
  const [catalog, setCatalog] = useState<Industry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [d, { industries }] = await Promise.all([api.reportEntries(id), api.industries()]);
    setReport(d.report);
    setEntries(d.entries);
    setCatalog(industries);
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

  if (!loaded) return <main className="p-12 text-ink-muted">불러오는 중...</main>;
  if (!report)
    return (
      <main className="p-12 text-ink-sub">
        리포트를 찾을 수 없어요. <a href="/" className="text-primary">대시보드</a>
      </main>
    );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <a href="/" className="text-sm text-ink-sub hover:text-ink">← 대시보드</a>
      <div className="mt-3 flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold">{report.title ?? "리포트"}</h1>
        <StatusBadge status={report.parseStatus} />
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        {report.docType && <span className="rounded bg-ink/5 px-2 py-0.5">{DOC_TYPE_LABEL[report.docType]}</span>}
        <span>{report.pageCount ?? "?"}페이지</span>
        <span>· 렌즈 {(report.requestedLenses ?? []).join(", ")}</span>
      </div>

      {/* 산업 확인/수정 */}
      <IndustryRow report={report} catalog={catalog} onSaved={load} />

      {report.parseStatus !== "parsed" ? (
        <div className="mt-6 rounded-card bg-card p-8 text-center shadow-card">
          {report.parseStatus === "pending" && <p className="text-ink-sub">추출 대기 중... (처리되면 자동 갱신)</p>}
          {report.parseStatus === "parsing" && <p className="text-ink-sub">추출 중...</p>}
          {report.parseStatus === "failed" && <p className="text-red-500">추출 실패.</p>}
          <button onClick={reExtract} className="mt-4 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white">
            {report.parseStatus === "failed" ? "다시 추출" : "지금 추출"}
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {entries.map((e) => (
            <EntryCard key={e.id} entry={e} onSaved={load} />
          ))}
          {entries.length === 0 && <p className="text-ink-sub">아직 엔트리가 없어요.</p>}
        </div>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: Report["parseStatus"] }) {
  const map: Record<string, { t: string; c: string }> = {
    parsed: { t: "완료", c: "bg-success-bg text-success-text" },
    pending: { t: "대기중", c: "bg-ink/5 text-ink-muted" },
    parsing: { t: "처리중", c: "bg-primary/10 text-primary" },
    failed: { t: "실패", c: "bg-red-50 text-red-500" },
  };
  const s = map[status] ?? map.pending;
  return <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${s.c}`}>{s.t}</span>;
}

function IndustryRow({ report, catalog, onSaved }: { report: Report; catalog: Industry[]; onSaved: () => void }) {
  const [value, setValue] = useState(report.industryId ?? "");
  const [saving, setSaving] = useState(false);
  const current = catalog.find((c) => c.id === report.industryId);

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
      {!report.industryConfirmed && current && (
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">AI 추정</span>
      )}
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-primary"
      >
        <option value="">미지정</option>
        {catalog.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {value !== (report.industryId ?? "") || !report.industryConfirmed ? (
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {saving ? "..." : report.industryConfirmed ? "변경" : "확인"}
        </button>
      ) : (
        <span className="text-xs text-success-text">확인됨 ✓</span>
      )}
    </div>
  );
}

function EntryCard({ entry, onSaved }: { entry: EntryFull; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [frame, setFrame] = useState<EntryFrame>(entry.frame ?? {});
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.saveEntry(entry.id, { frame, status: "saved" });
      setEditing(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-card bg-card p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
          {LENS_LABEL[entry.lensKey] ?? entry.lensKey} 렌즈
        </span>
        <div className="flex items-center gap-3 text-xs text-ink-muted">
          <span>
            {entry.provider ?? "mock"} · {entry.status === "saved" ? "저장됨" : "초안"}
          </span>
          {!editing && (
            <button onClick={() => setEditing(true)} className="rounded border border-line px-2 py-1 hover:bg-bg-deep">
              수정
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {FRAME_FIELDS.map((f) => (
          <div key={f.key}>
            <div className="mb-1 text-sm font-semibold text-ink-muted">{f.label}</div>
            {editing ? (
              <textarea
                value={frame[f.key] ?? ""}
                onChange={(ev) => setFrame((p) => ({ ...p, [f.key]: ev.target.value }))}
                rows={2}
                className="w-full resize-y rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-primary"
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {entry.frame?.[f.key]?.trim() || <span className="text-ink-muted">명시 없음</span>}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* 핵심숫자 */}
      <div className="mt-5 border-t border-line pt-4">
        <h3 className="mb-2 text-sm font-semibold text-ink-muted">🔢 핵심숫자</h3>
        {entry.numbers.length === 0 ? (
          <p className="text-sm text-ink-sub">추출된 숫자가 없어요.</p>
        ) : (
          <ul className="space-y-1.5">
            {entry.numbers.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{n.label}</span>
                <span>{n.value}</span>
                {n.pageNo != null && (
                  <span className="rounded bg-ink/5 px-1.5 py-0.5 text-xs text-ink-muted">p.{n.pageNo}</span>
                )}
                {n.verified ? (
                  <span className="rounded-full bg-success-bg px-2 py-0.5 text-xs text-success-text">출처확인</span>
                ) : (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-500">미확인</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
          <button onClick={() => setEditing(false)} className="text-sm text-ink-sub hover:text-ink">
            취소
          </button>
        </div>
      )}
    </section>
  );
}
