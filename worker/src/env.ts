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
  // 한국투자증권 KIS(주가 시세). 미설정이면 주가 기능만 비활성.
  kisBaseUrl: process.env.KIS_BASE_URL ?? "https://openapi.koreainvestment.com:9443",
  kisAppKey: process.env.KIS_APP_KEY ?? "",
  kisAppSecret: process.env.KIS_APP_SECRET ?? "",
  // BYO(본인 API 키) 복호화용 앱 시크릿. api 와 동일해야 함.
  appEncKey: process.env.APP_ENC_KEY ?? "",
  // BYO Anthropic/OpenAI 모델(비우면 기본). 유저 키로 호출.
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  // 로컬 에이전트용 Ollama(로컬 오픈모델). 본인 PC에서 무료·무제한.
  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.1",
  // 로컬 에이전트 모드: 이 이메일 유저의 작업만 처리(본인 PC의 Ollama로). 비우면 일반(클라우드) 모드.
  localAgentUserEmail: process.env.LOCAL_AGENT_USER_EMAIL ?? "",
  // 클라우드 워커가 로컬 전용 엔진(claude/codex/ollama) 리포트를 건너뛸지(로컬 에이전트에 양보). 운영 배포 시 true.
  skipLocalProviders: process.env.WORKER_SKIP_LOCAL === "true",
};
