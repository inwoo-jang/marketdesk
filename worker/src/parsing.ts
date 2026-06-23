import { extractText, getDocumentProxy } from "unpdf";

export type ParsedPage = { pageNo: number; text: string };

// PDF -> 페이지별 텍스트. [p.N] 인용·룰매칭의 근거.
export async function parsePdf(bytes: Uint8Array): Promise<{ pageCount: number; pages: ParsedPage[] }> {
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages: ParsedPage[] = (text as string[]).map((t, i) => ({ pageNo: i + 1, text: t ?? "" }));
  return { pageCount: totalPages, pages };
}

// 페이지 마커가 포함된 단일 문서(모델이 [p.N]을 달 수 있게).
export function buildDocument(pages: ParsedPage[]): string {
  return pages.map((p) => `=== p.${p.pageNo} ===\n${p.text}`).join("\n\n");
}
