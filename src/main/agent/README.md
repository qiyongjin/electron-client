# 本地 Agent 管理

入口：`/agent` →「本地 Agent」。选择 `.dxt` / `.mcpb` 安装包后安装，按需配置、启动、读取工具及测试调用。安装本身不执行包内程序；只有点击启动才执行。原有大文件上传功能保留在「上传测试」标签。

## 目录与职责

```text
main/
  agent/
    AgentManager.ts          # 业务入口、同一 Agent 操作互斥、退出协调
    AgentInstallManager.ts   # 安装 Utility Process、重复安装检查、提交安装
    AgentRuntimeManager.ts   # 每个 Agent 的运行 Utility Process、状态、请求与日志
    AgentRegistry.ts         # 已安装 Agent 与当前会话状态
    AgentStorage.ts          # 安装记录、配置持久化、临时目录及卸载清理
    manifest.ts              # 清单校验、配置校验、平台及路径变量替换
  ipc/agent.ipc.ts           # 固定业务 IPC、原生文件选择与确认、来源校验
  utility/
    installer/installer.ts   # 独立进程内解包、CRC 校验、manifest 校验
    runtime/agent-runtime.ts # 启动 MCP stdio 子进程、初始化、请求、停止进程树
```

安装目录由 `common.ts` 定义为 `path.join(USER_DATA_DIR, 'seven_app', 'agents')`，不是 `~/.seven`。

```text
<USER_DATA_DIR>/seven_app/agents/
  <Agent ID>/
    package/          # 包内文件，包括 manifest.json 与 server 入口
    record.json       # 名称、版本、包 SHA-256、安装时间
    config.json       # 配置（系统安全存储可用时整体加密）
  .stage-<UUID>/       # 安装中；成功后原子重命名
  .trash-<UUID>/       # 卸载中；失败时下次启动继续清理
```

Agent ID 是包内 `name` 的 SHA-256 前 32 位。同名包拒绝重复安装；升级需先卸载，卸载会同时删除配置。应用重启时从安装记录恢复列表，运行状态统一为未启动，不自动执行 Agent。主应用采用单实例锁，避免同时修改同一目录。

## 支持范围

- DXT `dxt_version: "0.1"`；MCPB `manifest_version: "0.1" / "0.2" / "0.3"`。
- 根目录必须包含 `manifest.json`；支持 Node、Python、binary 的 MCP stdio 服务。
- Node 包的 `command` 使用 `node`，由 Electron 自带 Node 执行。包须包含依赖，不运行 npm install / 生命周期脚本。
- Python 使用本机 `python3`（Windows 默认 `python`），可用 `SEVENAPP_PYTHON` 指定；依赖应打包在安装包中，通过 `PYTHONPATH` 等配置引用。支持配置中指定 Python 可执行文件。
- binary 启动程序必须位于安装目录内；保留 ZIP 内普通文件的可执行权限。
- 支持 `platform_overrides`、平台和运行时版本约束、`${__dirname}`、`${HOME}`、`${DESKTOP}`、`${DOCUMENTS}`、`${DOWNLOADS}`、`${pathSeparator}` / `${/}`、`${user_config.KEY}`，数组配置展开为独立参数。
- 支持 string、number、boolean、file、directory 配置；file / directory multiple 在页面每行填写一个路径。
- 支持 MCP 初始化协商版本 `2024-11-05`、`2025-03-26`、`2025-06-18`、`2025-11-25`，工具分页列表、工具调用、请求超时和取消通知。未声明 sampling / elicitation / roots 等客户端能力；对不支持的服务端请求返回错误。
- UV 自动环境安装、新版无初始化握手协议、HTTP MCP、自动更新、包签名验证和 ChatPage 自动工具编排不在当前实现范围。

Utility Process 将安装与运行工作从主进程分离，不是权限沙箱。启动后的 Agent 具有当前用户权限，因此安装入口提示仅安装可信来源的包。安装时拒绝路径越界、符号链接、特殊文件、重复路径、加密 ZIP、CRC 不符与超限文件：压缩包最多 512 MiB、解包最多 2 GiB、单文件 512 MiB、最多 100000 个文件。

敏感配置通过 Electron safeStorage 加密；Linux 的 basic_text 后端不视为可用安全存储，无安全存储时拒绝保存敏感字段。读取配置不向页面返回敏感值，只返回已配置标记；不修改则保留，显式清空可移除非必填密钥。页面运行日志保留当前会话最近 100 条，并替换配置中的敏感值；日志不是包内程序的安全边界。

停止时关闭 stdin，等待退出，超时终止进程树；应用退出等待安装/运行清理。运行 Utility Process 有主进程心跳检测。独立于页面生命周期，页面刷新不会停止 Agent。

## API

仅通过 `window.electronAPI.agent` 暴露：

- `install()`：原生选包、确认后安装；取消返回 null。
- `list()` / `onChanged(callback)`：安装列表和状态订阅；订阅返回解绑函数。
- `start(id)` / `stop(id)` / `uninstall(id)`：生命周期管理；卸载须通过原生确认。
- `getConfig(id)` / `saveConfig(id, values)`：读取非敏感配置、保存配置。
- `listTools(id)` / `callTool(id, name, args)`：运行后的工具发现与调用。
- `logs(id)`：最近运行日志。

## 本地试用与验证

```sh
npm run agent:example
```

生成 `temp/agents/seven-echo-demo.mcpb`。在页面安装后，启动 → 配置与工具 → 读取工具 → 选择 echo，填写：

```json
{"text":"你好，Seven"}
```

点击执行工具，应返回同样的文本。示例无网络请求，不需要配置密钥。

```sh
npm run test:agent
npm run test:preload
npm run typecheck:renderer
npm run build:all
```

真实 Electron 集成测试（macOS/Linux，临时用户目录、隐藏窗口，不触碰实际安装记录）：

```sh
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron tests/agent-electron-smoke.mjs
```

验证完整安装/重复安装拒绝、配置加密、MCP 初始化与工具调用、刷新保活、停止/重启、卸载和应用退出清理；截图输出 `/tmp/seven-agent-smoke.png`。Windows 可直接运行 Electron 命令，确保未设置 ELECTRON_RUN_AS_NODE。

参考规范：[MCPB manifest](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md)、[MCP 2025-11-25 生命周期](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)、[Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)。
