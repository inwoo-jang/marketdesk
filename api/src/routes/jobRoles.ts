import { Hono } from "hono";
import { JOB_ROLES } from "@reportlens/db";

export const jobRolesRoute = new Hono();

// GET /api/job-roles - 취업 렌즈 직무 프리셋(온보딩 picker 용)
jobRolesRoute.get("/", (c) => c.json({ jobRoles: JOB_ROLES }));
