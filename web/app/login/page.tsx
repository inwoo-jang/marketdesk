"use client";

import { Logo } from "@/components/logo";
import { LoginPanel } from "@/components/login-panel";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-card bg-card p-8 shadow-card">
        <Logo size={32} className="text-2xl" />
        <p className="mt-2 text-sm text-ink-sub">내 관점으로 산업·기업 리포트와 뉴스를 정리하세요.</p>
        <div className="mt-8">
          <LoginPanel />
        </div>
      </div>
    </main>
  );
}
