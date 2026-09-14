// Real Electron utility processes and local fixtures; no windows, model requests or user installation data.
import { app } from "electron";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentManager } from "../dist/main/main/agent/AgentManager.js";
import { AgentStorage } from "../dist/main/main/agent/AgentStorage.js";
import { demoEntries, demoManifest, demoSource, makeBundle } from "../scripts/agent-fixture.mjs";

const project = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(path.join(os.tmpdir(), "seven-agent-utility-"));
await mkdir(path.join(directory, "userData"));
app.setPath("userData", path.join(directory, "userData"));
app.disableHardwareAcceleration();
let manager;
let status = 0;
const timeout = setTimeout(() => { console.error("Agent utility smoke timed out"); app.exit(1); }, 45000);
try {
  await app.whenReady();
  const storage = new AgentStorage(path.join(directory, "agents"), { encode: (value) => value, decode: (value) => value });
  const progress = [];
  manager = new AgentManager(storage,
    path.join(project, "dist/main/main/utility/installer/installer.js"),
    path.join(project, "dist/main/main/utility/runtime/agent-runtime.js"), {}, "python", () => {},
    (event) => {
      progress.push(event);
      if (event.id === "cancel-test" && event.phase === "extracting") manager.installer.cancel(event.id);
    });
  await manager.initialize();
  const manifest = { ...demoManifest, manifest_version: undefined, dxt_version: "0.2" };
  const archive = path.join(directory, "legacy.dxt");
  await writeFile(archive, makeBundle([
    { name: "manifest.json", data: JSON.stringify(manifest) },
    { name: "server.cjs", data: "console.log('startup banner');\n" + demoSource },
  ]));
  const installed = await manager.install(archive, "install-test");
  assert(installed);
  assert.equal(installed.state, "stopped");
  assert.deepEqual([...new Set(progress.map((event) => event.phase))], ["preparing", "hashing", "extracting", "validating", "committing", "completed"]);
  assert.equal(progress.at(-1).percent, 100);
  await manager.start(installed.id);
  assert.equal((await manager.listTools(installed.id))[0].name, "echo");
  assert.equal((await manager.callTool(installed.id, "echo", { text: "stdio + progress" })).content[0].text, "stdio + progress");
  assert(manager.runtime.logs(installed.id).some((entry) => entry.message.includes("[stdout] startup banner")));
  await manager.stop(installed.id);
  await assert.rejects(manager.install(archive, "duplicate-test"), /已安装/);
  assert.equal(manager.list().length, 1);

  const cancelArchive = path.join(directory, "cancel.mcpb");
  await writeFile(cancelArchive, makeBundle([
    ...demoEntries({ ...demoManifest, name: "cancel-example" }),
    { name: "data.txt", data: "x".repeat(8 * 1024 ** 2) },
  ]));
  assert.equal(await manager.install(cancelArchive, "cancel-test"), null);
  assert.equal(manager.installer.snapshot().phase, "cancelled");
  assert.deepEqual(await readdir(storage.root), [installed.id]);
  assert.equal(manager.list().length, 1);
  assert.equal((await storage.records()).length, 1);
  const retried = await manager.install(cancelArchive, "retry-test");
  assert(retried);
  assert.equal(manager.list().length, 2);
  await manager.uninstall(retried.id);
  await manager.uninstall(installed.id);
  assert.deepEqual(await readdir(storage.root), []);
  console.log("PASS: real UtilityProcess DXT 0.2 install, progress, stdout banner/MCP tools, duplicate preservation, cancellation/cleanup, retry and uninstall");
} catch (error) {
  status = 1;
  console.error(error);
} finally {
  try {
    await manager?.close();
    // Only remove the test directory created above, after all utility/Agent processes have exited.
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("seven-agent-utility-"))
      throw new Error("Unexpected smoke test directory");
    await rm(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
  } catch (error) { status = 1; console.error(error); }
  clearTimeout(timeout);
  app.exit(status);
}
