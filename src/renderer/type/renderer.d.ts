// CSS 模块声明
declare module '*.css' {
  const styles: Record<string, string>;
  export default styles;
}

// CSS 副作用导入
declare module '*.css' {
  const content: string;
  export default content;
}

// 图片资源
declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}

declare module '*.svg' {
  const value: string;
  export default value;
}

import type { IpcChannels } from '../../shared/types/ipc';

declare global {
  interface Window {
    electronAPI: {
      readFile: IpcChannels['file:read'];
      writeFile: IpcChannels['file:write'];
      ping: IpcChannels['ping'];
      minimize: IpcChannels['window:minimize'];
      maximize: IpcChannels['window:maximize'];
      close: IpcChannels['window:close'];
      getPrimaryDisplay: IpcChannels['screen:getPrimaryDisplay'];
      getWindowClose: IpcChannels['window:close'];
      showMessageBox: IpcChannels['dialog:showMessageBox'];
      getPath: IpcChannels['app:getPath'];

      sevenappRequest: IpcChannels["sevenapp:request"];
      sevenappOnMessage: IpcChannels["sevenapp:onMessage"];
      sevenappCancel: IpcChannels['sevenapp:cancel'];
    };
  }
}

export {};
