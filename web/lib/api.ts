// api 호출 베이스. 로컬·운영 모두 NEXT_PUBLIC_API_URL 로 주입.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export type Lens = { key: string; label: string; description: string | null; isPreset: boolean; sort: number | null };
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
  myLenses: () => get<{ enabled: string[] }>("/api/me/lenses"),
  setMyLenses: (keys: string[]) => put<{ enabled: string[] }>("/api/me/lenses", { keys }),
  myIndustries: () => get<{ industries: MyIndustry[] }>("/api/me/industries"),
  followIndustry: (industryId: string) => post<{ ok: true }>("/api/me/industries/follow", { industryId }),
  unfollowIndustry: (id: string) => del<{ ok: true }>(`/api/me/industries/${id}`),
  createIndustry: (name: string, iconColor?: string) =>
    post<{ industry: Industry }>("/api/me/industries", { name, iconColor }),
  recentEntries: () => get<{ entries: Entry[] }>("/api/me/entries/recent"),
  myReports: () => get<{ reports: Report[] }>("/api/me/reports"),
  uploadReport: async (file: File, opts: { industryId?: string; lensKeys?: string[] }) => {
    const fd = new FormData();
    fd.append("file", file);
    if (opts.industryId) fd.append("industryId", opts.industryId);
    if (opts.lensKeys) fd.append("lensKeys", JSON.stringify(opts.lensKeys));
    const res = await fetch(`${API_URL}/api/me/reports`, { method: "POST", credentials: "include", body: fd });
    if (!res.ok) {
      const msg = await res.json().catch(() => ({ error: `업로드 실패: ${res.status}` }));
      throw new Error((msg as { error?: string }).error ?? "업로드 실패");
    }
    return res.json() as Promise<{ report: Report }>;
  },
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
  industryId: string | null;
  fileSize: number | null;
  requestedLenses: string[] | null;
  parseStatus: "pending" | "parsing" | "parsed" | "failed";
  createdAt: string;
};
