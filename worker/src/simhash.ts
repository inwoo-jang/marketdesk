import { createHash } from "node:crypto";

// 본문 텍스트 유사도용 SimHash(64bit). 단어 3-그램 shingle 기반.
// 같은 내용이면 문구가 조금 달라도 Hamming 거리가 작다. 반환: 16자리 hex.
function hash64(s: string): bigint {
  const h = createHash("sha1").update(s).digest();
  let v = 0n;
  for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(h[i]);
  return v;
}

export function simhash(text: string): string {
  const norm = text.toLowerCase().replace(/[^0-9a-z가-힣]+/g, " ").trim();
  const tokens = norm.split(" ").filter(Boolean);
  const shingles: string[] = [];
  for (let i = 0; i < tokens.length; i++) shingles.push(tokens.slice(i, i + 3).join(" "));
  if (shingles.length === 0) return "0000000000000000";
  const acc = new Array<number>(64).fill(0);
  for (const sh of shingles) {
    const h = hash64(sh);
    for (let b = 0; b < 64; b++) acc[b] += (h >> BigInt(b)) & 1n ? 1 : -1;
  }
  let out = 0n;
  for (let b = 0; b < 64; b++) if (acc[b] > 0) out |= 1n << BigInt(b);
  return out.toString(16).padStart(16, "0");
}

export function hamming(a: string, b: string): number {
  let x = BigInt("0x" + a) ^ BigInt("0x" + b);
  let c = 0;
  while (x) {
    c += Number(x & 1n);
    x >>= 1n;
  }
  return c;
}

// SimHash 와 동일한 정규화 기준 토큰 수(짧은 문서 유사판정 제외에 사용).
export function tokenCount(text: string): number {
  return text
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean).length;
}
