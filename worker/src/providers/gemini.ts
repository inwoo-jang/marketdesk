import { GoogleGenAI } from "@google/genai";
import type { Provider, ExtractedEntry, ExtractedNumber, DocMeta, ExtractCtx, DocType } from "./types.js";
import type { EntryFrame } from "@reportlens/db";
import { buildAnalyzePrompt, buildExtractPrompt } from "../prompts.js";

// 기본 프로바이더. MVP 는 단일 호출(JSON). TODO 캐스케이드: Flash 초벌 → Pro 검증.
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
    const text = res.text ?? "{}";
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      const s = text.indexOf("{");
      const e = text.lastIndexOf("}");
      return s >= 0 && e > s ? (JSON.parse(text.slice(s, e + 1)) as Record<string, unknown>) : {};
    }
  }

  async analyze(document: string, industries: string[]): Promise<DocMeta> {
    const o = await this.json(buildAnalyzePrompt(document, industries), 400);
    const dt = o.doc_type;
    const docType: DocType = dt === "company" || dt === "news" ? dt : "industry";
    const list = Array.isArray(o.industries)
      ? o.industries.filter((x): x is string => typeof x === "string" && industries.includes(x)).slice(0, 3)
      : [];
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    return { title: str(o.title), pubDate: str(o.pub_date), summary: str(o.summary), docType, industries: list };
  }

  async extract(document: string, ctx: ExtractCtx): Promise<ExtractedEntry> {
    const o = await this.json(buildExtractPrompt(document, ctx), 4096);
    return { frame: parseFrame(o, ctx), numbers: parseNumbers(o.numbers) };
  }
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function parseFrame(o: Record<string, unknown>, ctx: ExtractCtx): EntryFrame {
  const facts = (o.facts ?? {}) as Record<string, unknown>;
  const persp = (o.perspectives ?? {}) as Record<string, unknown>;
  const frame: EntryFrame = {
    summary: str(o.summary),
    facts: { what: str(facts.what), numbers: str(facts.numbers), sourceDate: str(facts.sourceDate) },
    drivers: arr(o.drivers),
    risks: arr(o.risks),
    perspectives: {},
    sources: Array.isArray(o.sources)
      ? o.sources
          .map((s) => (s ?? {}) as Record<string, unknown>)
          .map((s) => ({ item: str(s.item) ?? "", source: str(s.source) ?? "", date: str(s.date) ?? "" }))
      : [],
  };
  if (ctx.lenses.includes("invest") && persp.investment) {
    const i = persp.investment as Record<string, unknown>;
    frame.perspectives!.investment = {
      valuation: str(i.valuation),
      points: arr(i.points),
      downside: arr(i.downside),
      opinion: str(i.opinion),
    };
  }
  if (ctx.lenses.includes("job") && persp.career) {
    const c = persp.career as Record<string, unknown>;
    frame.perspectives!.career = {
      direction: str(c.direction),
      jobFit: str(c.jobFit),
      aiInsight: str(c.aiInsight),
      interviewHooks: arr(c.interviewHooks),
      motivation: str(c.motivation),
    };
  }
  return frame;
}

function parseNumbers(v: unknown): ExtractedNumber[] {
  if (!Array.isArray(v)) return [];
  return v.map((n) => {
    const o = (n ?? {}) as Record<string, unknown>;
    const page = o.page_no ?? o.pageNo;
    return {
      label: str(o.label) ?? "",
      value: str(o.value) ?? "",
      pageNo: typeof page === "number" ? page : page != null ? Number(page) || null : null,
    };
  });
}
