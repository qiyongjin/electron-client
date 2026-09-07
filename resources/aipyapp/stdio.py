"""AiPy App 的最小 stdio 后端。"""

import json
import sys
from typing import Any
import time

from openai import chat


def respond(payload: dict[str, Any]) -> None:
    """向 Electron 写入一条响应，并立即刷新缓冲区。"""
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def handle_request(request: Any) -> dict[str, Any]:
    if not isinstance(request, dict):
        return {"success": False, "done": True, "error": "请求必须是 JSON 对象"}

    action = request.get("action", "ping")
    if action == "ping":
        return {"success": True, "done": True, "message": "aipyapp stdio backend is running"}
    if action == "chat":
        return chat(request, respond)
    if action == "message":
        for index in range(20):
            # stream=True 表示这是一条进度消息，不会结束 Electron 的 invoke 请求。
            respond({"success": True, "stream": True, "message": f"Message {index}"})
            time.sleep(1)
        return {"success": True, "done": True, "message": "所有消息已发送"}

    # 最小示例：后端收到什么，就把它原样回传给主进程。
    return {"success": True, "done": True, "data": request}


def main() -> None:
    for stream in (sys.stdin, sys.stdout):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            respond(handle_request(json.loads(line)))
        except json.JSONDecodeError:
            respond({"success": False, "done": True, "error": "无效的 JSON 请求"})
        except Exception as error:  # 防止单条请求导致服务退出
            respond({"success": False, "done": True, "error": str(error)})


if __name__ == "__main__":
    print("backend start", flush=True, file=sys.stderr)
    main()
