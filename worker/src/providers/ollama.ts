import type { Provider, AnalyzeExtractResult, MergeCtx, RollupResult, TriggerJudgment } from "./types.js";
import { buildAnalyzeExtractPrompt, buildRollupPrompt, buildTriggerJudgePrompt } from "../prompts.js";
import { extractJson, parseMeta, parseFrame, parseNumbers, parseRollup, parseTriggerJudge } from "./parse.js";

// 로컬 오픈모델(Ollama) 프로바이더. 로컬 HTTP API 호출 → 약관 제약 없음, 무료·무제한.
// 로컬 에이전트가 본인 PC의 Ollama(http://localhost:11434)로 자기 자료 처리.
export class OllamaProvider implements Provider {
  providerKey = "ollama" as const;
  private tokIn = 0;
  private tokOut = 0;
  constructor(
    private baseUrl: string,
    public model: string,
  ) {}

  usage() {
    return { input: this.tokIn, output: this.tokOut };
  }

  private async json(prompt: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        format: "json", // JSON 강제
        options: { temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(180_000), // 로컬 모델은 느릴 수 있음
    });
    if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as any;
    this.tokIn += j.prompt_eval_count ?? 0;
    this.tokOut += j.eval_count ?? 0;
    return extractJson(j.message?.content || "{}");
  }

  async analyzeExtract(document: string, industries: string[], ctx: MergeCtx): Promise<AnalyzeExtractResult> {
    const o = await this.json(buildAnalyzeExtractPrompt(document, industries, ctx));
    const meta = parseMeta(o, industries);
    return { meta, frame: parseFrame(o, { docType: meta.docType, lenses: ctx.lenses, jobRole: ctx.jobRole }), numbers: parseNumbers(o.numbers) };
  }

  async rollup(industryName: string, period: string, digest: string): Promise<RollupResult> {
    return parseRollup(await this.json(buildRollupPrompt(industryName, period, digest)));
  }

  async judgeTriggers(repText: string, triggers: string[]): Promise<TriggerJudgment[]> {
    if (triggers.length === 0) return [];
    const o = await this.json(buildTriggerJudgePrompt(repText, triggers));
    return parseTriggerJudge(o).filter((h) => h.index < triggers.length);
  }
}
