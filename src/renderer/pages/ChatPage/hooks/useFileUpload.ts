import { useCallback, useEffect, useRef, useState } from 'react';
import { createId, type Attachment } from '../types';

export const ACCEPTED_FILES = '.txt,.md,.csv,.json';
const MAX_FILES = 5;
const MAX_BYTES = 1024 * 1024;
const MAX_CHARACTERS = 40000;

/** The current backend accepts text context; this adapter reads files locally, without a cloud upload. */
export function useFileUpload() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState('');
  const files = useRef(new Map<string, File>());
  const readers = useRef(new Map<string, FileReader>());

  const read = useCallback((id: string, file: File) => {
    const update = (patch: Partial<Attachment>) => setAttachments((items) => items.map((item) => (
      item.id === id ? { ...item, ...patch } : item
    )));
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !['txt', 'md', 'csv', 'json'].includes(extension)) {
      update({ status: 'error', error: '暂支持 TXT、Markdown、CSV 和 JSON 文本文件' });
      return;
    }
    if (file.size > MAX_BYTES) {
      update({ status: 'error', error: '文件不能超过 1 MB' });
      return;
    }
    const reader = new FileReader();
    readers.current.set(id, reader);
    update({ status: 'reading', progress: 0, error: undefined });
    reader.onprogress = (event) => {
      if (event.lengthComputable) update({ progress: Math.round(event.loaded / event.total * 100) });
    };
    reader.onload = () => {
      const content = String(reader.result || '');
      if (!content.trim()) update({ status: 'error', error: '文件内容为空' });
      else if (content.length > MAX_CHARACTERS) update({ status: 'error', error: '单个文件最多支持 40,000 个字符，请拆分后添加' });
      else if (content.includes('\u0000') || content.includes('\uFFFD')) update({ status: 'error', error: '请将文件保存为 UTF-8 文本后重试' });
      else update({ status: 'ready', content, progress: 100 });
      readers.current.delete(id);
    };
    reader.onerror = () => {
      update({ status: 'error', error: '读取失败，请重试' });
      readers.current.delete(id);
    };
    reader.readAsText(file, 'UTF-8');
  }, []);

  const addFiles = useCallback((selected: File[]) => {
    setError('');
    const available = MAX_FILES - files.current.size;
    if (selected.length > available) setError(`每条消息最多添加 ${MAX_FILES} 个文件`);
    selected.slice(0, available).forEach((file) => {
      const id = createId();
      files.current.set(id, file);
      setAttachments((items) => [...items, { id, name: file.name, size: file.size, status: 'reading', progress: 0 }]);
      read(id, file);
    });
  }, [read]);

  const remove = useCallback((id: string) => {
    readers.current.get(id)?.abort();
    readers.current.delete(id);
    files.current.delete(id);
    setAttachments((items) => items.filter((item) => item.id !== id));
    setError('');
  }, []);

  const retry = useCallback((id: string) => {
    const file = files.current.get(id);
    if (file) read(id, file);
  }, [read]);

  const clear = useCallback(() => {
    readers.current.forEach((reader) => reader.abort());
    readers.current.clear();
    files.current.clear();
    setAttachments([]);
    setError('');
  }, []);

  useEffect(() => {
    const activeReaders = readers.current;
    return () => { activeReaders.forEach((reader) => reader.abort()); activeReaders.clear(); };
  }, []);

  return { attachments, error, addFiles, remove, retry, clear };
}
