import { inspect, stripVTControlCharacters } from 'node:util';

interface ConsoleLogRecord {
  time: Date | string;
  level: number;
  msg: string;
  [field: string]: unknown;
}

const LEVELS: Record<number, { label: string; color: string }> = {
  10: { label: 'TRACE', color: '\x1b[90m' },
  20: { label: 'DEBUG', color: '\x1b[36m' },
  30: { label: 'INFO', color: '\x1b[32m' },
  40: { label: 'WARN', color: '\x1b[33m' },
  50: { label: 'ERROR', color: '\x1b[31m' },
  60: { label: 'FATAL', color: '\x1b[1;31m' },
};
const STANDARD_FIELDS = new Set(['name', 'hostname', 'pid', 'time', 'level', 'levelName', 'msg', 'v']);

/** 仅压缩终端展示；Bunyan 的原始记录仍完整写入文件。 */
export function formatConsoleLog(record: ConsoleLogRecord, color: boolean, width = 120): string {
  const date = new Date(record.time);
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map(value => String(value).padStart(2, '0')).join(':')
    + '.' + String(date.getMilliseconds()).padStart(3, '0');
  const level = LEVELS[record.level] ?? { label: 'LOG', color: '' };
  const details = Object.entries(record)
    .filter(([key]) => !STANDARD_FIELDS.has(key))
    .map(([key, value]) => `${key}=${inspect(value, { colors: false, depth: 1, compact: true, breakLength: Infinity })}`)
    .join(' ');
  const message = stripVTControlCharacters(`${record.msg}${details ? ` ${details}` : ''}`)
    .replace(/[\r\n\t\u2028\u2029]+/g, ' ')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/ {2,}/g, ' ').trim();
  const prefix = `${time} ${level.label.padEnd(5)} `;
  // 给 concurrently 的 [1] 前缀留出空间，并考虑中文字符占两列。
  // const budget = Math.max(20, width - prefix.length - 8);
  let text = '';
  let columns = 0;
  for (const character of message) {
    const size = /[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6\u{1f300}-\u{1faff}]/u.test(character) ? 2 : 1;
    // 不做截断
    // if (columns + size > budget) {
    //   text += '…';
    //   break;
    // }
    text += character;
    columns += size;
  }
  if (!color) return prefix + text + '\n';
  return `\x1b[90m${time}\x1b[0m ${level.color}${level.label.padEnd(5)} ${text}\x1b[0m\n`;
}

export const developmentConsoleStream = {
  write(record: object): void {
    // npm/concurrently 使用管道转发时也支持颜色；可用 NO_COLOR 或 FORCE_COLOR=0 关闭。
    const color = process.env.NO_COLOR === undefined && process.env.FORCE_COLOR !== '0';
    process.stdout.write(formatConsoleLog(record as ConsoleLogRecord, color, process.stdout.columns || 120));
  },
};
