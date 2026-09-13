import fs from 'node:fs';
import os from 'node:os';
import { formatWithOptions } from 'node:util';
import bunyan from 'bunyan';
import { app, powerMonitor } from 'electron';
import { CONFIG_DIR, IS_PACKAGED, LOG_CLEANUP_INTERVAL_MS, LOG_DIR, LOG_MAX_FILE_BYTES, LOG_RETENTION_DAYS, NODE_ENV } from './common.js';
import { LogFileStream } from './logFileStream.js';
import { developmentConsoleStream } from './loggerConsole.js';

let initialized = false;

export const logger = bunyan.createLogger({
  name: app.getName(),
  serializers: bunyan.stdSerializers,  // 保留标准序列化器，避免与 Bunyan 内部序列化器冲突。
  streams: IS_PACKAGED
    ? [{ level: 'error', stream: process.stdout }]
    : [{ level: 'trace', type: 'raw', stream: developmentConsoleStream }],
});


function reportLoggingError(error: unknown): void {
  // 日志自身的错误直接写 stderr，避免通过 console 再次进入 logger。
  process.stderr.write(`Application log error: ${String(error)}\n`);
}

logger.on('error', reportLoggingError);


const fileStream = new LogFileStream({
  directory: LOG_DIR,
  retentionDays: LOG_RETENTION_DAYS,
  maxFileBytes: LOG_MAX_FILE_BYTES,
  cleanupIntervalMs: LOG_CLEANUP_INTERVAL_MS,
  onError: reportLoggingError,
});

/**
 * 主进程入口尽早调用；重复调用不会重复挂载日志流或事件。
 * @returns 无
 */
export function initLogger(): void {
  if (initialized) return;
  initialized = true;

  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  } catch (error) {
    reportLoggingError(error);
  }
  fileStream.start();
  logger.addStream({ type: 'stream', stream: fileStream, level: 'trace' });
  void app.whenReady().then(() => {
    powerMonitor.on('resume', () => fileStream.maintain());
  }).catch(reportLoggingError);
  // 不在可取消的 before-quit 阶段关闭，保留退出过程中的最后几条日志。
  process.once('exit', () => fileStream.stop());

  // 适配 console 的格式化规则；保留 time/table/assert 等原生方法和 this 绑定。
  const methods: Record<string, (...args: unknown[]) => void> = {};
  for (const [method, level] of Object.entries({
    log: 'info', info: 'info', warn: 'warn', error: 'error', debug: 'debug', trace: 'trace',
  } as const)) {
    methods[method] = (...args: unknown[]) => {
      const message = formatWithOptions({ colors: false }, ...args);
      const error = args.find((argument): argument is Error => argument instanceof Error);
      if (error) logger[level]({ err: error }, message);
      else logger[level](message);
    };
  }
  globalThis.console = new Proxy(globalThis.console, {
    get(target, property, receiver) {
      if (typeof property === 'string' && Object.prototype.hasOwnProperty.call(methods, property)) {
        return methods[property];
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  // 记录未处理的 Promise 拒绝
  process.on('unhandledRejection', (reason: unknown) => {
    if (reason instanceof Error) logger.error({ err: reason }, 'Unhandled promise rejection');
    else logger.error({ reason }, 'Unhandled promise rejection');
  });

  // 保留默认异常退出行为。崩溃日志同步落盘，避免退出时异步流尚未刷新。
  process.on('uncaughtExceptionMonitor', (error, origin) => {
    const record = JSON.stringify({
      name: app.getName(),  // 应用名称
      time: new Date().toISOString(),  // 时间戳
      hostname: os.hostname(), pid: process.pid, // 主机名和进程 ID
      level: bunyan.FATAL,  // 日志级别 ，致命错误
      v: 0, // 版本号
      msg: 'Uncaught exception',  // 日志消息
      origin,  // 异常来源
      error: bunyan.stdSerializers.err(error),  // 异常信息
    }) + '\n';
    process.stderr.write(record);
    fileStream.write(record);
  });

  logger.info({ logDirectory: LOG_DIR, version: app.getVersion(), environment: NODE_ENV }, 'Application logger initialized');
}
