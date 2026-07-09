"use client";

import { useEffect, useState } from "react";
import { api, type AppNotification } from "@/lib/api";
import { ConfirmModal } from "@/components/confirm-modal";

// 알림 모두보기: 알림일 기준 최신순(API 가 created_at desc). 방문 시 읽음 처리. 개별·전체 삭제(확인 모달).
export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "one"; id: string } | { kind: "all" } | null>(null);

  useEffect(() => {
    (async () => {
      const me = await api.me().catch(() => ({ user: null }));
      if (!me.user) {
        window.location.href = "/login";
        return;
      }
      const r = await api.notifications().catch(() => null);
      if (r) {
        setItems(r.notifications);
        if (r.unread > 0) await api.markNotificationsRead().catch(() => {});
      }
      setLoaded(true);
    })();
  }, []);

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  };
  const linkOf = (n: AppNotification) =>
    n.industryId ? `/industry/${n.industryId}${n.reportId ? `?new=${n.reportId}` : ""}` : n.reportId ? `/reports/${n.reportId}` : "/board";

  async function runConfirm() {
    if (!confirm) return;
    if (confirm.kind === "all") {
      setItems([]);
      await api.clearNotifications().catch(() => {});
    } else {
      const id = confirm.id;
      setItems((prev) => prev.filter((n) => n.id !== id));
      await api.deleteNotification(id).catch(() => {});
    }
    setConfirm(null);
  }

  if (!loaded) return <main className="p-12 text-ink-muted">불러오는 중...</main>;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <button
        onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.href = "/"))}
        className="text-sm text-ink-sub hover:text-ink"
      >
        ← 뒤로
      </button>
      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold">알림</h1>
        {items.length > 0 && (
          <button onClick={() => setConfirm({ kind: "all" })} className="text-sm font-medium text-ink-sub hover:text-red-500">
            모두 삭제
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-8 rounded-card bg-card p-8 text-center text-sm text-ink-sub shadow-card">아직 알림이 없어요.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {items.map((n) => (
            <li key={n.id} className="relative rounded-card border border-line bg-card shadow-card">
              <a href={linkOf(n)} className="block px-4 py-3 pr-9 hover:bg-bg-deep">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 text-rose-500">⚠️</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-ink">{n.title ?? "알림"}</span>
                      <span className="shrink-0 text-xs text-ink-muted">{fmt(n.createdAt)}</span>
                    </div>
                    {n.body && <p className="mt-0.5 text-sm text-ink-sub">{n.body}</p>}
                    {n.detail && <p className="mt-0.5 truncate text-xs text-ink-muted">자료: {n.detail}</p>}
                    {n.matched && <p className="mt-0.5 text-xs text-rose-500">근거: {n.matched}</p>}
                  </div>
                </div>
              </a>
              <button
                onClick={() => setConfirm({ kind: "one", id: n.id })}
                title="삭제"
                className="absolute right-2 top-2 rounded px-1.5 py-0.5 text-ink-muted hover:bg-bg-deep hover:text-red-500"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={!!confirm}
        title="정말 삭제하시겠습니까?"
        message={confirm?.kind === "all" ? "알림을 모두 삭제합니다." : "이 알림을 삭제합니다."}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </main>
  );
}
