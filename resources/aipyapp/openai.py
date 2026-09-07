"""OpenAI 兼容接口调试，无第三方依赖（避免本文件与 openai SDK 同名冲突）。

在下方填写 API_KEY、BASE_URL 常量后运行：
    python resources/aipyapp/openai.py --model "你的模型名" --prompt "你好"
    python resources/aipyapp/openai.py --model "你的模型名" --prompt "你好" --no-stream
    python resources/aipyapp/openai.py --workers 20 --tasks 100 --rounds 3 --no-stream

多线程测试使用单个进程，最多 workers 个请求并发执行；每轮 tasks 个独立
对话，重复 rounds 轮。Windows 汇总包含进程内存，供比较多轮变化。

base_url 是 API 根地址（保留供应商要求的 /v1 等路径），也可填完整
/chat/completions 地址。stdout 仅输出逐行 JSON，便于进程通信。
接口文档：https://developers.openai.com/api/reference/resources/chat
"""

import argparse
import json
import math
import os
import sys
import threading
import time
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from copy import deepcopy
from typing import Any, Callable, Iterator
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


# 在这里填写你的配置；留空时兼容原有请求字段和环境变量配置。
API_KEY = "8676a080-ba76-4c52-a8c0-b70973930251"
BASE_URL = "https://aigw.intra.knownsec.com/glm-5/v1/chat/completions"
MODEL = "glm-5.2"


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # 避免把 Authorization 转发到重定向目标。
        return None


def _events(response) -> Iterator[str]:
    """按 SSE 空行边界读取事件，忽略注释及非 data 字段。"""
    lines = []
    for raw in response:
        line = raw.decode("utf-8").rstrip("\r\n")
        if not line:
            if lines:
                yield "\n".join(lines)
                lines = []
        elif line.startswith("data:"):
            lines.append(line[5:].removeprefix(" "))
    if lines:
        yield "\n".join(lines)


def _object(raw: str) -> dict[str, Any]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as error:
        raise ValueError("模型接口返回了无效 JSON，请检查 base_url 和接口兼容性") from error
    if not isinstance(data, dict):
        raise ValueError("模型接口响应必须是 JSON 对象")
    if data.get("error"):
        detail = data["error"]
        raise ValueError(str(detail.get("message", detail) if isinstance(detail, dict) else detail))
    return data


def chat(request: dict[str, Any], emit: Callable[[dict[str, Any]], None] | None = None) -> dict[str, Any]:
    """执行一次对话；emit 接收增量消息，返回值为唯一 done=True 响应。

    API_KEY、BASE_URL 常量优先；留空时请求字段优先于 OPENAI_* 环境变量。
    messages 可传完整对话历史，
    或使用 prompt 发送单轮文本。timeout 为连接/读取超时秒数，默认 120。
    """
    api_key = ""
    try:
        if not isinstance(request, dict):
            raise ValueError("请求必须是 JSON 对象")

        def setting(name: str) -> str:
            value = request.get(name, os.environ.get("OPENAI_" + name.upper(), ""))
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"请设置 {name} 或环境变量 OPENAI_{name.upper()}")
            return value.strip()

        api_key = API_KEY.strip() or setting("api_key")
        base_url = (BASE_URL.strip() or setting("base_url")).rstrip("/")
        model = (MODEL.strip() or setting("model")).rstrip("/")
        url = urlsplit(base_url)
        if (url.scheme not in ("http", "https") or not url.hostname
                or url.username or url.password or url.query or url.fragment):
            raise ValueError("base_url 必须是 http(s) 地址，不能包含账号、查询参数或片段")
        endpoint = base_url if base_url.endswith("/chat/completions") else base_url + "/chat/completions"
        timeout = float(request.get("timeout", 120))
        if not math.isfinite(timeout) or timeout <= 0:
            raise ValueError("timeout 必须是大于 0 的秒数")
        stream = request.get("stream", True)
        if not isinstance(stream, bool):
            raise ValueError("stream 必须是布尔值")
        messages = request.get("messages")
        if messages is None:
            prompt = request.get("prompt")
            if not isinstance(prompt, str) or not prompt.strip():
                raise ValueError("请提供非空 prompt 或 messages")
            messages = [{"role": "user", "content": prompt}]
        if not isinstance(messages, list) or not messages:
            raise ValueError("messages 必须是非空数组")
        if any(not isinstance(item, dict) or not isinstance(item.get("role"), str) for item in messages):
            raise ValueError("messages 中每条消息必须是包含 role 的对象")

        payload = {"model": model, "messages": messages, "stream": stream}
        for name in ("temperature", "max_tokens", "max_completion_tokens", "top_p", "stop"):
            if name in request:
                payload[name] = request[name]
        http_request = Request(endpoint, data=json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8"),
                               headers={"Authorization": f"Bearer {api_key}",
                                        "Content-Type": "application/json",
                                        "Accept": "text/event-stream" if stream else "application/json"})
        with build_opener(_NoRedirect()).open(http_request, timeout=timeout) as response:
            if not stream:
                data = _object(response.read().decode("utf-8"))
                choices = data.get("choices")
                if not choices:
                    raise ValueError("模型接口未返回 choices")
                return {"success": True, "done": True,
                        "message": choices[0]["message"].get("content") or "", "data": data}

            parts = []
            usage = None
            finish_reason = None
            completed = False
            for event in _events(response):
                if event.strip() == "[DONE]":
                    completed = True
                    break
                data = _object(event)
                if data.get("usage") is not None:
                    usage = data["usage"]
                for choice in data.get("choices", []):
                    if choice.get("index", 0) != 0:
                        continue
                    delta = choice.get("delta") or {}
                    content = delta.get("content") or ""
                    if content:
                        parts.append(content)
                    if emit and delta:
                        emit({"success": True, "stream": True, "done": False,
                              "message": content, "data": delta})
                    if choice.get("finish_reason") is not None:
                        finish_reason = choice["finish_reason"]
            if not completed and finish_reason is None:
                raise ValueError("模型流在结束标记之前断开，请检查网络或接口响应")
            return {"success": True, "done": True, "message": "".join(parts),
                    "data": {"model": model, "usage": usage, "finish_reason": finish_reason}}
    except HTTPError as error:
        with error:
            detail = error.read(4096).decode("utf-8", errors="replace")
        message = f"模型请求失败 HTTP {error.code}: {detail}"
    except (TimeoutError, URLError) as error:
        message = f"模型连接失败或超时，请检查地址、网络和 timeout: {error}"
    except Exception as error:
        message = str(error)
    if api_key:
        message = message.replace(api_key, "[REDACTED]")
    return {"success": False, "done": True, "error": message}


def process_memory() -> dict[str, float] | None:
    """Windows 进程内存快照；工作集和私有提交量不是同一指标。"""
    if sys.platform != "win32":
        return None
    import ctypes
    from ctypes import wintypes

    class MemoryCounters(ctypes.Structure):
        _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD)] + [
            (name, ctypes.c_size_t) for name in (
                "PeakWorkingSetSize", "WorkingSetSize", "QuotaPeakPagedPoolUsage",
                "QuotaPagedPoolUsage", "QuotaPeakNonPagedPoolUsage", "QuotaNonPagedPoolUsage",
                "PagefileUsage", "PeakPagefileUsage", "PrivateUsage")]

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    psapi = ctypes.WinDLL("psapi", use_last_error=True)
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(MemoryCounters), wintypes.DWORD]
    psapi.GetProcessMemoryInfo.restype = wintypes.BOOL
    counters = MemoryCounters()
    counters.cb = ctypes.sizeof(counters)
    if not psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
        return None
    return {"working_set_mb": round(counters.WorkingSetSize / 1024 ** 2, 2),
            "private_mb": round(counters.PrivateUsage / 1024 ** 2, 2)}


def run_concurrent(request: dict[str, Any], *, workers: int, tasks: int, rounds: int,
                   emit: Callable[[dict[str, Any]], None]) -> bool:
    """有界提交任务，只保留正在执行的 Future；所有回调输出串行化。

    每个任务深拷贝请求及消息历史。配置常量在运行过程中不要修改。
    success 统计请求是否正常完成，不判断模型回复的业务含义。
    """
    if any(isinstance(value, bool) or not isinstance(value, int) or value < 1
           for value in (workers, tasks, rounds)):
        raise ValueError("workers、tasks、rounds 必须是正整数")
    output_lock = threading.Lock()
    state_lock = threading.Lock()
    active = 0
    peak_active = 0
    all_success = True

    def output(event: dict[str, Any]) -> None:
        with output_lock:
            emit(event)

    def run_task(round_number: int, index: int) -> tuple[bool, float]:
        nonlocal active, peak_active
        identity = {"request_id": f"round-{round_number}-task-{index}",
                    "round": round_number, "task_id": index, "pid": os.getpid()}
        started = time.perf_counter()
        with state_lock:
            active += 1
            peak_active = max(peak_active, active)
        try:
            result = chat(deepcopy(request), lambda event: output({**event, **identity}))
            elapsed = time.perf_counter() - started
            output({**result, **identity, "elapsed_seconds": round(elapsed, 3)})
            return bool(result["success"]), elapsed
        finally:
            with state_lock:
                active -= 1

    with ThreadPoolExecutor(max_workers=min(workers, tasks), thread_name_prefix="model-chat") as pool:
        for round_number in range(1, rounds + 1):
            peak_active = 0
            succeeded = 0
            latency_total = 0.0
            memory_before = process_memory()
            started = time.perf_counter()
            output({"event": "round_start", "round": round_number, "pid": os.getpid(),
                    "tasks": tasks, "workers": min(workers, tasks), "memory": memory_before})
            next_index = 1
            pending = set()
            while next_index <= tasks or pending:
                while next_index <= tasks and len(pending) < workers:
                    pending.add(pool.submit(run_task, round_number, next_index))
                    next_index += 1
                finished, pending = wait(pending, return_when=FIRST_COMPLETED)
                for future in finished:
                    success, elapsed = future.result()
                    succeeded += int(success)
                    latency_total += elapsed
                # 不把上一批任务结果长期保存在列表或日志对象里。
                finished.clear()
            elapsed = time.perf_counter() - started
            all_success = all_success and succeeded == tasks
            output({"event": "summary", "round": round_number, "pid": os.getpid(),
                    "tasks": tasks, "succeeded": succeeded, "failed": tasks - succeeded,
                    "peak_active_tasks": peak_active, "elapsed_seconds": round(elapsed, 3),
                    "average_request_seconds": round(latency_total / tasks, 3),
                    "requests_per_second": round(tasks / elapsed, 3) if elapsed else 0,
                    "memory_before": memory_before, "memory_after": process_memory()})
    return all_success


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="调试 OpenAI 兼容模型，输出逐行 JSON")
    parser.add_argument("--base-url", help="BASE_URL 常量留空时使用，默认读取 OPENAI_BASE_URL")
    parser.add_argument("--model", help="供应商的模型 ID，默认读取 OPENAI_MODEL")
    parser.add_argument("--prompt", default="你是一个 小七AI助手，回答用户问题，除非用户可以指明用英文回复，其他一律中文回答", help="单轮对话文本")
    parser.add_argument("--timeout", type=float, default=120)
    parser.add_argument("--no-stream", action="store_true", help="一次性返回完整响应")
    parser.add_argument("--workers", type=int, default=1, help="并发线程上限，默认 1")
    parser.add_argument("--tasks", type=int, default=1, help="每轮独立对话数量，默认 1")
    parser.add_argument("--rounds", type=int, default=1, help="重复轮数，复用同一线程池，默认 1")
    parser.add_argument("--max-tokens", type=int, help="可选输出 token 上限，按供应商支持情况使用")
    args = parser.parse_args()
    if min(args.workers, args.tasks, args.rounds) < 1:
        parser.error("--workers、--tasks、--rounds 必须大于 0")
    request = {key: value for key, value in vars(args).items() if value is not None}
    for name in ("workers", "tasks", "rounds"):
        request.pop(name)
    request["stream"] = not request.pop("no_stream")

    def emit(data: dict[str, Any]) -> None:
        print(json.dumps(data, ensure_ascii=False), flush=True)

    if args.workers > 1 or args.tasks > 1 or args.rounds > 1:
        return 0 if run_concurrent(request, workers=args.workers, tasks=args.tasks,
                                   rounds=args.rounds, emit=emit) else 1

    result = chat(request, emit)
    emit(result)
    return 0 if result["success"] else 1


if __name__ == "__main__":
    sys.exit(main())
