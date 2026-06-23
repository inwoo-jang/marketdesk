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

export function lensPersona(lensKey: string): string {
  return LENSES[lensKey] ?? `너는 ${lensKey} 관점의 분석가다.`;
}
