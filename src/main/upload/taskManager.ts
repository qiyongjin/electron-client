import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type {
  UploadTask,
  UploadStartOptions,
} from "../../shared/types/upload.js";
import { validateEndpoint, validateTuning } from "./protocol.js";

const active = new Set(["hashing", "uploading", "merging", "pausing"]);
export class UploadTaskManager {
  private tasks = new Map<string, UploadTask>();
  private workers = new Map<string, Worker>();
  private closed = false;
  private statePath: string;
  constructor(
    directory: string,
    private onChange: (tasks: UploadTask[]) => void = () => {},
    private workerPath: string | URL = new URL(
      "./upload.worker.js",
      import.meta.url,
    ),
  ) {
    mkdirSync(directory, { recursive: true });
    this.statePath = path.join(directory, "tasks.json");
    try {
      const saved = JSON.parse(readFileSync(this.statePath, "utf8"));
      if (!Array.isArray(saved)) throw new Error("Invalid task store");
      for (const task of saved as UploadTask[]) {
        if (
          typeof task.id !== "string" ||
          typeof task.filePath !== "string" ||
          !Number.isSafeInteger(task.size)
        )
          continue;
        validateEndpoint(task.endpoint);
        validateTuning(task.chunkSize, task.concurrency);
        if (active.has(task.status)) task.status = "paused";
        task.speed = 0;
        this.tasks.set(task.id, task);
      }
    } catch (error: any) {
      if (error.code !== "ENOENT")
        throw new Error(`无法恢复上传任务：${error.message}`);
    }
  }
  list() {
    return [...this.tasks.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((task) => ({ ...task }));
  }
  private save() {
    const temp = this.statePath + ".tmp";
    writeFileSync(temp, JSON.stringify(this.list()));
    renameSync(temp, this.statePath);
  }
  private publish() {
    try {
      this.save();
    } catch (error) {
      console.error("[upload] 保存任务失败，重启恢复可能受影响", error);
    }
    if (!this.closed) this.onChange(this.list());
  }
  private get(id: string) {
    const task = this.tasks.get(id);
    if (!task) throw new Error("上传任务不存在");
    return task;
  }
  private checkCapacity() {
    if (this.closed || this.workers.size >= 2)
      throw new Error("最多同时运行 2 个上传任务，请先暂停其他任务");
  }
  async start(options: UploadStartOptions) {
    this.checkCapacity();
    validateTuning(options.chunkSize, options.concurrency);
    const endpoint = validateEndpoint(options.endpoint);
    const info = await stat(options.filePath);
    this.checkCapacity();
    if (!info.isFile() || !Number.isSafeInteger(info.size))
      throw new Error("请选择普通文件");
    const totalChunks = Math.ceil(info.size / options.chunkSize);
    if (totalChunks > 1_000_000)
      throw new Error("分片数量过多，请增大分片大小");
    const task: UploadTask = {
      ...options,
      endpoint,
      id: randomUUID(),
      name: path.basename(options.filePath),
      size: info.size,
      status: "hashing",
      hashBytes: 0,
      uploadedBytes: 0,
      completedChunks: 0,
      totalChunks,
      retries: 0,
      speed: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.tasks.set(task.id, task);
    try {
      this.save();
    } catch (error) {
      this.tasks.delete(task.id);
      throw error;
    }
    this.launch(task);
    return { ...task };
  }
  private launch(task: UploadTask) {
    task.status = "hashing";
    task.error = undefined;
    task.updatedAt = Date.now();
    const worker = new Worker(this.workerPath, {
      workerData: { task: { ...task } },
    });
    this.workers.set(task.id, worker);
    this.publish();
    worker.on("message", (message) => {
      if (
        this.closed ||
        task.status === "cancelled" ||
        message.type !== "update"
      )
        return;
      const pausing = task.status === "pausing";
      Object.assign(task, message.task);
      if (pausing && active.has(task.status)) task.status = "pausing";
      this.publish();
    });
    worker.on("error", (error) => {
      if (task.status !== "cancelled") {
        task.status = "failed";
        task.error = error.message;
        task.speed = 0;
        this.publish();
      }
    });
    worker.on("exit", (code) => {
      this.workers.delete(task.id);
      if (active.has(task.status)) {
        task.status = this.closed ? "paused" : "failed";
        task.error = this.closed ? undefined : `上传 Worker 提前退出 (${code})`;
        task.speed = 0;
      }
      this.publish();
    });
  }
  async pause(id: string) {
    const task = this.get(id);
    const worker = this.workers.get(id);
    if (!worker || !active.has(task.status)) return;
    task.status = "pausing";
    this.publish();
    worker.postMessage({ type: "pause" });
    await new Promise<void>((resolve) => worker.once("exit", () => resolve()));
  }
  resume(id: string) {
    this.checkCapacity();
    const task = this.get(id);
    if (this.workers.has(id) || !["paused", "failed"].includes(task.status))
      throw new Error("该任务当前无法继续");
    this.launch(task);
    return { ...task };
  }
  async cancel(id: string) {
    const task = this.get(id);
    if (task.status === "completed") return;
    task.status = "cancelled";
    task.speed = 0;
    task.updatedAt = Date.now();
    this.publish();
    await this.workers.get(id)?.terminate();
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const task of this.tasks.values())
      if (active.has(task.status)) {
        task.status = "paused";
        task.speed = 0;
      }
    this.save();
    await Promise.all(
      [...this.workers.values()].map((worker) => worker.terminate()),
    );
  }
}
