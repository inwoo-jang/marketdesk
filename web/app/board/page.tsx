"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type BoardRow, type BoardCell, type BoardDim } from "@/lib/api";

const DIMS: { k: BoardDim; label: string }[] = [
  { k: "industry", label: "산업별" },
  { k: "company", label: "기업별" },
  { k: "news", label: "경제흐름" },
];
const fmtPeriod = (k: string, period: "month" | "year") =>
  period === "year" ? `${k}년` : `${k.slice(0, 4)}.${k.slice(5)}`;
// 셀 클릭 → 그 칸의 흐름 피드(요약 + 근거 원문). 거기서 리포트 클릭 → 원문.
const cellHref = (dim: BoardDim, key: string, period: "month" | "year", periodKey: string) =>
  `/board/feed?dim=${dim}&key=${encodeURIComponent(key)}&period=${period}&periodKey=${periodKey}`;

// 흐름 보드: 산업 선택 없이 관심 산업/기업/뉴스를 각각 타임라인 행으로. "빈 칸 모두 생성"으로 한 번에.
export default function BoardPage() {
  const [dim, setDim] = useState<BoardDim>("industry");
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [rowFilter, setRowFilter] = useState<string | null>(null); // 산업=산업키, 기업=계열명
  const [groupMap, setGroupMap] = useState<Record<string, string>>({}); // 회사→계열
  const [favGroups, setFavGroups] = useState<Set<string>>(new Set());
  const [favCompanies, setFavCompanies] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const groupOf = (co: string) => groupMap[co] ?? "기타";
  // 기업 별표 여부: 그 기업이 직접 별표됐거나, 소속 계열이 별표된 경우
  const isFavCompany = (co: string) => favCompanies.has(co) || favGroups.has(groupOf(co));

  const load = useCallback(async () => {
    const r = await api.boardRows({ dim, period }).catch(() => ({ rows: [] as BoardRow[] }));
    setRows(r.rows);
  }, [dim, period]);

  useEffect(() => {
    (async () => {
      const me = await api.me().catch(() => ({ user: null }));
      if (!me.user) {
        window.location.href = "/login";
        return;
      }
      api.companyGroups().then((r) => setGroupMap(r.map)).catch(() => {});
      api.companyFavorites().then((f) => { setFavGroups(new Set(f.groups)); setFavCompanies(new Set(f.companies)); }).catch(() => {});
      load();
    })();
  }, [load]);

  // 생성 중 칸 있으면 폴링
  useEffect(() => {
    if (rows?.some((row) => row.cells.some((c) => c.rollup?.status === "pending"))) {
      const t = setInterval(() => load(), 3000);
      return () => clearInterval(t);
    }
  }, [rows, load]);

  async function generateCell(rowKey: string, periodKey: string) {
    await api
      .generateBoardCell({ dim, key: dim === "news" ? undefined : rowKey, period, periodKey })
      .catch(() => null);
    load();
  }
  async function generateAll() {
    setBusy(true);
    try {
      await api.generateAllBoard({ dim, period }).catch(() => null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const pendingCount = rows?.reduce((n, r) => n + r.cells.filter((c) => c.rollup?.status === "pending").length, 0) ?? 0;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <a href="/" className="text-sm text-ink-sub hover:text-ink">← 대시보드</a>
      <h1 className="mt-3 text-2xl font-bold">흐름 보드</h1>
      <p className="mt-1 text-sm text-ink-sub">기간별 흐름과 주요 이슈를 한눈에. 업로드하면 자동 갱신되고, 빈 칸은 한 번에 채울 수 있어요.</p>

      {/* 컨트롤 */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-line p-1">
          {DIMS.map((d) => (
            <button
              key={d.k}
              onClick={() => {
                setDim(d.k);
                setRowFilter(null);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                dim === d.k ? "bg-primary text-white" : "text-ink-sub hover:bg-bg-deep"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg border border-line p-1">
          {(["month", "year"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                period === p ? "bg-ink text-white" : "text-ink-sub hover:bg-bg-deep"
              }`}
            >
              {p === "month" ? "월별" : "연별"}
            </button>
          ))}
        </div>
        <button
          onClick={generateAll}
          disabled={busy || !rows || rows.length === 0}
          className="ml-auto rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:brightness-105 disabled:opacity-50"
        >
          {busy ? "생성 요청 중..." : pendingCount > 0 ? `생성 중 ${pendingCount}` : "빈 칸 모두 생성"}
        </button>
      </div>

      {/* 행 필터: 산업=산업, 기업=계열별 */}
      {rows &&
        rows.length > 1 &&
        dim !== "news" &&
        (() => {
          // 기업 차원은 계열로 묶어 필터
          const chips =
            dim === "company"
              ? [...new Set(rows.map((r) => groupOf(r.label)))].sort((a, b) => {
                  const fa = favGroups.has(a);
                  const fb = favGroups.has(b);
                  if (fa !== fb) return fa ? -1 : 1; // 별표 계열 우선
                  return a === "기타" ? 1 : b === "기타" ? -1 : a.localeCompare(b);
                })
              : rows.map((r) => r.key);
          const chipLabel = (k: string) => (dim === "company" ? k : rows.find((r) => r.key === k)?.label ?? k);
          return (
            <div className="mt-4 flex flex-wrap gap-1.5">
              <button
                onClick={() => setRowFilter(null)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  !rowFilter ? "border-primary bg-primary/10 text-primary" : "border-line text-ink-sub hover:bg-bg-deep"
                }`}
              >
                전체
              </button>
              {chips.map((k) => {
                const starred = dim === "industry" ? (rows.find((r) => r.key === k)?.star ?? false) : dim === "company" ? favGroups.has(k) : false;
                return (
                  <button
                    key={k}
                    onClick={() => setRowFilter(k)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      rowFilter === k ? "border-primary bg-primary/10 text-primary" : "border-line text-ink-sub hover:bg-bg-deep"
                    }`}
                  >
                    {starred ? "★ " : ""}
                    {chipLabel(k)}
                  </button>
                );
              })}
            </div>
          );
        })()}

      {/* 행(타임라인) */}
      {rows === null ? (
        <p className="mt-6 text-ink-muted">불러오는 중...</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
          {dim === "industry" ? (
            <>
              아직 산업 흐름이 없어요. 리포트를 올리면 그 산업이 자동으로 여기 쌓여요.{" "}
              <a href="/upload" className="text-primary hover:underline">업로드</a>
            </>
          ) : dim === "company" ? (
            "기업 문서를 올리면 회사별 흐름이 모여요."
          ) : (
            "표시할 항목이 없어요."
          )}
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {rows
            .filter((row) => !rowFilter || (dim === "company" ? groupOf(row.label) === rowFilter : row.key === rowFilter))
            .sort((a, b) => {
              // 별표 우선(산업=row.star, 기업=직접 별표 또는 소속 계열 별표)
              const fa = dim === "company" ? isFavCompany(a.label) : !!a.star;
              const fb = dim === "company" ? isFavCompany(b.label) : !!b.star;
              return fa === fb ? 0 : fa ? -1 : 1;
            })
            .map((row) => {
              const starred = dim === "company" ? isFavCompany(row.label) : !!row.star;
              return (
            <div key={row.key}>
              <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-primary">
                {starred && <span className="text-amber-500">★</span>}
                {row.label}
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {row.cells.map((cell) => (
                  <Cell
                    key={cell.periodKey}
                    cell={cell}
                    period={period}
                    href={cellHref(dim, row.key, period, cell.periodKey)}
                    onGenerate={() => generateCell(row.key, cell.periodKey)}
                  />
                ))}
              </div>
            </div>
              );
            })}
        </div>
      )}
    </main>
  );
}

// 팩트 문장 정리(줄바꿈·중복 공백 제거). 읽기용이라 자르지 않고 line-clamp 로 제어.
const clean = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

function Cell({
  cell,
  period,
  href,
  onGenerate,
}: {
  cell: BoardCell;
  period: "month" | "year";
  href: string;
  onGenerate: () => void;
}) {
  const r = cell.rollup;
  const common = r?.facts.filter((f) => f.factType === "common") ?? [];
  const conflict = r?.facts.filter((f) => f.factType === "conflict") ?? [];
  const head = (
    <div className="mb-2 text-xs font-bold text-ink-muted">{fmtPeriod(cell.periodKey, period)}</div>
  );
  const base = "flex w-72 shrink-0 flex-col rounded-card bg-card p-4 shadow-card";

  if (!r)
    return (
      <div className={base}>
        {head}
        <button
          onClick={onGenerate}
          className="mt-1 rounded-lg border border-dashed border-line py-2.5 text-xs text-ink-sub hover:border-primary hover:text-primary"
        >
          + 생성
        </button>
      </div>
    );
  if (r.status === "pending")
    return (
      <div className={base}>
        {head}
        <p className="mt-1 text-xs text-ink-muted">생성 중...</p>
      </div>
    );
  if (r.status === "failed")
    return (
      <div className={base}>
        {head}
        <button onClick={onGenerate} className="mt-1 text-xs text-red-500 hover:underline">
          실패 · 다시
        </button>
      </div>
    );

  const empty = (r.oneLiner ?? "").startsWith("이 기간");
  // done: 키워드 칩 위주 + 클릭 → 근거 내용
  return (
    <a href={href} className={`${base} group/cell transition hover:ring-1 hover:ring-primary/40`}>
      {head}
      {empty ? (
        <p className="text-xs text-ink-muted">기록 없음</p>
      ) : (
        <div className="space-y-2.5">
          {/* 요약: 한눈에 파악(가독성 우선) */}
          <p className="line-clamp-3 text-sm font-semibold leading-snug text-ink">{r.oneLiner ?? "-"}</p>
          {common.length > 0 && (
            <ul className="space-y-1">
              {common.slice(0, 3).map((f) => (
                <li key={f.id} className="flex gap-1.5 text-[12px] leading-snug text-ink-sub">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-muted" />
                  <span className="line-clamp-2">{clean(f.content)}</span>
                </li>
              ))}
            </ul>
          )}
          {conflict.slice(0, 2).map((f) => (
            <div key={f.id} className="flex gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-[12px] leading-snug text-amber-700">
              <span className="shrink-0">⚡</span>
              <span className="line-clamp-2">{clean(f.content)}</span>
            </div>
          ))}
          <span className="mt-0.5 inline-block text-[11px] font-medium text-primary opacity-0 transition group-hover/cell:opacity-100">자세히 · 원문 →</span>
        </div>
      )}
    </a>
  );
}
