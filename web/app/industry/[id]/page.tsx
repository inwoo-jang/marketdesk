"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, type MyIndustry, type Industry, type Report } from "@/lib/api";
import { ReportCard } from "@/components/report-card";

// 산업별 대시보드: 그 산업으로 태깅된 내 리포트 피드. 핀(관심) 토글 가능.
export default function IndustryDashboard() {
  const { id } = useParams<{ id: string }>();
  const [industry, setIndustry] = useState<{ name: string; iconColor: string | null } | null>(null);
  const [pinned, setPinned] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const me = await api.me().catch(() => ({ user: null }));
    if (!me.user) {
      window.location.href = "/login";
      return;
    }
    const [mi, { industries: catalog }, { reports }] = await Promise.all([
      api.myIndustries(),
      api.industries(),
      api.myReports({ industryId: id }),
    ]);
    const mine = mi.industries.find((i: MyIndustry) => i.id === id);
    const cat = catalog.find((i: Industry) => i.id === id);
    setIndustry(mine ?? cat ?? null);
    setPinned(!!mine);
    setReports(reports);
    setLoaded(true);
  }, [id]);

  useEffect(() => {
    load().catch(() => setLoaded(true));
  }, [load]);

  useEffect(() => {
    if (reports.some((r) => r.parseStatus === "pending" || r.parseStatus === "parsing")) {
      const t = setInterval(() => load().catch(() => {}), 2500);
      return () => clearInterval(t);
    }
  }, [reports, load]);

  async function togglePin() {
    if (pinned) await api.unfollowIndustry(id);
    else await api.followIndustry(id);
    setPinned(!pinned);
  }

  if (!loaded) return <main className="p-12 text-ink-muted">불러오는 중...</main>;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <a href="/" className="text-sm text-ink-sub hover:text-ink">← 대시보드</a>

      <div className="mt-3 flex items-center justify-between">
        <h1 className="flex items-center gap-3 text-2xl font-bold">
          {industry && (
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ backgroundColor: industry.iconColor ?? "#8A93A8" }}
            >
              {industry.name.slice(0, 1)}
            </span>
          )}
          {industry?.name ?? "산업"}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={togglePin}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              pinned ? "border-primary bg-primary/10 text-primary" : "border-line text-ink-sub hover:bg-bg-deep"
            }`}
          >
            {pinned ? "★ 관심" : "☆ 관심 추가"}
          </button>
          <a href={`/upload?industryId=${id}`} className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white">
            + 업로드
          </a>
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-ink-muted">리포트 ({reports.length})</h2>
      <div className="space-y-2">
        {reports.length === 0 ? (
          <p className="rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
            이 산업으로 분류된 리포트가 아직 없어요. 업로드하면 AI 가 이 산업으로 매칭합니다.
          </p>
        ) : (
          reports.map((r) => <ReportCard key={r.id} report={r} />)
        )}
      </div>
    </main>
  );
}
