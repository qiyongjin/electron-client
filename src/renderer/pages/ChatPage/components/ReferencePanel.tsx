import { useEffect, useRef } from 'react';
import type { Citation } from '../types';
import { ChatIcon } from './ChatIcon';

export function ReferencePanel({ citation, onClose }: { citation: Citation; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="chat-reference-dialog" aria-labelledby="reference-title"
    onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="chat-reference-heading">
      <div><span className="chat-eyebrow">文件预览</span><h2 id="reference-title">{citation.documentName}</h2></div>
      <button type="button" className="chat-icon-button" aria-label="关闭文件预览" onClick={onClose}><ChatIcon name="close" /></button>
    </div>
    {citation.page !== undefined && <p className="chat-muted">第 {citation.page} 页</p>}
    <pre className="chat-reference-text">{citation.content || citation.snippet}</pre>
  </dialog>;
}
