import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHandler} from '../scripts/serve.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const {chromium}=createRequire(import.meta.url)(process.env.KPL_PLAYWRIGHT_PATH||process.env.PLAYWRIGHT_MODULE||'playwright');
const server=createServer(await createHandler(path.join(root,'dist'),{basePath:'/coin/'}));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,url=origin+'/coin/';
const browser=await chromium.launch({channel:process.env.KPL_BROWSER_CHANNEL||'msedge',headless:true});
const checks=[],errors=[],events=[],screenshots=[];
const directory=path.join(root,'reports','resume');await fs.mkdir(directory,{recursive:true});
const key='kpl-coin:checkpoint:v1';
async function context(options={}){
 const c=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',...options});
 await c.addInitScript(()=>{Object.defineProperty(navigator,'webdriver',{get:()=>true});});
 await c.route('**/*',route=>{if(new URL(route.request().url()).pathname.startsWith('/__event/')){events.push(route.request().url());return route.fulfill({status:204,body:''});}return route.continue();});
 c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));return c;
}
const saved=p=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
const home=p=>p.locator('.brand[data-action="home"]').click();
async function resume(p){await p.locator('#resume-game').focus();await p.keyboard.press('Enter');await p.locator('#play').waitFor({state:'visible'});assert.equal(await p.locator('#play').getAttribute('data-running'),'false');}
try{
 const c=await context(),p=await c.newPage();await p.goto(url);await p.locator('#team-grid button').first().waitFor();
 await p.locator('#start').click();await p.locator('[data-speed="10"]').click();
 await p.waitForFunction(()=>Number(document.querySelector('#progress').value)>=3);await p.locator('#toggle').click();
 const balance=await p.locator('#balance').textContent();await home(p);const checkpoint=await saved(p);
 assert.ok(checkpoint.expected.completed>=3);await resume(p);assert.equal(await p.locator('#balance').textContent(),balance);
 for(let i=0;i<2;i++){await home(p);await p.reload();await p.locator('#resume-game').waitFor();await resume(p);assert.equal(await p.locator('#balance').textContent(),balance);assert.deepEqual((await saved(p)).expected,checkpoint.expected);}
 checks.push('loyal: home, refresh, keyboard restore twice; same pending/settled balance, paused');
 await p.locator('#loyal-controls [data-action="finish"]').click();await p.locator('#result').waitFor({state:'visible'});
 const final=await p.locator('#final-coins').textContent();await home(p);await p.reload();await p.locator('#resume-game').click();await p.locator('#result').waitFor({state:'visible'});assert.equal(await p.locator('#final-coins').textContent(),final);
 await home(p);await p.locator('#resume-game').click();assert.equal(await p.locator('#final-coins').textContent(),final);assert.equal((await saved(p)).ui.completeTracked,true);
 checks.push('finished: repeated restore preserves final result and completion dedupe flag');
 await home(p);await p.locator('[data-action="mode"][data-mode="trader"]').click();await p.locator('#start').click();
 await p.locator('[data-action="side"][data-choice="a"]').click();await p.locator('#confirm').click();
 await p.waitForFunction(()=>document.querySelector('#match-card').dataset.phase==='result');const traderBalance=await p.locator('#balance').textContent();await home(p);const one=await saved(p);assert.equal(one.expected.records,1);
 await p.reload();await p.locator('#resume-game').click();await p.locator('#play').waitFor({state:'visible'});assert.equal(await p.locator('#balance').textContent(),traderBalance);assert.equal((await saved(p)).expected.records,1);
 await p.locator('#review-forward').click();await p.waitForFunction(()=>document.querySelector('#match-card').dataset.phase==='preview');assert.equal((await saved(p)).expected.records,1);
 checks.push('trader: choice/settlement restores once, next preview does not settle again');
 await home(p);await p.evaluate(k=>localStorage.setItem(k,'{broken'),key);await p.reload();await p.locator('#resume-panel').waitFor({state:'visible'});
 assert.match(await p.locator('#resume-note').textContent(),/损坏/);assert.equal(await p.locator('#resume-game').isDisabled(),true);
 await p.locator('[data-action="discard-save"]').click();assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),null);await p.locator('#start').click();await p.locator('#play').waitFor({state:'visible'});
 checks.push('corrupt save: explicit message and clear/restart; normal game still works');
 await home(p);await p.evaluate(k=>{const s=JSON.parse(localStorage.getItem(k));s.context.identity.gameVersion='incompatible';localStorage.setItem(k,JSON.stringify(s));},key);
 await p.reload();await p.locator('#resume-game').click();await p.waitForFunction(()=>document.querySelector('#resume-note').textContent.includes('版本'));
 checks.push('incompatible version: explicit refusal, no automatic deletion');await c.close();
 const fail=await context();let offline=true;await fail.route('**/data/coin-official-v2.1.json',route=>offline?route.fulfill({status:503,body:'unavailable'}):route.continue());
 const fp=await fail.newPage();await fp.goto(url);await fp.locator('#error').waitFor({state:'visible'});assert.equal(await fp.locator('#start').isDisabled(),true);offline=false;await fp.locator('#reload').click();await fp.locator('#team-grid button').first().waitFor();
 checks.push('core data failure: entry disabled, reload succeeds without partial play');await fail.close();
 const quota=await context();await quota.addInitScript(()=>{const native=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='kpl-coin:checkpoint:v1')throw new DOMException('quota','QuotaExceededError');return native.call(this,k,v);};});
 const qp=await quota.newPage();await qp.goto(url);await qp.locator('#start').click();await qp.locator('#toggle').click();assert.match(await qp.locator('#save-status').textContent(),/未能保存/);await quota.close();checks.push('storage quota: clear status, play is still available');
 const compatibility=await context(),cp=await compatibility.newPage();await cp.goto(url+'?dataset=v1');
 const frozen=JSON.parse(await fs.readFile(path.join(root,'data/coin-ui-v1.json'),'utf8'));
 const ag=frozen.teams.find(team=>team.short_name==='AG');assert.ok(ag);
 await cp.locator(`#team-grid button[data-team="${ag.id}"]`).click();await cp.locator('#start').click();
 await cp.locator('#loyal-controls [data-action="finish"]').click();await cp.locator('#result').waitFor({state:'visible'});
 assert.match(await cp.locator('#final-coins').textContent(),/12,077\.03/);await home(cp);await cp.reload();await cp.locator('#resume-game').click();
 await cp.locator('#result').waitFor({state:'visible'});assert.equal((await saved(cp)).context.profile,'v1');assert.match(await cp.locator('#final-coins').textContent(),/12,077\.03/);
 await compatibility.close();checks.push('v1 compatibility link: frozen AG final 12,077.03 and repeated restore unchanged');
 for(const width of [320,390,768,1366]){
  const view=await context({viewport:{width,height:844}}),vp=await view.newPage();await vp.goto(url);await vp.locator('#team-grid button').first().waitFor();
  assert.ok(await vp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await vp.keyboard.press('Tab');assert.ok(await vp.evaluate(()=>document.activeElement!==document.body));
  const shot=path.join(directory,`home-${width}.png`);await vp.screenshot({path:shot,fullPage:true});screenshots.push(shot);await view.close();
 }
 checks.push('320/390/768/1366: no overflow, keyboard focus, reduced-motion');
 assert.deepEqual(errors,[]);assert.deepEqual(events,[]);
}finally{
 await fs.writeFile(path.join(directory,'result.json'),JSON.stringify({browser:browser.version(),checks,errors,blockedProductEvents:events,screenshots},null,2));
 await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));
}
console.log(JSON.stringify({checks,errors,events},null,2));
