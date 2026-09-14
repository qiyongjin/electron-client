import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { extractBundle } from "../dist/main/main/utility/installer/installer.js";
import { AgentRuntime } from "../dist/main/main/utility/runtime/agent-runtime.js";
import { AgentStorage } from "../dist/main/main/agent/AgentStorage.js";
import {
  launchConfig,
  parseManifest,
} from "../dist/main/main/agent/manifest.js";
import {
  makeBundle,
  demoEntries,
  demoManifest,
  demoSource,
} from "../scripts/agent-fixture.mjs";
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "seven-agent-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
test("DXT and MCPB install valid bundles without executing code, reject unsupported manifests", async (t) => {
  const dir = await fixture(t);
  for (const extension of ["dxt", "mcpb"]) {
    const manifest =
      extension === "dxt"
        ? { ...demoManifest, manifest_version: undefined, dxt_version: "0.1" }
        : demoManifest;
    const archive = path.join(dir, "test." + extension);
    await writeFile(archive, makeBundle(demoEntries(manifest)));
    const result = await extractBundle(archive, path.join(dir, extension));
    assert.equal(result.manifest.name, demoManifest.name);
    assert.match(result.archiveHash, /^[a-f0-9]{64}$/);
  }
  assert.throws(() =>
    parseManifest({
      ...demoManifest,
      server: { ...demoManifest.server, type: "uv" },
    }),
  );
});

test("legacy dxt_version accepts supported schema versions and reports unsupported or conflicting versions clearly", async (t) => {
  const dir = await fixture(t);
  for (const version of ["0.1", "0.2", "0.3"]) {
    const manifest = { ...demoManifest, manifest_version: undefined, dxt_version: version };
    const archive = path.join(dir, `legacy-${version}.dxt`);
    await writeFile(archive, makeBundle(demoEntries(manifest)));
    assert.equal((await extractBundle(archive, path.join(dir, version))).manifest.dxt_version, version);
  }
  assert.throws(() => parseManifest({ ...demoManifest, manifest_version: undefined, dxt_version: "9.9" }), /dxt_version.*0.1、0.2、0.3/);
  assert.throws(() => parseManifest({ ...demoManifest, dxt_version: "0.2" }), /不一致/);
});

test("installer reports monotonic real hash, extraction and validation progress without claiming committed success", async (t) => {
  const dir = await fixture(t);
  const archive = path.join(dir, "progress.mcpb");
  const bundle = makeBundle([...demoEntries(), { name: "data.txt", data: "x".repeat(200000) }]);
  await writeFile(archive, bundle);
  const events = [];
  await extractBundle(archive, path.join(dir, "package"), (progress) => events.push(progress));
  assert.deepEqual([...new Set(events.map((event) => event.phase))], ["hashing", "extracting", "validating"]);
  assert.equal(events[0].totalBytes, bundle.length);
  assert.equal(events.at(-1).processedEntries, 3);
  assert.equal(events.at(-1).totalEntries, 3);
  for (let i = 1; i < events.length; i++) assert(events[i].percent >= events[i - 1].percent);
  assert(events.every((event) => event.percent < 100));
});

test("stdout banners and structured logs do not corrupt MCP initialization; secrets stay redacted", async (t) => {
  const dir = await fixture(t);
  await writeFile(path.join(dir, "server.cjs"),
    "console.log('Agent starting '+process.env.AGENT_TOKEN);console.log(JSON.stringify({level:'info',message:'ready'}));\n" + demoSource);
  const events = [];
  const runtime = new AgentRuntime((event) => events.push(event));
  try {
    await runtime.start({ manifest: demoManifest, directory: dir, config: { token: "stdout-secret" }, variables: {}, nodeExecutable: process.execPath, pythonExecutable: "python3" });
    assert.equal((await runtime.request("tools/list")).tools[0].name, "echo");
    assert(events.some((event) => event.type === "log" && event.message.includes("[stdout] Agent starting [REDACTED]")));
    assert(!JSON.stringify(events).includes("stdout-secret"));
  } finally { await runtime.stop(); }
});

test("malformed JSON-RPC and excessive stdout noise still fail instead of pretending to initialize", async (t) => {
  const dir = await fixture(t);
  for (const [source, pattern] of [
    ["console.log('{\"jsonrpc\":');setInterval(()=>{},1000)", /损坏/],
    ["console.log(JSON.stringify({jsonrpc:'1.0',id:1,result:{}}));setInterval(()=>{},1000)", /无效/],
    ["console.log('x'.repeat(70000));setInterval(()=>{},1000)", /非协议内容/],
  ]) {
    await writeFile(path.join(dir, "server.cjs"), source);
    const runtime = new AgentRuntime(() => {});
    t.after(() => runtime.stop());
    await assert.rejects(runtime.start({ manifest: demoManifest, directory: dir, config: {}, variables: {}, nodeExecutable: process.execPath, pythonExecutable: "python3" }), pattern);
  }
});
test("installer rejects traversal, links, CRC errors, case collisions and ZIP bombs", async (t) => {
  const dir = await fixture(t);
  const malicious = [
    { name: "../outside", data: "bad" },
    { name: "C:/outside", data: "bad" },
    { name: "link", data: "../outside", mode: 0o120777 },
    { name: "bad", data: "bad", crc: 1 },
    { name: "huge", data: "x", uncompressedSize: 3 * 1024 ** 3 },
  ];
  for (let index = 0; index < malicious.length; index++) {
    const archive = path.join(dir, index + ".mcpb");
    await writeFile(archive, makeBundle([...demoEntries(), malicious[index]]));
    await assert.rejects(extractBundle(archive, path.join(dir, "out" + index)));
  }
  const archive = path.join(dir, "collision.mcpb");
  await writeFile(
    archive,
    makeBundle([...demoEntries(), { name: "SERVER.CJS", data: "bad" }]),
  );
  await assert.rejects(extractBundle(archive, path.join(dir, "collision")));
});
test("storage recovers records, stores configuration through codec and removes installation", async (t) => {
  const dir = await fixture(t);
  const storage = new AgentStorage(dir, {
    encode: (text) => Buffer.from(text).toString("base64"),
    decode: (text) => Buffer.from(text, "base64").toString(),
  });
  await storage.initialize();
  const stage = await storage.stage();
  await mkdir(path.join(stage, "package"));
  const record = {
    id: "a".repeat(32),
    manifest: demoManifest,
    installedAt: Date.now(),
    archiveHash: "b".repeat(64),
  };
  await storage.commit(stage, record);
  await storage.saveConfig(record, { token: "secret" });
  assert(
    !(
      await readFile(
        path.join(storage.directory(record.id), "config.json"),
        "utf8",
      )
    ).includes("secret"),
  );
  assert.equal((await storage.records()).length, 1);
  assert.equal((await storage.config(record.id)).token, "secret");
  await storage.remove(record.id);
  assert.equal((await storage.records()).length, 0);
  assert.throws(() => storage.directory("../outside"));
});
test("configuration substitutes paths and array arguments; missing required settings reject", () => {
  const manifest = {
    ...demoManifest,
    user_config: {
      paths: {
        type: "directory",
        title: "路径",
        multiple: true,
        required: true,
      },
    },
    server: {
      ...demoManifest.server,
      mcp_config: {
        command: "node",
        args: ["${__dirname}/server.cjs", "${user_config.paths}"],
      },
    },
  };
  const config = launchConfig(
    manifest,
    "/installed",
    { paths: ["/a b", "/c"] },
    { HOME: "/home" },
  );
  assert.deepEqual(config.args, ["/installed/server.cjs", "/a b", "/c"]);
  assert.throws(() => launchConfig(manifest, "/installed", {}, {}));
});
test("runtime initializes MCP, calls tools, redacts secrets and stops child", async (t) => {
  const dir = await fixture(t);
  const archive = path.join(dir, "demo.mcpb");
  await writeFile(archive, makeBundle(demoEntries()));
  await extractBundle(archive, path.join(dir, "package"));
  const events = [];
  const runtime = new AgentRuntime((event) => events.push(event));
  t.after(() => runtime.stop());
  await runtime.start({
    manifest: demoManifest,
    directory: path.join(dir, "package"),
    config: { token: "super-secret-token" },
    variables: { HOME: dir },
    nodeExecutable: process.execPath,
    pythonExecutable: "python3",
  });
  assert.equal((await runtime.request("tools/list")).tools[0].name, "echo");
  assert.equal(
    (
      await runtime.request("tools/call", {
        name: "echo",
        arguments: { text: "你好" },
      })
    ).content[0].text,
    "你好",
  );
  assert(!JSON.stringify(events).includes("super-secret-token"));
  await runtime.stop();
  assert(events.some((event) => event.state === "stopped"));
});
test("runtime rejects bad initialize and child crash without leaving requests pending", async (t) => {
  const dir = await fixture(t);
  await writeFile(path.join(dir, "server.cjs"), demoEntries()[1].data);
  const runtime = new AgentRuntime(() => {});
  t.after(() => runtime.stop());
  await runtime.start({
    manifest: demoManifest,
    directory: dir,
    config: {},
    variables: {},
    nodeExecutable: process.execPath,
    pythonExecutable: "python3",
  });
  await assert.rejects(
    runtime.request("tools/call", { name: "crash", arguments: {} }),
  );
  await runtime.stop();
  const missing = new AgentRuntime(() => {});
  await assert.rejects(
    missing.start({
      manifest: {
        ...demoManifest,
        server: {
          type: "binary",
          entry_point: "absent",
          mcp_config: { command: "absent" },
        },
      },
      directory: dir,
      config: {},
      variables: {},
      nodeExecutable: process.execPath,
      pythonExecutable: "python3",
    }),
  );
});
