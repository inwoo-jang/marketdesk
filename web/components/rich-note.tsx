"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

// 형광펜 5색(연하게)
const HILITES = [
  { c: "#FEF08A", name: "노랑" },
  { c: "#BBF7D0", name: "초록" },
  { c: "#BFDBFE", name: "파랑" },
  { c: "#FBCFE8", name: "분홍" },
  { c: "#FED7AA", name: "주황" },
];

// 손글씨 3종 + 기본. cls 는 globals.css 클래스. 동글한 Gaegu 가 기본.
const FONTS = [
  { key: "gaegu", label: "동글", cls: "font-gaegu" },
  { key: "himelody", label: "부드러움", cls: "font-himelody" },
  { key: "nanumpen", label: "펜", cls: "font-nanumpen" },
  { key: "sans", label: "기본", cls: "" },
] as const;
type FontKey = (typeof FONTS)[number]["key"];
const fontClsOf = (k: FontKey) => FONTS.find((f) => f.key === k)?.cls ?? "";

// 자유 서식 메모: 저장하면 노트처럼 항상 내용 표시(보기), '편집'으로 입력모드.
// 폰트 선택은 저장 HTML 래퍼(data-font·class)에 담아 PDF 내보내기에도 반영.
export function RichNote({
  scopeType,
  scopeKey,
  title = "메모",
}: {
  scopeType: "board" | "report";
  scopeKey: string;
  title?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(""); // 폰트 래퍼를 벗긴 내부 HTML
  const [font, setFont] = useState<FontKey>("gaegu");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasContent = !!html.replace(/<[^>]+>/g, "").trim();

  useEffect(() => {
    let alive = true;
    api
      .getNotepad(scopeType, scopeKey)
      .then(({ content }) => {
        if (!alive) return;
        let inner = content || "";
        let f: FontKey = "gaegu";
        if (content && typeof window !== "undefined") {
          const wrap = new DOMParser().parseFromString(content, "text/html").body.firstElementChild as HTMLElement | null;
          if (wrap && wrap.dataset.font && FONTS.some((x) => x.key === wrap.dataset.font)) {
            f = wrap.dataset.font as FontKey;
            inner = wrap.innerHTML;
          }
        }
        setHtml(inner);
        setFont(f);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [scopeType, scopeKey]);

  const persist = useCallback(
    (inner: string, f: FontKey) => {
      const wrapped = inner.trim() ? `<div data-font="${f}" class="${fontClsOf(f)}">${inner}</div>` : "";
      return api.saveNotepad(scopeType, scopeKey, wrapped).catch(() => {});
    },
    [scopeType, scopeKey],
  );

  const scheduleSave = () => {
    setSaving("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await persist(ref.current?.innerHTML ?? "", font);
      setSaving("saved");
    }, 800);
  };

  const cmd = (command: string, value?: string) => {
    ref.current?.focus();
    try {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand(command, false, value);
    } catch {
      /* 미지원 브라우저 무시 */
    }
    scheduleSave();
  };
  const pickFont = (k: FontKey) => {
    setFont(k);
    if (timer.current) clearTimeout(timer.current);
    setSaving("saving");
    persist(ref.current?.innerHTML ?? html, k).then(() => setSaving("saved"));
  };

  function startEdit() {
    setEditing(true);
    requestAnimationFrame(() => {
      if (ref.current) {
        ref.current.innerHTML = html;
        ref.current.focus();
      }
    });
  }
  async function doneEdit() {
    if (timer.current) clearTimeout(timer.current);
    const inner = ref.current?.innerHTML ?? html;
    setHtml(inner);
    await persist(inner, font);
    setSaving("saved");
    setEditing(false);
  }

  const Btn = ({ onDo, children, title: t }: { onDo: () => void; children: React.ReactNode; title: string }) => (
    <button
      type="button"
      title={t}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onDo}
      className="rounded px-2 py-1 text-xs font-medium text-ink-sub transition hover:bg-bg-deep"
    >
      {children}
    </button>
  );

  return (
    <div className="rounded-card border border-amber-100 bg-amber-50/30 shadow-card print:border-amber-200 print:shadow-none">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted">📝 {title}</span>
        <span className="flex items-center gap-2 print:hidden">
          {editing && (
            <span className="text-[11px] font-normal text-ink-muted">
              {saving === "saving" ? "저장 중…" : saving === "saved" ? "저장됨" : ""}
            </span>
          )}
          {editing ? (
            <button onClick={doneEdit} className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white">완료</button>
          ) : (
            <button onClick={startEdit} className="rounded-lg border border-line bg-card px-3 py-1 text-xs font-medium text-ink-sub hover:bg-bg-deep">
              {hasContent ? "편집" : "+ 메모"}
            </button>
          )}
        </span>
      </div>

      {/* 편집 모드: 툴바 + 입력 */}
      {editing ? (
        <div className="border-t border-amber-100">
          <div className="flex flex-wrap items-center gap-1 border-b border-amber-100 px-3 py-1.5 print:hidden">
            <Btn onDo={() => cmd("formatBlock", "H1")} title="제목1">H1</Btn>
            <Btn onDo={() => cmd("formatBlock", "H2")} title="제목2">H2</Btn>
            <Btn onDo={() => cmd("formatBlock", "H3")} title="제목3">H3</Btn>
            <Btn onDo={() => cmd("formatBlock", "P")} title="본문">본문</Btn>
            <span className="mx-1 h-4 w-px bg-line" />
            <Btn onDo={() => cmd("bold")} title="굵게"><b>B</b></Btn>
            <Btn onDo={() => cmd("fontSize", "2")} title="작게">작게</Btn>
            <Btn onDo={() => cmd("fontSize", "4")} title="크게">크게</Btn>
            <span className="mx-1 h-4 w-px bg-line" />
            <span className="text-[11px] text-ink-muted">형광펜</span>
            {HILITES.map((h) => (
              <button
                key={h.c}
                type="button"
                title={h.name}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => cmd("hiliteColor", h.c)}
                className="h-4 w-4 rounded-full border border-black/10"
                style={{ backgroundColor: h.c }}
              />
            ))}
            <button
              type="button"
              title="형광펜 지우기"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => cmd("hiliteColor", "transparent")}
              className="rounded p-1 transition hover:bg-bg-deep"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M5.6 5.6l12.8 12.8" />
              </svg>
            </button>
            <span className="mx-1 h-4 w-px bg-line" />
            <span className="inline-flex flex-nowrap items-center gap-1">
              <span className="text-[11px] text-ink-muted">글씨체</span>
              {FONTS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  title={`${f.label} 글씨체`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickFont(f.key)}
                  className={`whitespace-nowrap rounded px-1.5 py-1 text-xs font-medium transition hover:bg-bg-deep ${f.cls} ${
                    font === f.key ? "bg-primary/10 text-primary" : "text-ink-sub"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </span>
          </div>
          <div
            ref={ref}
            contentEditable
            suppressContentEditableWarning
            onInput={scheduleSave}
            onPaste={(e) => {
              // 원본 서식(글씨체·색)이 딸려와 손글씨 폰트를 덮어쓰지 않도록 순수 텍스트로 붙여넣기.
              e.preventDefault();
              const text = e.clipboardData.getData("text/plain");
              document.execCommand("insertText", false, text);
            }}
            data-placeholder="여기에 자유롭게 메모하세요. 제목·굵기·형광펜·손글씨로 꾸밀 수 있어요."
            className={`rich-note min-h-[110px] px-4 py-3 text-[15px] leading-relaxed text-ink outline-none ${fontClsOf(font)}`}
          />
        </div>
      ) : hasContent ? (
        // 보기 모드: 노트처럼 내용 항상 표시
        <div
          className={`rich-note border-t border-amber-100 px-4 py-3 text-[15px] leading-relaxed text-ink ${fontClsOf(font)}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div className="px-4 pb-3 text-xs text-ink-muted">아직 메모가 없어요. “+ 메모”로 적어보세요.</div>
      )}
    </div>
  );
}
