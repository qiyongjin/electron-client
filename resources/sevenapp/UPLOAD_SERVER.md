# 独立 Python 上传接收服务

仅使用 Python 3.8+ 标准库，无需 pip 安装。与 `stdio.py` 独立，在项目根目录启动：

```sh
python3 resources/sevenapp/upload_server.py
```

Windows 可用 `python` 替代 `python3`。

在 Electron `/agent` 页面将「服务端地址」填为 **http://127.0.0.1:17892**，选择文件后直接「开始上传」。不要点击「启动 / 更新测试服务」：该按钮启动的是原有 Node 服务（17891），会覆盖页面地址。

默认存储在脚本同级 `uploads/`，与启动命令所在工作目录无关：

- `<SHA256>-<分片大小>.bin`：合并且校验通过的完整文件，内容与源文件完全一致。
- `<SHA256>-<分片大小>/manifest.json`：原始文件名、大小及 Hash 等信息。
- 同目录 `0.part`、`0.json` 等：分片及校验信息，用于服务重启后的断点恢复。

可以指定目录与端口：

```sh
python3 resources/sevenapp/upload_server.py --port 17892 --directory /path/to/uploaded-files
```

测试自动重试和暂停恢复：

```sh
python3 resources/sevenapp/upload_server.py --fail-first --delay-ms 500
```

`--fail-first` 让每个分片首次请求返回 503，客户端自动重试；`--delay-ms` 支持 0–2000 毫秒。停止用 Ctrl+C；重启时使用相同目录，在页面点击「继续上传」。服务端重新校验已有分片，损坏或缺失的分片会重传。

支持 `GET /health`、`POST /uploads/init`、`PUT /uploads/:id/chunks/:index`、`POST /uploads/:id/complete`，与现有上传 Worker 协议一致。每个分片验证 SHA-256 与大小，合并过程流式处理并验证整文件 Hash，完成后原子替换输出文件。重复上传不会追加到旧文件。

这是本机测试服务，仅绑定 127.0.0.1，不提供账号鉴权或自动清理。保留分片和完整文件约占源文件两倍空间；测试结束并停止服务后可自行清理存储目录。不要让多个服务进程同时使用同一存储目录。

自动验证：`npm run test:upload:python`。测试在临时目录启动 Python 接收端，使用实际 Node Worker 验证 256 MiB 上传、并发重试、暂停恢复、任务持久化、损坏分片恢复、空文件及校验失败。
