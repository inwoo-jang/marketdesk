"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type AppNotification } from "@/lib/api";

// 우상단 알림 벨: 흐름 위험 신호 감지(새 자료가 활성 신호와 매칭)를 저장·표시.
// 콘텐츠 분석을 기다리지 않아도 나중에 벨에서 확인. 열면 읽음 처리.
export function NotificationBell() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await api.notifications().catch(() => null);
    if (r) {
      setItems(r.notifications);
      setUnread(r.unread);
    }
  }, []);

  // 최초 + 화면 이동 시 갱신, 분석이 비동기라 30초 폴링으로 완료분 반영.
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load, pathname]);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      await api.markNotificationsRead().catch(() => {});
    }
  }

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}.${d.getDate()}`;
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label="알림"
        title="알림"
        className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-ink-sub transition hover:bg-bg-deep hover:text-ink ${
          open ? "bg-primary/10 text-primary" : ""
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-40 w-80 overflow-hidden rounded-card border border-line bg-card shadow-card">
          <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">알림</div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">아직 알림이 없어요.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className="border-b border-line last:border-0">
                  <a
                    href={
                      n.industryId
                        ? `/industry/${n.industryId}${n.reportId ? `?new=${n.reportId}` : ""}`
                        : n.reportId
                          ? `/reports/${n.reportId}`
                          : "/board"
                    }
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2.5 hover:bg-bg-deep"
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 text-rose-500">⚠️</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-xs font-semibold text-ink">{n.title ?? "알림"}</span>
                          <span className="shrink-0 text-[10px] text-ink-muted">{fmt(n.pubDate ?? n.createdAt)}</span>
                        </div>
                        {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-ink-sub">{n.body}</p>}
                        {n.detail && <p className="mt-0.5 truncate text-[11px] text-ink-muted">자료: {n.detail}</p>}
                        {n.matched && <p className="mt-0.5 line-clamp-2 text-[11px] text-rose-500">근거: {n.matched}</p>}
                      </div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <a
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-line px-4 py-2.5 text-center text-xs font-medium text-primary hover:bg-bg-deep"
          >
            모두 보기
          </a>
        </div>
      )}
    </div>
  );
}
