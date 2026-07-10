import { extractText, getDocumentProxy } from "unpdf";

export type ParsedPage = { pageNo: number; text: string };

// PDF 추출 텍스트엔 NUL 등 제어문자가 섞이는데, Postgres text 컬럼은 NUL 을 거부해 insert 가 터진다.
// 탭·개행(\t\n\r)만 남기고 나머지 C0 제어문자 제거. (파싱 실패의 흔한 원인)
export const stripControlChars = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

// PDF -> 페이지별 텍스트. [p.N] 인용·룰매칭의 근거.
export async function parsePdf(bytes: Uint8Array): Promise<{ pageCount: number; pages: ParsedPage[] }> {
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages: ParsedPage[] = (text as string[]).map((t, i) => ({ pageNo: i + 1, text: stripControlChars(t ?? "") }));
  return { pageCount: totalPages, pages };
}

// 페이지 마커가 포함된 단일 문서(모델이 [p.N]을 달 수 있게).
export function buildDocument(pages: ParsedPage[]): string {
  return pages.map((p) => `=== p.${p.pageNo} ===\n${p.text}`).join("\n\n");
}
