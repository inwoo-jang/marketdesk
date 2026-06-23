import { env } from "../env.js";
import type { Provider } from "./types.js";
import { MockProvider } from "./mock.js";
import { GeminiProvider } from "./gemini.js";

// LLM 라우터: env 로 프로바이더 선택. 로컬 기본 mock(키 불필요).
export function getProvider(): Provider {
  switch (env.llmProvider) {
    case "gemini":
      if (!env.geminiApiKey) throw new Error("LLM_PROVIDER=gemini 인데 GEMINI_API_KEY 가 없습니다.");
      return new GeminiProvider(env.geminiApiKey, env.geminiModel);
    case "mock":
      return new MockProvider();
    default:
      throw new Error(`알 수 없는 LLM_PROVIDER: ${env.llmProvider} (mock|gemini)`);
  }
}

export type { Provider } from "./types.js";
