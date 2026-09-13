# 大文件上传测试

打开 `/agent` 页面，点击「启动 / 更新测试服务」，选择文件后「开始上传」。可设置每片 1/4/8/16 MiB、1–6 路并发，使用首请求失败与分片延迟验证重试和暂停。默认 4 MiB、3 路并发，每个请求最多重试 3 次，指数退避；主进程最多同时运行 2 个任务。

## 结构与存储

- `ipc/uploadIpc.ts`：固定业务 IPC、原生文件选择器、页面状态订阅、Worker 生命周期。
- `taskManager.ts`：小体积任务元数据持久化；独立于 React 页面。刷新页面只重新订阅，不停止上传。
- `upload.worker.ts`：流式 SHA-256、按位置读片、并发上传、重试、恢复与结果校验。IPC 仅传路径、参数和状态，不传文件二进制。
- `server.worker.ts` / `testServer.ts`：独立 Worker 内的本机 HTTP 测试服务，绑定 `127.0.0.1:17891`，接收分片并流式合并。
- `~/.seven/uploads/tasks.json` 保存任务；`~/.seven/uploads/receiver/` 保存分片及合并文件。所有路径通过主进程 common.ts 定义，兼容不同系统的用户目录。
- 每个文件以 SHA-256 标识，上传 ID 为 `<sha256>-<chunkSize>`，不以文件名作为唯一标识。

正常退出会记录暂停状态并停止 Worker；非正常退出后，上次活跃任务也会以暂停状态恢复。再次启动本机服务后点击「继续上传」。恢复时重新计算源文件 Hash，向服务端查询并校验现有分片，只发送缺失或损坏分片。取消任务停止客户端上传，保留服务端已有数据；测试文件不会自动清理。结束测试后可在应用退出时手动清理 receiver 目录释放空间（分片和合并文件约占原文件两倍空间）。

进度只计入服务端确认成功的分片，重试不重复计数；Hash 阶段显示独立进度。上传 100% 后仍需等待服务端合并及整文件 SHA-256、大小校验，只有校验通过才标记完成。速度是本次上传阶段已确认的新字节数 / 耗时，不包含历史恢复字节。修改源文件后应新建任务。

## Preload API

`window.electronAPI.upload`：`chooseFile`、`start`、`list`、`pause`、`resume`、`cancel`、`startLocalServer`、`onTasks`。事件回调不暴露 Electron event，返回取消订阅函数。完整类型见 `src/shared/types/upload.ts`。

## HTTP 协议

地址可填本机 HTTP 或远程 HTTPS；远程服务需实现以下协议，不是直接填写任意上传地址。当前测试协议没有账号鉴权、配额或服务端数据保留策略，不用于公开生产服务。

1. `POST /uploads/init`，JSON：
   ```json
   {"name":"example.bin","size":8388608,"fileHash":"64位小写SHA-256","chunkSize":4194304,"totalChunks":2}
   ```
   返回 `{"uploadId":"<fileHash>-4194304","uploaded":[0]}`。`uploaded` 为已经校验的零起始分片索引；服务端必须持久保存分片与校验信息。
2. `PUT /uploads/:uploadId/chunks/:index`，原始二进制 body，Header `x-chunk-sha256` 为当前片 SHA-256，`content-type: application/octet-stream`。
   返回 `{"index":0,"hash":"当前片SHA-256","size":4194304}`。校验字节数和 Hash 后才确认；重复提交同一片应幂等。
3. `POST /uploads/:uploadId/complete`，返回 `{"fileHash":"整文件SHA-256","size":8388608,"storageName":"服务端存储文件名"}`。
   逐片校验并流式合并，最终 Hash 不一致不发布合并文件。缺失/损坏分片返回 409；校验不符返回 422。重新「继续上传」会先再次查询分片，修复后合并。

网络错误、408、429、5xx 自动重试；其他 4xx 直接显示失败。每次请求超时 120 秒。合并重复请求应幂等，正在处理时可返回 503 让客户端重试。暂停期间服务端可能完成已经收到的请求，下次恢复以服务端状态为准。

## 验证

`npm run test:upload` 使用临时目录、本机随机端口和实际 Node Workers，验证 256 MiB 流式上传、24 MiB 并发故障重试、暂停与恢复、元数据重启、损坏分片恢复、源文件变化、空文件、错误 Hash、缺片、取消及重试耗尽。测试不写入真实用户的 `.seven` 目录。

`npm run test:preload` 验证业务接口转发与订阅解绑；`npm run typecheck:renderer` 与 `npm run build:renderer` 检查页面。

真实 Electron 验证：`env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron tests/upload-electron-smoke.mjs`（macOS / Linux）。使用隐藏窗口、真实 preload 和 IPC，上传中刷新页面，确认完成状态并截图至 `/tmp/seven-upload-smoke.png`。Windows 可直接运行 `electron tests/upload-electron-smoke.mjs`，确保未设置 `ELECTRON_RUN_AS_NODE`。

打包配置将 Worker 及其共享运行时模块放入 `app.asar.unpacked`，common.ts 根据开发 / 打包环境选择真实文件路径。本次验证包含开发 Electron 运行，未生成或签名安装包。
