"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, type Report, type EntryFull, type EntryFrame } from "@/lib/api";

const LENS_LABEL: Record<string, string> = { job: "취업", invest: "투자" };
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
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const d = await api.reportEntries(id);
    setReport(d.report);
    setEntries(d.entries);
    setLoaded(true);
  }, [id]);

  useEffect(() => {
    load().catch(() => setLoaded(true));
  }, [load]);

  // 처리중이면 폴링
  useEffect(() => {
    if (!report) return;
    if (report.parseStatus === "pending" || report.parseStatus === "parsing") {
      const t = setInterval(() => load().catch(() => {}), 2500);
      return () => clearInterval(t);
    }
  }, [report, load]);

  async function reExtract() {
    await api.reExtract(id);
    await load();
  }

  if (!loaded) return <main className="p-12 text-ink-muted">불러오는 중...</main>;
  if (!report) return <main className="p-12 text-ink-sub">리포트를 찾을 수 없어요. <a href="/" className="text-primary">대시보드</a></main>;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <a href="/" className="text-sm text-ink-sub hover:text-ink">← 대시보드</a>
      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{report.title ?? "리포트"}</h1>
        <StatusBadge status={report.parseStatus} />
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        {report.pageCount ?? "?"}페이지 · 렌즈 {(report.requestedLenses ?? []).join(", ")}
      </p>

      {report.parseStatus !== "parsed" ? (
        <div className="mt-8 rounded-card bg-card p-8 text-center shadow-card">
          {report.parseStatus === "pending" && <p className="text-ink-sub">추출 대기 중... (워커가 처리하면 자동 갱신)</p>}
          {report.parseStatus === "parsing" && <p className="text-ink-sub">추출 중...</p>}
          {report.parseStatus === "failed" && <p className="text-red-500">추출 실패. 다시 시도해 주세요.</p>}
          <button onClick={reExtract} className="mt-4 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white">
            {report.parseStatus === "failed" ? "다시 추출" : "지금 추출"}
          </button>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {entries.map((e) => (
            <EntryEditor key={e.id} entry={e} onSaved={load} />
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
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${s.c}`}>{s.t}</span>;
}

function EntryEditor({ entry, onSaved }: { entry: EntryFull; onSaved: () => void }) {
  const [frame, setFrame] = useState<EntryFrame>(entry.frame ?? {});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  async function save() {
    setSaving(true);
    setSavedMsg(false);
    try {
      await api.saveEntry(entry.id, { frame, status: "saved" });
      setSavedMsg(true);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-card bg-card p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
            {LENS_LABEL[entry.lensKey] ?? entry.lensKey} 렌즈
          </span>
        </h2>
        <span className="text-xs text-ink-muted">
          {entry.provider ?? "mock"}
          {entry.model ? ` · ${entry.model}` : ""} · {entry.status === "saved" ? "저장됨" : "초안"}
        </span>
      </div>

      <div className="space-y-4">
        {FRAME_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="mb-1 block text-sm font-semibold text-ink-muted">{f.label}</label>
            <textarea
              value={frame[f.key] ?? ""}
              onChange={(ev) => setFrame((p) => ({ ...p, [f.key]: ev.target.value }))}
              rows={2}
              className="w-full resize-y rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
        ))}
      </div>

      {/* 핵심숫자 + 출처/검증 */}
      <div className="mt-5">
        <h3 className="mb-2 text-sm font-semibold text-ink-muted">🔢 핵심숫자</h3>
        {entry.numbers.length === 0 ? (
          <p className="text-sm text-ink-sub">추출된 숫자가 없어요.</p>
        ) : (
          <ul className="space-y-1.5">
            {entry.numbers.map((n) => (
              <li key={n.id} className="flex items-center gap-2 text-sm">
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

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        {savedMsg && <span className="text-sm text-success-text">저장됨 ✓</span>}
      </div>
    </section>
  );
}
