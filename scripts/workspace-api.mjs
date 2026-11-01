/** Narrow, capability-keyed public project API. NEVER proxies MCP/firmware endpoints. */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { validateLayout } from './workspace-validator.mjs';

const dataDir = join(homedir(), '.local/share/ohmlet-public');
const storePath = join(dataDir, 'projects.json');
const mcpPath = join(homedir(), '.local/share/ohmlet-mcp/workspaces.json');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const allowedOrigins = new Set(['https://byd.whatsynaptic.com','http://localhost:5173','http://127.0.0.1:5173','http://100.73.225.127:5173','http://192.168.1.110:5173','http://192.168.1.153:5173']);
const requests = new Map();
let writeQueue = Promise.resolve();
const MAX_PROJECTS = 100;
const MAX_BYTES = 500000;

const hash = (value) => createHash('sha256').update(value).digest();
function owned(item, key) {
  if (typeof key !== 'string' || !/^[0-9a-f]{64}$/.test(key) || !item?.keyHash) return false;
  return timingSafeEqual(hash(key), Buffer.from(item.keyHash, 'hex'));
}
function loadProjects() {
  try { const p = JSON.parse(readFileSync(storePath,'utf8')); return Array.isArray(p) ? p : []; }
  catch(e) { if(e.code === 'ENOENT')return []; throw e; }
}
function loadMcp() {
  try { return JSON.parse(readFileSync(mcpPath,'utf8')).filter(x=>!x.id.startsWith('browser-') && x.layout && /^[a-zA-Z0-9_-]{1,80}$/.test(x.id)); }
  catch { return []; }
}
function persist(projects) {
  const tmp=storePath+'.tmp';
  writeFileSync(tmp,JSON.stringify(projects),{mode:0o600});renameSync(tmp,storePath);
}
function json(res,status,body) {
  const data=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':data.length});res.end(data);
}
function brief(item,source) {return {id:item.id,name:item.name || item.layout?.name || item.id,description:item.layout?.description||'',source,revision:item.revision||0,components:item.layout?.components?.length||0,wires:item.layout?.wires?.length||0,updatedAt:item.updatedAt || item.updated_at || null};}
function getRecord(id) {
  const p=loadProjects().find(x=>x.id===id);if(p)return {record:p,source:'saved'};
  const m=loadMcp().find(x=>x.id===id);if(m)return {record:m,source:'mcp'};
  return null;
}
function validatedLayout(layout) {
  const v=validateLayout(layout);
  if (!v.ok || !v.layout) throw Object.assign(new Error(v.errors.slice(0,4).join('; ')||'Invalid circuit'),{status:422});
  return v.layout;
}
function validName(name) {
  if(typeof name!=='string' || !name.trim() || name.length>90)throw Object.assign(new Error('Name must contain 1–90 characters'),{status:400});
  return name.trim();
}
async function bodyOf(req) {
  if(Number(req.headers['content-length'])>MAX_BYTES)throw Object.assign(new Error('Request too large'),{status:413});
  const chunks=[];let size=0;
  for await (const chunk of req) {size+=chunk.length;if(size>MAX_BYTES)throw Object.assign(new Error('Request too large'),{status:413});chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw Object.assign(new Error('Malformed JSON'),{status:400});}
}
function throttle(req) {
  const ip=String(req.headers['cf-connecting-ip']||req.socket.remoteAddress||'local').slice(0,128);
  const now=Date.now();
  if(requests.size>1000)for(const [k,v] of requests)if(now-v.start>60000)requests.delete(k);
  const slot=requests.get(ip);
  if(!slot || now-slot.start>60000){requests.set(ip,{start:now,count:1});return;}
  if(++slot.count>60)throw Object.assign(new Error('Too many changes; retry in a minute'),{status:429});
}
function mutate(operation){const job=writeQueue.then(operation);writeQueue=job.catch(()=>{});return job;}
export async function handleWorkspaceRequest(req,res,path) {
  if(!/^\/api\/workspaces(?:\/|$)/.test(path))return false;
  try {
    const id=path.startsWith('/api/workspaces/') ? path.slice('/api/workspaces/'.length) : null;
    if(id && !/^[a-zA-Z0-9_-]{1,80}$/.test(id))throw Object.assign(new Error('Invalid workspace ID'),{status:400});
    if(req.method==='GET') {
      if(!id){
        const items=[...loadMcp().map(x=>brief(x,'mcp')),...loadProjects().map(x=>brief(x,'saved'))];
        return json(res,200,{workspaces:items});
      }
      const found=getRecord(id);if(!found)return json(res,404,{error:'Workspace not found'});
      return json(res,200,{...brief(found.record,found.source),layout:found.record.layout});
    }
    if(!['POST','PUT','PATCH','DELETE'].includes(req.method))return json(res,405,{error:'Method not allowed'});
    if(req.headers.origin && !allowedOrigins.has(req.headers.origin))return json(res,403,{error:'Origin not allowed'});
    if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))return json(res,415,{error:'JSON content type required'});
    throttle(req);
    const data=await bodyOf(req);
    const response=await mutate(async()=>{
      const projects=loadProjects();
      if(req.method==='POST' && !id) {
        if(projects.length>=MAX_PROJECTS)throw Object.assign(new Error('Project limit reached'),{status:409});
        const layout=validatedLayout(data.layout);
        const name=validName(data.name);
        const editKey=randomBytes(32).toString('hex');
        const item={id:'project_'+randomBytes(10).toString('hex'),name,layout,revision:0,updatedAt:new Date().toISOString(),keyHash:hash(editKey).toString('hex')};
        projects.push(item);persist(projects);
        return {status:201,result:{...brief(item,'saved'),layout:item.layout,editKey}};
      }
      const item=projects.find(x=>x.id===id);
      if(!item)return {status:404,result:{error:'Project is read-only or not found; use Save copy'}};
      if(!owned(item,data.editKey))return {status:403,result:{error:'This browser does not have the edit key for that project; use Save copy'}};
      if(!Number.isSafeInteger(data.expectedRevision)||data.expectedRevision!==item.revision)return {status:409,result:{error:'Project changed elsewhere; reload or Save copy to avoid overwriting',revision:item.revision}};
      if(req.method==='DELETE'){
        projects.splice(projects.indexOf(item),1);persist(projects);return {status:200,result:{deleted:true,id}};
      }
      if(req.method==='PUT')item.layout=validatedLayout(data.layout);
      if(req.method==='PATCH')item.name=validName(data.name);
      if(!['PUT','PATCH'].includes(req.method))return {status:405,result:{error:'Method not allowed'}};
      item.revision++;item.updatedAt=new Date().toISOString();persist(projects);
      return {status:200,result:{...brief(item,'saved'),layout:item.layout}};
    });
    return json(res,response.status,response.result);
  }catch(e){return json(res,e.status||500,{error:e.status?e.message:'Workspace operation failed'});}
}
