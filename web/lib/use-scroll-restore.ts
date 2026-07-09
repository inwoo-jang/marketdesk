"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// 뒤로가기 스크롤 복원. 리스트 페이지가 데이터를 비동기 로드해서, 브라우저/Next 의 자동 복원은
// 콘텐츠가 아직 없을 때 시도돼 실패한다. 그래서 페이지별 스크롤을 계속 저장해 두고,
// pop(뒤로/앞으로) 로 돌아왔을 때 '데이터 로드가 끝난 뒤' 수동 복원한다. 새 이동(push)은 상단 유지.
let popped = false;
if (typeof window !== "undefined") {
  try {
    window.history.scrollRestoration = "manual";
  } catch {
    // 일부 환경 미지원 — 무시
  }
  window.addEventListener("popstate", () => {
    popped = true;
  });
}

export function useScrollRestore(ready: boolean) {
  const pathname = usePathname();

  // 스크롤 위치를 pathname 별로 계속 저장
  useEffect(() => {
    const key = `scroll:${pathname}`;
    const onScroll = () => sessionStorage.setItem(key, String(window.scrollY));
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  // 뒤로/앞으로 돌아왔고 데이터 준비되면 복원(그 외는 상단)
  useEffect(() => {
    if (!ready || !popped) return;
    popped = false;
    // 리포트에서 목록으로 돌아온 경우: 마지막으로 본 카드를 화면 중앙으로.
    const centerId = sessionStorage.getItem("reportNavCurrent");
    if (centerId) {
      const el = document.querySelector(`[data-report-id="${centerId}"]`);
      if (el) {
        requestAnimationFrame(() => el.scrollIntoView({ block: "center" }));
        return;
      }
    }
    // 그 외: 저장된 스크롤 위치로.
    const y = Number(sessionStorage.getItem(`scroll:${pathname}`) || 0);
    if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y));
  }, [ready, pathname]);
}
