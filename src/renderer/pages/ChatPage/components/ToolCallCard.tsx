import type { ToolCall } from '../types';
import { ChatIcon, type IconName } from './ChatIcon';

const icons: Record<ToolCall['type'], IconName> = { file: 'file', search: 'search', image: 'image', task: 'task' };
const labels = { running: '执行中', success: '已完成', error: '执行失败' };

export function ToolCallCard({ tool }: { tool: ToolCall }) {
  return <details className={`chat-tool chat-tool-${tool.status}`}>
    <summary><ChatIcon name={icons[tool.type]} size={17} /><span>{tool.name}</span>
      <span className="chat-tool-state">{tool.status === 'running' ? <i className="chat-spinner" />
        : <ChatIcon name={tool.status === 'success' ? 'check' : 'alert'} size={13} />}{labels[tool.status]}</span>
      <ChatIcon name="chevron" className="chat-disclosure" size={14} />
    </summary>
    <div className="chat-tool-body">
      {tool.parameters !== undefined && <><h4>调用参数</h4><pre>{typeof tool.parameters === 'string'
        ? tool.parameters : JSON.stringify(tool.parameters, null, 2)}</pre></>}
      {tool.result && <><h4>执行结果</h4><p>{tool.result}</p></>}
      {tool.error && <p role="alert" className="chat-error-text">{tool.error}</p>}
    </div>
  </details>;
}
