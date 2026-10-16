import {createServer} from 'node:http';
import {readFile,stat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from './build.mjs';
import {spawn} from 'node:child_process';

const root=fileURLToPath(new URL('../dist/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
export const securityHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Content-Security-Policy':"default-src 'self'; style-src 'self'; img-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"};
export function createHandler(directory=root,{basePath='/',headers=securityHeaders}={}){
  if(!/^\/(?:coin\/)?$/.test(basePath))throw Error('无效预览子路径');
  const rootReal=realpath(directory);
  return async(req,res)=>{
    const failure=(status,text)=>{res.writeHead(status,{...headers,'Content-Type':'text/html; charset=utf-8'});res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>页面无法打开</title><h1>${text}</h1><p>请检查地址，或返回游戏重试。</p><a href="${basePath}">返回游戏页面</a></html>`);};
    try{
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{...headers,Allow:'GET, HEAD'});res.end();return;}
      const url=new URL(req.url,'http://127.0.0.1');
      if(basePath!=='/'&&(url.pathname===basePath.slice(0,-1)||url.pathname===basePath+'index.html')){res.writeHead(308,{...headers,Location:basePath+url.search});res.end();return;}
      if(!url.pathname.startsWith(basePath)){failure(404,'页面未找到');return;}
      const relative=decodeURIComponent(url.pathname.slice(basePath.length))||'index.html';
      let target=path.resolve(directory,relative);const safe=path.relative(directory,target);
      if(safe.startsWith('..')||path.isAbsolute(safe)){failure(403,'资源地址无效');return;}
      if((await stat(target)).isDirectory()){
        if(!url.pathname.endsWith('/')){res.writeHead(308,{...headers,Location:url.pathname+'/'+url.search});res.end();return;}
        target=path.join(target,'index.html');
      }
      const actual=await realpath(target),base=await rootReal;
      if(actual!==base&&!actual.startsWith(base+path.sep)){failure(403,'资源地址无效');return;}
      const bytes=await readFile(actual);res.writeHead(200,{...headers,'Content-Type':mime[path.extname(target)]??'application/octet-stream'});res.end(req.method==='HEAD'?undefined:bytes);
    }catch(error){failure(error instanceof URIError?400:404,error instanceof URIError?'资源地址无效':'资源未找到');}
  };
}
export function createStaticServer(directory=root,options){return createServer(createHandler(directory,options));}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{await stat(path.join(root,'index.html'));}catch{await build();}
  const port=Number(process.env.COIN_PORT??5178);
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('COIN_PORT无效');
  const basePath=process.argv.includes('--coin-path')?'/coin/':'/';
  createStaticServer(root,{basePath}).listen(port,'127.0.0.1',()=>{
    const url=`http://127.0.0.1:${port}${basePath}`;console.log(`KPL Coin 已启动：${url}\n只提供本地静态文件。按 Ctrl+C 关闭。`);
    if(process.argv.includes('--open')){
      const cmd=process.platform==='win32'?['cmd',['/c','start','',url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];
      spawn(cmd[0],cmd[1],{windowsHide:true,stdio:'ignore'}).on('error',()=>console.log('请手动打开上述本地地址。'));
    }
  });
}
