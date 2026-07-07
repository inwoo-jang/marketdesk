"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type User, type Usage } from "@/lib/api";
import { Logo } from "@/components/logo";
import { BookmarkIcon } from "@/components/bookmark-icon";
import { HelpButton } from "@/components/help-button";

const NAV = [
  { href: "/", label: "대시보드", match: (p: string) => p === "/" || p.startsWith("/industry") },
  { href: "/board", label: "흐름 보드", match: (p: string) => p === "/board" },
  { href: "/docs/industry", label: "산업리포트", match: (p: string) => p === "/docs/industry" },
  { href: "/docs/company", label: "기업리포트", match: (p: string) => p === "/docs/company" },
  { href: "/docs/news", label: "뉴스", match: (p: string) => p === "/docs/news" },
  { href: "/favorites", label: "저장", icon: true, match: (p: string) => p === "/favorites" },
];

// 전역 상단 네비. 로그인 상태에서만 노출. /login·/onboarding 에서는 숨김.
export function AppNav() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    api
      .me()
      .then((r) => {
        setUser(r.user);
        if (r.user) api.usage().then(setUsage).catch(() => {});
      })
      .catch(() => setUser(null));
  }, [pathname]);

  if (!user || pathname === "/login" || pathname === "/onboarding") return null;

  return (
    <>
    <nav className="sticky top-0 z-10 border-b border-line bg-card/80 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-5xl items-center gap-1 px-6 py-3">
        <a href="/" className="mr-3">
          <Logo size={24} />
        </a>
        <div className="flex flex-1 gap-1">
          {NAV.map((n) => {
            const active = n.match(pathname);
            return (
              <a
                key={n.href}
                href={n.href}
                className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium ${
                  active ? "bg-primary/10 text-primary" : "text-ink-sub hover:bg-bg-deep"
                }`}
              >
                {n.icon && <BookmarkIcon filled={active} className="h-4 w-4" />}
                {n.label}
              </a>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          {usage && (
            <span className="hidden text-xs text-ink-muted sm:inline">
              {usage.limit === null ? "Pro" : `무료 ${usage.remaining ?? 0}/${usage.limit}`}
            </span>
          )}
          <span className="hidden text-sm text-ink-sub md:inline">{user.displayName ?? user.email}</span>
          <a
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
          </a>
        </div>
      </div>
    </nav>
    <HelpButton />
    </>
  );
}
