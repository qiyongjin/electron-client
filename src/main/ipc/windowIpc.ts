import { ipcMain, BrowserWindow, screen } from 'electron';

export function setupWindowIpc(): void {
  // 窗口控制
  // 最小化发起调用的 BrowserWindow。
  ipcMain.handle('window:minimize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.minimize();
  });

  // 切换发起调用窗口的最大化状态：已最大化时还原，否则最大化。
  ipcMain.handle('window:maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window?.isMaximized()) {
      window.unmaximize();
    } else {
      window?.maximize();
    }
  });

  // 关闭发起调用的 BrowserWindow。
  ipcMain.handle('window:close', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.close();
  });

  // 返回发起调用窗口当前是否处于最大化状态。
  ipcMain.handle('window:isMaximized', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return window?.isMaximized();
  });

  // 根据 flag 设置发起调用窗口是否始终置顶。
  ipcMain.handle('window:setAlwaysOnTop', (event, flag: boolean) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.setAlwaysOnTop(flag);
  });

  // 将发起调用窗口调整为指定的宽度和高度（单位为 DIP）。
  ipcMain.handle('window:setSize', (event, width: number, height: number) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.setSize(width, height);
  });

  // 将发起调用窗口移动到指定屏幕坐标（单位为 DIP）。
  ipcMain.handle('window:setPosition', (event, x: number, y: number) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.setPosition(x, y);
  });

  // 将发起调用窗口移动到当前屏幕工作区域中央。
  ipcMain.handle('window:center', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    window?.center();
  });

  // 获取屏幕信息
  // 获取主显示器的完整边界、可用工作区和缩放比例。
  ipcMain.handle('screen:getPrimaryDisplay', () => {
    const primaryDisplay = screen.getPrimaryDisplay();
    return {
      bounds: primaryDisplay.bounds,
      workArea: primaryDisplay.workArea,
      scaleFactor: primaryDisplay.scaleFactor
    };
  });

  // 获取所有已连接显示器的边界、可用工作区和缩放比例列表。
  ipcMain.handle('screen:getAllDisplays', () => {
    const displays = screen.getAllDisplays();
    return displays.map(display => ({
      bounds: display.bounds,
      workArea: display.workArea,
      scaleFactor: display.scaleFactor
    }));
  });
}
