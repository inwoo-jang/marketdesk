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
  // BYO(본인 API 키)
  const [byo, setByo] = useState<{ provider: string | null; hasKey: boolean } | null>(null);
  const [byoKeyInput, setByoKeyInput] = useState("");
  const [byoProviderSel, setByoProviderSel] = useState<"gemini" | "anthropic" | "openai">("gemini");
  const [byoBusy, setByoBusy] = useState(false);
  const [byoMsg, setByoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // 로컬 에이전트
  const [agent, setAgent] = useState<{ enabled: boolean; engine: string | null; email: string | null } | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);

  async function toggleAgent(enabled: boolean, engine?: "claude" | "codex") {
    setAgentBusy(true);
    const r = await api.setLocalAgent(enabled, engine).catch(() => null);
    setAgentBusy(false);
    if (r) setAgent((a) => ({ enabled: r.enabled, engine: r.engine, email: a?.email ?? null }));
  }

  async function saveByo() {
    if (!byoKeyInput.trim()) return;
    setByoBusy(true); setByoMsg(null);
    const r = await api.setByoKey(byoProviderSel, byoKeyInput.trim()).catch(() => null);
    setByoBusy(false);
    if (r) { setByo({ provider: byoProviderSel, hasKey: true }); setByoKeyInput(""); setByoMsg({ ok: true, text: "연결됐어요. 이제 분석에 본인 키를 사용해요." }); }
    else setByoMsg({ ok: false, text: "키가 유효하지 않거나 저장에 실패했어요." });
  }
  async function removeByo() {
    setByoBusy(true);
    await api.deleteByoKey().catch(() => {});
    setByoBusy(false);
    setByo({ provider: null, hasKey: false }); setByoMsg(null);
  }

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
      const [{ lenses }, { enabled, jobRole }, { jobRoles }, usage, llm, byo] = await Promise.all([
        api.lenses(),
        api.myLenses(),
        api.jobRoles(),
        api.usage(),
        api.llmSetting().catch(() => null),
        api.byoKey().catch(() => ({ provider: null, hasKey: false })),
      ]);
      api.localAgent().then(setAgent).catch(() => {});
      setLenses(lenses);
      setMyLensKeys(enabled);
      setMyJobRole(jobRole);
      setJobRoles(jobRoles);
      setUsage(usage);
      setLlm(llm);
      setByo(byo);
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

      </section>

      {/* 요금제 — 끌리는 가격 카드 */}
      <section className="mt-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {/* 무료 */}
          <div className="flex flex-col rounded-card border border-line bg-card p-5 shadow-card">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-ink">무료</h3>
              {usage?.plan !== "pro" && (
                <span className="rounded-full bg-success-bg px-2.5 py-0.5 text-xs font-semibold text-success-text">이용 중</span>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-muted">가볍게 시작하기</p>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-ink">₩0</span>
              <span className="text-sm text-ink-muted">/월</span>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-ink-sub">
              {["월 30만 토큰 (리포트 약 15개)", "흐름 보드·종목 흐름 전체", "흐름 위험 신호 알림", "PDF·MD 내보내기"].map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="mt-0.5 text-success-text">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-5">
              <p className="text-center text-xs text-ink-muted">
                {usage?.limit != null ? `이번 달 ${100 - pctUsed}% 남음` : "현재 플랜"}
              </p>
            </div>
          </div>

          {/* Pro — 강조 */}
          <div className="relative flex flex-col rounded-card border-2 border-primary bg-card p-5 shadow-card">
            <span className="absolute -top-3 left-5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-white shadow-card">
              첫 달 무료
            </span>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-primary">Pro</h3>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">추천</span>
            </div>
            <p className="mt-1 text-xs text-ink-muted">한도 걱정 없이, 내 방식대로</p>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-2xl font-extrabold text-ink">₩3,000</span>
              <span className="text-sm text-ink-muted">/월</span>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-ink-sub">
              {[
                "넉넉한 분석 한도",
                "본인 API 키(BYO) 연결",
                "로컬 에이전트로 사실상 무제한",
                "새 기능 우선 제공",
              ].map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="mt-0.5 text-primary">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-5">
              <button
                disabled
                title="출시 단계에 제공"
                className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white opacity-90 shadow-card"
              >
                첫 달 무료로 시작
              </button>
              <p className="mt-2 text-center text-xs text-ink-muted">출시 준비 중 · 첫 달 이후 언제든 해지</p>
            </div>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-ink-muted">
          토큰을 많이 쓰는 헤비 유저는 아래에서 본인 키·로컬 에이전트를 연결해 자기 LLM 비용으로 무제한 사용할 수 있어요.
        </p>
      </section>

      {/* AI 연결: 본인 API 키(BYO) — 전체 유저 미리보기 */}
      <section className="mt-4 rounded-card bg-card p-6 shadow-card">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-ink-muted">AI 연결 · 본인 API 키(BYO)</h2>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">미리보기</span>
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          본인 Google Gemini API 키를 등록하면 분석에 그 키를 사용해요. <b className="text-ink">무료 한도 없이</b> 본인 비용으로 씁니다. 키는 서버에 암호화 저장되고 화면엔 다시 표시되지 않아요.
        </p>

        {byo?.hasKey ? (
          <div className="mt-3 flex items-center justify-between rounded-lg border border-success-text/30 bg-success-bg/40 px-3 py-2">
            <span className="text-sm font-medium text-success-text">{byo.provider === "anthropic" ? "Claude" : byo.provider === "openai" ? "GPT" : "Gemini"} 키 연결됨</span>
            <button onClick={removeByo} disabled={byoBusy} className="text-xs font-medium text-ink-sub hover:text-red-600 disabled:opacity-50">제거</button>
          </div>
        ) : (
          <div className="mt-3">
            {/* 제공사 선택 */}
            <div className="mb-2 flex gap-1.5">
              {([
                { k: "gemini", label: "Gemini" },
                { k: "anthropic", label: "Claude" },
                { k: "openai", label: "GPT" },
              ] as const).map((p) => (
                <button
                  key={p.k}
                  onClick={() => setByoProviderSel(p.k)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${byoProviderSel === p.k ? "bg-primary/10 text-primary" : "text-ink-muted hover:bg-bg-deep"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={byoKeyInput}
                onChange={(e) => setByoKeyInput(e.target.value)}
                placeholder={byoProviderSel === "gemini" ? "Gemini API 키 (AIza...)" : byoProviderSel === "anthropic" ? "Anthropic API 키 (sk-ant-...)" : "OpenAI API 키 (sk-...)"}
                className="min-w-0 flex-1 rounded-lg border border-line bg-bg-deep/30 px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button onClick={saveByo} disabled={byoBusy || !byoKeyInput.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {byoBusy ? "확인 중..." : "연결"}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-ink-muted">
              {byoProviderSel === "gemini" && "aistudio.google.com/apikey 에서 무료 발급."}
              {byoProviderSel === "anthropic" && "console.anthropic.com 에서 발급(유료)."}
              {byoProviderSel === "openai" && "platform.openai.com/api-keys 에서 발급(유료)."}
            </p>
          </div>
        )}
        {byoMsg && <p className={`mt-2 text-xs ${byoMsg.ok ? "text-success-text" : "text-red-600"}`}>{byoMsg.text}</p>}
      </section>

      {/* 로컬 에이전트 */}
      <section className="mt-4 rounded-card bg-card p-6 shadow-card">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-ink-muted">로컬 에이전트</h2>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">헤비 유저</span>
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          본인 PC에서 에이전트를 돌려 자기 LLM(Claude·Codex CLI)으로 분석해요. 키 없이 본인 구독으로, 무제한. 켜면 새 업로드는 로컬 에이전트가 처리합니다.
        </p>
        <div className="mt-3 flex items-center gap-2">
          {agent?.enabled ? (
            <>
              <span className="rounded-lg bg-success-bg/40 px-3 py-1.5 text-sm font-medium text-success-text">사용 중 · {agent.engine === "codex" ? "Codex" : "Claude"} CLI</span>
              <button onClick={() => toggleAgent(false)} disabled={agentBusy} className="text-xs text-ink-sub hover:text-red-600 disabled:opacity-50">끄기</button>
            </>
          ) : (
            <>
              <button onClick={() => toggleAgent(true, "claude")} disabled={agentBusy} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-bg-deep disabled:opacity-50">Claude CLI로 켜기</button>
              <button onClick={() => toggleAgent(true, "codex")} disabled={agentBusy} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-bg-deep disabled:opacity-50">Codex CLI로 켜기</button>
            </>
          )}
        </div>
        {agent?.enabled && (
          <div className="mt-3 rounded-lg border border-line bg-bg-deep/40 p-3">
            <p className="text-xs font-semibold text-ink">에이전트 실행 방법</p>
            <p className="mt-1 text-[11px] text-ink-muted">저장소를 받은 뒤, 아래로 본인 작업만 로컬에서 처리해요. (Claude/Codex CLI 로그인 필요)</p>
            <pre className="mt-2 overflow-x-auto rounded bg-ink/5 p-2 text-[11px] text-ink">{`LOCAL_AGENT_USER_EMAIL=${agent.email ?? "you@example.com"} \\
LLM_PROVIDER=${agent.engine ?? "claude"} \\
pnpm --filter @reportlens/worker start`}</pre>
          </div>
        )}
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
