import { handleWorkspaceRequest } from './workspace-api.mjs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
const root = resolve('/home/lofa/DEV/ohmlet/dist');
const port = 5180;
const types = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.bin':'application/octet-stream','.elf':'application/octet-stream','.glb':'model/gltf-binary','.webmanifest':'application/manifest+json'};
createServer(async (req,res)=>{
  try {
    const workspacePath = new URL(req.url,'http://localhost').pathname;
    if (/^\/api\/workspaces(?:\/|$)/.test(workspacePath)) {
      await handleWorkspaceRequest(req,res,workspacePath);
      return;
    }
    if (req.method!=='GET' && req.method!=='HEAD') {res.writeHead(405);return res.end();}
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if (/^\/(api|mcp)(\/|$)/.test(pathname) || pathname.includes('..') || pathname.includes('\\')) {res.writeHead(404);return res.end();}
    let p = resolve(root,'.'+pathname);
    if (p!==root && !p.startsWith(root+sep)) {res.writeHead(404);return res.end();}
    let info;try{info=await stat(p);}catch{}
    if (!info || info.isDirectory()) p=resolve(root,'index.html');
    const extension=extname(p);const data=await readFile(p);
    res.writeHead(200,{'Content-Type':types[extension]||'application/octet-stream','Content-Length':data.length,'X-Content-Type-Options':'nosniff','Cache-Control':extension==='.html'?'no-cache':'public, max-age=120'});
    if(req.method==='HEAD')return res.end();res.end(data);
  }catch(e){if(!res.headersSent){res.writeHead(500);res.end('Internal server error');} else if(!res.writableEnded)res.end();}
}).listen(port,'127.0.0.1',()=>console.log('Ohmlet public frontend on localhost:'+port));
