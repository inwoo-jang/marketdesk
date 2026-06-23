"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type User, type Lens, type Industry, type MyIndustry, type JobRole, type Usage } from "@/lib/api";
import { AuthBar } from "@/components/auth-bar";

// 홈 = 내 산업 목록(산업별 개별 대시보드 진입). 산업 클릭 → /industry/[id].
export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [lenses, setLenses] = useState<Lens[]>([]);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [myLensKeys, setMyLensKeys] = useState<string[]>([]);
  const [myJobRole, setMyJobRole] = useState<string | undefined>();
  const [myIndustries, setMyIndustries] = useState<MyIndustry[]>([]);
  const [catalog, setCatalog] = useState<Industry[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [newIndustry, setNewIndustry] = useState("");

  const loadData = useCallback(async () => {
    const [{ lenses }, { enabled, jobRole }, { jobRoles }, mi, { industries }, usage] = await Promise.all([
      api.lenses(),
      api.myLenses(),
      api.jobRoles(),
      api.myIndustries(),
      api.industries(),
      api.usage(),
    ]);
    setLenses(lenses);
    setJobRoles(jobRoles);
    setMyLensKeys(enabled);
    setMyJobRole(jobRole);
    setMyIndustries(mi.industries);
    setCatalog(industries);
    setUsage(usage);
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
        <p className="text-ink-sub">산업·기업 리포트와 경제뉴스를 내 관점(취업·투자)으로 정리합니다.</p>
        <a href="/login" className="rounded-full bg-primary px-6 py-3 font-medium text-white">시작하기</a>
      </main>
    );
  }

  const followedIds = new Set(myIndustries.map((i) => i.id));
  const addable = catalog.filter((c) => !followedIds.has(c.id));
  const lensLabel = (k: string) => lenses.find((l) => l.key === k)?.label ?? k;
  const jobRoleLabel = jobRoles.find((r) => r.key === myJobRole)?.label;

  async function follow(id: string) {
    await api.followIndustry(id);
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
          <h1 className="text-2xl font-bold tracking-tight">🔍 리포트렌즈</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {myLensKeys.map((k) => (
              <span key={k} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {lensLabel(k)}
                {k === "job" && jobRoleLabel ? ` · ${jobRoleLabel}` : ""}
              </span>
            ))}
            <a href="/onboarding" className="rounded-full border border-line px-3 py-1 text-xs text-ink-sub hover:bg-bg-deep">
              렌즈 변경
            </a>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <AuthBar />
          {usage && (
            <span className="text-xs text-ink-muted">
              {usage.limit === null
                ? "Pro · 무제한 분석"
                : `오늘 무료 분석 ${usage.remaining ?? 0}/${usage.limit}회 남음`}
            </span>
          )}
        </div>
      </header>

      {/* 내 산업 = 산업별 대시보드 진입 */}
      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-muted">내 산업 ({myIndustries.length})</h2>
          <a href="/upload" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white">
            + 리포트 업로드
          </a>
        </div>

        {myIndustries.length === 0 ? (
          <p className="rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
            아직 팔로우한 산업이 없어요. 아래에서 추가하면 산업별 대시보드가 생깁니다.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {myIndustries.map((ind) => (
              <a
                key={ind.id}
                href={`/industry/${ind.id}`}
                className="rounded-card bg-card p-5 shadow-card transition hover:ring-1 hover:ring-primary/30"
              >
                <div
                  className="mb-3 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: ind.iconColor ?? "#8A93A8" }}
                >
                  {ind.name.slice(0, 1)}
                </div>
                <div className="font-semibold">{ind.name}</div>
                {ind.isCustom && <span className="text-xs text-ink-muted">커스텀</span>}
              </a>
            ))}
          </div>
        )}
      </section>

      {/* 산업 추가 */}
      <section>
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
            placeholder="직접 추가 (예: 우주항공)"
            className="w-56 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button onClick={createIndustry} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white">
            추가
          </button>
        </div>
      </section>
    </main>
  );
}
