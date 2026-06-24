// api 호출 베이스. 로컬·운영 모두 NEXT_PUBLIC_API_URL 로 주입.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export type Lens = { key: string; label: string; description: string | null; isPreset: boolean; sort: number | null };
export type JobRole = { key: string; label: string };
export type Industry = { id: string; name: string; slug: string; iconColor: string | null; sort: number | null };
export type User = {
  id: string;
  email: string | null;
  provider: "google" | "kakao" | null;
  displayName: string | null;
  avatarUrl: string | null;
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store", credentials: "include" });
  if (!res.ok) throw new Error(`API ${path} 실패: ${res.status}`);
  return res.json() as Promise<T>;
}

async function send<T>(method: "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${path} 실패: ${res.status}`);
  return res.json() as Promise<T>;
}
const post = <T>(path: string, body?: unknown) => send<T>("POST", path, body);
const put = <T>(path: string, body?: unknown) => send<T>("PUT", path, body);
async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error(`API ${path} 실패: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  lenses: () => get<{ lenses: Lens[] }>("/api/lenses"),
  industries: () => get<{ industries: Industry[] }>("/api/industries"),
  me: () => get<{ user: User | null }>("/api/auth/me"),
  devLogin: (input: { provider: "google" | "kakao"; email?: string; displayName?: string }) =>
    post<{ user: User }>("/api/auth/dev-login", input),
  logout: () => post<{ ok: true }>("/api/auth/logout"),
  jobRoles: () => get<{ jobRoles: JobRole[] }>("/api/job-roles"),
  myLenses: () => get<{ enabled: string[]; jobRole?: string }>("/api/me/lenses"),
  setMyLenses: (keys: string[], jobRole?: string) =>
    put<{ enabled: string[]; jobRole?: string }>("/api/me/lenses", { keys, jobRole }),
  myIndustries: () => get<{ industries: MyIndustry[] }>("/api/me/industries"),
  followIndustry: (industryId: string) => post<{ ok: true }>("/api/me/industries/follow", { industryId }),
  unfollowIndustry: (id: string) => del<{ ok: true }>(`/api/me/industries/${id}`),
  createIndustry: (name: string, iconColor?: string) =>
    post<{ industry: Industry }>("/api/me/industries", { name, iconColor }),
  recentEntries: () => get<{ entries: Entry[] }>("/api/me/entries/recent"),
  myReports: (params?: { industryId?: string; docType?: string }) => {
    const q = new URLSearchParams();
    if (params?.industryId) q.set("industryId", params.industryId);
    if (params?.docType) q.set("docType", params.docType);
    const qs = q.toString();
    return get<{ reports: Report[] }>(`/api/me/reports${qs ? `?${qs}` : ""}`);
  },
  report: (id: string) => get<{ report: Report }>(`/api/me/reports/${id}`),
  reportEntries: (id: string) => get<{ report: Report; entries: EntryFull[] }>(`/api/me/reports/${id}/entries`),
  reExtract: (id: string) => post<{ ok: true; parseStatus: string }>(`/api/me/reports/${id}/extract`),
  saveEntry: (id: string, input: { frame?: Partial<EntryFrame>; status?: "draft" | "saved" }) =>
    put<{ entry: EntryFull }>(`/api/me/entries/${id}`, input),
  uploadReport: async (input: {
    file?: File;
    text?: string;
    title?: string;
    industryId?: string;
    lensKeys?: string[];
  }) => {
    const fd = new FormData();
    if (input.file) fd.append("file", input.file);
    if (input.text) fd.append("text", input.text);
    if (input.title) fd.append("title", input.title);
    if (input.industryId) fd.append("industryId", input.industryId);
    if (input.lensKeys) fd.append("lensKeys", JSON.stringify(input.lensKeys));
    const res = await fetch(`${API_URL}/api/me/reports`, { method: "POST", credentials: "include", body: fd });
    if (!res.ok) {
      const msg = await res.json().catch(() => ({ error: `업로드 실패: ${res.status}` }));
      throw new Error((msg as { error?: string }).error ?? "업로드 실패");
    }
    return res.json() as Promise<{ report: Report }>;
  },
  setReportIndustry: (reportId: string, industryId: string | null) =>
    put<{ ok: true; industryId: string | null }>(`/api/me/reports/${reportId}/industry`, { industryId }),
  deleteReport: (id: string) => del<{ ok: true }>(`/api/me/reports/${id}`),
  usage: () => get<Usage>("/api/me/usage"),
  define: (term: string, context?: string) =>
    post<{ term: string; definition: string }>("/api/me/define", { term, context }),
  highlights: (reportId: string) => get<{ highlights: Highlight[] }>(`/api/me/reports/${reportId}/highlights`),
  addHighlight: (reportId: string, input: { startOffset: number; endOffset: number; color: HighlightColor; text: string }) =>
    post<{ highlight: Highlight }>(`/api/me/reports/${reportId}/highlights`, input),
  deleteHighlight: (hid: string) => del<{ ok: true }>(`/api/me/highlights/${hid}`),
  rollups: (industryId: string) => get<{ rollups: Rollup[] }>(`/api/me/industries/${industryId}/rollups`),
  createRollup: (industryId: string, period: string) =>
    post<{ rollup: Rollup }>(`/api/me/industries/${industryId}/rollups`, { period }),
};

export type RollupFact = { id: string; factType: "common" | "conflict"; content: string | null; sort: number | null };
export type Rollup = {
  id: string;
  periodKey: string;
  oneLiner: string | null;
  status: "pending" | "done" | "failed";
  facts: RollupFact[];
};

export type Usage = { plan: "free" | "pro"; used: number; limit: number | null; remaining: number | null };

export type HighlightColor = "yellow" | "green" | "blue" | "pink" | "purple";
export type Highlight = {
  id: string;
  startOffset: number;
  endOffset: number;
  color: HighlightColor;
  text: string;
};

export type MyIndustry = { id: string; name: string; slug: string; iconColor: string | null; isCustom: boolean };
export type Entry = {
  id: string;
  lensKey: string;
  entryDate: string;
  status: "draft" | "saved";
};
export type Report = {
  id: string;
  title: string | null;
  summary: string | null;
  industryId: string | null;
  industryConfirmed?: boolean;
  docType: "industry" | "company" | "news" | null;
  pubDate: string | null;
  fileSize: number | null;
  pageCount: number | null;
  requestedLenses: string[] | null;
  parseStatus: "pending" | "parsing" | "parsed" | "failed";
  createdAt: string;
  industries?: { id: string; name: string }[]; // 멀티 산업 태그
};
export type AnalysisSource = { item: string; source: string; date: string };
export type EntryFrame = {
  highlight?: string;
  summary?: string;
  facts?: { what?: string; numbers?: string; sourceDate?: string };
  drivers?: string[];
  risks?: string[];
  perspectives?: {
    investment?: { valuation?: string; points?: string[]; downside?: string[]; opinion?: string };
    career?: { direction?: string; jobFit?: string; aiInsight?: string; interviewHooks?: string[]; motivation?: string };
  };
  sources?: AnalysisSource[];
};
export type EntryNumber = {
  id: string;
  label: string | null;
  value: string | null;
  pageNo: number | null;
  verified: boolean | null;
};
export type EntryFull = {
  id: string;
  lensKey: string | null;
  status: "draft" | "saved";
  frame: EntryFrame | null;
  provider: "gemini" | "claude" | "mcp" | null;
  model: string | null;
  numbers: EntryNumber[];
};
