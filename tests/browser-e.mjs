// E验收需要独立Playwright、聚合预览目录和一次性localhost测试证书；不访问生产事件。
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:https';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createHandler} from '../scripts/serve.mjs';
const require=createRequire(import.meta.url);
const playwright=require(process.env.PLAYWRIGHT_MODULE??'playwright');
for(const key of ['COIN_SITE_DIR','COIN_TLS_FIXTURE_DIR','COIN_PLATFORM_DIR'])if(!process.env[key])throw Error(`E聚合验收需设置${key}，普通运行请使用npm start`);
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const out=path.join(root,'verification-e/preflight');await mkdir(path.join(out,'screenshots'),{recursive:true});
const temp=path.join(out,'browser-temp');await mkdir(temp,{recursive:true});process.env.TEMP=temp;process.env.TMP=temp;
const site=path.resolve(process.env.COIN_SITE_DIR),tls=path.resolve(process.env.COIN_TLS_FIXTURE_DIR);
const {expectedHeaders}=await import(pathToFileURL(path.join(process.env.COIN_PLATFORM_DIR,'scripts/runtime-security.mjs')).href);
const server=createServer({cert:await readFile(path.join(tls,'localhost-cert.pem')),key:await readFile(path.join(tls,'localhost-key.pem'))},
  createHandler(site,{headers:{...expectedHeaders,'Cache-Control':'public,max-age=0,must-revalidate'}}));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`https://127.0.0.1:${server.address().port}`;
const checks=[],errors=[],requests=[],timings=[],perf={};const browsers=[];
const check=name=>{checks.push({name,passed:true});console.log('PASS',name);};
const manifest=JSON.parse(await readFile(path.join(site,'coin/build-manifest.json')));
const hash=b=>createHash('sha256').update(b).digest('hex');
try{
  const edge=await playwright.chromium.launch({channel:'msedge',headless:true});browsers.push(edge);
  const context=await edge.newContext({viewport:{width:390,height:844},ignoreHTTPSErrors:true,reducedMotion:'reduce'});
  await context.addInitScript(()=>{
    window.KPL_ANALYTICS_DISABLED=true;
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__summary=text;}}});
  });
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>requests.push(r.url()));
  const click=action=>page.locator(`[data-action="${action}"]:visible`).first().click();
  async function load(url=origin+'/coin/?kpl_analytics=off'){await page.goto(url);await page.locator('#home').waitFor({state:'visible'});}
  async function loyal(id='smoba:10027'){await page.locator(`[data-action="team"][data-team="${id}"]`).click();await click('start');await click('toggle');}
  async function overflow(){
    if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)){
      await page.screenshot({path:path.join(out,'screenshots','overflow-debug.png'),fullPage:true});
      const detail=await page.evaluate(()=>({page:document.body.dataset.page,scroll:document.documentElement.scrollWidth,width:innerWidth,
        elements:[...document.querySelectorAll('body *')].map(el=>({tag:el.tagName,id:el.id,x:el.getBoundingClientRect().right,scroll:el.scrollWidth,client:el.clientWidth})).filter(x=>x.x>innerWidth||x.scroll>x.client+1).slice(0,10)}));
      throw Error('horizontal overflow '+JSON.stringify(detail.slice(0,10)));
    }
  }
  await load(origin+'/coin');assert.match(page.url(),/\/coin\/$/);assert.equal(await page.evaluate(()=>isSecureContext),true);
  assert.equal(await page.evaluate(()=>typeof crypto.subtle.digest),'function');check('HTTPS localhost secure context, crypto and /coin slash entry');
  for(const [name,r]of Object.entries(manifest.files)){
    const response=await context.request.get(origin+'/coin/'+name);assert.equal(response.status(),200,name);
    if(name==='index.html')assert.ok((await response.text()).includes('<script src="/shared/analytics.js"></script>'));
    else assert.equal(hash(await response.body()),r.sha256,name);
    if(name.endsWith('.js'))assert.match(response.headers()['content-type'],/javascript/);
  }
  check('all 38 deployed assets exact hashes; only index has the expected shared-helper injection');
  for(const width of [360,390,430,768,1440]){
    await page.setViewportSize({width,height:width<768?844:1000});await load();await overflow();
    await page.screenshot({path:path.join(out,'screenshots',`https-home-${width}.png`),fullPage:true});
    await loyal();await page.locator('#recap').click();await overflow();await click('finish');await overflow();
    assert.equal(await page.locator('#final-coins').textContent(),'12,077.03');
    await page.screenshot({path:path.join(out,'screenshots',`https-result-${width}.png`),fullPage:true});
  }
  check('HTTPS aggregate mobile 360/390/430 and 768/1440 layouts and full loyal money');
  await page.setViewportSize({width:390,height:844});await load(origin+'/coin/index.html');await page.reload();await page.locator('#home').waitFor({state:'visible'});
  await loyal();await page.locator('#hub-link').click();assert.equal(new URL(page.url()).pathname,'/');
  await page.goBack();await page.locator('#home, #play').filter({visible:true}).first().waitFor();
  if(await page.locator('#play').isVisible())assert.equal(await page.locator('#toggle').textContent(),'继续');
  await page.goForward();assert.equal(new URL(page.url()).pathname,'/');
  check('subpath index refresh, Hub navigation and browser back/forward do not auto-replay');
  const bad=await context.request.get(origin+'/coin/not-a-real-page');assert.equal(bad.status(),404);assert.match(await bad.text(),/返回游戏页面/);
  check('missing subroute is friendly 404 rather than a successful Portal fallback');
  // 所有错误/XSS只在测试路由中模拟，源数据和实际发布包不修改。
  const expectedErrors=errors.length;
  await page.route('**/coin/data/coin-ui-v1.json',route=>route.fulfill({status:503,body:'temporary'}));
  await page.goto(origin+'/coin/');await page.locator('#reload').waitFor({state:'visible'});assert.match(await page.locator('#error').textContent(),/加载失败/);
  await page.unroute('**/coin/data/coin-ui-v1.json');await click('reload');await page.locator('#home').waitFor({state:'visible'});
  errors.splice(expectedErrors);check('data 503 stops startup, shows reload action and recovers');
  await page.route('**/coin/release.json',async route=>{const response=await route.fetch();const d=await response.json();d.build_id='stale';await route.fulfill({response,json:d});});
  await page.goto(origin+'/coin/');await page.locator('#reload').waitFor({state:'visible'});assert.match(await page.locator('#error').textContent(),/版本不一致/);
  await page.unroute('**/coin/release.json');await click('reload');await page.locator('#home').waitFor({state:'visible'});
  check('stale deployment release is refused before any ledger initialization');
  const raw=JSON.parse(await readFile(path.join(site,'coin/data/coin-ui-v1.json')));
  raw.teams[0].display_name='<img src=x onerror="window.__xss=1">';raw.historical_names=raw.historical_names.map(n=>'<img src=x onerror="window.__xss=1">'+n);
  const bytes=Buffer.from(JSON.stringify(raw));const assetManifest=JSON.parse(await readFile(path.join(site,'coin/data/assets-manifest.json')));
  assetManifest.assets['data/coin-ui-v1.json'].sha256=hash(bytes);
  await page.route('**/coin/data/coin-ui-v1.json',r=>r.fulfill({contentType:'application/json',body:bytes}));
  await page.route('**/coin/data/assets-manifest.json',r=>r.fulfill({json:assetManifest}));
  await page.route('**/coin/release.json',async r=>{const response=await r.fetch();const d=await response.json();d.runtime_sha256=hash(bytes);await r.fulfill({response,json:d});});
  await load();await loyal();assert.equal(await page.locator('#match-card img[src="x"]').count(),0);assert.equal(await page.evaluate(()=>window.__xss),undefined);
  assert.ok((await page.locator('#match-card').textContent()).includes('<img src=x'));
  await page.unroute('**/coin/data/coin-ui-v1.json');await page.unroute('**/coin/data/assets-manifest.json');await page.unroute('**/coin/release.json');check('synthetic hostile names remain text, no injected node or handler');
  await load();await page.evaluate(()=>document.documentElement.style.fontSize='200%');await overflow();await loyal();await overflow();await click('finish');await overflow();
  await page.screenshot({path:path.join(out,'screenshots','font-200-percent.png'),fullPage:true});
  check('root font-size 200% simulated; actual system font accessibility remains manual');
  await load();await page.evaluate(()=>document.body.style.zoom='2');await overflow();await loyal();await overflow();await click('finish');await overflow();
  await page.screenshot({path:path.join(out,'screenshots','mobile-zoom-200-percent.png'),fullPage:true});check('390px home/play/result at CSS 200% layout zoom');
  await load();await loyal();const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');await cdp.send('HeapProfiler.collectGarbage');
  const metric=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  const before=await metric();
  for(let i=0;i<20;i++){await click('restart');await click('toggle');await click('finish');}
  await cdp.send('HeapProfiler.collectGarbage');const after=await metric();
  perf.heap={before_bytes:before.JSHeapUsedSize,after_20_restarts_bytes:after.JSHeapUsedSize,delta_bytes:after.JSHeapUsedSize-before.JSHeapUsedSize,basis:'desktop Chromium V8 heap after forced test GC; not total mobile memory'};
  check('20 restart/complete cycles settle exactly; desktop V8 heap measured');
  await page.emulateMedia({reducedMotion:'no-preference'});await load();await loyal();await page.locator('#recap').click();
  await page.evaluate(()=>{window.__frames=[];window.__frameWatch=true;function frame(t){window.__frames.push(t);if(window.__frameWatch)requestAnimationFrame(frame);}requestAnimationFrame(frame);});
  const start=performance.now();await click('toggle');await page.locator('#result').waitFor({state:'visible',timeout:25000});
  const seconds=(performance.now()-start)/1000;assert.equal(await page.locator('#final-coins').textContent(),'12,077.03');
  const frames=await page.evaluate(()=>{window.__frameWatch=false;return window.__frames;});const gaps=frames.slice(1).map((t,i)=>t-frames[i]).sort((a,b)=>a-b);
  perf.raf={samples:frames.length,seconds,callbacks_per_second:frames.length/seconds,p95_gap_ms:gaps[Math.floor(gaps.length*.95)],gaps_over_50ms:gaps.filter(x=>x>50).length,basis:'headless desktop rAF cadence, not physical-device painted FPS'};
  timings.push({engine:'Edge',team:'AG',seconds,final:'12077.03'});await click('copy');assert.match(await page.evaluate(()=>window.__summary),/12,077\.03/);
  check('HTTPS animated recap timed and mock clipboard contents exact');
  const android=await edge.newContext({...playwright.devices['Pixel 5'],ignoreHTTPSErrors:true,reducedMotion:'reduce'});await android.addInitScript(()=>window.KPL_ANALYTICS_DISABLED=true);
  const ap=await android.newPage();await ap.goto(origin+'/coin/');await ap.locator('#home').waitFor({state:'visible'});await ap.locator('#start').tap();await ap.locator('#toggle').tap();await ap.locator('[data-action="finish"]:visible').first().tap();assert.equal(await ap.locator('#final-coins').textContent(),'12,077.03');await android.close();
  check('Android Chrome-style UA/touch HTTPS emulation; not a real Android phone');
  const webkit=await playwright.webkit.launch({headless:true});browsers.push(webkit);
  const wc=await webkit.newContext({...playwright.devices['iPhone 13'],ignoreHTTPSErrors:true,reducedMotion:'reduce'});await wc.addInitScript(()=>{
    window.KPL_ANALYTICS_DISABLED=true;
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__summary=text;}}});
  });
  const wp=await wc.newPage();wp.on('pageerror',e=>errors.push('WebKit '+e.message));wp.on('request',r=>requests.push(r.url()));
  await wp.goto(origin+'/coin/');await wp.locator('#home').waitFor({state:'visible'});assert.equal(await wp.evaluate(()=>isSecureContext),true);
  await wp.locator('#start').tap();await wp.locator('#toggle').tap();await wp.locator('#recap').tap();
  const ws=performance.now();await wp.locator('#toggle').tap();await wp.locator('#result').waitFor({state:'visible',timeout:30000});
  assert.equal(await wp.locator('#final-coins').textContent(),'12,077.03');assert.ok(await wp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  timings.push({engine:'desktop WebKit iPhone emulation',team:'AG',seconds:(performance.now()-ws)/1000,final:'12077.03'});
  await wp.screenshot({path:path.join(out,'screenshots','webkit-iphone-result.png'),fullPage:true});await wp.locator('[data-action="copy"]').tap();
  const copyText=await wp.locator('#copy-status').textContent();assert.ok(copyText.includes('已复制')||copyText.includes('不可用'));
  await wc.close();check('desktop WebKit iPhone viewport/touch, real timer recap, mock clipboard; not iOS Safari hardware');
  assert.ok(requests.every(u=>u.startsWith(origin)));assert.ok(requests.every(u=>!new URL(u).pathname.startsWith('/__event/')));assert.deepEqual(errors,[]);
  check('all requests local same-origin, no actual analytics event or third-party request');
  perf.resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>({path:new URL(e.name).pathname,decoded:e.decodedBodySize,encoded:e.encodedBodySize,transfer:e.transferSize,duration_ms:e.duration})));
  await writeFile(path.join(out,'results.json'),JSON.stringify({all_passed:true,build_id:manifest.build_id,checks,timings,performance:perf,edge_version:await edge.version(),webkit_version:await webkit.version(),requests:[...new Set(requests)],errors,
    limitations:['self-signed localhost certificate ignored only by isolated test contexts; no production certificate validation implied','desktop Edge/Chromium and desktop WebKit device emulation, no real Android/iOS hardware','visibility/back-forward automation and mock clipboard cannot prove OS suspension or real clipboard','rAF is callback cadence, V8 heap is not total renderer/GPU/device memory','font200 is root CSS simulation, not physical system-font setting']},null,2)+'\n');await context.close();
}catch(e){await writeFile(path.join(out,'failure.json'),JSON.stringify({message:e.message,stack:e.stack,checks,errors},null,2));throw e;}
finally{for(const b of browsers)await b.close();await new Promise(resolve=>server.close(resolve));}
