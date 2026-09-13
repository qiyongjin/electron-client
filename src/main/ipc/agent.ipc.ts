import { app, dialog, ipcMain, safeStorage, type WebContents } from "electron";
import { pathToFileURL } from "node:url";
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
  );
  await manager.initialize();
  const watch = (sender: WebContents) => {
    if (!viewers.has(sender)) {
      viewers.add(sender);
      sender.once("destroyed", () => viewers.delete(sender));
    }
  };
  handle("agent:list", (event) => {
    watch(event.sender);
    return manager.list();
  });
  handle("agent:install", async (event) => {
    watch(event.sender);
    const selected = await dialog.showOpenDialog({
      title: "安装本地 Agent",
      properties: ["openFile"],
      filters: [{ name: "Agent bundle", extensions: ["dxt", "mcpb"] }],
    });
    if (selected.canceled) return null;
    const confirm = await dialog.showMessageBox({
      type: "warning",
      title: "安装 Agent",
      message: "仅安装你信任的 Agent 包",
      detail:
        "安装后不会自动启动。点击启动时，包内程序将以当前用户权限运行，可访问本地文件和网络。",
      buttons: ["取消", "安装"],
      defaultId: 0,
      cancelId: 0,
    });
    if (confirm.response !== 1) return null;
    return manager.install(selected.filePaths[0]);
  });
  handle("agent:start", (_event, id: string) => manager.start(id));
  handle("agent:stop", (_event, id: string) => manager.stop(id));
  handle("agent:uninstall", async (_event, id: string) => {
    const record = manager.registry.get(id);
    const confirm = await dialog.showMessageBox({
      type: "question",
      message: `卸载 ${record.manifest.display_name ?? record.manifest.name}？`,
      detail: "会停止运行，并删除安装文件和保存的配置。",
      buttons: ["取消", "卸载"],
      defaultId: 0,
      cancelId: 0,
    });
    if (confirm.response !== 1) return false;
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
