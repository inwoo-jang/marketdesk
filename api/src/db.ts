import { createDb } from "@reportlens/db";
import { env } from "./env.js";

// 단일 DB 커넥션(앱 전역 재사용).
export const db = createDb(env.databaseUrl);
