import { ipcMain } from 'electron';

export function setupIpcHandlers(): void {
  
  ipcMain.handle('ping', () => {
    console.log('🏓 Ping received'); // 添加这行
    return 'pong from main process';
  });
}