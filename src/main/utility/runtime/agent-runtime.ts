import {
  spawn,
  execFile,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import semver from "semver";
import type {
  AgentManifest,
  AgentConfig,
} from "../../../shared/types/agent.js";
import { launchConfig } from "../../agent/manifest.js";
const MAX_MESSAGE = 8 * 1024 * 1024;
export class AgentRuntime {
  private child?: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private stopping = false;
  private secrets: string[] = [];
  constructor(private event: (value: unknown) => void) {}
  private redact(message: string) {
    for (const secret of this.secrets)
      message = message.split(secret).join("[REDACTED]");
    return message;
  }
  async start(options: {
    manifest: AgentManifest;
    directory: string;
    config: AgentConfig;
    variables: Record<string, string>;
    nodeExecutable: string;
    pythonExecutable: string;
  }) {
    if (this.child) throw new Error("Agent 已启动");
    this.secrets = Object.entries(options.manifest.user_config ?? {})
      .filter(([, field]) => field.sensitive)
      .flatMap(([key]) => {
        const value =
          options.config[key] ?? options.manifest.user_config?.[key].default;
        return value === undefined
          ? []
          : Array.isArray(value)
            ? value.map(String)
            : [String(value)];
      })
      .filter(Boolean);
    const launch = launchConfig(
      options.manifest,
      options.directory,
      options.config,
      options.variables,
    );
    let command = launch.command;
    const env: NodeJS.ProcessEnv = {};
    for (const key of [
      "PATH",
      "Path",
      "HOME",
      "USERPROFILE",
      "SYSTEMROOT",
      "SystemRoot",
      "TEMP",
      "TMP",
      "TMPDIR",
      "LANG",
      "LC_ALL",
      "APPDATA",
      "LOCALAPPDATA",
    ])
      if (process.env[key]) env[key] = process.env[key];
    Object.assign(env, launch.env);
    const type = options.manifest.server.type;
    if (type === "node") {
      if (command !== "node")
        throw new Error("Node 包目前仅支持 command: node，请将依赖打包后安装");
      command = options.nodeExecutable;
      env.ELECTRON_RUN_AS_NODE = "1";
      const range = options.manifest.compatibility?.runtimes?.node;
      if (range && !semver.satisfies(process.versions.node, range))
        throw new Error(
          `需要 Node ${range}，内置版本 ${process.versions.node}`,
        );
    } else if (type === "python") {
      if (["python", "python3"].includes(command))
        command = options.pythonExecutable;
      const { stdout, stderr } = await promisify(execFile)(
        command,
        ["--version"],
        { timeout: 5000, env },
      );
      const version = semver.coerce(stdout + stderr);
      const range = options.manifest.compatibility?.runtimes?.python;
      if (!version || (range && !semver.satisfies(version, range)))
        throw new Error(`Python 运行时不满足要求 ${range ?? ""}`);
    } else {
      command = path.resolve(options.directory, command);
      if (process.platform === "win32" && !command.endsWith(".exe"))
        command += ".exe";
      const relative = path.relative(options.directory, command);
      if (relative.startsWith("..") || path.isAbsolute(relative))
        throw new Error("二进制启动文件必须位于安装目录内");
    }
    const child = spawn(command, launch.args, {
      cwd: options.directory,
      env,
      stdio: "pipe",
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    this.child = child;
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (data: string) => {
      buffer += data;
      if (buffer.length > MAX_MESSAGE) {
        this.fail(new Error("Agent 输出超出限制"));
        return;
      }
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (line) this.receive(line);
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (data: string) =>
      this.event({
        type: "log",
        level: "warn",
        message: this.redact(data.slice(0, 8192)),
      }),
    );
    child.stdin.on("error", (error) => this.fail(error));
    child.once("error", (error) => this.fail(error));
    child.once("close", (code, signal) => {
      this.rejectAll(new Error(`Agent 进程退出 (${code ?? signal})`));
      this.killTree(child.pid);
      this.child = undefined;
      this.event({
        type: "state",
        state: this.stopping ? "stopped" : "error",
        error: this.stopping ? undefined : `Agent 进程退出 (${code ?? signal})`,
      });
    });
    try {
      await new Promise<void>((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
      const initialized = await this.request(
        "initialize",
        {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "seven", version: "1.0.0" },
        },
        15000,
      );
      if (
        !["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"].includes(
          initialized?.protocolVersion,
        )
      )
        throw new Error("Agent 返回不支持的 MCP 协议版本");
      this.send({ jsonrpc: "2.0", method: "notifications/initialized" });
      this.event({ type: "state", state: "running", pid: child.pid });
    } catch (error) {
      await this.stop();
      throw error;
    }
  }
  private send(message: unknown) {
    if (!this.child || !this.child.stdin.writable)
      throw new Error("Agent 未运行");
    const text = JSON.stringify(message);
    if (text.length > 1024 * 1024) throw new Error("请求过大");
    this.child.stdin.write(text + "\n");
  }
  request(method: string, params: unknown = {}, timeout = 60000): Promise<any> {
    if (this.pending.size >= 32)
      return Promise.reject(new Error("Agent 并发请求过多"));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Agent 请求超时: ${method}`));
        try {
          this.send({
            jsonrpc: "2.0",
            method: "notifications/cancelled",
            params: { requestId: id, reason: "timeout" },
          });
        } catch {}
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  private receive(line: string) {
    let message: any;
    try {
      message = JSON.parse(line);
      if (!message || message.jsonrpc !== "2.0") throw new Error();
    } catch {
      this.fail(
        new Error("Agent stdout 必须是 MCP JSON-RPC，日志请写入 stderr"),
      );
      return;
    }
    if (message.method) {
      if (message.id !== undefined) {
        try {
          this.send(
            message.method === "ping"
              ? { jsonrpc: "2.0", id: message.id, result: {} }
              : {
                  jsonrpc: "2.0",
                  id: message.id,
                  error: {
                    code: -32601,
                    message: "Client capability not supported",
                  },
                },
          );
        } catch {}
      }
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error)
      pending.reject(
        new Error(this.redact(String(message.error.message ?? "MCP 请求失败"))),
      );
    else pending.resolve(message.result);
  }
  private rejectAll(error: Error) {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
  private fail(error: Error) {
    this.rejectAll(error);
    this.event({
      type: "log",
      level: "error",
      message: this.redact(error.message),
    });
    this.killTree(this.child?.pid);
    this.child?.kill("SIGKILL");
  }
  private killTree(pid?: number) {
    if (!pid) return;
    try {
      if (process.platform === "win32")
        spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], {
          windowsHide: true,
          timeout: 3000,
        });
      else process.kill(-pid, "SIGKILL");
    } catch {}
  }
  async stop() {
    this.stopping = true;
    this.rejectAll(new Error("Agent 已停止"));
    const child = this.child;
    if (!child || !child.pid) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.killTree(child.pid);
        child.kill("SIGKILL");
      }, 1500);
      child.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
      child.stdin.end();
    });
  }
  terminate() {
    this.killTree(this.child?.pid);
  }
}
if (process.parentPort) {
  const runtime = new AgentRuntime((event) =>
    process.parentPort.postMessage({ event }),
  );
  let heartbeat = Date.now();
  const watchdog = setInterval(() => {
    if (Date.now() - heartbeat > 30000) {
      runtime.terminate();
      process.exit(1);
    }
  }, 5000);
  process.on("exit", () => runtime.terminate());
  process.parentPort.on("message", (event) => {
    const message = event.data;
    if (message.type === "heartbeat") {
      heartbeat = Date.now();
      return;
    }
    void (async () => {
      if (message.method === "start") return runtime.start(message.options);
      if (message.method === "stop") {
        await runtime.stop();
        return;
      }
      if (!["tools/list", "tools/call", "ping"].includes(message.method))
        throw new Error("不支持的 Agent 方法");
      return runtime.request(message.method, message.params);
    })().then(
      (result) => process.parentPort.postMessage({ id: message.id, result }),
      (error) =>
        process.parentPort.postMessage({
          id: message.id,
          error: error instanceof Error ? error.message : String(error),
        }),
    );
  });
}
