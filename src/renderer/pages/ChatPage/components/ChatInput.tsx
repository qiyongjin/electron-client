import { forwardRef, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { Attachment } from '../types';
import { useFileUpload } from '../hooks/useFileUpload';
import { ChatIcon } from './ChatIcon';
import { AttachmentUploader } from './AttachmentUploader';
import { AttachmentList } from './AttachmentList';

export interface ChatInputHandle { setDraft: (value: string) => void }

export const ChatInput = forwardRef<ChatInputHandle, {
  generating: boolean; disabled: boolean; onSend: (content: string, attachments: Attachment[]) => boolean; onStop: () => void;
}>(function ChatInput({ generating, disabled, onSend, onStop }, ref) {
  const [draft, setDraft] = useState('');
  const draftId = useId();
  const [dragging, setDragging] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const upload = useFileUpload();
  const ready = !disabled && !generating && (!!draft.trim() || upload.attachments.length > 0)
    && upload.attachments.every((file) => file.status === 'ready');
  useImperativeHandle(ref, () => ({ setDraft: (value) => { setDraft(value); textarea.current?.focus(); } }), []);
  useLayoutEffect(() => {
    if (!textarea.current) return;
    textarea.current.style.height = 'auto';
    textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 200)}px`;
  }, [draft]);
  const submit = () => {
    if (ready && onSend(draft, upload.attachments)) { setDraft(''); upload.clear(); textarea.current?.focus(); }
  };
  return <div className="chat-composer-area">
    <form className={`chat-composer ${dragging ? 'chat-composer-dragging' : ''}`}
      onSubmit={(event) => { event.preventDefault(); submit(); }}
      onDragOver={(event) => { event.preventDefault(); if (!disabled && !generating) setDragging(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); if (!disabled && !generating) upload.addFiles(Array.from(event.dataTransfer.files)); }}>
      <AttachmentList attachments={upload.attachments} onRemove={upload.remove} onRetry={upload.retry} disabled={generating} />
      <label className="chat-sr-only" htmlFor={draftId}>消息内容</label>
      <textarea id={draftId} ref={textarea} rows={2} value={draft} maxLength={30000}
        placeholder="向小七提问，或拖入文件一起聊聊…" onChange={(event) => setDraft(event.target.value)}
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) {
            event.preventDefault(); submit();
          }
        }} />
      {upload.error && <p role="alert" className="chat-error-text chat-upload-error">{upload.error}</p>}
      <div className="chat-composer-toolbar"><div className="chat-composer-tools">
        <AttachmentUploader onFiles={upload.addFiles} disabled={disabled || generating} />
        <span className="chat-toolbar-divider" /><span className="chat-context-label"><ChatIcon name="spark" size={14} />上下文对话</span>
      </div><div className="chat-submit-area"><span className="chat-shortcut">Shift + Enter 换行</span>
        {generating ? <button type="button" className="chat-send-button chat-stop-button" aria-label="停止生成" title="停止生成" onClick={onStop}><ChatIcon name="stop" size={17} /></button>
          : <button type="submit" className="chat-send-button" disabled={!ready} aria-label="发送消息" title="发送消息（Enter）"><ChatIcon name="arrow" size={20} /></button>}
      </div></div>
    </form>
    <p className="chat-composer-note">支持 TXT、MD、CSV、JSON · 最多 5 个文件，每个 1 MB、40,000 字符</p>
  </div>;
});
