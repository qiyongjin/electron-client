import { app, BrowserWindow, dialog } from "electron";
import { mkdtemp, writeFile, mkdir, readFile, readdir } from "node:fs/promises";
import { rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { makeBundle, demoEntries } from "../scripts/agent-fixture.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
async function main() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "seven-agent-electron-"),
  );
  await mkdir(path.join(directory, "userData"));
  app.setPath("home", directory);
  app.setPath("userData", path.join(directory, "userData"));
  const timer = setTimeout(() => {
    console.error("Agent smoke timed out");
    app.exit(1);
  }, 60000);
  let manager;
  try {
    await app.whenReady();
    const { setupAgentIpc } = await import(
      "../dist/main/main/ipc/agent.ipc.js"
    );
    const { setupUploadIpc } = await import(
      "../dist/main/main/ipc/uploadIpc.js"
    );
    setupUploadIpc();
    manager = await setupAgentIpc();
    const archive = path.join(directory, "demo.mcpb");
    await writeFile(archive, makeBundle(demoEntries()));
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [archive],
    });
    dialog.showMessageBox = async () => { throw new Error("Agent confirmation must use a client component"); };
    const win = new BrowserWindow({
      width: 1180,
      height: 880,
      show: false,
      webPreferences: {
        preload: path.join(root, "dist/preload/preload/preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    await win.loadFile(path.join(root, "dist/renderer/index.html"), {
      hash: "/agent",
    });
    const evaluate = (code) => win.webContents.executeJavaScript(code);
    const install = () => evaluate("(async () => { const source = await window.electronAPI.agent.choosePackage(); return window.electronAPI.agent.install(source.id); })()");
    const installed = await install();
    assert.equal(installed.state, "stopped");
    await assert.rejects(
      install(),
      /已安装/,
    );
    await evaluate(
      `window.electronAPI.agent.saveConfig(${JSON.stringify(installed.id)},{token:'smoke-secret'})`,
    );
    const config = await evaluate(
      `window.electronAPI.agent.getConfig(${JSON.stringify(installed.id)})`,
    );
    assert(!config.values.token);
    assert.deepEqual(config.configuredSecrets, ["token"]);
    const configFile = await readFile(
      path.join(
        directory,
        "userData/seven_app/agents",
        installed.id,
        "config.json",
      ),
      "utf8",
    );
    assert(!configFile.includes("smoke-secret"));
    await evaluate(
      `window.electronAPI.agent.start(${JSON.stringify(installed.id)})`,
    );
    const tools = await evaluate(
      `window.electronAPI.agent.listTools(${JSON.stringify(installed.id)})`,
    );
    assert.equal(tools[0].name, "echo");
    const result = await evaluate(
      `window.electronAPI.agent.callTool(${JSON.stringify(installed.id)},'echo',{text:'真实 Electron Agent'})`,
    );
    assert.equal(result.content[0].text, "真实 Electron Agent");
    await new Promise((resolve) => {
      win.webContents.once("did-finish-load", resolve);
      win.reload();
    });
    const agents = await evaluate("window.electronAPI.agent.list()");
    assert.equal(agents[0].state, "running");
    await evaluate(
      "[...document.querySelectorAll('button')].find(button=>button.textContent==='配置与工具').click()",
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    const screenshot = await win.webContents.capturePage();
    await writeFile("/tmp/seven-agent-smoke.png", screenshot.toPNG());
    const logs = await evaluate(
      `window.electronAPI.agent.logs(${JSON.stringify(installed.id)})`,
    );
    assert(!JSON.stringify(logs).includes("smoke-secret"));
    await evaluate(
      `window.electronAPI.agent.stop(${JSON.stringify(installed.id)})`,
    );
    await evaluate(
      `window.electronAPI.agent.start(${JSON.stringify(installed.id)})`,
    );
    assert(
      await evaluate(
        `window.electronAPI.agent.uninstall(${JSON.stringify(installed.id)})`,
      ),
    );
    assert.equal((await evaluate("window.electronAPI.agent.list()")).length, 0);
    assert.equal(
      (await readdir(path.join(directory, "userData/seven_app/agents"))).length,
      0,
    );
    const finalAgent = await install();
    await evaluate(
      `window.electronAPI.agent.start(${JSON.stringify(finalAgent.id)})`,
    );
    const finalPid = (await evaluate("window.electronAPI.agent.list()"))[0].pid;
    app.once("will-quit", () => {
      try {
        assert.throws(() => process.kill(finalPid, 0));
        console.log("PASS: application quit waits for Agent child termination");
      } catch (error) {
        console.error(error);
        process.exitCode = 1;
      }
    });
    console.log(
      "PASS: UtilityProcess install + config encryption + MCP start/tools + refresh + stop/restart + uninstall",
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
