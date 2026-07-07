"use client";

import { type BoardDim } from "@/lib/api";

// 흐름 요약 보기(한 줄 + 핵심/엇갈림). 편집은 재생성과 겹쳐 애매하므로 보기 전용.
export function FlowEditor({
  oneLiner,
  facts,
}: {
  dim?: BoardDim;
  factKey?: string;
  period?: "month" | "year";
  periodKey?: string;
  oneLiner: string | null;
  facts: { factType: string; content: string | null }[];
  onSaved?: () => void;
}) {
  const common = facts.filter((f) => f.factType !== "conflict");
  const conflict = facts.filter((f) => f.factType === "conflict");

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
              <li key={i} className="flex gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                <span>{f.content}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {conflict.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-amber-600">⚡ 엇갈림</div>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed text-ink-sub">
            {conflict.map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                <span>{f.content}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
