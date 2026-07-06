"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type User, type Lens, type Industry, type MyIndustry, type JobRole, type Report, type Usage, type PublicContent } from "@/lib/api";
import { ReportCard } from "@/components/report-card";
import { PublicCard } from "@/components/public-card";
import { Logo } from "@/components/logo";
import { LoginPanel } from "@/components/login-panel";
import { UsageBadge } from "@/components/usage-badge";

// 기간 선택(연도→월→일). 미선택이면 최근 3개월.
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
type DateSel = { year: number | null; month: number | null; day: number | null };
function computeRange(d: DateSel): { from: string; to: string } {
  const now = new Date();
  if (!d.year) return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())), to: ymd(now) };
  if (!d.month) return { from: `${d.year}-01-01`, to: `${d.year}-12-31` };
  const last = new Date(d.year, d.month, 0).getDate();
  if (!d.day) return { from: `${d.year}-${pad(d.month)}-01`, to: `${d.year}-${pad(d.month)}-${pad(last)}` };
  return { from: `${d.year}-${pad(d.month)}-${pad(d.day)}`, to: `${d.year}-${pad(d.month)}-${pad(d.day)}` };
}
const DOC_FILTERS = [
  { k: "all", label: "전체" },
  { k: "industry", label: "산업" },
  { k: "company", label: "기업" },
  { k: "news", label: "뉴스" },
  { k: "public", label: "공공" },
] as const;
type DocFilter = (typeof DOC_FILTERS)[number]["k"];
// 메뉴 칩 활성 색 = 카드 톤과 통일
const CHIP_TONE: Record<DocFilter, string> = {
  all: "border-primary bg-primary/10 text-primary",
  industry: "border-violet-300 bg-violet-100 text-violet-700",
  company: "border-amber-300 bg-amber-100 text-amber-700",
  news: "border-sky-300 bg-sky-100 text-sky-700",
  public: "border-emerald-300 bg-emerald-100 text-emerald-700",
};

// 필터 상태를 URL 에 저장/복원(리포트 클릭 → 뒤로가기 시 필터 유지). 카드가 전체 이동이라 URL 필수.
type FeedState = { view: "all" | "bookmarks" | "hidden"; docFilter: DocFilter; dateSel: DateSel; page: number; hidePublic: boolean };
function readFeedUrl(): FeedState {
  const def: FeedState = { view: "all", docFilter: "all", dateSel: { year: null, month: null, day: null }, page: 1, hidePublic: true };
  if (typeof window === "undefined") return def;
  const q = new URLSearchParams(window.location.search);
  const v = q.get("view");
  const df = q.get("doc");
  const num = (x: string | null) => (x && Number.isFinite(Number(x)) ? Number(x) : null);
  const p = num(q.get("page"));
  return {
    view: v === "bookmarks" || v === "hidden" ? v : "all",
    docFilter: (DOC_FILTERS.some((f) => f.k === df) ? df : "all") as DocFilter,
    dateSel: { year: num(q.get("y")), month: num(q.get("m")), day: num(q.get("d")) },
    page: p && p > 0 ? p : 1,
    hidePublic: q.get("sp") !== "1", // 기본 숨김. sp=1 이면 공공 표시
  };
}
function writeFeedUrl(s: FeedState) {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams();
  if (s.view !== "all") q.set("view", s.view);
  if (s.docFilter !== "all") q.set("doc", s.docFilter);
  if (s.dateSel.year) q.set("y", String(s.dateSel.year));
  if (s.dateSel.month) q.set("m", String(s.dateSel.month));
  if (s.dateSel.day) q.set("d", String(s.dateSel.day));
  if (s.page !== 1) q.set("page", String(s.page));
  if (!s.hidePublic) q.set("sp", "1"); // 공공 표시일 때만 URL 에 기록(기본은 숨김)
  const qs = q.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

// 눈 아이콘(off=감김 = 공공 숨김 상태)
function EyeIcon({ off }: { off: boolean }) {
  return off ? (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24M1 1l22 22" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// 기간 선택 UI: 연도 → 월 → 일 (미선택=최근 3개월)
function DateRange({ sel, onChange }: { sel: DateSel; onChange: (d: DateSel) => void }) {
  const nowY = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => nowY - i);
  const days = sel.year && sel.month ? new Date(sel.year, sel.month, 0).getDate() : 0;
  const cls = "rounded-lg border border-line bg-card px-2 py-1 text-xs outline-none focus:border-primary";
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-ink-muted">기간</span>
      <select className={cls} value={sel.year ?? ""} onChange={(e) => onChange({ year: e.target.value ? Number(e.target.value) : null, month: null, day: null })}>
        <option value="">최근 3개월</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}년</option>
        ))}
      </select>
      {sel.year && (
        <select className={cls} value={sel.month ?? ""} onChange={(e) => onChange({ ...sel, month: e.target.value ? Number(e.target.value) : null, day: null })}>
          <option value="">전체 월</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>{m}월</option>
          ))}
        </select>
      )}
      {sel.year && sel.month && (
        <select className={cls} value={sel.day ?? ""} onChange={(e) => onChange({ ...sel, day: e.target.value ? Number(e.target.value) : null })}>
          <option value="">전체 일</option>
          {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>{d}일</option>
          ))}
        </select>
      )}
    </div>
  );
}

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
  const [docFilter, setDocFilter] = useState<DocFilter>("all");
  const [dateSel, setDateSel] = useState<DateSel>({ year: null, month: null, day: null });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hidePublic, setHidePublic] = useState(true);
  const [isDev, setIsDev] = useState(false);
  const [newIndustry, setNewIndustry] = useState("");
  const [showAll, setShowAll] = useState(false);
  const PAGE_SIZE = 20;

  // 탭(view)·docType·기간·페이지에 맞는 리포트+공공 로드. hp=공공 숨기기(전체 뷰에서만 적용).
  const loadFeed = useCallback(async (v: "all" | "bookmarks" | "hidden", p: number, df: DocFilter, ds: DateSel, hp: boolean) => {
    const { from, to } = computeRange(ds);
    const dt = df === "industry" || df === "company" || df === "news" ? df : undefined;
    const repP =
      df === "public"
        ? Promise.resolve({ reports: [] as Report[], total: 0 })
        : api.myReports({ view: v, docType: dt, from, to, page: p });
    // 공공: 전체 뷰(all)에서 df=all(숨기기 아닐 때) 또는 df=public 일 때 로드. 저장/숨김 탭은 각 목록.
    const wantPublic = v === "all" && (df === "public" || (df === "all" && !hp));
    const pubP =
      p !== 1
        ? Promise.resolve({ contents: [] as PublicContent[] })
        : v === "all"
          ? wantPublic
            ? api.publicContents({ from, to })
            : Promise.resolve({ contents: [] as PublicContent[] })
          : v === "bookmarks"
            ? api.bookmarkedContents()
            : api.hiddenContents();
    const [rep, pc] = await Promise.all([repP, pubP.catch(() => ({ contents: [] as PublicContent[] }))]);
    setRecent(rep.reports);
    setTotal(rep.total ?? rep.reports.length);
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
    api.llmSetting().then((s) => setIsDev(s.isDeveloper)).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const me = await api.me().catch(() => ({ user: null }));
      setUser(me.user);
      if (me.user) {
        const init = readFeedUrl(); // URL 에 저장된 필터 복원(뒤로가기)
        setView(init.view);
        setDocFilter(init.docFilter);
        setDateSel(init.dateSel);
        setPage(init.page);
        setHidePublic(init.hidePublic);
        await Promise.all([
          loadData().catch(() => {}),
          loadFeed(init.view, init.page, init.docFilter, init.dateSel, init.hidePublic).catch(() => {}),
        ]);
      }
      setLoaded(true);
    })();
  }, [loadData, loadFeed]);

  function switchView(v: "all" | "bookmarks" | "hidden") {
    setView(v);
    setPage(1);
    writeFeedUrl({ view: v, docFilter, dateSel, page: 1, hidePublic });
    loadFeed(v, 1, docFilter, dateSel, hidePublic).catch(() => {});
  }
  function goPage(p: number) {
    setPage(p);
    writeFeedUrl({ view, docFilter, dateSel, page: p, hidePublic });
    loadFeed(view, p, docFilter, dateSel, hidePublic).catch(() => {});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function applyDoc(df: DocFilter) {
    setDocFilter(df);
    setPage(1);
    writeFeedUrl({ view, docFilter: df, dateSel, page: 1, hidePublic });
    loadFeed(view, 1, df, dateSel, hidePublic).catch(() => {});
  }
  function applyDate(ds: DateSel) {
    setDateSel(ds);
    setPage(1);
    writeFeedUrl({ view, docFilter, dateSel: ds, page: 1, hidePublic });
    loadFeed(view, 1, docFilter, ds, hidePublic).catch(() => {});
  }
  function toggleHidePublic() {
    const hp = !hidePublic;
    setHidePublic(hp);
    setPage(1);
    writeFeedUrl({ view, docFilter, dateSel, page: 1, hidePublic: hp });
    loadFeed(view, 1, docFilter, dateSel, hp).catch(() => {});
  }
  async function runIngestPublic() {
    try {
      await api.ingestPublic();
      alert("공공 콘텐츠를 불러오는 중이에요. 1~2분 후 새로고침하면 반영됩니다.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "실행 실패");
    }
  }

  // 분석중 리포트 있으면 폴링
  useEffect(() => {
    if (user && recent.some((r) => r.parseStatus === "pending" || r.parseStatus === "parsing")) {
      const t = setInterval(() => loadFeed(view, page, docFilter, dateSel, hidePublic).catch(() => {}), 2500);
      return () => clearInterval(t);
    }
  }, [user, recent, loadFeed, view, page, docFilter, dateSel, hidePublic]);

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
        <div className="mb-3 flex items-center gap-1 border-b border-line">
          {([
            { k: "all", label: "전체보기" },
            { k: "bookmarks", label: "저장" },
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

        {/* docType + 기간 필터 */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {DOC_FILTERS.map((f) => (
              <button
                key={f.k}
                onClick={() => applyDoc(f.k)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  docFilter === f.k ? CHIP_TONE[f.k] : "border-line text-ink-sub hover:bg-bg-deep"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {view === "all" && docFilter === "all" && (
              <button
                onClick={toggleHidePublic}
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/70"
                title="전체 목록에서 공공 콘텐츠를 감춰요"
              >
                <EyeIcon off={hidePublic} />
                {hidePublic ? "공공 보기" : "공공 숨기기"}
              </button>
            )}
            {isDev && view === "all" && docFilter === "public" && (
              <button
                onClick={runIngestPublic}
                className="text-xs font-semibold text-primary hover:text-primary/70"
                title="공개 소스(정책브리핑 등)에서 최신 공공 콘텐츠를 불러와요 (개발자)"
              >
                공공 불러오기
              </button>
            )}
            <DateRange sel={dateSel} onChange={applyDate} />
          </div>
        </div>

        {(() => {
          const items = [
            ...recent.map((r) => ({
              k: `r-${r.id}`,
              d: r.pubDate ?? r.createdAt,
              n: (
                <ReportCard report={r} variant={view} onDelete={deleteReport} onRemoved={(id) => setRecent((p) => p.filter((x) => x.id !== id))} />
              ),
            })),
            ...(page === 1
              ? pub.map((c) => ({
                  k: `p-${c.id}`,
                  d: c.pubDate ?? "",
                  n: <PublicCard content={c} variant={view === "all" ? "feed" : view} onRemoved={(id) => setPub((p) => p.filter((x) => x.id !== id))} />,
                }))
              : []),
          ].sort((a, b) => new Date(b.d || 0).getTime() - new Date(a.d || 0).getTime());
          return items.length === 0 ? (
            <p className="rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
              {view === "all" ? "이 기간·분류에 표시할 자료가 없어요. 기간을 넓히거나 “+ 업로드” 해보세요." : view === "bookmarks" ? "저장한 항목이 없어요." : "숨긴 항목이 없어요."}
            </p>
          ) : (
            <div className="space-y-2">{items.map((x) => <div key={x.k}>{x.n}</div>)}</div>
          );
        })()}

        {/* 페이지 (1,2,3...) */}
        {total > PAGE_SIZE && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-1">
            <button
              onClick={() => goPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="rounded-lg border border-line px-2.5 py-1 text-sm text-ink-sub disabled:opacity-40"
            >
              ‹
            </button>
            {Array.from({ length: Math.ceil(total / PAGE_SIZE) }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => goPage(p)}
                className={`rounded-lg px-3 py-1 text-sm font-medium ${
                  p === page ? "bg-primary text-white" : "text-ink-sub hover:bg-bg-deep"
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => goPage(Math.min(Math.ceil(total / PAGE_SIZE), page + 1))}
              disabled={page >= Math.ceil(total / PAGE_SIZE)}
              className="rounded-lg border border-line px-2.5 py-1 text-sm text-ink-sub disabled:opacity-40"
            >
              ›
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
