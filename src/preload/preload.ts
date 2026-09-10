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
  aipyappRequest: (payload: unknown) => Promise<unknown>;
  aipyappOnMessage: (callback: (message: unknown) => void) => () => void;
  aipyappCancel: (requestId: string) => Promise<{ success: boolean; cancelled: boolean }>;
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
  getPrimaryDisplay: () => ipcRenderer.invoke('screen:getPrimaryDisplay'),
  getWindowClose: () => ipcRenderer.invoke('window:close'),
  ping: () => ipcRenderer.invoke('ping'),
  showMessageBox: (options: any) => ipcRenderer.invoke('dialog:showMessageBox', options),
  getPath: (event: any, path: string) => ipcRenderer.invoke('app:getPath', event, path),
  aipyappRequest: (payload: unknown) => ipcRenderer.invoke('aipyapp:request', payload),
  aipyappCancel: (requestId: string) => ipcRenderer.invoke('aipyapp:cancel', requestId),
  aipyappOnMessage: (callback: (message: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: unknown) => callback(message);
    ipcRenderer.on('aipyapp:message', listener);
    return () => ipcRenderer.removeListener('aipyapp:message', listener);
  },

} as ElectronAPI);
