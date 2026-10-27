import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {build} from '../scripts/build.mjs';
import {createHandler} from '../scripts/serve.mjs';
import {ANALYTICS_ENABLED,COIN_EVENTS,trackCoin} from '../src/analytics.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const hash=b=>createHash('sha256').update(b).digest('hex');
let built;

test('all D frozen core, ledger and UI resources remain byte identical',async()=>{
  const lock=JSON.parse(await readFile(new URL('fixtures/core-d-lock.json',import.meta.url)));
  for(const [name,digest]of Object.entries(lock))assert.equal(hash(await readFile(path.join(root,name))),digest,name);
});
test('two builds are byte identical, release ID binds input, emitted ledger bytes stay frozen',async()=>{
  built=await build();const again=await build();assert.deepEqual(again,built);
  for(const [name,record]of Object.entries(built.files))assert.equal(hash(await readFile(path.join(root,'dist',name))),record.sha256);
  assert.equal(hash(await readFile(path.join(root,'dist/runtime/ledger.js'))),hash(await readFile(path.join(root,'runtime/ledger.mjs'))));
  assert.ok(Object.keys(built.files).every(n=>!n.endsWith('.mjs')));
  const html=await readFile(path.join(root,'dist/index.html'),'utf8');assert.ok(html.includes(built.build_id));
  assert.ok(html.includes('href="/" hidden>← 游戏中心'));
});
test('compiled loader rejects mixed HTML or release before gameplay; data uses no-store and exact frozen SHA',async()=>{
  const mod=await import(pathToFileURL(path.join(root,'dist/src/data.js')).href+'?test');
  const prevDoc=globalThis.document,prevFetch=globalThis.fetch;const calls=[];
  try{
    globalThis.document={documentElement:{dataset:{build:'old'}}};
    globalThis.fetch=()=>{throw Error('must not fetch');};await assert.rejects(()=>mod.loadData(),/版本不一致/);
    globalThis.document.documentElement.dataset.build=built.build_id;
    globalThis.fetch=async()=>({ok:true,json:async()=>({build_id:'old'})});await assert.rejects(()=>mod.loadData(),/版本不一致/);
    globalThis.fetch=async(url,options)=>{
      calls.push({url,options});const bytes=await readFile(path.join(root,'dist',url));
      return {ok:true,json:async()=>JSON.parse(bytes),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
    };
    const d=await mod.loadData();assert.equal(d.rows.length,1989);assert.equal(calls.length,3);
    assert.ok(calls.every(c=>c.options.cache==='no-store'));
    const goodFetch=globalThis.fetch;
    globalThis.fetch=async(url,options)=>{
      if(url.endsWith('assets-manifest.json')){const m=JSON.parse(await readFile(path.join(root,'dist',url)));m.assets['data/coin-ui-v1.json'].sha256='0'.repeat(64);return{ok:true,json:async()=>m};}
      return goodFetch(url,options);
    };
    await assert.rejects(()=>mod.loadData(),/数据版本不一致/);
  }finally{globalThis.document=prevDoc;globalThis.fetch=prevFetch;}
});
async function request(handler,url,method='GET'){
  const result={};await handler({url,method},{writeHead(status,headers){result.status=status;result.headers=headers;},end(body){result.body=body;}});return result;
}
test('coin slash/index aliases redirect, subpath files have JS MIME, HEAD and friendly 404 work',async()=>{
  const handler=createHandler(path.join(root,'dist'),{basePath:'/coin/'});
  assert.equal((await request(handler,'/coin')).headers.Location,'/coin/');
  assert.equal((await request(handler,'/coin/index.html?x=1')).headers.Location,'/coin/?x=1');
  const js=await request(handler,'/coin/src/app.js?v=123');assert.equal(js.status,200);assert.match(js.headers['Content-Type'],/javascript/);
  const head=await request(handler,'/coin/','HEAD');assert.equal(head.status,200);assert.equal(head.body,undefined);
  const missing=await request(handler,'/coin/no-such-route');assert.equal(missing.status,404);assert.ok(missing.body.includes('返回游戏页面'));
  assert.equal((await request(handler,'/elsewhere/')).status,404);
});
test('preview refuses traversal, invalid escapes and POST; security headers and no-store stay strict',async()=>{
  const handler=createHandler(path.join(root,'dist'),{basePath:'/coin/'});
  for(const url of ['/coin/%2F..%2Fpackage.json','/coin/%2f..%2F..%2Fsecret'])assert.equal((await request(handler,url)).status,403);
  assert.equal((await request(handler,'/coin/%not-encoded')).status,400);
  assert.equal((await request(handler,'/coin/','POST')).status,405);
  const res=await request(handler,'/coin/');assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(res.headers['X-Content-Type-Options'],'nosniff');
  assert.ok(!res.headers['Content-Security-Policy'].includes('unsafe-inline'));
});
test('all production assets are local, no generated secrets, eval, or inline script handlers',async()=>{
  const html=await readFile(path.join(root,'dist/index.html'),'utf8');
  assert.ok(!/<(?:script|img|link)\b[^>]*(?:src|href)="(?:https?:|\/\/)/i.test(html));
  assert.ok(!/\bon\w+\s*=/i.test(html));
  for(const [name]of Object.entries(built.files))if(/\.(?:js|css|html|json)$/.test(name)){
    const s=await readFile(path.join(root,'dist',name),'utf8');
    assert.ok(!/\beval\s*\(|new Function\s*\(/.test(s),name);
    assert.ok(!/(?:gh[pousr]_[A-Za-z0-9]{30,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/.test(s),name);
  }
});
test('analytics enabled; only approved fixed events, no bot traffic, exceptions never interrupt game',()=>{
  const calls=[];const helper={trackEvent(name){calls.push(name);return true;}};
  assert.equal(ANALYTICS_ENABLED,true);
  for(const event of COIN_EVENTS)assert.equal(trackCoin(event,{approved:false,helper}),false);assert.equal(calls.length,0);
  for(const event of COIN_EVENTS)assert.equal(trackCoin(event,{helper,webdriver:false}),true);
  assert.deepEqual(calls,[...COIN_EVENTS]);
  assert.equal(trackCoin('coin-start',{approved:true,helper,webdriver:true}),false);
  assert.equal(trackCoin('coin-start?amount=10000',{approved:true,helper}),false);
  assert.equal(trackCoin('coin-start',{approved:true,helper:{trackEvent(){throw Error('network');}}}),false);
});
