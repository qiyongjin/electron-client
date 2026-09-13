import { utilityProcess, type UtilityProcess } from "electron";
import type { AgentConfig, AgentLog } from "../../shared/types/agent.js";
import { AgentStorage } from "./AgentStorage.js";
import { AgentRegistry } from "./AgentRegistry.js";
interface Running {
  exited: Promise<void>;
  process: UtilityProcess;
  heartbeat: NodeJS.Timeout;
  sequence: number;
  pending: Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >;
}
export class AgentRuntimeManager {
  private processes = new Map<string, Running>();
  private history = new Map<string, AgentLog[]>();
  constructor(
    private storage: AgentStorage,
    private registry: AgentRegistry,
    private runtimePath: string,
    private variables: Record<string, string>,
    private pythonExecutable: string,
  ) {}
  logs(id: string) {
    this.registry.get(id);
    return this.history.get(id) ?? [];
  }
  private log(id: string, level: AgentLog["level"], message: string) {
    const lines = this.history.get(id) ?? [];
    lines.push({
      time: new Date().toISOString(),
      level,
      message: message.slice(0, 8192),
    });
    this.history.set(id, lines.slice(-100));
  }
  async start(id: string, config: AgentConfig) {
    if (this.processes.has(id)) throw new Error("Agent 已在运行");
    this.registry.update(id, "starting");
    const child = utilityProcess.fork(this.runtimePath, [], {
      stdio: "pipe",
      serviceName: `Agent ${id}`,
    });
    const running: Running = {
      exited: new Promise((resolve) => child.once("exit", () => resolve())),
      process: child,
      sequence: 0,
      pending: new Map(),
      heartbeat: setInterval(
        () => child.postMessage({ type: "heartbeat" }),
        5000,
      ),
    };
    this.processes.set(id, running);
    child.on("message", (message) => {
      if (message.event) {
        const event = message.event;
        if (event.type === "log") this.log(id, event.level, event.message);
        if (event.type === "state")
          this.registry.update(id, event.state, event.error, event.pid);
        return;
      }
      const request = running.pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer);
      running.pending.delete(message.id);
      message.error
        ? request.reject(new Error(message.error))
        : request.resolve(message.result);
    });
    child.on("exit", (code) => {
      clearInterval(running.heartbeat);
      this.processes.delete(id);
      for (const pending of running.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`运行管理进程退出 (${code})`));
      }
      running.pending.clear();
      if (this.registry.get(id).state !== "stopped")
        this.registry.update(id, "error", `运行管理进程退出 (${code})`);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Agent 运行进程启动超时")),
          10000,
        );
        child.once("spawn", () => {
          clearTimeout(timer);
          resolve();
        });
        child.once("exit", () => {
          clearTimeout(timer);
          reject(new Error("Agent 运行进程启动失败"));
        });
      });
      await this.rpc(id, "start", undefined, {
        manifest: this.registry.get(id).manifest,
        directory: this.storage.packageDirectory(id),
        config,
        variables: this.variables,
        nodeExecutable: process.execPath,
        pythonExecutable: this.pythonExecutable,
      });
      this.log(id, "info", "MCP 初始化完成");
    } catch (error) {
      await this.stop(id);
      this.registry.update(
        id,
        "error",
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }
  private rpc(
    id: string,
    method: string,
    params?: unknown,
    options?: unknown,
  ): Promise<any> {
    const running = this.processes.get(id);
    if (!running) return Promise.reject(new Error("Agent 未运行"));
    return new Promise((resolve, reject) => {
      const requestId = ++running.sequence;
      const timer = setTimeout(() => {
        running.pending.delete(requestId);
        reject(new Error("Agent 操作超时"));
      }, 75000);
      running.pending.set(requestId, { resolve, reject, timer });
      running.process.postMessage({ id: requestId, method, params, options });
    });
  }
  async request(id: string, method: string, params?: unknown) {
    if (this.registry.get(id).state !== "running")
      throw new Error("请先启动 Agent");
    return this.rpc(id, method, params);
  }
  async stop(id: string) {
    const running = this.processes.get(id);
    if (!running) {
      this.registry.update(id, "stopped");
      return;
    }
    this.registry.update(id, "stopping");
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.rpc(id, "stop"),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("停止超时")), 5000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      this.registry.update(id, "stopped");
      running.process.kill();
      await running.exited;
      this.log(id, "info", "Agent 已停止");
    }
  }
  async close() {
    await Promise.allSettled(
      [...this.processes.keys()].map((id) => this.stop(id)),
    );
  }
}
