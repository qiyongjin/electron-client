import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const loggerURL = new URL('../dist/main/main/logger.js', import.meta.url).href;

function run(t, crash = false, blocked = false) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'seven-logger-integration-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  if (blocked) fs.writeFileSync(path.join(home, '.seven'), 'not a directory');
  const mock = `import {EventEmitter} from 'node:events';
    export const powerMonitor=new EventEmitter();
    export const app={isPackaged:false,getPath:()=>${JSON.stringify(home)},getName:()=>"test-seven",getVersion:()=>"1.0",whenReady:()=>Promise.resolve()};`;
  const code = `import {registerHooks} from 'node:module';
    registerHooks({resolve(s,c,next){return s==='electron'?{url:${JSON.stringify('data:text/javascript,' + encodeURIComponent(mock))},shortCircuit:true}:next(s,c)}});
    const {initLogger,logger}=await import(${JSON.stringify(loggerURL)});
    const {powerMonitor}=await import('electron');
    initLogger();initLogger();await Promise.resolve();
    if(powerMonitor.listenerCount('resume')!==1) throw new Error('resume handler missing or duplicated');
    powerMonitor.emit('resume');
    logger.trace('trace-test');console.debug('debug-test');console.info('hello\\nworld');console.warn('warning-test');
    console.error('error-test',new Error('stack-test'));logger.info('long-'+ 'x'.repeat(1000));
    Promise.reject(new Error('rejection-test'));
    await new Promise(resolve=>setImmediate(resolve));
    ${crash ? "setImmediate(()=>{throw new Error('fatal-test')});" : "logger.info('final-message');process.exit(0);"}`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    encoding: 'utf8', timeout: 5000, env: { ...process.env, NO_COLOR: '', FORCE_COLOR: '1' },
  });
  assert.ifError(result.error);
  const directory = path.join(home, '.seven/logs');
  return { result, directory };
}

test('real Bunyan preserves complete JSON, all levels, errors and final exit message', t => {
  const { result, directory } = run(t);
  assert.equal(result.status, 0, result.stderr);
  const files = fs.readdirSync(directory); assert.equal(files.length, 1);
  const raw = fs.readFileSync(path.join(directory, files[0]), 'utf8');
  const records = raw.trim().split('\n').map(JSON.parse);
  assert.equal(records.filter(r => r.msg === 'Application logger initialized').length, 1);
  assert(records.some(r => r.level === 10)); assert(records.some(r => r.level === 20));
  assert(records.some(r => r.msg === 'hello\nworld'));
  assert(records.some(r => r.msg.length > 1000));
  assert(records.some(r => r.err?.stack.includes('stack-test')));
  assert(records.some(r => r.err?.message === 'rejection-test'));
  assert.equal(records.at(-1).msg, 'final-message');
  assert(!raw.includes('\x1b'));
  const terminalLines = result.stdout.split('\n').filter(line => /^\d{2}:/.test(line));
  assert(terminalLines.some(line => line.includes('hello world')));
  assert(terminalLines.some(line => line.includes('…')));
});

test('uncaught exception is synchronously written into the same session file', t => {
  const { result, directory } = run(t, true);
  assert.notEqual(result.status, 0);
  const files = fs.readdirSync(directory); assert.equal(files.length, 1);
  const records = fs.readFileSync(path.join(directory, files[0]), 'utf8').trim().split('\n').map(JSON.parse);
  assert(records.some(r => r.msg === 'hello\nworld'));
  assert.equal(records.at(-1).level, 60);
  assert.equal(records.at(-1).error.message, 'fatal-test');
});

test('unwritable log directory retains terminal logging without crashing', t => {
  const { result } = run(t, false, true);
  assert.equal(result.status, 0);
  assert(result.stdout.includes('warning-test'));
  assert(result.stderr.includes('Application log error:'));
});

test('console formatting retains level colors and newline/truncation rules', async () => {
  const { formatConsoleLog } = await import('../dist/main/main/loggerConsole.js');
  for (const [level, label, color] of [[10,'TRACE','90'],[20,'DEBUG','36'],[30,'INFO','32'],[40,'WARN','33'],[50,'ERROR','31'],[60,'FATAL','1;31']]) {
    const record = { level, time: new Date(), msg: 'first\nsecond\rthird\t你好' };
    const output = formatConsoleLog(record, true, 120);
    assert.equal(output.split('\n').length, 2);
    assert(output.includes(label)); assert(output.includes(`\x1b[${color}m`));
    assert(!formatConsoleLog(record, false).includes('\x1b'));
  }
});
