import type { AgentAPI } from './agent';
import type { UploadAPI } from './upload';
import type { App, MessageBoxOptions, MessageBoxReturnValue, OpenDialogOptions, OpenDialogReturnValue, Rectangle, SaveDialogOptions, SaveDialogReturnValue } from 'electron';

export type AppPathName = Parameters<App['getPath']>[0];
export interface OperationResult { success: boolean; error?: string }
export interface DisplayInfo { bounds: Rectangle; workArea: Rectangle; scaleFactor: number }
export interface FileStatResult extends OperationResult {
  stat?: { isFile: boolean; isDirectory: boolean; size: number; mtime: Date; ctime: Date };
}
export interface SevenappResponse extends OperationResult {
  message?: string; data?: unknown; request_id?: string;
  stream?: boolean; done?: boolean; cancelled?: boolean;
}

// 所有 invoke 请求均返回 Promise，即使主进程 handler 本身是同步函数。
export interface IpcChannels {
  'agent:install': AgentAPI['install'];
  'agent:list': AgentAPI['list'];
  'agent:start': AgentAPI['start'];
  'agent:stop': AgentAPI['stop'];
  'agent:uninstall': AgentAPI['uninstall'];
  'agent:get-config': AgentAPI['getConfig'];
  'agent:save-config': AgentAPI['saveConfig'];
  'agent:tools': AgentAPI['listTools'];
  'agent:call-tool': AgentAPI['callTool'];
  'agent:logs': AgentAPI['logs'];

  'upload:choose-file': UploadAPI['chooseFile'];
  'upload:start': UploadAPI['start'];
  'upload:list': UploadAPI['list'];
  'upload:pause': UploadAPI['pause'];
  'upload:resume': UploadAPI['resume'];
  'upload:cancel': UploadAPI['cancel'];
  'upload:start-local-server': UploadAPI['startLocalServer'];
  'file:read': (filePath: string) => Promise<OperationResult & { content?: string }>;
  'file:write': (filePath: string, content: string) => Promise<OperationResult>;
  'file:open-dialog': (options: OpenDialogOptions) => Promise<OpenDialogReturnValue>;
  'file:save-dialog': (options: SaveDialogOptions) => Promise<SaveDialogReturnValue>;
  'file:stat': (filePath: string) => Promise<FileStatResult>;
  'file:show-in-folder': (filePath: string) => Promise<OperationResult>;
  'file:open-external': (filePath: string) => Promise<OperationResult>;
  'app:getVersion': () => Promise<string>;
  'app:quit': () => Promise<void>;
  'app:relaunch': () => Promise<void>;
  'app:getPath': (name: AppPathName) => Promise<string>;
  'app:getName': () => Promise<string>;
  'clipboard:readText': () => Promise<string>;
  'clipboard:writeText': (text: string) => Promise<boolean>;
  'theme:shouldUseDarkColors': () => Promise<boolean>;
  'theme:setThemeSource': (source: 'system' | 'light' | 'dark') => Promise<void>;
  'dialog:showMessageBox': (options: MessageBoxOptions) => Promise<MessageBoxReturnValue>;
  'dialog:showErrorBox': (title: string, content: string) => Promise<void>;
  'window:minimize': () => Promise<void>;
  'window:maximize': () => Promise<void>;
  'window:close': () => Promise<void>;
  'window:isMaximized': () => Promise<boolean | undefined>;
  'window:setAlwaysOnTop': (flag: boolean) => Promise<void>;
  'window:setSize': (width: number, height: number) => Promise<void>;
  'window:setPosition': (x: number, y: number) => Promise<void>;
  'window:center': () => Promise<void>;
  'screen:getPrimaryDisplay': () => Promise<DisplayInfo>;
  'screen:getAllDisplays': () => Promise<DisplayInfo[]>;
  'ping': () => Promise<string>;
  'sevenapp:request': (payload: unknown) => Promise<SevenappResponse>;
  'sevenapp:cancel': (requestId: string) => Promise<{ success: boolean; cancelled: boolean }>;
}
