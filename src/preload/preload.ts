// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';

// 定义 Electron API 的类型
export interface ElectronAPI {
  readFile: (filePath: string) => Promise<unknown>;
  writeFile: (filePath: string, content: string) => Promise<unknown>;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}
console.log('✅ Preload script loaded');

// 向渲染进程暴露安全的 API


contextBridge.exposeInMainWorld('electronAPI', {
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  writeFile: (filePath: string, content: string) => 
    ipcRenderer.invoke('file:write', filePath, content),
  minimize: () => ipcRenderer.invoke('app:minimize'),
  maximize: () => ipcRenderer.invoke('app:maximize'),
  close: () => ipcRenderer.invoke('app:close'),
  ping: () => ipcRenderer.invoke('ping'),
} as ElectronAPI);