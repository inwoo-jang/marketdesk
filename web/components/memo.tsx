"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api, type Memo } from "@/lib/api";

// 본문 선택 → 메모 작성. 본문엔 점선 밑줄만, 내용은 우측 메모란. 위치는 highlights 와 동일 offset 기준.
function getRoot(rootRef: React.RefObject<HTMLElement | null>): HTMLElement | null {
  return (rootRef.current?.querySelector("[data-highlight-root]") as HTMLElement | null) ?? null;
}
function textNodes(root: HTMLElement): Text[] {
  const out: Text[] = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = w.nextNode())) out.push(n as Text);
  return out;
}
function globalOffset(root: HTMLElement, node: Node, offset: number): number | null {
  let pos = 0;
  for (const t of textNodes(root)) {
    if (t === node) return pos + offset;
    pos += t.length;
  }
  return null;
}
function unwrapAll(root: HTMLElement) {
  root.querySelectorAll("mark[data-memo-id]").forEach((m) => {
    const p = m.parentNode;
    if (!p) return;
    while (m.firstChild) p.insertBefore(m.firstChild, m);
    p.removeChild(m);
    p.normalize();
  });
}
function markMemo(root: HTMLElement, start: number, end: number, id: string) {
  let pos = 0;
  const pieces: { node: Text; from: number; to: number }[] = [];
  for (const t of textNodes(root)) {
    const s = Math.max(start, pos);
    const e = Math.min(end, pos + t.length);
    if (s < e) pieces.push({ node: t, from: s - pos, to: e - pos });
    pos += t.length;
  }
  for (const { node, from, to } of pieces) {
    try {
      const range = document.createRange();
      range.setStart(node, from);
      range.setEnd(node, to);
      const mk = document.createElement("mark");
      mk.dataset.memoId = id;
      mk.style.background = "transparent";
      mk.style.borderBottom = "2px dotted #2D5BFF";
      mk.style.cursor = "help";
      range.surroundContents(mk);
    } catch {
      /* 경계 스킵 */
    }
  }
}

export function MemoLayer({
  reportId,
  rootRef,
  ready,
  reloadKey,
}: {
  reportId: string;
  rootRef: React.RefObject<HTMLElement | null>;
  ready: boolean;
  reloadKey?: number;
}) {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [palette, setPalette] = useState<{ x: number; y: number; start: number; end: number; text: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notesHidden, setNotesHidden] = useState(false);
  const [positions, setPositions] = useState<Record<string, { top: number; left: number }>>({});

  // 각 메모를 앵커 오른쪽 여백에 배치(문서 절대좌표 → 스크롤 동행). 리플로우/리사이즈 시 재계산.
  // 같은 줄(비슷한 top)의 여러 메모는 실제 카드 높이만큼 아래로 밀어 겹치지 않게 쌓는다.
  const recompute = useCallback(() => {
    const root = getRoot(rootRef);
    const contentEl = rootRef.current;
    if (!root || !contentEl) return;
    const cr = contentEl.getBoundingClientRect();
    const left = cr.right + window.scrollX + 12;
    const anchors: { id: string; top: number }[] = [];
    const seen = new Set<string>();
    root.querySelectorAll("mark[data-memo-id]").forEach((el) => {
      const id = (el as HTMLElement).dataset.memoId!;
      if (seen.has(id)) return;
      seen.add(id);
      const r = el.getBoundingClientRect();
      anchors.push({ id, top: r.top + window.scrollY });
    });
    anchors.sort((a, b) => a.top - b.top);
    const GAP = 8;
    const pos: Record<string, { top: number; left: number }> = {};
    let prevBottom = -Infinity;
    for (const a of anchors) {
      const h = (document.querySelector(`[data-memo-note="${a.id}"]`) as HTMLElement | null)?.offsetHeight ?? 64;
      const top = Math.max(a.top, prevBottom + GAP);
      pos[a.id] = { top, left };
      prevBottom = top + h;
    }
    setPositions(pos);
  }, [rootRef]);

  const applyAll = useCallback(async () => {
    const root = getRoot(rootRef);
    if (!root) return;
    unwrapAll(root);
    const { memos } = await api.reportMemos(reportId).catch(() => ({ memos: [] as Memo[] }));
    const full = root.textContent ?? "";
    for (const m of memos) if (full.slice(m.startOffset, m.endOffset) === m.anchorText) markMemo(root, m.startOffset, m.endOffset, m.id);
    setMemos(memos);
  }, [reportId, rootRef]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => applyAll(), 60);
    return () => clearTimeout(t);
  }, [ready, reloadKey, applyAll]);

  // 메모/레이아웃 변화 시 여백 노트 위치 재계산
  useEffect(() => {
    const t = setTimeout(recompute, 80);
    // 노트가 실제로 렌더된 뒤 높이를 반영해 한 번 더 쌓기(겹침 정확도)
    const raf = requestAnimationFrame(() => requestAnimationFrame(recompute));
    const on = () => recompute();
    window.addEventListener("resize", on);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", on);
    };
  }, [memos, recompute]);

  // 선택 → 메모 팔레트
  useEffect(() => {
    if (!ready) return;
    const onUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const root = getRoot(rootRef);
      if (!root) return;
      const range = sel.getRangeAt(0);
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
      if ((sel.anchorNode?.parentElement as HTMLElement)?.closest("input,textarea")) return;
      const s = globalOffset(root, range.startContainer, range.startOffset);
      const e = globalOffset(root, range.endContainer, range.endOffset);
      const text = sel.toString();
      if (s == null || e == null || e <= s || !text.trim()) return;
      const rect = range.getBoundingClientRect();
      setDraft("");
      setEditing(false);
      setPalette({ x: rect.left + rect.width / 2, y: rect.bottom, start: Math.min(s, e), end: Math.max(s, e), text });
    };
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, [ready, rootRef]);

  // 바깥 클릭 시 메모 팝오버 닫기(본문 재선택/다른 화면 클릭)
  useEffect(() => {
    if (!palette) return;
    const onDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest?.("[data-memo-pop]")) return;
      setPalette(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [palette]);

  // 앵커 클릭 → 우측 패널 해당 메모 강조
  useEffect(() => {
    const root = getRoot(rootRef);
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const m = (e.target as HTMLElement)?.closest?.("mark[data-memo-id]") as HTMLElement | null;
      if (!m) return;
      setActiveId(m.dataset.memoId ?? null);
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [rootRef, reloadKey, memos.length]);

  async function save() {
    if (!palette || !draft.trim()) return;
    const { start, end, text } = palette;
    const note = draft.trim();
    setPalette(null);
    window.getSelection()?.removeAllRanges();
    const { memo } = await api.addMemo(reportId, { startOffset: start, endOffset: end, anchorText: text, note }).catch(() => ({ memo: null as Memo | null }));
    if (memo) {
      const root = getRoot(rootRef);
      if (root) markMemo(root, start, end, memo.id);
      setMemos((m) => [...m, memo].sort((a, b) => a.startOffset - b.startOffset));
      setActiveId(memo.id);
    }
  }
  async function remove(id: string) {
    await api.deleteMemo(id).catch(() => {});
    const root = getRoot(rootRef);
    root?.querySelectorAll(`mark[data-memo-id="${id}"]`).forEach((m) => {
      const p = m.parentNode;
      if (!p) return;
      while (m.firstChild) p.insertBefore(m.firstChild, m);
      p.removeChild(m);
      p.normalize();
    });
    setMemos((l) => l.filter((x) => x.id !== id));
  }
  return (
    <>
      {/* 선택 → 메모(작은 버튼 → 입력창) */}
      {palette && (
        <div
          data-memo-pop
          onMouseDown={(e) => e.stopPropagation()}
          className="fixed z-30 -translate-x-1/2 rounded-card border border-line bg-card p-1.5 shadow-card print:hidden"
          style={{ left: palette.x, top: palette.y + 8 }}
        >
          {!editing ? (
            <button onClick={() => setEditing(true)} className="rounded-lg px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10">
              📝 메모
            </button>
          ) : (
            <div className="w-64">
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && save()}
                placeholder="메모 (예: 단어 뜻, 생각) · ⌘Enter 저장"
                rows={2}
                className="w-full resize-y rounded-lg border border-line px-2 py-1.5 text-xs outline-none focus:border-primary"
              />
              <div className="mt-1 flex justify-end gap-2">
                <button onClick={() => setPalette(null)} className="text-xs text-ink-sub">취소</button>
                <button onClick={save} disabled={!draft.trim()} className="rounded bg-primary px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
                  저장
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 메모 숨기기/보기 토글 */}
      {memos.length > 0 &&
        typeof document !== "undefined" &&
        createPortal(
          <button
            onClick={() => setNotesHidden((v) => !v)}
            className="fixed bottom-5 left-5 z-20 rounded-full border border-line bg-card/95 px-3 py-2 text-sm font-medium shadow-card backdrop-blur print:hidden"
          >
            📝 메모 {memos.length} · {notesHidden ? "보기" : "숨기기"}
          </button>,
          document.body,
        )}

      {/* 여백 노트: 단어 옆(오른쪽)에 붙어 스크롤 동행 */}
      {!notesHidden &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            {memos.map((m) => {
              const p = positions[m.id];
              if (!p) return null;
              return (
                <div
                  key={m.id}
                  data-memo-note={m.id}
                  onMouseEnter={() => setActiveId(m.id)}
                  style={{ position: "absolute", top: p.top, left: p.left, width: 220 }}
                  className={`group/memo z-10 rounded-lg border bg-card p-2 text-xs shadow-sm transition print:hidden ${
                    activeId === m.id ? "border-primary ring-1 ring-primary/30" : "border-line"
                  }`}
                >
                  <div className="truncate text-[11px] font-medium text-primary">“{m.anchorText}”</div>
                  <div className="mt-0.5 whitespace-pre-wrap text-ink-sub">{m.note}</div>
                  <button
                    onClick={() => remove(m.id)}
                    className="absolute right-1 top-1 hidden text-[11px] text-ink-muted hover:text-red-500 group-hover/memo:block"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </>,
          document.body,
        )}
    </>
  );
}
