"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Board, type BoardDim } from "@/lib/api";

const DIMS: { k: BoardDim; label: string }[] = [
  { k: "industry", label: "산업별" },
  { k: "company", label: "기업별" },
  { k: "news", label: "뉴스별" },
];
const fmtPeriod = (k: string, period: "month" | "year") =>
  period === "year" ? `${k}년` : `${k.slice(0, 4)}.${k.slice(5)}`;

// 흐름 보드: 월/년 × 산업/기업/뉴스 가로 타임라인. 각 칸 = 그 기간 흐름 + 주요 이슈(공통/엇갈림).
export default function BoardPage() {
  const [scopes, setScopes] = useState<{ industries: { id: string; name: string }[]; companies: string[] }>({
    industries: [],
    companies: [],
  });
  const [dim, setDim] = useState<BoardDim>("industry");
  const [key, setKey] = useState<string>("");
  const [period, setPeriod] = useState<"month" | "year">("month");
  const [board, setBoard] = useState<Board | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const me = await api.me().catch(() => ({ user: null }));
      if (!me.user) {
        window.location.href = "/login";
        return;
      }
      const s = await api.boardScopes().catch(() => ({ industries: [], companies: [] }));
      setScopes(s);
      setKey(s.industries[0]?.id ?? "");
      setLoaded(true);
    })();
  }, []);

  const loadBoard = useCallback(async () => {
    if (dim !== "news" && !key) {
      setBoard(null);
      return;
    }
    const b = await api.board({ dim, key: dim === "news" ? undefined : key, period }).catch(() => null);
    setBoard(b);
  }, [dim, key, period]);

  useEffect(() => {
    if (loaded) loadBoard();
  }, [loaded, loadBoard]);

  // 생성 중(pending) 칸 있으면 폴링
  useEffect(() => {
    if (board?.cells.some((c) => c.rollup?.status === "pending")) {
      const t = setInterval(() => loadBoard(), 3000);
      return () => clearInterval(t);
    }
  }, [board, loadBoard]);

  function pickDim(d: BoardDim) {
    setDim(d);
    setKey(d === "industry" ? (scopes.industries[0]?.id ?? "") : d === "company" ? (scopes.companies[0] ?? "") : "");
  }

  async function generate(periodKey: string) {
    await api
      .generateBoardCell({ dim, key: dim === "news" ? undefined : key, period, periodKey })
      .catch(() => null);
    loadBoard();
  }

  if (!loaded) return <main className="p-12 text-ink-muted">불러오는 중...</main>;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <a href="/" className="text-sm text-ink-sub hover:text-ink">← 대시보드</a>
      <h1 className="mt-3 text-2xl font-bold">흐름 보드</h1>
      <p className="mt-1 text-sm text-ink-sub">기간별 흐름과 주요 이슈를 한눈에. 칸을 만들면 그 기간 분석들을 종합합니다.</p>

      {/* 컨트롤 */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-line p-1">
          {DIMS.map((d) => (
            <button
              key={d.k}
              onClick={() => pickDim(d.k)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                dim === d.k ? "bg-primary text-white" : "text-ink-sub hover:bg-bg-deep"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {dim === "industry" &&
          (scopes.industries.length > 0 ? (
            <select
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {scopes.industries.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-ink-muted">
              관심 산업(★)이 없어요.{" "}
              <a href="/" className="text-primary hover:underline">
                대시보드에서 ★ 추가
              </a>
            </span>
          ))}
        {dim === "company" &&
          (scopes.companies.length > 0 ? (
            <select
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {scopes.companies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-ink-muted">아직 기업 문서가 없어요. 기업 리포트를 올리면 회사별로 모여요.</span>
          ))}

        <div className="ml-auto flex gap-1 rounded-lg border border-line p-1">
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
      </div>

      {/* 타임라인 */}
      {board && (board.dim !== "news" ? key : true) ? (
        <div className="mt-6">
          <div className="mb-2 text-sm font-semibold text-primary">{board.label} · {period === "month" ? "월별" : "연별"} 흐름</div>
          <div className="flex gap-3 overflow-x-auto pb-3">
            {board.cells.map((cell) => {
              const r = cell.rollup;
              const common = r?.facts.filter((f) => f.factType === "common") ?? [];
              const conflict = r?.facts.filter((f) => f.factType === "conflict") ?? [];
              return (
                <div key={cell.periodKey} className="flex w-64 shrink-0 flex-col rounded-card bg-card p-4 shadow-card">
                  <div className="mb-2 text-xs font-bold text-ink-muted">{fmtPeriod(cell.periodKey, period)}</div>
                  {!r ? (
                    <button
                      onClick={() => generate(cell.periodKey)}
                      className="mt-2 rounded-lg border border-dashed border-line py-3 text-xs text-ink-sub hover:border-primary hover:text-primary"
                    >
                      + 흐름 생성
                    </button>
                  ) : r.status === "pending" ? (
                    <p className="mt-2 text-xs text-ink-muted">생성 중...</p>
                  ) : r.status === "failed" ? (
                    <button onClick={() => generate(cell.periodKey)} className="mt-2 text-xs text-red-500 hover:underline">
                      실패 · 다시 생성
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm font-medium leading-snug text-ink">{r.oneLiner ?? "-"}</p>
                      {common.length > 0 && (
                        <div>
                          <div className="text-[11px] font-semibold text-success-text">공통</div>
                          <ul className="mt-0.5 space-y-0.5 text-xs text-ink-sub">
                            {common.map((f) => (
                              <li key={f.id}>· {f.content}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {conflict.length > 0 && (
                        <div>
                          <div className="text-[11px] font-semibold text-amber-600">엇갈림</div>
                          <ul className="mt-0.5 space-y-0.5 text-xs text-ink-sub">
                            {conflict.map((f) => (
                              <li key={f.id}>· {f.content}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <button onClick={() => generate(cell.periodKey)} className="text-[11px] text-ink-muted hover:text-primary">
                        다시 생성
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mt-6 rounded-card bg-card p-6 text-sm text-ink-sub shadow-card">
          {dim === "company" ? "기업 문서를 올리면 회사별 흐름을 볼 수 있어요." : "선택할 항목이 없어요."}
        </p>
      )}
    </main>
  );
}
