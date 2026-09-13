import type { AgentAPI } from '../shared/types/agent';
import type { UploadAPI } from '../shared/types/upload';
/**
 * 预加载脚本，用于在渲染进程和主进程之间建立 IPC 通道。
 * 根据 业务模块，暴露不同的 API。
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcChannels } from '../shared/types/ipc';
import type { FileAPI, AppAPI, WindowControlsAPI, DisplayAPI, ClipboardAPI, ThemeAPI, DialogAPI, SevenappAPI, DesktopAPIs } from '../shared/types/bridge';

// 只在 preload 内部使用，不向页面暴露任意通道的 invoke/on。
function invoke<K extends keyof IpcChannels>(channel: K, ...args: Parameters<IpcChannels[K]>): ReturnType<IpcChannels[K]> {
  return ipcRenderer.invoke(channel, ...args) as ReturnType<IpcChannels[K]>;
}

// 文件操作 API
const file = {
  readFile: (...args) => invoke('file:read', ...args),
  writeFile: (...args) => invoke('file:write', ...args),
  openDialog: (...args) => invoke('file:open-dialog', ...args),
  saveDialog: (...args) => invoke('file:save-dialog', ...args),
  getFileStat: (...args) => invoke('file:stat', ...args),
  showInFolder: (...args) => invoke('file:show-in-folder', ...args),
  openExternal: (...args) => invoke('file:open-external', ...args),
} satisfies FileAPI;

// 应用操作 API
const app = {
  getVersion: (...args) => invoke('app:getVersion', ...args),
  quit: (...args) => invoke('app:quit', ...args),
  relaunch: (...args) => invoke('app:relaunch', ...args),
  getPath: (...args) => invoke('app:getPath', ...args),
  getName: (...args) => invoke('app:getName', ...args),
} satisfies AppAPI;

// 窗口操作 API
const windowControls = {
  minimize: (...args) => invoke('window:minimize', ...args),
  maximize: (...args) => invoke('window:maximize', ...args),
  close: (...args) => invoke('window:close', ...args),
  isMaximized: (...args) => invoke('window:isMaximized', ...args),
  setAlwaysOnTop: (...args) => invoke('window:setAlwaysOnTop', ...args),
  setSize: (...args) => invoke('window:setSize', ...args),
  setPosition: (...args) => invoke('window:setPosition', ...args),
  center: (...args) => invoke('window:center', ...args),
} satisfies WindowControlsAPI;

// 显示操作 API
const display = {
  getPrimaryDisplay: (...args) => invoke('screen:getPrimaryDisplay', ...args),
  getAllDisplays: (...args) => invoke('screen:getAllDisplays', ...args),
} satisfies DisplayAPI;

// 剪贴板操作 API
const clipboard = {
  readText: (...args) => invoke('clipboard:readText', ...args),
  writeText: (...args) => invoke('clipboard:writeText', ...args),
} satisfies ClipboardAPI;

// 主题操作 API
const theme = {
  shouldUseDarkColors: (...args) => invoke('theme:shouldUseDarkColors', ...args),
  setThemeSource: (...args) => invoke('theme:setThemeSource', ...args),
} satisfies ThemeAPI;

// 对话框操作 API
const dialog = {
  showMessageBox: (...args) => invoke('dialog:showMessageBox', ...args),
  showErrorBox: (...args) => invoke('dialog:showErrorBox', ...args),
} satisfies DialogAPI;

// 小七应用操作 API
const sevenapp = {
  request: (...args) => invoke('sevenapp:request', ...args),
  cancel: (...args) => invoke('sevenapp:cancel', ...args),
  onMessage: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, message: unknown) => callback(message);
    ipcRenderer.on('sevenapp:message', listener);
    return () => ipcRenderer.removeListener('sevenapp:message', listener);
  },
} satisfies SevenappAPI;

const upload = {
  chooseFile: () => invoke('upload:choose-file'),
  start: options => invoke('upload:start', options),
  list: () => invoke('upload:list'),
  pause: id => invoke('upload:pause', id),
  resume: id => invoke('upload:resume', id),
  cancel: id => invoke('upload:cancel', id),
  startLocalServer: options => invoke('upload:start-local-server', options),
  onTasks: callback => {
    const listener = (_event: Electron.IpcRendererEvent, tasks: Parameters<typeof callback>[0]) => callback(tasks);
    ipcRenderer.on('upload:tasks', listener);
    return () => ipcRenderer.removeListener('upload:tasks', listener);
  },
} satisfies UploadAPI;

const agent = {
  install: () => invoke('agent:install'),
  list: () => invoke('agent:list'),
  start: id => invoke('agent:start', id),
  stop: id => invoke('agent:stop', id),
  uninstall: id => invoke('agent:uninstall', id),
  getConfig: id => invoke('agent:get-config', id),
  saveConfig: (id, values) => invoke('agent:save-config', id, values),
  listTools: id => invoke('agent:tools', id),
  callTool: (id, name, args) => invoke('agent:call-tool', id, name, args),
  logs: id => invoke('agent:logs', id),
  onChanged: callback => {
    const listener = (_event: Electron.IpcRendererEvent, agents: Parameters<typeof callback>[0]) => callback(agents);
    ipcRenderer.on('agent:changed', listener);
    return () => ipcRenderer.removeListener('agent:changed', listener);
  },
} satisfies AgentAPI;

const api = {
  agent,
  upload,
  file,
  app,
  windowControls,
  display,
  clipboard,
  theme,
  dialog,
  sevenapp
} satisfies DesktopAPIs;

// 只占用一个全局属性，避免业务名称与浏览器原生属性冲突。
contextBridge.exposeInMainWorld('electronAPI', api);

console.log('✅ Preload business APIs loaded');
