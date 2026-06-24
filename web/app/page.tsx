"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type User, type Lens, type Industry, type MyIndustry, type JobRole, type Report, type Usage, type PublicContent } from "@/lib/api";
import { ReportCard } from "@/components/report-card";
import { PublicCard } from "@/components/public-card";
import { Logo } from "@/components/logo";
import { LoginPanel } from "@/components/login-panel";
import { UsageBadge } from "@/components/usage-badge";

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
  const [usage, setUsage] = useState<Usage | null>(null);
  const [pub, setPub] = useState<PublicContent[]>([]);
  const [view, setView] = useState<"all" | "bookmarks" | "hidden">("all");
  const [newIndustry, setNewIndustry] = useState("");
  const [showAll, setShowAll] = useState(false);

  // 탭(view)에 맞는 리포트+공공 콘텐츠 피드 로드
  const loadFeed = useCallback(async (v: "all" | "bookmarks" | "hidden") => {
    const [{ reports }, pc] = await Promise.all([
      api.myReports({ view: v }),
      (v === "all" ? api.publicContents() : v === "bookmarks" ? api.bookmarkedContents() : api.hiddenContents()).catch(() => ({
        contents: [],
      })),
    ]);
    setRecent(reports);
    setPub(pc.contents);
  }, []);

  const loadData = useCallback(async () => {
    const [{ lenses }, { enabled, jobRole }, { jobRoles }, mi, { industries }, u] = await Promise.all([
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
    setUsage(u);
  }, []);

  useEffect(() => {
    (async () => {
      const me = await api.me().catch(() => ({ user: null }));
      setUser(me.user);
      if (me.user) await Promise.all([loadData().catch(() => {}), loadFeed("all").catch(() => {})]);
      setLoaded(true);
    })();
  }, [loadData, loadFeed]);

  function switchView(v: "all" | "bookmarks" | "hidden") {
    setView(v);
    loadFeed(v).catch(() => {});
  }

  // 분석중 리포트 있으면 폴링
  useEffect(() => {
    if (user && recent.some((r) => r.parseStatus === "pending" || r.parseStatus === "parsing")) {
      const t = setInterval(() => loadFeed(view).catch(() => {}), 2500);
      return () => clearInterval(t);
    }
  }, [user, recent, loadFeed, view]);

  if (!loaded) return <main className="p-12 text-ink-muted">불러오는 중...</main>;

  if (!user) {
    return (
      <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-12 px-6 py-12 md:grid-cols-2">
        {/* 좌: 소개 */}
        <section>
          <Logo size={36} className="text-2xl" />
          <h1 className="mt-6 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            산업을 내 관점으로
            <br />
            쌓아가는 리서치 데스크
          </h1>
          <p className="mt-4 text-ink-sub">
            산업·기업 리포트와 경제뉴스를 올리면, 취업·투자 관점으로 구조화하고 산업별로 시간순 누적합니다. PDF로도 정리해 가져갈 수 있어요.
          </p>
          <ul className="mt-6 space-y-2.5 text-sm text-ink-sub">
            {[
              "PDF·텍스트 올리면 AI가 산업·문서타입 자동 분류",
              "취업(직무 15종)·투자 렌즈로 핵심사실·동인·리스크 구조화",
              "산업별 대시보드 + 월별 흐름(요약의 요약) 누적",
              "핵심 하이라이트 강조 + 단어 클릭 풀이로 쉽게 읽기",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs text-ink-muted">무료로 하루 3회 분석. 더 필요하면 Pro 또는 본인 API 키(BYO).</p>
        </section>

        {/* 우: 로그인 */}
        <section className="rounded-card bg-card p-7 shadow-card md:justify-self-end md:max-w-sm">
          <h2 className="text-lg font-bold">시작하기</h2>
          <p className="mt-1 text-sm text-ink-sub">소셜 계정으로 바로 시작하세요.</p>
          <div className="mt-6">
            <LoginPanel />
          </div>
        </section>
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
    setRecent((r) => r.filter((x) => x.id !== rid));
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">대시보드</h1>
          <UsageBadge usage={usage} />
        </div>
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
            + 업로드
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

      {/* 피드: 탭(전체/즐겨찾기/숨긴항목) — 리포트 + 공공 콘텐츠 통합 */}
      <section className="mt-10">
        <div className="mb-4 flex gap-1 border-b border-line">
          {([
            { k: "all", label: "전체보기" },
            { k: "bookmarks", label: "🔖 즐겨찾기" },
            { k: "hidden", label: "숨긴 항목" },
          ] as const).map((t) => (
            <button
              key={t.k}
              onClick={() => switchView(t.k)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                view === t.k ? "border-primary text-primary" : "border-transparent text-ink-sub hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {recent.length === 0 && pub.length === 0 ? (
          <p className="rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
            {view === "all"
              ? "표시할 자료가 없어요. 우측 상단 “+ 업로드”로 리포트·뉴스를 올리거나, 아래 산업에서 공공 콘텐츠를 확인하세요."
              : view === "bookmarks"
                ? "즐겨찾기한 항목이 없어요. 카드의 책갈피를 눌러 추가하세요."
                : "숨긴 항목이 없어요."}
          </p>
        ) : (
          <div className="space-y-2">
            {recent.map((r) => (
              <ReportCard
                key={r.id}
                report={r}
                variant={view}
                onDelete={deleteReport}
                onRemoved={(id) => setRecent((p) => p.filter((x) => x.id !== id))}
              />
            ))}
            {pub.map((c) => (
              <PublicCard
                key={c.id}
                content={c}
                variant={view === "all" ? "feed" : view}
                onRemoved={(id) => setPub((p) => p.filter((x) => x.id !== id))}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
