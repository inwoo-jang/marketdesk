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
  myReports: (params?: { industryId?: string; docType?: string; view?: "all" | "bookmarks" | "hidden"; page?: number; from?: string; to?: string; uploadedFrom?: string }) => {
    const q = new URLSearchParams();
    if (params?.industryId) q.set("industryId", params.industryId);
    if (params?.docType) q.set("docType", params.docType);
    if (params?.view) q.set("view", params.view);
    if (params?.page) q.set("page", String(params.page));
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    if (params?.uploadedFrom) q.set("uploadedFrom", params.uploadedFrom);
    const qs = q.toString();
    return get<{ reports: Report[]; total?: number; page?: number; pageSize?: number }>(`/api/me/reports${qs ? `?${qs}` : ""}`);
  },
  bookmarkReport: (id: string) => post<{ ok: true }>(`/api/me/reports/${id}/bookmark`),
  unbookmarkReport: (id: string) => del<{ ok: true }>(`/api/me/reports/${id}/bookmark`),
  hideReport: (id: string) => post<{ ok: true }>(`/api/me/reports/${id}/hide`),
  unhideReport: (id: string) => del<{ ok: true }>(`/api/me/reports/${id}/hide`),
  report: (id: string) => get<{ report: Report }>(`/api/me/reports/${id}`),
  reportEntries: (id: string) => get<{ report: Report; entries: EntryFull[] }>(`/api/me/reports/${id}/entries`),
  reExtract: (id: string, opts?: { lensKeys?: string[]; jobRole?: string }) =>
    post<{ ok: true; parseStatus: string; requestedLenses?: string[]; jobRole?: string }>(`/api/me/reports/${id}/extract`, opts ?? {}),
  saveEntry: (id: string, input: { frame?: Partial<EntryFrame>; status?: "draft" | "saved" }) =>
    put<{ entry: EntryFull }>(`/api/me/entries/${id}`, input),
  uploadReport: async (input: {
    file?: File;
    text?: string;
    title?: string;
    industryId?: string;
    lensKeys?: string[];
    force?: boolean;
  }) => {
    const fd = new FormData();
    if (input.file) fd.append("file", input.file);
    if (input.text) fd.append("text", input.text);
    if (input.title) fd.append("title", input.title);
    if (input.industryId) fd.append("industryId", input.industryId);
    if (input.lensKeys) fd.append("lensKeys", JSON.stringify(input.lensKeys));
    if (input.force) fd.append("force", "true");
    const res = await fetch(`${API_URL}/api/me/reports`, { method: "POST", credentials: "include", body: fd });
    if (!res.ok) {
      const msg = await res.json().catch(() => ({ error: `업로드 실패: ${res.status}` }));
      throw new Error((msg as { error?: string }).error ?? "업로드 실패");
    }
    return res.json() as Promise<{ report?: Report; duplicate?: { id: string; title: string | null } }>;
  },
  setReportIndustry: (reportId: string, industryId: string | null) =>
    put<{ ok: true; industryId: string | null }>(`/api/me/reports/${reportId}/industry`, { industryId }),
  deleteReport: (id: string) => del<{ ok: true }>(`/api/me/reports/${id}`),
  usage: () => get<Usage>("/api/me/usage"),
  llmSetting: () => get<{ isDeveloper: boolean; provider: "claude" | "gemini" }>("/api/me/llm"),
  setLlmProvider: (provider: "claude" | "gemini") =>
    put<{ isDeveloper: boolean; provider: "claude" | "gemini" }>("/api/me/llm", { provider }),
  publicContents: (params?: { industryId?: string; docType?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.industryId) q.set("industryId", params.industryId);
    if (params?.docType) q.set("docType", params.docType);
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    const qs = q.toString();
    return get<{ contents: PublicContent[] }>(`/api/me/public/contents${qs ? `?${qs}` : ""}`);
  },
  companyGroups: () => get<{ map: Record<string, string> }>("/api/me/company-groups"),
  companyFavorites: () => get<{ groups: string[]; companies: string[] }>("/api/me/company-favorites"),
  addCompanyFavorite: (kind: "group" | "company", value: string) =>
    post<{ ok: true }>("/api/me/company-favorites", { kind, value }),
  removeCompanyFavorite: (kind: "group" | "company", value: string) =>
    del<{ ok: true }>(`/api/me/company-favorites?kind=${kind}&value=${encodeURIComponent(value)}`),
  reorderCompanyFavorites: (kind: "group" | "company", values: string[]) =>
    put<{ ok: true }>("/api/me/company-favorites/reorder", { kind, values }),
  hiddenContents: () => get<{ contents: PublicContent[] }>("/api/me/public/hidden"),
  bookmarkedContents: () => get<{ contents: PublicContent[] }>("/api/me/public/bookmarks"),
  ingestPublic: () => post<{ ok: true; started?: boolean; already?: boolean }>("/api/me/public/ingest"),
  getNotepad: (type: "board" | "report", key: string) =>
    get<{ content: string; updatedAt: string | null }>(`/api/me/notepad?type=${type}&key=${encodeURIComponent(key)}`),
  saveNotepad: (type: "board" | "report", key: string, content: string) =>
    put<{ ok: true }>("/api/me/notepad", { type, key, content }),
  hidePublic: (id: string) => post<{ ok: true }>(`/api/me/public/${id}/hide`),
  unhidePublic: (id: string) => del<{ ok: true }>(`/api/me/public/${id}/hide`),
  bookmarkPublic: (id: string) => post<{ ok: true }>(`/api/me/public/${id}/bookmark`),
  unbookmarkPublic: (id: string) => del<{ ok: true }>(`/api/me/public/${id}/bookmark`),
  reportMemos: (reportId: string) => get<{ memos: Memo[] }>(`/api/me/reports/${reportId}/memos`),
  addMemo: (reportId: string, input: { startOffset: number; endOffset: number; anchorText: string; note: string }) =>
    post<{ memo: Memo }>(`/api/me/reports/${reportId}/memos`, input),
  updateMemo: (mid: string, note: string) => put<{ memo: Memo }>(`/api/me/memos/${mid}`, { note }),
  deleteMemo: (mid: string) => del<{ ok: true }>(`/api/me/memos/${mid}`),
  define: (term: string, context?: string) =>
    post<{ term: string; definition: string }>("/api/me/define", { term, context }),
  highlights: (reportId: string) => get<{ highlights: Highlight[] }>(`/api/me/reports/${reportId}/highlights`),
  addHighlight: (reportId: string, input: { startOffset: number; endOffset: number; color: HighlightColor; text: string }) =>
    post<{ highlight: Highlight }>(`/api/me/reports/${reportId}/highlights`, input),
  deleteHighlight: (hid: string) => del<{ ok: true }>(`/api/me/highlights/${hid}`),
  board: (params: { dim: BoardDim; key?: string; period: "month" | "year" }) => {
    const q = new URLSearchParams({ dim: params.dim, period: params.period });
    if (params.key) q.set("key", params.key);
    return get<Board>(`/api/me/board?${q.toString()}`);
  },
  generateBoardCell: (input: { dim: BoardDim; key?: string; period: "month" | "year"; periodKey: string }) =>
    post<{ rollup: { id: string } }>("/api/me/board/generate", input),
  boardRows: (params: { dim: BoardDim; period: "month" | "year" }) =>
    get<{ dim: BoardDim; period: "month" | "year"; rows: BoardRow[] }>(
      `/api/me/board/rows?dim=${params.dim}&period=${params.period}`,
    ),
  generateAllBoard: (input: { dim: BoardDim; period: "month" | "year" }) =>
    post<{ queued: number }>("/api/me/board/generate-all", input),
  boardFeed: (params: { dim: BoardDim; key: string; period: "month" | "year"; periodKey: string }) => {
    const q = new URLSearchParams({ dim: params.dim, key: params.key, period: params.period, periodKey: params.periodKey });
    return get<BoardFeed>(`/api/me/board/feed?${q.toString()}`);
  },
  boardScopes: () => get<{ industries: { id: string; name: string }[]; companies: string[] }>("/api/me/board/scopes"),
  rollups: (industryId: string) => get<{ rollups: Rollup[] }>(`/api/me/industries/${industryId}/rollups`),
  createRollup: (industryId: string, period: string) =>
    post<{ rollup: Rollup }>(`/api/me/industries/${industryId}/rollups`, { period }),
};

export type BoardDim = "industry" | "company" | "news";
export type BoardCell = {
  periodKey: string;
  rollup: { id: string; oneLiner: string | null; status: "pending" | "done" | "failed"; facts: RollupFact[] } | null;
};
export type Board = { dim: BoardDim; key: string; period: "month" | "year"; label: string; cells: BoardCell[] };
export type BoardRow = { dim: BoardDim; key: string; label: string; star?: boolean; cells: BoardCell[] };
export type BoardFeed = {
  dim: BoardDim;
  key: string;
  period: "month" | "year";
  periodKey: string;
  label: string;
  rollup: { oneLiner: string | null; status: "pending" | "done" | "failed"; facts: RollupFact[] } | null;
  reports: Report[];
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

export type PublicContent = {
  id: string;
  source: string;
  sourceUrl: string;
  title: string;
  summary: string | null;
  investNote?: string | null;
  careerNote?: string | null;
  industryId: string | null;
  industryName: string | null;
  docType: "industry" | "company" | "news" | null;
  pubDate: string | null;
  createdAt?: string | null;
  isBookmarked: boolean;
};

export type Memo = { id: string; startOffset: number; endOffset: number; anchorText: string; note: string };

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
  company?: string | null;
  pubDate: string | null;
  fileSize: number | null;
  pageCount: number | null;
  requestedLenses: string[] | null;
  parseStatus: "pending" | "parsing" | "parsed" | "failed";
  hidden?: boolean;
  bookmarked?: boolean;
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
