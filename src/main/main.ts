import { app, BrowserWindow, Menu } from 'electron';
import { initLogger } from './logger.js';
import { createMainWindow } from './windowManager.js';
import { setupIpcHandlers } from './ipc/mainIpc.js';
import { setupAgentIpc } from './ipc/agent.ipc.js';
import { setupUploadIpc } from './ipc/uploadIpc.js';
import { setupFileIpc } from './ipc/fileIpc.js';
import { setupWindowIpc } from './ipc/windowIpc.js';
import { setupAppIpc } from './ipc/appIpc.js';
import { setupSevenappProcessIpc } from './ipc/sevenapp-process.js';
import { APP_ICON_PATH, IS_DEV, IS_MAC, NODE_ENV } from './common.js';


initLogger();

// 保持窗口对象的全局引用
let mainWindow: BrowserWindow | null = null;

const isPrimaryInstance = app.requestSingleInstanceLock();
if (!isPrimaryInstance) app.quit();

app.whenReady().then(async () => {
  if (!isPrimaryInstance) return;
  // 完全禁用菜单
  Menu.setApplicationMenu(null);
  
  try {
    mainWindow = createMainWindow();
    setupIpcHandlers();
    setupFileIpc();
    setupUploadIpc();
    await setupAgentIpc();
    setupWindowIpc();
    setupAppIpc();
    setupSevenappProcessIpc();
    
    // 开发环境下打开开发者工具
    if (NODE_ENV === 'development') {
      mainWindow.webContents.openDevTools();
    }

    if (IS_DEV) {
      // 针对 macOS 设置 Dock 图标
      if (IS_MAC) {
         app.dock?.setIcon(APP_ICON_PATH);
      }
      mainWindow.setIcon(APP_ICON_PATH);
    }
  } catch (error) {
    console.error('❌ Error creating window:', error); // 添加这行
  }
}).catch(error => {
  console.error('❌ App ready failed:', error); // 添加这行
});

app.on('window-all-closed', () => {
  console.log('🔄 All windows closed'); // 添加这行
  if (!IS_MAC) {
    app.quit();
  }
});

app.on('activate', () => {
  console.log('🔘 App activated'); // 添加这行
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
