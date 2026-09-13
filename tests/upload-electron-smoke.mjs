// Manual Electron integration smoke: uses an isolated temporary home, never ~/.seven.
import { app, BrowserWindow, dialog } from "electron";
import { mkdtemp, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../", import.meta.url));
async function main() {
  const directory = await mkdtemp(
    path.join(tmpdir(), "seven-electron-upload-"),
  );
  app.setPath("home", directory);
  app.setPath("userData", path.join(directory, "userData"));
  const timer = setTimeout(() => {
    console.error("Upload Electron smoke timed out");
    app.exit(1);
  }, 30000);
  try {
    await app.whenReady();
    const { setupUploadIpc } = await import(
      "../dist/main/main/ipc/uploadIpc.js"
    );
    setupUploadIpc();
    const source = path.join(directory, "electron-upload.bin");
    await writeFile(source, Buffer.alloc(16 * 1024 * 1024, 7));
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [source],
    });
    const win = new BrowserWindow({
      width: 1180,
      height: 900,
      show: false,
      webPreferences: {
        preload: path.join(root, "dist/preload/preload/preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    const evaluate = (code) => win.webContents.executeJavaScript(code);
    await win.loadFile(path.join(root, "dist/renderer/index.html"), {
      hash: "/agent",
    });
    const info = await evaluate(
      "window.electronAPI.upload.startLocalServer({failFirstAttempt:true,delayMs:300})",
    );
    const selected = await evaluate("window.electronAPI.upload.chooseFile()");
    assert.equal(selected.size, 16 * 1024 * 1024);
    const task = await evaluate(
      `window.electronAPI.upload.start(${JSON.stringify({ filePath: source, endpoint: info.endpoint, chunkSize: 1024 * 1024, concurrency: 3 })})`,
    );
    await new Promise((resolve) => {
      win.webContents.once("did-finish-load", resolve);
      win.reload();
    });
    let latest;
    for (let i = 0; i < 150; i++) {
      latest = (await evaluate("window.electronAPI.upload.list()")).find(
        (item) => item.id === task.id,
      );
      if (latest?.status === "completed" || latest?.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(latest.status, "completed", latest.error);
    assert(latest.retries > 0);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await evaluate("[...document.querySelectorAll('.agent-page-tabs button')].find(button=>button.textContent==='上传测试').click()");
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.match(
      await evaluate("document.body.innerText"),
      /整文件 SHA-256 与大小一致/,
    );
    const screenshot = await win.webContents.capturePage();
    await writeFile("/tmp/seven-upload-smoke.png", screenshot.toPNG());
    console.log(
      "PASS: Electron preload + upload IPC + Workers + page reload + merge checksum",
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
    app.once("will-quit", () => {
      rmSync(directory, { recursive: true, force: true });
      if (process.exitCode) app.exit(Number(process.exitCode));
    });
    app.quit();
  }
}
void main();
