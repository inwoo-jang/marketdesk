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
  // 모델 변경: 진행 중 작업이 있으면 "마저 끝내기 vs 중단·재시작" 선택 모달
  const [pending, setPending] = useState<{ key: "claude" | "codex" | "gemini"; label: string; inflight: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function applyProvider(key: "claude" | "codex" | "gemini", restartInflight: boolean) {
    setBusy(true);
    const r = await api.setLlmProvider(key, restartInflight).catch(() => null);
    setBusy(false);
    if (r) setLlm(r);
    setPending(null);
  }

  async function onPickProvider(key: "claude" | "codex" | "gemini", label: string) {
    if (llm?.provider === key) return;
    const { count } = await api.llmInflight().catch(() => ({ count: 0 }));
    if (count > 0) {
      setPending({ key, label, inflight: count });
    } else {
      await applyProvider(key, false);
    }
  }

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
  const fmtTok = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const pctUsed = usage?.limit ? Math.round((usage.used / usage.limit) * 100) : 0;

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

      {/* 플랜·사용량(토큰) */}
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
            {usage?.limit == null
              ? "무제한"
              : `이번 달 ${fmtTok(usage?.used ?? 0)} / ${fmtTok(usage.limit)} 토큰`}
          </span>
        </div>
        {usage?.limit != null && (
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
              <div
                className={`h-full rounded-full ${pctUsed >= 100 ? "bg-red-500" : pctUsed >= 80 ? "bg-amber-500" : "bg-primary"}`}
                style={{ width: `${Math.min(100, pctUsed)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-ink-muted">
              입력 {fmtTok(usage?.inputTokens ?? 0)} · 출력 {fmtTok(usage?.outputTokens ?? 0)} · 남은 {fmtTok(usage?.remaining ?? 0)} 토큰
            </p>
          </div>
        )}

        {/* 요금제 안내 */}
        <div className="mt-5 rounded-lg border border-line bg-bg-deep/40 p-4">
          <p className="text-xs font-semibold text-ink">요금제</p>
          <ul className="mt-2 space-y-1.5 text-xs text-ink-sub">
            <li>• <b>무료</b> — 월 30만 토큰(Gemini). 이걸로 리포트 15개 안팎.</li>
            <li>• <b>Pro ₩3,000/월</b>(1개월 무료) — 상향 한도 + BYO 키·로컬 에이전트 잠금 해제.</li>
            <li>• <b>무제한/헤비 유저</b> — 본인 API 키(BYO) 또는 로컬 에이전트로 자기 LLM 사용.</li>
          </ul>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button disabled className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white opacity-50" title="출시 단계에 제공">
            Pro 업그레이드 (준비중)
          </button>
          <button disabled className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-sub opacity-50" title="출시 단계에 제공">
            본인 API 키 등록 (준비중)
          </button>
        </div>
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
                  onClick={() => onPickProvider(opt.key, opt.label)}
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

      {/* 모델 변경 선택 모달 */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setPending(null)}>
          <div className="w-full max-w-md rounded-card bg-card p-6 shadow-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-ink">{pending.label}(으)로 변경</h3>
            <p className="mt-2 text-sm text-ink-sub">
              이전 엔진으로 처리 중인 작업이 <b className="text-ink">{pending.inflight}건</b> 있어요. 어떻게 할까요?
            </p>
            <div className="mt-5 space-y-2">
              <button
                disabled={busy}
                onClick={() => applyProvider(pending.key, false)}
                className="w-full rounded-xl border border-line px-4 py-3 text-left hover:bg-bg-deep disabled:opacity-50"
              >
                <div className="text-sm font-semibold text-ink">진행 중인 건 그대로 끝내기</div>
                <div className="mt-0.5 text-xs text-ink-muted">지금 것들은 이전 엔진으로 마무리하고, 새 작업부터 {pending.label} 적용</div>
              </button>
              <button
                disabled={busy}
                onClick={() => applyProvider(pending.key, true)}
                className="w-full rounded-xl border border-primary bg-primary/5 px-4 py-3 text-left hover:bg-primary/10 disabled:opacity-50"
              >
                <div className="text-sm font-semibold text-primary">중단하고 {pending.label}(으)로 다시 시작</div>
                <div className="mt-0.5 text-xs text-ink-muted">진행 중인 {pending.inflight}건을 새 엔진으로 재분석·재생성</div>
              </button>
            </div>
            <button
              disabled={busy}
              onClick={() => setPending(null)}
              className="mt-3 w-full rounded-lg px-4 py-2 text-sm text-ink-sub hover:bg-bg-deep disabled:opacity-50"
            >
              취소
            </button>
          </div>
        </div>
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
