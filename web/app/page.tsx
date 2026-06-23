"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type User, type Lens, type Industry, type MyIndustry, type Entry, type Report } from "@/lib/api";
import { AuthBar } from "@/components/auth-bar";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [lenses, setLenses] = useState<Lens[]>([]);
  const [myLensKeys, setMyLensKeys] = useState<string[]>([]);
  const [myIndustries, setMyIndustries] = useState<MyIndustry[]>([]);
  const [catalog, setCatalog] = useState<Industry[]>([]);
  const [recent, setRecent] = useState<Entry[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [newIndustry, setNewIndustry] = useState("");

  const loadData = useCallback(async () => {
    const [{ lenses }, { enabled }, mi, { industries }, re, rp] = await Promise.all([
      api.lenses(),
      api.myLenses(),
      api.myIndustries(),
      api.industries(),
      api.recentEntries(),
      api.myReports(),
    ]);
    setLenses(lenses);
    setMyLensKeys(enabled);
    setMyIndustries(mi.industries);
    setCatalog(industries);
    setRecent(re.entries);
    setReports(rp.reports);
  }, []);

  useEffect(() => {
    (async () => {
      const me = await api.me().catch(() => ({ user: null }));
      setUser(me.user);
      if (me.user) await loadData().catch(() => {});
      setLoaded(true);
    })();
  }, [loadData]);

  if (!loaded) return <main className="p-12 text-ink-muted">불러오는 중...</main>;

  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="text-3xl font-bold">🔍 리포트렌즈</h1>
        <p className="text-ink-sub">산업리포트를 내 관점(취업·투자)으로 정리하고 흐름까지 누적합니다.</p>
        <a href="/login" className="rounded-full bg-primary px-6 py-3 font-medium text-white">시작하기</a>
      </main>
    );
  }

  const followedIds = new Set(myIndustries.map((i) => i.id));
  const addable = catalog.filter((c) => !followedIds.has(c.id));
  const myLensLabels = lenses.filter((l) => myLensKeys.includes(l.key));

  async function follow(id: string) {
    await api.followIndustry(id);
    await loadData();
  }
  async function unfollow(id: string) {
    await api.unfollowIndustry(id);
    await loadData();
  }
  async function createIndustry() {
    const name = newIndustry.trim();
    if (!name) return;
    await api.createIndustry(name);
    setNewIndustry("");
    await loadData();
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">🔍 대시보드</h1>
          <div className="mt-2 flex gap-1.5">
            {myLensLabels.map((l) => (
              <span key={l.key} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {l.label}
              </span>
            ))}
            <a href="/onboarding" className="rounded-full border border-line px-3 py-1 text-xs text-ink-sub hover:bg-bg-deep">
              렌즈 변경
            </a>
          </div>
        </div>
        <AuthBar />
      </header>

      {/* 내 산업 */}
      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-muted">내 산업 ({myIndustries.length})</h2>
          <a href="/upload" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white">
            + 리포트 업로드
          </a>
        </div>

        {myIndustries.length === 0 ? (
          <p className="rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
            아직 팔로우한 산업이 없어요. 아래에서 추가하세요.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {myIndustries.map((ind) => (
              <div key={ind.id} className="group relative rounded-card bg-card p-5 shadow-card">
                <div
                  className="mb-3 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: ind.iconColor ?? "#8A93A8" }}
                >
                  {ind.name.slice(0, 1)}
                </div>
                <div className="font-semibold">{ind.name}</div>
                {ind.isCustom && <span className="text-xs text-ink-muted">커스텀</span>}
                <button
                  onClick={() => unfollow(ind.id)}
                  className="absolute right-3 top-3 hidden text-xs text-ink-muted hover:text-red-500 group-hover:block"
                  title="언팔로우"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 산업 추가 */}
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold text-ink-muted">산업 추가</h2>
        <div className="flex flex-wrap gap-2">
          {addable.map((c) => (
            <button
              key={c.id}
              onClick={() => follow(c.id)}
              className="rounded-full border border-line bg-card px-3 py-1.5 text-sm hover:border-primary hover:text-primary"
            >
              + {c.name}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={newIndustry}
            onChange={(e) => setNewIndustry(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createIndustry()}
            placeholder="직접 추가 (예: 디스플레이)"
            className="w-56 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button onClick={createIndustry} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white">
            추가
          </button>
        </div>
      </section>

      {/* 내 리포트(업로드) */}
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold text-ink-muted">내 리포트 ({reports.length})</h2>
        {reports.length === 0 ? (
          <p className="rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
            업로드한 리포트가 없어요. 우측 상단 &quot;+ 리포트 업로드&quot;로 PDF를 올려보세요.
          </p>
        ) : (
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-card bg-card p-4 shadow-card">
                <div>
                  <div className="font-medium">{r.title ?? "제목 없음"}</div>
                  <div className="mt-0.5 text-xs text-ink-muted">
                    {(r.requestedLenses ?? []).join(", ") || "렌즈 미지정"} · {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                  </div>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    r.parseStatus === "parsed"
                      ? "bg-success-bg text-success-text"
                      : r.parseStatus === "failed"
                        ? "bg-red-50 text-red-500"
                        : "bg-ink/5 text-ink-muted"
                  }`}
                >
                  {r.parseStatus === "pending" ? "대기중 (Sprint2 추출)" : r.parseStatus}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 최근 엔트리 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink-muted">최근 엔트리</h2>
        {recent.length === 0 ? (
          <p className="rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
            아직 정리된 리포트가 없어요. 리포트를 업로드하면 렌즈별로 정리됩니다. (AI 추출은 Sprint 2)
          </p>
        ) : (
          <ul className="space-y-2">
            {recent.map((e) => (
              <li key={e.id} className="rounded-card bg-card p-4 shadow-card">
                {e.entryDate} · {e.lensKey} · {e.status}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
