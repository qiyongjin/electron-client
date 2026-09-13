import type { CSSProperties } from 'react';

const paths = {
  user: 'M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
  compass: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm4-16-2 8-8 4 4-8 6-4Z',
  settings: 'm9 3 1-2h4l1 2 2 1 2-.2 2 3-1 2v4l1 2-2 3-2-.2-2 1-1 2h-4l-1-2-2-1-2 .2-2-3 1-2V9L3 7l2-3 2 .2 2-1ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 4v.1',
  logout: 'M10 3H4v18h6m4-14 5 5-5 5m-6-5h13',
  plus: 'M12 5v14M5 12h14',
  chat: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2v-9.5A8.5 8.5 0 0 1 10.5 4H13a8 8 0 0 1 8 7.5Z',
  arrow: 'M12 19V5m-6 6 6-6 6 6',
  down: 'M12 5v14m-6-6 6 6 6-6',
  chevron: 'm9 5 7 7-7 7',
  paperclip: 'm8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2m-7 13 9-9',
  file: 'M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 12h8m-8 4h6',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6',
  retry: 'M3 10a9 9 0 1 1 1 8M3 3v7h7',
  copy: 'M8 8h12v13H8V8Zm-4 8H2V2h12v2',
  stop: 'M6 6h12v12H6z',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
  code: 'm8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18',
  search: 'M16 16 22 22M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  panel: 'M3 4h18v16H3V4Zm5 0v16',
  alert: 'M12 8v5m0 3v.1M12 2 1 21h22L12 2Z',
  image: 'M3 3h18v18H3V3Zm0 14 6-6 4 4 3-3 5 5M7 7h.01',
  task: 'M9 5h12M9 12h12M9 19h12M3 5h.01M3 12h.01M3 19h.01',
};

export type IconName = keyof typeof paths;

export function ChatIcon({ name, size = 18, className, style }: {
  name: IconName; size?: number; className?: string; style?: CSSProperties;
}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>
    <path d={paths[name]} />
  </svg>;
}
