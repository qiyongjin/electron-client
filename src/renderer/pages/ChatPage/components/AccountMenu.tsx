import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePreferencesStore } from '../../../stores/usePreferencesStore';
import { ChatIcon, type IconName } from './ChatIcon';

const items: { path: string; label: string; icon: IconName; separated?: boolean }[] = [
  { path: 'plan', label: '升级套餐', icon: 'spark' },
  { path: 'personalization', label: '个性化', icon: 'compass' },
  { path: 'profile', label: '个人资料', icon: 'user' },
  { path: 'settings', label: '设置', icon: 'settings' },
  { path: 'help', label: '帮助', icon: 'help', separated: true },
  { path: 'logout', label: '退出登录', icon: 'logout' },
];

export function AccountMenu({ sidebarOpen, onNavigate }: { sidebarOpen: boolean; onNavigate: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  const focusLast = useRef(false);
  const id = useId();
  const location = useLocation();
  const name = usePreferencesStore(s => s.displayName);
  const initials = Array.from(name).slice(0, 2).join('').toUpperCase();
  const closeMenu = useCallback(() => {
    if (menu.current?.contains(document.activeElement) && !trigger.current?.closest('[inert]')) {
      trigger.current?.focus({ preventScroll: true });
    }
    setOpen(false);
  }, []);
  useEffect(() => { closeMenu(); }, [location.pathname, sidebarOpen, closeMenu]);
  useEffect(() => {
    if (!open) return;
    const links = menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    (focusLast.current ? links?.[links.length - 1] : links?.[0])?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) closeMenu();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, closeMenu]);
  const navigate = () => { closeMenu(); onNavigate(); };
  return <div className="chat-sidebar-footer" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeMenu();
  }}>
    <div id={id} ref={node => { menu.current = node; if (node) node.inert = !open; }} role="menu" aria-label="账户菜单"
      className={`account-menu ${open ? 'is-open' : ''}`}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(); }
        const links = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
        const index = links.indexOf(document.activeElement as HTMLElement);
        const next = event.key === 'ArrowDown' ? (index + 1) % links.length : event.key === 'ArrowUp' ? (index - 1 + links.length) % links.length : event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); links[next]?.focus(); }
      }}>
      <Link role="menuitem" tabIndex={open ? 0 : -1} to="/chatPage/account/profile" className="account-menu-profile" onClick={navigate}>
        <span className="account-avatar">{initials}</span><span className="account-identity"><strong>{name}</strong><small>本地工作空间</small></span><ChatIcon name="chevron" size={16} />
      </Link>
      <div className="account-menu-divider" role="separator" />
      {items.map(item => <div key={item.path} role="none">
        {item.separated && <div className="account-menu-divider" role="separator" />}
        <Link role="menuitem" tabIndex={open ? 0 : -1} to={`/chatPage/account/${item.path}`} className="account-menu-item" onClick={navigate}>
          <ChatIcon name={item.icon} size={20} /><span>{item.label}</span>{item.path === 'help' && <ChatIcon name="chevron" size={15} />}
        </Link>
      </div>)}
    </div>
    <button ref={trigger} className={`account-trigger ${open ? 'is-open' : ''}`} aria-haspopup="menu" aria-expanded={open} aria-controls={id}
      onClick={() => { focusLast.current = false; if (open) closeMenu(); else setOpen(true); }}
      onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); focusLast.current = event.key === 'ArrowUp'; setOpen(true); } }}>
      <span className="account-avatar">{initials}</span><span className="account-identity"><strong>{name}</strong><small>本地工作空间</small></span><ChatIcon name="chevron" size={17} className="account-trigger-chevron" />
    </button>
  </div>;
}
