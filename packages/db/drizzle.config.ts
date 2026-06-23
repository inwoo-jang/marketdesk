import { defineConfig } from "drizzle-kit";

// DATABASE_URL 은 .env 에서 주입. 평문 시크릿 커밋 금지(.env.example 만 커밋).
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL 환경변수가 없습니다. packages/db/.env 를 .env.example 보고 만드세요.");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
