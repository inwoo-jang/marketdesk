import { eq, and, lte, notInArray, sql } from "drizzle-orm";
import { reports, rollups, users } from "@reportlens/db";
import { db } from "./db.js";
import { env } from "./env.js";
import { processReport } from "./process.js";
import { processRollup } from "./rollup.js";

// 로컬 에이전트 모드: 지정 이메일 유저의 작업만. 시작 시 userId 해석.
let localUserId: string | null = null;
async function resolveLocalUser(): Promise<void> {
  if (!env.localAgentUserEmail) return;
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, env.localAgentUserEmail)).limit(1);
  if (!u) throw new Error(`로컬 에이전트: 이메일 ${env.localAgentUserEmail} 유저를 찾을 수 없습니다.`);
  localUserId = u.id;
  console.log(`로컬 에이전트 모드: ${env.localAgentUserEmail} 작업만 처리`);
}
// 로컬 전용 엔진(로컬에서 처리). 클라우드 워커는 skipLocalProviders 시 이들을 건너뜀(로컬 에이전트에 양보).
const LOCAL_PROVIDERS = ["claude", "codex", "ollama"];

// 흐름 재생성 배치: dirty 로 표시된(업로드로 바뀐) 롤업을 6시간마다 한 번만 재생성 → 업로드마다 재생성 방지(원가 절감).
const ROLLUP_STALE_MS = 6 * 60 * 60 * 1000;
let lastSweep = 0;
async function sweepStaleRollups(): Promise<void> {
  const cutoff = new Date(Date.now() - ROLLUP_STALE_MS);
  const res = await db
    .update(rollups)
    .set({ status: "pending", dirty: false, dirtyAt: null })
    .where(and(eq(rollups.dirty, true), eq(rollups.status, "done"), lte(rollups.dirtyAt, cutoff)))
    .returning({ id: rollups.id });
  if (res.length) console.log(`흐름 재생성 배치: ${res.length}건 큐잉(6시간 경과)`);
}

// 큐→워커(로컬): SQS 대신 DB 폴링. pending 리포트/롤업을 집어 처리.
// 운영(SQS)에서는 메시지 수신이 트리거가 되고 process* 를 그대로 재사용.

const once = process.argv.includes("--once");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tick(): Promise<boolean> {
  // 스코프: 로컬 에이전트=내 유저만 / 클라우드=(옵션)로컬 전용 엔진 제외
  const reportScope = localUserId
    ? and(eq(reports.parseStatus, "pending"), eq(reports.userId, localUserId))
    : env.skipLocalProviders
      ? and(eq(reports.parseStatus, "pending"), sql`(${reports.llmProvider} is null or ${notInArray(reports.llmProvider, LOCAL_PROVIDERS)})`)
      : eq(reports.parseStatus, "pending");
  const rollupScope = localUserId
    ? and(eq(rollups.status, "pending"), eq(rollups.userId, localUserId))
    : env.skipLocalProviders
      ? and(eq(rollups.status, "pending"), sql`(${rollups.llmProvider} is null or ${notInArray(rollups.llmProvider, LOCAL_PROVIDERS)})`)
      : eq(rollups.status, "pending");

  // 1) 추출 대기 리포트
  const [r] = await db.select().from(reports).where(reportScope).orderBy(reports.createdAt).limit(1);
  if (r) {
    console.log(`처리 시작 ${r.id} (${r.title})`);
    await processReport(r);
    return true;
  }
  // 2) 생성 대기 롤업
  const [ru] = await db.select().from(rollups).where(rollupScope).orderBy(rollups.createdAt).limit(1);
  if (ru) {
    console.log(`롤업 시작 ${ru.id} (${ru.periodKey})`);
    await processRollup(ru);
    return true;
  }
  return false;
}

async function main() {
  console.log(`worker 시작 · provider=${env.llmProvider} · once=${once}`);
  await resolveLocalUser();
  // 크래시/재시작으로 'parsing' 에 멈춘 리포트를 pending 으로 복구(로컬 모드면 내 것만).
  const recCond = localUserId ? and(eq(reports.parseStatus, "parsing"), eq(reports.userId, localUserId)) : eq(reports.parseStatus, "parsing");
  const recovered = await db.update(reports).set({ parseStatus: "pending" }).where(recCond).returning({ id: reports.id });
  if (recovered.length) console.log(`중단됐던 리포트 ${recovered.length}건 재처리 복구`);
  if (once) {
    await tick();
    process.exit(0);
  }
  for (;;) {
    try {
      // 10분마다 dirty 롤업 배치 스윕(dirtyAt 기준이라 재시작에도 안전).
      if (Date.now() - lastSweep > 10 * 60 * 1000) {
        lastSweep = Date.now();
        await sweepStaleRollups().catch((e) => console.error("롤업 스윕 오류:", e));
      }
      const did = await tick();
      if (!did) await sleep(env.pollInterval * 1000);
    } catch (e) {
      console.error("tick 오류:", e);
      await sleep(env.pollInterval * 1000);
    }
  }
}

main();
