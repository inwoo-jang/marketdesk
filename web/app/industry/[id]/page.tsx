"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, type MyIndustry, type Report } from "@/lib/api";

const DOC_TYPE_LABEL: Record<string, string> = { industry: "산업", company: "기업", news: "뉴스" };
const STATUS_LABEL: Record<string, string> = { pending: "대기중", parsing: "처리중", parsed: "완료", failed: "실패" };

// 산업별 대시보드: 그 산업으로 분류된 내 리포트 타임라인.
export default function IndustryDashboard() {
  const { id } = useParams<{ id: string }>();
  const [industry, setIndustry] = useState<MyIndustry | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [unknown, setUnknown] = useState(false);

  const load = useCallback(async () => {
    const me = await api.me().catch(() => ({ user: null }));
    if (!me.user) {
      window.location.href = "/login";
      return;
    }
    const [{ industries }, { reports }] = await Promise.all([api.myIndustries(), api.myReports(id)]);
    const ind = industries.find((i) => i.id === id) ?? null;
    setIndustry(ind);
    setUnknown(!ind);
    setReports(reports);
    setLoaded(true);
  }, [id]);

  useEffect(() => {
    load().catch(() => setLoaded(true));
  }, [load]);

  // 처리중 리포트 있으면 폴링
  useEffect(() => {
    if (reports.some((r) => r.parseStatus === "pending" || r.parseStatus === "parsing")) {
      const t = setInterval(() => load().catch(() => {}), 2500);
      return () => clearInterval(t);
    }
  }, [reports, load]);

  if (!loaded) return <main className="p-12 text-ink-muted">불러오는 중...</main>;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <a href="/" className="text-sm text-ink-sub hover:text-ink">← 내 산업</a>

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
          {industry?.name ?? (unknown ? "이 산업" : "산업")}
        </h1>
        <a href={`/upload?industryId=${id}`} className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white">
          + 업로드
        </a>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-ink-muted">리포트 ({reports.length})</h2>
      {reports.length === 0 ? (
        <p className="rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
          이 산업으로 분류된 리포트가 아직 없어요. 우측 상단 업로드로 PDF·텍스트를 올리면 AI가 이 산업으로 매칭합니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li key={r.id}>
              <a
                href={`/reports/${r.id}`}
                className="flex items-center justify-between rounded-card bg-card p-4 shadow-card hover:ring-1 hover:ring-primary/30"
              >
                <div>
                  <div className="font-medium">{r.title ?? "제목 없음"}</div>
                  <div className="mt-0.5 text-xs text-ink-muted">
                    {r.docType ? `${DOC_TYPE_LABEL[r.docType] ?? r.docType} · ` : ""}
                    {(r.requestedLenses ?? []).join(", ") || "렌즈 미지정"} ·{" "}
                    {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                  </div>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    r.parseStatus === "parsed"
                      ? "bg-success-bg text-success-text"
                      : r.parseStatus === "failed"
                        ? "bg-red-50 text-red-500"
                        : "bg-ink/5 text-ink-muted"
                  }`}
                >
                  {STATUS_LABEL[r.parseStatus] ?? r.parseStatus}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
