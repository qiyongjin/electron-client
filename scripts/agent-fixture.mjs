import { crc32 } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const demoManifest = {
  manifest_version: "0.3",
  name: "seven-echo-demo",
  display_name: "Echo 示例智能体",
  version: "1.0.0",
  description: "本地 MCP 测试工具：返回你输入的文字，不连接网络。",
  author: { name: "Seven" },
  server: {
    type: "node",
    entry_point: "server.cjs",
    mcp_config: {
      command: "node",
      args: ["${__dirname}/server.cjs"],
      env: { AGENT_TOKEN: "${user_config.token}" },
    },
  },
  user_config: {
    token: { type: "string", title: "测试密钥（可选）", sensitive: true },
  },
};
export const demoSource = `const readline=require('node:readline');
const input=readline.createInterface({input:process.stdin});
if(process.env.AGENT_TOKEN) console.error('token='+process.env.AGENT_TOKEN);
input.on('line',line=>{const request=JSON.parse(line);if(request.id===undefined)return;
let result;
switch(request.method){
case 'initialize':result={protocolVersion:request.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'seven-echo-demo',version:'1.0.0'}};break;
case 'tools/list':result={tools:[{name:'echo',description:'返回输入文字',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text']}}]};break;
case 'tools/call': if(request.params.name==='crash'){process.exit(12);return;}result={content:[{type:'text',text:String(request.params.arguments.text??'')}]};break;
case 'ping':result={};break;
default:process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'Unknown method'}})+'\\n');return;
}process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\\n');});
input.on('close',()=>process.exit(0));`;
// Stored ZIP writer for deterministic local fixtures; never used by the installer.
export function makeBundle(entries) {
  const locals = [],
    central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name),
      data = Buffer.from(entry.data);
    const crc = entry.crc ?? crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(0x314, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x800, 8);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(data.length, 20);
    record.writeUInt32LE(entry.uncompressedSize ?? data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0, 38);
    record.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    central.push(record, name);
    offset += local.length + name.length + data.length;
  }
  const size = central.reduce((sum, item) => sum + item.length, 0),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}
export function demoEntries(manifest = demoManifest) {
  return [
    { name: "manifest.json", data: JSON.stringify(manifest) },
    { name: "server.cjs", data: demoSource },
  ];
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = path.resolve("temp/agents/seven-echo-demo.mcpb");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, makeBundle(demoEntries()));
  console.log(output);
}
