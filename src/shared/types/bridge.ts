import type { AgentAPI } from './agent';
import type { UploadAPI } from './upload';
import type { IpcChannels } from './ipc';

export interface FileAPI {
  readFile: IpcChannels['file:read'];
  writeFile: IpcChannels['file:write'];
  openDialog: IpcChannels['file:open-dialog'];
  saveDialog: IpcChannels['file:save-dialog'];
  getFileStat: IpcChannels['file:stat'];
  showInFolder: IpcChannels['file:show-in-folder'];
  openExternal: IpcChannels['file:open-external'];
}

export interface AppAPI {
  getVersion: IpcChannels['app:getVersion'];
  quit: IpcChannels['app:quit'];
  relaunch: IpcChannels['app:relaunch'];
  getPath: IpcChannels['app:getPath'];
  getName: IpcChannels['app:getName'];
}

export interface WindowControlsAPI {
  minimize: IpcChannels['window:minimize'];
  maximize: IpcChannels['window:maximize'];
  close: IpcChannels['window:close'];
  isMaximized: IpcChannels['window:isMaximized'];
  setAlwaysOnTop: IpcChannels['window:setAlwaysOnTop'];
  setSize: IpcChannels['window:setSize'];
  setPosition: IpcChannels['window:setPosition'];
  center: IpcChannels['window:center'];
}

export interface DisplayAPI {
  getPrimaryDisplay: IpcChannels['screen:getPrimaryDisplay'];
  getAllDisplays: IpcChannels['screen:getAllDisplays'];
}

export interface ClipboardAPI {
  readText: IpcChannels['clipboard:readText'];
  writeText: IpcChannels['clipboard:writeText'];
}

export interface ThemeAPI {
  shouldUseDarkColors: IpcChannels['theme:shouldUseDarkColors'];
  setThemeSource: IpcChannels['theme:setThemeSource'];
}

export interface DialogAPI {
  showMessageBox: IpcChannels['dialog:showMessageBox'];
  showErrorBox: IpcChannels['dialog:showErrorBox'];
}

export interface SevenappAPI {
  request: IpcChannels['sevenapp:request'];
  cancel: IpcChannels['sevenapp:cancel'];
  onMessage: (callback: (message: unknown) => void) => () => void;
}


export interface DesktopAPIs {
  agent: AgentAPI;
  upload: UploadAPI;
  file: FileAPI;
  app: AppAPI;
  windowControls: WindowControlsAPI;
  display: DisplayAPI;
  clipboard: ClipboardAPI;
  theme: ThemeAPI;
  dialog: DialogAPI;
  sevenapp: SevenappAPI;
}

// 普通浏览器没有 preload，调用方需处理 API 不存在的情况。
declare global {
  interface Window {
    electronAPI?: DesktopAPIs;
  }
}
