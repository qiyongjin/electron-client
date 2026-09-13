import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import ts from 'typescript';

function preload() {
  const apis = {}; const calls = []; const events = new EventEmitter();
  const result = { success: true };
  const electron = {
    contextBridge: { exposeInMainWorld: (name, api) => { assert(!apis[name]); apis[name] = api; } },
    ipcRenderer: { invoke: (...args) => { calls.push(args); return Promise.resolve(result); },
      on: events.on.bind(events), removeListener: events.removeListener.bind(events) },
  };
  vm.runInNewContext(fs.readFileSync(new URL('../dist/preload/preload/preload.js', import.meta.url), 'utf8'), {
    exports: {}, console: { log() {} }, require: name => { assert.equal(name, 'electron'); return electron; },
  });
  assert.deepEqual(Object.keys(apis), ['electronAPI']);
  return { apis: apis.electronAPI, globals: apis, calls, events, result };
}

test('one electronAPI namespace exposes only fixed business channels and forward arguments and Promise results', async () => {
  const { apis, calls, result } = preload();
  assert.deepEqual(Object.keys(apis).sort(), ['app','clipboard','dialog','display','file','sevenapp','theme','upload','agent','windowControls'].sort());
  assert(!apis.electronAPI); assert(!apis.screen); assert(!apis.window);
  const cases = [
    ['agent','install','agent:install',[]], ['agent','list','agent:list',[]],
    ['agent','start','agent:start',['id']], ['agent','stop','agent:stop',['id']], ['agent','uninstall','agent:uninstall',['id']],
    ['agent','getConfig','agent:get-config',['id']], ['agent','saveConfig','agent:save-config',['id',{}]],
    ['agent','listTools','agent:tools',['id']], ['agent','callTool','agent:call-tool',['id','echo',{text:'hello'}]], ['agent','logs','agent:logs',['id']],
    ['upload','chooseFile','upload:choose-file',[]], ['upload','list','upload:list',[]],
    ['upload','start','upload:start',[{filePath:'test.bin',endpoint:'http://127.0.0.1:17891',chunkSize:1024,concurrency:2}]],
    ['upload','pause','upload:pause',['id']], ['upload','resume','upload:resume',['id']], ['upload','cancel','upload:cancel',['id']],
    ['upload','startLocalServer','upload:start-local-server',[{failFirstAttempt:true,delayMs:100}]],
    ['file','readFile','file:read',['a.txt']], ['file','writeFile','file:write',['a.txt','内容']],
    ['file','openDialog','file:open-dialog',[{properties:['openFile']}]], ['file','saveDialog','file:save-dialog',[{title:'保存'}]],
    ['file','getFileStat','file:stat',['a.txt']], ['file','showInFolder','file:show-in-folder',['a.txt']], ['file','openExternal','file:open-external',['a.txt']],
    ['app','getVersion','app:getVersion',[]], ['app','getName','app:getName',[]], ['app','getPath','app:getPath',['userData']],
    ['app','quit','app:quit',[]], ['app','relaunch','app:relaunch',[]],
    ['windowControls','minimize','window:minimize',[]], ['windowControls','maximize','window:maximize',[]], ['windowControls','close','window:close',[]],
    ['windowControls','isMaximized','window:isMaximized',[]], ['windowControls','setAlwaysOnTop','window:setAlwaysOnTop',[true]],
    ['windowControls','setSize','window:setSize',[800,600]], ['windowControls','setPosition','window:setPosition',[10,20]], ['windowControls','center','window:center',[]],
    ['display','getPrimaryDisplay','screen:getPrimaryDisplay',[]], ['display','getAllDisplays','screen:getAllDisplays',[]],
    ['clipboard','readText','clipboard:readText',[]], ['clipboard','writeText','clipboard:writeText',['text']],
    ['theme','shouldUseDarkColors','theme:shouldUseDarkColors',[]], ['theme','setThemeSource','theme:setThemeSource',['dark']],
    ['dialog','showMessageBox','dialog:showMessageBox',[{message:'hello'}]], ['dialog','showErrorBox','dialog:showErrorBox',['title','content']],
    ['sevenapp','request','sevenapp:request',[{action:'ping'}]], ['sevenapp','cancel','sevenapp:cancel',['id']],
  ];
  for (const [group, method, channel, args] of cases) {
    assert.equal(await apis[group][method](...args), result);
    assert.deepEqual(calls.at(-1), [channel,...args]);
  }
  assert.equal(cases.length + 3, Object.values(apis).reduce((sum, api) => sum + Object.keys(api).length, 0));
});

test('subscriptions hide IPC events and unsubscribe only their own listener', () => {
  const { apis, events } = preload(); const first = []; const second = [];
  const unsubscribe = apis.sevenapp.onMessage((...args) => first.push(args));
  const unsubscribeOther = apis.sevenapp.onMessage((...args) => second.push(args));
  const payload = { success:true, stream:true, message:'hello' };
  events.emit('sevenapp:message', { sender:'must not leak' }, payload);
  assert.deepEqual(first, [[payload]]);
  unsubscribe(); unsubscribe();
  events.emit('sevenapp:message', {}, payload);
  assert.equal(first.length,1); assert.equal(second.length,2);
  unsubscribeOther(); assert.equal(events.listenerCount('sevenapp:message'),0);
});

async function transport() {
  const source = fs.readFileSync(new URL('../src/renderer/pages/ChatPage/services/chatTransport.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}});
  return import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
}

test('chat bridge detects browser preview and routes streamed responses via the new API', async t => {
  const oldWindow = globalThis.window; t.after(() => { globalThis.window = oldWindow; });
  const { getChatBridge, streamChat } = await transport();
  globalThis.window = {}; assert.equal(getChatBridge(),undefined);
  const { apis, events } = preload(); globalThis.window = { electronAPI: apis }; assert.equal(getChatBridge(),apis.sevenapp);
  const messages = []; let subscribed = false; let unsubscribed = false;
  const bridge = {
    request: async payload => {
      assert(subscribed); assert.equal(payload.request_id,'request-1');
      events.emit('chunk',{success:true,request_id:'other',message:'ignore'});
      events.emit('chunk',{success:true,request_id:'request-1',stream:true,message:'chunk'});
      return {success:true,message:'complete'};
    },
    cancel: async () => ({success:true,cancelled:true}),
    onMessage: callback => { subscribed=true; events.on('chunk',callback); return () => { unsubscribed=true; events.removeListener('chunk',callback); }; },
  };
  await streamChat(bridge,'request-1',[],new AbortController().signal,event=>messages.push(event));
  assert.deepEqual(messages.map(m=>m.message),['chunk','complete']); assert.equal(messages.at(-1).done,true); assert(unsubscribed);
});

test('chat abort invokes business cancel API and releases the subscription', async () => {
  const {streamChat}=await transport();const controller=new AbortController();let cancelled;let listeners=0;
  const bridge={request:()=>new Promise(()=>{}),cancel:async id=>{cancelled=id;return {success:true,cancelled:true};},
    onMessage:()=>{listeners++;let active=true;return ()=>{if(active){listeners--;active=false;}};}};
  const running=streamChat(bridge,'cancel-me',[],controller.signal,()=>assert.fail('unexpected message'));
  controller.abort();await running;assert.equal(cancelled,'cancel-me');assert.equal(listeners,0);
});

test('upload subscriptions only deliver metadata and detach on page unmount', () => {
  const { apis, events } = preload(); const calls = [];
  const stop = apis.upload.onTasks((...args) => calls.push(args));
  const tasks = [{id:'one',uploadedBytes:1024}];
  events.emit('upload:tasks', {sender:'private'}, tasks);
  assert.deepEqual(calls, [[tasks]]); stop();
  assert.equal(events.listenerCount('upload:tasks'), 0);
});

test('agent subscriptions hide Electron events and release only their listener', () => {
  const {apis,events} = preload(); const values=[];
  const off=apis.agent.onChanged((...args)=>values.push(args));
  const payload=[{id:'agent',state:'running'}];
  events.emit('agent:changed',{sender:'private'},payload);
  assert.deepEqual(values,[[payload]]); off(); off();
  assert.equal(events.listenerCount('agent:changed'),0);
});
