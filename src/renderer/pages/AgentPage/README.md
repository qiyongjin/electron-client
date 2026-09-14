# 智能体安装与运行

点击「安装 Agent」选择本地 `.dxt` / `.mcpb` 包后，在客户端组件弹窗中确认安装。安装、取消安装和卸载均使用 `ConfirmDialog`，不调用系统消息框；系统文件选择器仅用于选择安装包。

安装进度由真实任务推进：准备 → SHA-256 指纹（按已读字节）→ 解压与 CRC 校验（按文件数与当前文件已解压字节）→ 清单和入口校验 → 原子保存安装记录 → 完成。百分比采用各阶段权重，不根据定时器模拟。取消或失败不会显示 100%。切换页面、重新进入后通过快照恢复进度。

取消安装需在组件弹窗中确认。安装进程退出后才清理暂存目录，避免 Windows 文件锁；清理完毕才进入「已取消」。开始原子保存后不再允许取消。重复安装报错，失败或取消只清理本次暂存目录，已安装的智能体和配置保留。

接口：

- `agent.choosePackage()` 返回 `{ id, name, size }`，不把可任意替换的安装路径交给页面。
- `agent.install(sourceId)` 仅接受当前窗口选中的包 ID。
- `agent.getInstallProgress()` / `agent.onInstallProgress(callback)` 提供快照与持续进度，订阅返回清理函数。
- `agent.cancelInstall(taskId)` 校验发起窗口和任务 ID。

清单兼容 `manifest_version` / `dxt_version` 的 0.1、0.2、0.3，两个字段同时存在时必须一致。未知版本仍然拒绝，错误按字段展示。版本依据：[官方 0.2 Schema](https://github.com/modelcontextprotocol/mcpb/blob/main/schemas/mcpb-manifest-v0.2.schema.json)、[官方 0.3 Schema](https://github.com/modelcontextprotocol/mcpb/blob/main/schemas/mcpb-manifest-v0.3.schema.json)。

运行时将普通 stdout 启动横幅、JSON 日志隔离为经过脱敏的警告日志，继续等待真正的 MCP initialize 响应。损坏的 JSON-RPC、错误协议版本及连续超过 64 KiB 的非协议输出仍会报错；Python 使用 UTF-8 和无缓冲输出。安装包本身应遵循 [MCP stdio 规范](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)，把日志写到 stderr。

验证命令：

```sh
npm run test:agent
npm run test:preload
npm run typecheck:renderer
npm run build
node node_modules/electron/cli.js tests/agent-utility-smoke.mjs
```

最后一项在独立临时目录中验证真实 Electron UtilityProcess 安装、进度、取消与重试、MCP 启动及工具调用，不创建窗口，不使用用户的智能体安装目录。
