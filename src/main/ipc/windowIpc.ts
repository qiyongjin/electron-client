import { ipcMain, BrowserWindow, screen } from 'electron';

export function setupWindowIpc(): void {
  // 窗口控制
  ipcMain.handle('window:minimize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.minimize();
  });

  ipcMain.handle('window:maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window?.isMaximized()) {
      window.unmaximize();
    } else {
      window?.maximize();
    }
  });

  ipcMain.handle('window:close', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.close();
  });

  ipcMain.handle('window:isMaximized', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return window?.isMaximized();
  });

  ipcMain.handle('window:setAlwaysOnTop', (event, flag: boolean) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.setAlwaysOnTop(flag);
  });

  ipcMain.handle('window:setSize', (event, width: number, height: number) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.setSize(width, height);
  });

  ipcMain.handle('window:setPosition', (event, x: number, y: number) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.setPosition(x, y);
  });

  ipcMain.handle('window:center', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.center();
  });

  // 获取屏幕信息
  ipcMain.handle('screen:getPrimaryDisplay', () => {
    const primaryDisplay = screen.getPrimaryDisplay();
    return {
      bounds: primaryDisplay.bounds,
      workArea: primaryDisplay.workArea,
      scaleFactor: primaryDisplay.scaleFactor
    };
  });

  ipcMain.handle('screen:getAllDisplays', () => {
    const displays = screen.getAllDisplays();
    return displays.map(display => ({
      bounds: display.bounds,
      workArea: display.workArea,
      scaleFactor: display.scaleFactor
    }));
  });
}