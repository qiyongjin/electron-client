import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { LogFileStream } from '../dist/main/main/logFileStream.js';

function fixture(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seven-log-test-'));
  let clock = new Date(2026, 8, 12, 12);
  const errors = [];
  const options = { directory, retentionDays: 7, maxFileBytes: 100, cleanupIntervalMs: 3600000,
    now: () => clock, onError: error => errors.push(error), ...overrides };
  const streams = [];
  const create = () => { const stream = new LogFileStream(options); streams.push(stream); return stream; };
  t.after(() => { streams.forEach(s => s.stop()); fs.rmSync(directory, { recursive: true, force: true }); });
  const archive = (day, name = `seven-${day}-${randomUUID()}-001.log`) => {
    const file = path.join(directory, name);
    fs.writeFileSync(file, '{}\n');
    return file;
  };
  return { directory, errors, create, archive, setDate: date => { clock = date; } };
}
const line = msg => JSON.stringify({ msg }) + '\n';
const read = file => fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);

test('same-day sessions stay separate; start is idempotent and stop preserves data', t => {
  const f = fixture(t);
  const first = f.create(); first.start(); first.start(); first.write(line('one'));
  const a = first.filePath; first.stop();
  const second = f.create(); second.start(); second.write(line('two'));
  assert.notEqual(a, second.filePath);
  assert.deepEqual(read(a), [{ msg: 'one' }]);
  assert.deepEqual(read(second.filePath), [{ msg: 'two' }]);
  assert.equal(f.errors.length, 0);
});

test('byte-size limit, UTF-8, exact boundary and indivisible oversized record', t => {
  const data = line('中文');
  const size = Buffer.byteLength(data);
  const f = fixture(t, { maxFileBytes: size * 2 });
  const s = f.create(); s.start(); s.write(data); s.write(data);
  const first = s.filePath;
  assert.equal(fs.statSync(first).size, size * 2);
  s.write(data); const second = s.filePath; assert.notEqual(first, second);
  s.write(line('x'.repeat(200))); const big = s.filePath;
  assert.notEqual(big, second); assert.equal(read(big)[0].msg.length, 200);
  s.write(data); assert.notEqual(s.filePath, big);
  for (const file of fs.readdirSync(f.directory)) read(path.join(f.directory, file));
});

test('date changes split without timer delivery, including month/year and clock rollback', t => {
  const f = fixture(t); const s = f.create();
  const dates = [new Date(2026, 0, 31, 23, 59), new Date(2026, 1, 1), new Date(2026, 11, 31), new Date(2027, 0, 1), new Date(2026, 11, 31)];
  const paths = [];
  for (const date of dates) { f.setDate(date); s.write(line('date')); paths.push(s.filePath); }
  assert.equal(new Set(paths).size, dates.length);
  assert(paths[1].includes('2026-02-01')); assert(paths[3].includes('2027-01-01'));
});

test('seven local calendar days retained; legacy mtime and unrelated files protected', t => {
  const f = fixture(t);
  const expired = f.archive('2026-09-05');
  const retained = f.archive('2026-09-06');
  const today = f.archive('2026-09-12');
  const oldLegacy = f.archive('', 'seven.log.0');
  const newLegacy = f.archive('', 'seven.log');
  fs.utimesSync(oldLegacy, new Date(2026, 8, 5), new Date(2026, 8, 5, 23, 59));
  fs.utimesSync(newLegacy, new Date(2026, 8, 6), new Date(2026, 8, 6));
  const unrelated = f.archive('', 'notes.log');
  const target = f.archive('', 'external.txt');
  const symlink = path.join(f.directory, `seven-2020-01-01-${randomUUID()}-001.log`);
  fs.symlinkSync(target, symlink);
  const directory = path.join(f.directory, 'seven.log.9'); fs.mkdirSync(directory);
  const s = f.create(); s.start();
  assert(!fs.existsSync(expired)); assert(!fs.existsSync(oldLegacy));
  for (const file of [retained, today, newLegacy, unrelated, target, symlink, directory]) assert(fs.existsSync(file), file);
  assert(fs.lstatSync(symlink).isSymbolicLink());
});

test('maintenance on resume closes stale file, cleans old dates, creates next file lazily', t => {
  const f = fixture(t); const s = f.create(); s.start(); s.write(line('before sleep'));
  const old = s.filePath;
  f.setDate(new Date(2026, 8, 20)); s.maintain();
  assert.equal(s.filePath, undefined); assert(!fs.existsSync(old));
  assert.equal(fs.readdirSync(f.directory).length, 0);
  s.write(line('after sleep')); assert(s.filePath.includes('2026-09-20'));
});

test('hourly scheduler performs idle cleanup and stop cancels timers', async t => {
  const f = fixture(t, { cleanupIntervalMs: 15 }); const s = f.create(); s.start();
  const expired = f.archive('2020-01-01');
  await new Promise(resolve => setTimeout(resolve, 60)); assert(!fs.existsSync(expired));
  s.stop(); const afterStop = f.archive('2020-01-01');
  await new Promise(resolve => setTimeout(resolve, 40)); assert(fs.existsSync(afterStop));
});

test('midnight scheduler closes the previous day even without a new record', async t => {
  const f = fixture(t); f.setDate(new Date(2026, 8, 12, 23, 59, 59, 980));
  const s = f.create(); s.start(); s.write(line('before midnight')); const first = s.filePath;
  f.setDate(new Date(2026, 8, 13));
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(s.filePath, undefined); assert(fs.existsSync(first));
  s.write(line('after midnight')); assert(s.filePath.includes('2026-09-13'));
});

test('calendar retention remains correct across daylight-saving changes', t => {
  const previous = process.env.TZ; process.env.TZ = 'America/New_York';
  t.after(() => { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; });
  const f = fixture(t); f.setDate(new Date(2026, 2, 10));
  const keep = f.archive('2026-03-04'); const drop = f.archive('2026-03-03');
  f.create().start(); assert(fs.existsSync(keep)); assert(!fs.existsSync(drop));
});

test('deletion failure does not prevent cleanup of other files', t => {
  const f = fixture(t); const denied = f.archive('2020-01-01'); const removable = f.archive('2020-01-02');
  const unlink = fs.unlinkSync;
  t.mock.method(fs, 'unlinkSync', file => { if (file === denied) throw Object.assign(new Error('denied'), { code: 'EACCES' }); return unlink(file); });
  f.create().start(); assert(fs.existsSync(denied)); assert(!fs.existsSync(removable)); assert.equal(f.errors.length, 1);
});

test('creation and append failures are reported without throwing; later writes recover', t => {
  const f = fixture(t); const s = f.create();
  const mkdir = t.mock.method(fs, 'mkdirSync', () => { throw new Error('mkdir denied'); });
  assert.doesNotThrow(() => { s.start(); s.write(line('blocked')); }); assert(f.errors.length > 0); mkdir.mock.restore();
  s.write(line('recovered')); assert.equal(read(s.filePath)[0].msg, 'recovered');
  const append = t.mock.method(fs, 'appendFileSync', () => { throw new Error('disk full'); });
  assert.doesNotThrow(() => s.write(line('failed'))); append.mock.restore();
  s.write(line('next')); assert.equal(read(s.filePath)[0].msg, 'next');
});
