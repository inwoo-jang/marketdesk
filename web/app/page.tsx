"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type User, type Lens, type Industry, type MyIndustry, type JobRole, type Report } from "@/lib/api";
import { ReportCard } from "@/components/report-card";

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
  const [recent, setRecent] = useState<Report[]>([]);
  const [newIndustry, setNewIndustry] = useState("");
  const [showAll, setShowAll] = useState(false);

  const loadData = useCallback(async () => {
    const [{ lenses }, { enabled, jobRole }, { jobRoles }, mi, { industries }, { reports }] = await Promise.all([
      api.lenses(),
      api.myLenses(),
      api.jobRoles(),
      api.myIndustries(),
      api.industries(),
      api.myReports(),
    ]);
    setLenses(lenses);
    setJobRoles(jobRoles);
    setMyLensKeys(enabled);
    setMyJobRole(jobRole);
    setMyIndustries(mi.industries);
    setCatalog(industries);
    setRecent(reports);
  }, []);

  useEffect(() => {
    (async () => {
      const me = await api.me().catch(() => ({ user: null }));
      setUser(me.user);
      if (me.user) await loadData().catch(() => {});
      setLoaded(true);
    })();
  }, [loadData]);

  // 분석중 리포트 있으면 폴링
  useEffect(() => {
    if (user && recent.some((r) => r.parseStatus === "pending" || r.parseStatus === "parsing")) {
      const t = setInterval(() => loadData().catch(() => {}), 2500);
      return () => clearInterval(t);
    }
  }, [user, recent, loadData]);

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
  const lensLabel = (k: string) => lenses.find((l) => l.key === k)?.label ?? k;
  const jobRoleLabel = jobRoles.find((r) => r.key === myJobRole)?.label;

  async function togglePin(id: string, pinned: boolean) {
    if (pinned) await api.unfollowIndustry(id);
    else await api.followIndustry(id);
    await loadData();
  }
  async function createIndustry() {
    const name = newIndustry.trim();
    if (!name) return;
    await api.createIndustry(name);
    setNewIndustry("");
    await loadData();
  }
  async function deleteReport(rid: string) {
    await api.deleteReport(rid);
    await loadData();
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">대시보드</h1>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {myLensKeys.map((k) => (
            <span key={k} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {lensLabel(k)}
              {k === "job" && jobRoleLabel ? ` · ${jobRoleLabel}` : ""}
            </span>
          ))}
          <a href="/settings" className="rounded-full border border-line px-3 py-1 text-xs text-ink-sub hover:bg-bg-deep">
            렌즈 변경
          </a>
        </div>
      </header>

      {/* 내 산업(핀) = 펼치기 전 보이는 산업 */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-muted">내 산업 ({myIndustries.length})</h2>
          <a href="/upload" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white">
            + 리포트 업로드
          </a>
        </div>

        {myIndustries.length === 0 ? (
          <p className="rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
            관심 산업을 아직 안 골랐어요. 아래 &quot;전체 산업&quot;에서 ★ 로 고르면 여기에 모여요. (안 골라도 전체에서 다 볼 수 있어요)
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {myIndustries.map((ind) => (
              <div key={ind.id} className="group relative rounded-card bg-card p-5 shadow-card hover:ring-1 hover:ring-primary/30">
                <a href={`/industry/${ind.id}`} className="block">
                  <div
                    className="mb-3 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: ind.iconColor ?? "#8A93A8" }}
                  >
                    {ind.name.slice(0, 1)}
                  </div>
                  <div className="font-semibold">{ind.name}</div>
                  {ind.isCustom && <span className="text-xs text-ink-muted">커스텀</span>}
                </a>
                <button
                  onClick={() => togglePin(ind.id, true)}
                  className="absolute right-3 top-3 text-primary"
                  title="관심 해제"
                >
                  ★
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 전체 산업: 다 볼 수 있고, ★ 로 핀 선택 */}
      <section>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mb-3 text-sm font-semibold text-ink-muted hover:text-ink"
        >
          전체 산업 {showAll ? "▴ 접기" : "▾ 펼치기"} ({catalog.length})
        </button>
        {showAll && (
          <>
            <div className="flex flex-wrap gap-2">
              {catalog.map((c) => {
                const isPinned = followedIds.has(c.id);
                return (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-card py-1 pl-3 pr-1 text-sm"
                  >
                    <a href={`/industry/${c.id}`} className="hover:text-primary">
                      {c.name}
                    </a>
                    <button
                      onClick={() => togglePin(c.id, isPinned)}
                      className={`rounded-full px-1.5 ${isPinned ? "text-primary" : "text-ink-muted hover:text-primary"}`}
                      title={isPinned ? "관심 해제" : "관심 추가"}
                    >
                      {isPinned ? "★" : "☆"}
                    </button>
                  </span>
                );
              })}
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
          </>
        )}
      </section>

      {/* 최근 리포트 피드 */}
      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-ink-muted">최근 리포트 ({recent.length})</h2>
        {recent.length === 0 ? (
          <p className="rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
            업로드한 리포트가 없어요. 우측 상단 &quot;+ 리포트 업로드&quot;로 PDF·텍스트를 올려보세요.
          </p>
        ) : (
          <div className="space-y-2">
            {recent.map((r) => (
              <ReportCard key={r.id} report={r} onDelete={deleteReport} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
