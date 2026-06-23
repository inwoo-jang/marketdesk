import { Hono } from "hono";
import { isNull } from "drizzle-orm";
import { industries } from "@reportlens/db";
import { db } from "../db.js";

export const industriesRoute = new Hono();

// GET /api/industries - 글로벌 산업 카탈로그(user_id NULL)
// 인증/커스텀 산업은 이후 슬라이스에서 user 스코핑 추가.
industriesRoute.get("/", async (c) => {
  const rows = await db.select().from(industries).where(isNull(industries.userId)).orderBy(industries.sort);
  return c.json({ industries: rows });
});
