import { sql } from "drizzle-orm";
import { usageDaily } from "@reportlens/db";
import { db } from "./db.js";

const seoulDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

// 유저별 실제 토큰 사용량 누적(KST 일자). 무료 한도·요금 산정 근거. Gemini 만 실측(CLI=0).
export async function recordTokenUsage(userId: string, input: number, output: number): Promise<void> {
  if (input <= 0 && output <= 0) return;
  const day = seoulDay();
  await db
    .insert(usageDaily)
    .values({ userId, day, count: 0, inputTokens: input, outputTokens: output })
    .onConflictDoUpdate({
      target: [usageDaily.userId, usageDaily.day],
      set: {
        inputTokens: sql`${usageDaily.inputTokens} + ${input}`,
        outputTokens: sql`${usageDaily.outputTokens} + ${output}`,
      },
    });
}
