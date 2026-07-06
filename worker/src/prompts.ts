// 추출 프롬프트: 문서타입(산업/기업/뉴스) 공통 틀 + 관점 레이어(투자/취업). PoC·사용자 템플릿 계승.

export const GUARDRAIL =
  "리포트에 없는 숫자·전망을 절대 지어내지 마라. 리포트에 없는 항목은 그 값을 비워라(빈 문자열 \"\" 또는 빈 배열 []). " +
  "'명시 없음'·'해당 없음'·'정보 없음'·'N/A' 같은 채움 문구를 절대 쓰지 마라. " +
  "핵심숫자에는 반드시 출처 페이지(page_no)를 단다. " +
  "**출력은 반드시 한국어로 작성한다(원문이 영어·외국어여도 한국어로 번역·요약).** em dash 사용 금지.";

// 모든 추출 응답에 강제하는 엄격 JSON 규칙(특히 CLI 프로바이더 파싱 안정화).
export const STRICT_JSON =
  "\n\n반드시 유효한 JSON 객체 하나만 출력하라. 코드펜스(```)·설명·머리말 금지. " +
  "문자열 값 안에 실제 줄바꿈을 넣지 말 것(필요하면 마침표로 끊어라).";

// 취업 렌즈 직무별 관점.
export const JOB_ROLE_PERSONA: Record<string, string> = {
  pm: "산업 구조·비즈니스 모델·문제정의·기회",
  strategy: "시장 규모·경쟁구도·진입/확장 기회·M&A",
  marketing: "수요·소비 트렌드·타겟·브랜드/채널",
  sales: "고객사·수요처·밸류체인 거래관계·영업 기회",
  data: "핵심 지표·수치 추세·검증할 가설",
  research: "실적·밸류에이션·수급·리스크(애널리스트)",
  finance: "실적·현금흐름·자본배분·IR",
  consulting: "구조적 이슈·프레임워크·시사점",
  policy: "규제·정책·정부 지원·공공 영향",
  legal: "규제 변화·컴플라이언스·법적 리스크",
  scm: "공급망·원자재·생산·재고·물류",
  media: "뉴스 가치·이슈·헤드라인·맥락",
  hr: "채용 동향·인력 수요·직무 변화·조직",
  dev: "기술 동향·아키텍처·기술 도입·R&D",
  etc: "산업 기초 이해·핵심 개념 쉬운 설명",
};

// 메타 추출 프롬프트(제목·발간일·요약·타입·멀티산업).
export function buildAnalyzePrompt(document: string, industries: string[]): string {
  return (
    `아래 문서의 메타데이터를 추출하라. JSON 으로만 답한다.\n` +
    `1) title: 문서 핵심을 담은 제목(한 줄, 날짜·기자명 등 군더더기 빼고).\n` +
    `2) pub_date: 발간/작성 일자 YYYY-MM-DD. 없으면 null.\n` +
    `3) summary: 한 줄 요약(40자 내외).\n` +
    `4) doc_type: 'industry'(산업 리포트) | 'company'(기업 리포트) | 'news'(경제뉴스).\n` +
    `5) industries: 다음 후보 중 해당하는 것 모두(1~3개) 정확한 이름 배열. [${industries.join(", ")}]\n` +
    `6) company: 특정 기업이 핵심 주제면 그 회사명 1개(예: 삼성전자), 아니면 null.\n` +
    `title·summary 는 반드시 한국어로(원문이 영어·외국어여도 한국어로 번역·요약).\n` +
    `출력: {"title":"","pub_date":null,"summary":"","doc_type":"industry","industries":["..."],"company":null}` +
    STRICT_JSON +
    `\n\n--- 문서(일부) ---\n${document.slice(0, 6000)}`
  );
}

// 문서타입별 ②핵심사실 ③동인 ④리스크 초점.
function docTypeGuide(docType: string): string {
  if (docType === "company")
    return "핵심사실=사업·실적·재무, 동인=경쟁우위·해자, 리스크=약점·악재. 분석 대상은 해당 기업.";
  if (docType === "news")
    return "핵심사실=5W1H(무엇을·숫자·기준일), 동인=배경·이해관계자, 리스크=논란·불확실성. 산업 영향 위주로 간결히.";
  return "핵심사실=시장규모·성장률·구조, 동인=성장드라이버·규제, 리스크=진입장벽·사이클.";
}

// 구조화 분석 프롬프트. 관점(perspectives)은 켠 렌즈만 채운다.
export function buildExtractPrompt(document: string, ctx: { docType: string; lenses: string[]; jobRole?: string }): string {
  const wantInvest = ctx.lenses.includes("invest");
  const wantCareer = ctx.lenses.includes("job");
  const role = ctx.jobRole ? `${ctx.jobRole}(${JOB_ROLE_PERSONA[ctx.jobRole] ?? ctx.jobRole})` : "지정 없음";

  const perspLines: string[] = [];
  if (wantInvest)
    perspLines.push(
      `- investment(투자 관점): valuation(밸류에이션·동종비교), points(상승 트리거 배열), downside(하방 리스크 배열), opinion(매수/관망 등 + 근거, 단정 금지).`,
    );
  if (wantCareer)
    perspLines.push(
      `- career(취업 관점, 직무=${role}): direction(회사·산업 방향성), jobFit(이 직무가 기여할 접점), aiInsight(AI·프로덕트 시사점), interviewHooks(면접/자소서 떡밥 배열), motivation(지원동기 연결 한 문장).`,
    );

  const perspJson =
    (wantInvest ? `"investment":{"valuation":"","points":[],"downside":[],"opinion":""}` : "") +
    (wantInvest && wantCareer ? "," : "") +
    (wantCareer ? `"career":{"direction":"","jobFit":"","aiInsight":"","interviewHooks":[],"motivation":""}` : "");

  return (
    `아래 문서(페이지는 '=== p.N ===' 구분)를 분석해 JSON 으로만 답하라.\n` +
    `${docTypeGuide(ctx.docType)}\n\n` +
    `필드:\n` +
    `- highlight: 이 문서에서 가장 중요한 한 가지(핵심 takeaway). 한 문장, 굵게 강조할 결론.\n` +
    `- summary: 한 줄 요약(60자 내외).\n` +
    `- facts: {what(무엇을, 1문장), numbers(핵심 수치 요약), sourceDate(출처 기준일)}.\n` +
    `- drivers: 동인·맥락 배열(각 항목 완결된 한 문장).\n` +
    `- risks: 리스크·쟁점 배열(각 항목 완결된 한 문장).\n` +
    `- perspectives: 아래 관점만 채운다.\n${perspLines.join("\n")}\n` +
    `- sources: [{item, source, date}] 배열.\n` +
    `- numbers: 핵심 수치 5~10개 [{label(짧은 이름), value, page_no}] (page_no = '=== p.N ===' 의 N).\n\n` +
    `일관성 규칙: 모든 문서를 동일 틀·동일 어조(간결한 평서문)로. 배열 항목은 한 줄씩. 빈 항목은 추측하지 말고 비운다.\n` +
    `출력 JSON: {"highlight":"","summary":"","facts":{"what":"","numbers":"","sourceDate":""},"drivers":[],"risks":[],"perspectives":{${perspJson}},"sources":[],"numbers":[]}\n\n` +
    `${GUARDRAIL}${STRICT_JSON}\n\n--- 문서 ---\n${document}`
  );
}

// 월별 롤업 프롬프트: 한 달 엔트리 모음 → 흐름 한 줄 + 공통/엇갈림. 하위 엔트리만 근거.
export function buildRollupPrompt(industryName: string, period: string, digest: string): string {
  return (
    `아래는 '${industryName}' 산업의 ${period} 한 달간 분석 엔트리 모음이다.\n` +
    `이 엔트리들만 근거로(새 사실·숫자 생성 금지) 이 달의 흐름을 정리하라.\n` +
    `- one_liner: 이 달 이 산업의 흐름 한 줄.\n` +
    `- facts: [{type, content}] 배열. 여러 리포트가 같은 방향이면 type='common'(공통 팩트), 엇갈리면 type='conflict'(엇갈림).\n` +
    `출력 JSON: {"one_liner":"","facts":[{"type":"common","content":""}]}` +
    STRICT_JSON +
    `\n\n--- 엔트리 모음 ---\n${digest}`
  );
}
