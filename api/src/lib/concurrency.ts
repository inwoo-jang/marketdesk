// 제한 병렬 map: 동시 실행을 limit 개로 묶어 처리.
// 종목마다 KIS 호출을 순차로 기다리면 종목 수만큼 느려지므로, 초당 유량 제한을
// 안 넘길 만큼만 병렬화해 대기 시간을 줄인다.
export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i], i);
  });
  await Promise.all(workers);
  return out;
}
