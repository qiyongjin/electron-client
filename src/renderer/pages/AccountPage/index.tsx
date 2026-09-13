import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, useOutletContext, useParams } from 'react-router-dom';
import { usePreferencesStore } from '../../stores/usePreferencesStore';
import { getChatBridge } from '../ChatPage/services/chatTransport';
import { ChatIcon, type IconName } from '../ChatPage/components/ChatIcon';

const sections: { id: string; name: string; icon: IconName; description: string }[] = [
  { id: 'plan', name: '升级套餐', icon: 'spark', description: '了解当前工作空间，以及未来的更多可能。' },
  { id: 'personalization', name: '个性化', icon: 'compass', description: '让小七更贴合你的阅读习惯和工作节奏。' },
  { id: 'profile', name: '个人资料', icon: 'user', description: '设置你在这台设备上的名字和个人介绍。' },
  { id: 'settings', name: '设置', icon: 'settings', description: '管理聊天偏好，了解本机的数据与连接状态。' },
  { id: 'help', name: '帮助', icon: 'help', description: '从第一个问题开始，让每次对话更顺手。' },
  { id: 'logout', name: '退出登录', icon: 'logout', description: '查看当前账户与工作空间状态。' },
];

function Profile() {
  const preferences = usePreferencesStore();
  const [name, setName] = useState(preferences.displayName);
  const [bio, setBio] = useState(preferences.bio);
  const [saved, setSaved] = useState(false);
  return <form className="account-card" onSubmit={event => {
    event.preventDefault(); if (!name.trim()) return;
    preferences.update({ displayName: name.trim(), bio: bio.trim() }); setSaved(true);
  }}>
    <div className="account-profile-preview"><span className="account-avatar account-avatar-large">{Array.from(name.trim() || '七').slice(0, 2).join('').toUpperCase()}</span>
      <div><h2>{name.trim() || '你的名字'}</h2><p>本地个人资料</p></div></div>
    <label className="account-field">显示名称<input required maxLength={40} value={name} onChange={e => { setName(e.target.value); setSaved(false); }} placeholder="输入你的名字" /><small>显示在侧栏和工作空间中，最多 40 个字符。</small></label>
    <label className="account-field">个人介绍<textarea rows={3} maxLength={160} value={bio} onChange={e => { setBio(e.target.value); setSaved(false); }} placeholder="简单介绍一下你自己…" /><small>{bio.length} / 160 · 仅在本机保存，不会自动发送给模型。</small></label>
    <div className="account-form-actions"><button className="account-primary" type="submit" disabled={!name.trim()}>保存资料</button><span role="status">{saved ? '资料已保存在本机' : ''}</span></div>
  </form>;
}

function Personalization() {
  const prefs = usePreferencesStore();
  return <>
    <section className="account-card"><h2>让界面有你的风格</h2><p>设置自动保存在这台设备，立即生效。</p>
      <fieldset className="account-fieldset"><legend>主题强调色</legend><div className="account-color-options">
        {([['sage', '松石绿'], ['violet', '鸢尾紫'], ['blue', '静海蓝']] as const).map(([value, label]) => <label key={value} className={`account-color-option ${prefs.accent === value ? 'is-selected' : ''}`}>
          <input type="radio" name="accent" value={value} checked={prefs.accent === value} onChange={() => prefs.update({ accent: value })} /><span className={`account-swatch account-swatch-${value}`} /><span>{label}</span>{prefs.accent === value && <ChatIcon name="check" size={15} />}
        </label>)}
      </div></fieldset>
      <fieldset className="account-fieldset"><legend>消息字号</legend><div className="account-segmented">
        {([['regular', '标准'], ['large', '较大']] as const).map(([value, label]) => <label key={value}><input type="radio" name="text-size" checked={prefs.textSize === value} onChange={() => prefs.update({ textSize: value })} /><span>{label}</span></label>)}
      </div></fieldset>
      <div className="account-preference-preview"><span className="chat-eyebrow">效果预览</span><p className="account-preview-message">你好，{prefs.displayName}。今天想聊点什么？</p><span className="account-preview-chip"><ChatIcon name="spark" size={14} />一点好奇，无限可能</span></div>
    </section>
    <section className="account-card"><label className="account-setting-row"><span><strong>欢迎页推荐问题</strong><small>在新对话中显示灵感和常用任务入口。</small></span><input className="account-switch" type="checkbox" checked={prefs.showSuggestions} onChange={e => prefs.update({ showSuggestions: e.target.checked })} /></label></section>
  </>;
}

function Settings() {
  const prefs = usePreferencesStore();
  const [reset, setReset] = useState(false);
  return <>
    <section className="account-card"><h2>对话习惯</h2><label className="account-setting-row"><span><strong>发送消息快捷键</strong><small>中文输入法选词时不会触发发送。</small></span><select aria-label="发送消息快捷键" value={prefs.sendShortcut} onChange={e => prefs.update({ sendShortcut: e.target.value as 'enter' | 'modifier-enter' })}><option value="enter">Enter 发送</option><option value="modifier-enter">Ctrl / ⌘ + Enter 发送</option></select></label><p className="account-footnote">{prefs.sendShortcut === 'enter' ? 'Shift + Enter 换行。' : 'Enter 换行，Ctrl / ⌘ + Enter 发送。'}</p></section>
    <section className="account-card"><h2>这台设备上的数据</h2><div className="account-setting-row"><span><strong>聊天连接</strong><small>{getChatBridge() ? '已连接桌面端聊天服务。' : '浏览器预览，发送消息需要 Electron 桌面端。'}</small></span><span className="account-badge">{getChatBridge() ? '桌面端' : '预览模式'}</span></div><div className="account-setting-row"><span><strong>会话记录</strong><small>仅在本次应用运行期间保留。</small></span></div><div className="account-setting-row"><span><strong>资料与偏好</strong><small>保存在当前设备，不会同步到其他设备。</small></span><span className="account-badge">本机保存</span></div><div className="account-setting-row"><span><strong>运行日志</strong><small>位于用户目录的 .seven/logs；保留最近 7 个自然日，通常每个分片不超过 20 MiB。</small></span></div></section>
    <section className="account-card"><div className="account-setting-row"><span><strong>恢复默认偏好</strong><small>恢复强调色、字号、推荐问题和快捷键；保留个人资料。</small></span><button className="account-secondary" onClick={() => { prefs.resetAppearance(); setReset(true); }}>恢复默认</button></div><p role="status">{reset ? '已恢复默认偏好。' : ''}</p></section>
  </>;
}

function Plan() {
  return <>
    <div className="account-plan-hero"><span className="account-plan-symbol"><ChatIcon name="spark" size={32} /></span><span className="chat-eyebrow">YOUR WORKSPACE</span><h2>从当下的灵感，开始创造。</h2><p>你的本地工作空间已经准备就绪。</p></div>
    <div className="account-plan-grid"><section className="account-card"><span className="account-badge">当前工作空间</span><h2>本地版</h2><p>在自己的设备上，专注每一次对话。</p><ul className="account-feature-list">{['多会话与上下文对话', '文档附件与内容引用', '流式回复与停止生成', '本地个人资料与偏好设置'].map(text => <li key={text}><ChatIcon name="check" size={16} />{text}</li>)}</ul><Link className="account-primary" to="/chatPage">继续对话</Link></section>
    <section className="account-card account-future-plan"><span className="account-badge">尚未开放</span><h2>云端套餐</h2><p>订阅与支付服务尚未接入，当前没有可购买的套餐。</p><div className="account-service-note"><ChatIcon name="spark" size={23} /><p>未来的套餐内容、价格和使用额度，将在服务开放后展示。</p></div><Link className="account-secondary" to="/chatPage/account/help">了解当前功能</Link></section></div>
  </>;
}

function Help() {
  return <>
    <section className="account-card"><h2>从这里开始</h2><div className="account-help-grid"><div><ChatIcon name="chat" size={22} /><h3>开启对话</h3><p>告诉小七你的问题、背景和期望结果。你也可以在同一会话中继续追问。</p></div><div><ChatIcon name="paperclip" size={22} /><h3>带上你的资料</h3><p>拖入 TXT、MD、CSV 或 JSON 文件。每次最多 5 个，每个不超过 1 MB、40,000 字符。</p></div></div></section>
    <section className="account-card"><h2>常见问题</h2>{[
      ['为什么浏览器里不能发送消息？', '浏览器用于界面预览。请通过 Electron 桌面应用使用已连接的 Python 聊天服务。'],
      ['关闭应用后，对话还在吗？', '当前对话只保留在本次运行期间，关闭应用后不会保存。个人资料和界面偏好会保存在当前设备。'],
      ['如何停止正在生成的回复？', '点击输入框右下角的停止按钮。回复结束后，可以复制结果或重新生成最后一条回复。'],
      ['如何更改发送快捷键？', '在“设置”中选择 Enter 或 Ctrl / ⌘ + Enter 发送。输入法选词期间不会提交消息。'],
      ['可以升级套餐或登录账户吗？', '当前尚未接入登录、订阅和支付服务。菜单中的相关页面用于说明当前状态，不代表已购买任何套餐。'],
    ].map(([question, answer]) => <details className="account-faq" key={question}><summary>{question}<ChatIcon name="chevron" size={15} /></summary><p>{answer}</p></details>)}</section>
    <section className="account-card"><div className="account-setting-row"><span><strong>开发诊断</strong><small>使用项目已有的测试页面检查桌面端通信。</small></span><Link className="account-secondary" to="/test">打开测试页<ChatIcon name="code" size={15} /></Link></div></section>
  </>;
}

function Logout() {
  return <section className="account-card account-logout-state"><span className="account-plan-symbol"><ChatIcon name="user" size={30} /></span><h2>你正在使用本地工作空间</h2><p>登录服务尚未接入，当前没有可退出的云端账户。</p><p>本地资料和偏好仍保存在这台设备上。关闭应用会结束本次运行，会话记录不会保留。</p><Link className="account-primary" to="/chatPage">返回对话</Link><Link className="account-inline-link" to="/chatPage/account/profile">管理本地资料</Link></section>;
}

export default function AccountPage() {
  const { section } = useParams();
  const { sidebarOpen, openSidebar } = useOutletContext<{ sidebarOpen: boolean; openSidebar: () => void }>();
  const current = sections.find(item => item.id === section);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [section]);
  if (!current) return <Navigate to="/chatPage/account/profile" replace />;
  return <div className="account-page"><header className="account-page-header"><div className="account-header-leading">{!sidebarOpen && <button data-sidebar-toggle className="chat-icon-button" aria-label="展开会话列表" onClick={openSidebar}><ChatIcon name="panel" /></button>}<Link to="/chatPage" className="account-back"><ChatIcon name="chevron" size={16} />返回对话</Link></div><span>个人工作空间</span></header>
    <div className="account-page-content"><span className="chat-eyebrow">MAKE IT YOURS</span><h1 ref={heading} tabIndex={-1}>{current.name}</h1><p className="account-page-description">{current.description}</p>
      <nav className="account-page-tabs" aria-label="账户页面">{sections.filter(item => item.id !== 'logout').map(item => <NavLink key={item.id} to={`/chatPage/account/${item.id}`}><ChatIcon name={item.icon} size={15} />{item.name}</NavLink>)}</nav>
      <div key={section} className="account-page-body">{section === 'profile' ? <Profile /> : section === 'personalization' ? <Personalization /> : section === 'settings' ? <Settings /> : section === 'plan' ? <Plan /> : section === 'help' ? <Help /> : <Logout />}</div>
    </div>
  </div>;
}
