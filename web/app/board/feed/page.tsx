"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type BoardFeed, type BoardDim } from "@/lib/api";
import { ReportCard } from "@/components/report-card";
import { RichNote } from "@/components/rich-note";
import { FlowEditor } from "@/components/flow-editor";
import { WordLookup } from "@/components/word-lookup";
import { knownCountryOf, normco, companyAliases } from "@/lib/companies";

const fmt = (k: string, period: "month" | "year") => (period === "year" ? `${k}년` : `${k.slice(0, 4)}.${k.slice(5)}`);
// 기간 이동: 월/년 단위로 delta 만큼(이전=-1, 다음=+1)
const shiftPeriod = (k: string, period: "month" | "year", delta: number): string => {
  if (period === "year") return String(Number(k) + delta);
  const [y, m] = k.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const nowPeriodKey = (period: "month" | "year"): string => {
  const d = new Date();
  return period === "year" ? String(d.getFullYear()) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
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

// 흐름 항목 ↔ 근거 원문 매칭용 의미토큰(길이 2+).
const factTokens = (s: string) =>
  new Set(s.toLowerCase().replace(/[^0-9a-z가-힣]+/g, " ").trim().split(" ").filter((t) => t.length >= 2));

// 흐름 보드 셀 → 피드: 그 기간·대상의 흐름 요약 + 근거 원문 리포트. 리포트 클릭 → 원문.
export default function BoardFeedPage() {
  const [data, setData] = useState<BoardFeed | null | "error">(null);
  const [companies, setCompanies] = useState<string[]>([]); // 내 리포트의 회사명(종목 스캔 사전)
  const [activeFactId, setActiveFactId] = useState<string | null>(null); // 근거 필터 중인 흐름 항목
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

  // 이 흐름에서 언급된 종목: 근거 원문에 등장한 회사를 "원문 수"로 집계(추천 아님, 등장 빈도라는 팩트).
  // 빈도순 정렬 + 카운트 노출 + 크기 차등 → 흐름의 주인공이 한눈에.
  const flowText = normco(`${feed.rollup?.oneLiner ?? ""} ${(feed.rollup?.facts ?? []).map((f) => f.content).join(" ")}`);
  const mentioned: { name: string; count: number }[] =
    feed.dim === "company"
      ? []
      : (() => {
          const byKey = new Map<string, { name: string; count: number }>();
          for (const c of companies) {
            if (c.length < 2 || normco(c) === normco(feed.label)) continue;
            const key = normco(c);
            if (byKey.has(key)) continue; // 사전 내 중복 회사명 제거
            const aliases = companyAliases(c).map((a) => normco(a)).filter(Boolean);
            let count = 0; // 이 회사(별칭 포함)를 회사명·제목·요약에 담은 근거 리포트 수
            for (const r of data.reports) {
              const hay = normco(`${r.title ?? ""} ${r.summary ?? ""} ${r.company ?? ""}`);
              if (aliases.some((a) => hay.includes(a))) count++;
            }
            const inFlow = aliases.some((a) => flowText.includes(a));
            if (count > 0 || inFlow) byKey.set(key, { name: c, count });
          }
          return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
        })();
  // 원문 수에 따른 칩 크기 차등(주인공 강조).
  const chipTier = (n: number) =>
    n >= 5
      ? "px-3 py-1.5 text-sm font-semibold"
      : n >= 2
        ? "px-2.5 py-1 text-xs font-medium"
        : "px-2 py-0.5 text-[11px] font-medium";
  const coHref = (c: string) =>
    `/board/feed?dim=company&key=${encodeURIComponent(c)}&period=${feed.period}&periodKey=${feed.periodKey}`;

  // 각 흐름 항목 ↔ 근거 원문(의미토큰 2개 이상 겹침). 항목 '근거 N' 클릭 시 원문 리스트를 이 근거로 필터.
  const reportTok = data.reports.map((r) => ({ id: r.id, tok: factTokens(`${r.title ?? ""} ${r.summary ?? ""} ${r.company ?? ""}`) }));
  const factSources = new Map<string, string[]>();
  for (const f of feed.rollup?.facts ?? []) {
    if (!f.content) continue;
    const ft = factTokens(f.content);
    const ids = reportTok
      .filter((rt) => {
        let n = 0;
        for (const t of ft) if (rt.tok.has(t)) n++;
        return n >= 2;
      })
      .map((rt) => rt.id);
    factSources.set(f.id, ids);
  }
  const sourceCount = (id: string) => factSources.get(id)?.length ?? 0;
  const activeFact = activeFactId ? feed.rollup?.facts.find((f) => f.id === activeFactId) : null;
  const activeIds = activeFact ? new Set(factSources.get(activeFactId!) ?? []) : null;
  const visibleReports = activeIds ? data.reports.filter((r) => activeIds.has(r.id)) : data.reports;

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
        {(() => {
          const prev = shiftPeriod(feed.periodKey, feed.period, -1);
          const next = shiftPeriod(feed.periodKey, feed.period, 1);
          const canNext = next <= nowPeriodKey(feed.period); // 미래는 막음
          const href = (pk: string) =>
            `/board/feed?dim=${feed.dim}&key=${encodeURIComponent(feed.key)}&period=${feed.period}&periodKey=${pk}`;
          const btn = "flex h-7 w-7 items-center justify-center rounded-full text-ink-sub hover:bg-bg-deep";
          return (
            <div className="flex items-center gap-0.5">
              <a href={href(prev)} title={`이전 ${feed.period === "year" ? "해" : "달"}`} className={btn}>
                ‹
              </a>
              <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-sm text-ink-muted tabular-nums">{fmt(feed.periodKey, feed.period)}</span>
              {canNext ? (
                <a href={href(next)} title={`다음 ${feed.period === "year" ? "해" : "달"}`} className={btn}>
                  ›
                </a>
              ) : (
                <span className={`${btn} cursor-default opacity-30`}>›</span>
              )}
            </div>
          );
        })()}
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
          sourceCount={sourceCount}
          activeFactId={activeFactId}
          onFactToggle={(id) => setActiveFactId(activeFactId === id ? null : id)}
        />
      </section>

      {/* 이 흐름에서 언급된 종목 — 흐름·원문에 등장한 회사(추천 아님, 정보 정리). 클릭 시 그 종목 흐름으로 이동 */}
      {mentioned.length > 0 && (
        <section className="mt-6 rounded-card border border-line bg-card/40 p-4">
          <div className="mb-2 flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-ink">이 흐름에서 언급된 종목</h2>
            <span className="text-[11px] text-ink-muted">추천이 아니라 등장 빈도(옆 숫자=관련 원문 수)</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {mentioned.map(({ name, count }) => (
              <a
                key={name}
                href={coHref(name)}
                title={`${name}${count > 0 ? ` · 관련 원문 ${count}건` : ""} 흐름 보기`}
                className={`inline-flex items-center rounded-full border border-primary/25 bg-primary/[0.06] text-primary/90 hover:bg-primary/10 ${chipTier(count)}`}
              >
                {name}
                {knownCountryOf(name) && <span className="ml-1 text-ink-muted">({knownCountryOf(name)})</span>}
                {count > 0 && <span className="ml-1.5 rounded bg-primary/15 px-1 text-[10px] font-semibold tabular-nums text-primary">{count}</span>}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* 근거 원문 */}
      <h2 className="mb-2 mt-8 text-sm font-semibold text-ink-muted">원문 ({visibleReports.length})</h2>
      {activeFact && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs text-ink-sub ring-1 ring-primary/15">
          <span className="font-medium text-primary">이 항목 근거로 필터 중:</span>
          <span className="line-clamp-1 flex-1">{activeFact.content}</span>
          <button onClick={() => setActiveFactId(null)} className="shrink-0 rounded border border-line px-2 py-0.5 font-medium hover:bg-bg-deep">
            전체 보기
          </button>
        </div>
      )}
      {visibleReports.length === 0 ? (
        <p className="rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
          {activeFact ? "이 항목과 매칭된 원문을 찾지 못했어요." : "이 기간 분석된 자료가 없어요."}
        </p>
      ) : data.dim === "industry" ? (
        // 산업 흐름: 산업/기업/경제흐름(뉴스)으로 구분해 노출
        <div className="space-y-5">
          {([
            { key: "industry", label: "산업 리포트" },
            { key: "company", label: "기업 리포트" },
            { key: "news", label: "경제흐름 (뉴스)" },
          ] as const).map((g) => {
            const list = visibleReports.filter((r) => (r.docType ?? "industry") === g.key);
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
          {visibleReports.map((r) => (
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
