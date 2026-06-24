"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type Report, type EntryFull } from "@/lib/api";

const DOC_TYPE: Record<string, string> = { industry: "산업 리포트", company: "기업 리포트", news: "경제뉴스" };

// 인쇄/PDF 내보내기 뷰. 깔끔한 문서 템플릿 + 면책. 로드되면 인쇄 다이얼로그 자동 호출.
export default function ReportPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [entry, setEntry] = useState<EntryFull | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .reportEntries(id)
      .then((d) => {
        setReport(d.report);
        setEntry(d.entries[0] ?? null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [id]);

  if (!loaded) return <main className="p-12 text-ink-muted">불러오는 중...</main>;
  if (!report) return <main className="p-12 text-ink-sub">리포트를 찾을 수 없어요.</main>;

  const f = entry?.frame ?? {};
  const inv = f.perspectives?.investment;
  const car = f.perspectives?.career;

  return (
    <main className="mx-auto max-w-2xl bg-white px-8 py-10 text-ink">
      {/* 툴바(인쇄 시 숨김) */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <a href={`/reports/${id}`} className="text-sm text-ink-sub hover:text-ink">← 검토 화면</a>
        <button onClick={() => window.print()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">
          PDF로 저장 / 인쇄
        </button>
      </div>

      {/* 문서 헤더 */}
      <header className="border-b border-line pb-4">
        <div className="text-xs font-semibold text-primary">📊 마켓데스크</div>
        <h1 className="mt-1 text-2xl font-bold">{report.title ?? "리포트"}</h1>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
          {report.docType && <span>{DOC_TYPE[report.docType]}</span>}
          {(report.industries ?? []).length > 0 && <span>· {(report.industries ?? []).map((i) => i.name).join(", ")}</span>}
          {report.pubDate && <span>· 발간 {report.pubDate}</span>}
          <span>· 정리 {new Date().toLocaleDateString("ko-KR")}</span>
        </div>
      </header>

      {report.parseStatus !== "parsed" || !entry ? (
        <p className="mt-6 text-sm text-ink-sub">아직 분석이 완료되지 않았습니다.</p>
      ) : (
        <div className="mt-6 space-y-5 text-sm leading-relaxed">
          {f.highlight?.trim() && (
            <div className="rounded-lg border-l-4 border-primary bg-primary/5 p-3">
              <span className="text-xs font-semibold text-primary">⭐ 핵심 </span>
              <span className="font-semibold">{f.highlight.replace(/\*\*/g, "")}</span>
            </div>
          )}
          <Block title="① 한 줄 요약">{f.summary}</Block>
          <Block title="② 핵심 사실">
            {f.facts?.what}
            {f.facts?.numbers ? <div className="mt-1 text-ink-sub">숫자: {f.facts.numbers}</div> : null}
            {f.facts?.sourceDate ? <div className="text-ink-muted">출처 기준일: {f.facts.sourceDate}</div> : null}
          </Block>
          <ListBlock title="③ 동인 · 맥락" items={f.drivers} />
          <ListBlock title="④ 리스크 · 쟁점" items={f.risks} />

          {inv && (
            <div className="rounded-lg border border-line p-4">
              <h2 className="mb-2 font-bold">💰 투자 관점</h2>
              <Field label="밸류에이션">{inv.valuation}</Field>
              <ListField label="투자 포인트" items={inv.points} />
              <ListField label="하방 리스크" items={inv.downside} />
              <Field label="잠정 의견">{inv.opinion}</Field>
            </div>
          )}
          {car && (
            <div className="rounded-lg border border-line p-4">
              <h2 className="mb-2 font-bold">🎯 취업 관점</h2>
              <Field label="회사·산업 방향성">{car.direction}</Field>
              <Field label="내 직무와의 접점">{car.jobFit}</Field>
              <Field label="AI·프로덕트 시사점">{car.aiInsight}</Field>
              <ListField label="면접·자소서 활용" items={car.interviewHooks} />
              <Field label="지원동기 연결">{car.motivation}</Field>
            </div>
          )}

          {entry.numbers.length > 0 && (
            <div>
              <h2 className="mb-1.5 font-bold text-ink-muted">🔢 핵심숫자 · 출처</h2>
              <ul className="space-y-1">
                {entry.numbers.map((n) => (
                  <li key={n.id}>
                    {n.label} {n.value}
                    {n.pageNo != null ? ` [p.${n.pageNo}]` : ""} {n.verified ? "✓" : "(미확인)"}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <footer className="mt-8 border-t border-line pt-3 text-[11px] text-ink-muted">
        ※ 본 문서는 업로드한 원문을 마켓데스크가 정리한 변형적 요약입니다. 투자 관련 내용은 투자조언이 아니며 참고용입니다.
      </footer>
    </main>
  );
}

function Block({ title, children }: { title: string; children?: React.ReactNode }) {
  const empty = children == null || children === "";
  return (
    <section>
      <h2 className="mb-1 font-bold text-ink-muted">{title}</h2>
      <div>{empty ? <span className="text-ink-muted">명시 없음</span> : children}</div>
    </section>
  );
}
function ListBlock({ title, items }: { title: string; items?: string[] }) {
  return (
    <section>
      <h2 className="mb-1 font-bold text-ink-muted">{title}</h2>
      {items && items.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-5">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      ) : (
        <span className="text-ink-muted">명시 없음</span>
      )}
    </section>
  );
}
function Field({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="mb-1.5">
      <span className="font-semibold text-ink-sub">{label}: </span>
      {children ? children : <span className="text-ink-muted">명시 없음</span>}
    </div>
  );
}
function ListField({ label, items }: { label: string; items?: string[] }) {
  return (
    <div className="mb-1.5">
      <span className="font-semibold text-ink-sub">{label}: </span>
      {items && items.length > 0 ? items.join(" · ") : <span className="text-ink-muted">명시 없음</span>}
    </div>
  );
}
