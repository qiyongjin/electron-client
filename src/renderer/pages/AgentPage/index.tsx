import AgentLibrary from "./AgentLibrary";
import { useEffect, useState } from "react";
import {
  UPLOAD_DEFAULT_CHUNK_BYTES,
  UPLOAD_DEFAULT_CONCURRENCY,
  type UploadSource,
  type UploadTask,
  type UploadStatus,
} from "../../../shared/types/upload";
import "./agent.css";

const labels: Record<UploadStatus, string> = {
  hashing: "计算文件指纹",
  uploading: "上传中",
  merging: "合并与校验",
  pausing: "正在暂停",
  paused: "已暂停",
  completed: "校验通过",
  failed: "上传失败",
  cancelled: "已取消",
};
function bytes(value: number) {
  if (!value) return "0 B";
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), 4);
  return `${(value / 1024 ** unit).toFixed(unit ? 1 : 0)} ${["B", "KiB", "MiB", "GiB", "TiB"][unit]}`;
}
const AgentPage = () => {
  const [page, setPage] = useState<"agents" | "uploads">("agents");
  const api = window.electronAPI?.upload;
  const [source, setSource] = useState<UploadSource | null>(null);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [endpoint, setEndpoint] = useState("http://127.0.0.1:17891");
  const [chunkSize, setChunkSize] = useState(UPLOAD_DEFAULT_CHUNK_BYTES);
  const [concurrency, setConcurrency] = useState(UPLOAD_DEFAULT_CONCURRENCY);
  const [failFirstAttempt, setFailFirstAttempt] = useState(false);
  const [delayMs, setDelayMs] = useState(0);
  const [server, setServer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!api || page !== "uploads") return;
    let mounted = true;
    let received = false;
    const unsubscribe = api.onTasks((next) => {
      received = true;
      if (mounted) setTasks(next);
    });
    void api
      .list()
      .then((next) => {
        if (mounted && !received) setTasks(next);
      })
      .catch((reason) => {
        if (mounted) setError(String(reason));
      });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [api, page]);
  async function action(key: string, run: () => Promise<unknown>) {
    setError("");
    setBusy(key);
    try {
      await run();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  }
  const completed = tasks.filter((task) => task.status === "completed").length;
  return (
    <main className="agent-page">
      <nav className="agent-page-tabs" aria-label="智能体工作区">
        <button
          aria-current={page === "agents" ? "page" : undefined}
          onClick={() => setPage("agents")}
        >
          本地 Agent
        </button>
        <button
          aria-current={page === "uploads" ? "page" : undefined}
          onClick={() => setPage("uploads")}
        >
          上传测试
        </button>
      </nav>
      {page === "agents" ? (
        <AgentLibrary />
      ) : (
        <>
          <section className="upload-heading">
            <div>
              <p className="upload-eyebrow">FILE TRANSFER LAB</p>
              <h1>大文件，也能从容传输。</h1>
              <p>分片并发上传，随时暂停续传。每一次完成，都经过完整性校验。</p>
            </div>
            <div className="upload-total">
              <strong>{String(completed).padStart(2, "0")}</strong>
              <span>已验证文件</span>
            </div>
          </section>
          {!api && (
            <p className="upload-notice">
              当前是浏览器预览。请在 Electron
              应用中打开此页面，使用本地文件与上传任务。
            </p>
          )}
          {error && (
            <p className="upload-error" role="alert">
              {error}
            </p>
          )}
          <div className="upload-layout">
            <section className="upload-panel">
              <div className="upload-section-title">
                <span>01 / 配置</span>
                <h2>创建上传任务</h2>
              </div>
              <button
                type="button"
                className="upload-picker"
                disabled={!api || !!busy}
                onClick={() =>
                  void action("choose", async () => {
                    const next = await api!.chooseFile();
                    if (next) setSource(next);
                  })
                }
              >
                <span className="upload-file-symbol" aria-hidden="true">
                  ↥
                </span>
                <strong>{source?.name ?? "选择本地文件"}</strong>
                <span>
                  {source
                    ? `${bytes(source.size)} · 点击重新选择`
                    : "任意格式 · 分片读取，无需整文件载入内存"}
                </span>
              </button>
              <label className="upload-field">
                服务端地址
                <input
                  value={endpoint}
                  onChange={(event) => setEndpoint(event.target.value)}
                  placeholder="http://127.0.0.1:17891"
                />
              </label>
              <div className="upload-fields">
                <label className="upload-field">
                  分片大小
                  <select
                    value={chunkSize}
                    onChange={(event) =>
                      setChunkSize(Number(event.target.value))
                    }
                  >
                    {[1, 4, 8, 16].map((size) => (
                      <option key={size} value={size * 1024 * 1024}>
                        {size} MiB
                      </option>
                    ))}
                  </select>
                </label>
                <label className="upload-field">
                  并发请求
                  <select
                    value={concurrency}
                    onChange={(event) =>
                      setConcurrency(Number(event.target.value))
                    }
                  >
                    {[1, 2, 3, 4, 6].map((count) => (
                      <option key={count} value={count}>
                        {count} 路并发
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                className="upload-primary"
                disabled={!api || !source || !!busy}
                onClick={() =>
                  void action("start", () =>
                    api!.start({
                      filePath: source!.path,
                      endpoint,
                      chunkSize,
                      concurrency,
                    }),
                  )
                }
              >
                {busy === "start" ? "创建中…" : "开始上传 ↗"}
              </button>
              <div className="upload-local">
                <h3>本机测试服务</h3>
                <p>
                  首次测试先启动服务，再开始上传。重新打开应用后也需启动服务，再继续历史任务。
                </p>
                <label className="upload-checkbox">
                  <input
                    type="checkbox"
                    checked={failFirstAttempt}
                    onChange={(event) =>
                      setFailFirstAttempt(event.target.checked)
                    }
                  />
                  每个分片首次请求失败，测试自动重试
                </label>
                <label className="upload-field">
                  每个分片延迟
                  <select
                    value={delayMs}
                    onChange={(event) => setDelayMs(Number(event.target.value))}
                  >
                    <option value={0}>无延迟</option>
                    <option value={500}>500 ms</option>
                    <option value={2000}>2 秒，便于测试暂停</option>
                  </select>
                </label>
                <button
                  className="upload-secondary"
                  disabled={!api || !!busy}
                  onClick={() =>
                    void action("server", async () => {
                      const info = await api!.startLocalServer({
                        failFirstAttempt,
                        delayMs,
                      });
                      setEndpoint(info.endpoint);
                      setServer(`服务已启动 · 文件保存于 ${info.directory}`);
                    })
                  }
                >
                  {busy === "server" ? "启动中…" : "启动 / 更新测试服务"}
                </button>
                {server && (
                  <p role="status" className="upload-server-info">
                    {server}
                  </p>
                )}
              </div>
            </section>
            <section className="upload-tasks">
              <div className="upload-section-title">
                <span>02 / 传输</span>
                <h2>
                  任务记录 <small>{tasks.length}</small>
                </h2>
              </div>
              <p className="upload-task-note">
                刷新页面不中断任务 · 重启应用后可继续 · 同时运行最多 2 个任务
              </p>
              {tasks.length === 0 ? (
                <div className="upload-empty">
                  <span aria-hidden="true">⇧</span>
                  <h3>等待第一份文件</h3>
                  <p>
                    选择文件并启动本机服务，
                    <br />
                    在这里观察 Hash、分片上传与最终校验。
                  </p>
                  <div>
                    SHA-256 <span>／</span> 断点续传 <span>／</span> 自动重试
                  </div>
                </div>
              ) : (
                tasks.map((task) => {
                  const percent = task.size
                    ? Math.min(
                        100,
                        ((task.status === "hashing"
                          ? task.hashBytes
                          : task.uploadedBytes) /
                          task.size) *
                          100,
                      )
                    : task.status === "completed"
                      ? 100
                      : 0;
                  const running = ["hashing", "uploading", "merging"].includes(
                    task.status,
                  );
                  return (
                    <article
                      key={task.id}
                      className={`upload-task upload-task-${task.status}`}
                    >
                      <div className="upload-task-top">
                        <h3 title={task.name}>{task.name}</h3>
                        <span className="upload-status">
                          {labels[task.status]}
                        </span>
                      </div>
                      <p className="upload-task-meta">
                        {bytes(task.size)} · {bytes(task.chunkSize)} / 片 ·{" "}
                        {task.concurrency} 路并发
                      </p>
                      <div className="upload-progress-label">
                        <span>
                          {task.status === "hashing"
                            ? "文件指纹计算"
                            : "服务端已确认数据"}
                        </span>
                        <strong>{percent.toFixed(1)}%</strong>
                      </div>
                      <progress
                        max={100}
                        value={percent}
                        aria-label={`${task.name} ${task.status === "hashing" ? "Hash" : "上传"}进度`}
                      />
                      <div className="upload-metrics">
                        <span>
                          {task.completedChunks} / {task.totalChunks} 片
                        </span>
                        <span>{bytes(task.uploadedBytes)} 已确认</span>
                        <span>{bytes(task.speed)} / s</span>
                        <span>重试 {task.retries} 次</span>
                      </div>
                      {task.fileHash && (
                        <details className="upload-details">
                          <summary>查看 SHA-256 与任务信息</summary>
                          <code>{task.fileHash}</code>
                          <p>源文件：{task.filePath}</p>
                          <p>服务：{task.endpoint}</p>
                          <p>任务：{task.id}</p>
                          {task.result && (
                            <p>服务端文件：{task.result.storageName}</p>
                          )}
                        </details>
                      )}
                      {task.error && (
                        <p className="upload-error">{task.error}</p>
                      )}
                      <div className="upload-task-bottom">
                        <span>
                          {task.status === "completed"
                            ? "✓ 整文件 SHA-256 与大小一致"
                            : task.status === "merging"
                              ? "数据已发送，等待合并并校验整文件…"
                              : new Date(task.createdAt).toLocaleString()}
                        </span>
                        <div>
                          {running && (
                            <button
                              disabled={!!busy}
                              onClick={() =>
                                void action(task.id, () => api!.pause(task.id))
                              }
                            >
                              暂停
                            </button>
                          )}
                          {["paused", "failed"].includes(task.status) && (
                            <button
                              disabled={!!busy}
                              onClick={() =>
                                void action(task.id, () => api!.resume(task.id))
                              }
                            >
                              继续上传
                            </button>
                          )}
                          {!["completed", "cancelled"].includes(
                            task.status,
                          ) && (
                            <button
                              disabled={!!busy}
                              onClick={() =>
                                void action(task.id, () => api!.cancel(task.id))
                              }
                            >
                              取消
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
};
export default AgentPage;
