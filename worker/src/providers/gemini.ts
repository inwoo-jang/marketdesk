import { GoogleGenAI } from "@google/genai";
import type { Provider, ExtractedEntry, ExtractedNumber, DocMeta, ExtractCtx, DocType } from "./types.js";
import { FRAME_DESC, GUARDRAIL, lensPersona, docTypeHint, buildAnalyzePrompt } from "../prompts.js";

// 기본 프로바이더. MVP 는 단일 Flash 호출(JSON 출력).
// TODO(캐스케이드): Flash 초벌 추출 → Pro 로 핵심요약/검증 재호출(비용·품질 균형).
export class GeminiProvider implements Provider {
  providerKey = "gemini" as const;
  private ai: GoogleGenAI;
  constructor(
    apiKey: string,
    public model: string,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async analyze(document: string, industries: string[]): Promise<DocMeta> {
    const res = await this.ai.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts: [{ text: buildAnalyzePrompt(document, industries) }] }],
      config: { responseMimeType: "application/json", maxOutputTokens: 400 },
    });
    try {
      const o = JSON.parse(res.text ?? "{}") as Record<string, unknown>;
      const dt = o.doc_type;
      const docType: DocType = dt === "company" || dt === "news" ? dt : "industry";
      const list = Array.isArray(o.industries)
        ? o.industries.filter((x): x is string => typeof x === "string" && industries.includes(x)).slice(0, 3)
        : [];
      const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
      return {
        title: str(o.title),
        pubDate: str(o.pub_date),
        summary: str(o.summary),
        docType,
        industries: list,
      };
    } catch {
      return { title: null, pubDate: null, summary: null, docType: "industry", industries: [] };
    }
  }

  async extract(document: string, lensKey: string, ctx?: ExtractCtx): Promise<ExtractedEntry> {
    const system = `${lensPersona(lensKey, ctx?.jobRole)}\n${docTypeHint(ctx?.docType)}\n\n${GUARDRAIL}`;
    const user =
      `아래는 문서 전문이다(페이지는 '=== p.N ===' 로 구분).\n` +
      `${lensKey} 렌즈로 아래 틀에 맞춰 JSON 으로만 답하라.\n\n${FRAME_DESC}\n\n` +
      `출력 JSON 형태: {"frame":{"new_biz":"","core_biz_structural":"","core_biz_short":"","overseas":"","insight":""},` +
      `"numbers":[{"label":"","value":"","page_no":1}]}\n\n--- 리포트 ---\n${document}`;

    const res = await this.ai.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts: [{ text: user }] }],
      config: { systemInstruction: system, responseMimeType: "application/json", maxOutputTokens: 4096 },
    });

    const text = res.text ?? "{}";
    return parseExtraction(text);
  }
}

function parseExtraction(text: string): ExtractedEntry {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    // JSON 외 텍스트가 섞이면 첫 { ~ 마지막 } 구간만 시도
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    raw = s >= 0 && e > s ? JSON.parse(text.slice(s, e + 1)) : {};
  }
  const obj = (raw ?? {}) as Record<string, unknown>;
  const frameIn = (obj.frame ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const numbersIn = Array.isArray(obj.numbers) ? obj.numbers : [];
  const numbers: ExtractedNumber[] = numbersIn.map((n) => {
    const o = (n ?? {}) as Record<string, unknown>;
    const page = o.page_no ?? o.pageNo;
    return {
      label: str(o.label) ?? "",
      value: str(o.value) ?? "",
      pageNo: typeof page === "number" ? page : page != null ? Number(page) || null : null,
    };
  });
  return {
    frame: {
      new_biz: str(frameIn.new_biz),
      core_biz_structural: str(frameIn.core_biz_structural),
      core_biz_short: str(frameIn.core_biz_short),
      overseas: str(frameIn.overseas),
      insight: str(frameIn.insight),
    },
    numbers,
  };
}
