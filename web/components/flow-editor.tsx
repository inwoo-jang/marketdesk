"use client";

import { useState } from "react";
import { type BoardDim, type FactDelta, type TriggerHit } from "@/lib/api";

// 전월 대비 델타 뱃지: NEW(이번 달 신규) / N개월 연속 / 승격(엇갈림→핵심).
function DeltaBadge({ d }: { d?: FactDelta | null }) {
  if (!d) return null;
  if (d.kind === "new")
    return <span className="rounded bg-emerald-50 px-1 text-[10px] font-medium text-emerald-600">NEW</span>;
  if (d.kind === "promoted")
    return <span className="rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-600">승격</span>;
  if (d.kind === "recurring" && d.months >= 2)
    return <span className="rounded bg-ink/5 px-1 text-[10px] font-medium text-ink-muted">{d.months}개월 연속</span>;
  return null;
}

type FactItem = { id?: string; factType: string; content: string | null; delta?: FactDelta | null; hits?: TriggerHit[] };

// 흐름 위험 신호 항목: 문구 + '감지 N'(이 신호에 맞는 새 자료) 펼치기. 흐름을 보며 무엇이 흐름을 꺾을지 확인.
function TriggerRow({ f }: { f: FactItem }) {
  const [open, setOpen] = useState(false);
  const hits = f.hits ?? [];
  return (
    <li className="flex gap-2">
      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
      <div className="min-w-0">
        <span>
          {f.content}
          {hits.length > 0 && (
            <button
              onClick={() => setOpen((v) => !v)}
              title="이 신호에 맞는 새 자료 보기"
              className="ml-1.5 rounded bg-rose-100 px-1 text-[10px] font-bold text-rose-700 hover:bg-rose-200"
            >
              감지 {hits.length}
            </button>
          )}
        </span>
        {open && hits.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {hits.map((h) => (
              <li key={h.reportId} className="text-[11px]">
                <a href={`/reports/${h.reportId}`} className="text-rose-600 hover:underline">
                  ↳ {h.title ?? "관련 자료"}
                </a>
                {h.matched && <span className="ml-1 text-ink-muted">· 겹친 말: {h.matched}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

// 흐름 요약 보기(한 줄 + 핵심/엇갈림/트리거). 편집은 재생성과 겹쳐 애매하므로 보기 전용.
// sourceCount/onFactToggle 이 오면 항목별 "근거 N" 버튼(클릭 시 근거 원문 필터).
export function FlowEditor({
  oneLiner,
  facts,
  sourceCount,
  activeFactId,
  onFactToggle,
}: {
  dim?: BoardDim;
  factKey?: string;
  period?: "month" | "year";
  periodKey?: string;
  oneLiner: string | null;
  facts: FactItem[];
  onSaved?: () => void;
  sourceCount?: (id: string) => number;
  activeFactId?: string | null;
  onFactToggle?: (id: string) => void;
}) {
  const common = facts.filter((f) => f.factType !== "conflict" && f.factType !== "trigger");
  const conflict = facts.filter((f) => f.factType === "conflict");
  const triggers = facts.filter((f) => f.factType === "trigger");

  // 근거 있는 항목은 문장 전체를 클릭 → 근거 원문 필터. 끝에 작은 'N→'(활성 시 'N✕')만.
  const Item = ({ f, dot }: { f: FactItem; dot: string }) => {
    const n = f.id && sourceCount ? sourceCount(f.id) : 0;
    const clickable = !!(f.id && onFactToggle && n > 0);
    const active = activeFactId === f.id;
    return (
      <li
        onClick={clickable ? () => onFactToggle!(f.id!) : undefined}
        title={clickable ? `근거 원문 ${n}건 보기` : undefined}
        className={`flex gap-2 rounded ${active ? "bg-primary/5" : ""} ${clickable ? "cursor-pointer px-1 hover:bg-primary/5" : ""}`}
      >
        <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        <span>
          {f.content}
          {f.delta && <span className="ml-1.5 inline-flex align-middle"><DeltaBadge d={f.delta} /></span>}
          {clickable && (
            <span className={`ml-1 text-[10px] font-semibold tabular-nums ${active ? "text-primary" : "text-primary/45"}`}>
              {active ? `${n}✕` : `${n}→`}
            </span>
          )}
        </span>
      </li>
    );
  };

  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-primary">이 기간 흐름</div>
      {oneLiner ? (
        <p className="text-[15px] font-medium leading-snug text-ink">{oneLiner}</p>
      ) : (
        <p className="text-sm text-ink-muted">요약이 아직 없어요.</p>
      )}
      {common.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-primary">✓ 핵심</div>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed text-ink-sub">
            {common.map((f, i) => (
              <Item key={f.id ?? i} f={f} dot="bg-primary/50" />
            ))}
          </ul>
        </div>
      )}
      {conflict.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-amber-600">⚡ 엇갈림</div>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed text-ink-sub">
            {conflict.map((f, i) => (
              <Item key={f.id ?? i} f={f} dot="bg-amber-400" />
            ))}
          </ul>
        </div>
      )}
      {triggers.length > 0 && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50/60 p-3">
          <div className="text-xs font-semibold text-rose-600">⚠️ 흐름 위험 신호</div>
          <p className="mt-0.5 text-[11px] text-ink-muted">지금 흐름이 꺾일 수 있는 조건이에요. 투자 판단이 아니라 지켜볼 신호.</p>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed text-ink-sub">
            {triggers.map((f, i) => (
              <TriggerRow key={f.id ?? i} f={f} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
