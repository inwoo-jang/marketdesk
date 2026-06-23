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

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">{label}</h1>
      <p className="mt-1 text-sm text-ink-sub">AI 가 {label}로 분류한 문서입니다.</p>

      <div className="mt-6 space-y-2">
        {reports.length === 0 ? (
          <p className="rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
            아직 {label}로 분류된 문서가 없어요.{" "}
            <a href="/upload" className="text-primary">업로드</a> 하면 AI 가 자동 분류합니다.
          </p>
        ) : (
          reports.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              onDelete={async (rid) => {
                await api.deleteReport(rid);
                load();
              }}
            />
          ))
        )}
      </div>
    </main>
  );
}
