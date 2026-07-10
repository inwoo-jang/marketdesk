import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { env } from "./env.js";
import { authRoute } from "./routes/auth.js";
import { lensesRoute } from "./routes/lenses.js";
import { industriesRoute } from "./routes/industries.js";
import { jobRolesRoute } from "./routes/jobRoles.js";
import { meRoute } from "./routes/me.js";
import { stocksRoute } from "./routes/stocks.js";
import { sweepPriceAlerts } from "./lib/price-alerts.js";

const app = new Hono();

app.use("*", logger());
// 운영은 설정된 web origin 만 허용. 개발(NODE_ENV!=production)에선 localhost/127.0.0.1/사설 LAN IP 도 허용
// (Next 가 출력하는 Network 주소로 접속하는 경우 대비).
const LOCAL_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;
app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      if (!origin) return env.webOrigin;
      if (origin === env.webOrigin) return origin;
      if (process.env.NODE_ENV !== "production" && LOCAL_ORIGIN.test(origin)) return origin;
      return env.webOrigin;
    },
    credentials: true,
  }),
);

// 헬스체크(ALB 타깃그룹용)
app.get("/health", (c) => c.json({ ok: true }));

app.route("/api/auth", authRoute);
app.route("/api/lenses", lensesRoute);
app.route("/api/industries", industriesRoute);
app.route("/api/job-roles", jobRolesRoute);
app.route("/api/me", meRoute);
app.route("/api/stocks", stocksRoute);

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});

// 가격 조기경보: 장중 15분마다 관심/보유 종목 급락·손절선 확인 → 알림 생성. (단일 인스턴스 가정)
setInterval(() => {
  sweepPriceAlerts().catch((e) => console.error("가격 경보 스윕 실패:", e));
}, 15 * 60 * 1000);
setTimeout(() => sweepPriceAlerts().catch(() => {}), 10_000); // 기동 후 1회
