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
// 추출 컨텍스트: 문서타입 + 켠 렌즈(관점 레이어 결정) + 취업 직무.
export type ExtractCtx = { docType: DocType; lenses: string[]; jobRole?: string };

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
  // 구조화 분석(리포트당 1회): 공통 틀 + 관점 레이어(켠 렌즈만). 가드레일용 numbers 동반.
  extract(document: string, ctx: ExtractCtx): Promise<ExtractedEntry>;
}
