import { app, ipcMain, type WebContents } from 'electron';
import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

export interface SevenappResponse {
  success: boolean;
  message?: string;
  data?: unknown;
  error?: string;
  stream?: boolean;
  done?: boolean;
  request_id?: string;
  cancelled?: boolean;
}

let backend: ChildProcessWithoutNullStreams | undefined;
interface PendingRequest {
  payload: unknown;
  requestId?: string;
  resolve: (response: SevenappResponse) => void;
  reject: (error: Error) => void;
  sender?: WebContents;
}
const pendingRequests: PendingRequest[] = [];
let activeRequest: PendingRequest | undefined;
let shuttingDown = false;

function getBackendScriptPath(): string {
  // 开发时 main 入口位于 dist/main/main/ipc，不能依赖 app.getAppPath()
  // （它会指向 dist/main/main，而不是项目根目录）。
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const developmentPath = path.resolve(currentDirectory, '../../../../resources/sevenapp/stdio.py');
  if (!app.isPackaged) return developmentPath;
  const packagedPath = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'resources',
    'sevenapp',
    'stdio.py',
  );

  return existsSync(packagedPath) ? packagedPath : developmentPath;
}

function failBackend(child: ChildProcessWithoutNullStreams, error: Error): void {
  // A cancelled process can exit after its replacement starts. Ignore its late events.
  if (backend !== child) return;
  backend = undefined;
  child.kill();
  const request = activeRequest;
  activeRequest = undefined;
  request?.reject(error);
  dispatchNextRequest();
}

function startBackend(): ChildProcessWithoutNullStreams {
  if (backend && !backend.killed) return backend;

  const scriptPath = getBackendScriptPath();
  if (!existsSync(scriptPath)) throw new Error(`找不到 sevenapp 后端文件: ${scriptPath}`);

  const pythonCommand = process.env.SEVENAPP_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
  const child = spawn(pythonCommand, ['-u', scriptPath], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  backend = child;

  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    if (backend !== child) return;
    const request = activeRequest;
    if (!request) return;

    try {
      const response = { ...JSON.parse(line), request_id: request.requestId } as SevenappResponse;
      if (request.sender && !request.sender.isDestroyed()) {
        request.sender.send('sevenapp:message', response);
      }
      if (response.done) {
        activeRequest = undefined;
        request.resolve(response);
        dispatchNextRequest();
      }
    } catch {
      failBackend(child, new Error('sevenapp 返回了无效 JSON'));
    }
  });

  child.stderr.on('data', (chunk: Buffer) => console.error(`[sevenapp] ${chunk.toString().trim()}`));
  child.on('error', (error) => {
    failBackend(child, new Error(`无法启动 sevenapp 后端: ${error.message}`));
  });
  child.on('exit', (code, signal) => {
    failBackend(child, new Error(`sevenapp 后端已退出 (code=${code}, signal=${signal})`));
  });

  return child;
}

function dispatchNextRequest(): void {
  if (shuttingDown || activeRequest || !pendingRequests.length) return;
  const request = pendingRequests.shift()!;
  activeRequest = request;
  try {
    const serialized = JSON.stringify(request.payload);
    const child = startBackend();
    child.stdin.write(`${serialized}\n`, (error) => {
      if (error && activeRequest === request) failBackend(child, error);
    });
  } catch (error) {
    activeRequest = undefined;
    request.reject(error instanceof Error ? error : new Error(String(error)));
    dispatchNextRequest();
  }
}

export function sendSevenappRequest(payload: unknown, sender?: WebContents): Promise<SevenappResponse> {
  return new Promise((resolve, reject) => {
    if (shuttingDown) { reject(new Error('应用正在关闭')); return; }
    const requestId = typeof payload === 'object' && payload !== null && 'request_id' in payload
      && typeof payload.request_id === 'string' ? payload.request_id : undefined;
    pendingRequests.push({ payload, requestId, resolve, reject, sender });
    dispatchNextRequest();
  });
}

/**
 * 取消 sevenapp 请求
 * @param requestId 请求 ID
 * @param sender 发送者
 * @returns 取消结果
 * 
 */
export function cancelSevenappRequest(requestId: string, sender: WebContents): { success: boolean; cancelled: boolean } {
  const matches = (request: PendingRequest) => request.requestId === requestId && request.sender?.id === sender.id;
  const response: SevenappResponse = { success: true, done: true, cancelled: true, request_id: requestId };
  if (activeRequest && matches(activeRequest)) {
    const request = activeRequest;
    activeRequest = undefined;
    const child = backend;
    backend = undefined;
    child?.kill();
    request.resolve(response);
    dispatchNextRequest();
    return { success: true, cancelled: true };
  }
  const index = pendingRequests.findIndex(matches);
  if (index >= 0) {
    pendingRequests.splice(index, 1)[0].resolve(response);
    return { success: true, cancelled: true };
  }
  return { success: true, cancelled: false };
}

function stopBackend(): void {
  shuttingDown = true;
  const child = backend;
  backend = undefined;
  child?.kill();
  activeRequest?.reject(new Error('应用正在关闭'));
  activeRequest = undefined;
  while (pendingRequests.length) pendingRequests.shift()?.reject(new Error('应用正在关闭'));
}

/** 注册供渲染进程调用的 sevenapp 后端 IPC。 */
export function setupSevenappProcessIpc(): void {
  ipcMain.handle('sevenapp:request', (event, payload: unknown) => sendSevenappRequest(payload, event.sender));
  ipcMain.handle('sevenapp:cancel', (event, requestId: unknown) => {
    if (typeof requestId !== 'string' || !requestId) throw new Error('无效的聊天请求 ID');
    return cancelSevenappRequest(requestId, event.sender);
  });
  app.once('before-quit', stopBackend);

  // 应用启动时就拉起并确认后端；后续请求会复用同一个进程。
  void sendSevenappRequest({ action: 'ping' }).catch((error: Error) => {
    console.error(`[sevenapp] 后端启动失败: ${error.message}`);
  });
}
