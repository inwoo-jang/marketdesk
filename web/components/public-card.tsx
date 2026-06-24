"use client";

import { useState } from "react";
import { api, type PublicContent } from "@/lib/api";
import { BookmarkIcon } from "@/components/bookmark-icon";
import { HideIcon } from "@/components/hide-icon";

const DOC_TYPE: Record<string, string> = { industry: "산업", company: "기업", news: "뉴스" };
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }) : null);

// 공개소스 콘텐츠 카드. 제목 클릭=원문(새 탭). 책갈피(즐겨찾기)·숨김/다시공개.
export function PublicCard({
  content,
  variant = "feed",
  onRemoved,
}: {
  content: PublicContent;
  variant?: "feed" | "hidden" | "bookmarks";
  onRemoved?: (id: string) => void;
}) {
  const [bm, setBm] = useState(content.isBookmarked);
  const [busy, setBusy] = useState(false);
  const date = fmt(content.pubDate);

  async function toggleBookmark() {
    setBusy(true);
    try {
      if (bm) {
        await api.unbookmarkPublic(content.id);
        setBm(false);
        if (variant === "bookmarks") onRemoved?.(content.id);
      } else {
        await api.bookmarkPublic(content.id);
        setBm(true);
      }
    } finally {
      setBusy(false);
    }
  }
  async function hide() {
    setBusy(true);
    try {
      await api.hidePublic(content.id);
      onRemoved?.(content.id);
    } finally {
      setBusy(false);
    }
  }
  async function unhide() {
    setBusy(true);
    try {
      await api.unhidePublic(content.id);
      onRemoved?.(content.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="group relative rounded-card bg-card p-4 pr-12 shadow-card transition hover:ring-1 hover:ring-primary/30">
      <div>
        <a href={content.sourceUrl} target="_blank" rel="noopener noreferrer" className="block min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-success-bg px-1.5 py-0.5 text-[11px] font-medium text-success-text">공공</span>
            {content.docType && (
              <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[11px] text-ink-muted">
                {DOC_TYPE[content.docType] ?? content.docType}
              </span>
            )}
            {content.industryName && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{content.industryName}</span>
            )}
          </div>
          <div className="mt-1.5 font-semibold leading-snug hover:text-primary">{content.title} ↗</div>
          {content.summary && <p className="mt-1 line-clamp-2 text-sm text-ink-sub">{content.summary}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted">
            {date && <span>발간 {date}</span>}
            <span>· 출처 {content.source}</span>
          </div>
        </a>
      </div>

      {/* 저장(책갈피): 우상단 */}
      <button
        onClick={toggleBookmark}
        disabled={busy}
        title={bm ? "저장 해제" : "저장"}
        className={`absolute right-3 top-3 leading-none transition ${bm ? "" : "text-ink-muted opacity-50 hover:opacity-100"}`}
      >
        <BookmarkIcon filled={bm} />
      </button>
      {/* 숨김/복원: 우하단(저장과 분리) */}
      {variant === "hidden" ? (
        <button
          onClick={unhide}
          disabled={busy}
          title="다시 표시"
          className="absolute bottom-3 right-3 text-ink-muted hover:text-ink"
        >
          <HideIcon slashed={false} />
        </button>
      ) : (
        <button
          onClick={hide}
          disabled={busy}
          title="숨기기"
          className="absolute bottom-3 right-3 text-ink-muted hover:text-ink"
        >
          <HideIcon slashed />
        </button>
      )}
    </div>
  );
}
