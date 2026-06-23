import { Hono } from "hono";
import { lenses } from "@reportlens/db";
import { db } from "../db.js";

export const lensesRoute = new Hono();

// GET /api/lenses - 프리셋 렌즈 카탈로그
lensesRoute.get("/", async (c) => {
  const rows = await db.select().from(lenses).orderBy(lenses.sort);
  return c.json({ lenses: rows });
});
