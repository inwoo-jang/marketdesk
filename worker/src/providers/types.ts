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
  company: string | null; // 기업 문서의 핵심 회사명(흐름 보드 기업별)
};

// 월별 롤업(요약의 요약): 한 달 엔트리 → 흐름 한 줄 + 공통/엇갈림.
export type RollupFact = { type: "common" | "conflict" | "trigger"; content: string };
export type RollupResult = { oneLiner: string; facts: RollupFact[] };

// LLM 라우터 추상화. 구현체: MockProvider(로컬), GeminiProvider(기본), ClaudeCliProvider, CodexCliProvider.
// 분류+분석 통합 컨텍스트(문서타입은 호출 안에서 모델이 정하므로 렌즈·직무만).
export type MergeCtx = { lenses: string[]; jobRole?: string };
// 통합 호출 결과: 메타 + 구조화 프레임 + 가드레일용 numbers.
export type AnalyzeExtractResult = { meta: DocMeta; frame: EntryFrame; numbers: ExtractedNumber[] };

export interface Provider {
  // entries.provider 에 기록할 값(enum: gemini|claude|codex|mcp). mock 은 null.
  providerKey: "gemini" | "claude" | "codex" | "mcp" | null;
  model: string; // entries.model (예: gemini-2.0-flash-001, mock)
  // 분류+분석 통합(리포트당 1회): 메타 분류 + 구조화 틀 + 관점 레이어(켠 렌즈만) + 가드레일용 numbers.
  // 문서를 2번 보내던 analyze/extract 2회 호출을 1회로 합침.
  analyzeExtract(document: string, industries: string[], ctx: MergeCtx): Promise<AnalyzeExtractResult>;
  // 월별 롤업: digest(한 달 엔트리 요약 모음) → 흐름 한 줄 + 공통/엇갈림/트리거. 하위 엔트리만 근거.
  rollup(industryName: string, period: string, digest: string): Promise<RollupResult>;
  // 흐름 위험 신호 발화 판단: 새 자료가 각 신호에 실제 해당하는지 + 근거(단어 겹침 오탐 방지).
  judgeTriggers(repText: string, triggers: string[]): Promise<TriggerJudgment[]>;
  // 이 프로바이더 인스턴스가 지금까지 쓴 누적 토큰(usageMetadata). CLI 는 미측정(0).
  usage(): { input: number; output: number };
}

export type TriggerJudgment = { index: number; basis: string };
