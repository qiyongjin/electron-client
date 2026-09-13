import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

interface LogFileOptions {
  directory: string;
  retentionDays: number;
  maxFileBytes: number;
  cleanupIntervalMs: number;
  now?: () => Date;
  onError: (error: unknown) => void;
}

const LOG_NAME = /^seven-(\d{4}-\d{2}-\d{2})-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-\d{3,}\.log$/;
const LEGACY_LOG_NAME = /^seven\.log(?:\.\d+)?$/;

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Bunyan 的字符串写入流：同步落盘，按会话、自然日和字节数分片。 */
export class LogFileStream {
  private readonly session = randomUUID();
  private readonly now: () => Date;
  private day = '';
  private sequence = 0;
  private bytes = 0;
  private fd: number | undefined;
  private currentPath: string | undefined;
  private lastCleanup = 0;
  private midnightTimer: ReturnType<typeof setTimeout> | undefined;
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly options: LogFileOptions) {
    this.now = options.now ?? (() => new Date());
  }

  get filePath(): string | undefined {
    return this.currentPath;
  }

  start(): void {
    if (this.cleanupTimer) return;
    this.maintain();
    this.cleanupTimer = setInterval(() => this.maintain(), this.options.cleanupIntervalMs);
    this.cleanupTimer.unref();
    this.scheduleMidnight();
  }

  /** 休眠恢复时调用；同时重算午夜，适应休眠、时区和系统时间变化。 */
  maintain(): void {
    const now = this.now();
    this.changeDay(now);
    this.cleanup(now);
    if (this.cleanupTimer) this.scheduleMidnight();
  }

  write(chunk: unknown): void {
    try {
      const data = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk : String(chunk);
      const size = Buffer.byteLength(data);
      const now = this.now();
      const dayChanged = this.changeDay(now);
      if (dayChanged || now.getTime() - this.lastCleanup >= this.options.cleanupIntervalMs) {
        this.cleanup(now);
      }
      // 单条超大记录独占一个文件，下一条记录再切分，绝不拆开 JSON。
      if (this.fd !== undefined && this.bytes > 0 && this.bytes + size > this.options.maxFileBytes) {
        this.closeFile();
      }
      if (this.fd === undefined) this.openFile();
      fs.appendFileSync(this.fd!, data, 'utf8');
      this.bytes += size;
    } catch (error) {
      this.closeFile();
      this.options.onError(error);
    }
  }

  /** 在进程真正退出时停止定时器和关闭句柄；已写入内容无需异步刷新。 */
  stop(): void {
    clearTimeout(this.midnightTimer);
    clearInterval(this.cleanupTimer);
    this.midnightTimer = undefined;
    this.cleanupTimer = undefined;
    this.closeFile();
  }

  private changeDay(now: Date): boolean {
    const day = localDate(now);
    if (day === this.day) return false;
    this.closeFile();
    this.day = day;
    // 不重置序号，系统日期回拨后也不会复用旧文件名。
    return true;
  }

  private openFile(): void {
    fs.mkdirSync(this.options.directory, { recursive: true, mode: 0o700 });
    for (;;) {
      const filename = `seven-${this.day}-${this.session}-${String(++this.sequence).padStart(3, '0')}.log`;
      const filePath = path.join(this.options.directory, filename);
      try {
        // 排他创建，避免重启、并行实例或碰撞覆盖已有文件。
        this.fd = fs.openSync(filePath, 'ax', 0o600);
        this.currentPath = filePath;
        this.bytes = 0;
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
  }

  private closeFile(): void {
    const fd = this.fd;
    this.fd = undefined;
    this.currentPath = undefined;
    this.bytes = 0;
    if (fd === undefined) return;
    try {
      fs.closeSync(fd);
    } catch (error) {
      this.options.onError(error);
    }
  }

  private cleanup(now: Date): void {
    this.lastCleanup = now.getTime();
    const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    cutoff.setDate(cutoff.getDate() - (this.options.retentionDays - 1));
    const oldestDay = localDate(cutoff);
    let entries: fs.Dirent[];
    try {
      fs.mkdirSync(this.options.directory, { recursive: true, mode: 0o700 });
      entries = fs.readdirSync(this.options.directory, { withFileTypes: true });
    } catch (error) {
      this.options.onError(error);
      return;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const match = entry.name.match(LOG_NAME);
      if (!match && !LEGACY_LOG_NAME.test(entry.name)) continue;
      const filePath = path.join(this.options.directory, entry.name);
      if (filePath === this.currentPath) continue;
      try {
        // 再次 lstat，不跟随符号链接。
        const stat = fs.lstatSync(filePath);
        if (!stat.isFile()) continue;
        const day = match?.[1] ?? localDate(stat.mtime);
        if (day < oldestDay) fs.unlinkSync(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.options.onError(error);
      }
    }
  }

  private scheduleMidnight(): void {
    clearTimeout(this.midnightTimer);
    const now = this.now();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    this.midnightTimer = setTimeout(() => this.maintain(), Math.max(1, next.getTime() - now.getTime()));
    this.midnightTimer.unref();
  }
}
