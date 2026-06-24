"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, type MyIndustry, type Lens, type Usage } from "@/lib/api";
import { UsageBadge } from "@/components/usage-badge";

// 업로드: PDF 또는 텍스트 + 산업(선택, 비우면 AI 매칭) + 렌즈. 로그인 필요.
export default function UploadPage() {
  const router = useRouter();
  const search = useSearchParams();
  const presetIndustry = search.get("industryId") ?? "";
  const fileInput = useRef<HTMLInputElement>(null);

  const [industries, setIndustries] = useState<MyIndustry[]>([]);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [enabledKeys, setEnabledKeys] = useState<string[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);

  const [mode, setMode] = useState<"pdf" | "text">("pdf");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [industryId, setIndustryId] = useState<string>(presetIndustry);
  const [lensKeys, setLensKeys] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const me = await api.me().catch(() => ({ user: null }));
      if (!me.user) {
        router.replace("/login");
        return;
      }
      const [mi, all, mine, u] = await Promise.all([api.myIndustries(), api.lenses(), api.myLenses(), api.usage()]);
      setIndustries(mi.industries);
      setLenses(all.lenses);
      setEnabledKeys(mine.enabled);
      setLensKeys(new Set(mine.enabled));
      setUsage(u);
      setLoaded(true);
    })();
  }, [router]);

  function pickFile(f: File | null) {
    setError(null);
    if (f && !f.name.toLowerCase().endsWith(".pdf")) {
      setError("PDF 파일만 올릴 수 있어요.");
      return;
    }
    setFile(f);
  }

  function toggleLens(key: string) {
    setLensKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function submit() {
    if (mode === "pdf" && !file) return setError("PDF 파일을 선택하세요.");
    if (mode === "text" && !text.trim()) return setError("텍스트를 입력하세요.");
    if (lensKeys.size === 0) return setError("렌즈를 1개 이상 선택하세요.");
    setBusy(true);
    setError(null);
    try {
      const { report } = await api.uploadReport({
        file: mode === "pdf" ? (file ?? undefined) : undefined,
        text: mode === "text" ? text : undefined,
        title: mode === "text" ? title || undefined : undefined,
        industryId: industryId || undefined,
        lensKeys: [...lensKeys],
      });
      router.push(`/reports/${report.id}`); // 검토 화면에서 처리상태 폴링
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
      setBusy(false);
    }
  }

  if (!loaded) return <main className="p-12 text-ink-muted">불러오는 중...</main>;

  const myLensOptions = lenses.filter((l) => enabledKeys.includes(l.key));
  const noQuota =
    !!usage && usage.plan === "free" && usage.limit != null && (usage.remaining ?? usage.limit - usage.used) <= 0;

  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <a href="/" className="text-sm text-ink-sub hover:text-ink">← 대시보드</a>
      <div className="mt-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">업로드</h1>
        <UsageBadge usage={usage} />
      </div>
      <p className="mt-2 text-sm text-ink-sub">산업·기업 리포트나 경제뉴스를 올리면 선택한 렌즈로 정리됩니다.</p>
      {noQuota && (
        <div className="mt-4 rounded-card border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          오늘 무료 분석 3회를 모두 썼어요. 내일 다시 무료로 이용하거나, <a href="/settings" className="font-semibold underline">Pro 업그레이드 · 본인 API 키 등록</a>으로 계속할 수 있어요.
        </div>
      )}

      {/* 입력 모드 */}
      <div className="mt-6 flex gap-2">
        {(["pdf", "text"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
              mode === m ? "border-primary bg-primary/10 text-primary" : "border-line text-ink-sub"
            }`}
          >
            {m === "pdf" ? "PDF 파일" : "텍스트 붙여넣기"}
          </button>
        ))}
      </div>

      {mode === "pdf" ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pickFile(e.dataTransfer.files?.[0] ?? null);
          }}
          onClick={() => fileInput.current?.click()}
          className={`mt-4 cursor-pointer rounded-card border-2 border-dashed p-10 text-center transition ${
            dragging ? "border-primary bg-primary/5" : "border-line bg-card"
          }`}
        >
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div className="font-medium text-ink">📄 {file.name}</div>
          ) : (
            <div className="text-ink-sub">여기로 PDF를 끌어다 놓거나 클릭해서 선택</div>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목 (선택)"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="리포트·뉴스 본문을 붙여넣으세요."
            className="w-full resize-y rounded-card border border-line bg-card px-3 py-3 text-sm outline-none focus:border-primary"
          />
        </div>
      )}

      {/* 산업 (선택) */}
      <div className="mt-6">
        <label className="mb-2 block text-sm font-semibold text-ink-muted">산업</label>
        <select
          value={industryId}
          onChange={(e) => setIndustryId(e.target.value)}
          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">자동 (AI가 분류)</option>
          {industries.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-muted">비워두면 업로드 후 AI가 산업을 매칭합니다. 검토 화면에서 수정할 수 있어요.</p>
      </div>

      {/* 렌즈 */}
      <div className="mt-6">
        <label className="mb-2 block text-sm font-semibold text-ink-muted">렌즈 (추출 관점)</label>
        <div className="flex gap-2">
          {myLensOptions.map((l) => {
            const on = lensKeys.has(l.key);
            return (
              <button
                key={l.key}
                type="button"
                onClick={() => toggleLens(l.key)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
                  on ? "border-primary bg-primary/10 text-primary" : "border-line text-ink-sub"
                }`}
              >
                {l.label}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      <button
        onClick={submit}
        disabled={busy || noQuota}
        className="mt-8 w-full rounded-xl bg-primary py-3 font-medium text-white hover:brightness-105 disabled:opacity-50"
      >
        {noQuota ? "무료 한도 소진" : busy ? "업로드 중..." : "업로드"}
      </button>
    </main>
  );
}
