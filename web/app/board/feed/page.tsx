"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type BoardFeed, type BoardDim } from "@/lib/api";
import { ReportCard } from "@/components/report-card";
import { RichNote } from "@/components/rich-note";
import { FlowEditor } from "@/components/flow-editor";
import { WordLookup } from "@/components/word-lookup";
import { knownCountryOf, normco, companyAliases } from "@/lib/companies";

const fmt = (k: string, period: "month" | "year") => (period === "year" ? `${k}년` : `${k.slice(0, 4)}.${k.slice(5)}`);
const stripPeriodLead = (text: string, periodKey: string) => {
  const original = text.trim();
  if (!original) return original;
  let pattern: RegExp | null = null;
  if (/^\d{4}-\d{2}$/.test(periodKey)) {
    const [year, month] = periodKey.split("-");
    const m = String(Number(month));
    pattern = new RegExp(
      `^\\s*(?:${year}\\s*년\\s*0?${m}\\s*월|${year}[.-]0?${m})(?:\\s*(?:에는|에서는|은|는|의|엔|에))?\\s*[,·:：\\-]?\\s*`,
    );
  } else if (/^\d{4}$/.test(periodKey)) {
    pattern = new RegExp(`^\\s*${periodKey}\\s*년(?:\\s*(?:에는|에서는|은|는|의|엔|에))?\\s*[,·:：\\-]?\\s*`);
  }
  const stripped = pattern ? original.replace(pattern, "").trim() : original;
  return stripped || original;
};

// 흐름 보드 셀 → 피드: 그 기간·대상의 흐름 요약 + 근거 원문 리포트. 리포트 클릭 → 원문.
export default function BoardFeedPage() {
  const [data, setData] = useState<BoardFeed | null | "error">(null);
  const [companies, setCompanies] = useState<string[]>([]); // 내 리포트의 회사명(종목 스캔 사전)
  const contentRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const q = new URLSearchParams(window.location.search);
    const dim = (q.get("dim") ?? "industry") as BoardDim;
    const key = q.get("key") ?? "all";
    const period = q.get("period") === "year" ? "year" : "month";
    const periodKey = q.get("periodKey") ?? "";
    const r = await api.boardFeed({ dim, key, period, periodKey }).catch(() => null);
    setData(r ?? "error");
  }, []);

  useEffect(() => {
    (async () => {
      const me = await api.me().catch(() => ({ user: null }));
      if (!me.user) {
        window.location.href = "/login";
        return;
      }
      await load();
      // 종목 스캔용 사전: 내 리포트에 등장한 회사명(중복 제거)
      const { reports } = await api.myReports().catch(() => ({ reports: [] }));
      setCompanies([...new Set(reports.map((r) => r.company?.trim()).filter((c): c is string => !!c))]);
    })();
  }, [load]);

  if (data === null) return <main className="p-12 text-ink-muted">불러오는 중...</main>;
  if (data === "error") return <main className="p-12 text-ink-sub">불러오지 못했어요. <a href="/board" className="text-primary">흐름 보드</a></main>;

  const feed = data;
  const displayOne = feed.rollup?.oneLiner ? stripPeriodLead(feed.rollup.oneLiner, feed.periodKey) : "";

  // 이 흐름에서 언급된 종목: 흐름 요약 텍스트 + 근거 원문 회사명에서 내 회사 사전과 매칭(추천 아님, 정보 정리).
  const flowText = normco(`${feed.rollup?.oneLiner ?? ""} ${(feed.rollup?.facts ?? []).map((f) => f.content).join(" ")}`);
  const reportCos = new Set(data.reports.map((r) => r.company?.trim()).filter((c): c is string => !!c).map((c) => normco(c)));
  const mentioned =
    feed.dim === "company"
      ? []
      : [...new Map(
          companies
            .filter((c) => c.length >= 2 && normco(c) !== normco(feed.label))
            .filter((c) => reportCos.has(normco(c)) || companyAliases(c).some((a) => flowText.includes(normco(a))))
            .map((c) => [normco(c), c]),
        ).values()].sort((a, b) => a.localeCompare(b, "ko"));
  const coHref = (c: string) =>
    `/board/feed?dim=company&key=${encodeURIComponent(c)}&period=${feed.period}&periodKey=${feed.periodKey}`;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <button
        onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.href = "/board"))}
        className="text-sm text-ink-sub hover:text-ink"
      >
        ← 흐름 보드
      </button>
      <div className="mt-3 flex items-center gap-2">
        <h1 className="text-2xl font-bold">
          {feed.label}
          {feed.dim === "company" && knownCountryOf(feed.label) && (
            <span className="ml-2 text-base font-normal text-ink-muted">({knownCountryOf(feed.label)})</span>
          )}
        </h1>
        <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-sm text-ink-muted">{fmt(feed.periodKey, feed.period)}</span>
      </div>

      {/* 흐름 요약 — 단어 클릭/검색 시 AI 용어풀이(WordLookup 대상) */}
      <section ref={contentRef} className="mt-4 rounded-card bg-card p-5 shadow-card">
        <FlowEditor
          dim={feed.dim}
          factKey={feed.key}
          period={feed.period}
          periodKey={feed.periodKey}
          oneLiner={displayOne || feed.rollup?.oneLiner || ""}
          facts={feed.rollup?.facts ?? []}
          onSaved={load}
        />
      </section>

      {/* 이 흐름에서 언급된 종목 — 흐름·원문에 등장한 회사(추천 아님, 정보 정리). 클릭 시 그 종목 흐름으로 이동 */}
      {mentioned.length > 0 && (
        <section className="mt-6 rounded-card border border-line bg-card/40 p-4">
          <div className="mb-2 flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-ink">이 흐름에서 언급된 종목</h2>
            <span className="text-[11px] text-ink-muted">투자 추천이 아니라 흐름에 등장한 종목 정리예요</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {mentioned.map((c) => (
              <a
                key={c}
                href={coHref(c)}
                title={`${c} 흐름 보기`}
                className="inline-flex items-center rounded-full border border-primary/25 bg-primary/[0.06] px-2.5 py-1 text-xs font-medium text-primary/90 hover:bg-primary/10"
              >
                {c}
                {knownCountryOf(c) && <span className="ml-1 text-ink-muted">({knownCountryOf(c)})</span>}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* 근거 원문 */}
      <h2 className="mb-2 mt-8 text-sm font-semibold text-ink-muted">원문 ({data.reports.length})</h2>
      {data.reports.length === 0 ? (
        <p className="rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">이 기간 분석된 자료가 없어요.</p>
      ) : data.dim === "industry" ? (
        // 산업 흐름: 산업/기업/경제흐름(뉴스)으로 구분해 노출
        <div className="space-y-5">
          {([
            { key: "industry", label: "산업 리포트" },
            { key: "company", label: "기업 리포트" },
            { key: "news", label: "경제흐름 (뉴스)" },
          ] as const).map((g) => {
            const list = data.reports.filter((r) => (r.docType ?? "industry") === g.key);
            if (list.length === 0) return null;
            return (
              <div key={g.key}>
                <div className="mb-2 text-xs font-semibold text-ink-muted">
                  {g.label} ({list.length})
                </div>
                <div className="space-y-2">
                  {list.map((r) => (
                    <ReportCard key={r.id} report={r} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {data.reports.map((r) => (
            <ReportCard key={r.id} report={r} />
          ))}
        </div>
      )}

      {/* 이 달/연 흐름 메모(피드별) */}
      <div className="mt-10">
        <RichNote
          scopeType="board"
          scopeKey={`${data.dim}:${data.key}:${data.period}:${data.periodKey}`}
          title={`${data.label} ${fmt(data.periodKey, data.period)} 메모`}
        />
      </div>

      <WordLookup targetRef={contentRef} contextText={`${feed.label} ${displayOne}`} />
    </main>
  );
}
