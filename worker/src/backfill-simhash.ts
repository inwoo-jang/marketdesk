import { eq, and, asc, isNull, isNotNull } from "drizzle-orm";
import { reports, reportPages } from "@reportlens/db";
import { db } from "./db.js";
import { simhash, hamming } from "./simhash.js";

const THRESHOLD = 6;

// 기존 parsed 리포트에 simhash 백필 + 유사 중복(dup_of) 지정. 가장 먼저 올린 것을 원본으로.
async function run() {
  const rows = await db
    .select({ id: reports.id, userId: reports.userId })
    .from(reports)
    .where(and(eq(reports.parseStatus, "parsed"), isNull(reports.simhash)))
    .orderBy(asc(reports.createdAt));
  console.log(`simhash 백필 대상: ${rows.length}건`);

  let done = 0;
  for (const r of rows) {
    const pages = await db.select({ text: reportPages.text }).from(reportPages).where(eq(reportPages.reportId, r.id));
    const text = pages.map((p) => p.text).join("\n");
    const sim = simhash(text);
    await db.update(reports).set({ simhash: sim }).where(eq(reports.id, r.id));
    done++;
    if (done % 20 === 0) console.log(`  ...${done}/${rows.length}`);
  }
  console.log(`simhash 채움: ${done}건`);

  // 유사 중복 지정: 각 리포트를, 더 먼저 올린(원본) 리포트와 비교
  const all = await db
    .select({ id: reports.id, userId: reports.userId, simhash: reports.simhash, createdAt: reports.createdAt })
    .from(reports)
    .where(and(eq(reports.parseStatus, "parsed"), isNotNull(reports.simhash), isNull(reports.dupOf)))
    .orderBy(asc(reports.createdAt));
  let dupCount = 0;
  const seen: { id: string; userId: string; simhash: string }[] = [];
  for (const r of all) {
    if (!r.simhash) continue;
    const match = seen.find((s) => s.userId === r.userId && hamming(s.simhash, r.simhash!) <= THRESHOLD);
    if (match) {
      await db.update(reports).set({ dupOf: match.id }).where(eq(reports.id, r.id));
      dupCount++;
      console.log(`  중복: ${r.id} → ${match.id}`);
    } else {
      seen.push({ id: r.id, userId: r.userId, simhash: r.simhash });
    }
  }
  console.log(`유사 중복 지정: ${dupCount}건`);
  process.exit(0);
}

run();
