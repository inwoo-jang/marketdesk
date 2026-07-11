// @reportlens/db 패키지 진입점. api/mcp 에서 import 해 재사용.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

export * from "./schema/index";
export * from "./presets";
export * from "./crypto";
export * from "./resolve-security";

// 연결 팩토리. DATABASE_URL 은 호출측(Secrets Manager/env)에서 주입.
export function createDb(connectionString: string) {
  const client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof createDb>;
