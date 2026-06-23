import { eq } from "drizzle-orm";
import { reports } from "@reportlens/db";
import { db } from "./db.js";
import { env } from "./env.js";
import { processReport } from "./process.js";

// 큐→워커(로컬): SQS 대신 DB 폴링. pending 리포트를 집어 처리.
// 운영(SQS)에서는 메시지 수신이 트리거가 되고 processReport 를 그대로 재사용.

const once = process.argv.includes("--once");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tick(): Promise<boolean> {
  const [r] = await db
    .select()
    .from(reports)
    .where(eq(reports.parseStatus, "pending"))
    .orderBy(reports.createdAt)
    .limit(1);
  if (!r) return false;
  console.log(`처리 시작 ${r.id} (${r.title})`);
  await processReport(r);
  return true;
}

async function main() {
  console.log(`worker 시작 · provider=${env.llmProvider} · once=${once}`);
  if (once) {
    await tick();
    process.exit(0);
  }
  for (;;) {
    try {
      const did = await tick();
      if (!did) await sleep(env.pollInterval * 1000);
    } catch (e) {
      console.error("tick 오류:", e);
      await sleep(env.pollInterval * 1000);
    }
  }
}

main();
