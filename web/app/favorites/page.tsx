"use client";

import { useEffect, useState } from "react";
import { api, type PublicContent, type Report } from "@/lib/api";
import { PublicCard } from "@/components/public-card";
import { ReportCard } from "@/components/report-card";

// 즐겨찾기 따로보기: 책갈피한 리포트 + 공공 콘텐츠 모아보기.
export default function FavoritesPage() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [items, setItems] = useState<PublicContent[]>([]);

  useEffect(() => {
    (async () => {
      const me = await api.me().catch(() => ({ user: null }));
      if (!me.user) {
        window.location.href = "/login";
        return;
      }
      const [r, c] = await Promise.all([
        api.myReports({ view: "bookmarks" }).catch(() => ({ reports: [] })),
        api.bookmarkedContents().catch(() => ({ contents: [] })),
      ]);
      setReports(r.reports);
      setItems(c.contents);
    })();
  }, []);

  if (reports === null) return <main className="p-12 text-ink-muted">불러오는 중...</main>;
  const total = reports.length + items.length;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <a href="/" className="text-sm text-ink-sub hover:text-ink">← 대시보드</a>
      <h1 className="mt-3 text-2xl font-bold">🔖 즐겨찾기 ({total})</h1>
      <p className="mt-1 text-sm text-ink-sub">책갈피한 리포트와 공공 콘텐츠를 모아봤어요.</p>

      <div className="mt-6">
        {total === 0 ? (
          <p className="rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
            아직 즐겨찾기한 항목이 없어요. 카드의 책갈피를 눌러 추가하세요.
          </p>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <ReportCard
                key={r.id}
                report={r}
                variant="bookmarks"
                onRemoved={(id) => setReports((l) => (l ? l.filter((x) => x.id !== id) : l))}
              />
            ))}
            {items.map((c) => (
              <PublicCard
                key={c.id}
                content={c}
                variant="bookmarks"
                onRemoved={(id) => setItems((l) => l.filter((x) => x.id !== id))}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
