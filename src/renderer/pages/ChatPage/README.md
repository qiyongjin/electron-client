# ChatPage

桌面端默认进入 `#/chatPage`，`#/chat` 为别名。原测试页、看板和广播页分别保留在 `#/test`、`#/home`、`#/broad`。Hash 路由同时兼容 Vite 和打包后的 `file://` 页面。

## 职责划分

- `index.tsx`：组合当前会话、侧栏、消息列表、输入区和空状态。
- `stores/useChatStore.ts`：会话、消息、生成请求及消息内的工具和引用状态；会话保留在当前应用运行期间。
- `MessageList` / `MessageItem` / `MessageContent`：分批显示历史（每次 30 条）、滚动位置保持、回到最新消息、按角色渲染，以及基础 Markdown（段落、标题、列表、加粗、行内代码、代码块和引用）。不会渲染原始 HTML。
- `ToolCallCard`：文件、检索、图片与任务的通用工具卡片，支持执行中、完成、失败，以及参数和结果展开。
- `CitationList` / `ReferencePanel`：来源名称、页码、片段、可选相似度和原文弹窗。当前附件显示为“本轮参考文件”，不会伪造模型引用或检索相似度。
- `ChatInput`：草稿、Enter 发送、Shift + Enter 换行、中文输入法保护、发送和停止。切换会话保留各自草稿。
- `AttachmentUploader` / `AttachmentList`：选择、拖入、进度、预览、删除及失败重试。
- `useChatStream` / `useMessageSender` / `useFileUpload`：请求生命周期、历史上下文和文件处理。

## 当前后端能力

通过已有的 `electronAPI.sevenappRequest({ action: 'chat', request_id, messages, stream: true })` 调用 `resources/sevenapp/openai.py`，沿用其模型配置。浏览器中可预览布局，发送需要 Electron preload 桥接。

主进程为增量和完成响应附加 `request_id`；渲染层订阅后再发起请求，只接收当前请求的事件。`sevenappCancel(requestId)` 校验窗口归属，取消排队请求或结束正在执行该请求的 Python 进程；后续请求自动启动新进程，旧进程的迟到事件不会污染新请求。

当前没有云端文件上传、PDF/OCR、知识库检索、图片生成或通用工具执行接口。附件适配器使用 FileReader 读取 UTF-8 的 TXT、MD、CSV、JSON（最多 5 个，每个 1 MB 且不超过 40,000 字符），把全文加入模型上下文，显示真实读取结果。接入上传服务时可替换 `useFileUpload`，保持附件组件接口。未来的工具执行和引用事件可在 `useChatStream` 中映射到 `ChatMessage.toolCalls` / `citations`，组件无需改写。

模型返回的 `data.reasoning_content` / `data.reasoning` 显示为可折叠思考区。失败时保留用户消息和部分输出；最后一条 AI 回复支持重试或重新生成。生成期间跨会话禁止并行发送，仍可浏览其他会话并编辑草稿。

## 验证

```sh
npm run typecheck:renderer
npm run test:chat
npm run build
```

自动测试覆盖会话隔离、附件上下文、流监听清理、停止后的迟到响应、后端队列、取消权限和异常恢复。测试使用本地依赖替身，不会调用模型或读取模型凭据。
