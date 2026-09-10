import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useChatStore } from '../../stores/useChatStore';
import { useMessageSender } from './hooks/useMessageSender';
import { getChatBridge } from './services/chatTransport';
import { ChatIcon, type IconName } from './components/ChatIcon';
import { ChatInput, type ChatInputHandle } from './components/ChatInput';
import { MessageList } from './components/MessageList';
import './chat.css';

const suggestions: { icon: IconName; title: string; description: string; prompt: string }[] = [
  { icon: 'file', title: '读懂一份文档', description: '提炼重点，让信息更清晰', prompt: '请帮我总结附件的核心观点，并整理成清晰的要点。' },
  { icon: 'code', title: '一起解决代码问题', description: '解释逻辑，寻找更好的实现', prompt: '我想请你帮我分析一段代码，解释它的逻辑并给出改进建议。' },
  { icon: 'spark', title: '让灵感开始发生', description: '从一个想法，到更多可能', prompt: '我想和你一起头脑风暴。请先问我几个问题，帮助我梳理想法。' },
  { icon: 'task', title: '把目标变成计划', description: '拆解任务，找到下一步', prompt: '请帮我把一个目标拆解为可执行的计划，先和我确认目标与时间安排。' },
];

export default function ChatPage() {
  const conversations = useChatStore((state) => state.conversations);
  const activeId = useChatStore((state) => state.activeConversationId);
  const generation = useChatStore((state) => state.generation);
  const createConversation = useChatStore((state) => state.createConversation);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const conversation = conversations.find((item) => item.id === activeId)!;
  const { send, stop, retry } = useMessageSender();
  const input = useRef<ChatInputHandle>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 760);
  const connected = !!getChatBridge();
  const isGenerating = generation?.conversationId === activeId;
  const select = (id: string) => {
    selectConversation(id);
    if (window.innerWidth <= 760) setSidebarOpen(false);
  };

  return <div className={`chat-shell ${sidebarOpen ? 'chat-sidebar-open' : ''}`}>
    {sidebarOpen && <button className="chat-sidebar-scrim" aria-label="收起会话列表" onClick={() => setSidebarOpen(false)} />}
    <aside className="chat-sidebar" aria-label="会话导航" aria-hidden={!sidebarOpen}>
      <div className="chat-brand"><span className="chat-brand-mark"><ChatIcon name="spark" size={24} /></span>
        <span>小七<span className="chat-brand-caption">你的 AI 工作伙伴</span></span>
        <button className="chat-icon-button" aria-label="收起会话列表" onClick={() => setSidebarOpen(false)}><ChatIcon name="panel" size={17} /></button>
      </div>
      <button className="chat-new-button" onClick={() => select(createConversation())}><ChatIcon name="plus" size={18} />开启新对话<span>＋</span></button>
      <div className="chat-sidebar-label">本次运行的会话<span>{conversations.length}</span></div>
      <nav className="chat-conversations">{conversations.map((item) => <button key={item.id}
        className={`chat-conversation-link ${item.id === activeId ? 'is-active' : ''}`} aria-current={item.id === activeId ? 'page' : undefined}
        onClick={() => select(item.id)} title={item.title}>
        <ChatIcon name="chat" size={16} /><span>{item.title}</span>
        {generation?.conversationId === item.id && <i className="chat-spinner" aria-label="生成中" />}
      </button>)}</nav>
      <div className="chat-sidebar-footer"><div className="chat-workspace-icon">七</div>
        <div><strong>个人工作空间</strong><span>会话保留至应用关闭</span></div><Link to="/test" title="打开开发测试页" aria-label="打开开发测试页"><ChatIcon name="code" size={16} /></Link>
      </div>
    </aside>
    <main className="chat-main">
      <header className="chat-header"><div className="chat-header-title">
        {!sidebarOpen && <button className="chat-icon-button" aria-label="展开会话列表" onClick={() => setSidebarOpen(true)}><ChatIcon name="panel" /></button>}
        <div><h1>{conversation.title}</h1><span>和小七一起，探索问题的更多可能</span></div>
      </div><span className={`chat-connection ${connected ? '' : 'is-preview'}`}><i />{connected ? '桌面会话' : '浏览器预览'}</span></header>
      {!connected && <div className="chat-preview-notice" role="status">当前为页面预览。请使用 Electron 桌面端发送消息，模型配置沿用现有后端。</div>}
      {conversation.messages.length ? <MessageList key={activeId} messages={conversation.messages} generating={!!generation} onRetry={retry} />
        : <div className="chat-welcome"><div className="chat-welcome-inner">
          <div className="chat-welcome-symbol"><ChatIcon name="spark" size={35} /><span className="chat-small-spark">✦</span></div>
          <div className="chat-eyebrow">一点好奇，无限可能</div><h2>你好，我是小七<span>今天想聊点什么？</span></h2>
          <p>一个问题、一份文档，或一个还没成形的想法。<br />我们可以从这里开始。</p>
          <div className="chat-suggestions">{suggestions.map((suggestion) => <button key={suggestion.title}
            className="chat-suggestion" onClick={() => input.current?.setDraft(suggestion.prompt)}>
            <span className="chat-suggestion-icon"><ChatIcon name={suggestion.icon} size={19} /></span>
            <strong>{suggestion.title}</strong><span>{suggestion.description}</span><ChatIcon name="chevron" className="chat-suggestion-arrow" size={15} />
          </button>)}</div>
        </div></div>}
      {generation && !isGenerating && <div className="chat-other-generation" role="status">另一个会话正在生成回复
        <button onClick={() => select(generation.conversationId)}>查看生成中的会话</button></div>}
      {conversations.map((item) => <div key={item.id} hidden={item.id !== activeId} className="chat-input-slot">
        <ChatInput ref={item.id === activeId ? input : undefined} generating={generation?.conversationId === item.id}
          disabled={!connected || (!!generation && generation.conversationId !== item.id)} onSend={send} onStop={stop} />
      </div>)}
    </main>
  </div>;
}
