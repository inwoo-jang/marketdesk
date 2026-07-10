import { fileURLToPath } from "node:url";

// 로컬은 .env 파일 로드, 운영은 컨테이너 환경변수 사용(파일 없으면 무시).
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  // .env 없음 → 환경변수에서 직접 읽음
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 가 없습니다. api/.env 를 .env.example 보고 만드세요.`);
  return v;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  port: Number(process.env.PORT ?? 8787),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  // 세션 쿠키 서명 키. 운영은 Secrets Manager 주입. 로컬 기본값은 개발 전용.
  sessionSecret: process.env.SESSION_SECRET ?? "dev-insecure-secret-change-me",
  // 로컬 dev 로그인 허용(운영에서는 false → Cognito 만 사용)
  devAuthEnabled: process.env.DEV_AUTH_ENABLED !== "false",
  // 스토리지: local(디스크) | s3. 로컬 우선 기본 local.
  storageDriver: process.env.STORAGE_DRIVER ?? "local",
  uploadDir: process.env.UPLOAD_DIR ?? fileURLToPath(new URL("../.uploads", import.meta.url)),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 25),
  // 용어 풀이 LLM: gemini(빠름, 키 있으면 우선) → claude(CLI 폴백) | mock
  defineProvider: process.env.DEFINE_PROVIDER ?? "claude",
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  // 개발자 모드: 분석 무제한(무료 한도 게이팅 우회). 로컬 CLI 엔진과 함께 쓰는 본인 테스트용. 운영에서는 false.
  devUnlimited: process.env.DEV_UNLIMITED === "true",
  // 개발자 계정 이메일(쉼표 구분). 이 계정만 설정에서 분석 엔진(로컬 Claude/Codex CLI) 선택 가능.
  devEmails: (process.env.DEV_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  // 한국투자증권 KIS(주가 시세). 미설정이면 주가 기능만 비활성.
  kisBaseUrl: process.env.KIS_BASE_URL ?? "https://openapi.koreainvestment.com:9443",
  kisAppKey: process.env.KIS_APP_KEY ?? "",
  kisAppSecret: process.env.KIS_APP_SECRET ?? "",
};
