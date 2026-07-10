import type { Provider, AnalyzeExtractResult, MergeCtx, RollupResult, TriggerJudgment } from "./types.js";
import { buildAnalyzeExtractPrompt, buildRollupPrompt, buildTriggerJudgePrompt } from "../prompts.js";
import { extractJson, parseMeta, parseFrame, parseNumbers, parseRollup, parseTriggerJudge } from "./parse.js";

// BYO Anthropic(Claude) API 프로바이더. 프롬프트·파싱은 Gemini 와 공유, 호출만 Messages API.
export class AnthropicProvider implements Provider {
  providerKey = "claude" as const;
  private tokIn = 0;
  private tokOut = 0;
  constructor(
    private apiKey: string,
    public model: string,
  ) {}

  usage() {
    return { input: this.tokIn, output: this.tokOut };
  }

  private async json(prompt: string, maxTokens: number): Promise<Record<string, unknown>> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        temperature: 0.2,
        messages: [{ role: "user", content: `${prompt}\n\n출력은 JSON 하나만. 다른 텍스트 금지.` }],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as any;
    this.tokIn += j.usage?.input_tokens ?? 0;
    this.tokOut += j.usage?.output_tokens ?? 0;
    const text = (j.content ?? []).map((b: any) => b.text ?? "").join("");
    return extractJson(text || "{}");
  }

  async analyzeExtract(document: string, industries: string[], ctx: MergeCtx): Promise<AnalyzeExtractResult> {
    const o = await this.json(buildAnalyzeExtractPrompt(document, industries, ctx), 4500);
    const meta = parseMeta(o, industries);
    return { meta, frame: parseFrame(o, { docType: meta.docType, lenses: ctx.lenses, jobRole: ctx.jobRole }), numbers: parseNumbers(o.numbers) };
  }

  async rollup(industryName: string, period: string, digest: string): Promise<RollupResult> {
    return parseRollup(await this.json(buildRollupPrompt(industryName, period, digest), 2500));
  }

  async judgeTriggers(repText: string, triggers: string[]): Promise<TriggerJudgment[]> {
    if (triggers.length === 0) return [];
    const o = await this.json(buildTriggerJudgePrompt(repText, triggers), 800);
    return parseTriggerJudge(o).filter((h) => h.index < triggers.length);
  }
}
