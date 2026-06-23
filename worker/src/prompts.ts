// 산업리포트 정해진 틀 + 렌즈 페르소나 + 가드레일. PoC(poc/poc_extract.py)에서 이식.

export const FRAME_KEYS = ["new_biz", "core_biz_structural", "core_biz_short", "overseas", "insight"] as const;

export const FRAME_DESC = `다음 항목으로만 정리(JSON 키):
- new_biz (🚀 신사업): 새로 진출/키우는 영역. 없으면 "본업 리포트(신사업 약함)".
- core_biz_structural (🏭 기존사업-구조적): 본업 업황의 구조적 변화.
- core_biz_short (🏭 기존사업-단기): 단기 변동 요인.
- overseas (🌍 해외상황): 해외 시장/경쟁사/정책 동향과 국내 영향.
- insight (🎯 인사이트): 렌즈 목적에 맞는 한두 줄.
그리고 numbers: 기억할 핵심 수치 5~10개. 각 항목 {label, value, page_no}. page_no 는 '=== p.N ===' 의 N.`;

export const LENSES: Record<string, string> = {
  job: "너는 산업 구조·비즈니스 모델·시장 흐름을 보는 PM 취업 준비자다. 종목보다 산업 구조와 사고 프레임을 비중 있게 뽑는다.",
  invest:
    "너는 실적·밸류에이션·수급·리스크를 보는 투자 참고자다. 수혜/피해 기업, 밸류체인, 모멘텀, 반대 시나리오를 뽑는다. insight 끝에 '※ 투자조언 아님, 참고용'을 붙인다.",
};

export const GUARDRAIL =
  "리포트에 없는 숫자·전망을 절대 지어내지 마라. 불확실하면 '명시 없음'이라 쓴다. " +
  "핵심숫자에는 반드시 출처 페이지(page_no)를 단다. 한국어, em dash 사용 금지.";

// 취업 렌즈 직무별 추출 관점(키는 @reportlens/db JOB_ROLES 와 일치).
export const JOB_ROLE_PERSONA: Record<string, string> = {
  pm: "산업 구조·비즈니스 모델·문제정의·기회를 본다.",
  strategy: "시장 규모·경쟁구도·진입/확장 기회·M&A를 본다.",
  marketing: "수요·소비 트렌드·타겟·브랜드/채널을 본다.",
  sales: "고객사·수요처·밸류체인 거래관계·영업 기회를 본다.",
  data: "핵심 지표·수치 추세·검증할 가설을 본다.",
  research: "실적·밸류에이션·수급·리스크를 애널리스트 관점으로 본다.",
  finance: "실적·현금흐름·자본배분·IR 포인트를 본다.",
  consulting: "구조적 이슈·프레임워크·시사점을 본다.",
  policy: "규제·정책·정부 지원·공공 영향을 본다.",
  legal: "규제 변화·컴플라이언스·법적 리스크를 본다.",
  scm: "공급망·원자재·생산·재고·물류를 본다.",
  media: "뉴스 가치·이슈·헤드라인·맥락을 본다.",
  hr: "채용 동향·인력 수요·직무 변화·조직을 본다.",
  dev: "기술 동향·아키텍처·기술 도입·R&D를 본다.",
  etc: "산업 기초 이해·핵심 개념을 쉽게 설명한다.",
};

// 렌즈 페르소나. 취업(job)은 직무까지 반영.
export function lensPersona(lensKey: string, jobRole?: string): string {
  if (lensKey === "job") {
    const role = jobRole && JOB_ROLE_PERSONA[jobRole] ? ` (직무: ${jobRole} - ${JOB_ROLE_PERSONA[jobRole]})` : "";
    return `${LENSES.job}${role}`;
  }
  return LENSES[lensKey] ?? `너는 ${lensKey} 관점의 분석가다.`;
}

// 문서 타입별 추출 보정 힌트.
export function docTypeHint(docType?: string): string {
  if (docType === "company") return "이 문서는 기업 리포트다. 해당 기업 중심으로 정리하되 산업 맥락도 짚는다.";
  if (docType === "news") return "이 문서는 경제뉴스다. 핵심 사실과 산업 영향 위주로 간결히 정리한다.";
  return "이 문서는 산업 리포트다.";
}

// 분류 프롬프트(산업 + 문서타입). industries = 카탈로그 후보군.
export function buildClassifyPrompt(document: string, industries: string[]): string {
  return (
    `아래 문서를 분류하라. JSON 으로만 답한다.\n` +
    `1) industry: 다음 후보 중 가장 가까운 하나의 정확한 이름. [${industries.join(", ")}]\n` +
    `2) doc_type: 'industry'(산업 리포트) | 'company'(특정 기업 리포트) | 'news'(경제뉴스) 중 하나.\n` +
    `출력 형태: {"industry":"<후보 중 하나>","doc_type":"industry|company|news"}\n\n` +
    `--- 문서(일부) ---\n${document.slice(0, 4000)}`
  );
}
