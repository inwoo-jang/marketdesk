// 공유 프리셋(코드 상수). api(직무 노출)·worker(추출 페르소나)·seed 가 같은 키를 쓴다.

// 취업 렌즈 직무 15종. key 는 user_lenses.config.jobRole 에 저장.
export const JOB_ROLES = [
  { key: "pm", label: "기획/PM" },
  { key: "strategy", label: "전략/사업개발" },
  { key: "marketing", label: "마케팅/브랜드" },
  { key: "sales", label: "영업/세일즈" },
  { key: "data", label: "데이터 분석" },
  { key: "research", label: "리서치/애널리스트" },
  { key: "finance", label: "재무/IR" },
  { key: "consulting", label: "컨설팅" },
  { key: "policy", label: "정책/공공" },
  { key: "legal", label: "법무/규제대응" },
  { key: "scm", label: "구매/SCM" },
  { key: "media", label: "기자/미디어" },
  { key: "hr", label: "인사/HR·채용" },
  { key: "dev", label: "개발/기술기획" },
  { key: "etc", label: "기타(교육·취준생 등)" },
] as const;

export type JobRoleKey = (typeof JOB_ROLES)[number]["key"];

// 산업 표준 22 세트(네이버 증권 업종 계열 통합). 워커 AI 매칭의 후보군 = 이 name 들.
export const STANDARD_INDUSTRIES = [
  { name: "반도체", slug: "semiconductor", iconColor: "#3B82F6" },
  { name: "AI", slug: "ai", iconColor: "#8B5CF6" },
  { name: "IT·소프트웨어", slug: "it-software", iconColor: "#6366F1" },
  { name: "디스플레이·전기전자", slug: "display-electronics", iconColor: "#0EA5E9" },
  { name: "게임", slug: "game", iconColor: "#22C55E" },
  { name: "미디어·광고", slug: "media-ad", iconColor: "#EC4899" },
  { name: "통신", slug: "telecom", iconColor: "#14B8A6" },
  { name: "자동차", slug: "auto", iconColor: "#4F46E5" },
  { name: "조선·기계", slug: "ship-machinery", iconColor: "#64748B" },
  { name: "운송·물류", slug: "logistics", iconColor: "#0D9488" },
  { name: "철강·금속", slug: "steel-metal", iconColor: "#78716C" },
  { name: "석유·화학", slug: "chemical", iconColor: "#A855F7" },
  { name: "에너지·유틸리티", slug: "energy-utility", iconColor: "#F59E0B" },
  { name: "건설·건자재", slug: "construction", iconColor: "#D97706" },
  { name: "섬유·의류", slug: "textile-apparel", iconColor: "#F43F5E" },
  { name: "화장품", slug: "cosmetics", iconColor: "#FB7185" },
  { name: "음식료·담배", slug: "food-bev", iconColor: "#84CC16" },
  { name: "제약·바이오", slug: "pharma-bio", iconColor: "#10B981" },
  { name: "유통·홈쇼핑", slug: "retail", iconColor: "#06B6D4" },
  { name: "여행·교육", slug: "travel-edu", iconColor: "#F97316" },
  { name: "금융", slug: "finance", iconColor: "#2563EB" },
  { name: "기타", slug: "etc", iconColor: "#94A3B8" },
] as const;
