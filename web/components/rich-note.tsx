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

// 자유 서식 메모: 제목 접기/펼치기, 손글씨 폰트, H1~3·굵기·글자크기·형광펜. 800ms 디바운스 자동저장.
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
  const [open, setOpen] = useState(false);
  const [hand, setHand] = useState(true);
  const [empty, setEmpty] = useState(true);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getNotepad(scopeType, scopeKey)
      .then(({ content }) => {
        if (!alive) return;
        if (ref.current) ref.current.innerHTML = content || "";
        setEmpty(!content || !content.replace(/<[^>]+>/g, "").trim());
        if (content) setOpen(true); // 내용 있으면 펼친 상태로
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [scopeType, scopeKey]);

  const scheduleSave = useCallback(() => {
    setSaving("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const html = ref.current?.innerHTML ?? "";
      await api.saveNotepad(scopeType, scopeKey, html).catch(() => {});
      setSaving("saved");
    }, 800);
  }, [scopeType, scopeKey]);

  const onInput = () => {
    setEmpty(!(ref.current?.textContent ?? "").trim());
    scheduleSave();
  };

  const cmd = (command: string, value?: string) => {
    ref.current?.focus();
    try {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand(command, false, value);
    } catch {
      /* 미지원 브라우저 무시 */
    }
    onInput();
  };

  const Btn = ({ onDo, children, title: t, active }: { onDo: () => void; children: React.ReactNode; title: string; active?: boolean }) => (
    <button
      type="button"
      title={t}
      onMouseDown={(e) => e.preventDefault()} // 선택 영역 유지
      onClick={onDo}
      className={`rounded px-2 py-1 text-xs font-medium transition hover:bg-bg-deep ${active ? "bg-primary/10 text-primary" : "text-ink-sub"}`}
    >
      {children}
    </button>
  );

  return (
    <div className="rounded-card border border-line bg-card/60 shadow-card">
      {/* 헤더: 접기/펼치기 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-semibold text-ink-muted"
      >
        <span className="flex items-center gap-1.5">
          <span className={`inline-block transition ${open ? "rotate-90" : ""}`}>▸</span>
          📝 {title}
          {!open && !empty && <span className="text-xs font-normal text-primary">· 작성됨</span>}
        </span>
        <span className="text-[11px] font-normal text-ink-muted">
          {saving === "saving" ? "저장 중…" : saving === "saved" ? "저장됨" : ""}
        </span>
      </button>

      {/* 툴바 + 편집기 */}
      <div className={open ? "border-t border-line" : "hidden"}>
        <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-1.5">
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
          <Btn onDo={() => cmd("hiliteColor", "transparent")} title="형광펜 지우기">지우기</Btn>
          <span className="mx-1 h-4 w-px bg-line" />
          <Btn onDo={() => setHand((v) => !v)} title="손글씨 폰트" active={hand}>✏️ 손글씨</Btn>
        </div>
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={onInput}
          data-placeholder="여기에 자유롭게 메모하세요. 제목·굵기·형광펜·손글씨로 꾸밀 수 있어요."
          className={`rich-note min-h-[110px] px-4 py-3 text-[15px] leading-relaxed text-ink outline-none ${hand ? "font-hand" : ""}`}
        />
      </div>
    </div>
  );
}
