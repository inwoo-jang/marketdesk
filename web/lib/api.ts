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

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${path} 실패: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  lenses: () => get<{ lenses: Lens[] }>("/api/lenses"),
  industries: () => get<{ industries: Industry[] }>("/api/industries"),
  me: () => get<{ user: User | null }>("/api/auth/me"),
  devLogin: (provider: "google" | "kakao") => post<{ user: User }>("/api/auth/dev-login", { provider }),
  logout: () => post<{ ok: true }>("/api/auth/logout"),
};
