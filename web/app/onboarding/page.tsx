"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type Lens, type JobRole } from "@/lib/api";

// 렌즈 선택 온보딩. 로그인 필요(미인증이면 /login).
export default function OnboardingPage() {
  const router = useRouter();
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [jobRole, setJobRole] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const me = await api.me().catch(() => ({ user: null }));
      if (!me.user) {
        router.replace("/login");
        return;
      }
      const [{ lenses }, { enabled, jobRole }, { jobRoles }] = await Promise.all([
        api.lenses(),
        api.myLenses(),
        api.jobRoles(),
      ]);
      setLenses(lenses);
      setJobRoles(jobRoles);
      setSelected(new Set(enabled.length > 0 ? enabled : lenses.map((l) => l.key)));
      if (jobRole) setJobRole(jobRole);
      setLoaded(true);
    })();
  }, [router]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function save() {
    if (selected.size === 0) {
      setError("렌즈를 1개 이상 선택하세요.");
      return;
    }
    if (selected.has("job") && !jobRole) {
      setError("취업 렌즈는 직무를 선택하세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.setMyLenses([...selected], jobRole || undefined);
      router.push("/");
      router.refresh();
    } catch {
      setError("저장 실패. 다시 시도하세요.");
      setSaving(false);
    }
  }

  if (!loaded) return <main className="p-12 text-ink-muted">불러오는 중...</main>;

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-2xl font-bold">어떤 렌즈로 볼까요?</h1>
      <p className="mt-2 text-sm text-ink-sub">선택한 관점으로 리포트를 정리합니다. 나중에 바꿀 수 있어요.</p>

      <div className="mt-8 space-y-3">
        {lenses.map((l) => {
          const on = selected.has(l.key);
          return (
            <button
              key={l.key}
              onClick={() => toggle(l.key)}
              className={`flex w-full items-center justify-between rounded-card border p-5 text-left transition ${
                on ? "border-primary bg-primary/5" : "border-line bg-card"
              }`}
            >
              <div>
                <div className="font-semibold">{l.label}</div>
                {l.description && <div className="mt-1 text-sm text-ink-sub">{l.description}</div>}
              </div>
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                  on ? "border-primary bg-primary text-white" : "border-line"
                }`}
              >
                {on && "✓"}
              </div>
            </button>
          );
        })}
      </div>

      {selected.has("job") && (
        <div className="mt-6 rounded-card border border-line bg-card p-5">
          <label className="mb-2 block text-sm font-semibold">취업 렌즈 · 직무</label>
          <p className="mb-3 text-xs text-ink-sub">직무에 따라 리포트를 읽는 관점이 달라집니다.</p>
          <select
            value={jobRole}
            onChange={(e) => setJobRole(e.target.value)}
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="">직무 선택...</option>
            {jobRoles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      <button
        onClick={save}
        disabled={saving}
        className="mt-8 w-full rounded-xl bg-primary py-3 font-medium text-white hover:brightness-105 disabled:opacity-50"
      >
        {saving ? "저장 중..." : "시작하기"}
      </button>
    </main>
  );
}
