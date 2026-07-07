"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// 화면별 "이 화면에서 할 일" — 짧은 액션 위주. [...] 안은 실제 버튼·메뉴·아이콘으로 칩 강조.
// 위에서부터 먼저 매칭되는 항목 사용(구체 경로 먼저).
const GUIDES: { match: (p: string) => boolean; title: string; actions: string[] }[] = [
  {
    match: (p) => p === "/upload",
    title: "리포트 올리기",
    actions: ["PDF·텍스트 올리기", "[렌즈] 취업/투자 1개 이상 고르기", "산업은 비워 두면 AI 가 자동 분류"],
  },
  {
    match: (p) => p === "/board/feed",
    title: "흐름 피드",
    actions: ["흐름 요약과 근거 원문 훑기", "모르는 단어 클릭해 풀이 보기", "아래에 메모 남기기"],
  },
  {
    match: (p) => p === "/board",
    title: "흐름 보드",
    actions: ["[산업별] [기업별] [경제흐름] 탭 전환", "[빈 칸 모두 생성]으로 채우기", "칸 위 [↻]로 특정 칸만 다시 요약", "칸 클릭해 흐름 피드로 들어가기"],
  },
  {
    match: (p) => p === "/docs/company",
    title: "기업리포트",
    actions: ["[계열별] [산업별]로 필터 바꾸기", "칩 눌러 개별 기업으로 좁히기", "[★]로 자주 보는 기업 고정하기"],
  },
  {
    match: (p) => p === "/docs/industry",
    title: "산업리포트",
    actions: ["상단 산업 칩으로 좁혀 보기", "카드 눌러 요약·원문 함께 보기"],
  },
  {
    match: (p) => p === "/docs/news",
    title: "뉴스",
    actions: ["상단 산업 칩으로 좁혀 보기", "카드 눌러 요약·원문 함께 보기"],
  },
  {
    match: (p) => p === "/favorites",
    title: "저장",
    actions: ["북마크한 리포트 다시 보기", "카드의 [책갈피]로 자료 저장하기"],
  },
  {
    match: (p) => p === "/settings",
    title: "환경설정",
    actions: ["[렌즈]·취업 직무 바꾸기", "분석 LLM 제공자·키 설정하기"],
  },
  {
    match: (p) => p.startsWith("/industry/"),
    title: "산업 대시보드",
    actions: ["달 고르고 [이 달 흐름 생성] 누르기", "각 달 원문 펼쳐 근거 확인하기", "[★ 관심]으로 대시보드에 고정하기"],
  },
  {
    match: (p) => p.startsWith("/reports/"),
    title: "리포트 상세",
    actions: ["요약과 원문 함께 보기", "형광펜·메모로 표시하기", "[렌즈] 바꿔 다시 요약하기"],
  },
  {
    match: (p) => p === "/",
    title: "대시보드",
    actions: ["상단 [+ 업로드]로 첫 리포트 올리기", "산업 카드 눌러 월별 흐름 보기", "[★]로 관심 산업·기업 고정하기", "[공공] 탭에서 정책브리핑 함께 보기"],
  },
];

const FALLBACK = {
  title: "마켓데스크",
  actions: ["상단 메뉴로 화면 이동하기", "각 화면에서 [?] 눌러 할 일 보기"],
};

// 실제 primary 채움 버튼(CTA)들 — 앱에서 흰 글씨·primary 배경으로 보이는 것.
const FILLED = new Set(["+ 업로드", "빈 칸 모두 생성", "이 달 흐름 생성", "공공 불러오기"]);

// "[텍스트]" 는 실제 UI 를 연상시키는 칩으로 렌더. ★=앰버 별, 주요 CTA=primary 채움, 그 외=아웃라인.
function chip(label: string, key: number) {
  const base = "mx-0.5 inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold align-baseline";
  if (label.includes("★")) {
    // 실제 별표(앰버)처럼. 별은 또렷하게 키우고 뒤 설명은 잉크색.
    const rest = label.replace("★", "").trim();
    return (
      <kbd key={key} className={`${base} border border-amber-300 bg-amber-50 text-amber-600`}>
        <span className="text-sm leading-none text-amber-500">★</span>
        {rest && <span className="ml-1">{rest}</span>}
      </kbd>
    );
  }
  if (FILLED.has(label)) {
    return (
      <kbd key={key} className={`${base} bg-primary/70 text-white`}>
        {label}
      </kbd>
    );
  }
  return (
    <kbd key={key} className={`${base} border border-primary/20 bg-primary/[0.06] text-primary/80`}>
      {label}
    </kbd>
  );
}

function renderAction(action: string) {
  return action
    .split(/(\[[^\]]+\])/)
    .map((seg, i) => (seg.startsWith("[") && seg.endsWith("]") ? chip(seg.slice(1, -1), i) : <span key={i}>{seg}</span>));
}

// 화면 오른쪽 아래 플로팅 "?" 버튼: 현재 화면에서 할 일을 팝오버로 안내.
// 닫힘: ? 재클릭 · 바깥 클릭 · 화면 이동 · Esc.
export function HelpButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // 바깥 클릭 시 닫기(클릭 자체는 막지 않아 나브 링크는 이동까지 동작)
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const guide = GUIDES.find((g) => g.match(pathname)) ?? FALLBACK;

  return (
    <div ref={ref} className="fixed right-5 top-[4.5rem] z-40 print:hidden">
      {open && (
        <div className="absolute right-0 top-14 w-80 rounded-card border border-line bg-card p-4 shadow-card">
          <div className="mb-2.5 flex items-baseline gap-2">
            <span className="text-xs font-semibold text-primary/70">이 화면에서 할 일</span>
            <span className="text-sm font-bold text-ink">{guide.title}</span>
          </div>
          <ul className="space-y-2">
            {guide.actions.map((a, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink">
                <span className="mt-px font-bold text-primary/50">→</span>
                <span>{renderAction(a)}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/guide"
            onClick={() => setOpen(false)}
            className="mt-3 inline-flex text-xs font-medium text-primary/80 hover:underline"
          >
            전체 사용법 보기 →
          </Link>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="사용법"
        aria-expanded={open}
        title="사용법"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/75 text-lg font-bold text-white shadow-md transition hover:bg-primary"
      >
        ?
      </button>
    </div>
  );
}
