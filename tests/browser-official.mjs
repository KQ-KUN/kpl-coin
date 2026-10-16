// 官方赛事扩展的本地子路径、版本切换及移动视口验收；没有真机或生产请求。
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createStaticServer} from '../scripts/serve.mjs';
import {decodeOfficial} from '../src/official-data.mjs';
import {Session} from '../src/engine.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,process.env.COIN_OFFICIAL_OUTPUT??'verification-competition-official');await mkdir(out,{recursive:true});
const data=decodeOfficial(JSON.parse(await readFile(path.join(root,'data/coin-official-v2.1.json'))));
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const server=createStaticServer(undefined,{basePath:'/coin/'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/coin/`;
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[],errors=[],requests=[];
const record=(name,extra={})=>{results.push({name,passed:true,...extra});console.log('PASS',name);};
try{
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',hasTouch:true});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  const click=a=>page.locator(`button[data-action="${a}"]:visible`).first().click();
  const home=async()=>{await page.goto(url);await page.locator('#home').waitFor({state:'visible'});};
  const pause=async()=>{if(await page.locator('#toggle').textContent()==='暂停')await click('toggle');};
  const comma=v=>v.replace(/\B(?=(\d{3})+(?!\d))/g,',');
  for(const [width,height] of [[360,740],[390,844],[430,932],[768,1024],[1440,900]]){
    await page.setViewportSize({width,height});await home();
    assert.equal(await page.locator('#dataset-choice').inputValue(),'all');
    assert.match(await page.locator('#selection-meta').textContent(),/8冠/);
    const layout=await page.evaluate(()=>({height:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth,start:document.getElementById('start').getBoundingClientRect().bottom}));
    assert.equal(layout.overflow,false);assert.ok(layout.start<=height);assert.ok(layout.height<=height+1,`${width} home ${layout.height}`);
    await page.screenshot({path:path.join(out,`home-${width}.png`)});
    await click('start');await pause();assert.equal(await page.locator('[data-testid="score"]').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(out,`play-${width}.png`)});
    await click('finish');const expected=new Session(data,'loyal','smoba:10027').finish().stats;
    assert.equal(await page.locator('#final-coins').textContent(),comma(expected.final));
    assert.equal(await page.locator('#honors-title').textContent(),'真实队史荣誉 · 8冠');
    assert.equal(await page.locator('#honors-list .season-item').count(),8);
    assert.ok(await page.locator('.result-actions').evaluate(e=>e.getBoundingClientRect().bottom)<=height);
    await page.screenshot({path:path.join(out,`result-${width}.png`)});
    record(`expanded home/play/result ${width}px; AG exact balance and 8 trophies`,{layout,final:expected.final});
  }
  assert.ok(requests.some(u=>u.endsWith('/data/coin-official-v2.1.json')));
  assert.ok(!requests.some(u=>u.endsWith('/data/coin-official-v2.json')));
  assert.ok(!requests.some(u=>u.endsWith('/data/coin-ui-v1.json')));record('default loads only compact expansion payload, local /coin/ assets');
  await page.setViewportSize({width:390,height:844});
  for(const [tid,n] of [['smoba:10001',11],['smoba:10006',8]]){
    await home();await page.locator(`[data-team="${tid}"]`).click();assert.match(await page.locator('#selection-meta').textContent(),new RegExp(`${n}冠`));
    await click('start');await pause();await click('finish');const expected=new Session(data,'loyal',tid).finish().stats;
    assert.equal(await page.locator('#final-coins').textContent(),comma(expected.final));
    await page.locator('#honors-result summary').click();assert.equal(await page.locator('#honors-list .season-item').count(),n);
    if(tid==='smoba:10006')assert.equal(await page.locator('#honors-list .season-item').filter({hasText:'2022世界冠军杯'}).textContent(),'2022世界冠军杯2022-12-30 · 决赛已接入');
    await page.screenshot({path:path.join(out,`honors-${tid.split(':')[1]}.png`),fullPage:true});record(`${tid} exact balance and ${n} non-reward trophies`,{final:expected.final});
  }
  await home();await page.locator('#dataset-choice').selectOption('league');await page.waitForFunction(()=>document.querySelectorAll('[data-action="team"]').length===27);
  assert.match(await page.locator('#model-label').textContent(),/elo-day-official-v2.1.0/);
  await click('start');await pause();await click('finish');assert.equal(await page.locator('#final-coins').textContent(),'11,627.89');
  await click('home');await page.locator('#dataset-choice').selectOption('all');await page.waitForFunction(()=>document.querySelectorAll('[data-action="team"]').length===27);
  await click('start');await pause();assert.equal(await page.locator('#balance').textContent(),'10,000.00');await click('home');record('competition filter keeps common model, clears old game, restores all matches');
  await page.locator('button[data-mode="trader"]').click();await page.locator('#challenge-type').selectOption('season');
  for(const [id,count] of [['KCC2021C',43],['KCC2022C',25],['KCC2023',40],['KCC2024',75],['KCC2025',38],['KCC2026',38],['KIC2023',73],['KIC2022',82]]){
    await page.locator('#challenge-season').selectOption(id);assert.match(await page.locator('#challenge-info').textContent(),new RegExp(`${count} 场`));
  }
  assert.equal(await page.locator('#challenge-season option[value="KIC2022"]').count(),1);record('all cup filters, partial KIC2023 and real 82-match KIC2022 challenge');
  await page.locator('#challenge-season').selectOption('KIC2022');await click('start');
  for(let i=0;i<81;i++){assert.equal(await page.locator('[data-testid="score"]').count(),0);await click('skip');await click('next');}
  assert.equal(await page.locator('[data-testid="score"]').count(),0);assert.ok(!(await page.locator('#phase-status').textContent()).includes('冠军：'));
  await page.screenshot({path:path.join(out,'2022-final-preview-390.png')});
  await page.locator('[data-action="side"][data-choice="a"]').click();assert.equal(await page.locator('[data-testid="score"]').count(),0);await click('confirm');
  assert.equal(await page.locator('[data-testid="score"]').textContent(),'4:2');assert.match(await page.locator('#phase-status').textContent(),/冠军：.*ES/);
  await page.screenshot({path:path.join(out,'2022-final-reveal-390.png')});
  await click('next');await page.locator('#archive-result summary').click();assert.equal(await page.locator('#archive-list .season-item').count(),48);
  assert.equal(await page.locator('#archive-list .season-item').filter({hasText:'平局'}).count(),3);
  await page.screenshot({path:path.join(out,'2022-archive-390.png'),fullPage:true});record('KIC2022 two-click final 4:2 and 48 score-only BO2 archives, 3 draws, no stake controls');
  await click('home');await page.locator('button[data-mode="trader"]').click();await page.locator('#challenge-type').selectOption('season');
  await page.locator('#challenge-season').selectOption('KCC2026');await click('start');
  for(let i=0;i<37;i++){assert.equal(await page.locator('[data-testid="score"]').count(),0);await click('skip');await click('next');}
  assert.equal(await page.locator('[data-testid="score"]').count(),0);assert.ok(!(await page.locator('#phase-status').textContent()).includes('冠军：'));
  await page.screenshot({path:path.join(out,'2026-final-preview-390.png')});
  await page.locator('[data-action="side"][data-choice="b"]').click();assert.equal(await page.locator('[data-testid="score"]').count(),0);await click('confirm');
  assert.equal(await page.locator('[data-testid="score"]').textContent(),'3:5');assert.match(await page.locator('#phase-status').textContent(),/冠军：.*狼/);
  await page.screenshot({path:path.join(out,'2026-final-reveal-390.png')});record('BO9 3:5 final and champion appear only after two-click prediction');
  await click('home');await page.locator('button[data-mode="loyal"]').click();await page.locator('[data-team="smoba:10027"]').click();await click('start');await pause();
  await page.locator('[data-speed="recap"]').click();const begun=performance.now();await click('toggle');await page.locator('#result').waitFor({state:'visible',timeout:30000});
  const elapsed=performance.now()-begun,expected=new Session(data,'loyal','smoba:10027').finish().stats;
  assert.equal(await page.locator('#final-coins').textContent(),comma(expected.final));record('expanded AG real timer recap equals canonical full replay',{elapsed_ms:Math.round(elapsed),eligible:expected.eligible,final:expected.final});
  await click('home');await page.evaluate(()=>document.documentElement.style.zoom='2');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await click('start');await pause();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);record('200% zoom, reduced-motion, emulated touch have no horizontal overflow');
  assert.deepEqual(errors,[]);assert.ok(requests.every(r=>new URL(r).origin===new URL(url).origin));
  await writeFile(path.join(out,'results.json'),JSON.stringify({all_passed:true,browser:browser.version(),physicalDevice:false,base_path:'/coin/',tests:results,errors,externalRequests:0},null,2)+'\n');
}finally{await browser.close();await new Promise(r=>server.close(r));}
