import { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';
import { DEV_SERVER_URL, IS_DEV, PRELOAD_PATH, RENDERER_HTML_PATH } from './common.js';

export function createMainWindow(): BrowserWindow {
  
  const options: BrowserWindowConstructorOptions = {
    width: 1180,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,  // 避免渲染进程直接访问 Node.js
      contextIsolation: true,  // 确保渲染进程和主进程的上下文隔离
      preload: PRELOAD_PATH,
      webSecurity: IS_DEV // 保持现有开发/打包环境的 webSecurity 配置。
    },
    show: false,
  };

  let mainWindow = new BrowserWindow(options) as BrowserWindow | null;

  if (IS_DEV) {
    mainWindow?.loadURL(DEV_SERVER_URL).catch(err => {
      console.error('❌ Failed to load URL:', err);
    });
  } else {
    console.log('📁 Loading production file:', RENDERER_HTML_PATH);
    mainWindow?.loadFile(RENDERER_HTML_PATH).catch(err => {
      console.error('❌ Failed to load file:', err);
    });
  }

  mainWindow?.once('ready-to-show', () => {
    mainWindow?.show();

    // 开发环境下打开开发者工具
    if (IS_DEV) {
      mainWindow?.webContents.openDevTools();
    }
  });

  mainWindow?.on('closed', () => {
    console.log('❌ Window closed');
    mainWindow = null;
  });

  return mainWindow! as BrowserWindow;
}
