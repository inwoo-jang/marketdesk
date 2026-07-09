// 리포트 이전/다음 이동용: 목록에서 클릭하는 순간의 '화면 순서'를 스냅샷으로 저장.
// 필터·목록·메뉴마다 순서가 달라서, 클릭 시점의 실제 표시 순서를 그대로 쓴다.
const KEY = "reportNav";

export function saveReportNav(ids: string[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    // 무시
  }
}

export function loadReportNav(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// 클릭 시 DOM 에 보이는 모든 리포트 카드([data-report-id])를 표시 순서대로 수집해 저장.
export function snapshotReportNav() {
  if (typeof document === "undefined") return;
  const ids = [...document.querySelectorAll("[data-report-id]")]
    .map((el) => el.getAttribute("data-report-id"))
    .filter((x): x is string => !!x);
  if (ids.length > 0) saveReportNav(ids);
}
