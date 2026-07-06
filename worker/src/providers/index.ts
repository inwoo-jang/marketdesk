import { env } from "../env.js";
import type { Provider } from "./types.js";
import { MockProvider } from "./mock.js";
import { GeminiProvider } from "./gemini.js";
import { ClaudeCliProvider } from "./claude.js";
import { CodexCliProvider } from "./codex.js";

// LLM 라우터: 리포트별 엔진(key) 우선, 없으면 env 기본. 로컬 기본 mock(키 불필요).
// claude/codex = 터미널 CLI 직접 호출(키 불필요, 사용자 구독). gemini = 무료 API 키.
export function getProvider(key?: string | null): Provider {
  const selected = key || env.llmProvider;
  switch (selected) {
    case "claude":
      return new ClaudeCliProvider(env.claudeModel || undefined);
    case "codex":
      return new CodexCliProvider(env.codexModel || undefined, env.codexCliPath);
    case "gemini":
      if (!env.geminiApiKey) throw new Error("LLM_PROVIDER=gemini 인데 GEMINI_API_KEY 가 없습니다.");
      return new GeminiProvider(env.geminiApiKey, env.geminiModel);
    case "mock":
      return new MockProvider();
    default:
      throw new Error(`알 수 없는 LLM_PROVIDER: ${selected} (mock|claude|codex|gemini)`);
  }
}

export type { Provider } from "./types.js";
