import { parentPort, workerData } from "node:worker_threads";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { UploadTask } from "../../shared/types/upload.js";
import { UPLOAD_MAX_RETRIES } from "../../shared/types/upload.js";
import {
  chunkBytes,
  validateEndpoint,
  validateTuning,
  type UploadManifest,
} from "./protocol.js";

const task = workerData.task as UploadTask;
const controller = new AbortController();
let pause = false;
parentPort?.on("message", (message) => {
  if (message?.type === "pause") {
    pause = true;
    controller.abort();
  }
});
let lastUpdate = 0;
const emit = (force = false) => {
  if (force || Date.now() - lastUpdate >= 200) {
    lastUpdate = Date.now();
    task.updatedAt = Date.now();
    parentPort?.postMessage({ type: "update", task: { ...task } });
  }
};
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function request(route: string, options: RequestInit = {}): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    controller.signal.throwIfAborted();
    try {
      const response = await fetch(task.endpoint + route, {
        ...options,
        redirect: "error",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(workerData.timeoutMs ?? 120000),
        ]),
      });
      const text = await response.text();
      if (!response.ok)
        throw new HttpError(
          response.status,
          `HTTP ${response.status}: ${text.slice(0, 300)}`,
        );
      return JSON.parse(text);
    } catch (error) {
      if (controller.signal.aborted) throw error;
      const retryable =
        !(error instanceof HttpError) ||
        [408, 429].includes(error.status) ||
        error.status >= 500;
      if (!retryable || attempt >= UPLOAD_MAX_RETRIES) throw error;
      task.retries++;
      emit(true);
      await delay(
        (workerData.retryBaseMs ?? 500) * 2 ** attempt + Math.random() * 100,
        undefined,
        { signal: controller.signal },
      );
    }
  }
}
async function run() {
  task.endpoint = validateEndpoint(task.endpoint);
  validateTuning(task.chunkSize, task.concurrency);
  const file = await open(task.filePath, "r");
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size !== task.size)
      throw new Error("源文件已改变，请重新选择文件创建任务");
    task.status = "hashing";
    task.hashBytes = 0;
    task.speed = 0;
    emit(true);
    const hash = createHash("sha256");
    for await (const block of file.createReadStream({
      autoClose: false,
      highWaterMark: 1024 * 1024,
      signal: controller.signal,
    })) {
      hash.update(block);
      task.hashBytes += block.length;
      emit();
    }
    const fileHash = hash.digest("hex");
    if (task.fileHash && task.fileHash !== fileHash)
      throw new Error("源文件内容与原任务不一致，不能继续上传；请创建新任务");
    task.fileHash = fileHash;
    const meta: UploadManifest = {
      name: task.name,
      size: task.size,
      fileHash,
      chunkSize: task.chunkSize,
      totalChunks: task.totalChunks,
    };
    task.status = "uploading";
    emit(true);
    const init = await request("/uploads/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(meta),
    });
    const expectedId = `${fileHash}-${task.chunkSize}`;
    if (
      init.uploadId !== expectedId ||
      !Array.isArray(init.uploaded) ||
      init.uploaded.some(
        (i: unknown) =>
          !Number.isInteger(i) ||
          Number(i) < 0 ||
          Number(i) >= task.totalChunks,
      )
    )
      throw new Error("服务端返回了无效的上传状态");
    task.uploadId = expectedId;
    const uploaded = new Set<number>(init.uploaded);
    task.completedChunks = uploaded.size;
    task.uploadedBytes = [...uploaded].reduce(
      (sum, index) => sum + chunkBytes(meta, index),
      0,
    );
    const pending = Array.from(
      { length: task.totalChunks },
      (_, i) => i,
    ).filter((i) => !uploaded.has(i));
    const startBytes = task.uploadedBytes;
    const startTime = Date.now();
    let cursor = 0;
    emit(true);
    const sendChunk = async () => {
      while (cursor < pending.length) {
        controller.signal.throwIfAborted();
        const index = pending[cursor++];
        const size = chunkBytes(meta, index);
        const buffer = Buffer.allocUnsafe(size);
        let offset = 0;
        while (offset < size) {
          controller.signal.throwIfAborted();
          const { bytesRead } = await file.read(
            buffer,
            offset,
            size - offset,
            index * task.chunkSize + offset,
          );
          if (!bytesRead) throw new Error("读取源文件失败或文件已被截断");
          offset += bytesRead;
        }
        const chunkHash = createHash("sha256").update(buffer).digest("hex");
        const ack = await request(`/uploads/${expectedId}/chunks/${index}`, {
          method: "PUT",
          headers: {
            "content-type": "application/octet-stream",
            "x-chunk-sha256": chunkHash,
          },
          body: new Uint8Array(buffer),
        });
        if (ack.index !== index || ack.hash !== chunkHash || ack.size !== size)
          throw new Error("分片确认信息不匹配");
        task.completedChunks++;
        task.uploadedBytes += size;
        task.speed =
          (task.uploadedBytes - startBytes) /
          Math.max((Date.now() - startTime) / 1000, 0.001);
        emit();
      }
    };
    const runners = Array.from(
      { length: Math.min(task.concurrency, pending.length) },
      () => sendChunk(),
    );
    try {
      await Promise.all(runners);
    } catch (error) {
      controller.abort();
      await Promise.allSettled(runners);
      throw error;
    }
    controller.signal.throwIfAborted();
    const after = await file.stat();
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    )
      throw new Error("上传期间源文件发生变化，请重新创建任务");
    task.status = "merging";
    task.speed = 0;
    emit(true);
    const result = await request(`/uploads/${expectedId}/complete`, {
      method: "POST",
    });
    if (
      result.fileHash !== fileHash ||
      result.size !== task.size ||
      typeof result.storageName !== "string"
    )
      throw new Error("服务端合并结果未通过整文件 SHA-256 / 大小校验");
    task.result = {
      fileHash: result.fileHash,
      size: result.size,
      storageName: result.storageName,
    };
    task.status = "completed";
    task.uploadedBytes = task.size;
    emit(true);
  } finally {
    await file.close();
  }
}
void run()
  .catch((error) => {
    task.status = pause ? "paused" : "failed";
    task.speed = 0;
    task.error = pause
      ? undefined
      : error instanceof Error
        ? error.message
        : String(error);
    emit(true);
  })
  .finally(() => parentPort?.close());
