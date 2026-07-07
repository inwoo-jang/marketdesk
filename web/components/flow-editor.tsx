"use client";

import { useState } from "react";
import { api, type BoardDim } from "@/lib/api";

type Fact = { type: "common" | "conflict"; content: string };

// 흐름 요약(한 줄 + 핵심/엇갈림) 보기 + 직접 편집. 흐름 상세·개별 산업 페이지 공용.
export function FlowEditor({
  dim,
  factKey,
  period,
  periodKey,
  oneLiner,
  facts,
  onSaved,
}: {
  dim: BoardDim;
  factKey: string;
  period: "month" | "year";
  periodKey: string;
  oneLiner: string | null;
  facts: { factType: string; content: string | null }[];
  onSaved?: () => void;
}) {
  const norm = (): Fact[] =>
    facts.map((f) => ({ type: f.factType === "conflict" ? "conflict" : "common", content: f.content ?? "" }));
  const [editing, setEditing] = useState(false);
  const [line, setLine] = useState(oneLiner ?? "");
  const [items, setItems] = useState<Fact[]>(norm());
  const [saving, setSaving] = useState(false);

  function start() {
    setLine(oneLiner ?? "");
    setItems(norm());
    setEditing(true);
  }
  function setItem(i: number, patch: Partial<Fact>) {
    setItems((arr) => arr.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function addItem() {
    setItems((arr) => [...arr, { type: "common", content: "" }]);
  }
  function removeItem(i: number) {
    setItems((arr) => arr.filter((_, idx) => idx !== i));
  }
  async function save() {
    setSaving(true);
    try {
      await api.editRollup({
        dim,
        key: factKey,
        period,
        periodKey,
        oneLiner: line.trim(),
        facts: items.filter((f) => f.content.trim()),
      });
      setEditing(false);
      onSaved?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  const common = items.filter((f) => f.type === "common");
  const conflict = items.filter((f) => f.type === "conflict");

  if (!editing) {
    return (
      <div>
        <div className="mb-1 flex items-center justify-between">
          <div className="text-xs font-semibold text-primary">이 기간 흐름</div>
          <button onClick={start} className="text-xs font-medium text-ink-muted hover:text-primary">편집</button>
        </div>
        {line ? (
          <p className="text-[15px] font-medium leading-snug text-ink">{line}</p>
        ) : (
          <p className="text-sm text-ink-muted">요약이 없어요. 편집으로 직접 정리할 수 있어요.</p>
        )}
        {common.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-semibold text-primary">✓ 핵심</div>
            <ul className="mt-1 space-y-0.5 text-sm text-ink-sub">
              {common.map((f, i) => (
                <li key={i}>· {f.content}</li>
              ))}
            </ul>
          </div>
        )}
        {conflict.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-semibold text-amber-600">⚡ 엇갈림</div>
            <ul className="mt-1 space-y-0.5 text-sm text-ink-sub">
              {conflict.map((f, i) => (
                <li key={i}>· {f.content}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-primary">흐름 요약 편집</div>
      <textarea
        value={line}
        onChange={(e) => setLine(e.target.value)}
        rows={2}
        placeholder="이 기간 흐름 한 줄"
        className="w-full resize-y rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <div className="mt-3 space-y-2">
        {items.map((f, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <select
              value={f.type}
              onChange={(e) => setItem(i, { type: e.target.value as "common" | "conflict" })}
              className="shrink-0 rounded-lg border border-line bg-card px-1.5 py-1 text-xs outline-none focus:border-primary"
            >
              <option value="common">핵심</option>
              <option value="conflict">엇갈림</option>
            </select>
            <textarea
              value={f.content}
              onChange={(e) => setItem(i, { content: e.target.value })}
              rows={1}
              placeholder="내용"
              className="min-h-[34px] flex-1 resize-y rounded-lg border border-line px-2 py-1.5 text-sm outline-none focus:border-primary"
            />
            <button onClick={() => removeItem(i)} className="mt-1 shrink-0 text-ink-muted hover:text-red-500" title="삭제">✕</button>
          </div>
        ))}
      </div>
      <button onClick={addItem} className="mt-2 text-xs font-medium text-primary hover:underline">+ 항목 추가</button>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={() => setEditing(false)} className="text-xs text-ink-sub">취소</button>
        <button onClick={save} disabled={saving} className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
