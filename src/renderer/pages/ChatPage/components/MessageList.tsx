import { useLayoutEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../types';
import { ChatIcon } from './ChatIcon';
import { MessageItem } from './MessageItem';

const PAGE_SIZE = 30;

export function MessageList({ messages, generating, onRetry }: {
  messages: ChatMessage[]; generating: boolean; onRetry: (id: string) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const previousHeight = useRef<number | null>(null);
  const lastUserId = useRef<string>();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showLatest, setShowLatest] = useState(false);
  const start = Math.max(0, messages.length - visibleCount);

  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element) return;
    if (previousHeight.current !== null) {
      element.scrollTop += element.scrollHeight - previousHeight.current;
      previousHeight.current = null;
    } else {
      const newestUser = [...messages].reverse().find((message) => message.role === 'user')?.id;
      if (stickToBottom.current || lastUserId.current !== newestUser) {
        element.scrollTop = element.scrollHeight;
        stickToBottom.current = true;
        setShowLatest(false);
      }
      lastUserId.current = newestUser;
    }
  }, [messages, visibleCount]);

  return <div className="chat-message-list-wrap">
    <div className="chat-message-list" ref={scroll} aria-label="会话消息" onScroll={() => {
      const element = scroll.current;
      if (!element) return;
      stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 90;
      setShowLatest(!stickToBottom.current);
    }}>
      <div className="chat-message-column">
        {start > 0 ? <button className="chat-load-history" onClick={() => {
          previousHeight.current = scroll.current?.scrollHeight ?? null;
          setVisibleCount((count) => count + PAGE_SIZE);
        }}>加载更早的消息（还有 {start} 条）</button> : <div className="chat-conversation-start">对话从这里开始</div>}
        {messages.slice(start).map((message, index) => <MessageItem key={message.id} message={message}
          canRetry={!generating && start + index === messages.length - 1} onRetry={onRetry} />)}
      </div>
    </div>
    {showLatest && <button className="chat-latest-button" onClick={() => {
      scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' });
      stickToBottom.current = true;
      setShowLatest(false);
    }}><ChatIcon name="down" size={15} />回到最新消息</button>}
  </div>;
}
