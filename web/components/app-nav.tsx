"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type User, type Usage } from "@/lib/api";

const NAV = [
  { href: "/", label: "대시보드", match: (p: string) => p === "/" || p.startsWith("/industry") },
  { href: "/docs/industry", label: "산업리포트", match: (p: string) => p === "/docs/industry" },
  { href: "/docs/company", label: "기업리포트", match: (p: string) => p === "/docs/company" },
  { href: "/docs/news", label: "뉴스", match: (p: string) => p === "/docs/news" },
  { href: "/settings", label: "설정", match: (p: string) => p === "/settings" },
];

// 전역 상단 네비. 로그인 상태에서만 노출. /login·/onboarding 에서는 숨김.
export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
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

  async function logout() {
    await api.logout();
    setUser(null);
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="sticky top-0 z-10 border-b border-line bg-card/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-1 px-6 py-3">
        <a href="/" className="mr-3 font-bold">🔍 리포트렌즈</a>
        <div className="flex flex-1 gap-1">
          {NAV.map((n) => {
            const active = n.match(pathname);
            return (
              <a
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  active ? "bg-primary/10 text-primary" : "text-ink-sub hover:bg-bg-deep"
                }`}
              >
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
          <button onClick={logout} className="rounded-full border border-line px-3 py-1.5 text-sm hover:bg-bg-deep">
            로그아웃
          </button>
        </div>
      </div>
    </nav>
  );
}
