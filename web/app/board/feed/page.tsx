"use client";

import { useEffect, useState } from "react";
import { api, type BoardFeed, type BoardDim } from "@/lib/api";
import { ReportCard } from "@/components/report-card";

const fmt = (k: string, period: "month" | "year") => (period === "year" ? `${k}년` : `${k.slice(0, 4)}.${k.slice(5)}`);

// 흐름 보드 셀 → 피드: 그 기간·대상의 흐름 요약 + 근거 원문 리포트. 리포트 클릭 → 원문.
export default function BoardFeedPage() {
  const [data, setData] = useState<BoardFeed | null | "error">(null);

  useEffect(() => {
    (async () => {
      const me = await api.me().catch(() => ({ user: null }));
      if (!me.user) {
        window.location.href = "/login";
        return;
      }
      const q = new URLSearchParams(window.location.search);
      const dim = (q.get("dim") ?? "industry") as BoardDim;
      const key = q.get("key") ?? "all";
      const period = q.get("period") === "year" ? "year" : "month";
      const periodKey = q.get("periodKey") ?? "";
      const r = await api.boardFeed({ dim, key, period, periodKey }).catch(() => null);
      setData(r ?? "error");
    })();
  }, []);

  if (data === null) return <main className="p-12 text-ink-muted">불러오는 중...</main>;
  if (data === "error") return <main className="p-12 text-ink-sub">불러오지 못했어요. <a href="/board" className="text-primary">흐름 보드</a></main>;

  const common = data.rollup?.facts.filter((f) => f.factType === "common") ?? [];
  const conflict = data.rollup?.facts.filter((f) => f.factType === "conflict") ?? [];
  const empty = (data.rollup?.oneLiner ?? "").startsWith("이 기간");

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <a href="/board" className="text-sm text-ink-sub hover:text-ink">← 흐름 보드</a>
      <div className="mt-3 flex items-center gap-2">
        <h1 className="text-2xl font-bold">{data.label}</h1>
        <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-sm text-ink-muted">{fmt(data.periodKey, data.period)}</span>
      </div>

      {/* 흐름 요약 */}
      {data.rollup && !empty ? (
        <section className="mt-4 rounded-card bg-card p-5 shadow-card">
          <div className="mb-1 text-xs font-semibold text-primary">이 기간 흐름</div>
          <p className="text-[15px] font-medium leading-snug text-ink">{data.rollup.oneLiner}</p>
          {common.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold text-success-text">공통 이슈</div>
              <ul className="mt-1 space-y-0.5 text-sm text-ink-sub">
                {common.map((f) => (
                  <li key={f.id}>· {f.content}</li>
                ))}
              </ul>
            </div>
          )}
          {conflict.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold text-amber-600">엇갈림</div>
              <ul className="mt-1 space-y-0.5 text-sm text-ink-sub">
                {conflict.map((f) => (
                  <li key={f.id}>· {f.content}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : (
        <p className="mt-4 rounded-card bg-card p-5 text-sm text-ink-sub shadow-card">
          이 기간 흐름 요약이 아직 없어요. 아래 원문을 바로 볼 수 있어요.
        </p>
      )}

      {/* 근거 원문 */}
      <h2 className="mb-2 mt-8 text-sm font-semibold text-ink-muted">원문 ({data.reports.length})</h2>
      {data.reports.length === 0 ? (
        <p className="rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">이 기간 분석된 자료가 없어요.</p>
      ) : (
        <div className="space-y-2">
          {data.reports.map((r) => (
            <ReportCard key={r.id} report={r} />
          ))}
        </div>
      )}
    </main>
  );
}
