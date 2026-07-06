"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, type Report, type MyIndustry } from "@/lib/api";
import { ReportCard } from "@/components/report-card";

const TYPE_LABEL: Record<string, string> = { industry: "산업리포트", company: "기업리포트", news: "뉴스" };
const dnum = (r: Report) => new Date(r.pubDate ?? r.createdAt).getTime();
const byDateDesc = (a: Report, b: Report) => dnum(b) - dnum(a);

// 산업리포트=산업별 필터(★우선)+그 산업의 기업 연결, 기업리포트=기업별 필터+관련 뉴스. 전체는 발간일 최신순.
export default function DocsFeed() {
  const { type } = useParams<{ type: string }>();
  const label = TYPE_LABEL[type] ?? "문서";
  const [all, setAll] = useState<Report[]>([]); // 전체 리포트(교차 참조용)
  const [followed, setFollowed] = useState<MyIndustry[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // ?c=회사명 으로 진입 시 해당 기업 필터 선택(흐름 보드 기업 셀 클릭)
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    if (c) setFilter(c);
  }, []);

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

  // 필터 칩
  const followedIds = followed.map((f) => f.id);
  let chips: { key: string; label: string; star?: boolean }[] = [];
  if (type === "industry") {
    const present = new Map<string, string>();
    for (const r of reports) for (const i of r.industries ?? []) present.set(i.id, i.name);
    const star = followed.filter((f) => present.has(f.id)).map((f) => ({ key: f.id, label: f.name, star: true }));
    const others = [...present.entries()]
      .filter(([id]) => !followedIds.includes(id))
      .map(([id, name]) => ({ key: id, label: name }));
    chips = [...star, ...others];
  } else if (type === "company") {
    const c = new Map<string, number>();
    for (const r of reports) {
      const name = r.company?.trim();
      if (name) c.set(name, (c.get(name) ?? 0) + 1);
    }
    chips = [...c.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => ({ key: name, label: name }));
  }

  const matchesFilter = (r: Report) =>
    !filter ||
    (type === "industry" ? (r.industries ?? []).some((i) => i.id === filter) : r.company?.trim() === filter);

  // 교차 링크: 산업 필터 → 그 산업의 기업 리포트 / 기업(전체·선택) → 관련 뉴스
  const relatedCompanyReports =
    type === "industry" && filter ? all.filter((r) => r.docType === "company" && (r.industries ?? []).some((i) => i.id === filter)).sort(byDateDesc) : [];

  const norm = (s: string) => s.replace(/\s/g, "").toLowerCase();
  const newsMentions = (r: Report, name: string) => norm(`${r.title ?? ""} ${r.summary ?? ""}`).includes(norm(name));
  const companyNames = [...new Set(reports.map((r) => r.company?.trim()).filter((c): c is string => !!c))];
  const relatedNews =
    type === "company"
      ? all
          .filter(
            (r) =>
              r.docType === "news" && (filter ? newsMentions(r, filter) : companyNames.some((n) => newsMentions(r, n))),
          )
          .sort(byDateDesc)
      : [];

  let body: React.ReactNode;
  if (reports.length === 0) {
    body = (
      <p className="mt-6 rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
        아직 {label}로 분류된 문서가 없어요. <a href="/upload" className="text-primary">업로드</a> 하면 AI 가 자동 분류합니다.
      </p>
    );
  } else if (filter || type === "company" || type === "news") {
    const list = reports.filter(matchesFilter).sort(byDateDesc);
    body = (
      <div className="mt-6 space-y-2">
        {list.map((r) => (
          <ReportCard key={r.id} report={r} onDelete={onDelete} />
        ))}
      </div>
    );
  } else {
    const groups = buildIndustryGroups(reports, followed);
    body = (
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

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">{label}</h1>
      <p className="mt-1 text-sm text-ink-sub">
        {type === "industry"
          ? "산업별로 골라 보고, 그 산업의 기업 리포트까지 연결돼요."
          : type === "company"
            ? "기업별로 골라 보고, 그 기업 관련 뉴스도 함께 봐요."
            : `AI 가 ${label}로 분류한 문서(발간일 최신순).`}
      </p>

      {type !== "news" && chips.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          <FilterChip label="전체" active={!filter} onClick={() => setFilter(null)} />
          {chips.map((ch) => (
            <FilterChip
              key={ch.key}
              label={(ch.star ? "★ " : "") + ch.label}
              active={filter === ch.key}
              onClick={() => setFilter(ch.key)}
            />
          ))}
        </div>
      )}

      {body}

      {/* 교차 링크 섹션 */}
      {relatedCompanyReports.length > 0 && (
        <section className="mt-8 border-t border-line pt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink-muted">🏢 이 산업의 기업 리포트 ({relatedCompanyReports.length})</h2>
          <div className="space-y-2">
            {relatedCompanyReports.map((r) => (
              <ReportCard key={r.id} report={r} onDelete={onDelete} />
            ))}
          </div>
        </section>
      )}
      {relatedNews.length > 0 && (
        <section className="mt-8 border-t border-line pt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink-muted">📰 {filter ? `${filter} ` : ""}관련 뉴스 ({relatedNews.length})</h2>
          <div className="space-y-2">
            {relatedNews.map((r) => (
              <ReportCard key={r.id} report={r} onDelete={onDelete} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        active ? "border-primary bg-primary/10 text-primary" : "border-line text-ink-sub hover:bg-bg-deep"
      }`}
    >
      {label}
    </button>
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
