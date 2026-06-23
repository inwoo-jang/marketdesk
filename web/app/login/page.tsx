"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

// 로컬: dev-login 으로 소셜 로그인 흉내. 운영에서는 Cognito Hosted UI 로 교체.
export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function login(provider: "google" | "kakao") {
    setLoading(provider);
    setError(null);
    try {
      await api.devLogin(provider);
      router.push("/");
      router.refresh();
    } catch {
      setError("로그인 실패. api 서버가 켜져 있는지 확인하세요.");
      setLoading(null);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-card bg-card p-8 shadow-card">
        <h1 className="text-2xl font-bold">🔍 리포트렌즈</h1>
        <p className="mt-2 text-sm text-ink-sub">내 관점으로 산업리포트를 정리하세요.</p>

        <div className="mt-8 space-y-3">
          <button
            onClick={() => login("google")}
            disabled={loading !== null}
            className="w-full rounded-xl border border-line bg-white py-3 text-sm font-medium hover:bg-bg-deep disabled:opacity-50"
          >
            {loading === "google" ? "로그인 중..." : "구글로 계속하기"}
          </button>
          <button
            onClick={() => login("kakao")}
            disabled={loading !== null}
            className="w-full rounded-xl bg-[#FEE500] py-3 text-sm font-medium text-[#191600] hover:brightness-95 disabled:opacity-50"
          >
            {loading === "kakao" ? "로그인 중..." : "카카오로 계속하기"}
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

        <p className="mt-6 text-xs text-ink-muted">로컬 개발 모드 (dev 로그인). 운영은 구글·카카오 실제 로그인.</p>
      </div>
    </main>
  );
}
