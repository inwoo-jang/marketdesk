"use client";

export type ReportSearchState = { q: string; from: string; to: string };

export function matchesReportSearch(
  item: { title?: string | null; summary?: string | null; pubDate?: string | null },
  search: ReportSearchState,
) {
  const q = search.q.replace(/\s/g, "").toLowerCase();
  if (q && !`${item.title ?? ""} ${item.summary ?? ""}`.replace(/\s/g, "").toLowerCase().includes(q)) return false;
  if (search.from || search.to) {
    if (!item.pubDate) return false;
    if (search.from && item.pubDate < search.from) return false;
    if (search.to && item.pubDate > search.to) return false;
  }
  return true;
}

export function hasReportSearch(search: ReportSearchState) {
  return !!(search.q.trim() || search.from || search.to);
}

export function ReportSearchControls({
  value,
  onChange,
  placeholder = "제목이나 부제목 검색",
}: {
  value: ReportSearchState;
  onChange: (next: ReportSearchState) => void;
  placeholder?: string;
}) {
  return (
    <div className="rounded-card border border-line bg-card p-4 shadow-card">
      <div className="grid gap-3 md:grid-cols-[1fr_140px_140px_auto]">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-muted">검색</span>
          <input
            value={value.q}
            onChange={(e) => onChange({ ...value, q: e.target.value })}
            placeholder={placeholder}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-muted">시작일</span>
          <input
            type="date"
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-muted">종료일</span>
          <input
            type="date"
            value={value.to}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => onChange({ q: "", from: "", to: "" })}
            className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink-sub hover:bg-bg-deep"
          >
            초기화
          </button>
        </div>
      </div>
    </div>
  );
}
