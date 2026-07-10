import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

// BYO(본인 API 키) 등 유저 시크릿 암호화(AES-256-GCM). api·worker 공용.
// secret = APP_ENC_KEY(env). 임의 길이 → sha256 으로 32바이트 키 파생.
function keyBuf(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

// 평문 → base64(iv[12] + tag[16] + ciphertext)
export function encryptSecret(secret: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBuf(secret), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

// 위 형식 복호화. 실패 시 예외.
export function decryptSecret(secret: string, blob: string): string {
  const b = Buffer.from(blob, "base64");
  const iv = b.subarray(0, 12);
  const tag = b.subarray(12, 28);
  const ct = b.subarray(28);
  const d = createDecipheriv("aes-256-gcm", keyBuf(secret), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}
