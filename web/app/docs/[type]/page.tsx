"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, type Report, type MyIndustry } from "@/lib/api";
import { ReportCard } from "@/components/report-card";

const TYPE_LABEL: Record<string, string> = { industry: "산업리포트", company: "기업리포트", news: "뉴스" };
const dnum = (r: Report) => new Date(r.pubDate ?? r.createdAt).getTime();
const byDateDesc = (a: Report, b: Report) => dnum(b) - dnum(a);
const norm = (s: string) => s.replace(/\s/g, "").toLowerCase();
const newsMentions = (r: Report, name: string) => norm(`${r.title ?? ""} ${r.summary ?? ""}`).includes(norm(name));

// 기업리포트: (계열별 또는 산업별) → 기업. 관련 뉴스는 리스트에 함께([뉴스] 배지·색차별). 산업리포트=산업별.
export default function DocsFeed() {
  const { type } = useParams<{ type: string }>();
  const label = TYPE_LABEL[type] ?? "문서";
  const [all, setAll] = useState<Report[]>([]);
  const [followed, setFollowed] = useState<MyIndustry[]>([]);
  const [groupMap, setGroupMap] = useState<Record<string, string>>({});
  const [companyBy, setCompanyBy] = useState<"group" | "industry">("group"); // 기업리포트 상위 분류
  const [indFilter, setIndFilter] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [company, setCompany] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const me = await api.me().catch(() => ({ user: null }));
    if (!me.user) {
      window.location.href = "/login";
      return;
    }
    const [{ reports }, mi, cg] = await Promise.all([
      api.myReports(),
      api.myIndustries().catch(() => ({ industries: [] as MyIndustry[] })),
      api.companyGroups().catch(() => ({ map: {} as Record<string, string> })),
    ]);
    setAll(reports);
    setFollowed(mi.industries);
    setGroupMap(cg.map);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch(() => setLoaded(true));
  }, [load]);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("c")) setCompany(q.get("c"));
    if (q.get("i")) setIndFilter(q.get("i"));
  }, []);
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

  const reports = all.filter((r) => r.docType === type);
  const news = all.filter((r) => r.docType === "news");
  const onDelete = async (rid: string) => {
    await api.deleteReport(rid);
    load();
  };
  const groupOf = (co?: string | null) => (co ? groupMap[co.trim()] ?? "기타" : "기타");
  const newsFor = (companies: string[]) => news.filter((r) => companies.some((n) => newsMentions(r, n)));

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
  const groupChips = [...groupCount.entries()].sort((a, b) => (a[0] === "기타" ? 1 : b[0] === "기타" ? -1 : b[1] - a[1])).map(([g]) => g);

  // 기업리포트 상위 필터(계열 또는 산업)
  const cFilter = companyBy === "group" ? groupFilter : indFilter;
  const inScope = (r: Report) =>
    companyBy === "group" ? groupOf(r.company) === cFilter : (r.industries ?? []).some((i) => i.id === cFilter);
  const companyChips =
    type === "company"
      ? [...new Set(reports.filter((r) => !cFilter || inScope(r)).map((r) => r.company?.trim()).filter((c): c is string => !!c))].sort()
      : [];

  const relatedCompanyReports =
    type === "industry" && indFilter
      ? all.filter((r) => r.docType === "company" && (r.industries ?? []).some((i) => i.id === indFilter)).sort(byDateDesc)
      : [];

  // ── 본문 ──
  let body: React.ReactNode;
  if (reports.length === 0) {
    body = (
      <p className="mt-6 rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
        아직 {label}로 분류된 문서가 없어요. <a href="/upload" className="text-primary">업로드</a> 하면 AI 가 자동 분류합니다.
      </p>
    );
  } else if (type === "news") {
    const list = (indFilter ? reports.filter((r) => (r.industries ?? []).some((i) => i.id === indFilter)) : reports).sort(byDateDesc);
    body = <List reports={list} onDelete={onDelete} />;
  } else if (type === "company") {
    if (company) {
      body = <List reports={[...reports.filter((r) => r.company?.trim() === company), ...newsFor([company])].sort(byDateDesc)} onDelete={onDelete} />;
    } else if (cFilter) {
      const inReports = reports.filter(inScope);
      const companies = [...new Set(inReports.map((r) => r.company?.trim()).filter((c): c is string => !!c))];
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
        .sort((a, b) => (a.key === "기타" || a.key === "_none" ? 1 : b.key === "기타" || b.key === "_none" ? -1 : b.count - a.count));
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
            <Chip key={g} label={g} active={groupFilter === g} onClick={() => { setGroupFilter(g); setCompany(null); }} />
          ))}
        </div>
      )}
      {/* tier2: 기업 칩 */}
      {type === "company" && cFilter && companyChips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-l-2 border-line pl-2">
          <Chip label={`${cFilter} 전체`} active={!company} onClick={() => setCompany(null)} small />
          {companyChips.map((c) => (
            <Chip key={c} label={c} active={company === c} onClick={() => setCompany(c)} small />
          ))}
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
