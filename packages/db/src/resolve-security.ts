import { or, eq, ilike } from "drizzle-orm";
import { securities } from "./schema/stocks";
import type { Db } from "./index";

// 종목 마스터 nameNorm 과 동일한 정규화(공백·괄호·구분자 제거 + 소문자).
// ingest-securities 의 nameNorm 계산과 반드시 일치해야 해석이 맞는다.
export const normName = (s: string): string => s.replace(/[\s()·.,\-&]/g, "").toLowerCase();

// 회사명(AI 추출) → 종목 마스터 securityId 해석. 못 찾으면 null.
// 정밀 규칙(오매칭 방지):
//  - 정확 일치(nameNorm == norm): 국내·해외 모두 인정.
//  - 해외 tight 접두: 해외 nameNorm 은 한글명+영문 연결이라, norm 이 한글명 전체를 소진한 경우
//    (접두 뒤 첫 글자가 라틴/숫자)만 인정. 예: '테슬라'→'테슬라teslainc', '인텔'→'인텔intelcorp'.
//    '네이버'→'네이버스인더스트리스…' 처럼 뒤가 한글이면(부분어) 배제.
//  - 국내 접두(비정확)는 다른 회사의 부분어일 수 있어 배제. 예: '인텔'⊄'인텔리안테크'.
export async function resolveSecurityId(db: Db, rawName: string | null | undefined): Promise<string | null> {
  if (!rawName) return null;
  const norm = normName(rawName);
  if (norm.length < 2) return null; // 너무 짧은 이름은 오매칭 위험 → 미해석
  const rows = await db
    .select({ id: securities.id, nameNorm: securities.nameNorm, isOverseas: securities.isOverseas })
    .from(securities)
    .where(or(eq(securities.nameNorm, norm), ilike(securities.nameNorm, `${norm}%`)))
    .limit(30);
  const isLatin = (ch: string | undefined) => ch !== undefined && /[a-z0-9]/.test(ch);
  const kept = rows.filter((r) => {
    if (r.nameNorm === norm) return true; // 정확
    if (!r.isOverseas) return false; // 국내 접두(비정확) 배제
    return isLatin(r.nameNorm[norm.length]); // 해외: 한글명 전체 소진(tight) 만 인정
  });
  if (kept.length === 0) return null;
  const rank = (nameNorm: string) => (nameNorm === norm ? 0 : 1);
  kept.sort(
    (a, b) =>
      rank(a.nameNorm) - rank(b.nameNorm) ||
      Number(a.isOverseas) - Number(b.isOverseas) ||
      a.nameNorm.length - b.nameNorm.length,
  );
  return kept[0].id;
}
