import { ipcMain, app, dialog, clipboard, nativeTheme } from 'electron';

export function setupAppIpc(): void {
  // 应用控制
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:quit', () => {
    app.quit();
  });

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
    const result = await dialog.showMessageBox(options);
    return result;
  });

  // 显示错误对话框
  ipcMain.handle('dialog:showErrorBox', (event, title: string, content: string) => {
    dialog.showErrorBox(title, content);
  });

  // 获取应用路径
  ipcMain.handle('app:getPath', (event, name: string) => {
    return app.getPath(name as any);
  });

  // 获取应用名称
  ipcMain.handle('app:getName', () => {
    return app.getName();
  });
}