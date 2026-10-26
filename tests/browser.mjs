// 真实Edge/Chromium视口与交互验证。只用临时测试上下文，不碰个人浏览器资料。
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {homedir} from 'node:os';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {build} from '../scripts/build.mjs';
import {createStaticServer} from '../scripts/serve.mjs';
import {decode} from '../src/data.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'verification');await mkdir(path.join(output,'screenshots'),{recursive:true});
const temp=path.join(output,'browser-temp');await mkdir(temp,{recursive:true});process.env.TEMP=temp;process.env.TMP=temp;
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{
  playwright=require(process.env.PLAYWRIGHT_MODULE??path.join(homedir(),'.cache','codex-runtimes','codex-primary-runtime','dependencies','node','node_modules','playwright'));
}
const manifest=await build();
const dataset=decode(JSON.parse(await readFile(path.join(root,'data/coin-ui-v1.json'))));
const byId=new Map(dataset.rows.map(r=>[r.id,r]));
const server=createStaticServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await playwright.chromium.launch({channel:process.env.COIN_BROWSER_CHANNEL??'msedge',headless:true});
const results=[],errors=[],requests=[];
function record(name){results.push({name,passed:true});console.log('PASS',name);}
try{
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await context.addInitScript(()=>{
    const set=window.setTimeout.bind(window),clear=window.clearTimeout.bind(window);window.__gameTimers=new Set();
    window.setTimeout=(fn,delay,...args)=>{let id;id=set(()=>{window.__gameTimers.delete(id);fn(...args);},delay);if(delay>=35&&delay<=700)window.__gameTimers.add(id);return id;};
    window.clearTimeout=id=>{window.__gameTimers.delete(id);clear(id);};
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text;}}});
  });
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>requests.push(r.url()));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  const visible=id=>page.locator('#'+id).isVisible();
  const click=action=>page.locator(`button[data-action="${action}"]:visible`).first().click();
  async function load(){await page.goto(origin);await page.locator('#home').waitFor({state:'visible'});}
  async function pause(){if(await page.locator('#toggle').textContent()==='暂停')await click('toggle');}
  async function startLoyal(tid){await page.locator(`button[data-action="team"][data-team="${tid}"]`).click();await click('start');await pause();}
  async function noOverflow(label){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' horizontal overflow');}
  for(const width of [320,360,375,390,430,768,1024,1366,1440]){
    await page.setViewportSize({width,height:width<768?844:1000});await load();await noOverflow(`home ${width}`);
    await page.locator('img').evaluateAll(imgs=>imgs.forEach(i=>i.loading='eager'));
    await page.waitForFunction(()=>[...document.querySelectorAll('img')].every(i=>i.complete&&i.naturalWidth>0));
    if([360,390,430,768,1440].includes(width))await page.screenshot({path:path.join(output,'screenshots',`home-${width}.png`),fullPage:true});
    await startLoyal('smoba:10027');await noOverflow(`play ${width}`);
    assert.equal(await page.locator('#match-card [data-testid="score"]').count(),0);
    assert.equal(await page.evaluate(()=>window.__gameTimers.size),0);
    if([360,390,430,768,1440].includes(width))await page.screenshot({path:path.join(output,'screenshots',`loyal-${width}.png`),fullPage:true});
    await click('finish');await page.locator('#result').waitFor({state:'visible'});await noOverflow(`result ${width}`);
    assert.equal(await page.locator('#final-coins').textContent(),'12,077.03');
    if([360,390,430,768,1440].includes(width))await page.screenshot({path:path.join(output,'screenshots',`result-${width}.png`),fullPage:true});
    record(`home/play/result no overflow ${width}px, images loaded, exact AG result`);
  }
  await page.setViewportSize({width:390,height:844});
  for(const [tid,expected]of [['smoba:10001','12,859.74'],['smoba:10006','8,942.92']]){
    await load();await startLoyal(tid);await click('finish');assert.equal(await page.locator('#final-coins').textContent(),expected);
    record('loyal rendered result '+tid);
  }
  await load();await startLoyal('smoba:10027');
  await page.locator('[data-action="speed"][data-speed="10"]').click();await click('toggle');
  await page.waitForTimeout(240);await pause();
  const completed=await page.locator('#completed').textContent();const nodes=await page.locator('#live-chart *').count();
  await page.evaluate(()=>{window.__curvePath=document.querySelector('#live-chart path');});
  await page.waitForTimeout(220);assert.equal(await page.locator('#completed').textContent(),completed);assert.equal(await page.evaluate(()=>window.__gameTimers.size),0);
  await click('toggle');await page.waitForTimeout(220);await pause();assert.equal(await page.locator('#live-chart *').count(),nodes);
  assert.equal(await page.evaluate(()=>window.__curvePath===document.querySelector('#live-chart path')),true);
  record('pause/resume/10x and stable SVG nodes');
  await click('toggle');await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await page.locator('#toggle').textContent(),'继续');assert.equal(await page.evaluate(()=>window.__gameTimers.size),0);
  await page.evaluate(()=>{delete document.hidden;});record('hidden document event auto pauses');
  for(let i=0;i<5;i++){await click('restart');await pause();assert.equal(await page.locator('#balance').textContent(),'10,000.00');assert.equal(await page.evaluate(()=>window.__gameTimers.size),0);}
  await click('home');await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.__gameTimers.size),0);record('repeat restart and home leave no stale timers');
  await page.locator('[data-action="mode"][data-mode="trader"]').click();await click('start');
  assert.equal(await page.locator('#match-card [data-testid="score"]').count(),0);
  await page.screenshot({path:path.join(output,'screenshots','trader-preview-390.png'),fullPage:true});
  await page.locator('[data-action="side"][data-choice="a"]').click();await click('confirm');
  assert.equal(await page.locator('#match-card [data-testid="score"]').count(),0);assert.match(await page.locator('#reserved').textContent(),/100\.00/);
  await click('next');await page.locator('[data-action="side"][data-choice="b"]').click();await click('confirm');await click('next');
  assert.equal(await page.locator('#match-card [data-testid="score"]').count(),2);assert.match(await page.locator('#match-card').textContent(),/90\.48/);
  assert.equal(await page.locator('#balance').textContent(),'9,990.48');await click('next');await click('skip');await click('finish');
  assert.equal(await page.locator('#final-coins').textContent(),'9,990.48');assert.match(await page.locator('#result-stats').textContent(),/参与场次2/);
  await page.screenshot({path:path.join(output,'screenshots','trader-result-390.png'),fullPage:true});record('trader A win B loss skip and grouped reveal');
  await click('copy');assert.match(await page.evaluate(()=>window.__copied),/9,990\.48/);assert.match(await page.locator('#copy-status').textContent(),/已复制/);record('copy summary correct (clipboard mocked, personal clipboard untouched)');
  await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('unavailable in test');};});
  await click('copy');assert.match(await page.locator('#copy-fallback').inputValue(),/9,990\.48/);
  record('clipboard unavailable exposes selectable summary fallback');
  await click('restart');await page.locator('[data-action="stake"][data-stake="50.00"]').click();
  await page.locator('[data-action="side"][data-choice="a"]').click();await click('confirm');await click('next');
  await page.locator('[data-action="stake"][data-stake="200.00"]').click();await page.locator('[data-action="side"][data-choice="b"]').click();
  await click('confirm');await click('finish');assert.equal(await page.locator('#final-coins').textContent(),'9,845.24');
  record('50 and 200 stake choices use exact canonical payouts');
  // 用真实前20场的已知败方构造耗尽余额的UI验收，不修改正式初始本金或数据。
  await click('restart');let placed=0,guard=200;
  while(placed<20&&guard-->0){
    const phase=await page.locator('#match-card').getAttribute('data-phase');
    if(phase==='preview'){
      const id=await page.locator('#match-card').getAttribute('data-match-id');const r=byId.get(id);
      await page.locator('[data-action="stake"][data-stake="500.00"]').click();
      await page.locator(`[data-action="side"][data-choice="${r.winner_id===r.team_a_id?'b':'a'}"]`).click();await click('confirm');placed++;
    }else await click('next');
  }
  while(await page.locator('#match-card').getAttribute('data-phase')!=='preview')await click('next');
  assert.equal(await page.locator('#stake-options button:disabled').count(),4);assert.equal(await page.locator('#confirm').isDisabled(),true);
  await click('skip');await click('finish');assert.equal(await page.locator('#final-coins').textContent(),'0.00');
  record('actual 20 losing 500-stake decisions exhaust cash, all amounts disabled, skip works');
  await load();await page.locator('#start').focus();await page.keyboard.press('Enter');await pause();
  await page.locator('#toggle').focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
  const focus=await page.locator('#toggle').evaluate(el=>getComputedStyle(el).outlineWidth);assert.equal(focus,'3px');
  assert.equal(await page.locator('#toggle').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
  record('keyboard main action, visible focus and reduced-motion');
  const sizes=await page.locator('.playback-controls button:visible').evaluateAll(btns=>btns.map(b=>({h:b.getBoundingClientRect().height,w:b.getBoundingClientRect().width})));
  assert.ok(sizes.every(s=>s.h>=44&&s.w>=44));record('playback touch targets at least 44px');
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.body.style.zoom='2');
  await noOverflow('200 percent zoom');await page.screenshot({path:path.join(output,'screenshots','zoom-200-percent.png'),fullPage:true});
  await page.evaluate(()=>document.body.style.zoom='');await page.setViewportSize({width:390,height:844});
  record('200 percent layout zoom no horizontal overflow');
  await load();await page.locator('[data-action="team"][data-team="smoba:10027"]').click();await click('start');
  await page.locator('[data-action="speed"][data-speed="10"]').click();
  const timedStart=performance.now();
  await page.locator('#result').waitFor({state:'visible',timeout:65000});
  const timedSeconds=(performance.now()-timedStart)/1000;
  assert.equal(await page.locator('#final-coins').textContent(),'12,077.03');
  assert.equal(await page.evaluate(()=>window.__gameTimers.size),0);
  record(`natural 10x AG full autoplay completed in ${timedSeconds.toFixed(2)} seconds`);
  assert.ok(requests.every(url=>url.startsWith(origin)));assert.deepEqual(errors,[]);
  record('same-origin resources, no raw audit/API loads, no console errors');
  await writeFile(path.join(output,'browser-results.json'),JSON.stringify({all_passed:true,browser:await browser.version(),
    runtime_bytes:manifest.runtime_bytes,natural_AG_10x_seconds:timedSeconds,checks:results,errors,resource_requests:[...new Set(requests)],
    limitations:['桌面Edge移动视口模拟，未做真实手机验收','visibilitychange为受控隐藏事件测试','clipboard为测试替身，无个人剪贴板读取']},null,2)+'\n');
  await context.close();
}catch(error){await writeFile(path.join(output,'browser-failure.json'),JSON.stringify({message:error.message,stack:error.stack,checks:results,errors},null,2));throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
