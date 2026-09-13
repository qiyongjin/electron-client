import { createServer, type IncomingMessage } from "node:http";
import { mkdir, readFile, writeFile, rename, rm, open } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  chunkBytes,
  validateManifest,
  HASH_PATTERN,
  ID_PATTERN,
  type UploadManifest,
} from "./protocol.js";

class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function jsonBody(request: IncomingMessage) {
  let value = "";
  let bytes = 0;
  for await (const block of request) {
    bytes += block.length;
    if (bytes > 8192) throw new RequestError(413, "Metadata too large");
    value += block.toString();
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new RequestError(400, "Invalid JSON");
  }
}
async function digest(filename: string) {
  const hash = createHash("sha256");
  let size = 0;
  for await (const block of createReadStream(filename)) {
    hash.update(block);
    size += block.length;
  }
  return { hash: hash.digest("hex"), size };
}
export async function startUploadTestServer(options: {
  directory: string;
  port?: number;
  failFirstAttempt?: boolean;
  delayMs?: number;
}) {
  await mkdir(options.directory, { recursive: true });
  const failures = new Set<string>();
  const busy = new Set<string>();
  const settings = {
    failFirstAttempt: options.failFirstAttempt ?? false,
    delayMs: options.delayMs ?? 0,
  };
  const server = createServer(async (request, response) => {
    const reply = (status: number, body: unknown) => {
      if (!response.destroyed) {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(body));
      }
    };
    try {
      if (request.method === "POST" && request.url === "/uploads/init") {
        let meta: UploadManifest;
        try {
          meta = validateManifest(await jsonBody(request));
        } catch (error) {
          throw new RequestError(400, String(error));
        }
        const id = `${meta.fileHash}-${meta.chunkSize}`;
        const directory = path.join(options.directory, id);
        await mkdir(directory, { recursive: true });
        const manifestPath = path.join(directory, "manifest.json");
        try {
          await writeFile(manifestPath, JSON.stringify(meta), { flag: "wx" });
        } catch (error: any) {
          if (error.code !== "EEXIST") throw error;
          const previous = JSON.parse(await readFile(manifestPath, "utf8"));
          if (
            previous.size !== meta.size ||
            previous.chunkSize !== meta.chunkSize ||
            previous.fileHash !== meta.fileHash
          )
            throw new RequestError(409, "Manifest mismatch");
        }
        const uploaded: number[] = [];
        // Verify stored data, not just filenames, when resuming after a crash.
        for (let index = 0; index < meta.totalChunks; index++) {
          try {
            const saved = JSON.parse(
              await readFile(path.join(directory, `${index}.json`), "utf8"),
            );
            const actual = await digest(path.join(directory, `${index}.part`));
            if (
              actual.hash === saved.hash &&
              actual.size === chunkBytes(meta, index)
            )
              uploaded.push(index);
          } catch (error: any) {
            if (error.code !== "ENOENT")
              console.warn(
                "[upload-server] Cannot verify chunk",
                index,
                error.message,
              );
          }
        }
        reply(200, { uploadId: id, uploaded });
        return;
      }
      const route = /^\/uploads\/([^/]+)\/(?:chunks\/(\d+)|(complete))$/.exec(
        request.url ?? "",
      );
      if (!route || !ID_PATTERN.test(route[1]))
        throw new RequestError(404, "Unknown upload route");
      const id = route[1];
      const directory = path.join(options.directory, id);
      let meta: UploadManifest;
      try {
        meta = validateManifest(
          JSON.parse(
            await readFile(path.join(directory, "manifest.json"), "utf8"),
          ),
        );
      } catch {
        throw new RequestError(404, "Upload not initialized");
      }
      if (route[2] !== undefined && request.method === "PUT") {
        const index = Number(route[2]);
        const hash = request.headers["x-chunk-sha256"];
        if (
          !Number.isSafeInteger(index) ||
          index >= meta.totalChunks ||
          typeof hash !== "string" ||
          !HASH_PATTERN.test(hash)
        )
          throw new RequestError(400, "Invalid chunk");
        const key = `${id}/${index}`;
        if (busy.has(id) || busy.has(key))
          throw new RequestError(503, "Upload busy; retry");
        if (settings.failFirstAttempt && !failures.has(key)) {
          failures.add(key);
          request.resume();
          throw new RequestError(503, "Injected first-attempt failure");
        }
        busy.add(key);
        const temp = path.join(directory, `${index}.${randomUUID()}.tmp`);
        try {
          if (settings.delayMs) await delay(settings.delayMs);
          const file = await open(temp, "wx");
          const chunkHash = createHash("sha256");
          let size = 0;
          try {
            for await (const block of request) {
              size += block.length;
              if (size > chunkBytes(meta, index))
                throw new RequestError(413, "Chunk too large");
              chunkHash.update(block);
              let offset = 0;
              while (offset < block.length) {
                const result = await file.write(block, offset);
                offset += result.bytesWritten;
              }
            }
          } finally {
            await file.close();
          }
          if (
            size !== chunkBytes(meta, index) ||
            chunkHash.digest("hex") !== hash
          )
            throw new RequestError(422, "Chunk checksum/size mismatch");
          await rename(temp, path.join(directory, `${index}.part`));
          const metadataTemp = temp + ".json";
          try {
            await writeFile(metadataTemp, JSON.stringify({ hash, size }));
            await rename(metadataTemp, path.join(directory, `${index}.json`));
          } finally {
            await rm(metadataTemp, { force: true });
          }
          reply(200, { index, hash, size });
        } finally {
          busy.delete(key);
          await rm(temp, { force: true });
        }
        return;
      }
      if (route[3] && request.method === "POST") {
        if (busy.has(id) || [...busy].some((key) => key.startsWith(id + "/")))
          throw new RequestError(503, "Upload busy; retry");
        busy.add(id);
        const temp = path.join(directory, `merged.${randomUUID()}.tmp`);
        const storageName = `${id}.bin`;
        try {
          const output = await open(temp, "wx");
          const wholeHash = createHash("sha256");
          let total = 0;
          try {
            for (let index = 0; index < meta.totalChunks; index++) {
              let saved;
              try {
                saved = JSON.parse(
                  await readFile(path.join(directory, `${index}.json`), "utf8"),
                );
              } catch {
                throw new RequestError(
                  409,
                  `Missing chunk ${index}; resume upload`,
                );
              }
              const hash = createHash("sha256");
              let size = 0;
              try {
                for await (const block of createReadStream(
                  path.join(directory, `${index}.part`),
                )) {
                  size += block.length;
                  total += block.length;
                  hash.update(block);
                  wholeHash.update(block);
                  let offset = 0;
                  while (offset < block.length) {
                    const result = await output.write(block, offset);
                    offset += result.bytesWritten;
                  }
                }
              } catch {
                throw new RequestError(
                  409,
                  `Cannot read chunk ${index}; resume upload`,
                );
              }
              if (
                size !== chunkBytes(meta, index) ||
                hash.digest("hex") !== saved.hash
              )
                throw new RequestError(
                  409,
                  `Corrupted chunk ${index}; resume upload`,
                );
            }
          } finally {
            await output.close();
          }
          if (total !== meta.size || wholeHash.digest("hex") !== meta.fileHash)
            throw new RequestError(422, "Whole-file checksum mismatch");
          await rename(temp, path.join(options.directory, storageName));
          reply(200, { fileHash: meta.fileHash, size: total, storageName });
        } finally {
          busy.delete(id);
          await rm(temp, { force: true });
        }
        return;
      }
      throw new RequestError(405, "Method not allowed");
    } catch (error) {
      reply(error instanceof RequestError ? error.status : 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  server.requestTimeout = 5 * 60 * 1000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 17891, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  return {
    endpoint: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 17891}`,
    configure(next: typeof settings) {
      Object.assign(settings, next);
      failures.clear();
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
