// 해외 기업 국가·대형 기업 판별 공용(흐름보드·기업리포트에서 함께 사용).
export const normco = (s: string) => s.replace(/\s/g, "").toLowerCase();

// 한글 음차돼 국내로 오인되는 대표 해외 기업 → 국가
const FOREIGN_BY_COUNTRY: Record<string, string[]> = {
  미국: ["애플", "엔비디아", "인텔", "마이크론", "퀄컴", "브로드컴", "에이엠디", "amd", "advanced micro devices", "마벨", "텍사스인스트루먼트", "온세미", "램리서치", "어플라이드머티리얼즈", "케이엘에이", "알파벳", "구글", "아마존", "마이크로소프트", "마소", "메타", "페이스북", "테슬라", "넷플릭스", "디즈니", "오라클", "세일즈포스", "어도비", "시스코", "아이비엠", "ibm", "우버", "에어비앤비", "팔란티어", "스타벅스", "나이키", "코카콜라", "보잉", "록히드마틴", "포드", "지엠"],
  대만: ["티에스엠씨", "tsmc"],
  네덜란드: ["에이에스엠엘", "asml"],
  일본: ["도쿄일렉트론", "소니", "도요타", "혼다", "닛산", "니콘"],
  독일: ["인피니언", "폭스바겐", "bmw", "벤츠"],
  영국: ["arm", "암홀딩스"],
  중국: ["화웨이", "샤오미", "비야디", "byd", "알리바바", "텐센트", "니오"],
};

export const FOREIGN_COMPANY_COUNTRY: Record<string, string> = Object.fromEntries(
  Object.entries(FOREIGN_BY_COUNTRY).flatMap(([country, names]) => names.map((n) => [normco(n), country])),
);

// 계열에 없어도 자기 이름으로 별도 칩을 갖는 대형 기업(= 알려진 해외 대기업)
export const MAJOR_STANDALONE = new Set(Object.keys(FOREIGN_COMPANY_COUNTRY));

export const COMPANY_ALIASES: Record<string, string[]> = {
  AMD: ["AMD", "에이엠디", "Advanced Micro Devices"],
};

export const KNOWN_COMPANY_CHIPS = Object.keys(COMPANY_ALIASES);

export function companyAliases(name: string): string[] {
  const n = normco(name);
  const found = Object.entries(COMPANY_ALIASES).find(
    ([canonical, aliases]) => normco(canonical) === n || aliases.some((alias) => normco(alias) === n),
  );
  return found ? found[1] : [name];
}

// 해외 기업 국가(알려진 곳). 라틴 표기(한글 없음) 미상은 '해외', 국내면 빈 문자열. (목록 헤더용)
export function foreignCountryOf(co?: string | null): string {
  if (!co) return "";
  const known = FOREIGN_COMPANY_COUNTRY[normco(co)];
  if (known) return known;
  return /[가-힣]/.test(co) ? "" : "해외"; // 라틴 표기 미상 → 해외
}

// 해외 기업 여부(계열 매핑 안 된 라틴명 또는 알려진 해외 기업)
export function isForeignName(co: string): boolean {
  return FOREIGN_COMPANY_COUNTRY[normco(co)] !== undefined || !/[가-힣]/.test(co);
}

// 이름에 국가 괄호 붙이기(알려진 해외 기업만 — SK/LG 등 국내 라틴명 오표기 방지). '애플' → '애플 (미국)'
export function withCountry(co: string): string {
  const c = FOREIGN_COMPANY_COUNTRY[normco(co)];
  return c ? `${co} (${c})` : co;
}

// 알려진 해외 기업의 국가만(회색 서브문구 렌더용). 없으면 빈 문자열 → 국가 표기 안 함.
export function knownCountryOf(co: string): string {
  return FOREIGN_COMPANY_COUNTRY[normco(co)] ?? "";
}
