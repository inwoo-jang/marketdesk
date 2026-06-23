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

// LLM 라우터 추상화. 구현체: MockProvider(로컬), GeminiProvider(기본), (이후 ClaudeProvider BYO).
export interface Provider {
  // entries.provider 에 기록할 값(enum: gemini|claude|mcp). mock 은 null.
  providerKey: "gemini" | "claude" | "mcp" | null;
  model: string; // entries.model (예: gemini-2.0-flash-001, mock)
  extract(document: string, lensKey: string): Promise<ExtractedEntry>;
}
