
import { IpcChannels } from '../shared/types/ipc';

// 扩展 Window 接口
declare global {
  interface Window {
    electronAPI: {
    //   readFile: (filePath: string) => Promise<unknown>;
    //   writeFile: (filePath: string, content: string) => Promise<unknown>;
    //   minimize: () => void;
    //   maximize: () => void;
    //   close: () => void;

      // 文件操作
      readFile: IpcChannels['file:read'];
      writeFile: IpcChannels['file:write'];
      openDialog: IpcChannels['file:open-dialog'];
      saveDialog: IpcChannels['file:save-dialog'];
      getFileStat: IpcChannels['file:stat'];
      showInFolder: IpcChannels['file:show-in-folder'];
      openExternal: IpcChannels['file:open-external'];
      
      // 应用控制
      getAppVersion: IpcChannels['app:getVersion'];
      quitApp: IpcChannels['app:quit'];
      relaunchApp: IpcChannels['app:relaunch'];
      getPath: IpcChannels['app:getPath'];
      getAppName: IpcChannels['app:getName'];
      
      // 剪贴板
      readClipboardText: IpcChannels['clipboard:readText'];
      writeClipboardText: IpcChannels['clipboard:writeText'];
      
      // 主题
      shouldUseDarkColors: IpcChannels['theme:shouldUseDarkColors'];
      setThemeSource: IpcChannels['theme:setThemeSource'];
      
      // 对话框
      showMessageBox: IpcChannels['dialog:showMessageBox'];
      showErrorBox: IpcChannels['dialog:showErrorBox'];
      
      // 窗口控制
      minimize: IpcChannels['window:minimize'];
      maximize: IpcChannels['window:maximize'];
      close: IpcChannels['window:close'];
      isMaximized: IpcChannels['window:isMaximized'];
      setAlwaysOnTop: IpcChannels['window:setAlwaysOnTop'];
      setSize: IpcChannels['window:setSize'];
      setPosition: IpcChannels['window:setPosition'];
      center: IpcChannels['window:center'];
      
      // 屏幕信息
      getPrimaryDisplay: IpcChannels['screen:getPrimaryDisplay'];
      getAllDisplays: IpcChannels['screen:getAllDisplays'];
      
      // 工具
      ping: IpcChannels['ping'];
      sevenappRequest: IpcChannels['sevenapp:request'];
      sevenappOnMessage: IpcChannels['sevenapp:onMessage'];
      sevenappCancel: IpcChannels['sevenapp:cancel'];
    };
  }
}

export {};
