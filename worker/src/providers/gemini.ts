import { GoogleGenAI } from "@google/genai";
import type { Provider, AnalyzeExtractResult, MergeCtx, RollupResult, TriggerJudgment } from "./types.js";
import { buildAnalyzeExtractPrompt, buildRollupPrompt, buildTriggerJudgePrompt } from "../prompts.js";
import { extractJson, parseMeta, parseFrame, parseNumbers, parseRollup, parseTriggerJudge } from "./parse.js";

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
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: maxTokens,
        // 모델·실행 간 일관성 확보용 낮은 온도(구조화 추출은 창의성 불필요).
        temperature: 0.2,
        // 2.5 계열은 추론(thinking) 모델 → 구조화 JSON 에선 thinking 비활성(출력 토큰 확보·속도·비용).
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    return extractJson(res.text ?? "{}");
  }

  async analyzeExtract(document: string, industries: string[], ctx: MergeCtx): Promise<AnalyzeExtractResult> {
    const o = await this.json(buildAnalyzeExtractPrompt(document, industries, ctx), 4500);
    const meta = parseMeta(o, industries);
    return { meta, frame: parseFrame(o, { docType: meta.docType, lenses: ctx.lenses, jobRole: ctx.jobRole }), numbers: parseNumbers(o.numbers) };
  }

  async rollup(industryName: string, period: string, digest: string): Promise<RollupResult> {
    return parseRollup(await this.json(buildRollupPrompt(industryName, period, digest), 1500));
  }

  async judgeTriggers(repText: string, triggers: string[]): Promise<TriggerJudgment[]> {
    if (triggers.length === 0) return [];
    const o = await this.json(buildTriggerJudgePrompt(repText, triggers), 800);
    return parseTriggerJudge(o).filter((h) => h.index < triggers.length);
  }
}
