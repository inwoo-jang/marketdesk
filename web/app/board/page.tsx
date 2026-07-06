"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type BoardRow, type BoardCell, type BoardDim } from "@/lib/api";

const DIMS: { k: BoardDim; label: string }[] = [
  { k: "industry", label: "산업별" },
  { k: "company", label: "기업별" },
  { k: "news", label: "뉴스별" },
];
const fmtPeriod = (k: string, period: "month" | "year") =>
  period === "year" ? `${k}년` : `${k.slice(0, 4)}.${k.slice(5)}`;

// 흐름 보드: 산업 선택 없이 관심 산업/기업/뉴스를 각각 타임라인 행으로. "빈 칸 모두 생성"으로 한 번에.
export default function BoardPage() {
  const [dim, setDim] = useState<BoardDim>("industry");
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [busy, setBusy] = useState(false);

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
              onClick={() => setDim(d.k)}
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

      {/* 행(타임라인) */}
      {rows === null ? (
        <p className="mt-6 text-ink-muted">불러오는 중...</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
          {dim === "industry" ? (
            <>
              관심 산업(★)이 없어요.{" "}
              <a href="/" className="text-primary hover:underline">대시보드에서 ★ 추가</a>
            </>
          ) : dim === "company" ? (
            "기업 문서를 올리면 회사별 흐름이 모여요."
          ) : (
            "표시할 항목이 없어요."
          )}
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {rows.map((row) => (
            <div key={row.key}>
              <div className="mb-2 text-sm font-semibold text-primary">{row.label}</div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {row.cells.map((cell) => (
                  <Cell
                    key={cell.periodKey}
                    cell={cell}
                    period={period}
                    onGenerate={() => generateCell(row.key, cell.periodKey)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function Cell({
  cell,
  period,
  onGenerate,
}: {
  cell: BoardCell;
  period: "month" | "year";
  onGenerate: () => void;
}) {
  const r = cell.rollup;
  const common = r?.facts.filter((f) => f.factType === "common") ?? [];
  const conflict = r?.facts.filter((f) => f.factType === "conflict") ?? [];
  return (
    <div className="flex w-60 shrink-0 flex-col rounded-card bg-card p-3 shadow-card">
      <div className="mb-1.5 text-xs font-bold text-ink-muted">{fmtPeriod(cell.periodKey, period)}</div>
      {!r ? (
        <button
          onClick={onGenerate}
          className="mt-1 rounded-lg border border-dashed border-line py-2.5 text-xs text-ink-sub hover:border-primary hover:text-primary"
        >
          + 생성
        </button>
      ) : r.status === "pending" ? (
        <p className="mt-1 text-xs text-ink-muted">생성 중...</p>
      ) : r.status === "failed" ? (
        <button onClick={onGenerate} className="mt-1 text-xs text-red-500 hover:underline">
          실패 · 다시
        </button>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium leading-snug text-ink">{r.oneLiner ?? "-"}</p>
          {common.length > 0 && (
            <ul className="space-y-0.5 text-[11px] text-ink-sub">
              {common.map((f) => (
                <li key={f.id}>· {f.content}</li>
              ))}
            </ul>
          )}
          {conflict.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-amber-600">엇갈림</div>
              <ul className="space-y-0.5 text-[11px] text-ink-sub">
                {conflict.map((f) => (
                  <li key={f.id}>· {f.content}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
