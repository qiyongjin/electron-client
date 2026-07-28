import { ipcMain, dialog, shell } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { readFile, writeFile, stat } from 'fs/promises';

export function setupFileIpc(): void {
  // 读取文件
  ipcMain.handle('file:read', async (event, filePath: string): Promise<{ success: boolean; content?: string; error?: string }> => {
    try {
      const content = await readFile(filePath, 'utf-8');
      return { success: true, content };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 写入文件
  ipcMain.handle('file:write', async (event, filePath: string, content: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // 确保目录存在
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      
      await writeFile(filePath, content, 'utf-8');
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 打开文件对话框
  ipcMain.handle('file:open-dialog', async (event, options: any) => {
    const result = await dialog.showOpenDialog(options);
    return result;
  });

  // 保存文件对话框
  ipcMain.handle('file:save-dialog', async (event, options: any) => {
    const result = await dialog.showSaveDialog(options);
    return result;
  });

  // 获取文件信息
  ipcMain.handle('file:stat', async (event, filePath: string) => {
    try {
      const fileStat = await stat(filePath);
      return {
        success: true,
        stat: {
          isFile: fileStat.isFile(),
          isDirectory: fileStat.isDirectory(),
          size: fileStat.size,
          mtime: fileStat.mtime,
          ctime: fileStat.ctime
        }
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 在文件管理器中显示文件
  ipcMain.handle('file:show-in-folder', async (event, filePath: string) => {
    try {
      await shell.showItemInFolder(filePath);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  // 打开文件外部
  ipcMain.handle('file:open-external', async (event, filePath: string) => {
    try {
      await shell.openExternal(`file://${filePath}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
}