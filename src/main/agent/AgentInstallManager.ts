import { utilityProcess, type UtilityProcess } from "electron";
import { rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { AgentRecord } from "../../shared/types/agent.js";
import { AgentStorage } from "./AgentStorage.js";
import { AgentRegistry } from "./AgentRegistry.js";
export class AgentInstallManager {
  private busy = false;
  private closing = false;
  private child?: UtilityProcess;
  close() {
    this.closing = true;
    this.child?.kill();
  }
  constructor(
    private storage: AgentStorage,
    private registry: AgentRegistry,
    private installerPath: string,
  ) {}
  async install(archive: string) {
    if (this.closing) throw new Error("应用正在退出");
    if (this.busy) throw new Error("已有安装任务正在执行");
    this.busy = true;
    let stage: string | undefined;
    try {
      stage = await this.storage.stage();
      if (this.closing) throw new Error("应用正在退出");
      const result = await new Promise<
        Pick<AgentRecord, "manifest" | "archiveHash">
      >((resolve, reject) => {
        const child = utilityProcess.fork(this.installerPath, [], {
          stdio: "pipe",
          serviceName: "Agent installer",
        });
        this.child = child;
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error("安装超时"));
        }, 120000);
        child.once("spawn", () =>
          child.postMessage({
            type: "install",
            archive,
            destination: path.join(stage!, "package"),
          }),
        );
        child.once("message", (message) => {
          clearTimeout(timer);
          if (message.error) reject(new Error(message.error));
          else resolve(message.result);
        });
        child.once("exit", (code) => {
          if (this.child === child) this.child = undefined;
          clearTimeout(timer);
          reject(new Error(`安装进程提前退出 (${code})`));
        });
      });
      const id = createHash("sha256")
        .update(result.manifest.name)
        .digest("hex")
        .slice(0, 32);
      if (this.registry.list().some((record) => record.id === id))
        throw new Error("此 Agent 已安装，请先卸载再安装其他版本");
      const record = { id, ...result, installedAt: Date.now() };
      await this.storage.commit(stage, record);
      stage = undefined;
      this.registry.add(record);
      return this.registry.get(id);
    } finally {
      try {
        if (stage) await rm(stage, { recursive: true, force: true });
      } finally {
        this.busy = false;
      }
    }
  }
}
