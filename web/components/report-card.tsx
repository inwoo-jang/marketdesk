import type { Report } from "@/lib/api";

const STATUS: Record<string, { t: string; c: string }> = {
  parsed: { t: "완료", c: "bg-success-bg text-success-text" },
  pending: { t: "분석중", c: "bg-ink/5 text-ink-muted" },
  parsing: { t: "분석중", c: "bg-primary/10 text-primary" },
  failed: { t: "실패", c: "bg-red-50 text-red-500" },
};
const DOC_TYPE: Record<string, string> = { industry: "산업", company: "기업", news: "뉴스" };
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }) : null);

// 피드 카드: AI 제목·한줄요약·산업태그·발간일·추가일·상태. 펼치지 않고 훑어볼 용도.
export function ReportCard({ report, onDelete }: { report: Report; onDelete?: (id: string) => void }) {
  const s = STATUS[report.parseStatus] ?? STATUS.pending;
  const pub = fmt(report.pubDate);
  const added = fmt(report.createdAt);
  const processing = report.parseStatus === "pending" || report.parseStatus === "parsing";

  return (
    <div className="group relative">
      <a
        href={`/reports/${report.id}`}
        className="block rounded-card bg-card p-4 shadow-card transition hover:ring-1 hover:ring-primary/30"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {report.docType && (
                <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[11px] text-ink-muted">
                  {DOC_TYPE[report.docType] ?? report.docType}
                </span>
              )}
              <span className="truncate font-semibold">
                {processing ? (report.title ?? "분석 중...") : (report.title ?? "제목 없음")}
              </span>
            </div>
            {report.summary && <p className="mt-1 line-clamp-2 text-sm text-ink-sub">{report.summary}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted">
              {(report.industries ?? []).map((i) => (
                <span key={i.id} className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                  {i.name}
                </span>
              ))}
              {(pub ?? added) && <span>발간 {pub ?? added}</span>}
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${s.c}`}>{s.t}</span>
        </div>
      </a>
      {onDelete && (
        <button
          onClick={(e) => {
            e.preventDefault();
            if (confirm("이 리포트를 삭제할까요?")) onDelete(report.id);
          }}
          className="absolute bottom-3 right-3 hidden text-xs text-ink-muted hover:text-red-500 group-hover:block"
          title="삭제"
        >
          삭제
        </button>
      )}
    </div>
  );
}
