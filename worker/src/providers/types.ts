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
export type Classification = { industry: string | null; docType: DocType };
export type ExtractCtx = { jobRole?: string; docType?: DocType };

// LLM 라우터 추상화. 구현체: MockProvider(로컬), GeminiProvider(기본), (이후 ClaudeProvider BYO).
export interface Provider {
  // entries.provider 에 기록할 값(enum: gemini|claude|mcp). mock 은 null.
  providerKey: "gemini" | "claude" | "mcp" | null;
  model: string; // entries.model (예: gemini-2.0-flash-001, mock)
  // 산업·문서타입 분류(industries = 카탈로그 후보 이름)
  classify(document: string, industries: string[]): Promise<Classification>;
  // 렌즈별 구조화 추출(ctx: 취업 직무·문서타입)
  extract(document: string, lensKey: string, ctx?: ExtractCtx): Promise<ExtractedEntry>;
}
