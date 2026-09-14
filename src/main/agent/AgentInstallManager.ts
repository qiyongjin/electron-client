import { utilityProcess, type UtilityProcess } from "electron";
import { rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { AgentRecord, AgentInstallProgress, AgentExtractionProgress } from "../../shared/types/agent.js";
import { AgentStorage } from "./AgentStorage.js";
import { AgentRegistry } from "./AgentRegistry.js";

export class AgentInstallManager {
  private busy = false;
  private closing = false;
  private cancelled = false;
  private child?: UtilityProcess;
  private progress: AgentInstallProgress | null = null;

  constructor(
    private storage: AgentStorage,
    private registry: AgentRegistry,
    private installerPath: string,
    private changed: (progress: AgentInstallProgress) => void = () => {},
  ) {}

  snapshot() { return this.progress; }

  private report(patch: Partial<AgentInstallProgress>) {
    this.progress = { ...this.progress!, ...patch };
    this.changed(this.progress);
  }

  cancel(taskId: string) {
    if (!this.busy || this.progress?.id !== taskId || !this.progress.cancellable) return false;
    this.cancelled = true;
    this.report({ phase: "cancelling", cancellable: false, message: "正在取消安装并清理临时文件" });
    this.child?.kill();
    return true;
  }

  close() {
    this.closing = true;
    if (this.progress) this.cancel(this.progress.id);
  }

  private checkCancelled() {
    if (this.cancelled || this.closing) throw new Error("安装已取消");
  }

  private extract(archive: string, destination: string) {
    return new Promise<Pick<AgentRecord, "manifest" | "archiveHash">>((resolve, reject) => {
      const child = utilityProcess.fork(this.installerPath, [], { stdio: "pipe", serviceName: "Agent installer" });
      this.child = child;
      let result: Pick<AgentRecord, "manifest" | "archiveHash"> | undefined;
      let failure: Error | undefined;
      const timer = setTimeout(() => { failure = new Error("安装超时，请检查安装包后重试"); child.kill(); }, 120000);
      // Wait for exit before removing staging files: Windows keeps open extracted files locked.
      child.once("spawn", () => {
        if (this.cancelled) child.kill();
        else child.postMessage({ type: "install", archive, destination });
      });
      child.on("message", (message) => {
        if (this.cancelled || !message || typeof message !== "object") return;
        if (message.type === "progress") {
          const progress = message.progress as AgentExtractionProgress;
          this.report({ currentFile: undefined, processedBytes: undefined, totalBytes: undefined,
            processedEntries: undefined, totalEntries: undefined, ...progress });
        } else if (message.error) failure = new Error(String(message.error));
        else if (message.result) result = message.result;
      });
      child.stdout?.resume();
      child.stderr?.resume();
      child.once("exit", (code) => {
        clearTimeout(timer);
        if (this.child === child) this.child = undefined;
        if (this.cancelled) reject(new Error("安装已取消"));
        else if (failure) reject(failure);
        else if (result && code === 0) resolve(result);
        else reject(new Error(`安装进程提前退出 (${code})`));
      });
    });
  }

  async install(archive: string, taskId: string = randomUUID()) {
    if (this.closing) throw new Error("应用正在退出");
    if (this.busy) throw new Error("已有安装任务正在执行");
    this.busy = true;
    this.cancelled = false;
    this.progress = { id: taskId, fileName: path.basename(archive), phase: "preparing", percent: 0,
      message: "正在准备安装", cancellable: true };
    let stage: string | undefined;
    try {
      this.report({});
      stage = await this.storage.stage();
      this.checkCancelled();
      const result = await this.extract(archive, path.join(stage, "package"));
      this.checkCancelled();
      const id = createHash("sha256").update(result.manifest.name).digest("hex").slice(0, 32);
      if (this.registry.list().some((record) => record.id === id))
        throw new Error("此 Agent 已安装，请先卸载再安装其他版本");
      // Committing is atomic and cannot be cancelled once it begins.
      this.report({ phase: "committing", percent: 97, cancellable: false, currentFile: undefined, message: "正在保存安装记录" });
      const record = { id, ...result, installedAt: Date.now() };
      await this.storage.commit(stage, record);
      stage = undefined;
      this.registry.add(record);
      this.report({ phase: "completed", percent: 100, agentId: id, message: "安装完成，可以配置并启动智能体" });
      return this.registry.get(id);
    } catch (error) {
      // A terminal notification means cleanup has finished, so retrying is safe.
      if (stage) {
        try { await rm(stage, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }); stage = undefined; }
        catch (cleanupError) {
          this.report({ phase: "failed", cancellable: false, error: "临时安装文件清理失败，请重新启动客户端后重试", message: "安装未完成" });
          throw cleanupError;
        }
      }
      if (this.cancelled || this.closing) {
        this.report({ phase: "cancelled", cancellable: false, currentFile: undefined, message: "安装已取消，临时文件已清理" });
        return null;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.report({ phase: "failed", cancellable: false, error: message, message: "安装失败" });
      throw error;
    } finally {
      this.busy = false;
    }
  }
}
