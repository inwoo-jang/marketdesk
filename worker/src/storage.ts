import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "./env.js";

// 스토리지 읽기 추상화. 로컬은 디스크, 운영은 S3 다운로드로 교체.
export async function readUpload(fileKey: string): Promise<Uint8Array> {
  if (env.storageDriver === "s3") {
    throw new Error("S3 스토리지는 아직 미구현(로컬은 STORAGE_DRIVER=local).");
  }
  const abs = join(env.uploadDir, fileKey);
  return new Uint8Array(await readFile(abs));
}
