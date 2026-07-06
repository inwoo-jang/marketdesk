"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, type Report } from "@/lib/api";
import { ReportCard } from "@/components/report-card";

const TYPE_LABEL: Record<string, string> = { industry: "산업리포트", company: "기업리포트", news: "뉴스" };

// 문서 타입별 피드(AI 가 분류한 doc_type 기준 전체).
export default function DocsFeed() {
  const { type } = useParams<{ type: string }>();
  const label = TYPE_LABEL[type] ?? "문서";
  const [reports, setReports] = useState<Report[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const me = await api.me().catch(() => ({ user: null }));
    if (!me.user) {
      window.location.href = "/login";
      return;
    }
    const { reports } = await api.myReports({ docType: type });
    setReports(reports);
    setLoaded(true);
  }, [type]);

  useEffect(() => {
    load().catch(() => setLoaded(true));
  }, [load]);

  // 분석중 있으면 폴링
  useEffect(() => {
    if (reports.some((r) => r.parseStatus === "pending" || r.parseStatus === "parsing")) {
      const t = setInterval(() => load().catch(() => {}), 2500);
      return () => clearInterval(t);
    }
  }, [reports, load]);

  if (!loaded) return <main className="p-12 text-ink-muted">불러오는 중...</main>;
  if (!TYPE_LABEL[type])
    return (
      <main className="p-12 text-ink-sub">
        알 수 없는 분류. <a href="/" className="text-primary">대시보드</a>
      </main>
    );

  const onDelete = async (rid: string) => {
    await api.deleteReport(rid);
    load();
  };

  // 산업리포트=산업별, 기업리포트=기업별로 묶기. 뉴스는 단일 그룹.
  const groups = groupReports(type, reports);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">{label}</h1>
      <p className="mt-1 text-sm text-ink-sub">
        {type === "industry"
          ? "산업별로 모아 봤어요."
          : type === "company"
            ? "기업별로 모아 봤어요."
            : `AI 가 ${label}로 분류한 문서입니다.`}
      </p>

      {reports.length === 0 ? (
        <p className="mt-6 rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
          아직 {label}로 분류된 문서가 없어요.{" "}
          <a href="/upload" className="text-primary">업로드</a> 하면 AI 가 자동 분류합니다.
        </p>
      ) : (
        <div className="mt-6 space-y-7">
          {groups.map((g) => (
            <section key={g.key}>
              {type !== "news" && (
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-muted">
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-primary">{g.label}</span>
                  <span className="text-xs text-ink-muted">{g.reports.length}</span>
                </h2>
              )}
              <div className="space-y-2">
                {g.reports.map((r) => (
                  <ReportCard key={r.id} report={r} onDelete={onDelete} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

// 타입별 그룹핑. industry=산업(멀티 태그면 각 산업에 중복 노출), company=회사명, news=단일.
function groupReports(type: string, reports: Report[]): { key: string; label: string; reports: Report[] }[] {
  if (type === "news") return [{ key: "all", label: "전체", reports }];

  const map = new Map<string, { label: string; reports: Report[] }>();
  const push = (key: string, label: string, r: Report) => {
    const g = map.get(key) ?? { label, reports: [] };
    g.reports.push(r);
    map.set(key, g);
  };
  for (const r of reports) {
    if (type === "industry") {
      const inds = r.industries ?? [];
      if (inds.length === 0) push("_none", "미분류", r);
      else for (const i of inds) push(i.id, i.name, r);
    } else {
      const c = r.company?.trim();
      push(c || "_none", c || "회사 미지정", r);
    }
  }
  // 그룹 정렬: 항목 많은 순, 미지정은 뒤로
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: v.label, reports: v.reports }))
    .sort((a, b) => (a.key === "_none" ? 1 : b.key === "_none" ? -1 : b.reports.length - a.reports.length));
}
