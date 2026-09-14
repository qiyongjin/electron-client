import yauzl from "yauzl";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, stat, chmod } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";
import path from "node:path";
import { parseManifest, relativeFile } from "../../agent/manifest.js";
import type { AgentExtractionProgress } from "../../../shared/types/agent.js";
export async function extractBundle(archive: string, destination: string, onProgress: (progress: AgentExtractionProgress) => void = () => {}) {
  let lastProgress = 0;
  let lastPhase = "";
  const report = (progress: AgentExtractionProgress, force = false) => {
    const now = Date.now();
    if (force || progress.phase !== lastPhase || now - lastProgress >= 80) {
      lastPhase = progress.phase;
      lastProgress = now;
      onProgress(progress);
    }
  };
  if (![".dxt", ".mcpb"].includes(path.extname(archive).toLowerCase()))
    throw new Error("请选择 .dxt 或 .mcpb 安装包");
  const info = await stat(archive);
  if (!info.isFile() || info.size > 512 * 1024 * 1024)
    throw new Error("安装包须为普通文件且不超过 512 MiB");
  await mkdir(destination, { recursive: true });
  const hash = createHash("sha256");
  let hashedBytes = 0;
  report({ phase: "hashing", percent: 3, message: "正在计算安装包指纹", processedBytes: 0, totalBytes: info.size });
  for await (const data of createReadStream(archive)) {
    hash.update(data);
    hashedBytes += data.length;
    report({ phase: "hashing", percent: 3 + 22 * hashedBytes / Math.max(1, info.size), message: "正在计算安装包指纹", processedBytes: hashedBytes, totalBytes: info.size });
  }
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.open(
      archive,
      {
        lazyEntries: true,
        autoClose: true,
        strictFileNames: true,
        validateEntrySizes: true,
      },
      (error, file) => (error ? reject(error) : resolve(file!)),
    ),
  );
  let total = 0;
  let count = 0;
  const names = new Set<string>();
  report({ phase: "extracting", percent: 25, message: "正在解压并校验文件", processedEntries: 0, totalEntries: zip.entryCount, processedBytes: 0 });
  await new Promise<void>((resolve, reject) => {
    let failed = false;
    const fail = (error: unknown) => {
      if (!failed) {
        failed = true;
        zip.close();
        reject(error);
      }
    };
    zip.on("error", fail);
    zip.on("end", resolve);
    zip.on("entry", (entry: yauzl.Entry) => {
      void (async () => {
        const isDirectory = entry.fileName.endsWith("/");
        const relative = relativeFile(
          isDirectory ? entry.fileName.slice(0, -1) : entry.fileName,
        );
        const extracted = (bytes: number, force = false) => report({
          phase: "extracting", percent: 25 + 65 * ((count - 1 + (isDirectory || !entry.uncompressedSize ? 1 : bytes / entry.uncompressedSize)) / Math.max(1, zip.entryCount)),
          message: "正在解压并校验文件", currentFile: relative,
          processedEntries: Math.max(0, count - (bytes < entry.uncompressedSize ? 1 : 0)), totalEntries: zip.entryCount,
          processedBytes: total - entry.uncompressedSize + bytes,
        }, force);
        const normalized = relative.normalize("NFC").toLowerCase();
        if (names.has(normalized)) throw new Error(`包内路径重复: ${relative}`);
        names.add(normalized);
        const kind = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (
          entry.generalPurposeBitFlag & 1 ||
          ![0, 0x8000, 0x4000].includes(kind)
        )
          throw new Error("不支持加密文件、符号链接或特殊文件");
        if (
          ++count > 100000 ||
          (total += entry.uncompressedSize) > 2 * 1024 ** 3 ||
          entry.uncompressedSize > 512 * 1024 ** 2
        )
          throw new Error("解压文件数量或大小超出限制");
        if (relative === "manifest.json" && entry.uncompressedSize > 1024 ** 2)
          throw new Error("manifest.json 过大");
        const target = path.join(destination, relative);
        if (isDirectory) {
          await mkdir(target, { recursive: true });
          extracted(0);
          return;
        }
        await mkdir(path.dirname(target), { recursive: true });
        const input = await new Promise<NodeJS.ReadableStream>(
          (resolve, reject) =>
            zip.openReadStream(entry, (error, stream) =>
              error ? reject(error) : resolve(stream!),
            ),
        );
        let checksum = 0;
        let bytes = 0;
        const verify = new Transform({
          transform(chunk, _, callback) {
            bytes += chunk.length;
            if (bytes > entry.uncompressedSize)
              return callback(new Error("解压大小不匹配"));
            checksum = crc32(chunk, checksum);
            extracted(bytes);
            callback(null, chunk);
          },
        });
        await pipeline(
          input,
          verify,
          createWriteStream(target, { flags: "wx", mode: 0o600 }),
        );
        if (bytes !== entry.uncompressedSize || checksum !== entry.crc32)
          throw new Error(`文件校验失败: ${relative}`);
        if ((entry.externalFileAttributes >>> 16) & 0o111)
          await chmod(target, 0o700);
        extracted(bytes);
      })().then(() => {
        if (!failed) zip.readEntry();
      }, fail);
    });
    zip.readEntry();
  });
  report({ phase: "validating", percent: 92, message: "正在校验清单与启动入口", processedEntries: count, totalEntries: zip.entryCount, processedBytes: total }, true);
  const manifest = parseManifest(
    JSON.parse(await readFile(path.join(destination, "manifest.json"), "utf8")),
  );
  if (
    !(await stat(path.join(destination, manifest.server.entry_point))).isFile()
  )
    throw new Error("启动入口不是普通文件");
  return { manifest, archiveHash: hash.digest("hex") };
}
if (process.parentPort)
  process.parentPort.on("message", (event) => {
    if (event.data?.type !== "install") return;
    void extractBundle(event.data.archive, event.data.destination, (progress) => process.parentPort.postMessage({ type: "progress", progress }))
      .then(
        (result) => process.parentPort.postMessage({ result }),
        (error) =>
          process.parentPort.postMessage({
            error: error instanceof Error ? error.message : String(error),
          }),
      )
      .finally(() => setTimeout(() => process.exit(0), 20));
  });
