"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

// 로그인 패널(랜딩·/login 공용). 로컬: dev 로그인 모드. 운영: 구글/카카오 = Cognito Hosted UI 로 교체.
export function LoginPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<"google" | "kakao">("google");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  async function login(input: { provider: "google" | "kakao"; email?: string; displayName?: string }, tag: string) {
    setLoading(tag);
    setError(null);
    try {
      await api.devLogin(input);
      router.push("/onboarding");
      router.refresh();
    } catch {
      setError("로그인 실패. api 서버(localhost:8787)가 켜져 있는지 확인하세요.");
      setLoading(null);
    }
  }

  return (
    <div className="w-full">
      <div className="space-y-3">
        <button
          onClick={() => login({ provider: "google" }, "google")}
          disabled={loading !== null}
          className="w-full rounded-xl border border-line bg-white py-3 text-sm font-medium hover:bg-bg-deep disabled:opacity-50"
        >
          {loading === "google" ? "로그인 중..." : "구글로 계속하기"}
        </button>
        <button
          onClick={() => login({ provider: "kakao" }, "kakao")}
          disabled={loading !== null}
          className="w-full rounded-xl bg-[#FEE500] py-3 text-sm font-medium text-[#191600] hover:brightness-95 disabled:opacity-50"
        >
          {loading === "kakao" ? "로그인 중..." : "카카오로 계속하기"}
        </button>
      </div>

      {/* 개발용 로그인 모드(로컬 전용) */}
      <div className="mt-6 rounded-xl border border-dashed border-line p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-semibold text-ink-muted">DEV</span>
          <span className="text-xs text-ink-muted">개발용 빠른 로그인 (아무 테스트 유저)</span>
        </div>
        <div className="space-y-2">
          <div className="flex gap-2">
            {(["google", "kakao"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  provider === p ? "border-primary bg-primary/10 text-primary" : "border-line text-ink-sub"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름 (선택)"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일 (선택, 미입력 시 기본 dev 유저)"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={() => login({ provider, email: email.trim() || undefined, displayName: name.trim() || undefined }, "dev")}
            disabled={loading !== null}
            className="w-full rounded-lg bg-ink py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading === "dev" ? "로그인 중..." : "dev 로그인"}
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
    </div>
  );
}
