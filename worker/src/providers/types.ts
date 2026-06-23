import type { EntryFrame } from "@reportlens/db";

export type ExtractedNumber = {
  label: string;
  value: string;
  pageNo: number | null;
  verified?: boolean; // 가드레일이 채움
};

export type ExtractedEntry = {
  frame: EntryFrame;
  numbers: ExtractedNumber[];
};

export type DocType = "industry" | "company" | "news";
export type ExtractCtx = { jobRole?: string; docType?: DocType };

// 문서 메타: 제목·발간일·한줄요약·문서타입·산업(멀티).
export type DocMeta = {
  title: string | null;
  pubDate: string | null; // YYYY-MM-DD
  summary: string | null; // 한줄요약(피드 미리보기)
  docType: DocType;
  industries: string[]; // 후보 카탈로그 이름 중 매칭(복수 가능)
};

// LLM 라우터 추상화. 구현체: MockProvider(로컬), GeminiProvider(기본), (이후 ClaudeProvider BYO).
export interface Provider {
  // entries.provider 에 기록할 값(enum: gemini|claude|mcp). mock 은 null.
  providerKey: "gemini" | "claude" | "mcp" | null;
  model: string; // entries.model (예: gemini-2.0-flash-001, mock)
  // 메타 추출(제목·발간일·요약·타입·멀티산업). industries = 카탈로그 후보 이름.
  analyze(document: string, industries: string[]): Promise<DocMeta>;
  // 렌즈별 구조화 추출(ctx: 취업 직무·문서타입)
  extract(document: string, lensKey: string, ctx?: ExtractCtx): Promise<ExtractedEntry>;
}
