import type { Provider, ExtractedEntry, ExtractedNumber, DocMeta, ExtractCtx, DocType, RollupResult } from "./types.js";

// 제목·요약에서 연락처·작성자·SNS·날짜 등 군더더기 제거
function cleanNoise(s: string): string {
  return s
    .replace(/\[[^\]]*\]/g, " ") // [태그]
    .replace(/\S+@\S+\.\S+/g, " ") // 이메일
    .replace(/\d{2,4}[-)]\s?\d{3,4}-\d{4}/g, " ") // 전화번호
    .replace(/https?:\/\/\S+/g, " ") // URL
    .replace(/[가-힣]{2,4}\s?(선임연구원|책임연구원|수석연구원|연구위원|연구원|애널리스트|기자)/g, " ") // 이름+직함
    .replace(/(기자명|선임연구원|책임연구원|수석연구원|연구위원|연구원|애널리스트|기자)/g, " ")
    .replace(/입력\s*20\d{2}[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2}(\s?\d{1,2}:\d{2})?/g, " ")
    .replace(/댓글\s*\d+/g, " ")
    .replace(/(SNS\s*기사보내기|기사보내기|SNS\s*기사|SNS)/g, " ")
    .replace(/[▪•·∙ㆍ|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const INDUSTRY_HINTS: Record<string, string[]> = {
  반도체: ["반도체", "HBM", "D램", "파운드리", "메모리"],
  AI: ["인공지능", "AI", "LLM", "생성형", "GPU"],
  "IT·소프트웨어": ["소프트웨어", "클라우드", "SaaS", "플랫폼"],
  "디스플레이·전기전자": ["디스플레이", "OLED", "전기전자", "휴대폰"],
  "석유·화학": ["석유", "정유", "화학", "WTI", "에틸렌", "정제마진"],
  자동차: ["자동차", "완성차", "전기차", "EV", "현대차", "기아"],
  "제약·바이오": ["제약", "바이오", "임상", "신약"],
  "에너지·유틸리티": ["에너지", "전력", "원유", "가스", "태양광"],
  금융: ["은행", "증권", "보험", "금리", "대출"],
  게임: ["게임", "신작", "MMORPG"],
  통신: ["통신", "5G", "요금제"],
};

// 로컬 개발용. API 키 없이 파이프라인 전체(메타→파싱→추출→가드레일→저장)를 돌려보기 위한 결정적 mock.
// 문서에서 실제 숫자를 뽑아 page_no 와 함께 반환 → 가드레일 검증이 의미있게 동작.
// 일부러 환각 수치 1개를 섞어 가드레일이 verified=false 로 거르는 것도 보여준다.
export class MockProvider implements Provider {
  providerKey = null;
  model = "mock";

  // 메타 추출: 제목(첫 줄)·발간일(정규식)·요약(앞부분)·타입·멀티 산업(키워드 복수 매칭).
  async analyze(document: string, industries: string[]): Promise<DocMeta> {
    const body = document.replace(/=== p\.\d+ ===/g, "").trim();
    const oneLine = body.replace(/\s+/g, " ").trim();
    const firstLine = body.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";

    const matched = industries.filter((cand) => (INDUSTRY_HINTS[cand] ?? [cand]).some((k) => oneLine.includes(k)));
    const list = matched.length > 0 ? matched.slice(0, 3) : industries.includes("기타") ? ["기타"] : [];

    const dateMatch = oneLine.match(/(20\d{2})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})/);
    const pubDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`
      : null;
    const docType: DocType = /뉴스|속보|기자/.test(oneLine) ? "news" : "industry";

    const cleanTitle = cleanNoise(firstLine);
    return {
      title: (cleanTitle || firstLine).slice(0, 50) || null,
      pubDate,
      summary: cleanNoise(oneLine).slice(0, 80) || null,
      docType,
      industries: list,
      company: null,
    };
  }

  async extract(document: string, ctx: ExtractCtx): Promise<ExtractedEntry> {
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
    // 환각 예시(어느 페이지에도 없음) → 가드레일이 verified=false 로 걸러야 함
    numbers.push({ label: "환각 테스트", value: "999999억", pageNo: 1 });

    const oneLine = cleanNoise(document.replace(/=== p\.\d+ ===/g, " "));
    const dt = ctx.docType === "company" ? "기업" : ctx.docType === "news" ? "뉴스" : "산업";
    const frame: ExtractedEntry["frame"] = {
      highlight: `(mock·${dt}) 핵심 한 가지: ${oneLine.slice(0, 40)}`,
      summary: `(mock·${dt}) ${oneLine.slice(0, 60)}`,
      facts: {
        what: `(mock) ${dt} 핵심 사실 요약`,
        numbers: numbers
          .filter((n) => n.label !== "환각 테스트")
          .map((n) => n.value)
          .join(", "),
        sourceDate: "명시 없음",
      },
      drivers: [`(mock) ${dt} 동인·맥락 1`],
      risks: [`(mock) ${dt} 리스크·쟁점 1`],
      perspectives: {},
      sources: [{ item: "본문", source: "업로드 문서", date: "명시 없음" }],
    };
    if (ctx.lenses.includes("invest")) {
      frame.perspectives!.investment = {
        valuation: "(mock) 밸류에이션 명시 없음",
        points: ["(mock) 상승 트리거 1"],
        downside: ["(mock) 하방 리스크 1"],
        opinion: "(mock) 관망 ※ 투자조언 아님, 참고용",
      };
    }
    if (ctx.lenses.includes("job")) {
      const role = ctx.jobRole ?? "직무 미지정";
      frame.perspectives!.career = {
        direction: "(mock) 회사·산업 방향성",
        jobFit: `(mock) ${role} 직무 접점`,
        aiInsight: "(mock) AI·프로덕트 시사점",
        interviewHooks: ["(mock) 면접 떡밥 1"],
        motivation: "(mock) 지원동기 연결 한 문장",
      };
    }
    return { frame, numbers };
  }

  async rollup(industryName: string, period: string, digest: string): Promise<RollupResult> {
    const lines = digest.split("\n").map((l) => l.trim()).filter(Boolean);
    const count = lines.filter((l) => l.startsWith("-")).length || lines.length;
    return {
      oneLiner: `(mock) ${industryName} ${period}: 엔트리 ${count}건 기반 흐름 요약`,
      facts: [
        { type: "common", content: `(mock) ${industryName} 공통 팩트 요약` },
        { type: "conflict", content: `(mock) 리포트 간 엇갈리는 지점 요약` },
      ],
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
