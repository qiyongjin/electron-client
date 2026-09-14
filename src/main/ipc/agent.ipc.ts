import { app, dialog, ipcMain, safeStorage, type WebContents } from "electron";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import { IS_DEV, DEV_SERVER_URL, RENDERER_HTML_PATH } from "../common.js";
import { AgentStorage } from "../agent/AgentStorage.js";
import { AgentManager } from "../agent/AgentManager.js";
import {
  AGENTS_DIR,
  AGENT_INSTALLER_PATH,
  AGENT_RUNTIME_PATH,
  getPythonCommand,
} from "../common.js";
import type { AgentConfig } from "../../shared/types/agent.js";
export async function setupAgentIpc() {
  const handle = (
    channel: string,
    listener: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown,
  ) =>
    ipcMain.handle(channel, (event, ...args) => {
      const frame = event.senderFrame;
      if (!frame || frame !== event.sender.mainFrame)
        throw new Error("不允许此页面操作 Agent");
      const url = new URL(frame.url);
      const localFile =
        frame.url.split(/[?#]/)[0] === pathToFileURL(RENDERER_HTML_PATH).href;
      if (
        !localFile &&
        !(IS_DEV && url.origin === new URL(DEV_SERVER_URL).origin)
      )
        throw new Error("不允许此页面操作 Agent");
      return listener(event, ...args);
    });
  const viewers = new Set<WebContents>();
  const selections = new Map<number, { id: string; archive: string }>();
  let installOwner: number | undefined;
  const storage = new AgentStorage(AGENTS_DIR, {
    encode(value, sensitive) {
      const available =
        safeStorage.isEncryptionAvailable() &&
        !(
          process.platform === "linux" &&
          safeStorage.getSelectedStorageBackend() === "basic_text"
        );
      if (available)
        return JSON.stringify({
          encrypted: safeStorage.encryptString(value).toString("base64"),
        });
      if (sensitive) throw new Error("系统安全存储不可用，无法保存敏感配置");
      return JSON.stringify({ plain: value });
    },
    decode(value) {
      const data = JSON.parse(value);
      if (data.encrypted)
        return safeStorage.decryptString(Buffer.from(data.encrypted, "base64"));
      if (typeof data.plain === "string") return data.plain;
      throw new Error("Agent 配置损坏");
    },
  });
  const manager = new AgentManager(
    storage,
    AGENT_INSTALLER_PATH,
    AGENT_RUNTIME_PATH,
    {
      HOME: app.getPath("home"),
      DESKTOP: app.getPath("desktop"),
      DOCUMENTS: app.getPath("documents"),
      DOWNLOADS: app.getPath("downloads"),
    },
    getPythonCommand(),
    (agents) => {
      for (const viewer of viewers)
        if (!viewer.isDestroyed()) viewer.send("agent:changed", agents);
    },
    (progress) => {
      for (const viewer of viewers)
        if (!viewer.isDestroyed()) viewer.send("agent:install-progress", progress);
    },
  );
  await manager.initialize();
  const watch = (sender: WebContents) => {
    if (!viewers.has(sender)) {
      viewers.add(sender);
      sender.once("destroyed", () => { viewers.delete(sender); selections.delete(sender.id); });
    }
  };
  handle("agent:list", (event) => {
    watch(event.sender);
    return manager.list();
  });
  handle("agent:choose-package", async (event) => {
    watch(event.sender);
    const selected = await dialog.showOpenDialog({
      title: "安装本地 Agent",
      properties: ["openFile"],
      filters: [{ name: "Agent bundle", extensions: ["dxt", "mcpb"] }],
    });
    if (selected.canceled) return null;
    const archive = selected.filePaths[0];
    const info = await stat(archive);
    if (!info.isFile() || ![".dxt", ".mcpb"].includes(path.extname(archive).toLowerCase()))
      throw new Error("请选择 .dxt 或 .mcpb 安装包");
    if (info.size > 512 * 1024 ** 2) throw new Error("安装包不能超过 512 MiB");
    const id = randomUUID();
    selections.set(event.sender.id, { id, archive });
    return { id, name: path.basename(archive), size: info.size };
  });
  handle("agent:install", async (event, sourceId: string) => {
    const source = selections.get(event.sender.id);
    if (!source || source.id !== sourceId) throw new Error("请选择安装包并在客户端中确认安装");
    if (installOwner !== undefined) throw new Error("已有安装任务正在执行");
    installOwner = event.sender.id;
    selections.delete(event.sender.id);
    try { return await manager.install(source.archive, source.id); }
    finally { installOwner = undefined; }
  });
  handle("agent:install-progress", (event) => {
    watch(event.sender);
    return manager.installer.snapshot();
  });
  handle("agent:cancel-install", (event, taskId: string) => {
    if (installOwner !== event.sender.id) return false;
    return manager.installer.cancel(taskId);
  });
  handle("agent:start", (_event, id: string) => manager.start(id));
  handle("agent:stop", (_event, id: string) => manager.stop(id));
  handle("agent:uninstall", async (_event, id: string) => {
    await manager.uninstall(id);
    return true;
  });
  handle("agent:get-config", (_event, id: string) => manager.getConfig(id));
  handle("agent:save-config", (_event, id: string, values: AgentConfig) =>
    manager.saveConfig(id, values),
  );
  handle("agent:tools", (_event, id: string) => manager.listTools(id));
  handle(
    "agent:call-tool",
    (_event, id: string, name: string, args: Record<string, unknown>) =>
      manager.callTool(id, name, args),
  );
  handle("agent:logs", (_event, id: string) => manager.runtime.logs(id));
  let quitting = false;
  let shutdownComplete = false;
  app.on("before-quit", (event) => {
    if (shutdownComplete) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    void manager
      .close()
      .catch((error) => console.error("[agent] 退出清理失败", error))
      .finally(() => {
        shutdownComplete = true;
        app.quit();
      });
  });
  return manager;
}
