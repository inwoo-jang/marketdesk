"use client";

import { useEffect, useState } from "react";
import { api, type PublicContent } from "@/lib/api";
import { PublicCard } from "@/components/public-card";

// 즐겨찾기 따로보기: 책갈피한 공개 콘텐츠 모아보기.
export default function FavoritesPage() {
  const [items, setItems] = useState<PublicContent[] | null>(null);

  useEffect(() => {
    (async () => {
      const me = await api.me().catch(() => ({ user: null }));
      if (!me.user) {
        window.location.href = "/login";
        return;
      }
      const { contents } = await api.bookmarkedContents().catch(() => ({ contents: [] }));
      setItems(contents);
    })();
  }, []);

  if (items === null) return <main className="p-12 text-ink-muted">불러오는 중...</main>;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <a href="/" className="text-sm text-ink-sub hover:text-ink">← 대시보드</a>
      <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold">🔖 즐겨찾기 ({items.length})</h1>
      <p className="mt-1 text-sm text-ink-sub">책갈피한 공개 콘텐츠를 모아봤어요.</p>

      <div className="mt-6">
        {items.length === 0 ? (
          <p className="rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
            아직 즐겨찾기한 항목이 없어요. 콘텐츠 카드의 🔖 를 눌러 추가하세요.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((c) => (
              <PublicCard
                key={c.id}
                content={c}
                variant="bookmarks"
                onRemoved={(id) => setItems((l) => (l ? l.filter((x) => x.id !== id) : l))}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
