import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { securities } from "@reportlens/db";
import { db } from "./db.js";

// KIS 공식 배포 종목 마스터(.mst) → securities 적재. 국내 이름→코드 자동 매핑.
// 공개 상장정보(거래소 공식 배포)라 크롤링 제한 대상 아님. 재실행 안전(upsert).
// 실행: pnpm --filter @reportlens/worker ingest:securities

const SOURCES = [
  { url: "https://new.real.download.dws.co.kr/common/master/kospi_code.mst.zip", market: "KOSPI", tail: 228 },
  { url: "https://new.real.download.dws.co.kr/common/master/kosdaq_code.mst.zip", market: "KOSDAQ", tail: 222 },
];

// 해외 마스터(.cod): 탭 구분. col[2]=거래소코드(EXCD), col[4]=티커, col[6]=한글명, col[7]=영문명.
const OVERSEAS = [
  { url: "https://new.real.download.dws.co.kr/common/master/nasmst.cod.zip", excd: "NAS" }, // 나스닥
  { url: "https://new.real.download.dws.co.kr/common/master/nysmst.cod.zip", excd: "NYS" }, // 뉴욕
  { url: "https://new.real.download.dws.co.kr/common/master/amsmst.cod.zip", excd: "AMS" }, // 아멕스
];

// 매칭용 정규화: 공백·특수문자 제거 + 소문자.
export const normName = (s: string): string => s.replace(/[\s()·.,\-&]/g, "").toLowerCase();

async function loadMarket(url: string, market: string, tail: number): Promise<number> {
  const res = await fetch(url);
  if (res.status !== 200) throw new Error(`${market} 마스터 다운로드 실패: ${res.status}`);
  const zipPath = path.join(tmpdir(), `md_${market}.zip`);
  writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  // .mst.zip 안에 단일 .mst. unzip -p 로 stdout 추출(EUC-KR).
  const raw: Buffer = execFileSync("unzip", ["-p", zipPath], { maxBuffer: 64 * 1024 * 1024 });
  rmSync(zipPath, { force: true });
  const txt = new TextDecoder("euc-kr").decode(raw);

  const rows = txt
    .split("\n")
    .filter(Boolean)
    .map((row) => {
      const rf = row.slice(0, row.length - tail);
      const code = rf.slice(0, 9).trim();
      const name = rf.slice(21).trim();
      return { code, name };
    })
    .filter((r) => /^\d{6}$/.test(r.code) && r.name);

  // 배치 upsert(500개씩)
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({
      code: r.code,
      name: r.name,
      nameNorm: normName(r.name),
      market,
      isOverseas: false,
    }));
    await db
      .insert(securities)
      .values(chunk)
      .onConflictDoUpdate({
        target: [securities.code, securities.market],
        set: { name: sql`excluded.name`, nameNorm: sql`excluded.name_norm` },
      });
  }
  return rows.length;
}

async function loadOverseas(url: string, excd: string): Promise<number> {
  const res = await fetch(url);
  if (res.status !== 200) throw new Error(`${excd} 해외 마스터 다운로드 실패: ${res.status}`);
  const zipPath = path.join(tmpdir(), `md_${excd}.zip`);
  writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  const raw: Buffer = execFileSync("unzip", ["-p", zipPath], { maxBuffer: 128 * 1024 * 1024 });
  rmSync(zipPath, { force: true });
  const txt = new TextDecoder("euc-kr").decode(raw);

  const rows = txt
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const c = line.split("\t");
      const code = (c[4] ?? "").trim(); // 티커
      const kor = (c[6] ?? "").trim();
      const eng = (c[7] ?? "").trim();
      return { code, name: kor || eng, kor, eng };
    })
    // 티커는 영문/숫자/점, 이름 있는 것만
    .filter((r) => r.code && /^[A-Za-z0-9.]{1,10}$/.test(r.code) && r.name);

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({
      code: r.code,
      name: r.name,
      // 한글·영문 모두 검색되게 정규화 결합
      nameNorm: normName(r.kor) + normName(r.eng),
      market: excd,
      isOverseas: true,
      excd,
    }));
    await db
      .insert(securities)
      .values(chunk)
      .onConflictDoUpdate({
        target: [securities.code, securities.market],
        set: { name: sql`excluded.name`, nameNorm: sql`excluded.name_norm`, isOverseas: sql`excluded.is_overseas`, excd: sql`excluded.excd` },
      });
  }
  return rows.length;
}

async function main() {
  let total = 0;
  for (const s of SOURCES) {
    const n = await loadMarket(s.url, s.market, s.tail);
    console.log(`${s.market}: ${n}종목 적재`);
    total += n;
  }
  for (const s of OVERSEAS) {
    const n = await loadOverseas(s.url, s.excd);
    console.log(`${s.excd}(해외): ${n}종목 적재`);
    total += n;
  }
  console.log(`종목 마스터 적재 완료: 총 ${total}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("종목 마스터 적재 실패:", e);
  process.exit(1);
});
