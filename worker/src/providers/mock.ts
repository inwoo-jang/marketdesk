import type { Provider, ExtractedEntry, ExtractedNumber, Classification, ExtractCtx, DocType } from "./types.js";

// 로컬 개발용. API 키 없이 파이프라인 전체(분류→파싱→추출→가드레일→저장)를 돌려보기 위한 결정적 mock.
// 문서에서 실제 숫자를 뽑아 page_no 와 함께 반환 → 가드레일 검증이 의미있게 동작.
// 일부러 환각 수치 1개를 섞어 가드레일이 verified=false 로 거르는 것도 보여준다.
export class MockProvider implements Provider {
  providerKey = null;
  model = "mock";

  // 키워드 기반 산업 매칭 + 간단한 문서타입 추정.
  async classify(document: string, industries: string[]): Promise<Classification> {
    const text = document.replace(/\s+/g, " ");
    const hints: Record<string, string[]> = {
      반도체: ["반도체", "HBM", "D램", "파운드리", "메모리"],
      AI: ["인공지능", "AI", "LLM", "생성형", "GPU"],
      "석유·화학": ["석유", "정유", "화학", "WTI", "에틸렌", "정제마진"],
      자동차: ["자동차", "완성차", "전기차", "EV"],
      "제약·바이오": ["제약", "바이오", "임상", "신약"],
      "에너지·유틸리티": ["에너지", "전력", "원유", "가스", "태양광"],
      금융: ["은행", "증권", "보험", "금리", "대출"],
    };
    let industry: string | null = null;
    for (const cand of industries) {
      const kws = hints[cand] ?? [cand];
      if (kws.some((k) => text.includes(k))) {
        industry = cand;
        break;
      }
    }
    if (!industry) industry = industries.includes("기타") ? "기타" : (industries[0] ?? null);
    const docType: DocType = /뉴스|속보|기자/.test(text) ? "news" : "industry";
    return { industry, docType };
  }

  async extract(document: string, lensKey: string, ctx?: ExtractCtx): Promise<ExtractedEntry> {
    const pages = splitPages(document);
    const numbers: ExtractedNumber[] = [];
    for (const { pageNo, text } of pages) {
      const m = text.match(/\d+(?:\.\d+)?\s?(?:%|\$|억|만|원|bbl|p|개)?/g);
      if (m) {
        for (const tok of m.slice(0, 2)) {
          numbers.push({ label: `p${pageNo} 수치`, value: tok.trim(), pageNo });
          if (numbers.length >= 6) break;
        }
      }
      if (numbers.length >= 6) break;
    }
    // 환각 예시(어느 페이지에도 없는 값) → 가드레일이 verified=false 로 걸러야 함
    numbers.push({ label: "환각 테스트", value: "999999억", pageNo: 1 });

    const first = pages[0]?.text.replace(/\s+/g, " ").trim().slice(0, 120) ?? "";
    const roleTag = lensKey === "job" && ctx?.jobRole ? `·${ctx.jobRole}` : "";
    const tag = lensKey === "invest" ? "투자" : lensKey === "job" ? `취업${roleTag}` : lensKey;
    return {
      frame: {
        new_biz: `(mock·${tag}) 신사업 요약: ${first.slice(0, 60)}`,
        core_biz_structural: `(mock) 구조적 변화 요약`,
        core_biz_short: `(mock) 단기 변동 요약`,
        overseas: `(mock) 해외 동향 요약`,
        insight:
          lensKey === "invest"
            ? "(mock) 투자 인사이트 ※ 투자조언 아님, 참고용"
            : `(mock) 취업 인사이트${ctx?.jobRole ? ` - ${ctx.jobRole} 관점` : ""}`,
      },
      numbers,
    };
  }
}

function splitPages(document: string): { pageNo: number; text: string }[] {
  const parts = document.split(/=== p\.(\d+) ===\n/).slice(1);
  const out: { pageNo: number; text: string }[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    out.push({ pageNo: Number(parts[i]), text: parts[i + 1] ?? "" });
  }
  return out;
}
