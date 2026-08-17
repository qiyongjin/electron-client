import { app, BrowserWindow, Menu } from 'electron';
import { createMainWindow } from './windowManager.js';
import { setupIpcHandlers } from './ipc/mainIpc.js';
import path from 'path';  
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 保持窗口对象的全局引用
let mainWindow: BrowserWindow | null = null;

app.whenReady().then(() => {
  // 完全禁用菜单
  Menu.setApplicationMenu(null);
  
  try {
    mainWindow = createMainWindow();
    setupIpcHandlers();
    
    // 开发环境下打开开发者工具
    if (process.env.NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools();
    }

    if (!app.isPackaged) {
      console.log("-----------", __dirname)
      const iconPath = path.join(__dirname, '../../../', 'build', 'icon.png');
      // 针对 macOS 设置 Dock 图标
      if (process.platform === 'darwin') {
         app.dock?.setIcon(iconPath);
      } 
      // 针对 Windows/Linux 保留窗口图标
      else {
        mainWindow.setIcon(iconPath);
      }
      mainWindow.setIcon(iconPath);
    }
  } catch (error) {
    console.error('❌ Error creating window:', error); // 添加这行
  }
}).catch(error => {
  console.error('❌ App ready failed:', error); // 添加这行
});

app.on('window-all-closed', () => {
  console.log('🔄 All windows closed'); // 添加这行
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  console.log('🔘 App activated'); // 添加这行
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
