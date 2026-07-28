import { app, BrowserWindow, Menu } from 'electron';
import { join } from 'path';
import { createMainWindow } from './windowManager.js';
import { setupIpcHandlers } from './ipc/mainIpc.js';


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
      mainWindow.setIcon("C:\\Users\\Administrator\\Desktop\\python\\electron-client\\build\\icon.png");
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
