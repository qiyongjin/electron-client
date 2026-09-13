import { app, dialog, ipcMain, type WebContents } from "electron";
import { Worker } from "node:worker_threads";
import { stat } from "node:fs/promises";
import path from "node:path";
import {
  UPLOAD_TASK_DIR,
  UPLOAD_RECEIVER_DIR,
  UPLOAD_WORKER_PATH,
  UPLOAD_SERVER_WORKER_PATH,
} from "../common.js";
import { UploadTaskManager } from "../upload/taskManager.js";
import type {
  LocalUploadServerInfo,
  LocalUploadServerOptions,
  UploadStartOptions,
} from "../../shared/types/upload.js";

export function setupUploadIpc() {
  const viewers = new Set<WebContents>();
  const selected = new Set<string>();
  const manager = new UploadTaskManager(
    UPLOAD_TASK_DIR,
    (tasks) => {
      for (const viewer of viewers)
        if (!viewer.isDestroyed()) viewer.send("upload:tasks", tasks);
    },
    UPLOAD_WORKER_PATH,
  );
  const watch = (sender: WebContents) => {
    if (!viewers.has(sender)) {
      viewers.add(sender);
      sender.once("destroyed", () => viewers.delete(sender));
    }
  };
  let serverWorker: Worker | undefined;
  let serverInfo: LocalUploadServerInfo | undefined;
  let starting: Promise<LocalUploadServerInfo> | undefined;
  ipcMain.handle("upload:choose-file", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      title: "选择要上传测试的大文件",
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("请选择普通文件");
    selected.add(filePath);
    return { path: filePath, name: path.basename(filePath), size: info.size };
  });
  ipcMain.handle("upload:list", (event) => {
    watch(event.sender);
    return manager.list();
  });
  ipcMain.handle("upload:start", (event, options: UploadStartOptions) => {
    watch(event.sender);
    if (!options || !selected.has(options.filePath))
      throw new Error("请先通过文件选择器选择文件");
    return manager.start(options);
  });
  ipcMain.handle("upload:pause", (_event, id: string) => manager.pause(id));
  ipcMain.handle("upload:resume", (event, id: string) => {
    watch(event.sender);
    return manager.resume(id);
  });
  ipcMain.handle("upload:cancel", (_event, id: string) => manager.cancel(id));
  ipcMain.handle(
    "upload:start-local-server",
    async (_event, options: LocalUploadServerOptions) => {
      if (
        !options ||
        typeof options.failFirstAttempt !== "boolean" ||
        !Number.isInteger(options.delayMs) ||
        options.delayMs < 0 ||
        options.delayMs > 2000
      )
        throw new Error("测试服务参数无效");
      if (starting) await starting;
      if (serverWorker && serverInfo) {
        serverWorker.postMessage({ type: "configure", options });
        serverInfo = { ...serverInfo, ...options };
        return serverInfo;
      }
      starting = new Promise<LocalUploadServerInfo>((resolve, reject) => {
        const worker = new Worker(UPLOAD_SERVER_WORKER_PATH, {
          workerData: {
            directory: UPLOAD_RECEIVER_DIR,
            port: 17891,
            ...options,
          },
        });
        serverWorker = worker;
        worker.on("message", (message) => {
          if (message.type === "ready") {
            serverInfo = {
              endpoint: message.endpoint,
              directory: UPLOAD_RECEIVER_DIR,
              ...options,
            };
            resolve(serverInfo);
          } else if (message.type === "error") reject(new Error(message.error));
        });
        worker.on("error", reject);
        worker.on("exit", () => {
          serverWorker = undefined;
          serverInfo = undefined;
          reject(new Error("本机测试服务已停止"));
        });
      });
      try {
        return await starting;
      } finally {
        starting = undefined;
      }
    },
  );
  let quitting = false;
  let shutdownComplete = false;
  app.on("before-quit", (event) => {
    if (shutdownComplete) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    void Promise.allSettled([manager.close(), serverWorker?.terminate()]).then(
      () => {
        shutdownComplete = true;
        app.quit();
      },
    );
  });
}
