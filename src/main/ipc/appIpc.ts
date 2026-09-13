import { ipcMain, app, dialog, clipboard, nativeTheme } from 'electron';
import { getAppPath, type AppPathName, APP_ICON_PATH } from '../common.js';

export function setupAppIpc(): void {
  // 应用控制
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:quit', () => {
    app.quit();
  });


  // 应用重启
  ipcMain.handle('app:relaunch', () => {
    app.relaunch();
    app.exit();
  });

  // 剪贴板操作
  ipcMain.handle('clipboard:readText', () => {
    return clipboard.readText();
  });

  ipcMain.handle('clipboard:writeText', (event, text: string) => {
    clipboard.writeText(text);
    return true;
  });

  // 主题控制
  ipcMain.handle('theme:shouldUseDarkColors', () => {
    return nativeTheme.shouldUseDarkColors;
  });

  ipcMain.handle('theme:setThemeSource', (event, source: 'system' | 'light' | 'dark') => {
    nativeTheme.themeSource = source;
  });

  // 显示消息对话框
  ipcMain.handle('dialog:showMessageBox', async (event, options: any) => {
    const result = await dialog.showMessageBox({...options, icon: APP_ICON_PATH});
    return result;
  });


  // 获取应用名称
  ipcMain.handle('app:getName', () => {
    return app.getName();
  });
}
