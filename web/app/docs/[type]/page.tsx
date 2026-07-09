"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, type Report, type MyIndustry } from "@/lib/api";
import { useScrollRestore } from "@/lib/use-scroll-restore";
import { ReportCard } from "@/components/report-card";
import { companyAliases, foreignCountryOf, isForeignName, KNOWN_COMPANY_CHIPS } from "@/lib/companies";
import { hasReportSearch, matchesReportSearch, ReportSearchControls, type ReportSearchState } from "@/components/report-search-controls";

const TYPE_LABEL: Record<string, string> = { industry: "산업리포트", company: "기업리포트", news: "뉴스" };
const dnum = (r: Report) => new Date(r.pubDate ?? r.createdAt).getTime();
const byDateDesc = (a: Report, b: Report) => dnum(b) - dnum(a);
const norm = (s: string) => s.replace(/\s/g, "").toLowerCase();
const newsMentions = (r: Report, name: string) => norm(`${r.title ?? ""} ${r.summary ?? ""}`).includes(norm(name));
const newsMentionsCompany = (r: Report, name: string) => companyAliases(name).some((alias) => newsMentions(r, alias));
const sameCompanyName = (value: string, name: string) => companyAliases(name).some((alias) => norm(value) === norm(alias));

// 기업리포트: (계열별 또는 산업별) → 기업. 관련 뉴스는 리스트에 함께([뉴스] 배지·색차별). 산업리포트=산업별.
export default function DocsFeed() {
  const { type } = useParams<{ type: string }>();
  const label = TYPE_LABEL[type] ?? "문서";
  const [all, setAll] = useState<Report[]>([]);
  const [followed, setFollowed] = useState<MyIndustry[]>([]);
  const [groupMap, setGroupMap] = useState<Record<string, string>>({});
  const [favGroups, setFavGroups] = useState<Set<string>>(new Set());
  const [favCompanies, setFavCompanies] = useState<Set<string>>(new Set());
  const [companyBy, setCompanyBy] = useState<"group" | "industry">("group"); // 기업리포트 상위 분류
  const [indFilter, setIndFilter] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [company, setCompany] = useState<string | null>(null);
  const [search, setSearch] = useState<ReportSearchState>({ q: "", from: "", to: "" });
  const [loaded, setLoaded] = useState(false);
  useScrollRestore(loaded);

  const load = useCallback(async () => {
    const me = await api.me().catch(() => ({ user: null }));
    if (!me.user) {
      window.location.href = "/login";
      return;
    }
    const [{ reports }, mi, cg, fav] = await Promise.all([
      api.myReports(),
      api.myIndustries().catch(() => ({ industries: [] as MyIndustry[] })),
      api.companyGroups().catch(() => ({ map: {} as Record<string, string> })),
      api.companyFavorites().catch(() => ({ groups: [] as string[], companies: [] as string[] })),
    ]);
    setAll(reports);
    setFollowed(mi.industries);
    setGroupMap(cg.map);
    setFavGroups(new Set(fav.groups));
    setFavCompanies(new Set(fav.companies));
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch(() => setLoaded(true));
  }, [load]);
  // 필터 URL 복원(리포트 클릭 → 뒤로가기 시 유지)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("by") === "industry" || q.get("by") === "group") setCompanyBy(q.get("by") as "group" | "industry");
    if (q.get("c")) setCompany(q.get("c"));
    if (q.get("i")) setIndFilter(q.get("i"));
    if (q.get("g")) setGroupFilter(q.get("g"));
    setSearch({ q: q.get("q") ?? "", from: q.get("from") ?? "", to: q.get("to") ?? "" });
  }, []);
  // 필터 변경 시 URL 저장
  useEffect(() => {
    if (!loaded) return;
    const q = new URLSearchParams();
    if (type === "company") q.set("by", companyBy);
    if (indFilter) q.set("i", indFilter);
    if (groupFilter) q.set("g", groupFilter);
    if (company) q.set("c", company);
    if (search.q.trim()) q.set("q", search.q.trim());
    if (search.from) q.set("from", search.from);
    if (search.to) q.set("to", search.to);
    const qs = q.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [loaded, type, companyBy, indFilter, groupFilter, company, search]);
  useEffect(() => {
    if (all.some((r) => r.parseStatus === "pending" || r.parseStatus === "parsing")) {
      const t = setInterval(() => load().catch(() => {}), 2500);
      return () => clearInterval(t);
    }
  }, [all, load]);

  if (!loaded) return <main className="p-12 text-ink-muted">불러오는 중...</main>;
  if (!TYPE_LABEL[type])
    return (
      <main className="p-12 text-ink-sub">
        알 수 없는 분류. <a href="/" className="text-primary">대시보드</a>
      </main>
    );

  const baseReports = all.filter((r) => r.docType === type);
  const reports = baseReports.filter((r) => matchesReportSearch(r, search));
  const news = all.filter((r) => r.docType === "news" && matchesReportSearch(r, search));
  const onDelete = async (rid: string) => {
    await api.deleteReport(rid);
    load();
  };
  // 계열 미매칭 기업은 국내/해외 기타로 분리. 라틴명 또는 알려진 해외 기업(한글 음차) → 해외.
  // 해외 기업 국가(알려진 곳만). 라틴명 미상은 "해외". 계열 매핑된 국내 기업은 국가 표기 안 함.
  const foreignCountry = (co?: string | null) => {
    if (!co) return "";
    const c = co.trim();
    if (groupMap[c]) return ""; // 계열 매핑된 국내 기업
    return foreignCountryOf(c);
  };
  const groupOf = (co?: string | null) => {
    if (!co) return "국내 기타";
    const c = co.trim();
    if (groupMap[c]) return groupMap[c];
    return isForeignName(c) ? "해외 기타" : "국내 기타";
  };
  const isMisc = (k: string) => k === "국내 기타" || k === "해외 기타" || k === "기타" || k === "_none";
  const newsFor = (companies: string[]) => news.filter((r) => companies.some((n) => newsMentionsCompany(r, n)));

  async function toggleFav(kind: "group" | "company", value: string) {
    const cur = kind === "group" ? favGroups : favCompanies;
    const setFn = kind === "group" ? setFavGroups : setFavCompanies;
    const next = new Set(cur);
    if (cur.has(value)) {
      next.delete(value);
      await api.removeCompanyFavorite(kind, value).catch(() => {});
    } else {
      next.add(value);
      await api.addCompanyFavorite(kind, value).catch(() => {});
    }
    setFn(next);
  }

  const followedIds = followed.map((f) => f.id);
  const followedOrder = new Map(followed.map((f, i) => [f.id, i]));
  // 산업 칩
  const indPresent = new Map<string, string>();
  const indBase = type === "company" ? reports : reports; // 기업/산업/뉴스 각 타입 리포트
  for (const r of indBase) for (const i of r.industries ?? []) indPresent.set(i.id, i.name);
  const indChips = [...indPresent.entries()]
    .map(([id, name]) => ({ key: id, label: name, star: followedIds.includes(id) }))
    .sort((a, b) =>
      a.star !== b.star ? (a.star ? -1 : 1) : a.star ? (followedOrder.get(a.key) ?? 0) - (followedOrder.get(b.key) ?? 0) : a.label.localeCompare(b.label),
    );
  // 계열 칩
  const groupCount = new Map<string, number>();
  if (type === "company") for (const r of reports) groupCount.set(groupOf(r.company), (groupCount.get(groupOf(r.company)) ?? 0) + 1);
  if (type === "company")
    for (const c of KNOWN_COMPANY_CHIPS) {
      if (!reports.some((r) => r.company && sameCompanyName(r.company.trim(), c)) && news.some((r) => newsMentionsCompany(r, c))) {
        const g = groupOf(c);
        groupCount.set(g, (groupCount.get(g) ?? 0) + 1);
      }
    }
  const groupChips = [...groupCount.entries()]
    .sort((a, b) => {
      const fa = favGroups.has(a[0]);
      const fb = favGroups.has(b[0]);
      if (fa !== fb) return fa ? -1 : 1; // 별표 우선
      if (isMisc(a[0]) !== isMisc(b[0])) return isMisc(a[0]) ? 1 : -1;
      return b[1] - a[1];
    })
    .map(([g]) => g);

  // 기업리포트 상위 필터(계열 또는 산업)
  const cFilter = companyBy === "group" ? groupFilter : indFilter;
  const inScope = (r: Report) =>
    companyBy === "group" ? groupOf(r.company) === cFilter : (r.industries ?? []).some((i) => i.id === cFilter);
  const companyChipSort = (a: string, b: string) => {
    const fa = favCompanies.has(a);
    const fb = favCompanies.has(b);
    if (fa !== fb) return fa ? -1 : 1; // 별표 우선
    return a.localeCompare(b);
  };
  const reportCompanyChips =
    type === "company" ? [...new Set(reports.filter((r) => !cFilter || inScope(r)).map((r) => r.company?.trim()).filter((c): c is string => !!c))] : [];
  const knownNewsCompanyChips =
    type === "company" && companyBy === "group" && cFilter
      ? KNOWN_COMPANY_CHIPS.filter(
          (c) => !reportCompanyChips.some((name) => sameCompanyName(name, c)) && groupOf(c) === cFilter && news.some((r) => newsMentionsCompany(r, c)),
        )
      : [];
  const companyChips =
    type === "company" ? [...new Set([...reportCompanyChips, ...knownNewsCompanyChips])].sort(companyChipSort) : [];

  const relatedCompanyReports =
    type === "industry" && indFilter
      ? all.filter((r) => r.docType === "company" && (r.industries ?? []).some((i) => i.id === indFilter)).sort(byDateDesc)
      : [];

  // ── 본문 ──
  let body: React.ReactNode;
  if (baseReports.length === 0) {
    body = (
      <p className="mt-6 rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
        아직 {label}로 분류된 문서가 없어요. <a href="/upload" className="text-primary">업로드</a> 하면 AI 가 자동 분류합니다.
      </p>
    );
  } else if (reports.length === 0 && (type !== "company" || news.length === 0)) {
    body = (
      <p className="mt-6 rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
        조건에 맞는 결과가 없어요.
      </p>
    );
  } else if (type === "news") {
    const list = (indFilter ? reports.filter((r) => (r.industries ?? []).some((i) => i.id === indFilter)) : reports).sort(byDateDesc);
    body = <List reports={list} onDelete={onDelete} />;
  } else if (type === "company") {
    if (company) {
      const cc = foreignCountry(company);
      body = (
        <>
          <h2 className="mb-2 mt-1 text-base font-bold">
            {company}
            {cc && <span className="ml-1.5 text-sm font-normal text-ink-muted">({cc})</span>}
          </h2>
          <List reports={[...reports.filter((r) => r.company && sameCompanyName(r.company.trim(), company)), ...newsFor([company])].sort(byDateDesc)} onDelete={onDelete} />
        </>
      );
    } else if (cFilter) {
      const inReports = reports.filter(inScope);
      const companies = companyBy === "group" ? companyChips : [...new Set(inReports.map((r) => r.company?.trim()).filter((c): c is string => !!c))];
      body = <List reports={[...inReports, ...newsFor(companies)].sort(byDateDesc)} onDelete={onDelete} />;
    } else {
      // 전체: 계열/산업별 그룹 + 각 그룹의 뉴스 함께
      const map = new Map<string, { label: string; reports: Report[] }>();
      const add = (key: string, label: string, r: Report) => {
        const g = map.get(key) ?? { label, reports: [] };
        g.reports.push(r);
        map.set(key, g);
      };
      for (const r of reports) {
        if (companyBy === "group") add(groupOf(r.company), groupOf(r.company), r);
        else {
          const inds = r.industries ?? [];
          if (inds.length === 0) add("_none", "미분류", r);
          else for (const i of inds) add(i.id, i.name, r);
        }
      }
      const sections = [...map.entries()]
        .map(([key, v]) => {
          const companies = [...new Set(v.reports.map((r) => r.company?.trim()).filter((c): c is string => !!c))];
          const merged = [...v.reports, ...newsFor(companies)].sort(byDateDesc);
          return { key, label: v.label, star: followedIds.includes(key), reports: merged, count: v.reports.length };
        })
        .sort((a, b) => (isMisc(a.key) ? 1 : isMisc(b.key) ? -1 : b.count - a.count));
      body = <Grouped groups={sections} onDelete={onDelete} />;
    }
  } else {
    // industry
    if (indFilter) body = <List reports={reports.filter((r) => (r.industries ?? []).some((i) => i.id === indFilter)).sort(byDateDesc)} onDelete={onDelete} />;
    else body = <Grouped groups={buildIndustryGroups(reports, followed)} onDelete={onDelete} />;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">{label}</h1>
      <p className="mt-1 text-sm text-ink-sub">
        {type === "industry"
          ? "산업별로 골라 보고, 그 산업의 기업 리포트까지 연결돼요."
          : type === "company"
            ? "계열별/산업별 → 기업 순으로 보고, 관련 뉴스도 함께 떠요."
            : "산업별로 골라 보거나 전체를 발간일 최신순으로."}
      </p>

      <div className="mt-5">
        <ReportSearchControls
          value={search}
          onChange={(next) => {
            setSearch(next);
            setCompany(null);
          }}
          placeholder="제목이나 부제목 검색"
        />
        {hasReportSearch(search) && (
          <p className="mt-2 text-xs text-ink-muted">
            검색 결과 {reports.length}건
          </p>
        )}
      </div>

      {/* 기업: 계열별/산업별 토글 */}
      {type === "company" && (
        <div className="mt-4 inline-flex gap-1 rounded-lg border border-line p-1">
          {([
            { k: "group", label: "계열별" },
            { k: "industry", label: "산업별" },
          ] as const).map((m) => (
            <button
              key={m.k}
              onClick={() => { setCompanyBy(m.k); setGroupFilter(null); setIndFilter(null); setCompany(null); }}
              className={`rounded-md px-3 py-1 text-sm font-medium ${companyBy === m.k ? "bg-primary text-white" : "text-ink-sub hover:bg-bg-deep"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* tier1: 산업(산업/뉴스, 기업-산업모드) 또는 계열(기업-계열모드) */}
      {((type !== "company" && indChips.length > 0) || (type === "company" && companyBy === "industry" && indChips.length > 0)) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip label="전체" active={!indFilter} onClick={() => { setIndFilter(null); setCompany(null); }} />
          {indChips.map((ch) => (
            <Chip key={ch.key} label={(ch.star ? "★ " : "") + ch.label} active={indFilter === ch.key} onClick={() => { setIndFilter(ch.key); setCompany(null); }} />
          ))}
        </div>
      )}
      {type === "company" && companyBy === "group" && groupChips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip label="전체" active={!groupFilter} onClick={() => { setGroupFilter(null); setCompany(null); }} />
          {groupChips.map((g) => (
            <span
              key={g}
              className={`inline-flex items-center gap-1 rounded-full border py-1 pl-3 text-sm font-medium ${isMisc(g) ? "pr-3" : "pr-1"} ${
                groupFilter === g ? "border-primary bg-primary/10 text-primary" : "border-line text-ink-sub"
              }`}
            >
              <button onClick={() => { setGroupFilter(g); setCompany(null); }}>{g}</button>
              {!isMisc(g) && (
                <button
                  onClick={() => toggleFav("group", g)}
                  className={`rounded-full px-1 ${favGroups.has(g) ? "text-amber-500" : "text-ink-muted hover:text-amber-500"}`}
                  title={favGroups.has(g) ? "별표 해제" : "별표"}
                >
                  {favGroups.has(g) ? "★" : "☆"}
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {/* tier2: 개별 기업 — 큰 카테고리와 색·섹션으로 구분(tint 패널) */}
      {type === "company" && cFilter && companyChips.length > 0 && (
        <div className="mt-4 rounded-card bg-primary/5 p-4 ring-1 ring-primary/15">
          <div className="mb-3 text-xs font-semibold text-primary">
            {companyBy === "group" ? cFilter : indChips.find((ch) => ch.key === cFilter)?.label ?? "산업"} · 개별 기업 ({companyChips.length})
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCompany(null)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                !company ? "bg-primary text-white" : "bg-card text-ink-sub ring-1 ring-primary/20 hover:bg-primary/10"
              }`}
            >
              전체
            </button>
            {companyChips.map((c) => (
              <span
                key={c}
                className={`inline-flex items-center gap-0.5 rounded-full py-0.5 pl-2.5 pr-1 text-xs font-medium ${
                  company === c ? "bg-primary text-white" : "bg-card text-ink-sub ring-1 ring-primary/20"
                }`}
              >
                <button onClick={() => setCompany(c)}>{c}</button>
                <button
                  onClick={() => toggleFav("company", c)}
                  className={`rounded-full px-0.5 ${
                    favCompanies.has(c) ? "text-amber-400" : company === c ? "text-white/70 hover:text-white" : "text-ink-muted hover:text-amber-500"
                  }`}
                  title={favCompanies.has(c) ? "별표 해제" : "별표"}
                >
                  {favCompanies.has(c) ? "★" : "☆"}
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {body}

      {relatedCompanyReports.length > 0 && (
        <section className="mt-8 border-t border-line pt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink-muted">🏢 이 산업의 기업 리포트 ({relatedCompanyReports.length})</h2>
          <List reports={relatedCompanyReports} onDelete={onDelete} />
        </section>
      )}
    </main>
  );
}

function Chip({ label, active, onClick, small }: { label: string; active: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border font-medium ${small ? "px-2.5 py-0.5 text-[11px]" : "px-3 py-1 text-xs"} ${
        active ? "border-primary bg-primary/10 text-primary" : "border-line text-ink-sub hover:bg-bg-deep"
      }`}
    >
      {label}
    </button>
  );
}

function List({ reports, onDelete }: { reports: Report[]; onDelete: (id: string) => void }) {
  return (
    <div className="mt-6 space-y-2">
      {reports.map((r) => (
        <ReportCard key={r.id} report={r} onDelete={onDelete} />
      ))}
    </div>
  );
}

function Grouped({
  groups,
  onDelete,
}: {
  groups: { key: string; label: string; star: boolean; reports: Report[] }[];
  onDelete: (id: string) => void;
}) {
  return (
    <div className="mt-6 space-y-7">
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-muted">
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-primary">
              {g.star ? "★ " : ""}
              {g.label}
            </span>
            <span className="text-xs text-ink-muted">{g.reports.length}</span>
          </h2>
          <div className="space-y-2">
            {g.reports.map((r) => (
              <ReportCard key={r.id} report={r} onDelete={onDelete} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function buildIndustryGroups(
  reports: Report[],
  followed: MyIndustry[],
): { key: string; label: string; star: boolean; reports: Report[] }[] {
  const map = new Map<string, { label: string; reports: Report[] }>();
  for (const r of reports) {
    const inds = r.industries ?? [];
    if (inds.length === 0) {
      const g = map.get("_none") ?? { label: "미분류", reports: [] };
      g.reports.push(r);
      map.set("_none", g);
    } else
      for (const i of inds) {
        const g = map.get(i.id) ?? { label: i.name, reports: [] };
        g.reports.push(r);
        map.set(i.id, g);
      }
  }
  const followedIds = followed.map((f) => f.id);
  const followedOrder = new Map(followed.map((f, i) => [f.id, i]));
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: v.label, star: followedIds.includes(key), reports: v.reports.sort(byDateDesc) }))
    .sort((a, b) => {
      if (a.key === "_none") return 1;
      if (b.key === "_none") return -1;
      if (a.star && b.star) return (followedOrder.get(a.key) ?? 0) - (followedOrder.get(b.key) ?? 0);
      if (a.star !== b.star) return a.star ? -1 : 1;
      return b.reports.length - a.reports.length;
    });
}
