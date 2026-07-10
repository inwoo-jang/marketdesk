"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type User, type Usage } from "@/lib/api";
import { Logo } from "@/components/logo";
import { BookmarkIcon } from "@/components/bookmark-icon";
import { HelpButton } from "@/components/help-button";
import { NotificationBell } from "@/components/notification-bell";

// 흐름 보드는 대시보드 카드로 진입(네비에서 제외). '내 종목'은 렌즈에 따라 라벨이 바뀜.
function buildNav(stockLabel: string) {
  return [
    { href: "/", label: "대시보드", match: (p: string) => p === "/" || p.startsWith("/industry") },
    { href: "/stocks", label: stockLabel, match: (p: string) => p.startsWith("/stocks") },
    { href: "/docs/industry", label: "산업리포트", match: (p: string) => p === "/docs/industry" },
    { href: "/docs/company", label: "기업리포트", match: (p: string) => p === "/docs/company" },
    { href: "/docs/news", label: "뉴스", match: (p: string) => p === "/docs/news" },
    { href: "/favorites", label: "저장", icon: true, match: (p: string) => p === "/favorites" },
  ];
}

// 투자 렌즈 있으면 '내 종목'(상위집합), 취업만이면 '관심 기업', 기본 '내 종목'.
export function stockMenuLabel(lensKeys: string[]): string {
  if (lensKeys.includes("invest")) return "내 종목";
  if (lensKeys.includes("job")) return "관심 기업";
  return "내 종목";
}

// 전역 상단 네비. 로그인 상태에서만 노출. /login·/onboarding 에서는 숨김.
export function AppNav() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [stockLabel, setStockLabel] = useState("내 종목");

  useEffect(() => {
    api
      .me()
      .then((r) => {
        setUser(r.user);
        if (r.user) {
          api.usage().then(setUsage).catch(() => {});
          api.myLenses().then(({ enabled }) => setStockLabel(stockMenuLabel(enabled))).catch(() => {});
        }
      })
      .catch(() => setUser(null));
  }, [pathname]);

  if (!user || pathname === "/login" || pathname === "/onboarding") return null;

  const NAV = buildNav(stockLabel);

  return (
    <>
    <nav className="sticky top-0 z-10 border-b border-line bg-card/80 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-5xl items-center gap-1 px-6 py-3">
        <Link href="/" className="mr-3">
          <Logo size={24} />
        </Link>
        <div className="flex flex-1 gap-1">
          {NAV.map((n) => {
            const active = n.match(pathname);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium ${
                  active ? "bg-primary/10 text-primary" : "text-ink-sub hover:bg-bg-deep"
                }`}
              >
                {n.icon && <BookmarkIcon filled={active} className="h-4 w-4" />}
                {n.label}
              </Link>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          {usage && (
            <span className="hidden text-xs text-ink-muted sm:inline">
              {usage.limit === null ? "Pro" : `무료 ${Math.round(((usage.remaining ?? 0) / usage.limit) * 100)}%`}
            </span>
          )}
          <span className="hidden text-sm text-ink-sub md:inline">{user.displayName ?? user.email}</span>
          <NotificationBell />
          <Link
            href="/settings"
            aria-label="환경설정"
            title="환경설정"
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-ink-sub transition hover:bg-bg-deep hover:text-ink ${
              pathname === "/settings" ? "bg-primary/10 text-primary" : ""
            }`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-[18px] w-[18px]"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            >
              <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.05.05a2 2 0 0 1-2.83 2.83l-.05-.05a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 0 1-4 0v-.07a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.05.05a2 2 0 0 1-2.83-2.83l.05-.05A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 0 1 0-4h.07A1.7 1.7 0 0 0 4.6 8a1.7 1.7 0 0 0-.34-1.88l-.05-.05a2 2 0 0 1 2.83-2.83l.05.05A1.7 1.7 0 0 0 9 3.6a1.7 1.7 0 0 0 1-1.53V2a2 2 0 0 1 4 0v.07a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.05-.05a2 2 0 0 1 2.83 2.83l-.05.05A1.7 1.7 0 0 0 19.4 8a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 0 1 0 4h-.07A1.7 1.7 0 0 0 19.4 15Z" />
            </svg>
          </Link>
        </div>
      </div>
    </nav>
    <HelpButton />
    </>
  );
}
