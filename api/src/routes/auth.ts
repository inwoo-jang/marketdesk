import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { users } from "@reportlens/db";
import { db } from "../db.js";
import { env } from "../env.js";
import { setSession, clearSession, getCurrentUser } from "../auth.js";

export const authRoute = new Hono();

const devLoginSchema = z.object({
  provider: z.enum(["google", "kakao"]),
  email: z.string().email().optional(),
  displayName: z.string().optional(),
});

// POST /api/auth/dev-login - 로컬 전용. 실제 소셜 로그인을 흉내내 user upsert + 세션.
// 운영(DEV_AUTH_ENABLED=false)에서는 비활성. 자리는 Cognito 콜백이 대체.
authRoute.post("/dev-login", async (c) => {
  if (!env.devAuthEnabled) return c.json({ error: "dev auth disabled" }, 403);

  const body = await c.req.json().catch(() => ({}));
  const parsed = devLoginSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid body", detail: parsed.error.flatten() }, 400);

  const { provider } = parsed.data;
  const email = parsed.data.email ?? `dev-${provider}@reportlens.local`;
  const displayName = parsed.data.displayName ?? `개발자(${provider})`;
  const cognitoSub = `dev:${provider}:${email}`; // Cognito sub 자리(로컬 표식)

  const [user] = await db
    .insert(users)
    .values({ cognitoSub, email, provider, displayName })
    .onConflictDoUpdate({ target: users.cognitoSub, set: { email, displayName, provider } })
    .returning();

  await setSession(c, user.id);
  return c.json({ user });
});

// GET /api/auth/me - 현재 로그인 사용자(없으면 null)
authRoute.get("/me", async (c) => {
  const user = await getCurrentUser(c);
  return c.json({ user });
});

// POST /api/auth/logout
authRoute.post("/logout", (c) => {
  clearSession(c);
  return c.json({ ok: true });
});
