"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, type Report, type MyIndustry } from "@/lib/api";
import { ReportCard } from "@/components/report-card";

const TYPE_LABEL: Record<string, string> = { industry: "산업리포트", company: "기업리포트", news: "뉴스" };
const dnum = (r: Report) => new Date(r.pubDate ?? r.createdAt).getTime();
const byDateDesc = (a: Report, b: Report) => dnum(b) - dnum(a);
const norm = (s: string) => s.replace(/\s/g, "").toLowerCase();

// 산업리포트=산업별 필터(★우선)+그 산업의 기업 연결. 기업리포트=산업별 2단계(산업→기업)+관련 뉴스. 뉴스=최신순.
export default function DocsFeed() {
  const { type } = useParams<{ type: string }>();
  const label = TYPE_LABEL[type] ?? "문서";
  const [all, setAll] = useState<Report[]>([]);
  const [followed, setFollowed] = useState<MyIndustry[]>([]);
  const [indFilter, setIndFilter] = useState<string | null>(null); // 산업 필터(공용 tier1)
  const [company, setCompany] = useState<string | null>(null); // 기업 필터(tier2)
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const me = await api.me().catch(() => ({ user: null }));
    if (!me.user) {
      window.location.href = "/login";
      return;
    }
    const [{ reports }, mi] = await Promise.all([
      api.myReports(),
      api.myIndustries().catch(() => ({ industries: [] as MyIndustry[] })),
    ]);
    setAll(reports);
    setFollowed(mi.industries);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch(() => setLoaded(true));
  }, [load]);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const c = q.get("c");
    const i = q.get("i");
    if (c) setCompany(c);
    if (i) setIndFilter(i);
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
  const onDelete = async (rid: string) => {
    await api.deleteReport(rid);
    load();
  };

  const followedIds = followed.map((f) => f.id);
  const followedOrder = new Map(followed.map((f, i) => [f.id, i]));
  // 산업 칩(해당 타입 리포트에 존재하는 산업, ★ 먼저)
  const indPresent = new Map<string, string>();
  for (const r of reports) for (const i of r.industries ?? []) indPresent.set(i.id, i.name);
  const indChips = [...indPresent.entries()]
    .map(([id, name]) => ({ key: id, label: name, star: followedIds.includes(id) }))
    .sort((a, b) =>
      a.star && b.star
        ? (followedOrder.get(a.key) ?? 0) - (followedOrder.get(b.key) ?? 0)
        : a.star !== b.star
          ? a.star
            ? -1
            : 1
          : a.label.localeCompare(b.label),
    );
  // 기업 칩(선택 산업의 기업만; 산업 미선택이면 전체 기업)
  const companyChips =
    type === "company"
      ? [
          ...new Set(
            reports
              .filter((r) => !indFilter || (r.industries ?? []).some((i) => i.id === indFilter))
              .map((r) => r.company?.trim())
              .filter((c): c is string => !!c),
          ),
        ].sort()
      : [];

  // 관련 뉴스(기업 선택 시 그 기업, 전체면 내 기업들 언급)
  const newsMentions = (r: Report, name: string) => norm(`${r.title ?? ""} ${r.summary ?? ""}`).includes(norm(name));
  const companyNames = [...new Set(reports.map((r) => r.company?.trim()).filter((c): c is string => !!c))];
  const relatedNews =
    type === "company"
      ? all
          .filter(
            (r) =>
              r.docType === "news" &&
              (company
                ? newsMentions(r, company)
                : indFilter
                  ? (r.industries ?? []).some((i) => i.id === indFilter)
                  : companyNames.some((n) => newsMentions(r, n))),
          )
          .sort(byDateDesc)
      : [];
  // 산업리포트: 산업 선택 시 그 산업의 기업 리포트 연결
  const relatedCompanyReports =
    type === "industry" && indFilter
      ? all.filter((r) => r.docType === "company" && (r.industries ?? []).some((i) => i.id === indFilter)).sort(byDateDesc)
      : [];

  // 본문 리스트 결정
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
    if (company) body = <List reports={reports.filter((r) => r.company?.trim() === company).sort(byDateDesc)} onDelete={onDelete} />;
    else if (indFilter)
      body = (
        <List
          reports={reports.filter((r) => (r.industries ?? []).some((i) => i.id === indFilter)).sort(byDateDesc)}
          onDelete={onDelete}
        />
      );
    else body = <Grouped groups={buildIndustryGroups(reports, followed)} onDelete={onDelete} />;
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
            ? "산업 → 기업 순으로 좁혀 보고, 그 기업 관련 뉴스도 함께 봐요."
            : "산업별로 골라 보거나 전체를 발간일 최신순으로."}
      </p>

      {/* tier1: 산업 칩(산업/기업/뉴스 공용) */}
      {indChips.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          <Chip label="전체" active={!indFilter} onClick={() => { setIndFilter(null); setCompany(null); }} />
          {indChips.map((ch) => (
            <Chip
              key={ch.key}
              label={(ch.star ? "★ " : "") + ch.label}
              active={indFilter === ch.key}
              onClick={() => { setIndFilter(ch.key); setCompany(null); }}
            />
          ))}
        </div>
      )}
      {/* tier2: 기업 칩(기업리포트) */}
      {type === "company" && companyChips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-l-2 border-line pl-2">
          <Chip label={indFilter ? "이 산업 전체" : "기업 전체"} active={!company} onClick={() => setCompany(null)} small />
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
      {relatedNews.length > 0 && (
        <section className="mt-8 border-t border-line pt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink-muted">📰 {company ? `${company} ` : ""}관련 뉴스 ({relatedNews.length})</h2>
          <List reports={relatedNews} onDelete={onDelete} />
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
