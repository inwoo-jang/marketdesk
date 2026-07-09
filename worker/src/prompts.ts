// 추출 프롬프트: 문서타입(산업/기업/뉴스) 공통 틀 + 관점 레이어(투자/취업). PoC·사용자 템플릿 계승.

export const GUARDRAIL =
  "리포트에 없는 숫자·전망을 절대 지어내지 마라. 리포트에 없는 항목은 그 값을 비워라(빈 문자열 \"\" 또는 빈 배열 []). " +
  "'명시 없음'·'해당 없음'·'정보 없음'·'N/A' 같은 채움 문구를 절대 쓰지 마라. " +
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

// 분류+분석 통합 프롬프트: 한 번의 호출로 메타(제목·발간일·타입·산업·기업) + 구조화 분석을 함께 뽑는다.
// analyze/extract 2회 호출을 1회로 줄여 문서 중복 전송·왕복을 없앤다. 관점(perspectives)은 켠 렌즈만.
export function buildAnalyzeExtractPrompt(document: string, industries: string[], ctx: { lenses: string[]; jobRole?: string }): string {
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
    `아래 문서(페이지는 '=== p.N ===' 구분)를 한 번에 분석해 JSON 하나로만 답하라.\n` +
    `먼저 문서를 분류(doc_type)하고, 그 유형에 맞는 초점으로 나머지를 채운다.\n\n` +
    `[분류·메타]\n` +
    `- title: 비전문가도 한눈에 아는 쉽고 자연스러운 한국어 한 줄 제목. 애널리스트 약어('1Q26 리뷰'·'연결 현금흐름'·'컨콜'·'가이던스'·'멀티플'·'OP' 등)·날짜·기자명·발행사·시리즈코드('EPS LIVE #218'·'Vol.3'·티커·문서번호) 금지. 예) 나쁨: 'SK 1Q26 리뷰: 하이닉스 연결 현금흐름 부각' → 좋음: 'SK, 하이닉스 실적 덕에 현금흐름 개선'.\n` +
    `- pub_date: 발간/작성 일자 YYYY-MM-DD. 없으면 null.\n` +
    `- doc_type: 'industry'(산업 리포트) | 'company'(기업 리포트) | 'news'(경제뉴스).\n` +
    `- industries: 후보 중 해당하는 것 1~3개 정확한 이름 배열. [${industries.join(", ")}]\n` +
    `- company: 특정 기업이 핵심 주제면 회사명 1개(예: 삼성전자), 아니면 null.\n\n` +
    `[유형별 초점] doc_type 에 맞춰 facts·drivers·risks 를 잡는다.\n` +
    `- industry: 핵심사실=시장규모·성장률·구조, 동인=성장드라이버·규제, 리스크=진입장벽·사이클.\n` +
    `- company: 핵심사실=사업·실적·재무, 동인=경쟁우위·해자, 리스크=약점·악재.\n` +
    `- news: 핵심사실=5W1H(무엇을·숫자·기준일), 동인=배경·이해관계자, 리스크=논란·불확실성. 산업 영향 위주로 간결히.\n\n` +
    `[분석]\n` +
    `- highlight: 가장 중요한 한 가지(핵심 결론). 한 문장.\n` +
    `- summary: 한 줄 요약(40자 내외). 제목·highlight 를 그대로 반복하지 말고 핵심 메시지를 담는다.\n` +
    `- facts: {what(무엇을, 1문장), numbers(핵심 수치 요약), sourceDate(출처 기준일)}.\n` +
    `- drivers: 동인·맥락 배열(각 항목 완결된 한 문장).\n` +
    `- risks: 리스크·쟁점 배열(각 항목 완결된 한 문장).\n` +
    `- perspectives: 아래 관점만 채운다.\n${perspLines.join("\n")}\n` +
    `- sources: [{item, source, date}] 배열.\n\n` +
    `일관성 규칙: 동일 틀·동일 어조(간결한 평서문). 배열 항목은 한 줄씩. 빈 항목은 추측하지 말고 비운다.\n` +
    `출력 JSON: {"title":"","pub_date":null,"doc_type":"industry","industries":[],"company":null,"highlight":"","summary":"","facts":{"what":"","numbers":"","sourceDate":""},"drivers":[],"risks":[],"perspectives":{${perspJson}},"sources":[]}\n\n` +
    `${GUARDRAIL}${STRICT_JSON}\n\n--- 문서 ---\n${document}`
  );
}

// 흐름 위험 신호 발화 판단: 새 자료가 각 신호에 '실제로' 해당하는지 LLM 판단(단어 겹침 오탐 방지).
export function buildTriggerJudgePrompt(repText: string, triggers: string[]): string {
  const list = triggers.map((t, i) => `${i}. ${t}`).join("\n");
  return (
    `아래 '새 자료'가 각 '흐름 위험 신호'에 실제로 해당하는지 판단하라.\n` +
    `자료 본문에 그 신호와 직접 관련된 내용이 있을 때만 해당으로 본다. 같은 단어가 우연히 겹치는 것·주제가 다른데 억지로 잇는 것은 제외.\n` +
    `해당하는 신호만 그 번호(i)와 근거(basis: 자료의 어느 내용이 그 신호의 근거인지 한 문장)를 배열로. 해당 없으면 빈 배열.\n` +
    `출력 JSON: {"hits":[{"i":0,"basis":""}]}` +
    STRICT_JSON +
    `\n\n--- 흐름 위험 신호 ---\n${list}\n\n--- 새 자료 ---\n${repText}`
  );
}

// 월별 롤업 프롬프트: 한 달 엔트리 모음 → 흐름 한 줄 + 공통/엇갈림. 하위 엔트리만 근거.
export function buildRollupPrompt(industryName: string, period: string, digest: string): string {
  return (
    `아래는 '${industryName}'의 ${period} 기간 분석 엔트리(내 리포트·공공) 모음이다.\n` +
    `이 엔트리들만 근거로(새 사실·숫자 생성 금지), '${industryName}' 산업 관점에서 그 기간의 흐름을 종합하라.\n` +
    `- one_liner: 이 기간 '${industryName}' 산업의 핵심 흐름 한 줄. '${period}' 같은 기간 머리말 금지. 짧고 명확하게.\n` +
    `- facts: [{type, content}] 배열. 기사별 요약을 그대로 나열하지 말고, 관련된 내용은 묶어 '${industryName}' 산업 관점의 핵심 흐름으로 종합하라.\n` +
    `  · '${industryName}' 산업에 의미 있는 것 위주. 산업과 직접 관련이 적은 개별 종목 세부·부수 정보(예: 특정 회사의 지엽적 수치, 타 산업 이슈)는 노이즈이니 과감히 제외.\n` +
    `  · 각 항목은 짧고 깔끔한 한 문장(정보 자체만). 절대 금지: '두 리포트 모두', '리포트들은', '~라고 분석/제시/지목한다', 발행사·개수 언급.\n` +
    `  · type='common' = 산업의 핵심 흐름·이슈. type='conflict' = 엇갈리는 지점.\n` +
    `  · type='trigger' = 논리 붕괴 트리거. 지금 이 산업을 떠받치는 지배적 논리(상승/하락 내러티브)가 깨질 관찰 가능한 조건 1~3개.\n` +
    `    반드시 위 엔트리가 언급한 리스크·전제에 근거(새 사실·의견·수치 생성 금지). 매수/매도 의견이 아니라 관측 신호 형태로. 근거 없으면 trigger 는 넣지 말 것.\n` +
    `  · 압축이 핵심: common/conflict 는 합쳐 3~5개(비슷한 건 하나로 합침). 8개씩 잘게 쪼개지 말 것. 각 문장 40자 이내.\n` +
    `출력 JSON: {"one_liner":"","facts":[{"type":"common","content":""},{"type":"trigger","content":""}]}` +
    STRICT_JSON +
    `\n\n--- 엔트리 모음 ---\n${digest}`
  );
}
