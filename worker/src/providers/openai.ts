import type { Provider, AnalyzeExtractResult, MergeCtx, RollupResult, TriggerJudgment } from "./types.js";
import { buildAnalyzeExtractPrompt, buildRollupPrompt, buildTriggerJudgePrompt } from "../prompts.js";
import { extractJson, parseMeta, parseFrame, parseNumbers, parseRollup, parseTriggerJudge } from "./parse.js";

// BYO OpenAI(GPT) API 프로바이더. 프롬프트·파싱 공유, 호출만 Chat Completions(JSON 모드).
export class OpenAIProvider implements Provider {
  providerKey = null; // entries.provider enum 에 openai 없음 → null(기타)
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
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: `${prompt}\n\n반드시 JSON 하나로만 응답.` }],
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as any;
    this.tokIn += j.usage?.prompt_tokens ?? 0;
    this.tokOut += j.usage?.completion_tokens ?? 0;
    return extractJson(j.choices?.[0]?.message?.content || "{}");
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
