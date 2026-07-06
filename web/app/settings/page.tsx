"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type Lens, type JobRole, type Usage, type User } from "@/lib/api";

// 설정: 렌즈·직무, 플랜·사용량. (Pro 업그레이드·BYO 키는 출시 단계)
export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [myLensKeys, setMyLensKeys] = useState<string[]>([]);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [myJobRole, setMyJobRole] = useState<string | undefined>();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [llm, setLlm] = useState<{ isDeveloper: boolean; provider: "claude" | "codex" | "gemini" } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const me = await api.me().catch(() => ({ user: null }));
      if (!me.user) {
        window.location.href = "/login";
        return;
      }
      setUser(me.user);
      const [{ lenses }, { enabled, jobRole }, { jobRoles }, usage, llm] = await Promise.all([
        api.lenses(),
        api.myLenses(),
        api.jobRoles(),
        api.usage(),
        api.llmSetting().catch(() => null),
      ]);
      setLenses(lenses);
      setMyLensKeys(enabled);
      setMyJobRole(jobRole);
      setJobRoles(jobRoles);
      setUsage(usage);
      setLlm(llm);
      setLoaded(true);
    })();
  }, []);

  if (!loaded) return <main className="p-12 text-ink-muted">불러오는 중...</main>;

  const lensLabel = (k: string) => lenses.find((l) => l.key === k)?.label ?? k;
  const jobRoleLabel = jobRoles.find((r) => r.key === myJobRole)?.label;

  async function logout() {
    await api.logout();
    setUser(null);
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-bold">설정</h1>

      {/* 계정 */}
      <section className="mt-6 rounded-card bg-card p-6 shadow-card">
        <h2 className="text-sm font-semibold text-ink-muted">계정</h2>
        <p className="mt-2 font-medium">{user?.displayName ?? user?.email}</p>
        {user?.email && <p className="text-sm text-ink-sub">{user.email}</p>}
      </section>

      {/* 렌즈·직무 */}
      <section className="mt-4 rounded-card bg-card p-6 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-muted">렌즈 · 직무</h2>
          <a href="/onboarding" className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-bg-deep">
            변경
          </a>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {myLensKeys.map((k) => (
            <span key={k} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {lensLabel(k)}
              {k === "job" && jobRoleLabel ? ` · ${jobRoleLabel}` : ""}
            </span>
          ))}
          {myLensKeys.length === 0 && <span className="text-sm text-ink-sub">선택한 렌즈가 없어요.</span>}
        </div>
      </section>

      {/* 플랜·사용량 */}
      <section className="mt-4 rounded-card bg-card p-6 shadow-card">
        <h2 className="text-sm font-semibold text-ink-muted">플랜 · 사용량</h2>
        <div className="mt-3 flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              usage?.plan === "pro" ? "bg-success-bg text-success-text" : "bg-ink/5 text-ink-muted"
            }`}
          >
            {usage?.plan === "pro" ? "Pro" : "무료"}
          </span>
          <span className="text-sm text-ink-sub">
            {usage?.limit === null
              ? "무제한 분석"
              : `오늘 분석 ${usage?.used ?? 0}/${usage?.limit ?? 3}회 (남은 ${usage?.remaining ?? 0}회)`}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            disabled
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white opacity-50"
            title="출시 단계에 제공"
          >
            Pro 업그레이드 (준비중)
          </button>
          <button
            disabled
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-sub opacity-50"
            title="출시 단계에 제공"
          >
            본인 API 키 등록 (준비중)
          </button>
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          무료는 하루 3회 분석. 초과 시 Pro(무제한) 또는 본인 API 키로 계속할 수 있어요. (결제는 출시 단계)
        </p>
      </section>

      {/* 분석 엔진 — 개발자 계정만 노출 */}
      {llm?.isDeveloper && (
        <section className="mt-4 rounded-card bg-card p-6 shadow-card">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink-muted">분석 엔진</h2>
            <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs font-semibold text-ink-muted">DEV</span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">개발자 계정 전용. 새로 업로드/재분석하는 리포트에 적용됩니다.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {([
              { key: "gemini", label: "Gemini (무료)", desc: "기본·일반 사용자용" },
              { key: "claude", label: "로컬 Claude CLI (무제한)", desc: "내 구독 직접 호출" },
              { key: "codex", label: "로컬 Codex CLI", desc: "Codex 로그인 계정 직접 호출" },
            ] as const).map((opt) => {
              const on = llm.provider === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={async () => {
                    const r = await api.setLlmProvider(opt.key).catch(() => null);
                    if (r) setLlm(r);
                  }}
                  className={`rounded-xl border px-4 py-3 text-left ${
                    on ? "border-primary bg-primary/10" : "border-line hover:bg-bg-deep"
                  }`}
                >
                  <div className={`text-sm font-semibold ${on ? "text-primary" : "text-ink"}`}>
                    {on ? "● " : "○ "}
                    {opt.label}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-muted">{opt.desc}</div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-8 border-t border-line pt-6">
        <button
          onClick={logout}
          className="w-full rounded-lg border border-line px-4 py-3 text-sm font-semibold text-ink-sub hover:bg-bg-deep hover:text-ink sm:w-auto"
        >
          로그아웃
        </button>
      </section>
    </main>
  );
}
