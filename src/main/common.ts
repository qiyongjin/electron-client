import { app } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 仅供主进程使用；渲染进程和构建配置不能直接依赖 Electron app。
export const IS_MAC = process.platform === 'darwin';
export const IS_WINDOWS = process.platform === 'win32';
export const IS_PACKAGED = app.isPackaged;
export const IS_DEV = !IS_PACKAGED;
export const NODE_ENV = process.env.NODE_ENV || (IS_DEV ? 'development' : 'production');
console.log('NODE_ENV:---', NODE_ENV);

/** 传入调用文件的 import.meta.url，获取该文件自己的路径。 */
export function getModulePaths(moduleUrl: string) {
  const filename = fileURLToPath(moduleUrl);
  return { filename, dirname: path.dirname(filename) };
}

// tsc 输出的 common.js 位于 dist/main/main/common.js，与 main.js 同级。
export const MAIN_DIR = getModulePaths(import.meta.url).dirname; // dist/main/main
export const APP_ROOT_DIR = path.resolve(MAIN_DIR, '../../..'); // dist/main
export const DIST_DIR = path.join(APP_ROOT_DIR, 'dist'); // dist/main/dist
export const PRELOAD_PATH = path.join(DIST_DIR, 'preload/preload/preload.js');
export const RENDERER_HTML_PATH = path.join(DIST_DIR, 'renderer/index.html');
export const APP_ICON_PATH = path.join(APP_ROOT_DIR, 'build/icon.png');
export const DEV_SERVER_URL = 'http://localhost:3000';

// 开发环境资源目录
// dist/main/resources 
export const DEVELOPMENT_RESOURCES_DIR = path.join(APP_ROOT_DIR, 'resources');
// 打包环境资源目录
export const RESOURCES_DIR = IS_PACKAGED
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'resources')
  : DEVELOPMENT_RESOURCES_DIR;

/** 保留原有的打包资源优先、开发资源兜底逻辑。 */
export function getBackendScriptPath(): string { // 获取后端脚本路径
  const scriptPath = path.join(RESOURCES_DIR, 'sevenapp/stdio.py');
  if (IS_DEV || existsSync(scriptPath)) return scriptPath;
  return path.join(DEVELOPMENT_RESOURCES_DIR, 'sevenapp/stdio.py');
}

export function getPythonCommand(): string { // 获取 Python 命令
  return process.env.SEVENAPP_PYTHON ?? (IS_WINDOWS ? 'python' : 'python3');
}

export type AppPathName = Parameters<typeof app.getPath>[0];

export function getAppPath(name: AppPathName): string { // 获取应用路径
  return app.getPath(name);
}

// 使用 Electron 获取系统路径，避免硬编码 Windows/macOS/Linux 的用户名和目录。
export const HOME_DIR = getAppPath('home');
export const USER_DATA_DIR = getAppPath('userData');
export const SEVEN_DIR = path.join(HOME_DIR, '.seven');
export const CONFIG_DIR = path.join(SEVEN_DIR, 'config');
export const LOG_DIR = path.join(SEVEN_DIR, 'logs');
export const LOG_RETENTION_DAYS = 7; // 保留今天和前 6 个自然日
export const LOG_MAX_FILE_BYTES = 20 * 1024 * 1024; // 单文件 20 MiB，超大单条记录除外
export const LOG_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 每小时检查过期日志

export const UPLOAD_TASK_DIR = path.join(SEVEN_DIR, 'uploads');
export const UPLOAD_RECEIVER_DIR = path.join(UPLOAD_TASK_DIR, 'receiver');
export const UPLOAD_WORKER_DIR = IS_PACKAGED
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'dist/main/main/upload')
  : path.join(MAIN_DIR, 'upload');
export const UPLOAD_WORKER_PATH = path.join(UPLOAD_WORKER_DIR, 'upload.worker.js');
export const UPLOAD_SERVER_WORKER_PATH = path.join(UPLOAD_WORKER_DIR, 'server.worker.js');

export const AGENTS_DIR = path.join(USER_DATA_DIR, 'seven_app', 'agents');
export const AGENT_UTILITY_DIR = IS_PACKAGED
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'dist/main/main/utility')
  : path.join(MAIN_DIR, 'utility');
export const AGENT_INSTALLER_PATH = path.join(AGENT_UTILITY_DIR, 'installer/installer.js');
export const AGENT_RUNTIME_PATH = path.join(AGENT_UTILITY_DIR, 'runtime/agent-runtime.js');
