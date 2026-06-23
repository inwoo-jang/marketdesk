import { Hono } from "hono";
import { z } from "zod";
import { eq, and, inArray, desc } from "drizzle-orm";
import { lenses, userLenses, industries, userIndustries, entries, reports } from "@reportlens/db";
import { db } from "../db.js";
import { storage } from "../storage.js";
import { env } from "../env.js";
import { requireUser, type AppEnv } from "../auth.js";

// /api/me/* : 로그인 사용자 스코핑(requireUser). 모든 쿼리에 user.id 강제.
export const meRoute = new Hono<AppEnv>();
meRoute.use("*", requireUser);

// GET /api/me/lenses - 내가 켠 렌즈 키 목록
meRoute.get("/lenses", async (c) => {
  const user = c.get("user");
  const rows = await db
    .select({ lensKey: userLenses.lensKey, enabled: userLenses.enabled })
    .from(userLenses)
    .where(eq(userLenses.userId, user.id));
  const enabled = rows.filter((r) => r.enabled).map((r) => r.lensKey);
  return c.json({ enabled });
});

const setLensesSchema = z.object({ keys: z.array(z.string()).min(1, "렌즈를 1개 이상 선택하세요") });

// PUT /api/me/lenses - 내 렌즈 설정(전체 교체). 유효한 렌즈 키만 반영.
meRoute.put("/lenses", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const parsed = setLensesSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid body", detail: parsed.error.flatten() }, 400);

  // 존재하는 렌즈만 통과(무결성)
  const valid = await db.select({ key: lenses.key }).from(lenses).where(inArray(lenses.key, parsed.data.keys));
  const validKeys = valid.map((v) => v.key);
  if (validKeys.length === 0) return c.json({ error: "유효한 렌즈가 없습니다" }, 400);

  await db.transaction(async (tx) => {
    await tx.delete(userLenses).where(eq(userLenses.userId, user.id));
    await tx.insert(userLenses).values(validKeys.map((key) => ({ userId: user.id, lensKey: key, enabled: true })));
  });

  return c.json({ enabled: validKeys });
});

// ---- 산업 ----

// GET /api/me/industries - 내가 팔로우한 산업(상세)
meRoute.get("/industries", async (c) => {
  const user = c.get("user");
  const rows = await db
    .select({
      id: industries.id,
      name: industries.name,
      slug: industries.slug,
      iconColor: industries.iconColor,
      isCustom: industries.userId, // null=글로벌
      sort: userIndustries.sort,
    })
    .from(userIndustries)
    .innerJoin(industries, eq(userIndustries.industryId, industries.id))
    .where(eq(userIndustries.userId, user.id))
    .orderBy(userIndustries.sort);
  return c.json({ industries: rows.map((r) => ({ ...r, isCustom: r.isCustom !== null })) });
});

const followSchema = z.object({ industryId: z.string().uuid() });

// POST /api/me/industries/follow - 기존 산업(글로벌/커스텀) 팔로우
meRoute.post("/industries/follow", async (c) => {
  const user = c.get("user");
  const parsed = followSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid body" }, 400);

  // 글로벌이거나 본인 소유 커스텀만 팔로우 가능(타인 커스텀 차단)
  const [ind] = await db.select().from(industries).where(eq(industries.id, parsed.data.industryId)).limit(1);
  if (!ind) return c.json({ error: "산업 없음" }, 404);
  if (ind.userId !== null && ind.userId !== user.id) return c.json({ error: "접근 불가" }, 403);

  await db
    .insert(userIndustries)
    .values({ userId: user.id, industryId: ind.id })
    .onConflictDoNothing();
  return c.json({ ok: true });
});

// DELETE /api/me/industries/:id - 언팔로우
meRoute.delete("/industries/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  await db.delete(userIndustries).where(and(eq(userIndustries.userId, user.id), eq(userIndustries.industryId, id)));
  return c.json({ ok: true });
});

const createIndustrySchema = z.object({
  name: z.string().min(1).max(40),
  iconColor: z.string().optional(),
});

// POST /api/me/industries - 커스텀 산업 생성 + 자동 팔로우
meRoute.post("/industries", async (c) => {
  const user = c.get("user");
  const parsed = createIndustrySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid body", detail: parsed.error.flatten() }, 400);

  const name = parsed.data.name.trim();
  const slug = name.toLowerCase().replace(/\s+/g, "-");

  const created = await db
    .insert(industries)
    .values({ userId: user.id, name, slug, iconColor: parsed.data.iconColor ?? "#8A93A8" })
    .onConflictDoNothing()
    .returning();

  // (user_id, slug) 중복이면 기존 것 사용
  const [ind] = created.length
    ? created
    : await db.select().from(industries).where(and(eq(industries.userId, user.id), eq(industries.slug, slug))).limit(1);

  await db.insert(userIndustries).values({ userId: user.id, industryId: ind.id }).onConflictDoNothing();
  return c.json({ industry: ind });
});

// GET /api/me/entries/recent - 최근 엔트리(Sprint2 추출 전까지는 비어있음)
meRoute.get("/entries/recent", async (c) => {
  const user = c.get("user");
  const rows = await db
    .select()
    .from(entries)
    .where(eq(entries.userId, user.id))
    .orderBy(desc(entries.createdAt))
    .limit(10);
  return c.json({ entries: rows });
});

// ---- 리포트 업로드 ----

// GET /api/me/reports - 내 업로드 리포트 목록
meRoute.get("/reports", async (c) => {
  const user = c.get("user");
  const rows = await db
    .select()
    .from(reports)
    .where(eq(reports.userId, user.id))
    .orderBy(desc(reports.createdAt))
    .limit(30);
  return c.json({ reports: rows });
});

// POST /api/me/reports - PDF 업로드(multipart). 파일 저장 + report 생성(parse_status=pending).
// 실제 파싱/추출은 Sprint2 워커가 큐로 처리.
meRoute.post("/reports", async (c) => {
  const user = c.get("user");
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) return c.json({ error: "file 필드(PDF)가 필요합니다" }, 400);

  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return c.json({ error: "PDF 파일만 업로드할 수 있습니다" }, 400);
  if (file.size > env.maxUploadMb * 1024 * 1024)
    return c.json({ error: `파일이 너무 큽니다(최대 ${env.maxUploadMb}MB)` }, 400);

  // 산업: 선택 시 글로벌이거나 본인 소유만 허용
  const industryId = typeof body["industryId"] === "string" && body["industryId"] ? body["industryId"] : null;
  if (industryId) {
    const [ind] = await db.select().from(industries).where(eq(industries.id, industryId)).limit(1);
    if (!ind) return c.json({ error: "산업 없음" }, 404);
    if (ind.userId !== null && ind.userId !== user.id) return c.json({ error: "접근 불가" }, 403);
  }

  // 렌즈: 요청값을 사용자가 켠 렌즈로 한정. 미지정이면 켠 렌즈 전체.
  const enabledRows = await db
    .select({ lensKey: userLenses.lensKey })
    .from(userLenses)
    .where(and(eq(userLenses.userId, user.id), eq(userLenses.enabled, true)));
  const enabled = enabledRows.map((r) => r.lensKey);
  let requested = enabled;
  const raw = body["lensKeys"];
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) requested = arr.filter((k): k is string => typeof k === "string" && enabled.includes(k));
    } catch {
      /* 무시하고 enabled 사용 */
    }
  }
  if (requested.length === 0) return c.json({ error: "추출할 렌즈가 없습니다. 먼저 렌즈를 켜세요." }, 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { fileKey, size } = await storage.save(user.id, file.name, bytes);

  const [report] = await db
    .insert(reports)
    .values({
      userId: user.id,
      industryId,
      title: file.name.replace(/\.pdf$/i, ""),
      fileKey,
      fileSize: size,
      requestedLenses: requested,
      parseStatus: "pending",
    })
    .returning();

  return c.json({ report });
});
