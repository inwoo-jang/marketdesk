"use client";

import type { Usage } from "@/lib/api";

// 잔여 무료 한도 표시. free = "무료 분석 N/한도 남음"(소진 시 빨강+업그레이드), pro/무제한 = Pro 배지.
export function UsageBadge({ usage }: { usage: Usage | null }) {
  if (!usage) return null;

  if (usage.plan === "pro" || usage.limit == null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
        Pro · 무제한 분석
      </span>
    );
  }

  const remaining = usage.remaining ?? Math.max(0, usage.limit - usage.used);
  const empty = remaining <= 0;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
        empty ? "bg-red-50 text-red-600" : "bg-success-bg text-success-text"
      }`}
      title={`오늘 ${usage.used}/${usage.limit}회 사용`}
    >
      {empty ? "오늘 무료 분석 모두 사용" : `무료 분석 ${remaining}/${usage.limit}회 남음`}
      {empty && (
        <a href="/settings" className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] text-white">
          업그레이드
        </a>
      )}
    </span>
  );
}
