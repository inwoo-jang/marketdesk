import { isNotNull, eq } from "drizzle-orm";
import { reports, resolveSecurityId } from "@reportlens/db";
import { db } from "./db.js";

// 일회성: company 가 있는 기존 리포트를 종목 마스터에 (재)해석해 링크. 잘못된 링크도 덮어씀.
async function main() {
  const rows = await db
    .select({ id: reports.id, company: reports.company, securityId: reports.securityId })
    .from(reports)
    .where(isNotNull(reports.company));
  let linked = 0;
  let changed = 0;
  for (const r of rows) {
    const sid = await resolveSecurityId(db, r.company);
    if (sid) linked++;
    if (sid !== r.securityId) {
      await db.update(reports).set({ securityId: sid }).where(eq(reports.id, r.id));
      changed++;
    }
  }
  console.log(`백필 완료: ${linked}/${rows.length} 건 링크(변경 ${changed}건, 미해석 ${rows.length - linked}건)`);
  process.exit(0);
}

main().catch((e) => {
  console.error("백필 오류:", e);
  process.exit(1);
});
