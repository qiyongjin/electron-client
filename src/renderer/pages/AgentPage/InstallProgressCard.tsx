import type { AgentInstallProgress } from "../../../shared/types/agent";

export const installFinished = (progress: AgentInstallProgress | null) => !progress
  || ["completed", "cancelled", "failed"].includes(progress.phase);

function bytes(value: number) {
  return value < 1024 ** 2 ? `${(value / 1024).toFixed(1)} KiB` : `${(value / 1024 ** 2).toFixed(1)} MiB`;
}

export function InstallProgressCard({ progress, onCancel }: { progress: AgentInstallProgress; onCancel: () => void }) {
  const percent = Math.min(100, Math.max(0, Math.floor(progress.percent)));
  const steps = ["准备安装", "计算指纹", "解压文件", "校验清单", "保存记录"];
  const step = ["preparing", "hashing", "extracting", "validating", "committing", "completed"].indexOf(progress.phase);
  return <section className={`upload-task agent-install-progress agent-install-${progress.phase}`} aria-label="智能体安装进度" aria-busy={!installFinished(progress)}>
    <div className="upload-task-top"><h3>{progress.fileName}</h3><span className="upload-status">{progress.message}</span></div>
    <div className="upload-progress-label"><span role="status" aria-live="polite">{progress.message}</span><strong>{percent}%</strong></div>
    <progress max={100} value={percent} aria-label={`${progress.fileName} 安装进度`} />
    <ol className="agent-install-steps">{steps.map((label, index) => <li key={label}
      aria-current={index === step ? "step" : undefined} className={index < step ? "is-complete" : ""}>
      <span aria-hidden="true">{index < step ? "✓" : index + 1}</span>{label}</li>)}</ol>
    {progress.currentFile && <p className="agent-install-current" title={progress.currentFile}>正在处理：{progress.currentFile}</p>}
    <div className="upload-metrics">
      {progress.processedEntries !== undefined && <span>文件 {progress.processedEntries} / {progress.totalEntries}</span>}
      {progress.processedBytes !== undefined && <span>{bytes(progress.processedBytes)}{progress.totalBytes !== undefined ? ` / ${bytes(progress.totalBytes)}` : " 已处理"}</span>}
    </div>
    {progress.error && <p className="upload-error" role="alert">{progress.error}</p>}
    {!installFinished(progress) && <div className="upload-task-bottom"><span>校验通过后才会加入已安装列表</span>
      <button type="button" disabled={!progress.cancellable} onClick={onCancel}>
        {progress.phase === "cancelling" ? "正在取消…" : progress.phase === "committing" ? "正在完成安装…" : "取消安装"}
      </button></div>}
  </section>;
}
