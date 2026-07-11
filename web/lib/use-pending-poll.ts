import { useEffect, useRef } from "react";
import { api } from "@/lib/api";

// 처리 중(pending/parsing) 항목이 있을 때만, 무거운 목록 대신 경량 pending-count 만 폴링한다.
// 값이 바뀌면(무언가 완료·추가) onSettle 로 화면을 한 번 다시 불러오고, 백오프로 서버 부담을 줄인다.
//   active   : 이 화면에 현재 처리 중 항목이 있는가(각 화면 데이터로 판단)
//   onSettle : 변화 감지 시 실행할 전체 리로드
export function usePendingPoll(active: boolean, onSettle: () => void) {
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let delay = 2500; // 시작 간격
    let prev: number | null = null;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (stopped) return;
      const c = await api.pendingCount().catch(() => null);
      if (stopped) return;
      if (c) {
        const total = c.reports + c.rollups;
        if (prev !== null && total !== prev) {
          onSettleRef.current(); // 무언가 완료/추가됨 → 한 번 전체 갱신
          delay = 2500; // 활동 직후엔 다시 촘촘히 확인
        } else {
          delay = Math.min(Math.round(delay * 1.5), 15000); // 조용하면 점점 느슨하게(최대 15초)
        }
        prev = total;
      } else {
        delay = Math.min(Math.round(delay * 1.5), 15000);
      }
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, delay);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [active]);
}
