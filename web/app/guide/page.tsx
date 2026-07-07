import Link from "next/link";

// 사용법 가이드: 처음 쓰는 사용자가 클릭해서 참고하는 정적 안내 페이지.
// 실제 메뉴·기능 흐름(업로드 → 렌즈 → 리포트 → 대시보드/흐름 보드)에 맞춰 정리.

const STEPS: { n: string; title: string; body: string; href?: string; cta?: string }[] = [
  {
    n: "1",
    title: "렌즈 고르기",
    body: "먼저 어떤 관점으로 볼지 렌즈를 정합니다. 취업(산업 구조·기업·채용 시그널) 또는 투자(실적·수급·전망 숫자)를 켜면 그 관점으로 리포트를 정리해요. 렌즈는 환경설정에서 언제든 바꿀 수 있고, 취업 렌즈는 직무까지 지정하면 읽는 관점이 달라집니다.",
    href: "/settings",
    cta: "환경설정에서 렌즈 바꾸기",
  },
  {
    n: "2",
    title: "리포트 올리기",
    body: "PDF 또는 텍스트를 올리면 AI가 산업과 기업을 자동 인식하고, 켜 둔 렌즈로 구조화 요약을 만듭니다. 산업은 비워 두면 AI가 알아서 분류해요. 같은 자료를 또 올리면 중복(똑같은 파일·비슷한 내용)을 자동으로 잡아줍니다. 나중에 렌즈나 직무를 바꿔 다시 요약해도 원문은 그대로 보존됩니다.",
    href: "/upload",
    cta: "리포트 올리러 가기",
  },
  {
    n: "3",
    title: "리포트 찾아보기",
    body: "산업리포트·기업리포트·뉴스 메뉴에서 정리된 자료를 봅니다. 기업리포트는 계열별(예: 삼성·SK) 또는 산업별로 묶어 필터하고, 자주 보는 계열·기업은 별표(★)로 고정해요. 카드를 누르면 구조화 요약과 원문을 함께 볼 수 있습니다.",
    href: "/docs/industry",
    cta: "산업리포트 보기",
  },
  {
    n: "4",
    title: "대시보드에서 흐름 보기",
    body: "대시보드는 관심 산업과 별표한 기업을 모아, 달마다 어떤 흐름이 있었는지 요약해 보여줍니다. 산업을 누르면 그 산업의 월별 흐름과 근거가 된 원문을 한 화면에서 확인할 수 있어요.",
    href: "/",
    cta: "대시보드 열기",
  },
  {
    n: "5",
    title: "흐름 보드로 한눈에",
    body: "흐름 보드는 산업별·기업별·경제흐름을 가로 타임라인(월별/연별)으로 펼쳐 봅니다. 빈 칸은 '빈 칸 모두 생성'으로 채우고, 특정 칸만 다시 요약하고 싶으면 칸 위의 ↻ 를 누르세요. 칸을 클릭하면 그 기간의 흐름 요약과 근거 원문으로 이동합니다.",
    href: "/board",
    cta: "흐름 보드 열기",
  },
];

const TIPS: { title: string; body: string }[] = [
  {
    title: "공개 자료 자동 수집",
    body: "대시보드 피드의 공공 탭에서 정책브리핑 같은 공개 콘텐츠를 함께 봅니다. 필요 없는 항목은 숨기거나 삭제할 수 있고, 삭제한 자료는 다시 불러오지 않아요.",
  },
  {
    title: "모르는 용어 바로 풀이",
    body: "흐름 요약이나 피드에서 낯선 단어를 클릭하거나 검색하면 그 맥락에 맞춰 AI가 쉽게 풀어 줍니다.",
  },
  {
    title: "메모 남기기",
    body: "흐름과 리포트에 서식 메모를 붙일 수 있어요. 손글씨체를 고르고 PDF로 내보내 노트처럼 보관할 수 있습니다.",
  },
  {
    title: "저장(북마크)",
    body: "다시 볼 리포트는 북마크해 두면 저장 메뉴에 모입니다.",
  },
];

export default function GuidePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold">마켓데스크 사용법</h1>
      <p className="mt-2 text-sm text-ink-sub">
        산업·기업 리포트와 뉴스를 목적별 렌즈로 정리하고, 시간에 따른 흐름을 쌓아 보는 도구입니다. 아래 순서대로 한 번 따라 하면
        전체 흐름이 잡혀요.
      </p>

      <section className="mt-8 space-y-4">
        {STEPS.map((s) => (
          <div key={s.n} className="rounded-card bg-card p-5 shadow-card">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {s.n}
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-bold">{s.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-sub">{s.body}</p>
                {s.href && (
                  <Link href={s.href} className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">
                    {s.cta} →
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
      </section>

      <h2 className="mb-3 mt-10 text-sm font-semibold text-ink-muted">알아두면 좋은 기능</h2>
      <section className="grid gap-3 sm:grid-cols-2">
        {TIPS.map((t) => (
          <div key={t.title} className="rounded-card border border-line bg-card/40 p-4">
            <h3 className="text-sm font-bold">{t.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-sub">{t.body}</p>
          </div>
        ))}
      </section>

      <div className="mt-10 rounded-card bg-primary/5 p-5 ring-1 ring-primary/15">
        <p className="text-sm text-ink-sub">
          준비됐다면 첫 리포트를 올려보세요. 렌즈로 정리된 요약과 흐름이 바로 쌓이기 시작합니다.
        </p>
        <Link
          href="/upload"
          className="mt-3 inline-flex rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white hover:brightness-105"
        >
          첫 리포트 올리기 →
        </Link>
      </div>
    </main>
  );
}
