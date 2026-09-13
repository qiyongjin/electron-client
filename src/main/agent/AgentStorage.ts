import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  readdir,
  lstat,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AgentRecord, AgentConfig } from "../../shared/types/agent.js";
import { parseManifest } from "./manifest.js";
export class AgentStorage {
  constructor(
    readonly root: string,
    private codec: {
      encode: (value: string, sensitive: boolean) => string;
      decode: (value: string) => string;
    },
  ) {}
  directory(id: string) {
    if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("无效的 Agent ID");
    return path.join(this.root, id);
  }
  packageDirectory(id: string) {
    return path.join(this.directory(id), "package");
  }
  async initialize() {
    await mkdir(this.root, { recursive: true });
    for (const entry of await readdir(this.root)) {
      if (entry.startsWith(".stage-") || entry.startsWith(".trash-"))
        await rm(path.join(this.root, entry), { recursive: true, force: true });
    }
  }
  async records() {
    const records: AgentRecord[] = [];
    for (const id of await readdir(this.root)) {
      if (!/^[a-f0-9]{32}$/.test(id)) continue;
      try {
        const info = await lstat(this.directory(id));
        if (!info.isDirectory() || info.isSymbolicLink()) continue;
        const record = JSON.parse(
          await readFile(path.join(this.directory(id), "record.json"), "utf8"),
        );
        if (record.id !== id) throw new Error("ID 不一致");
        record.manifest = parseManifest(record.manifest);
        records.push(record);
      } catch (error) {
        console.error("[agent] 读取安装记录失败", id, error);
      }
    }
    return records;
  }
  async stage() {
    const directory = path.join(this.root, `.stage-${randomUUID()}`);
    await mkdir(directory);
    return directory;
  }
  async commit(stage: string, record: AgentRecord) {
    await this.atomic(path.join(stage, "record.json"), JSON.stringify(record));
    await rename(stage, this.directory(record.id));
  }
  async remove(id: string) {
    const trash = path.join(this.root, `.trash-${randomUUID()}`);
    await rename(this.directory(id), trash);
    try {
      await rm(trash, { recursive: true, force: true });
    } catch (error) {
      console.warn("[agent] 下次启动继续清理卸载文件", error);
    }
  }
  private async atomic(file: string, text: string) {
    const temp = file + "." + randomUUID() + ".tmp";
    try {
      await writeFile(temp, text, { mode: 0o600, flag: "wx" });
      await rename(temp, file);
    } finally {
      await rm(temp, { force: true });
    }
  }
  async config(id: string): Promise<AgentConfig> {
    try {
      return JSON.parse(
        this.codec.decode(
          await readFile(path.join(this.directory(id), "config.json"), "utf8"),
        ),
      );
    } catch (error: any) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  }
  async saveConfig(record: AgentRecord, values: AgentConfig) {
    const sensitive = Object.entries(record.manifest.user_config ?? {}).some(
      ([key, field]) => field.sensitive && values[key] !== undefined,
    );
    await this.atomic(
      path.join(this.directory(record.id), "config.json"),
      this.codec.encode(JSON.stringify(values), sensitive),
    );
  }
}
