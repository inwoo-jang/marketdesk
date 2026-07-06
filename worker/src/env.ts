import { fileURLToPath } from "node:url";

// 로컬은 .env 로드, 운영은 컨테이너 환경변수.
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  /* 환경변수 직접 사용 */
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 가 없습니다. worker/.env 를 .env.example 보고 만드세요.`);
  return v;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  storageDriver: process.env.STORAGE_DRIVER ?? "local",
  uploadDir: process.env.UPLOAD_DIR ?? fileURLToPath(new URL("../../api/.uploads", import.meta.url)),
  llmProvider: process.env.LLM_PROVIDER ?? "mock", // mock | claude(CLI) | codex(CLI) | gemini
  claudeModel: process.env.CLAUDE_MODEL ?? "", // 비우면 claude CLI 기본 모델
  codexModel: process.env.CODEX_MODEL ?? "", // 비우면 codex CLI 기본 모델
  codexCliPath: process.env.CODEX_CLI_PATH ?? "codex",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.0-flash-001",
  pollInterval: Number(process.env.POLL_INTERVAL ?? 3),
};
