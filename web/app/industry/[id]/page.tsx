"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, type MyIndustry, type Industry, type Report, type Rollup, type PublicContent } from "@/lib/api";
import { ReportCard } from "@/components/report-card";
import { PublicCard } from "@/components/public-card";

const monthKey = (r: Report) => (r.pubDate ?? r.createdAt).slice(0, 7);
const thisMonth = () => new Date().toISOString().slice(0, 7);

// 산업별 대시보드: 월별 흐름(롤업) + 시간뷰(월 그룹 리포트 피드). 핀 토글.
export default function IndustryDashboard() {
  const { id } = useParams<{ id: string }>();
  const [industry, setIndustry] = useState<{ name: string; iconColor: string | null } | null>(null);
  const [pinned, setPinned] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [rollups, setRollups] = useState<Rollup[]>([]);
  const [pub, setPub] = useState<PublicContent[]>([]);
  const [period, setPeriod] = useState(thisMonth());
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const me = await api.me().catch(() => ({ user: null }));
    if (!me.user) {
      window.location.href = "/login";
      return;
    }
    const [mi, { industries: catalog }, { reports }, { rollups }, pc] = await Promise.all([
      api.myIndustries(),
      api.industries(),
      api.myReports({ industryId: id }),
      api.rollups(id),
      api.publicContents({ industryId: id }).catch(() => ({ contents: [] })),
    ]);
    setIndustry(mi.industries.find((i: MyIndustry) => i.id === id) ?? catalog.find((i: Industry) => i.id === id) ?? null);
    setPinned(mi.industries.some((i) => i.id === id));
    setReports(reports);
    setRollups(rollups);
    setPub(pc.contents);
    if (reports[0]) setPeriod(monthKey(reports[0]));
    setLoaded(true);
  }, [id]);

  useEffect(() => {
    load().catch(() => setLoaded(true));
  }, [load]);

  // 분석중 리포트 또는 생성중 롤업 있으면 폴링
  useEffect(() => {
    const busy =
      reports.some((r) => r.parseStatus === "pending" || r.parseStatus === "parsing") ||
      rollups.some((r) => r.status === "pending");
    if (busy) {
      const t = setInterval(() => load().catch(() => {}), 2500);
      return () => clearInterval(t);
    }
  }, [reports, rollups, load]);

  async function togglePin() {
    if (pinned) await api.unfollowIndustry(id);
    else await api.followIndustry(id);
    setPinned(!pinned);
  }
  async function genRollup() {
    setBusy(true);
    try {
      await api.createRollup(id, period);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "롤업 생성 실패");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <main className="p-12 text-ink-muted">불러오는 중...</main>;

  // 시간뷰: 월별 그룹
  const byMonth = new Map<string, Report[]>();
  for (const r of reports) {
    const k = monthKey(r);
    const arr = byMonth.get(k) ?? [];
    arr.push(r);
    byMonth.set(k, arr);
  }
  const months = [...byMonth.keys()].sort().reverse();

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

      {/* 월별 흐름(롤업) */}
      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-ink-muted">월별 흐름</h2>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-lg border border-line bg-card px-2 py-1 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={genRollup}
            disabled={busy}
            className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {busy ? "..." : "이 달 흐름 생성"}
          </button>
        </div>
        {rollups.length === 0 ? (
          <p className="rounded-card bg-card p-5 text-sm text-ink-sub shadow-card">
            아직 월별 흐름이 없어요. 월을 고르고 &quot;이 달 흐름 생성&quot;을 누르면 그 달 리포트들을 묶어 요약합니다.
          </p>
        ) : (
          <div className="space-y-3">
            {rollups.map((ru) => (
              <div key={ru.id} className="rounded-card bg-card p-5 shadow-card">
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-bold">{ru.periodKey}</span>
                  {ru.status !== "done" && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      {ru.status === "pending" ? "생성중..." : "실패"}
                    </span>
                  )}
                </div>
                {ru.oneLiner && <p className="text-sm text-ink">{ru.oneLiner}</p>}
                {ru.facts.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {ru.facts.map((f) => (
                      <div key={f.id} className="flex gap-2 text-sm">
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
                            f.factType === "common" ? "bg-success-bg text-success-text" : "bg-amber-50 text-amber-600"
                          }`}
                        >
                          {f.factType === "common" ? "공통" : "엇갈림"}
                        </span>
                        <span className="text-ink">{f.content}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 시간뷰: 월별 그룹 리포트 */}
      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-ink-muted">리포트 ({reports.length})</h2>
        {reports.length === 0 ? (
          <p className="rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
            이 산업으로 분류된 리포트가 아직 없어요. 업로드하면 AI 가 이 산업으로 매칭합니다.
          </p>
        ) : (
          <div className="space-y-6">
            {months.map((m) => (
              <div key={m}>
                <div className="mb-2 text-xs font-semibold text-ink-muted">{m}</div>
                <div className="space-y-2">
                  {byMonth.get(m)!.map((r) => (
                    <ReportCard
                      key={r.id}
                      report={r}
                      onDelete={async (rid) => {
                        await api.deleteReport(rid);
                        load();
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 이 산업의 공개 콘텐츠(추천) */}
      {pub.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold text-ink-muted">공개 콘텐츠 ({pub.length})</h2>
          <div className="space-y-2">
            {pub.map((c) => (
              <PublicCard key={c.id} content={c} variant="feed" onRemoved={(cid) => setPub((p) => p.filter((x) => x.id !== cid))} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
