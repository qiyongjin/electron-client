# 按业务划分的桌面 API

preload 只暴露固定的业务方法，不暴露 `ipcRenderer` 或任意通道调用。
接口与 Window 类型统一维护在 `src/shared/types/bridge.ts`，IPC 参数及返回值维护在 `src/shared/types/ipc.ts`。

| 页面入口 | 职责 |
| --- | --- |
| `window.electronAPI.file` | 读写文件、文件对话框、文件信息、定位和打开文件 |
| `window.electronAPI.app` | 应用名称、版本、系统路径、退出和重启 |
| `window.electronAPI.windowControls` | 最小化、最大化、关闭、置顶、大小与位置 |
| `window.electronAPI.display` | 主显示器与全部显示器信息 |
| `window.electronAPI.clipboard` | 读写剪贴板文本 |
| `window.electronAPI.theme` | 系统主题查询与切换 |
| `window.electronAPI.dialog` | 消息及错误对话框 |
| `window.electronAPI.sevenapp` | 后端请求、取消和消息订阅 |

所有请求方法返回 Promise；`sevenapp.onMessage` 同步返回取消订阅函数。
普通浏览器不具有这些 API，使用前应检查是否存在。

```ts
const result = await window.electronAPI?.file.readFile('/path/to/file.txt');
const userData = await window.electronAPI?.app.getPath('userData');
await window.electronAPI?.windowControls.minimize();

const unsubscribe = window.electronAPI?.sevenapp.onMessage(message => console.log(message));
const response = await window.electronAPI?.sevenapp.request({ action: 'ping' });
unsubscribe?.();
```

业务 API 统一通过 `window.electronAPI` 暴露，例如 `window.electronAPI.file.readFile()`；不再向 Window 根对象挂载业务属性。项目调用处已迁移。修改 preload 后需重新编译并重启 Electron，页面热更新不会更新已加载的 preload。

验证命令：`npm run test:preload`。
