import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { AgentStorage } from "../dist/main/main/agent/AgentStorage.js";
import { AgentRegistry } from "../dist/main/main/agent/AgentRegistry.js";
import { demoManifest } from "../scripts/agent-fixture.mjs";

const require = createRequire(import.meta.url);
async function setup(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "seven-install-lifecycle-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const storage = new AgentStorage(root, { encode: (value) => value, decode: (value) => value });
  await storage.initialize();
  const children = [];
  const events = [];
  const { outputText } = ts.transpileModule(readFileSync(new URL("../src/main/agent/AgentInstallManager.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, setTimeout, clearTimeout,
    require: (name) => name === "electron" ? { utilityProcess: { fork: () => {
      const child = new EventEmitter();
      child.kill = () => { child.killed = true; return true; };
      child.postMessage = (message) => { child.request = message; };
      children.push(child);
      queueMicrotask(() => child.emit("spawn"));
      return child;
    } } } : require(name),
  });
  const registry = new AgentRegistry(() => {});
  const manager = new exports.AgentInstallManager(storage, registry, "installer.js", (event) => events.push(event));
  const waitForChild = async (index = 0) => {
    for (let attempt = 0; attempt < 100 && !children[index]?.request; attempt++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert(children[index]?.request, "installer did not spawn");
    return children[index];
  };
  const finish = async (child) => {
    await mkdir(child.request.destination, { recursive: true });
    await writeFile(path.join(child.request.destination, "marker.txt"), "test package");
    child.emit("message", { result: { manifest: demoManifest, archiveHash: "b".repeat(64) } });
  };
  return { root, storage, registry, manager, events, waitForChild, finish };
}

test("progress messages do not resolve installation; only exit and atomic commit produce completed", async (t) => {
  const f = await setup(t);
  let settled = false;
  const installing = f.manager.install("demo.mcpb", "task").then((result) => { settled = true; return result; });
  const child = await f.waitForChild();
  child.emit("message", { type: "progress", progress: { phase: "hashing", percent: 12, message: "hashing" } });
  child.emit("message", { type: "progress", progress: { phase: "extracting", percent: 50, message: "extracting" } });
  await f.finish(child);
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(f.registry.list().length, 0);
  child.emit("exit", 0);
  const installed = await installing;
  assert.equal(installed.manifest.name, demoManifest.name);
  assert.equal(f.manager.snapshot().phase, "completed");
  assert.equal(f.manager.snapshot().percent, 100);
  assert.equal(f.manager.cancel("task"), false);
});

test("cancel waits for worker exit, cleans staging, preserves installed records and permits retry", async (t) => {
  const f = await setup(t);
  const existing = { id: "a".repeat(32), manifest: demoManifest, archiveHash: "c".repeat(64), installedAt: Date.now() };
  const stage = await f.storage.stage();
  await f.storage.commit(stage, existing);
  f.registry.add(existing);
  const pending = f.manager.install("demo.mcpb", "cancel-me");
  const child = await f.waitForChild();
  await f.finish(child);
  assert.equal(f.manager.cancel("other-task"), false);
  assert.equal(f.manager.cancel("cancel-me"), true);
  assert.equal(child.killed, true);
  assert.equal(f.manager.snapshot().phase, "cancelling");
  assert((await readdir(f.root)).some((entry) => entry.startsWith(".stage-")));
  child.emit("exit", 1);
  assert.equal(await pending, null);
  assert.equal(f.manager.snapshot().phase, "cancelled");
  assert.deepEqual(await readdir(f.root), [existing.id]);
  assert.equal(f.registry.list().length, 1);
  const retry = f.manager.install("next.mcpb", "retry");
  const next = await f.waitForChild(1);
  assert.equal(f.manager.cancel("retry"), true);
  next.emit("exit", 1);
  assert.equal(await retry, null);
});

test("worker errors clean staging and expose a readable terminal failure", async (t) => {
  const f = await setup(t);
  const pending = f.manager.install("invalid.dxt", "invalid");
  const rejected = assert.rejects(pending, /清单无效/);
  const child = await f.waitForChild();
  child.emit("message", { type: "progress", progress: { phase: "validating", percent: 92, message: "validating" } });
  child.emit("message", { error: "安装包清单无效" });
  child.emit("exit", 0);
  await rejected;
  assert.equal(f.manager.snapshot().phase, "failed");
  assert.equal(f.manager.snapshot().error, "安装包清单无效");
  assert.deepEqual(await readdir(f.root), []);
  assert.equal(f.registry.list().length, 0);
});
