import { Hono } from "hono";
import { z } from "zod";
import { eq, and, inArray, desc } from "drizzle-orm";
import { lenses, userLenses, industries, userIndustries, entries, entryNumbers, reports, JOB_ROLES } from "@reportlens/db";
import { db } from "../db.js";
import { storage } from "../storage.js";
import { env } from "../env.js";
import { requireUser, type AppEnv } from "../auth.js";

// /api/me/* : 로그인 사용자 스코핑(requireUser). 모든 쿼리에 user.id 강제.
export const meRoute = new Hono<AppEnv>();
meRoute.use("*", requireUser);

// GET /api/me/lenses - 내가 켠 렌즈 + 취업 직무(config.jobRole)
meRoute.get("/lenses", async (c) => {
  const user = c.get("user");
  const rows = await db
    .select({ lensKey: userLenses.lensKey, enabled: userLenses.enabled, config: userLenses.config })
    .from(userLenses)
    .where(eq(userLenses.userId, user.id));
  const enabled = rows.filter((r) => r.enabled).map((r) => r.lensKey);
  const jobRole = rows.find((r) => r.lensKey === "job")?.config?.jobRole;
  return c.json({ enabled, jobRole });
});

const JOB_ROLE_KEYS = JOB_ROLES.map((r) => r.key) as string[];
const setLensesSchema = z.object({
  keys: z.array(z.string()).min(1, "렌즈를 1개 이상 선택하세요"),
  jobRole: z.string().optional(),
});

// PUT /api/me/lenses - 내 렌즈 설정(전체 교체). 취업 렌즈면 직무(jobRole) config 저장.
meRoute.put("/lenses", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const parsed = setLensesSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid body", detail: parsed.error.flatten() }, 400);

  const valid = await db.select({ key: lenses.key }).from(lenses).where(inArray(lenses.key, parsed.data.keys));
  const validKeys = valid.map((v) => v.key);
  if (validKeys.length === 0) return c.json({ error: "유효한 렌즈가 없습니다" }, 400);

  const jobRole = parsed.data.jobRole && JOB_ROLE_KEYS.includes(parsed.data.jobRole) ? parsed.data.jobRole : undefined;

  await db.transaction(async (tx) => {
    await tx.delete(userLenses).where(eq(userLenses.userId, user.id));
    await tx.insert(userLenses).values(
      validKeys.map((key) => ({
        userId: user.id,
        lensKey: key,
        enabled: true,
        config: key === "job" && jobRole ? { jobRole } : null,
      })),
    );
  });

  return c.json({ enabled: validKeys, jobRole });
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

// GET /api/me/reports/:id - 리포트 1건 + 추출 작업 상태(AI 요약 작업 상태 조회)
meRoute.get("/reports/:id", async (c) => {
  const user = c.get("user");
  const [report] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, c.req.param("id")), eq(reports.userId, user.id)))
    .limit(1);
  if (!report) return c.json({ error: "리포트 없음" }, 404);
  return c.json({ report });
});

// POST /api/me/reports/:id/extract - 추출 재요청(AI 요약 생성 요청). parse_status=pending 으로 큐잉.
// 운영(SQS)에서는 여기서 메시지 enqueue. 로컬은 워커가 pending 을 폴링.
meRoute.post("/reports/:id/extract", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const [report] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, id), eq(reports.userId, user.id)))
    .limit(1);
  if (!report) return c.json({ error: "리포트 없음" }, 404);
  if (report.parseStatus === "parsing") return c.json({ error: "이미 처리 중입니다" }, 409);
  if (!report.requestedLenses || report.requestedLenses.length === 0)
    return c.json({ error: "추출할 렌즈가 없습니다" }, 400);

  await db.update(reports).set({ parseStatus: "pending" }).where(eq(reports.id, id));
  return c.json({ ok: true, parseStatus: "pending" });
});

// GET /api/me/reports/:id/entries - 리포트의 렌즈별 엔트리 + 핵심숫자(검토 화면용)
meRoute.get("/reports/:id/entries", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const [report] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, id), eq(reports.userId, user.id)))
    .limit(1);
  if (!report) return c.json({ error: "리포트 없음" }, 404);

  const entryRows = await db.select().from(entries).where(eq(entries.reportId, id)).orderBy(entries.lensKey);
  const ids = entryRows.map((e) => e.id);
  const numbers = ids.length
    ? await db.select().from(entryNumbers).where(inArray(entryNumbers.entryId, ids))
    : [];
  const byEntry = new Map<string, typeof numbers>();
  for (const n of numbers) {
    const arr = byEntry.get(n.entryId) ?? [];
    arr.push(n);
    byEntry.set(n.entryId, arr);
  }
  return c.json({
    report,
    entries: entryRows.map((e) => ({ ...e, numbers: byEntry.get(e.id) ?? [] })),
  });
});

const frameSchema = z
  .object({
    new_biz: z.string(),
    core_biz_structural: z.string(),
    core_biz_short: z.string(),
    overseas: z.string(),
    insight: z.string(),
  })
  .partial();
const saveEntrySchema = z.object({
  frame: frameSchema.optional(),
  status: z.enum(["draft", "saved"]).optional(),
});

// PUT /api/me/entries/:id - 엔트리 검토/수정 저장(요약 엔트리 저장 API)
meRoute.put("/entries/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const parsed = saveEntrySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "invalid body", detail: parsed.error.flatten() }, 400);

  const [existing] = await db
    .select()
    .from(entries)
    .where(and(eq(entries.id, id), eq(entries.userId, user.id)))
    .limit(1);
  if (!existing) return c.json({ error: "엔트리 없음" }, 404);

  const next = {
    frame: parsed.data.frame ? { ...(existing.frame ?? {}), ...parsed.data.frame } : existing.frame,
    status: parsed.data.status ?? existing.status,
    updatedAt: new Date(),
  };
  const [updated] = await db.update(entries).set(next).where(eq(entries.id, id)).returning();
  return c.json({ entry: updated });
});
