"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type HighlightColor } from "@/lib/api";

// 형광펜 하이라이트: 본문 텍스트 선택 → 5색 팔레트로 칠하기, 칠한 곳 클릭 → 삭제. 리포트별 영구 저장.
// 위치는 [data-highlight-root] 의 textContent 기준 문자 offset 으로 저장/복원(콘텐츠 결정적).

const COLORS: { key: HighlightColor; bg: string; label: string }[] = [
  { key: "yellow", bg: "#fff7ae", label: "노랑" },
  { key: "green", bg: "#d6f5d6", label: "연두" },
  { key: "blue", bg: "#d6ebff", label: "하늘" },
  { key: "pink", bg: "#ffd9e8", label: "핑크" },
  { key: "purple", bg: "#e9d8ff", label: "보라" },
];
const BG: Record<HighlightColor, string> = Object.fromEntries(COLORS.map((c) => [c.key, c.bg])) as Record<
  HighlightColor,
  string
>;

function getRoot(rootRef: React.RefObject<HTMLElement | null>): HTMLElement | null {
  return (rootRef.current?.querySelector("[data-highlight-root]") as HTMLElement | null) ?? null;
}

// root 내 text node 를 문서 순서로 순회(기존 mark 안의 텍스트도 포함 → offset 좌표 일관 유지)
function textNodes(root: HTMLElement): Text[] {
  const out: Text[] = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = w.nextNode())) out.push(n as Text);
  return out;
}

// (node, offset) → root 기준 전역 문자 offset
function globalOffset(root: HTMLElement, node: Node, offset: number): number | null {
  let pos = 0;
  for (const t of textNodes(root)) {
    if (t === node) return pos + offset;
    pos += t.length;
  }
  // node 가 text node 가 아니면(요소) 그 안 첫 text 까지 위치로 근사
  return null;
}

function unwrapAll(root: HTMLElement) {
  root.querySelectorAll("mark[data-hid]").forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
    parent.normalize();
  });
}

function applyOne(root: HTMLElement, start: number, end: number, color: HighlightColor, hid: string) {
  let pos = 0;
  const pieces: { node: Text; from: number; to: number }[] = [];
  for (const t of textNodes(root)) {
    const nodeStart = pos;
    const nodeEnd = pos + t.length;
    pos = nodeEnd;
    const s = Math.max(start, nodeStart);
    const e = Math.min(end, nodeEnd);
    if (s < e) pieces.push({ node: t, from: s - nodeStart, to: e - nodeStart });
  }
  for (const { node, from, to } of pieces) {
    try {
      const range = document.createRange();
      range.setStart(node, from);
      range.setEnd(node, to);
      const mark = document.createElement("mark");
      mark.dataset.hid = hid;
      mark.style.backgroundColor = BG[color];
      mark.style.color = "inherit";
      mark.style.borderRadius = "2px";
      mark.style.cursor = "pointer";
      mark.style.padding = "0 1px";
      range.surroundContents(mark);
    } catch {
      // 경계 걸치면 해당 조각만 스킵
    }
  }
}

export function Highlighter({
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
  const [palette, setPalette] = useState<{ x: number; y: number; start: number; end: number; text: string } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; hid: string } | null>(null);

  // 저장된 하이라이트 불러와 적용
  const applyAll = useCallback(async () => {
    const root = getRoot(rootRef);
    if (!root) return;
    unwrapAll(root);
    const { highlights } = await api.highlights(reportId).catch(() => ({ highlights: [] }));
    const full = root.textContent ?? "";
    for (const h of highlights) {
      // 콘텐츠 드리프트 방어: 저장 당시 text 와 현재 위치가 다르면 스킵
      if (full.slice(h.startOffset, h.endOffset) !== h.text) continue;
      applyOne(root, h.startOffset, h.endOffset, h.color, h.id);
    }
  }, [reportId, rootRef]);

  useEffect(() => {
    if (!ready) return;
    // 렌더 완료 후 적용
    const t = setTimeout(() => applyAll(), 50);
    return () => clearTimeout(t);
  }, [ready, reloadKey, applyAll]);

  // 텍스트 선택 → 팔레트
  useEffect(() => {
    if (!ready) return;
    const onUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const root = getRoot(rootRef);
      if (!root) return;
      const range = sel.getRangeAt(0);
      // 선택이 본문(root) 안인지 + 입력창이 아닌지
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return;
      const anc = sel.anchorNode?.parentElement;
      if (anc?.closest("input,textarea")) return;
      const start = globalOffset(root, range.startContainer, range.startOffset);
      const end = globalOffset(root, range.endContainer, range.endOffset);
      if (start == null || end == null || end <= start) return;
      const text = sel.toString();
      if (!text.trim()) return;
      const rect = range.getBoundingClientRect();
      setMenu(null);
      setPalette({ x: rect.left + rect.width / 2, y: rect.top, start: Math.min(start, end), end: Math.max(start, end), text });
    };
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, [ready, rootRef]);

  // 칠한 곳 클릭 → 삭제 메뉴
  useEffect(() => {
    if (!ready) return;
    const root = getRoot(rootRef);
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const m = (e.target as HTMLElement)?.closest?.("mark[data-hid]") as HTMLElement | null;
      if (!m) return;
      e.stopPropagation();
      const rect = m.getBoundingClientRect();
      setPalette(null);
      setMenu({ x: rect.left + rect.width / 2, y: rect.top, hid: m.dataset.hid! });
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [ready, rootRef, reloadKey]);

  // 바깥 클릭 시 팝오버 닫기
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest?.("[data-hl-pop]")) return;
      if ((e.target as HTMLElement)?.closest?.("mark[data-hid]")) return;
      setPalette(null);
      setMenu(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function pick(color: HighlightColor) {
    if (!palette) return;
    const { start, end, text } = palette;
    setPalette(null);
    window.getSelection()?.removeAllRanges();
    const { highlight } = await api
      .addHighlight(reportId, { startOffset: start, endOffset: end, color, text })
      .catch(() => ({ highlight: null }));
    const root = getRoot(rootRef);
    if (root && highlight) applyOne(root, start, end, color, highlight.id);
  }

  async function remove() {
    if (!menu) return;
    const hid = menu.hid;
    setMenu(null);
    await api.deleteHighlight(hid).catch(() => {});
    const root = getRoot(rootRef);
    if (root) {
      root.querySelectorAll(`mark[data-hid="${hid}"]`).forEach((m) => {
        const parent = m.parentNode;
        if (!parent) return;
        while (m.firstChild) parent.insertBefore(m.firstChild, m);
        parent.removeChild(m);
        parent.normalize();
      });
    }
  }

  return (
    <>
      {palette && (
        <div
          data-hl-pop
          className="fixed z-30 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-full border border-line bg-card px-2 py-1.5 shadow-card print:hidden"
          style={{ left: palette.x, top: palette.y - 6 }}
        >
          {COLORS.map((c) => (
            <button
              key={c.key}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c.key)}
              title={c.label}
              className="h-5 w-5 rounded-full border border-black/10 transition hover:scale-110"
              style={{ backgroundColor: c.bg }}
            />
          ))}
        </div>
      )}
      {menu && (
        <div
          data-hl-pop
          className="fixed z-30 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-card px-1 py-1 shadow-card print:hidden"
          style={{ left: menu.x, top: menu.y - 6 }}
        >
          <button onClick={remove} className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
            ✕ 형광펜 삭제
          </button>
        </div>
      )}
    </>
  );
}
