import {
  UPLOAD_MAX_CHUNK_BYTES,
  UPLOAD_MAX_CONCURRENCY,
} from "../../shared/types/upload.js";
export interface UploadManifest {
  name: string;
  size: number;
  fileHash: string;
  chunkSize: number;
  totalChunks: number;
}
export const HASH_PATTERN = /^[a-f0-9]{64}$/;
export const ID_PATTERN = /^[a-f0-9]{64}-\d+$/;
export function chunkBytes(meta: UploadManifest, index: number): number {
  return Math.min(meta.chunkSize, meta.size - index * meta.chunkSize);
}
export function validateManifest(value: unknown): UploadManifest {
  const m = value as UploadManifest;
  if (
    !m ||
    typeof m.name !== "string" ||
    !m.name ||
    m.name.length > 255 ||
    !Number.isSafeInteger(m.size) ||
    m.size < 0 ||
    !HASH_PATTERN.test(m.fileHash) ||
    !Number.isSafeInteger(m.chunkSize) ||
    m.chunkSize < 1 ||
    m.chunkSize > UPLOAD_MAX_CHUNK_BYTES ||
    m.totalChunks !== Math.ceil(m.size / m.chunkSize) ||
    m.totalChunks > 1000000
  )
    throw new Error("无效的文件描述或分片数量过多");
  return {
    name: m.name,
    size: m.size,
    fileHash: m.fileHash,
    chunkSize: m.chunkSize,
    totalChunks: m.totalChunks,
  };
}
export function validateEndpoint(value: unknown): string {
  if (typeof value !== "string") throw new Error("请输入上传服务地址");
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      ))
  ) {
    throw new Error(
      "服务地址需为 HTTPS，或本机 HTTP；不要在地址中放置凭据、查询参数或片段",
    );
  }
  return url.href.replace(/\/$/, "");
}
export function validateTuning(chunkSize: number, concurrency: number): void {
  if (
    !Number.isSafeInteger(chunkSize) ||
    chunkSize < 1 ||
    chunkSize > UPLOAD_MAX_CHUNK_BYTES ||
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > UPLOAD_MAX_CONCURRENCY
  )
    throw new Error("分片大小或并发数超出允许范围");
}
