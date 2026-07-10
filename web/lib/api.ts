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
  reorderIndustries: (ids: string[]) => put<{ ok: true }>("/api/me/industries/reorder", { ids }),
  unfollowIndustry: (id: string) => del<{ ok: true }>(`/api/me/industries/${id}`),
  createIndustry: (name: string, iconColor?: string) =>
    post<{ industry: Industry }>("/api/me/industries", { name, iconColor }),
  recentEntries: () => get<{ entries: Entry[] }>("/api/me/entries/recent"),
  myReports: (params?: { industryId?: string; docType?: string; view?: "all" | "bookmarks" | "hidden"; page?: number; from?: string; to?: string; uploadedFrom?: string; q?: string }) => {
    const q = new URLSearchParams();
    if (params?.industryId) q.set("industryId", params.industryId);
    if (params?.docType) q.set("docType", params.docType);
    if (params?.view) q.set("view", params.view);
    if (params?.page) q.set("page", String(params.page));
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    if (params?.uploadedFrom) q.set("uploadedFrom", params.uploadedFrom);
    if (params?.q) q.set("q", params.q);
    const qs = q.toString();
    return get<{ reports: Report[]; total?: number; page?: number; pageSize?: number }>(`/api/me/reports${qs ? `?${qs}` : ""}`);
  },
  bookmarkReport: (id: string) => post<{ ok: true }>(`/api/me/reports/${id}/bookmark`),
  unbookmarkReport: (id: string) => del<{ ok: true }>(`/api/me/reports/${id}/bookmark`),
  hideReport: (id: string) => post<{ ok: true }>(`/api/me/reports/${id}/hide`),
  unhideReport: (id: string) => del<{ ok: true }>(`/api/me/reports/${id}/hide`),
  notDup: (id: string) => post<{ ok: true }>(`/api/me/reports/${id}/not-dup`),
  setPubDate: (id: string, pubDate: string | null) =>
    post<{ ok: true }>(`/api/me/reports/${id}/pubdate`, { pubDate }),
  downloadFlowExport: async () => {
    const res = await fetch(`${API_URL}/api/me/flow-export.md`, { credentials: "include" });
    if (!res.ok) throw new Error(`흐름 내보내기 실패: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marketdesk-flow-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  report: (id: string) => get<{ report: Report }>(`/api/me/reports/${id}`),
  reportEntries: (id: string) =>
    get<{ report: Report; entries: EntryFull[]; dupInfo?: { id: string; title: string | null } | null }>(`/api/me/reports/${id}/entries`),
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
  setReportIndustries: (reportId: string, industryIds: string[]) =>
    put<{ ok: true; industryIds: string[] }>(`/api/me/reports/${reportId}/industries`, { industryIds }),
  deleteReport: (id: string) => del<{ ok: true }>(`/api/me/reports/${id}`),
  notifications: () => get<{ notifications: AppNotification[]; unread: number }>("/api/me/notifications"),
  markNotificationsRead: (ids?: string[]) => post<{ ok: true }>("/api/me/notifications/read", ids ? { ids } : {}),
  deleteNotification: (id: string) => del<{ ok: true }>(`/api/me/notifications/${id}`),
  clearNotifications: () => del<{ ok: true }>("/api/me/notifications"),
  usage: () => get<Usage>("/api/me/usage"),
  llmSetting: () => get<{ isDeveloper: boolean; provider: "claude" | "codex" | "gemini" }>("/api/me/llm"),
  setLlmProvider: (provider: "claude" | "codex" | "gemini", restartInflight?: boolean) =>
    put<{ isDeveloper: boolean; provider: "claude" | "codex" | "gemini" }>("/api/me/llm", { provider, restartInflight }),
  llmInflight: () => get<{ count: number }>("/api/me/llm/inflight"),
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
  deletePublic: (id: string) => del<{ ok: true }>(`/api/me/public/${id}`),
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
  boardRows: (params: { dim: BoardDim; period: "month" | "year"; year?: number }) =>
    get<{ dim: BoardDim; period: "month" | "year"; rows: BoardRow[] }>(
      `/api/me/board/rows?dim=${params.dim}&period=${params.period}${params.year ? `&year=${params.year}` : ""}`,
    ),
  generateAllBoard: (input: { dim: BoardDim; period: "month" | "year"; year?: number; regenerate?: boolean; cells?: { key?: string; periodKey: string }[] }) =>
    post<{ queued: number }>("/api/me/board/generate-all", input),
  editRollup: (input: {
    dim: BoardDim;
    key: string;
    period: "month" | "year";
    periodKey: string;
    oneLiner: string;
    facts: { type: "common" | "conflict"; content: string }[];
  }) => put<{ ok: true }>("/api/me/board/rollup", input),
  boardFeed: (params: { dim: BoardDim; key: string; period: "month" | "year"; periodKey: string }) => {
    const q = new URLSearchParams({ dim: params.dim, key: params.key, period: params.period, periodKey: params.periodKey });
    return get<BoardFeed>(`/api/me/board/feed?${q.toString()}`);
  },
  boardScopes: () => get<{ industries: { id: string; name: string }[]; companies: string[] }>("/api/me/board/scopes"),
  rollups: (industryId: string) => get<{ rollups: Rollup[] }>(`/api/me/industries/${industryId}/rollups`),
  createRollup: (industryId: string, period: string) =>
    post<{ rollup: Rollup }>(`/api/me/industries/${industryId}/rollups`, { period }),

  // 내 종목(관심 + 모의투자)
  stockSearch: (q: string) => get<{ results: SecurityLite[] }>(`/api/stocks/search?q=${encodeURIComponent(q)}`),
  stockBrowse: (group: string, offset = 0) =>
    get<{ group: string; results: SecurityLite[]; hasMore: boolean }>(`/api/stocks/browse?group=${encodeURIComponent(group)}&offset=${offset}`),
  stockDiary: () => get<{ items: DiaryItem[] }>("/api/stocks/diary"),
  myStocks: () => get<{ items: StockSummary[] }>("/api/stocks"),
  watchStock: (securityId: string) => post<{ ok: true }>("/api/stocks/watch", { securityId }),
  addPosition: (input: { securityId: string; side?: "buy" | "sell"; buyDate: string; shares: number; buyPrice?: number; reason?: string }) =>
    post<{ ok: true; position: PaperPosition }>("/api/stocks/positions", input),
  updatePosition: (id: string, input: { side?: "buy" | "sell"; buyDate?: string; shares?: number; buyPrice?: number | null; reason?: string | null }) =>
    put<{ ok: true; position: PaperPosition }>(`/api/stocks/positions/${id}`, input),
  deletePosition: (id: string) => del<{ ok: true }>(`/api/stocks/positions/${id}`),
  removeStock: (securityId: string) => del<{ ok: true }>(`/api/stocks/${securityId}`),
  stockDetail: (securityId: string) => get<StockDetail>(`/api/stocks/${securityId}`),
  stockSeries: (securityId: string, period: "M" | "D") =>
    get<{ period: string; bars: PriceBar[] }>(`/api/stocks/${securityId}/series?period=${period}`),
  stockNotes: (securityId: string) => get<{ notes: PaperNote[] }>(`/api/stocks/${securityId}/notes`),
  addStockNote: (securityId: string, input: { noteDate: string; body: string; category?: NoteCategory }) =>
    post<{ ok: true; note: PaperNote }>(`/api/stocks/${securityId}/notes`, input),
  deleteStockNote: (id: string) => del<{ ok: true }>(`/api/stocks/notes/${id}`),
  stockArticles: (securityId: string) => get<{ articles: RelatedArticle[] }>(`/api/stocks/${securityId}/articles`),
  analyzeStock: (securityId: string) => post<{ analysis: string; pct?: number }>(`/api/stocks/${securityId}/analyze`),
};

export type SecurityLite = { id: string; code: string; name: string; market: string; isOverseas: boolean };
export type StockSummary = {
  security: SecurityLite;
  changeRate: number | null; // 전일대비 등락률(%)
  watchOnly: boolean;
  totalShares: number;
  totalCost: number;
  avgBuy: number | null;
  close: number | null;
  marketValue: number | null;
  realizedPnl?: number;
  unrealizedPnl?: number | null;
  pnl: number | null;
  pnlPct: number | null;
};
export type PaperPosition = {
  id: string;
  securityId: string | null;
  name: string;
  side: "buy" | "sell";
  buyDate: string;
  shares: number;
  buyPrice: number | null;
  reason: string | null;
  createdAt: string;
};
export type NoteCategory = "up" | "down" | "hold" | "memo";
export type PaperNote = { id: string; securityId: string; positionId: string | null; noteDate: string; category: NoteCategory | null; body: string; createdAt: string };
export type StockQuote = { price: number; changeRate: number | null; currency: string };
export type StockDetail = {
  security: SecurityLite;
  quote: StockQuote | null;
  positions: PaperPosition[];
  summary: Omit<StockSummary, "security">;
};
export type PriceBar = { date: string; close: number };
export type DiaryItem = {
  kind: "buy" | "sell" | "note";
  id: string;
  date: string;
  securityId: string | null;
  name: string | null;
  market: string | null;
  isOverseas: boolean | null;
  shares?: number;
  buyPrice?: number | null;
  reason?: string | null;
  category?: NoteCategory | null;
  body?: string;
};
export type RelatedArticle = {
  id: string;
  title: string | null;
  company: string | null;
  pubDate: string | null;
  docType: string | null;
  createdAt: string;
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

export type AppNotification = {
  id: string;
  kind: string;
  industryId: string | null;
  reportId: string | null;
  title: string | null;
  body: string | null;
  detail: string | null;
  matched: string | null; // 왜 감지됐는지 = 근거 문장
  read: boolean;
  createdAt: string;
  pubDate: string | null; // 기사 발간일(알림 날짜 기준)
};
export type FactDelta = { kind: "new" | "recurring" | "promoted"; months: number };
export type TriggerHit = { reportId: string; title: string | null; matched: string | null };
export type RollupFact = {
  id: string;
  factType: "common" | "conflict" | "trigger";
  content: string | null;
  sort: number | null;
  delta?: FactDelta | null; // 전월 대비(board feed 월별에서만 채워짐)
  hits?: TriggerHit[]; // 트리거 발화 콘텐츠(board feed 산업 흐름에서만)
};
export type Rollup = {
  id: string;
  periodKey: string;
  oneLiner: string | null;
  status: "pending" | "done" | "failed";
  facts: RollupFact[];
};

export type Usage = {
  plan: "free" | "pro";
  used: number; // 이번 달 토큰(입력+출력)
  limit: number | null; // 무료 월 토큰 한도(pro=null)
  remaining: number | null;
  inputTokens: number;
  outputTokens: number;
};

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
  fileKey?: string | null; // 스토리지 키({userId}/{uuid}-{원본파일명})
  fileSize: number | null;
  pageCount: number | null;
  requestedLenses: string[] | null;
  dupOf?: string | null; // 유사 중복이면 원본 리포트 id
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
export type EntryFull = {
  id: string;
  lensKey: string | null;
  status: "draft" | "saved";
  frame: EntryFrame | null;
  provider: "gemini" | "claude" | "codex" | "mcp" | null;
  model: string | null;
};
