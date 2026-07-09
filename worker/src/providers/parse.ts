import { jsonrepair } from "jsonrepair";
import type { EntryFrame } from "@reportlens/db";
import type { DocMeta, DocType, ExtractCtx, ExtractedNumber, RollupResult, RollupFact, TriggerJudgment } from "./types.js";

// LLM JSON 응답 공용 파서(Gemini·Claude 공유).

export function extractJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  const body = s >= 0 && e > s ? cleaned.slice(s, e + 1) : cleaned;
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    // 폴백1: 줄바꿈/탭 공백화 후 재시도
    try {
      return JSON.parse(body.replace(/[\r\n\t]+/g, " ")) as Record<string, unknown>;
    } catch {
      // 폴백2: jsonrepair 로 견고 복구(문자열 내 따옴표·trailing comma 등 LLM 흔한 깨짐)
      try {
        return JSON.parse(jsonrepair(body)) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
  }
}

// 채움 문구(명시 없음/해당 없음/N/A 등)를 담은 절을 제거. UI 가 빈 값에 placeholder 를 따로 표시하므로 본문엔 불필요.
const FILLER = /\s*[^.,;:·()]*?(?:명시\s*없음|해당\s*없음|정보\s*없음|언급\s*없음|확인\s*불가|N\s*\/?\s*A)\.?/gi;
// 문자열 정리: 마크다운 볼드(**) 제거 + 채움 문구 절 제거 + 양끝 구분자 정리. 결과가 비면 undefined.
const clean = (s: string) =>
  s
    .replace(/\*\*/g, "")
    .replace(FILLER, "")
    .replace(/([,;·])(?:\s*[,;·])+/g, "$1") // 연속 구분자 정리(절 제거 후 남는 ,, 등)
    .replace(/^[\s,.;·]+|[\s,.;·]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
const str = (v: unknown) => {
  if (typeof v !== "string") return undefined;
  const c = clean(v);
  return c ? c : undefined;
};
const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map(clean).filter(Boolean) : [];

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
    company: str(o.company) ?? null,
  };
}

export function parseFrame(o: Record<string, unknown>, ctx: ExtractCtx): EntryFrame {
  const facts = (o.facts ?? {}) as Record<string, unknown>;
  const persp = (o.perspectives ?? {}) as Record<string, unknown>;
  const frame: EntryFrame = {
    highlight: str(o.highlight),
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

export function parseRollup(o: Record<string, unknown>): RollupResult {
  const facts: RollupFact[] = Array.isArray(o.facts)
    ? o.facts
        .map((f) => (f ?? {}) as Record<string, unknown>)
        .map((f) => ({
          type: f.type === "conflict" ? ("conflict" as const) : f.type === "trigger" ? ("trigger" as const) : ("common" as const),
          content: str(f.content) ?? "",
        }))
        .filter((f) => f.content)
    : [];
  return { oneLiner: str(o.one_liner) ?? str(o.oneLiner) ?? "", facts };
}

export function parseTriggerJudge(o: Record<string, unknown>): TriggerJudgment[] {
  if (!Array.isArray(o.hits)) return [];
  return o.hits
    .map((h) => (h ?? {}) as Record<string, unknown>)
    .map((h) => ({ index: Number(h.i), basis: str(h.basis) ?? "" }))
    .filter((h) => Number.isInteger(h.index) && h.index >= 0);
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
