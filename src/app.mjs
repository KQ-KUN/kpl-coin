import {loadData} from './data.mjs';
import {Playback} from './engine.mjs';
import {competitionLabels,filterCompetition,createCompetitionGame} from './competition.mjs';
import {ReplayReview} from './review.mjs';
import {homeTeams,teamIcon} from './presentation.mjs';
import {loadOfficial} from './official-data.mjs';
import {selectRows} from './challenge.mjs';
import {trackCoin} from './analytics.mjs';
import {CHECKPOINT_KEY,readCheckpoint,recordSession,restoreCheckpoint} from './checkpoint.mjs';

const $=id=>document.getElementById(id);
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const coins=v=>{const [a,b='00']=String(v).split('.');return `${a.replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${b}`;};
const signed=v=>`${String(v).startsWith('-')?'':'+'}${coins(v)}`;
const netClass=v=>v==='0.00'?'unchanged':v.startsWith('-')?'negative':'positive';
const pct=p=>`${(Number(p)*100).toFixed(1)}%`;
const category={arena_stage:'擂台赛',breakout:'突围赛',grand_final:'总决赛',playoffs:'季后赛',regular_season:'常规赛',seat_decider:'卡位赛'};
let data,sourceData,competitionKind='all',loyalCompetitionKind='all',mode='loyal',teamId='smoba:10027',session=null,playback=null,view=null;
let chosenSide=null,chosenStake='100.00',controlsQuote=null;
let scope={type:'season_team',seasonId:null,teamId},motionAllowed=true,completeTracked=false,recapTracked=false;
let profile=new URLSearchParams(location.search).get('dataset')==='v1'?'v1':'official',datasetGeneration=0;
const datasetCache=new Map();
const review=new ReplayReview();
let recorder=null,saveTimer=null,saveGeneration=0,resuming=false;
function savedRaw(){try{return localStorage.getItem(CHECKPOINT_KEY);}catch{return null;}}
function renderResume(){
  const raw=savedRaw();$('resume-panel').hidden=!raw;
  if(!raw)return;
  try{const saved=readCheckpoint(raw);$('resume-note').textContent=`上次${saved.context.mode==='loyal'?'死忠回放':'历史操盘'} · ${saved.expected.completed} 场已揭晓，可继续或重新开始。`;$('resume-game').disabled=false;}
  catch(error){$('resume-note').textContent=error.message;$('resume-game').disabled=true;}
}
function flushSave(){
  clearTimeout(saveTimer);saveTimer=null;if(!recorder||recorder.session!==session)return;
  try{localStorage.setItem(CHECKPOINT_KEY,recorder.snapshot({speed:playback?.speed??3,completeTracked,recapTracked}));$('save-status').textContent='进度已保存在此浏览器';}
  catch{$('save-status').textContent='浏览器未能保存进度，本局仍可继续游玩。';}
}
function scheduleSave(){const generation=saveGeneration;clearTimeout(saveTimer);saveTimer=setTimeout(()=>{if(generation===saveGeneration)flushSave();},250);}
function detachSave(){clearTimeout(saveTimer);saveTimer=null;saveGeneration++;recorder=null;}
function bindRecorder(priorActions=[]){
  recorder=recordSession(session,{identity:sourceData.identity,profile,mode,teamId,scope:{...scope},competitionKind},scheduleSave,priorActions);
}
function stopMotion(){for(const el of [$('balance'),$('match-card')])for(const a of el.getAnimations({subtree:true}))a.cancel();}
function feedback(v){
  stopMotion();
  if(!motionAllowed||matchMedia('(prefers-reduced-motion: reduce)').matches||!['result','recap'].includes(v.phase))return;
  // 数字直接呈现准确金额，只滚动展示位置，不生成中间收益或第二套金额计算。
  $('balance').animate([{transform:'translateY(4px)',opacity:.65},{transform:'translateY(0)',opacity:1}],{duration:180,easing:'cubic-bezier(0.23, 1, 0.32, 1)'});
  $('match-card').animate([{opacity:.7},{opacity:1}],{duration:180,easing:'cubic-bezier(0.23, 1, 0.32, 1)'});
}
function scopeLabel(){
  const season=data.seasons.find(s=>s.id===scope.seasonId)?.name??'';
  return scope.type==='season_team'?`${season} · ${team(scope.teamId).short_name}`:scope.type==='season'?season:scope.type==='team'?`${team(scope.teamId).short_name} · 当前资料队史`:'全历史挑战';
}

function team(id){return data.teams.find(t=>t.id===id);}
function logo(id,lazy=false){const t=team(id),icon=teamIcon(t),badge=Array.from(t.short_name).slice(0,/^[A-Za-z]/.test(t.short_name)?4:2).join('');return icon?`<img src="./${escape(icon)}" alt="${escape(t.display_name)}队徽快照" width="64" height="64" ${lazy?'loading="lazy"':''} decoding="async">`:`<span class="logo-fallback" aria-label="${escape(t.short_name)}历史队徽缺失">${escape(badge)}</span>`;}
function page(name){document.body.dataset.page=name;for(const id of ['home','play','result'])$(id).hidden=id!==name;$('error').hidden=true;}
function showError(error){$('error').textContent=error.message??String(error);$('error').hidden=false;$('reload').hidden=Boolean(data);}

function renderHome(){
  page('home');$('team-picker').hidden=mode!=='loyal';$('trader-intro').hidden=mode!=='trader';
  document.body.dataset.mode=mode;
  $('dataset-bar').hidden=mode==='trader';
  $('dataset-choice').value=competitionKind;
  $('model-label').textContent='虚拟计分 · 非官方粉丝自制';
  $('data-model-note').textContent=`当前模型 ${data.metadata.model_version}。历史资料、模型与验收范围见下方说明。`;
  $('dataset-note').textContent=profile==='official'?`${competitionLabels[competitionKind]}：当前范围 ${data.rows.length.toLocaleString('en-US')} 场。联赛含KPL联赛与年度总决赛；杯赛含已接入的世冠、冬冠、挑战者杯及选拔赛。三种范围共用同一扩展模型，只筛选比赛，不改赔率。2022/2023世冠整个BO2阶段不参与预测；2022的48场可查只读档案。队史荣誉为全部历史奖杯，2020年前仅展示荣誉。`:'原V1冻结数据仅供验收链接对账，不是当前扩展模型的联赛筛选结果。';
  for(const b of document.querySelectorAll('[data-action="mode"]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
  for(const b of document.querySelectorAll('[data-action="team"]'))b.setAttribute('aria-pressed',String(b.dataset.team===teamId));
  const t=team(teamId);
  $('selection-name').textContent=mode==='loyal'?t.display_name:'历史操盘';
  const rows=mode==='trader'?selectRows(data,scope):[];
  $('selection-meta').textContent=mode==='loyal'?`${t.match_count} 场 · ${t.first_date.slice(0,4)} 年起 · 每场 100`:`${rows.length} 场 · ${rows.length?rows[0].date+' — '+rows.at(-1).date:'无已验收比赛'}`;
  $('challenge-info').textContent=`${scopeLabel()} · ${rows.length} 场${rows.length?' · '+rows[0].date+' — '+rows.at(-1).date:' · 请更换赛季或战队'}${scope.type==='all'?`。高级长程挑战，包含 ${data.rows.length.toLocaleString('en-US')} 场。`:''}`;
  if(['season','season_team'].includes(scope.type)&&scope.seasonId==='KIC2022')$('challenge-info').textContent+='；BO2小组赛48场另存档，不参与预测。';
  $('season-filter').hidden=!['season_team','season'].includes(scope.type);
  $('team-filter').hidden=!['season_team','team'].includes(scope.type);
  $('start').disabled=mode==='trader'&&!rows.length;
  $('start').textContent=mode==='loyal'?'开始模拟 →':'进入历史操盘 →';
  if(mode==='loyal'&&data.honors){const count=data.honors.filter(h=>h.champion_id===teamId).length;if(count)$('selection-meta').textContent+=` · 队史${count}冠`;}
  renderResume();
}
async function activateDataset(next){
  const generation=++datasetGeneration;
  flushSave();detachSave();stopMotion();playback?.dispose();session=null;data=null;$('start').disabled=true;$('dataset-choice').disabled=true;
  $('load-status').hidden=false;
  try{
    const loaded=datasetCache.get(next)??await(next==='v1'?loadData():loadOfficial());
    if(generation!==datasetGeneration)return;
    sourceData=loaded;profile=next;datasetCache.set(next,loaded);
    // 原?dataset=v1验收链接继续只读对账，首页不提供版本切换入口。
    $('dataset-choice').querySelector('[value="cup"]').disabled=next==='v1';
    applyCompetition('all');$('load-status').hidden=true;
  }catch(error){if(generation===datasetGeneration){$('load-status').hidden=true;showError(error);}}
  finally{if(generation===datasetGeneration)$('dataset-choice').disabled=false;}
}
function applyCompetition(kind){
  const selected=filterCompetition(sourceData,kind);
  if(!selected.rows.length)throw Error('当前资料没有该类比赛');
  flushSave();detachSave();stopMotion();playback?.dispose();session=null;view=null;review.clear();
  data=selected;competitionKind=kind;
  if(!team(teamId))teamId=data.teams.some(t=>t.id==='smoba:10027')?'smoba:10027':data.teams[0].id;
  if(!data.teams.some(t=>t.id===scope.teamId))scope.teamId=teamId;
  if(!data.seasons.some(s=>s.id===scope.seasonId)){
    const preferred=data.seasons.find(s=>s.id==='KPL2020S1');
    scope.seasonId=preferred?.id??data.seasons.find(s=>scope.type!=='season_team'||data.rows.some(r=>r.season_id===s.id&&[r.team_a_id,r.team_b_id].includes(scope.teamId)))?.id??data.seasons[0].id;
  }
  $('challenge-season').innerHTML=data.seasons.map(s=>`<option value="${escape(s.id)}">${escape(s.name)}</option>`).join('');
  $('challenge-team').innerHTML=data.teams.map(t=>`<option value="${escape(t.id)}">${escape(t.display_name)}</option>`).join('');
  $('challenge-season').value=scope.seasonId;$('challenge-team').value=scope.teamId;
  initTeams();renderHome();
}
function initTeams(){
  const teams=homeTeams(data.teams);
  $('team-grid').innerHTML=teams.map((t,i)=>`<button class="team-choice" data-action="team" data-team="${escape(t.id)}" aria-pressed="${t.id===teamId}" aria-label="选择${escape(t.display_name)}，${t.match_count}场">${logo(t.id,i>5)}<strong>${escape(t.short_name)}</strong></button>`).join('');
}
function controls(){
  if(!playback)return;
  document.body.dataset.recap=String(playback.speed==='recap');
  $('toggle').textContent=playback.running?'暂停':'继续';
  $('toggle').setAttribute('aria-label',playback.running?'暂停模拟':'继续模拟');
  $('play').dataset.running=String(playback.running);
  for(const b of document.querySelectorAll('[data-action="speed"]'))b.setAttribute('aria-pressed',String((b.dataset.speed==='recap'?'recap':Number(b.dataset.speed))===playback.speed));
}
function reviewControls(){
  $('review-back').disabled=!view||!review.canPrevious(view);
  $('review-forward').disabled=!view||(!review.active&&mode==='trader'&&view.phase==='preview');
  $('review-note').textContent=review.active?`回看 ${review.cursor+1} / ${review.entries.length}`:'';
}
function renderReview(entry){
  stopMotion();playback?.pause();page('play');document.body.dataset.review='true';
  $('year').textContent=entry.date.slice(0,4);$('season-name').textContent=entry.season_name;$('date-label').textContent=entry.date;
  $('match-card').dataset.phase='review';$('match-card').dataset.matchId=entry.id;
  $('match-card').innerHTML=(mode==='trader'?revealMarkup(entry):resultMarkup([entry],entry.batch))
    +`<p class="review-asset">当时资产 <strong>${coins(entry.assetAfter)}</strong> 枚</p>`;
  $('match-card').classList.toggle('final-emphasis',entry.stage_category==='grand_final');
  $('match-card').scrollTop=0;$('match-state').textContent='回看中';
  $('phase-status').textContent='回看已揭晓的历史赛果，不改变当前资产或已确认选择。';
  $('trader-controls').hidden=mode!=='trader';$('next-controls').hidden=mode!=='trader'||view.phase==='preview';
  controls();reviewControls();
}
function exitReview(){if(review.active){review.exit();render(view);}}
function moveForward(){
  stopMotion();playback?.pause();
  if(review.active){const entry=review.forward(view);if(entry)renderReview(entry);else render(view);return;}
  if(mode==='trader'&&view.phase==='preview')return;
  // 沿用真实日期批状态，略过记账提示，不强行提前揭晓同日结果。
  let next;do{next=session.advance();}while(next.phase==='recorded'||next.phase==='season');
  render(next);
}
function chart(svg,points){
  const key=`${points.length}:${points.at(-1).assetMinor}:${points.at(-1).date}`;
  if(svg.dataset.series===key)return;
  svg.dataset.series=key;
  svg.dataset.direction=points.at(-1).assetMinor>1000000n?'positive':points.at(-1).assetMinor<1000000n?'negative':'unchanged';
  const values=points.map(p=>Number(p.assetMinor)/100); // 仅绘图坐标；账本与统计保持整数分。
  let min=Math.min(...values,10000),max=Math.max(...values,10000);const pad=Math.max(100,(max-min)*.12);min-=pad;max+=pad;
  const start=Date.parse(points[0].date),end=Date.parse(points.at(-1).date);
  const coords=points.map((p,i)=>[end===start?(points.length===1?16:16+i/(points.length-1)*568):16+(Date.parse(p.date)-start)/(end-start)*568,190-(values[i]-min)/(max-min)*170]);
  const path=coords.length===1?`M16,${coords[0][1]} L584,${coords[0][1]}`:coords.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  svg.querySelector('path').setAttribute('d',path);
  const [x,y]=coords.at(-1);svg.querySelector('circle').setAttribute('cx',String(x));svg.querySelector('circle').setAttribute('cy',String(y));
  const baseline=190-(10000-min)/(max-min)*170;svg.querySelector('line').setAttribute('y1',String(baseline));svg.querySelector('line').setAttribute('y2',String(baseline));
  svg.setAttribute('aria-label',`资产曲线，共${points.length}个${mode==='trader'?'逐场':'日期批'}节点，当前${coins((Number(points.at(-1).assetMinor)/100).toFixed(2))}枚硬币`);
}
function matchMarkup(q,support=''){
  const form=s=>(q[`form_${s}`]??[]).map(r=>`<span class="form-mark ${r.result==='W'?'positive':'negative'}" title="${r.date} 比赛，${r.available_date} 结果可用">${r.result==='W'?'胜':'负'}</span>`).join('');
  const side=s=>`<div class="side">${logo(q[`team_${s}_id`])}<h3>${escape(q[`name_${s}`])}</h3><p class="probability">胜率 <strong>${pct(q[`p_${s}`])}</strong></p><p class="odd"><abbr title="完整模型模拟倍率 ${escape(q[`odds_${s}`])}">×${Number(q[`odds_${s}`]).toFixed(4)}</abbr></p><div class="recent-form"><span>近五场</span><div>${form(s)||'<small>暂无记录</small>'}</div></div></div>`;
  return `<div class="card-meta"><span>${escape(q.stage_name??category[q.stage_category])} · BO${q.best_of}</span><span>${escape(q.date)}</span></div><div class="versus">${side('a')}<span class="vs" lang="en">VS</span>${side('b')}</div>${support?`<p class="support-line">${escape(support)}</p>`:''}`;
}
function renderTrader(q){
  if(controlsQuote!==q.id){
    controlsQuote=q.id;chosenSide=null;
    const valid=['50.00','100.00','200.00','500.00'].filter(v=>BigInt(v.replace('.',''))<=session.ledger.cashMinor);
    if(!valid.includes(chosenStake))chosenStake=valid.includes('100.00')?'100.00':valid[0]??'50.00';
    $('side-choices').innerHTML=['a','b'].map(s=>`<button data-action="side" data-choice="${s}" aria-pressed="false">支持 ${escape(q[`name_${s}`])}</button>`).join('');
    $('stake-options').innerHTML=['50.00','100.00','200.00','500.00'].map(v=>`<button data-action="stake" data-stake="${v}" aria-pressed="false">${v.split('.')[0]}</button>`).join('');
  }
  for(const b of $('side-choices').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.choice===chosenSide));
  for(const b of $('stake-options').querySelectorAll('button')){
    b.disabled=BigInt(b.dataset.stake.replace('.',''))>session.ledger.cashMinor;
    b.setAttribute('aria-pressed',String(b.dataset.stake===chosenStake));
  }
  $('confirm').disabled=!chosenSide||BigInt(chosenStake.replace('.',''))>session.ledger.cashMinor;
  $('confirm').textContent=chosenSide?`确认并揭晓 · ${chosenStake.split('.')[0]}`:'先选择支持的战队';
}
function renderPlay(v){
  page('play');document.body.dataset.mode=mode;document.body.dataset.review='false';const stats=v.stats;
  $('play-title').textContent=mode==='loyal'?`${team(teamId).short_name} 的历史`:'历史操盘';
  $('balance').textContent=coins(stats.final);$('cash-value').textContent=coins(stats.cash);$('reserved-value').textContent=coins(stats.reserved);
  $('year').textContent=v.date.slice(0,4);$('date-label').textContent=v.date;
  $('completed').textContent=`${stats.completed} / ${stats.eligible} 场`;$('progress').max=stats.eligible;$('progress').value=stats.completed;
  $('loyal-controls').hidden=mode!=='loyal';$('trader-footer').hidden=mode!=='trader';
  $('trader-controls').hidden=!(mode==='trader'&&['preview','result'].includes(v.phase));$('next-controls').hidden=mode!=='trader'||v.phase==='preview';
  document.querySelector('.confirm-row').hidden=v.phase!=='preview';
  for(const b of $('side-choices').querySelectorAll('button'))b.disabled=v.phase!=='preview';
  if(v.phase!=='preview'){
    for(const b of $('stake-options').querySelectorAll('button'))b.disabled=true;
    $('confirm').disabled=true;
  }
  $('trader-controls').querySelector('[data-action="skip"]').disabled=v.phase!=='preview';
  $('match-card').classList.remove('final-emphasis');
  let label='';
  if(v.phase==='preview'){
    const q=v.quote;$('season-name').textContent=q.season_name;
    $('match-card').dataset.matchId=q.id;
    const support=mode==='loyal'?`固定支持 ${q.team_a_id===teamId?q.name_a:q.name_b} · 100 枚硬币`:'';
    $('match-card').innerHTML=matchMarkup(q,support);label=mode==='loyal'?'赛前 · 本命始终不变':'赛前 · 支持一方，或跳过';
    if(q.stage_category==='grand_final'){$('match-card').classList.add('final-emphasis');label+=' · 总决赛';}
    if(mode==='trader')renderTrader(q);
  }else if(v.phase==='recorded'){
    const q=v.decision;$('season-name').textContent=q.season_name;
    $('match-card').dataset.matchId=q.id;
    const notice=q.status==='placed'?`固定支持 · ${q.stake} 枚硬币`
      :q.status==='skipped'?'本场未参与，赛果仍按历史日期揭晓。':'可用余额不足，已停止新增投入；尚未结算的比赛继续结算。';
    $('match-card').innerHTML=matchMarkup(q,notice);label='选择已记录 · 赛果尚未揭晓';
  }else if(v.phase==='result'){
    delete $('match-card').dataset.matchId;
    $('season-name').textContent=v.results[0].season_name;
    $('match-card').innerHTML=mode==='trader'?revealMarkup(v.results[0]):resultMarkup(v.results,v.date);
    if(v.results.some(r=>r.stage_category==='grand_final'))$('match-card').classList.add('final-emphasis');
    label='揭晓 · 按真实系列比分结算';
  }else if(v.phase==='recap'){
    delete $('match-card').dataset.matchId;
    $('season-name').textContent=v.review.seasonName;
    $('match-card').innerHTML=`<p class="recap-label">极速回顾 · 每场均已按原规则推进</p><h2>${escape(v.review.highlight??v.review.season?.name??'历史正在向前')}</h2><p class="batch-change">本次揭晓 ${v.results.length} 场 · 净变化 <strong class="${netClass(v.review.net)}">${signed(v.review.net)}</strong></p>`
      +(v.results.length?resultMarkup(v.results.slice(-2),v.date,true):'<p class="small-note">正在记录本命支持，等待历史结果批次。</p>');
    if(v.review.highlight?.includes('总决赛'))$('match-card').classList.add('final-emphasis');
    label=`极速回顾 · ${v.review.highlight??'历史日期批推进'}`;
  }else if(v.phase==='season'){
    delete $('match-card').dataset.matchId;
    const s=v.season;$('season-name').textContent=s.name;
    $('match-card').innerHTML=`<div class="season-interlude"><span class="season-tag">赛季终页</span><h2>${escape(s.name)}结束</h2><p>参与 ${s.participated} 场，命中 ${s.wins} 场</p><p>本赛季净收益 <strong class="${netClass(s.net)}">${signed(s.net)}</strong></p><p class="small-note">历史继续，带着你的硬币走向下一季。</p></div>`;label='赛季结束';
  }
  $('phase-status').textContent=label;$('match-card').dataset.phase=v.phase;
  $('match-state').textContent=['preview','recorded'].includes(v.phase)?'待揭晓':v.phase==='recap'?'极速中':v.phase==='season'?'赛季末':'已揭晓';
  const award=v.results?.map(r=>data.honors?.find(h=>h.final_match_id===r.id)).find(Boolean);
  if(award)$('phase-status').textContent=`真实历史 · ${award.name}冠军：${data.teams.find(t=>t.id===award.champion_id)?.short_name??''}`;
  $('match-card').scrollTop=0; // 新比赛从卡片顶部展示，只移动内部内容，不滚动页面。
  $('live-net').textContent=`净收益 ${signed(stats.net)}`;
  $('live-net').className=netClass(stats.net);
  chart($('live-chart'),v.curve);$('curve-first').textContent=v.firstDate;$('curve-last').textContent=v.date;
  controls();reviewControls();feedback(v);
}
function revealMarkup(r){
  const side=s=>`<div class="side">${logo(r[`team_${s}_id`])}<h3>${escape(r[`name_${s}`])}</h3></div>`;
  const selected=r.choice==='a'?r.name_a:r.name_b;
  return `<div class="card-meta"><span>${escape(r.stage_name??category[r.stage_category])} · BO${r.best_of}</span><span>${escape(r.date)}</span></div>`
    +`<div class="versus reveal-versus">${side('a')}<span class="score-value" data-testid="score">${r.score_a}:${r.score_b}</span>${side('b')}</div>`
    +`<div class="reveal-outcome ${netClass(r.net)}"><span>${r.status==='placed'?(r.won?'命中 ↑':'未命中 ↓'):'本场跳过'}</span><strong>${signed(r.net)} <small>枚</small></strong></div>`
    +`<p class="reveal-choice">${r.status==='placed'?`支持 ${escape(selected)} · 投入 ${escape(r.stake)} 枚`:'未投入硬币'}</p>`;
}
function resultMarkup(results,date,recap=false){
  return `<div class="card-meta"><span>真实历史赛果 · ${results.length} 场</span><span>${recap?'按原日期批顺序':escape(date)}</span></div>`+results.map(r=>`<div class="score-row ${r.won?'hit':r.won===false?'miss':''}"><div><strong>${escape(r.name_a)}<br>对 ${escape(r.name_b)}</strong><small>${escape(r.date)} · ${r.stage_category==='grand_final'?'总决赛 · ':''}${r.status==='placed'?(r.won?'命中 ↑':'未命中 ↓'):'未参与'}</small><span class="net-delta ${netClass(r.net)}">${signed(r.net)} <small>枚硬币</small></span></div><span data-testid="score" class="score-value">${r.score_a}:${r.score_b}</span></div>`).join('');
}
function renderResult(v){
  page('result');playback?.pause();const s=v.stats;
  if(!completeTracked){completeTracked=true;trackCoin('coin-complete');}
  const resultTeam=mode==='loyal'?teamId:['season_team','team'].includes(scope.type)?scope.teamId:null;
  $('result-logo').innerHTML=resultTeam?logo(resultTeam):'<span class="challenge-seal">历史操盘</span>';
  $('result-title').textContent=resultTeam?team(resultTeam).display_name:'历史操盘';
  $('result-mode').textContent=mode==='loyal'?'死忠模式 · 历史结算':scopeLabel();
  $('result-mode').textContent+=` · ${competitionLabels[competitionKind]}`;
  $('result-range').textContent=`比赛范围 ${v.firstDate} — ${v.lastDate}`;
  $('final-coins').textContent=coins(s.final);$('final-net').textContent=`净收益 ${signed(s.net)}`;$('final-net').className=netClass(s.net);
  const fields=[['初始硬币',coins(s.initial)],['总投入',coins(s.totalStaked)],['参与场次',String(s.participated)],['命中率',s.hitRate===null?'未参与':pct(s.hitRate)],['最高资产',coins(s.highest)],['最大回撤',coins(s.maxDrawdown)],['最长连胜',`${s.longestWin} 场`],['最长连败',`${s.longestLoss} 场`]];
  $('result-stats').innerHTML=fields.map(([label,value])=>`<div class="stat"><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`).join('');
  chart($('result-chart'),v.curve);
  $('result-first').textContent=v.firstDate;$('result-last').textContent=v.lastDate;
  const seasonName=s=>s?data.seasons.find(x=>x.id===s.seasonId).name:'未参与';
  $('result-highlights').innerHTML=`<div><span>单场最高净收益</span><strong class="${s.maxSingleProfit===null?'unchanged':netClass(s.maxSingleProfit)}">${s.maxSingleProfit===null?'未参与':signed(s.maxSingleProfit)}</strong></div><div><span>单场最大亏损</span><strong class="${s.maxSingleLoss===null?'unchanged':netClass(s.maxSingleLoss)}">${s.maxSingleLoss===null?'未参与':signed(s.maxSingleLoss)}</strong></div>`
    +[['最辉煌赛季',s.bestSeason],['最惨淡赛季',s.worstSeason]].map(([label,r])=>`<div><span>${label}</span><strong>${escape(seasonName(r))}</strong><small class="${r?netClass(r.net):'unchanged'}">${r?signed(r.net):'—'}</small></div>`).join('');
  $('result-stop').textContent=s.stopped?'余额不足后已停止新增投入。未参与场次不计入命中率；待结算比赛均已结清。':`${s.wins} 场命中 / ${s.participated} 场参与。跳过的比赛不计入命中率。`;
  $('result-stop').hidden=!s.stopped; // 正常结果已在参与场次和命中率展示；余额不足提示仍保留。
  $('season-results').innerHTML=s.perSeason.map(r=>`<div class="season-item"><strong>${escape(data.seasons.find(x=>x.id===r.seasonId).name)}</strong><p>参与 ${r.participated} 场 · 命中 ${r.wins} 场 · 净收益 ${signed(r.net)}</p><p>总投入 ${coins(r.totalStaked)} · 期末 ${coins(r.final)}</p></div>`).join('');
  $('copy-status').textContent='';window.scrollTo({top:0,behavior:'instant'});
  const trophies=(data.honors??[]).filter(h=>h.champion_id===resultTeam);
  $('honors-result').hidden=!trophies.length;
  $('honors-title').textContent=`真实队史荣誉 · ${trophies.length}冠`;
  $('honors-list').innerHTML=trophies.map(h=>`<div class="season-item"><strong>${escape(h.name)}</strong><p>${escape(h.date)} · ${data.rows.some(r=>r.id===h.final_match_id)?'决赛已接入':h.date<'2020-01-01'?'2020年前荣誉档案':'逐场数据待补'}</p></div>`).join('');
  const archives=s.perSeason.some(x=>x.seasonId==='KIC2022')?(data.metadata.archive??[]).filter(r=>!resultTeam||[r.team_a_id,r.team_b_id].includes(resultTeam)):[];
  $('archive-result').hidden=!archives.length;$('archive-result').open=false;
  $('archive-title').textContent=`2022世冠 BO2 历史档案 · ${archives.length}场（不计分）`;
  $('archive-list').innerHTML=archives.map(r=>`<div class="season-item"><strong>${escape(r.name_a)} ${r.score_a}:${r.score_b} ${escape(r.name_b)}</strong><p>${escape(r.date)} · ${escape(r.group)}组 · ${r.score_a===r.score_b?'平局':'BO2'} · 不参与预测</p></div>`).join('');
}
function render(v){review.remember(v);review.exit();view=v;if(v.phase==='finished')renderResult(v);else renderPlay(v);}
function installPlayback(speed=3){
  playback=new Playback(()=>{motionAllowed=true;const v=playback.speed==='recap'?session.recap():session.advance();playback.phase=v.phase;playback.highlight=Boolean(v.review?.highlight);render(v);return v;},controls);
  playback.speed=speed;$('visibility-note').hidden=true;
}
function start(){
  const next=createCompetitionGame(sourceData,mode,teamId,scope,competitionKind);
  detachSave();stopMotion();playback?.dispose();review.clear();session=next;chosenSide=null;controlsQuote=null;
  completeTracked=false;recapTracked=false;trackCoin('coin-start');
  // 新回放可能拥有相同终点但不同轨迹，清除图表缓存，复用已有节点。
  for(const id of ['live-chart','result-chart'])delete $(id).dataset.series;
  bindRecorder();installPlayback();render(session.advance());flushSave();window.scrollTo({top:0,behavior:'instant'});
  if(mode==='loyal')playback.play();
}
async function resume(){
  if(resuming)return;resuming=true;$('resume-game').disabled=true;
  try{
    const raw=savedRaw(),saved=readCheckpoint(raw);
    if(profile!==saved.context.profile)await activateDataset(saved.context.profile);
    if(!sourceData)throw Error('当前资料未能加载，请重试。');
    const restored=restoreCheckpoint(raw,sourceData.identity,c=>createCompetitionGame(sourceData,c.mode,c.teamId,c.scope,c.competitionKind));
    flushSave();detachSave();stopMotion();playback?.dispose();review.clear();
    mode=restored.context.mode;teamId=restored.context.teamId;scope={...restored.context.scope};
    applyCompetition(restored.context.competitionKind);session=restored.session;
    if(mode==='loyal')loyalCompetitionKind=competitionKind;
    completeTracked=restored.ui.completeTracked;recapTracked=restored.ui.recapTracked;chosenSide=null;controlsQuote=null;
    bindRecorder(restored.actions);installPlayback(restored.ui.speed);render(session.view());flushSave();
    $('save-status').textContent='已恢复进度；回放保持暂停，可按“继续”前进。';
    if(session.phase!=='finished'){$('play-title').setAttribute('tabindex','-1');$('play-title').focus({preventScroll:true});}
  }catch(error){$('resume-panel').hidden=false;$('resume-note').textContent=error.message;}
  finally{resuming=false;$('resume-game').disabled=false;}
}
async function copy(){
  trackCoin('coin-copy');
  const s=view.stats,name=(mode==='loyal'?team(teamId).display_name:`历史操盘｜${scopeLabel()}`)+`｜${competitionLabels[competitionKind]} · ${data.metadata.model_version}`;
  const text=`KPL Coin｜${name}\n${view.firstDate}—${view.lastDate}\n初始 ${coins(s.initial)} → 最终 ${coins(s.final)} 枚\n净收益 ${signed(s.net)}，参与 ${s.participated} 场，命中率 ${s.hitRate===null?'未参与':pct(s.hitRate)}\n最大回撤 ${coins(s.maxDrawdown)}，单场最高 ${s.maxSingleProfit??'未参与'}，最大亏损 ${s.maxSingleLoss??'未参与'}\n纯虚拟计分。模型模拟赔率，并非历史真实盘口。`;
  try{await navigator.clipboard.writeText(text);$('copy-status').textContent='战绩摘要已复制。';}
  catch{$('copy-status').innerHTML='<label for="copy-fallback">剪贴板不可用，请复制下方摘要</label><textarea id="copy-fallback" rows="7"></textarea>';$('copy-fallback').value=text;$('copy-fallback').select();}
}
document.addEventListener('click',async event=>{
  const button=event.target instanceof Element?event.target.closest('button[data-action]'):null;if(!button||button.disabled)return;
  if(button.dataset.action==='reload'){location.reload();return;}
  if(!data)return;
  motionAllowed=event.detail!==0;
  try{switch(button.dataset.action){
    case 'home':stopMotion();playback?.dispose();flushSave();detachSave();session=null;review.clear();renderHome();window.scrollTo({top:0,behavior:'instant'});break;
    case 'resume':await resume();break;
    case 'discard-save':detachSave();try{localStorage.removeItem(CHECKPOINT_KEY);}catch{}renderResume();$('start').focus();break;
    case 'mode':mode=button.dataset.mode;trackCoin('coin-select-mode');applyCompetition(mode==='trader'?'all':loyalCompetitionKind);break;
    case 'team':teamId=button.dataset.team;trackCoin('coin-select-team');renderHome();break;
    case 'start':case 'restart':start();break;
    case 'toggle':stopMotion();exitReview();if(playback.running)playback.pause();else{$('visibility-note').hidden=true;playback.play();}break;
    case 'speed':stopMotion();exitReview();playback.setSpeed(button.dataset.speed==='recap'?'recap':Number(button.dataset.speed));if(playback.speed==='recap'&&!recapTracked){recapTracked=true;trackCoin('coin-recap');}break;
    case 'finish':stopMotion();playback.pause();render(session.finish());break;
    case 'next':moveForward();break;
    case 'back':stopMotion();playback.pause();{const entry=review.previous(view);if(entry)renderReview(entry);}break;
    case 'forward':moveForward();break;
    case 'side':chosenSide=button.dataset.choice;renderTrader(view.quote);break;
    case 'stake':chosenStake=button.dataset.stake;renderTrader(view.quote);break;
    case 'confirm':render(session.choose(chosenSide,chosenStake));break;
    case 'skip':render(session.choose('skip','0.00'));break;
    case 'copy':await copy();break;
  }}catch(error){playback?.pause();showError(error);}
});
document.addEventListener('change',async event=>{
  if(event.target.id==='dataset-choice'){
    if(!sourceData)return;
    try{applyCompetition(event.target.value);loyalCompetitionKind=competitionKind;}catch(error){$('dataset-choice').value=competitionKind;showError(error);}
    return;
  }
  if(!data||!event.target.id.startsWith('challenge-'))return;
  scope={type:$('challenge-type').value,seasonId:$('challenge-season').value,teamId:$('challenge-team').value};renderHome();
  if(event.target.id==='challenge-team')trackCoin('coin-select-team');
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopMotion();if(playback?.running){playback.pause();$('visibility-note').hidden=false;}flushSave();}});
window.addEventListener('pagehide',()=>{stopMotion();playback?.pause();flushSave();});
$('hub-link').hidden=!/^\/coin\/(?:index\.html)?$/.test(location.pathname);
await activateDataset(profile);
