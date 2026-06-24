"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

// 떠다니는 용어 풀이 패널(스크롤 따라 고정). 단어 클릭 모드 ON 시 본문 아무 단어나 클릭 → AI 100자 설명.
const isWordChar = (c: string) => /[\p{L}\p{N}]/u.test(c);

// 클릭 좌표의 단어 추출(브라우저 caret API)
function wordAtPoint(x: number, y: number): string | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let node: Node | null = null;
  let offset = 0;
  if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(x, y);
    if (r) {
      node = r.startContainer;
      offset = r.startOffset;
    }
  } else if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    if (p) {
      node = p.offsetNode;
      offset = p.offset;
    }
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent ?? "";
  if (text.length === 0) return null;
  let i = Math.min(offset, text.length - 1);
  if (!isWordChar(text[i]) && i > 0) i--;
  if (!isWordChar(text[i])) return null;
  let s = i;
  let e = i;
  while (s > 0 && isWordChar(text[s - 1])) s--;
  while (e < text.length && isWordChar(text[e])) e++;
  const w = text.slice(s, e).trim();
  return w.length >= 1 ? w : null;
}

export function WordLookup({
  targetRef,
  contextText,
}: {
  targetRef: React.RefObject<HTMLElement | null>;
  contextText?: string;
}) {
  const [clickMode, setClickMode] = useState(false);
  const [term, setTerm] = useState("");
  const [input, setInput] = useState("");
  const [def, setDef] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cache = useRef<Map<string, string>>(new Map());

  const lookup = useCallback(
    async (raw: string) => {
      const t = raw.trim().slice(0, 40);
      if (!t) return;
      setTerm(t);
      setDef(null);
      const cached = cache.current.get(t);
      if (cached) {
        setDef(cached);
        return;
      }
      setLoading(true);
      try {
        const r = await api.define(t, contextText);
        cache.current.set(t, r.definition);
        setDef(r.definition);
      } catch {
        setDef("설명을 가져오지 못했어요.");
      } finally {
        setLoading(false);
      }
    },
    [contextText],
  );

  // 클릭 모드: 본문 클릭 → 단어 추출 → 풀이
  useEffect(() => {
    const el = targetRef.current;
    if (!clickMode || !el) return;
    const onClick = (e: MouseEvent) => {
      const w = wordAtPoint(e.clientX, e.clientY);
      if (w) lookup(w);
    };
    el.addEventListener("click", onClick);
    el.classList.add("cursor-help");
    return () => {
      el.removeEventListener("click", onClick);
      el.classList.remove("cursor-help");
    };
  }, [clickMode, targetRef, lookup]);

  return (
    <div className="fixed bottom-5 right-5 z-20 w-72 rounded-card border border-line bg-card/95 p-3 shadow-card backdrop-blur print:hidden">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">🔎 용어 풀이</span>
        <button
          onClick={() => setClickMode((v) => !v)}
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            clickMode ? "bg-primary text-white" : "border border-line text-ink-sub hover:bg-bg-deep"
          }`}
          title="켜면 본문 단어를 클릭해 바로 뜻을 볼 수 있어요"
        >
          {clickMode ? "단어 클릭 ON" : "단어 클릭 OFF"}
        </button>
      </div>
      <div className="flex gap-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (lookup(input), setInput(""))}
          placeholder="단어 입력 또는 본문 클릭"
          className="w-full rounded-lg border border-line px-2.5 py-1.5 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={() => {
            lookup(input);
            setInput("");
          }}
          className="rounded-lg bg-ink px-3 text-sm font-medium text-white"
        >
          검색
        </button>
      </div>
      {(term || loading) && (
        <div className="mt-2 rounded-lg bg-bg-deep p-2.5 text-sm">
          <div className="font-semibold text-primary">{term}</div>
          <div className="mt-0.5 text-ink-sub">{loading ? "찾는 중..." : def}</div>
        </div>
      )}
      {clickMode && <p className="mt-2 text-[11px] text-ink-muted">본문에서 궁금한 단어를 클릭하세요.</p>}
    </div>
  );
}
