import { useState } from 'react';
import type { Citation } from '../types';
import { ChatIcon } from './ChatIcon';
import { ReferencePanel } from './ReferencePanel';

export function CitationList({ citations }: { citations: Citation[] }) {
  const [selected, setSelected] = useState<Citation | null>(null);
  if (!citations.length) return null;
  return <section className="chat-citations" aria-label="参考来源">
    <span className="chat-eyebrow">{citations.every((citation) => citation.kind === 'attachment') ? '本轮参考文件' : '参考来源'} · {citations.length}</span>
    <div className="chat-citation-grid">{citations.map((citation, index) => <button
      key={citation.id} className="chat-citation" onClick={() => setSelected(citation)}>
      <span className="chat-citation-number">{index + 1}</span>
      <span><strong>{citation.documentName}</strong><small>
        {citation.page !== undefined ? `第 ${citation.page} 页 · ` : ''}
        {citation.similarity !== undefined ? `相似度 ${Math.round(citation.similarity * 100)}%` : '查看原文'}
      </small><span className="chat-citation-snippet">{citation.snippet}</span></span>
      <ChatIcon name="chevron" size={14} />
    </button>)}</div>
    {selected && <ReferencePanel citation={selected} onClose={() => setSelected(null)} />}
  </section>;
}
