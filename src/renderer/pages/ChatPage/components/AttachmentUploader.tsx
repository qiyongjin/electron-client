import { useRef } from 'react';
import { ACCEPTED_FILES } from '../hooks/useFileUpload';
import { ChatIcon } from './ChatIcon';

export function AttachmentUploader({ onFiles, disabled }: { onFiles: (files: File[]) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return <>
    <input ref={input} type="file" multiple accept={ACCEPTED_FILES} className="chat-sr-only" tabIndex={-1}
      aria-label="选择文本附件" disabled={disabled} onChange={(event) => {
        onFiles(Array.from(event.target.files || []));
        event.target.value = '';
      }} />
    <button type="button" className="chat-icon-button" title="添加文本附件（TXT、MD、CSV、JSON）" aria-label="添加附件"
      disabled={disabled} onClick={() => input.current?.click()}><ChatIcon name="paperclip" size={20} /></button>
  </>;
}
