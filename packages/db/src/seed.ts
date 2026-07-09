// 시드: 프리셋 렌즈 + 글로벌 산업 카탈로그. 재실행 안전(기존 키/슬러그 건너뜀).
// 실행: pnpm --filter @reportlens/db seed
import { isNull } from "drizzle-orm";
import { createDb, lenses, industries, STANDARD_INDUSTRIES } from "./index.js";

try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  /* 환경변수 직접 사용 */
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL 없음. packages/db/.env 확인.");
const db = createDb(url);

const PRESET_LENSES = [
  { key: "job", label: "취업", description: "취업·이직 관점(산업 구조·기업·채용 시그널)", sort: 1 },
  { key: "invest", label: "투자", description: "주식투자 관점(실적·수급·전망 숫자)", sort: 2 },
];

const GLOBAL_INDUSTRIES = STANDARD_INDUSTRIES;

async function main() {
  // 렌즈: PK(key) 충돌 무시
  await db.insert(lenses).values(PRESET_LENSES).onConflictDoNothing();

  // 글로벌 산업: (user_id NULL, slug) 의 NULL 때문에 unique 가 안 잡혀서 직접 중복 체크
  const existing = await db.select({ slug: industries.slug }).from(industries).where(isNull(industries.userId));
  const existingSlugs = new Set(existing.map((r) => r.slug));
  // sort 는 원본 목록 순서 기준(증분 추가 시 위치가 틀어지지 않게 map 먼저, filter 나중).
  const toInsert = GLOBAL_INDUSTRIES.map((g, i) => ({ ...g, userId: null, sort: i + 1 })).filter(
    (g) => !existingSlugs.has(g.slug),
  );
  if (toInsert.length > 0) await db.insert(industries).values(toInsert);

  console.log(`시드 완료: 렌즈 ${PRESET_LENSES.length}, 산업 신규 ${toInsert.length}/${GLOBAL_INDUSTRIES.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
