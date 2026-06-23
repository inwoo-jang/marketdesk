import { api } from "@/lib/api";
import { AuthBar } from "@/components/auth-bar";

// Slice2~3: api 연결 + 로그인 상태. 온보딩/대시보드는 이후 슬라이스에서 교체.
export default async function Home() {
  const [{ lenses }, { industries }] = await Promise.all([api.lenses(), api.industries()]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-10 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">🔍 리포트렌즈</h1>
          <p className="mt-2 text-ink-sub">산업리포트를 내 관점(취업·투자)으로 정리하고 흐름까지 누적합니다.</p>
        </div>
        <AuthBar />
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold text-ink-muted">렌즈</h2>
        <div className="flex gap-2">
          {lenses.map((l) => (
            <span
              key={l.key}
              className="rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary"
            >
              {l.label}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink-muted">산업 카탈로그 ({industries.length})</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {industries.map((ind) => (
            <div
              key={ind.id}
              className="rounded-card bg-card p-5 shadow-card"
            >
              <div
                className="mb-3 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: ind.iconColor ?? "#8A93A8" }}
              >
                {ind.name.slice(0, 1)}
              </div>
              <div className="font-semibold">{ind.name}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-12 text-xs text-ink-muted">
        api 연결 정상 · 로컬 개발 모드 (다음: 로그인 → 렌즈 온보딩 → 대시보드)
      </footer>
    </main>
  );
}
