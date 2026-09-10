import { useState } from 'react';
import type { Attachment } from '../types';
import { ChatIcon } from './ChatIcon';
import { ReferencePanel } from './ReferencePanel';

export function AttachmentList({ attachments, onRemove, onRetry, disabled = false }: {
  attachments: Attachment[]; onRemove?: (id: string) => void; onRetry?: (id: string) => void; disabled?: boolean;
}) {
  const [preview, setPreview] = useState<Attachment | null>(null);
  if (!attachments.length) return null;
  return <>
    <ul className="chat-attachments" aria-label="附件列表">{attachments.map((file) => <li key={file.id}
      className={`chat-attachment chat-attachment-${file.status}`}>
      <span className="chat-file-icon"><ChatIcon name="file" size={18} /></span>
      <button type="button" className="chat-attachment-info" disabled={file.status !== 'ready'} onClick={() => setPreview(file)}>
        <strong title={file.name}>{file.name}</strong><small>
          {file.status === 'reading' ? `读取中 ${file.progress}%` : file.status === 'error' ? file.error
            : `${Math.max(1, Math.ceil(file.size / 1024))} KB · 点击预览`}
        </small>
      </button>
      {file.status === 'reading' && <progress value={file.progress} max={100} aria-label={`${file.name} 读取进度`} />}
      {file.status === 'error' && onRetry && <button type="button" className="chat-icon-button" disabled={disabled}
        aria-label={`重试读取 ${file.name}`} onClick={() => onRetry(file.id)}><ChatIcon name="retry" size={14} /></button>}
      {onRemove && <button type="button" className="chat-icon-button" disabled={disabled}
        aria-label={`移除 ${file.name}`} onClick={() => onRemove(file.id)}><ChatIcon name="close" size={14} /></button>}
    </li>)}</ul>
    {preview && <ReferencePanel citation={{ id: preview.id, documentName: preview.name, snippet: preview.content || '' }}
      onClose={() => setPreview(null)} />}
  </>;
}
