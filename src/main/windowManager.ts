import { app, BrowserWindow, BrowserWindowConstructorOptions } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// 手动设置开发环境判断
const __dirname = dirname(fileURLToPath(import.meta.url));

export function createMainWindow(): BrowserWindow {
  const isDev = !app.isPackaged;
  const preloadPath = join(__dirname, '../../preload/preload/preload.js');
  
  const options: BrowserWindowConstructorOptions = {
    width: 600,
    height: 600,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      webSecurity: isDev // 禁用浏览器的同源策略（CORS 限制），允许你的渲染进程随意请求任何跨域资源  
    },
    show: false,
  };

  const mainWindow = new BrowserWindow(options);

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000').catch(err => {
      console.error('❌ Failed to load URL:', err);
    });
  } else {
    const filePath = join(__dirname, '../../renderer/index.html');
    console.log('📁 Loading production file:', filePath);
    mainWindow.loadFile(filePath).catch(err => {
      console.error('❌ Failed to load file:', err);
    });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();

    // 开发环境下打开开发者工具
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => {
    console.log('❌ Window closed');
  });

  return mainWindow;
}
