import type { EntryFrame } from "@reportlens/db";
import type { DocMeta, DocType, ExtractCtx, ExtractedNumber } from "./types.js";

// LLM JSON 응답 공용 파서(Gemini·Claude 공유).

export function extractJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  const body = s >= 0 && e > s ? cleaned.slice(s, e + 1) : cleaned;
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    // 폴백: 문자열 값 안의 실제 줄바꿈/탭을 공백으로 치환해 재시도(모델이 멀티라인 string 을 낸 경우)
    try {
      return JSON.parse(body.replace(/[\r\n\t]+/g, " ")) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function parseMeta(o: Record<string, unknown>, industries: string[]): DocMeta {
  const dt = o.doc_type;
  const docType: DocType = dt === "company" || dt === "news" ? dt : "industry";
  const list = Array.isArray(o.industries)
    ? o.industries.filter((x): x is string => typeof x === "string" && industries.includes(x)).slice(0, 3)
    : [];
  return {
    title: str(o.title) ?? null,
    pubDate: str(o.pub_date) ?? null,
    summary: str(o.summary) ?? null,
    docType,
    industries: list,
  };
}

export function parseFrame(o: Record<string, unknown>, ctx: ExtractCtx): EntryFrame {
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

export function parseNumbers(v: unknown): ExtractedNumber[] {
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
