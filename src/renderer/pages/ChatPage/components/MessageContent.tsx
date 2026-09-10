import { Fragment, type ReactNode } from 'react';

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

/** A deliberately small, HTML-free renderer; incomplete streaming code fences remain readable. */
export function MessageContent({ content }: { content: string }) {
  const blocks: ReactNode[] = [];
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const fence = line.match(/^\s*```(.*)/);
    if (fence) {
      const code: string[] = [];
      while (++index < lines.length && !/^\s*```/.test(lines[index])) code.push(lines[index]);
      blocks.push(<div className="chat-code" key={index}><div>{fence[1] || 'code'}</div><pre><code>{code.join('\n')}</code></pre></div>);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)/);
    if (heading) { blocks.push(<h3 key={index}>{inline(heading[2])}</h3>); continue; }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [line.replace(/^\s*[-*]\s+/, '')];
      while (index + 1 < lines.length && /^\s*[-*]\s+/.test(lines[index + 1])) items.push(lines[++index].replace(/^\s*[-*]\s+/, ''));
      blocks.push(<ul key={index}>{items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const start = Number(line.trim().match(/^\d+/)?.[0] || 1);
      const items: string[] = [line.replace(/^\s*\d+[.)]\s+/, '')];
      while (index + 1 < lines.length && /^\s*\d+[.)]\s+/.test(lines[index + 1])) items.push(lines[++index].replace(/^\s*\d+[.)]\s+/, ''));
      blocks.push(<ol key={index} start={start}>{items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ol>);
      continue;
    }
    if (line.startsWith('> ')) { blocks.push(<blockquote key={index}>{inline(line.slice(2))}</blockquote>); continue; }
    if (line.trim()) blocks.push(<p key={index}>{inline(line)}</p>);
  }
  return <div className="chat-message-content">{blocks}</div>;
}
