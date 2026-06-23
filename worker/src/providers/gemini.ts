import { GoogleGenAI } from "@google/genai";
import type { Provider, ExtractedEntry, DocMeta, ExtractCtx, RollupResult } from "./types.js";
import { buildAnalyzePrompt, buildExtractPrompt, buildRollupPrompt } from "../prompts.js";
import { extractJson, parseMeta, parseFrame, parseNumbers, parseRollup } from "./parse.js";

// 기본 프로바이더(API 키). MVP 는 단일 호출(JSON).
export class GeminiProvider implements Provider {
  providerKey = "gemini" as const;
  private ai: GoogleGenAI;
  constructor(
    apiKey: string,
    public model: string,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  private async json(prompt: string, maxTokens: number): Promise<Record<string, unknown>> {
    const res = await this.ai.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json", maxOutputTokens: maxTokens },
    });
    return extractJson(res.text ?? "{}");
  }

  async analyze(document: string, industries: string[]): Promise<DocMeta> {
    return parseMeta(await this.json(buildAnalyzePrompt(document, industries), 400), industries);
  }

  async extract(document: string, ctx: ExtractCtx): Promise<ExtractedEntry> {
    const o = await this.json(buildExtractPrompt(document, ctx), 4096);
    return { frame: parseFrame(o, ctx), numbers: parseNumbers(o.numbers) };
  }

  async rollup(industryName: string, period: string, digest: string): Promise<RollupResult> {
    return parseRollup(await this.json(buildRollupPrompt(industryName, period, digest), 1500));
  }
}
