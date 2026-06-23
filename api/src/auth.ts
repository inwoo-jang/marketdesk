import type { Context, MiddlewareHandler } from "hono";
import { getSignedCookie, setSignedCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { users } from "@reportlens/db";
import { db } from "./db.js";
import { env } from "./env.js";

export type AppUser = typeof users.$inferSelect;
export type AppEnv = { Variables: { user: AppUser } };

const COOKIE = "rl_session";

// 세션 쿠키 = 서명된 user id. 운영에서는 이 추상화 뒤에 Cognito JWT 검증을 끼운다.
export async function setSession(c: Context, userId: string) {
  await setSignedCookie(c, COOKIE, userId, env.sessionSecret, {
    httpOnly: true,
    sameSite: "Lax", // 로컬(같은 site 다른 port)에서 동작. 운영(교차 site)은 None+Secure 필요.
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSession(c: Context) {
  deleteCookie(c, COOKIE, { path: "/" });
}

// 현재 사용자 조회(없으면 null). 세션 쿠키 -> users 행.
export async function getCurrentUser(c: Context): Promise<AppUser | null> {
  const userId = await getSignedCookie(c, env.sessionSecret, COOKIE);
  if (!userId) return null;
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row ?? null;
}

// 보호 라우트용 미들웨어: 미인증이면 401, 인증이면 c.set("user").
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  c.set("user", user);
  await next();
};
