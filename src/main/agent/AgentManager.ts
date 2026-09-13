import type {
  AgentConfig,
  AgentTool,
  InstalledAgent,
} from "../../shared/types/agent.js";
import { AgentStorage } from "./AgentStorage.js";
import { AgentRegistry } from "./AgentRegistry.js";
import { AgentInstallManager } from "./AgentInstallManager.js";
import { AgentRuntimeManager } from "./AgentRuntimeManager.js";
import { resolveConfig } from "./manifest.js";
export class AgentManager {
  readonly registry: AgentRegistry;
  readonly installer: AgentInstallManager;
  readonly runtime: AgentRuntimeManager;
  private locks = new Set<string>();
  private closing = false;
  private operations = new Set<Promise<unknown>>();
  constructor(
    readonly storage: AgentStorage,
    installerPath: string,
    runtimePath: string,
    private variables: Record<string, string>,
    pythonExecutable: string,
    changed: (agents: InstalledAgent[]) => void,
  ) {
    this.registry = new AgentRegistry(() => changed(this.registry.list()));
    this.installer = new AgentInstallManager(
      storage,
      this.registry,
      installerPath,
    );
    this.runtime = new AgentRuntimeManager(
      storage,
      this.registry,
      runtimePath,
      variables,
      pythonExecutable,
    );
  }
  async initialize() {
    await this.storage.initialize();
    for (const record of await this.storage.records())
      this.registry.add(record);
  }
  private async exclusive<T>(id: string, run: () => Promise<T>) {
    if (this.closing) throw new Error("应用正在退出");
    if (this.locks.has(id)) throw new Error("该 Agent 正在处理其他操作");
    this.locks.add(id);
    try {
      const operation = run();
      this.operations.add(operation);
      try {
        return await operation;
      } finally {
        this.operations.delete(operation);
      }
    } finally {
      this.locks.delete(id);
    }
  }
  install(archive: string) {
    return this.exclusive("install", () => this.installer.install(archive));
  }
  list() {
    return this.registry.list();
  }
  start(id: string) {
    return this.exclusive(id, async () => {
      if (this.registry.get(id).state === "error") await this.runtime.stop(id);
      const config = await this.storage.config(id);
      if (this.closing) throw new Error("应用正在退出");
      await this.runtime.start(id, config);
    });
  }
  stop(id: string) {
    return this.exclusive(id, () => this.runtime.stop(id));
  }
  uninstall(id: string) {
    return this.exclusive(id, async () => {
      this.registry.get(id);
      await this.runtime.stop(id);
      await this.storage.remove(id);
      this.registry.remove(id);
    });
  }
  async getConfig(id: string) {
    const record = this.registry.get(id);
    const values = await this.storage.config(id);
    const configuredSecrets: string[] = [];
    for (const [key, field] of Object.entries(
      record.manifest.user_config ?? {},
    ))
      if (field.sensitive && values[key] !== undefined) {
        configuredSecrets.push(key);
        delete values[key];
      }
    return { values, configuredSecrets };
  }
  saveConfig(id: string, values: AgentConfig) {
    return this.exclusive(id, async () => {
      const record = this.registry.get(id);
      if (["running", "starting", "stopping"].includes(record.state))
        throw new Error("请先停止 Agent 再修改配置");
      const previous = await this.storage.config(id);
      for (const [key, field] of Object.entries(
        record.manifest.user_config ?? {},
      ))
        if (
          field.sensitive &&
          values[key] === undefined &&
          previous[key] !== undefined
        )
          values[key] = previous[key];
      const resolved = resolveConfig(record.manifest, values, this.variables);
      await this.storage.saveConfig(record, resolved);
    });
  }
  async listTools(id: string): Promise<AgentTool[]> {
    const tools: AgentTool[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const result = await this.runtime.request(
        id,
        "tools/list",
        cursor ? { cursor } : {},
      );
      if (!Array.isArray(result?.tools)) throw new Error("Agent 工具列表无效");
      for (const tool of result.tools) {
        if (
          typeof tool.name !== "string" ||
          !tool.inputSchema ||
          typeof tool.inputSchema !== "object"
        )
          throw new Error("Agent 工具描述无效");
        tools.push(tool);
      }
      if (tools.length > 1000) throw new Error("Agent 工具数量超出限制");
      cursor = result.nextCursor;
      if (cursor) {
        if (typeof cursor !== "string" || seen.has(cursor) || seen.size >= 100)
          throw new Error("Agent 分页无效");
        seen.add(cursor);
      }
    } while (cursor);
    return tools;
  }
  async callTool(id: string, name: string, args: Record<string, unknown>) {
    if (
      typeof name !== "string" ||
      !name ||
      !args ||
      typeof args !== "object" ||
      Array.isArray(args) ||
      JSON.stringify(args).length > 1024 * 1024
    )
      throw new Error("工具参数无效");
    return this.runtime.request(id, "tools/call", { name, arguments: args });
  }
  async close() {
    this.closing = true;
    this.installer.close();
    await this.runtime.close();
    await Promise.allSettled([...this.operations]);
    await this.runtime.close();
  }
}
