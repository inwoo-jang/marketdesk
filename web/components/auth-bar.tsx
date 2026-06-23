"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type User } from "@/lib/api";

// 로그인 상태 표시(클라이언트). 세션 쿠키 기반 me 조회.
export function AuthBar() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoaded(true));
  }, []);

  async function logout() {
    await api.logout();
    setUser(null);
    router.refresh();
  }

  if (!loaded) return <div className="h-9" />;

  if (!user) {
    return (
      <a href="/login" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white">
        로그인
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-ink-sub">{user.displayName ?? user.email}</span>
      <button onClick={logout} className="rounded-full border border-line px-3 py-1.5 text-sm hover:bg-bg-deep">
        로그아웃
      </button>
    </div>
  );
}
