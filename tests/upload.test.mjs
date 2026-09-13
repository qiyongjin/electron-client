import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, open, stat } from "node:fs/promises";
import os from "node:os";
import { createReadStream } from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { Worker } from "node:worker_threads";
import { startUploadTestServer } from "../dist/main/main/upload/testServer.js";
import { UploadTaskManager } from "../dist/main/main/upload/taskManager.js";

async function startPythonServer(options) {
  const args = [
    fileURLToPath(
      new URL("../resources/sevenapp/upload_server.py", import.meta.url),
    ),
    "--port",
    "0",
    "--directory",
    options.directory,
    "--delay-ms",
    String(options.delayMs ?? 0),
  ];
  if (options.failFirstAttempt) args.push("--fail-first");
  const child = spawn(
    process.env.SEVENAPP_PYTHON ??
      (process.platform === "win32" ? "python" : "python3"),
    args,
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let output = "";
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Python startup timeout: " + output));
    }, 10000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("Python exited " + code + ": " + output));
    });
    child.stderr.on("data", (block) => {
      output = (output + block).slice(-8192);
      const match = /Upload server: (http:\/\/127\.0\.0\.1:\d+)/.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  return {
    endpoint,
    close: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null) resolve();
        else {
          child.once("exit", resolve);
          child.kill();
        }
      }),
  };
}

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "seven-upload-"));
  const receiver = path.join(directory, "receiver");
  const server = await (
    process.env.SEVEN_UPLOAD_SERVER === "python"
      ? startPythonServer
      : startUploadTestServer
  )({
    directory: receiver,
    port: 0,
    ...options,
  });
  const cleanup = [];
  t.after(async () => {
    for (const dispose of cleanup) await dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, receiver, server, cleanup };
}
function task(filePath, size, endpoint, extra = {}) {
  return {
    id: "test",
    filePath,
    name: path.basename(filePath),
    size,
    endpoint,
    chunkSize: 1024 * 1024,
    concurrency: 3,
    totalChunks: Math.ceil(size / (1024 * 1024)),
    hashBytes: 0,
    uploadedBytes: 0,
    completedChunks: 0,
    retries: 0,
    speed: 0,
    status: "hashing",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...extra,
  };
}
function runWorker(task, onUpdate = () => {}) {
  const worker = new Worker(
    new URL("../dist/main/main/upload/upload.worker.js", import.meta.url),
    { workerData: { task, retryBaseMs: 20 } },
  );
  let final;
  const updates = [];
  const done = new Promise((resolve, reject) => {
    worker.on("error", reject);
    worker.on("message", (message) => {
      final = message.task;
      updates.push(final);
      onUpdate(final, worker);
    });
    worker.on("exit", (code) => {
      if (code || !final) reject(new Error(`Worker exited ${code}`));
      else resolve({ final, updates });
    });
  });
  return { worker, done };
}
async function waitFor(predicate, timeout = 20000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout)
      throw new Error("Timeout waiting for task");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test(
  "real Worker uploads 24 MiB concurrently, retries injected failures, and verifies byte-exact merged file",
  { timeout: 30000 },
  async (t) => {
    const { directory, receiver, server } = await fixture(t, {
      failFirstAttempt: true,
    });
    const data = randomBytes(24 * 1024 * 1024 + 71);
    const source = path.join(directory, "large.bin");
    await writeFile(source, data);
    const { final, updates } = await runWorker(
      task(source, data.length, server.endpoint),
    ).done;
    assert.equal(final.status, "completed", final.error);
    assert.equal(final.retries, 25);
    assert.equal(final.completedChunks, 25);
    assert.equal(final.uploadedBytes, data.length);
    assert.equal(
      final.fileHash,
      createHash("sha256").update(data).digest("hex"),
    );
    assert.deepEqual(
      await readFile(path.join(receiver, final.result.storageName)),
      data,
    );
    assert(updates.every((update) => update.uploadedBytes <= data.length));
    assert(updates.some((update) => update.status === "merging"));
  },
);

test(
  "pause and resume use server acknowledgments and ignore a corrupted stored chunk",
  { timeout: 30000 },
  async (t) => {
    const { directory, receiver, server } = await fixture(t, { delayMs: 220 });
    const data = randomBytes(12 * 1024 * 1024);
    const source = path.join(directory, "resume.bin");
    await writeFile(source, data);
    let stopped = false;
    const first = await runWorker(
      task(source, data.length, server.endpoint),
      (update, worker) => {
        if (!stopped && update.completedChunks >= 2) {
          stopped = true;
          worker.postMessage({ type: "pause" });
        }
      },
    ).done;
    assert.equal(first.final.status, "paused");
    assert(first.final.completedChunks < 12);
    const uploadDirectory = path.join(receiver, first.final.uploadId);
    await writeFile(path.join(uploadDirectory, "0.part"), "corrupted");
    const resumed = await runWorker(first.final).done;
    assert.equal(resumed.final.status, "completed", resumed.final.error);
    assert.deepEqual(
      await readFile(path.join(receiver, resumed.final.result.storageName)),
      data,
    );
    assert(
      resumed.updates.some(
        (update) =>
          update.status === "uploading" &&
          update.completedChunks > 0 &&
          update.completedChunks < 12,
      ),
    );
  },
);

test(
  "task metadata survives manager restart; source modifications reject resume",
  { timeout: 30000 },
  async (t) => {
    const { directory, server, cleanup } = await fixture(t, { delayMs: 250 });
    const source = path.join(directory, "persistent.bin");
    const data = randomBytes(10 * 1024 * 1024);
    await writeFile(source, data);
    const store = path.join(directory, "tasks");
    const first = new UploadTaskManager(store);
    cleanup.push(() => first.close());
    const started = await first.start({
      filePath: source,
      endpoint: server.endpoint,
      chunkSize: 1024 * 1024,
      concurrency: 2,
    });
    await waitFor(() => first.list()[0].completedChunks > 0);
    await first.close();
    const second = new UploadTaskManager(store);
    cleanup.push(() => second.close());
    assert.equal(second.list()[0].status, "paused");
    assert.equal(second.list()[0].id, started.id);
    second.resume(started.id);
    await waitFor(() =>
      ["completed", "failed"].includes(second.list()[0].status),
    );
    assert.equal(second.list()[0].status, "completed", second.list()[0].error);
    const oldTask = { ...second.list()[0], status: "paused" };
    await writeFile(source, Buffer.alloc(data.length, 1));
    const changed = await runWorker(oldTask).done;
    assert.equal(changed.final.status, "failed");
    assert.match(changed.final.error, /不一致/);
  },
);

test("empty files, checksum rejection, and missing chunks", async (t) => {
  const { directory, receiver, server } = await fixture(t);
  const source = path.join(directory, "empty");
  await writeFile(source, "");
  const { final } = await runWorker(task(source, 0, server.endpoint)).done;
  assert.equal(final.status, "completed", final.error);
  assert.equal(
    (await readFile(path.join(receiver, final.result.storageName))).length,
    0,
  );
  const data = Buffer.from("abc");
  const fileHash = createHash("sha256").update(data).digest("hex");
  const init = await fetch(server.endpoint + "/uploads/init", {
    method: "POST",
    body: JSON.stringify({
      name: "test",
      size: 3,
      fileHash,
      chunkSize: 3,
      totalChunks: 1,
    }),
  }).then((r) => r.json());
  const mismatch = await fetch(
    `${server.endpoint}/uploads/${init.uploadId}/chunks/0`,
    {
      method: "PUT",
      headers: { "x-chunk-sha256": "0".repeat(64) },
      body: data,
    },
  );
  assert.equal(mismatch.status, 422);
  const merge = await fetch(
    `${server.endpoint}/uploads/${init.uploadId}/complete`,
    { method: "POST" },
  );
  assert.equal(merge.status, 409);
});

test("unreachable server exhausts bounded retries, cancellation persists, and invalid options fail before Worker launch", async (t) => {
  const { directory, server, cleanup } = await fixture(t, { delayMs: 1000 });
  const source = path.join(directory, "cancel.bin");
  await writeFile(source, randomBytes(2 * 1024 * 1024));
  const manager = new UploadTaskManager(path.join(directory, "state"));
  cleanup.push(() => manager.close());
  await assert.rejects(
    manager.start({
      filePath: source,
      endpoint: server.endpoint,
      chunkSize: 1,
      concurrency: 99,
    }),
  );
  const job = await manager.start({
    filePath: source,
    endpoint: server.endpoint,
    chunkSize: 1024 * 1024,
    concurrency: 1,
  });
  await manager.cancel(job.id);
  assert.equal(manager.list()[0].status, "cancelled");
  const failed = await runWorker(
    task(source, 2 * 1024 * 1024, "http://127.0.0.1:1"),
  ).done;
  assert.equal(failed.final.status, "failed");
  assert.equal(failed.final.retries, 3);
});

test(
  "256 MiB file is streamed through Worker and merge without whole-file buffers",
  { timeout: 60000 },
  async (t) => {
    const { directory, receiver, server } = await fixture(t);
    const source = path.join(directory, "256MiB.bin");
    const size = 256 * 1024 * 1024;
    const file = await open(source, "w");
    await file.truncate(size);
    await file.close();
    const { final } = await runWorker(
      task(source, size, server.endpoint, {
        chunkSize: 4 * 1024 * 1024,
        totalChunks: 64,
      }),
    ).done;
    assert.equal(final.status, "completed", final.error);
    assert.equal(final.completedChunks, 64);
    const output = path.join(receiver, final.result.storageName);
    assert.equal((await stat(output)).size, size);
    const hash = createHash("sha256");
    for await (const block of createReadStream(output)) hash.update(block);
    assert.equal(hash.digest("hex"), final.fileHash);
  },
);
