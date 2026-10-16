// 布局回归：使用独立浏览器上下文，记录播放期间页面坐标，而非只检查 CSS。
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {build} from '../scripts/build.mjs';
import {createStaticServer} from '../scripts/serve.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const baseline=process.env.COIN_LAYOUT_BASELINE==='1';
const out=path.join(root,process.env.COIN_LAYOUT_OUTPUT??'verification-layout',baseline?'before':'after');
await mkdir(out,{recursive:true});
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
await build();
const server=createStaticServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge',headless:true});
const reports=[],errors=[];
const bounds=()=>{
  const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {top:r.top,height:r.height,bottom:r.bottom};};
  return {scroll:scrollY,height:document.documentElement.scrollHeight,phase:document.getElementById('match-card').dataset.phase,card:rect('match-card'),chart:rect('live-chart'),balance:rect('balance'),overflow:document.documentElement.scrollWidth>innerWidth};
};
try{
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.address().port}/?dataset=v1`;
  const click=action=>page.locator(`button[data-action="${action}"]:visible`).first().click();
  for(const [width,height] of [[360,740],[390,844],[430,932],[768,1024],[1440,900]]){
    await page.setViewportSize({width,height});await page.goto(url);await page.locator('#home').waitFor({state:'visible'});
    await page.screenshot({path:path.join(out,`home-${width}.png`)});
    const home=await page.evaluate(()=>({height:document.documentElement.scrollHeight,viewport:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,start:document.getElementById('start').getBoundingClientRect().bottom}));
    if(!baseline){assert.equal(home.overflow,false);assert.ok(home.start<=height,`${width}: 开始按钮需同屏`);assert.ok(home.height<=height+1,`${width}: 首页需一屏`);}
    await click('start');await click('toggle');
    await page.screenshot({path:path.join(out,`play-${width}.png`)});
    const play=await page.evaluate(bounds);
    if(!baseline){assert.equal(play.overflow,false);assert.ok(play.chart.bottom<=height,`${width}: 曲线需同屏`);assert.ok(play.height<=height+1,`${width}: 回放需一屏 (${play.height})`);}
    await click('finish');await page.locator('#result').waitFor({state:'visible'});
    const result=await page.evaluate(()=>({actionsBottom:document.querySelector('.result-actions').getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth}));
    await page.screenshot({path:path.join(out,`result-${width}.png`)});
    if(!baseline){assert.equal(result.overflow,false);assert.ok(result.actionsBottom<=height,`${width}: 结算操作需同屏 (${result.actionsBottom})`);}
    await click('home');await page.locator('[data-mode="trader"]').click();await click('start');
    const trader=await page.evaluate(()=>({bottom:document.getElementById('confirm').getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth,height:document.documentElement.scrollHeight}));
    await page.screenshot({path:path.join(out,`trader-${width}.png`)});
    if(!baseline){assert.equal(trader.overflow,false);assert.ok(trader.bottom<=height,`${width}: 操盘按钮需同屏`);assert.ok(trader.height<=height+1,`${width}: 操盘需一屏 (${trader.height})`);}
    if(!baseline){
      const beforeReveal=await page.evaluate(bounds);
      assert.equal(await page.locator('#match-card [data-testid="score"]').count(),0);
      await page.locator('[data-action="side"][data-choice="a"]').click();
      assert.equal(await page.locator('#match-card [data-testid="score"]').count(),0);
      await click('confirm');
      const revealed=await page.evaluate(bounds);
      assert.equal(await page.locator('#match-card [data-testid="score"]').count(),1);
      assert.equal(await page.locator('#balance').textContent(),'10,090.48');
      assert.ok(!(await page.locator('#match-card').textContent()).includes('已预留'));
      assert.equal(revealed.card.top,beforeReveal.card.top);assert.equal(revealed.chart.top,beforeReveal.chart.top);
      assert.ok(await page.locator('.reveal-choice').evaluate(e=>{const card=document.getElementById('match-card').getBoundingClientRect();return e.getBoundingClientRect().bottom<=card.bottom;}),'revealed choice readable without card scrolling');
      const minimum=await page.locator('.card-meta,.side h3,.probability,.odd,.form-mark,.reveal-choice,.reveal-outcome,.confirm-row button').evaluateAll(es=>Math.min(...es.map(e=>parseFloat(getComputedStyle(e).fontSize))));
      assert.ok(minimum>=14);trader.minimumFont=minimum;
      await page.screenshot({path:path.join(out,`trader-reveal-${width}.png`)});
      await click('next');assert.equal(await page.locator('#match-card [data-testid="score"]').count(),0);
    }
    reports.push({width,height,home,play,result,trader});
  }
  await page.setViewportSize({width:390,height:844});await page.goto(url);await page.locator('#home').waitFor({state:'visible'});await click('start');await click('toggle');
  await page.locator('[data-speed="10"]').click();await click('toggle');
  // 模拟玩家滑到曲线位置；旧布局会被内容高度变化反复带动，新布局无需下滑。
  await page.evaluate(()=>scrollTo(0,400));const samples=[];
  for(let i=0;i<100;i++){await page.waitForTimeout(50);samples.push(await page.evaluate(bounds));}
  await click('toggle');
  const spread=key=>Math.max(...samples.map(key))-Math.min(...samples.map(key));
  const stability={phases:[...new Set(samples.map(x=>x.phase))],scrollRange:spread(x=>x.scroll),cardHeightRange:spread(x=>x.card.height),cardTopRange:spread(x=>x.card.top),chartTopRange:spread(x=>x.chart.top)};
  if(!baseline){assert.ok(stability.scrollRange<=1,'播放不得改变滚动位置');assert.ok(stability.cardHeightRange<=1,'回放卡片高度固定');assert.ok(stability.cardTopRange<=1,'赛前/赛果坐标固定');assert.ok(stability.chartTopRange<=1,'曲线不得上下跳');}
  const regular=await page.evaluate(bounds);await page.locator('[data-speed="recap"]').click();const recap=await page.evaluate(bounds);
  if(!baseline){assert.equal(recap.card.top,regular.card.top);assert.equal(recap.chart.top,regular.chart.top);}
  await click('toggle');const recapSamples=[];
  while(await page.locator('#play').isVisible()){
    const b=await page.evaluate(bounds);if(b.phase==='recap')recapSamples.push(b);
    await page.waitForTimeout(100);
  }
  if(!baseline){for(const b of recapSamples){assert.equal(b.scroll,0);assert.ok(Math.abs(b.card.height-regular.card.height)<=1);assert.ok(Math.abs(b.chart.top-regular.chart.top)<=1);}}
  assert.equal(await page.locator('#final-coins').textContent(),'12,077.03');
  await page.screenshot({path:path.join(out,'result-390.png')});
  // 200% 放大允许纵向阅读，不应裁切内容或产生横向溢出。
  await click('home');await page.evaluate(()=>document.documentElement.style.zoom='2');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await click('start');await click('toggle');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('#match-card [data-testid="score"]').count(),0);
  if(!baseline)assert.equal(await page.locator('#match-card').evaluate(e=>getComputedStyle(e).overflowY),'visible');
  if(!baseline){
    await click('home');await page.locator('[data-mode="trader"]').click();await click('start');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await page.locator('#match-card').evaluate(e=>getComputedStyle(e).overflowY),'visible');
    await page.screenshot({path:path.join(out,'trader-200-percent.png'),fullPage:true});
  }
  assert.deepEqual(errors,[]);
  await writeFile(path.join(out,'results.json'),JSON.stringify({browser:browser.version(),physicalDevice:false,reducedMotion:true,reports,stability,recapFrames:recapSamples.length,agFinal:'12,077.03',errors},null,2)+'\n');
  console.log(JSON.stringify({baseline,viewports:reports.length,stability,recapFrames:recapSamples.length,agFinal:'12,077.03',errors}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
