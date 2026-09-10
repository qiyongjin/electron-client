// IPC 通道类型定义
export interface IpcChannels {
  // 文件操作
  'file:read': (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  'file:write': (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
  'file:open-dialog': (options: unknown) => Promise<unknown>;
  'file:save-dialog': (options: unknown) => Promise<unknown>;
  'file:stat': (filePath: string) => Promise<unknown>;
  'file:show-in-folder': (filePath: string) => Promise<{ success: boolean; error?: string }>;
  'file:open-external': (filePath: string) => Promise<{ success: boolean; error?: string }>;
  
  // 应用控制
  'app:getVersion': () => string;
  'app:quit': () => void;
  'app:relaunch': () => void;
  'app:getPath': (name: string) => string;
  'app:getName': () => string;
  
  // 剪贴板
  'clipboard:readText': () => string;
  'clipboard:writeText': (text: string) => boolean;
  
  // 主题
  'theme:shouldUseDarkColors': () => boolean;
  'theme:setThemeSource': (source: 'system' | 'light' | 'dark') => void;
  
  // 对话框
  'dialog:showMessageBox': (options: unknown) => Promise<unknown>;
  'dialog:showErrorBox': (title: string, content: string) => void;
  
  // 窗口控制
  'window:minimize': () => void;
  'window:maximize': () => void;
  'window:close': () => void;
  'window:isMaximized': () => boolean;
  'window:setAlwaysOnTop': (flag: boolean) => void;
  'window:setSize': (width: number, height: number) => void;
  'window:setPosition': (x: number, y: number) => void;
  'window:center': () => void;
  
  // 屏幕信息
  'screen:getPrimaryDisplay': () => never;
  'screen:getAllDisplays': () => never[];
  
  // 工具
  'ping': () => string;
  'aipyapp:request': (payload: unknown) => Promise<{
    success: boolean;
    message?: string;
    data?: unknown;
    error?: string;
    request_id?: string;
    stream?: boolean;
    done?: boolean;
    cancelled?: boolean;
  }>;
  'aipyapp:cancel': (requestId: string) => Promise<{ success: boolean; cancelled: boolean }>;
  'aipyapp:onMessage': (callback: (message: unknown) => void) => () => void;
}
