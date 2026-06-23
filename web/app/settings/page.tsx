"use client";

import { useEffect, useState } from "react";
import { api, type Lens, type JobRole, type Usage, type User } from "@/lib/api";

// 설정: 렌즈·직무, 플랜·사용량. (Pro 업그레이드·BYO 키는 출시 단계)
export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [myLensKeys, setMyLensKeys] = useState<string[]>([]);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [myJobRole, setMyJobRole] = useState<string | undefined>();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const me = await api.me().catch(() => ({ user: null }));
      if (!me.user) {
        window.location.href = "/login";
        return;
      }
      setUser(me.user);
      const [{ lenses }, { enabled, jobRole }, { jobRoles }, usage] = await Promise.all([
        api.lenses(),
        api.myLenses(),
        api.jobRoles(),
        api.usage(),
      ]);
      setLenses(lenses);
      setMyLensKeys(enabled);
      setMyJobRole(jobRole);
      setJobRoles(jobRoles);
      setUsage(usage);
      setLoaded(true);
    })();
  }, []);

  if (!loaded) return <main className="p-12 text-ink-muted">불러오는 중...</main>;

  const lensLabel = (k: string) => lenses.find((l) => l.key === k)?.label ?? k;
  const jobRoleLabel = jobRoles.find((r) => r.key === myJobRole)?.label;

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
    </main>
  );
}
