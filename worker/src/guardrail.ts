import type { ParsedPage } from "./parsing.js";
import type { ExtractedNumber } from "./providers/types.js";

// 가드레일: 핵심숫자가 실제 출처 페이지 텍스트에 존재하는지 룰매칭(verified).
// LLM 이 지어낸 수치(환각)나 잘못된 페이지 인용을 잡아낸다.

const norm = (s: string) => s.replace(/[\s,]/g, "");

function numericTokens(value: string): string[] {
  return (value.match(/\d+(?:\.\d+)?/g) ?? []).filter((t) => t.length > 0);
}

export function verifyNumber(value: string, pageText: string | undefined): boolean {
  if (!pageText) return false;
  const tokens = numericTokens(value);
  if (tokens.length === 0) return false; // 숫자가 없으면 검증 불가 → 미검증 처리
  const haystack = norm(pageText);
  // 가장 긴(대표) 숫자 토큰이 페이지에 있으면 검증 통과
  const primary = tokens.sort((a, b) => b.length - a.length)[0];
  return haystack.includes(primary);
}

export function verifyNumbers(numbers: ExtractedNumber[], pages: ParsedPage[]): ExtractedNumber[] {
  const byPage = new Map(pages.map((p) => [p.pageNo, p.text]));
  return numbers.map((n) => ({
    ...n,
    verified: n.pageNo != null ? verifyNumber(n.value, byPage.get(n.pageNo)) : false,
  }));
}
