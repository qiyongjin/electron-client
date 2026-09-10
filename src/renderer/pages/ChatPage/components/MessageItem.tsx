import { memo, useState } from 'react';
import type { ChatMessage } from '../types';
import { ChatIcon } from './ChatIcon';
import { MessageContent } from './MessageContent';
import { ToolCallCard } from './ToolCallCard';
import { CitationList } from './CitationList';
import { AttachmentList } from './AttachmentList';

export const MessageItem = memo(function MessageItem({ message, canRetry, onRetry }: {
  message: ChatMessage; canRetry: boolean; onRetry: (id: string) => void;
}) {
  const [copyStatus, setCopyStatus] = useState('');
  const busy = message.status === 'pending' || message.status === 'streaming';
  if (message.role === 'system') return <div className="chat-system-message" role="status">{message.content}</div>;
  const isUser = message.role === 'user';
  const copy = async () => {
    try { await navigator.clipboard.writeText(message.content); setCopyStatus('已复制'); }
    catch { setCopyStatus('复制失败，请手动选择文本'); }
  };
  return <article className={`chat-message chat-message-${message.role}`} aria-label={isUser ? '你的消息' : '小七的回复'}>
    <div className={`chat-avatar ${isUser ? 'chat-avatar-user' : ''}`}>{isUser ? '我' : <ChatIcon name="spark" size={20} />}</div>
    <div className="chat-message-main">
      <div className="chat-message-meta"><strong>{isUser ? '你' : '小七'}</strong>{!isUser && <span className="chat-ai-label">AI</span>}
        <time dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>
      </div>
      {message.reasoning && <details className="chat-reasoning"><summary><ChatIcon name="spark" size={14} />
        {busy ? '正在思考' : '思考过程'}<ChatIcon name="chevron" size={13} className="chat-disclosure" /></summary>
        <p>{message.reasoning}</p></details>}
      {message.toolCalls.map((tool) => <ToolCallCard key={tool.id} tool={tool} />)}
      {message.content && (isUser ? <p className="chat-user-content">{message.content}</p> : <MessageContent content={message.content} />)}
      {busy && !message.content && <div className="chat-thinking" role="status"><span className="chat-thinking-dots"><i /><i /><i /></span>
        {message.reasoning ? '正在组织回答' : '正在思考'}</div>}
      {busy && message.content && <span className="chat-stream-cursor" aria-label="正在生成" />}
      <AttachmentList attachments={message.attachments} />
      <CitationList citations={message.citations} />
      {message.status === 'error' && <div className="chat-message-error" role="alert"><ChatIcon name="alert" size={16} />{message.error}</div>}
      {message.status === 'stopped' && <p className="chat-muted chat-status-note">已停止生成</p>}
      {!isUser && !busy && <div className="chat-message-actions">
        {message.content && <button className="chat-text-button" onClick={copy}><ChatIcon name="copy" size={14} />复制</button>}
        {canRetry && <button className="chat-text-button" onClick={() => onRetry(message.id)}><ChatIcon name="retry" size={14} />
          {message.status === 'error' ? '重试' : '重新生成'}</button>}
        <span role="status">{copyStatus}</span>
      </div>}
    </div>
  </article>;
});
