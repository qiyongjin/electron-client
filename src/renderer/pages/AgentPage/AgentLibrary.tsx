import { useEffect, useState } from "react";
import type {
  AgentConfig,
  AgentConfigValue,
  AgentLog,
  AgentTool,
  InstalledAgent,
  AgentInstallSource,
  AgentInstallProgress,
} from "../../../shared/types/agent";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { InstallProgressCard, installFinished } from "./InstallProgressCard";
const states = {
  stopped: "未启动",
  starting: "正在启动",
  running: "运行中",
  stopping: "正在停止",
  error: "运行异常",
};
export default function AgentLibrary() {
  const api = window.electronAPI?.agent;
  const [agents, setAgents] = useState<InstalledAgent[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string>();
  const [draft, setDraft] = useState<AgentConfig>({});
  const [secrets, setSecrets] = useState<string[]>([]);
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [toolName, setToolName] = useState("");
  const [args, setArgs] = useState("{}");
  const [result, setResult] = useState("");
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [installSource, setInstallSource] = useState<AgentInstallSource | null>(null);
  const [installProgress, setInstallProgress] = useState<AgentInstallProgress | null>(null);
  const [cancelTask, setCancelTask] = useState<string | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<InstalledAgent | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const current = agents.find((item) => item.id === selected);
  useEffect(() => {
    if (!api) return;
    let active = true;
    let received = false;
    let receivedProgress = false;
    const stopProgress = api.onInstallProgress((progress) => {
      receivedProgress = true;
      if (active) setInstallProgress(progress);
    });
    void api.getInstallProgress().then((progress) => {
      if (active && !receivedProgress) setInstallProgress(progress);
    }).catch((error) => { if (active) setError(String(error)); });
    const stop = api.onChanged((items) => {
      received = true;
      if (active) setAgents(items);
    });
    void api
      .list()
      .then((items) => {
        if (active && !received) setAgents(items);
      })
      .catch((error) => {
        if (active) setError(String(error));
      });
    return () => {
      active = false;
      stop();
      stopProgress();
    };
  }, [api]);
  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }
  async function inspect(id: string) {
    const config = await api!.getConfig(id);
    setDraft(config.values);
    setSecrets(config.configuredSecrets);
    setTools([]);
    setToolName("");
    setResult("");
    setLogs(await api!.logs(id));
    setSelected(id);
  }
  const update = (key: string, value: AgentConfigValue) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  return (
    <section className="agent-library">
      <div className="agent-library-heading">
        <div>
          <p className="upload-eyebrow">LOCAL AGENTS</p>
          <h1>你的本地智能体</h1>
          <p>安装一次，按需启动。让工具成为工作的一部分。</p>
        </div>
        <button
          className="upload-primary agent-install-button"
          disabled={!api || !!busy || !installFinished(installProgress)}
          onClick={() =>
            void run("choose", async () => {
              const source = await api!.choosePackage();
              if (source) setInstallSource(source);
            })
          }
        >
          {busy === "install" || !installFinished(installProgress) ? "正在安装…" : "＋ 安装 Agent"}
        </button>
      </div>
      <div className="agent-library-note">
        <span>.dxt / .mcpb</span>
        <span>安装后不自动运行</span>
        <span>位置：用户数据目录 / seven_app / agents</span>
      </div>
      {!api && (
        <p className="upload-notice">
          请在 Electron 中打开此页面，安装和运行本地 Agent。
        </p>
      )}
      {error && (
        <p role="alert" className="upload-error">
          {error}
        </p>
      )}
      {installProgress && <InstallProgressCard progress={installProgress} onCancel={() => {
        setConfirmError(""); setCancelTask(installProgress.id);
      }} />}
      {installSource && <ConfirmDialog title="安装智能体" confirmLabel="确认安装" onCancel={() => setInstallSource(null)}
        onConfirm={() => {
          const source = installSource;
          setInstallSource(null);
          setInstallProgress({ id: source.id, fileName: source.name, phase: "preparing", percent: 0, message: "正在准备安装", cancellable: false });
          void run("install", async () => {
            try {
              const installed = await api!.install(source.id);
              if (installed) await inspect(installed.id);
            } finally {
              // Also recovers errors rejected before the worker starts.
              const latest = await api!.getInstallProgress();
              setInstallProgress(latest);
            }
          });
        }}>
        <p className="client-confirm-filename">{installSource.name}</p>
        <p>大小：{(installSource.size / 1024 ** 2).toFixed(2)} MiB</p>
        <p>仅安装你信任的安装包。安装后不会自动启动；启动后，智能体可以访问本地文件和网络。</p>
      </ConfirmDialog>}
      {cancelTask && <ConfirmDialog title="取消此次安装？" confirmLabel="取消安装" cancelLabel="继续安装" danger
        pending={confirmBusy} onCancel={() => { setCancelTask(null); setConfirmError(""); }} onConfirm={() => {
          setConfirmBusy(true);
          setConfirmError("");
          void api!.cancelInstall(cancelTask).then((cancelled) => {
            if (!cancelled) setError("安装已进入完成阶段、已结束，或由其他窗口发起，无法取消。");
            setCancelTask(null);
          }).catch((error) => setConfirmError(error instanceof Error ? error.message : String(error)))
            .finally(() => setConfirmBusy(false));
        }}>
        <p>取消后将清理本次安装的临时文件，已安装的智能体和配置会保留。</p>
        {confirmError && <p className="upload-error" role="alert">{confirmError}</p>}
      </ConfirmDialog>}
      {uninstallTarget && <ConfirmDialog title="卸载智能体？" confirmLabel="确认卸载" danger pending={confirmBusy}
        onCancel={() => { setUninstallTarget(null); setConfirmError(""); }} onConfirm={() => {
          setConfirmBusy(true);
          setConfirmError("");
          void api!.uninstall(uninstallTarget.id).then(() => {
            if (selected === uninstallTarget.id) setSelected(undefined);
            setUninstallTarget(null);
          }).catch((error) => setConfirmError(error instanceof Error ? error.message : String(error)))
            .finally(() => setConfirmBusy(false));
        }}>
        <p className="client-confirm-filename">{uninstallTarget.manifest.display_name ?? uninstallTarget.manifest.name}</p>
        <p>将停止此智能体，并删除它的安装文件和保存的配置。</p>
        {confirmError && <p className="upload-error" role="alert">{confirmError}</p>}
      </ConfirmDialog>}
      <div className="agent-library-layout">
        <div className="agent-library-list">
          {agents.length === 0 ? (
            <div className="upload-empty">
              <span aria-hidden="true">◇</span>
              <h3>从第一个 Agent 开始</h3>
              <p>
                选择可信的安装包。
                <br />
                安装完成后，配置并启动它。
              </p>
            </div>
          ) : (
            agents.map((agent) => (
              <article
                key={agent.id}
                className={`upload-task agent-installed-card ${selected === agent.id ? "agent-selected" : ""}`}
              >
                <div className="upload-task-top">
                  <h3>{agent.manifest.display_name ?? agent.manifest.name}</h3>
                  <span className="upload-status">{states[agent.state]}</span>
                </div>
                <p className="agent-description">
                  {agent.manifest.description}
                </p>
                <p className="upload-task-meta">
                  v{agent.manifest.version} · {agent.manifest.server.type} ·{" "}
                  {agent.manifest.author.name}
                </p>
                {agent.error && <p className="upload-error">{agent.error}</p>}
                <div className="agent-card-actions">
                  <button
                    disabled={
                      !!busy || ["starting", "stopping"].includes(agent.state)
                    }
                    onClick={() =>
                      void run(agent.id, () =>
                        agent.state === "running"
                          ? api!.stop(agent.id)
                          : api!.start(agent.id),
                      )
                    }
                  >
                    {agent.state === "running" ? "停止" : "启动"}
                  </button>
                  <button
                    disabled={!!busy}
                    onClick={() => void run(agent.id, () => inspect(agent.id))}
                  >
                    配置与工具
                  </button>
                  <button
                    disabled={!!busy}
                    onClick={() => { setConfirmError(""); setUninstallTarget(agent); }}
                  >
                    卸载
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
        <aside className="upload-panel agent-inspector" aria-label="Agent 详情">
          {!current ? (
            <>
              <p className="upload-eyebrow">AGENT WORKSPACE</p>
              <h2>安装 → 配置 → 启动</h2>
              <p className="agent-description">
                安装包会在独立进程中解包、校验。启动后，可在这里查看工具并发送测试请求。
              </p>
              <p className="agent-description">
                支持已包含依赖的 Node、Python 和二进制包。Python 包需要本机
                Python 环境。
              </p>
            </>
          ) : (
            <>
              <h2>{current.manifest.display_name ?? current.manifest.name}</h2>
              <p className="upload-task-meta">
                {states[current.state]}
                {current.pid ? ` · PID ${current.pid}` : ""}
              </p>
              <details className="upload-details">
                <summary>安装信息</summary>
                <p>ID：{current.id}</p>
                <p>
                  安装时间：{new Date(current.installedAt).toLocaleString()}
                </p>
                <p>
                  包 SHA-256：<code>{current.archiveHash}</code>
                </p>
              </details>
              <section className="agent-inspector-section">
                <h3>运行配置</h3>
                {!Object.keys(current.manifest.user_config ?? {}).length ? (
                  <p className="agent-description">此 Agent 无需额外配置。</p>
                ) : (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(current.id, async () => {
                        await api!.saveConfig(current.id, draft);
                        await inspect(current.id);
                      });
                    }}
                  >
                    {Object.entries(current.manifest.user_config ?? {}).map(
                      ([key, field]) => {
                        const value =
                          draft[key] ??
                          (field.sensitive ? "" : field.default) ??
                          "";
                        return (
                          <label key={key} className="upload-field">
                            {field.title}
                            {field.required ? " *" : ""}
                            {field.type === "boolean" ? (
                              <select
                                disabled={current.state === "running"}
                                value={String(value === "" ? false : value)}
                                onChange={(event) =>
                                  update(key, event.target.value === "true")
                                }
                              >
                                <option value="false">否</option>
                                <option value="true">是</option>
                              </select>
                            ) : field.multiple ? (
                              <textarea
                                value={
                                  Array.isArray(value)
                                    ? value.join("\n")
                                    : String(value)
                                }
                                placeholder="每行一个路径"
                                disabled={current.state === "running"}
                                onChange={(event) =>
                                  update(
                                    key,
                                    event.target.value
                                      .split("\n")
                                      .filter(Boolean),
                                  )
                                }
                              />
                            ) : (
                              <input
                                type={
                                  field.sensitive
                                    ? "password"
                                    : field.type === "number"
                                      ? "number"
                                      : "text"
                                }
                                min={field.min}
                                max={field.max}
                                step={
                                  field.type === "number" ? "any" : undefined
                                }
                                value={String(value)}
                                placeholder={
                                  secrets.includes(key)
                                    ? "已安全保存；不修改则保留"
                                    : field.description
                                }
                                disabled={current.state === "running"}
                                autoComplete="off"
                                onChange={(event) =>
                                  update(
                                    key,
                                    field.type === "number" &&
                                      event.target.value !== ""
                                      ? Number(event.target.value)
                                      : event.target.value,
                                  )
                                }
                              />
                            )}
                            {field.description && (
                              <small>{field.description}</small>
                            )}
                          </label>
                        );
                      },
                    )}
                    <button
                      className="upload-secondary"
                      disabled={!!busy || current.state === "running"}
                    >
                      保存配置
                    </button>
                  </form>
                )}
              </section>
              <section className="agent-inspector-section">
                <div className="agent-section-row">
                  <h3>工具测试</h3>
                  <button
                    disabled={!!busy || current.state !== "running"}
                    onClick={() =>
                      void run(current.id, async () => {
                        const next = await api!.listTools(current.id);
                        setTools(next);
                        setToolName(next[0]?.name ?? "");
                      })
                    }
                  >
                    读取工具
                  </button>
                </div>
                {current.state !== "running" && (
                  <p className="agent-description">
                    启动 Agent 后即可查看和调用工具。
                  </p>
                )}
                {tools.length > 0 && (
                  <>
                    <label className="upload-field">
                      工具
                      <select
                        value={toolName}
                        onChange={(event) => {
                          setToolName(event.target.value);
                          setResult("");
                        }}
                      >
                        {tools.map((tool) => (
                          <option key={tool.name}>{tool.name}</option>
                        ))}
                      </select>
                    </label>
                    <p className="agent-description">
                      {
                        tools.find((tool) => tool.name === toolName)
                          ?.description
                      }
                    </p>
                    <details className="upload-details">
                      <summary>参数 Schema</summary>
                      <pre>
                        {JSON.stringify(
                          tools.find((tool) => tool.name === toolName)
                            ?.inputSchema,
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                    <label className="upload-field">
                      参数（JSON 对象）
                      <textarea
                        rows={5}
                        value={args}
                        onChange={(event) => setArgs(event.target.value)}
                      />
                    </label>
                    <button
                      className="upload-secondary"
                      disabled={!!busy || current.state !== "running"}
                      onClick={() =>
                        void run(current.id, async () => {
                          setResult("");
                          setResult(
                            JSON.stringify(
                              await api!.callTool(
                                current.id,
                                toolName,
                                JSON.parse(args),
                              ),
                              null,
                              2,
                            ),
                          );
                        })
                      }
                    >
                      执行工具
                    </button>
                  </>
                )}
                {result && <pre className="agent-tool-result">{result}</pre>}
              </section>
              <section className="agent-inspector-section">
                <div className="agent-section-row">
                  <h3>最近运行日志</h3>
                  <button
                    disabled={!!busy}
                    onClick={() =>
                      void run(current.id, async () =>
                        setLogs(await api!.logs(current.id)),
                      )
                    }
                  >
                    刷新
                  </button>
                </div>
                <div className="agent-log-list">
                  {logs.length ? (
                    logs.map((log, index) => (
                      <p key={index}>
                        <time>{new Date(log.time).toLocaleTimeString()}</time> [
                        {log.level.toUpperCase()}] {log.message}
                      </p>
                    ))
                  ) : (
                    <p>暂无运行日志。</p>
                  )}
                </div>
              </section>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
