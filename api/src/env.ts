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
};
