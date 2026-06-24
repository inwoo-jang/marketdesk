"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

// 떠다니는 용어 풀이 패널(스크롤 따라 고정). 단어 클릭 모드 ON 시 본문 아무 단어나 클릭 → AI 100자 설명.
const isWordChar = (c: string) => /[\p{L}\p{N}]/u.test(c);

// 한국어 조사·어미 제거(클릭 단어용). "로드맵과"→"로드맵". 어간 2자 이상 유지, 한글 끝일 때만.
const JOSA = [
  "으로부터", "에서부터", "에게서", "으로서", "으로써", "이라는", "에서", "에게", "께서", "으로",
  "처럼", "만큼", "보다", "까지", "부터", "조차", "마저", "이나", "에는", "로서", "로써", "라고",
  "이라", "에", "의", "을", "를", "은", "는", "이", "가", "와", "과", "로", "도", "만", "랑", "나", "며",
].sort((a, b) => b.length - a.length);
function stripJosa(w: string): string {
  if (!/[가-힣]$/.test(w)) return w; // 한글로 끝날 때만(영문 약어 등은 그대로)
  for (const j of JOSA) {
    if (w.endsWith(j) && w.length - j.length >= 2) return w.slice(0, w.length - j.length);
  }
  return w;
}

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
  const [open, setOpen] = useState(false);
  const [clickMode, setClickMode] = useState(false);
  const [term, setTerm] = useState("");
  const [input, setInput] = useState("");
  const [def, setDef] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cache = useRef<Map<string, string>>(new Map());
  const panelRef = useRef<HTMLDivElement>(null);

  const lookup = useCallback(
    async (raw: string) => {
      const t = raw.trim().slice(0, 40);
      if (!t) return;
      setOpen(true);
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
      if (w) lookup(stripJosa(w));
    };
    el.addEventListener("click", onClick);
    el.classList.add("cursor-help");
    return () => {
      el.removeEventListener("click", onClick);
      el.classList.remove("cursor-help");
    };
  }, [clickMode, targetRef, lookup]);

  // 바깥(다른 화면) 클릭 시 접기. 단, 패널 내부와 클릭모드 중 본문 클릭(단어 풀이)은 예외.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (clickMode && targetRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, clickMode, targetRef]);

  // 접힘: 돋보기 + 용어 검색 버튼만
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-20 inline-flex items-center gap-1.5 rounded-full border border-line bg-card/95 px-4 py-2.5 text-sm font-medium shadow-card backdrop-blur hover:bg-bg-deep print:hidden"
      >
        🔎 <span>용어 검색</span>
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      onMouseDown={(e) => e.stopPropagation()}
      className="fixed bottom-5 right-5 z-20 w-72 rounded-card border border-line bg-card/95 p-3 shadow-card backdrop-blur print:hidden"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">🔎 용어 풀이</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setClickMode((v) => !v)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              clickMode ? "bg-primary text-white" : "border border-line text-ink-sub hover:bg-bg-deep"
            }`}
            title="켜면 본문 단어를 클릭해 바로 뜻을 볼 수 있어요"
          >
            {clickMode ? "단어 클릭 ON" : "단어 클릭 OFF"}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="rounded-full px-1.5 py-1 text-xs text-ink-muted hover:bg-bg-deep"
            title="숨김"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (lookup(input), setInput(""))}
          placeholder="단어 입력"
          className="min-w-0 flex-1 rounded-lg border border-line px-2 py-1.5 text-xs outline-none focus:border-primary"
        />
        <button
          onClick={() => {
            lookup(input);
            setInput("");
          }}
          className="shrink-0 rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-white"
        >
          검색
        </button>
      </div>
      {(term || loading) && (
        <div className="mt-2 rounded-lg bg-bg-deep p-2.5 text-xs">
          <div className="font-semibold text-primary">{term}</div>
          <div className="mt-0.5 leading-relaxed text-ink-sub">{loading ? "찾는 중..." : def}</div>
        </div>
      )}
      {clickMode && <p className="mt-2 text-[11px] text-ink-muted">본문에서 궁금한 단어를 클릭하세요.</p>}
    </div>
  );
}
