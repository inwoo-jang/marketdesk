"use client";

import { useState } from "react";
import { api, type Report } from "@/lib/api";
import { BookmarkIcon } from "@/components/bookmark-icon";
import { HideIcon } from "@/components/hide-icon";

const STATUS: Record<string, { t: string; c: string }> = {
  parsed: { t: "완료", c: "bg-success-bg text-success-text" },
  pending: { t: "분석중", c: "bg-ink/5 text-ink-muted" },
  parsing: { t: "분석중", c: "bg-primary/10 text-primary" },
  failed: { t: "실패", c: "bg-red-50 text-red-500" },
};
const DOC_TYPE: Record<string, string> = { industry: "산업", company: "기업", news: "뉴스" };
const fmt = (d: string | null) => {
  if (!d) return null;
  const t = new Date(d);
  return `${t.getFullYear()}.${String(t.getMonth() + 1).padStart(2, "0")}.${String(t.getDate()).padStart(2, "0")}`;
};

// 피드 카드: AI 제목·요약·산업태그·발간일·상태 + 책갈피/숨김(복원)/삭제.
export function ReportCard({
  report,
  onDelete,
  variant = "all",
  onRemoved,
}: {
  report: Report;
  onDelete?: (id: string) => void;
  variant?: "all" | "bookmarks" | "hidden";
  onRemoved?: (id: string) => void;
}) {
  const s = STATUS[report.parseStatus] ?? STATUS.pending;
  const date = fmt(report.pubDate) ?? fmt(report.createdAt);
  const processing = report.parseStatus === "pending" || report.parseStatus === "parsing";
  const [bm, setBm] = useState(!!report.bookmarked);
  const [busy, setBusy] = useState(false);

  async function toggleBookmark(e: React.MouseEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (bm) {
        await api.unbookmarkReport(report.id);
        setBm(false);
        if (variant === "bookmarks") onRemoved?.(report.id);
      } else {
        await api.bookmarkReport(report.id);
        setBm(true);
      }
    } finally {
      setBusy(false);
    }
  }
  async function hideOrRestore(e: React.MouseEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (variant === "hidden") await api.unhideReport(report.id);
      else await api.hideReport(report.id);
      onRemoved?.(report.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="group relative rounded-card bg-card shadow-card transition hover:ring-1 hover:ring-primary/30">
      <a href={`/reports/${report.id}`} className="block p-4 pr-12">
        <div className="flex items-center gap-2">
          {report.docType && (
            <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[11px] text-ink-muted">
              {DOC_TYPE[report.docType] ?? report.docType}
            </span>
          )}
          <span className="truncate font-semibold">
            {processing ? (report.title ?? "분석 중...") : (report.title ?? "제목 없음")}
          </span>
          <span className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${s.c}`}>{s.t}</span>
        </div>
        {report.summary && <p className="mt-1 line-clamp-2 text-sm text-ink-sub">{report.summary}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted">
          {(report.industries ?? []).map((i) => (
            <span key={i.id} className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
              {i.name}
            </span>
          ))}
          {date && <span>발간 {date}</span>}
        </div>
      </a>

      {/* 저장(책갈피): 우상단 */}
      <button
        onClick={toggleBookmark}
        disabled={busy}
        title={bm ? "저장 해제" : "저장"}
        className={`absolute right-3 top-3 leading-none transition ${bm ? "" : "text-ink-muted opacity-40 hover:opacity-100"}`}
      >
        <BookmarkIcon filled={bm} />
      </button>
      {/* 숨김/복원 + 삭제: 우하단(저장과 분리) */}
      <div className="absolute bottom-3 right-3 flex items-center gap-3">
        {onDelete && (
          <button
            onClick={(e) => {
              e.preventDefault();
              if (confirm("이 리포트를 삭제할까요?")) onDelete(report.id);
            }}
            className="hidden text-xs text-ink-muted hover:text-red-500 group-hover:block"
          >
            삭제
          </button>
        )}
        <button
          onClick={hideOrRestore}
          disabled={busy}
          title={variant === "hidden" ? "다시 표시" : "숨김"}
          className="text-ink-muted hover:text-ink"
        >
          <HideIcon slashed={variant !== "hidden"} />
        </button>
      </div>
    </div>
  );
}
