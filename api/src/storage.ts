import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "./env.js";

// 스토리지 추상화. 로컬은 디스크, 운영은 S3(presigned) 로 교체.
// fileKey 는 DB(reports.file_key)에 저장하는 논리 키(사용자별 prefix).
export interface Storage {
  save(userId: string, filename: string, bytes: Uint8Array): Promise<{ fileKey: string; size: number }>;
  remove(fileKey: string): Promise<void>;
}

class LocalStorage implements Storage {
  constructor(private root: string) {}
  async save(userId: string, filename: string, bytes: Uint8Array) {
    const safe = filename.replace(/[^\w.\-가-힣]/g, "_");
    const fileKey = `${userId}/${randomUUID()}-${safe}`;
    const abs = join(this.root, fileKey);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, bytes);
    return { fileKey, size: bytes.byteLength };
  }
  async remove(fileKey: string) {
    await rm(join(this.root, fileKey), { force: true });
  }
}

// 운영 자리: S3 presigned PUT 으로 클라이언트가 직접 업로드 후 fileKey 만 기록.
// class S3Storage implements Storage { ... } (Sprint: 배포 시 구현)

export const storage: Storage =
  env.storageDriver === "s3"
    ? (() => {
        throw new Error("S3 스토리지는 아직 미구현. 배포 시 구현(로컬은 STORAGE_DRIVER=local).");
      })()
    : new LocalStorage(env.uploadDir);
