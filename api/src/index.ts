import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { env } from "./env.js";
import { authRoute } from "./routes/auth.js";
import { lensesRoute } from "./routes/lenses.js";
import { industriesRoute } from "./routes/industries.js";
import { meRoute } from "./routes/me.js";

const app = new Hono();

app.use("*", logger());
app.use("/api/*", cors({ origin: env.webOrigin, credentials: true }));

// 헬스체크(ALB 타깃그룹용)
app.get("/health", (c) => c.json({ ok: true }));

app.route("/api/auth", authRoute);
app.route("/api/lenses", lensesRoute);
app.route("/api/industries", industriesRoute);
app.route("/api/me", meRoute);

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
