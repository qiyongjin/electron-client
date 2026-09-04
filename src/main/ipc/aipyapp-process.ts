import { app, ipcMain, type WebContents } from 'electron';
import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

export interface AipyappResponse {
  success: boolean;
  message?: string;
  data?: unknown;
  error?: string;
  stream?: boolean;
  done?: boolean;
}

let backend: ChildProcessWithoutNullStreams | undefined;
const pendingRequests: Array<{
  resolve: (response: AipyappResponse) => void;
  reject: (error: Error) => void;
  sender?: WebContents;
}> = [];

function getBackendScriptPath(): string {
  // 开发时 main 入口位于 dist/main/main/ipc，不能依赖 app.getAppPath()
  // （它会指向 dist/main/main，而不是项目根目录）。
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const developmentPath = path.resolve(currentDirectory, '../../../../resources/aipyapp/stdio.py');
  const packagedPath = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'resources',
    'aipyapp',
    'stdio.py',
  );

  return app.isPackaged && existsSync(packagedPath) ? packagedPath : developmentPath;
}

function rejectPendingRequests(error: Error): void {
  while (pendingRequests.length > 0) pendingRequests.shift()?.reject(error);
}

function startBackend(): ChildProcessWithoutNullStreams {
  if (backend && !backend.killed) return backend;

  const scriptPath = getBackendScriptPath();
  if (!existsSync(scriptPath)) throw new Error(`找不到 aipyapp 后端文件: ${scriptPath}`);

  const pythonCommand = process.env.AIPYAPP_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
  const child = spawn(pythonCommand, ['-u', scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });
  backend = child;

  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    // 流式消息与最终响应属于同一个请求；只有 done=true 才出队。
    console.log(JSON.stringify(line, null, 2));
    const request = pendingRequests[0];
    if (!request) return;

    try {
      const response = JSON.parse(line) as AipyappResponse;
      if (request.sender && !request.sender.isDestroyed()) {
        request.sender.send('aipyapp:message', response);
      }
      if (response.done) {
        pendingRequests.shift();
        request.resolve(response);
      }
    } catch {
      pendingRequests.shift();
      request.reject(new Error(`aipyapp 返回了无效 JSON: ${line}`));
    }
  });

  child.stderr.on('data', (chunk: Buffer) => console.error(`[aipyapp] ${chunk.toString().trim()}`));
  child.on('error', (error) => {
    if (backend === child) backend = undefined;
    rejectPendingRequests(new Error(`无法启动 aipyapp 后端: ${error.message}`));
  });
  child.on('exit', (code, signal) => {
    if (backend === child) backend = undefined;
    rejectPendingRequests(new Error(`aipyapp 后端已退出 (code=${code}, signal=${signal})`));
  });

  return child;
}

export function sendAipyappRequest(payload: unknown, sender?: WebContents): Promise<AipyappResponse> {
  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = startBackend();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    pendingRequests.push({ resolve, reject, sender });
    child.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
      if (error) pendingRequests.pop()?.reject(error);
    });
  });
}

function stopBackend(): void {
  backend?.kill();
  backend = undefined;
}

/** 注册供渲染进程调用的 aipyapp 后端 IPC。 */
export function setupAipyappProcessIpc(): void {
  ipcMain.handle('aipyapp:request', (event, payload: unknown) => sendAipyappRequest(payload, event.sender));
  app.once('before-quit', stopBackend);

  // 应用启动时就拉起并确认后端；后续请求会复用同一个进程。
  void sendAipyappRequest({ action: 'ping' }).catch((error: Error) => {
    console.error(`[aipyapp] 后端启动失败: ${error.message}`);
  });
}
