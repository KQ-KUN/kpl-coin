import {initialState,minor,money,place,settle} from '../runtime/ledger.mjs';
import {selectRows,historyIndex,recentForm} from './challenge.mjs';
const signedMinor=value=>value.startsWith('-')?-minor(value.slice(1)):minor(value);

function preview(row) {
  const {id,date,season_id,season_name,team_a_id,team_b_id,name_a,name_b,p_a,p_b,odds_a,odds_b,
    best_of,stage_category,stage_name,quality}=row;
  return {id,date,season_id,season_name,team_a_id,team_b_id,name_a,name_b,p_a,p_b,odds_a,odds_b,
    best_of,stage_category,stage_name,quality};
}

function timeline(rows) {
  const events=rows.map(row=>({type:'match',date:row.date,row}));
  for(const date of new Set(rows.map(r=>r.available_date)))events.push({type:'result',date});
  for(const season of new Set(rows.map(r=>r.season_id))) {
    const subset=rows.filter(r=>r.season_id===season);
    events.push({type:'season',date:subset.map(r=>r.available_date).sort().at(-1),season,
      name:subset[0].season_name});
  }
  const order={result:0,season:1,match:2};
  return events.sort((a,b)=>a.date.localeCompare(b.date)||order[a.type]-order[b.type]
    ||(a.row?.id??a.season??'').localeCompare(b.row?.id??b.season??''));
}

export class Session {
  constructor(dataset,mode='loyal',teamId=null,scope={type:'all'}) {
    if(!['loyal','trader'].includes(mode))throw Error('无效模式');
    if(mode==='loyal'&&!dataset.teams.some(t=>t.id===teamId&&t.match_count>0))throw Error('无历史记录的战队');
    this.mode=mode;this.teamId=teamId;this.scope=mode==='loyal'?{type:'team',teamId}:{...scope};
    this.rows=selectRows(dataset,this.scope);this.history=historyIndex(dataset.rows);
    if(!this.rows.length)throw Error('没有可回放比赛');
    this.events=timeline(this.rows);this.cursor=0;
    this.ledger=initialState();this.initialMinor=this.ledger.cashMinor;
    this.records=[];this.pending=new Map();this.completed=0;
    this.phase='ready';this.current=null;this.lastBatch=[];this.seasonSummary=null;
    this.date=this.rows[0].date;this.stopped=false;this.revision=0;
    this.recapHighlights=0;
    this.peakMinor=this.initialMinor;this.maxDrawdownMinor=0n;this.ddFraction=[0n,1n];
    this.curve=[{date:this.date,assetMinor:this.initialMinor,cashMinor:this.initialMinor,reservedMinor:0n}];
  }
  equity(){return this.ledger.cashMinor+this.ledger.reservedMinor;}
  preview(row){return {...preview(row),form_a:recentForm(this.history,row.team_a_id,row.date),
    form_b:recentForm(this.history,row.team_b_id,row.date)};}
  choose(choice,stake='0.00') {
    if(this.phase!=='preview'||!this.current)throw Error('当前不能重复确认');
    if(this.mode==='trader'&&choice!=='skip'&&!['50.00','100.00','200.00','500.00'].includes(stake))throw Error('请选择允许的投入');
    const row=this.current;
    const requested=this.stopped?{choice:'skip',stake:'0.00'}:{choice,stake};
    const before=this.ledger.cashMinor;
    const result=place(this.ledger,preview(row),requested.choice,requested.stake);
    if(result.receipt.status==='insufficient_balance'&&this.mode==='trader')throw Error('可用硬币不足');
    this.ledger=result.state;
    const status=this.stopped?'stopped':result.receipt.status;
    const record={row,choice:requested.choice,status,stakeMinor:result.receipt.stakeMinor,
      cashBefore:before,cashAfter:this.ledger.cashMinor,resolved:false,netMinor:0n,grossMinor:0n,won:null};
    this.records.push(record);
    if(result.receipt.status==='insufficient_balance'&&this.mode==='loyal')this.stopped=true;
    this.pending.set(row.available_date,[...(this.pending.get(row.available_date)??[]),record]);
    this.phase='recorded';this.revision++;
    return this.view();
  }
  release(date) {
    const records=this.pending.get(date)??[];
    if(!records.length)return false;
    this.pending.delete(date);
    const placed=records.some(r=>r.status==='placed');
    const before=this.equity();
    for(const record of records.sort((a,b)=>a.row.id.localeCompare(b.row.id))) {
      if(record.status==='placed') {
        const result=settle(this.ledger,record.row.id,record.row.winner_id);
        this.ledger=result.state;
        record.netMinor=result.receipt.netMinor;record.grossMinor=result.receipt.grossReturnMinor;
        record.won=result.receipt.won;
      }
      record.resolved=true;record.batch=date;this.completed++;
    }
    const after=this.equity();
    if(placed) {
      if(after>this.peakMinor)this.peakMinor=after;
      const dd=this.peakMinor-after;
      if(dd>this.maxDrawdownMinor)this.maxDrawdownMinor=dd;
      if(this.peakMinor&&dd*this.ddFraction[1]>this.ddFraction[0]*this.peakMinor)this.ddFraction=[dd,this.peakMinor];
      this.curve.push({date,assetMinor:after,cashMinor:this.ledger.cashMinor,reservedMinor:this.ledger.reservedMinor});
    }
    this.lastBatch=records.map(r=>({...preview(r.row),score_a:r.row.score_a,score_b:r.row.score_b,
      winner_id:r.row.winner_id,status:r.status,choice:r.choice,won:r.won,stake:money(r.stakeMinor),
      net:money(r.netMinor),batch:date,assetBefore:money(before),assetAfter:money(after)}));
    this.phase='result';return true;
  }
  advance() {
    if(this.phase==='finished')return this.view();
    if(this.phase==='preview') {
      if(this.mode==='trader')throw Error('请先确认选择或跳过');
      return this.choose(this.current.team_a_id===this.teamId?'a':'b','100.00');
    }
    while(this.cursor<this.events.length) {
      const event=this.events[this.cursor++];this.date=event.date;this.revision++;
      if(event.type==='match') {this.current=event.row;this.phase='preview';return this.view();}
      if(event.type==='result'&&this.release(event.date))return this.view();
      if(event.type==='season') {
        const s=this.statistics().perSeason.find(s=>s.seasonId===event.season);
        this.seasonSummary={...s,name:event.name};this.phase='season';return this.view();
      }
    }
    if(this.ledger.reservedMinor!==0n||Object.keys(this.ledger.positions).length)throw Error('结束时仍有未结算投入');
    this.phase='finished';this.current=null;this.revision++;return this.view();
  }
  finish() {
    let guard=this.events.length*3+10;
    this.bulk=true;
    try {while(this.phase!=='finished'&&guard-->0) {
      if(this.phase==='preview'&&this.mode==='trader')this.choose('skip','0.00');else this.advance();
    }} finally {this.bulk=false;}
    if(this.phase!=='finished')throw Error('回放未能终止');
    return this.view();
  }
  // 每帧推进多个原有状态转换；bulk 只省去中间 view/DOM，不跳过 place 或 settle。
  recap() {
    if(this.mode!=='loyal')throw Error('极速回顾仅用于死忠模式');
    const budget=Math.ceil((this.events.length+this.rows.length+1)/72);
    const results=[];let season=null,highlight=null;
    this.bulk=true;
    try {for(let i=0;i<budget&&this.phase!=='finished';i++) {
      this.advance();
      if(this.phase==='season')season=this.seasonSummary;
      if(this.phase==='result') {
        results.push(...this.lastBatch);
        const final=this.lastBatch.find(r=>r.stage_category==='grand_final');
        const decline=this.lastBatch.reduce((n,r)=>n+signedMinor(r.net),0n)<=-20000n;
        let run=0;for(const r of this.records.filter(r=>r.resolved&&r.status==='placed').reverse()){if(!r.won)break;run++;}
        const reason=final?'总决赛揭晓':decline?'日期批资产回落':run>=8&&run%8===0?`${run} 场连续命中`:null;
        if(reason&&this.recapHighlights<8){highlight=reason;this.recapHighlights++;break;}
      }
    }} finally {this.bulk=false;}
    const view=this.view();
    if(view.phase==='finished')return view;
    return {...view,phase:'recap',quote:null,decision:null,results,
      review:{highlight,season,seasonName:this.current?.season_name??season?.name??'',
        net:money(results.reduce((n,r)=>n+signedMinor(r.net),0n))}};
  }
  statistics() {
    const played=this.records.filter(r=>r.status==='placed');
    const resolved=played.filter(r=>r.resolved);
    const wins=resolved.filter(r=>r.won).length;
    let winRun=0,lossRun=0,longestWin=0,longestLoss=0;
    for(const r of resolved) {
      winRun=r.won?winRun+1:0;lossRun=r.won?0:lossRun+1;
      longestWin=Math.max(longestWin,winRun);longestLoss=Math.max(longestLoss,lossRun);
    }
    let rolling=this.initialMinor;
    const perSeason=[];
    for(const seasonId of new Set(this.records.map(r=>r.row.season_id))) {
      const all=this.records.filter(r=>r.row.season_id===seasonId);
      const selected=all.filter(r=>r.status==='placed');
      const done=selected.filter(r=>r.resolved);
      const net=done.reduce((sum,r)=>sum+r.netMinor,0n);
      perSeason.push({seasonId,opening:money(rolling),final:money(rolling+net),net:money(net),
        totalStaked:money(selected.reduce((sum,r)=>sum+r.stakeMinor,0n)),eligible:all.length,
        participated:selected.length,wins:done.filter(r=>r.won).length,resolved:done.length});
      rolling+=net;
    }
    const profit=resolved.reduce((best,r)=>!best||r.netMinor>best.netMinor?r:best,null);
    const loss=resolved.reduce((best,r)=>!best||r.netMinor<best.netMinor?r:best,null);
    const seasons=perSeason.filter(s=>s.resolved>0);
    const bestSeason=seasons.reduce((best,s)=>!best||signedMinor(s.net)>signedMinor(best.net)?s:best,null);
    const worstSeason=seasons.reduce((best,s)=>!best||signedMinor(s.net)<signedMinor(best.net)?s:best,null);
    return {maxSingleProfit:profit?money(profit.netMinor>0n?profit.netMinor:0n):null,
      maxSingleLoss:loss?money(loss.netMinor<0n?loss.netMinor:0n):null,
      maxProfitMatchId:profit&&profit.netMinor>0n?profit.row.id:null,maxLossMatchId:loss&&loss.netMinor<0n?loss.row.id:null,
      bestSeason,worstSeason,initial:money(this.initialMinor),final:money(this.equity()),cash:money(this.ledger.cashMinor),
      reserved:money(this.ledger.reservedMinor),net:money(this.equity()-this.initialMinor),
      totalStaked:money(played.reduce((sum,r)=>sum+r.stakeMinor,0n)),participated:played.length,
      resolved:resolved.length,wins,hitRate:resolved.length?wins/resolved.length:null,
      highest:money(this.peakMinor),maxDrawdown:money(this.maxDrawdownMinor),
      maxDrawdownFraction:Number(this.ddFraction[0])/Number(this.ddFraction[1]),
      longestWin,longestLoss,eligible:this.rows.length,completed:this.completed,
      stopped:this.stopped,perSeason};
  }
  view() {
    if(this.bulk)return {phase:this.phase};
    return {phase:this.phase,mode:this.mode,teamId:this.teamId,date:this.date,
      quote:this.phase==='preview'?this.preview(this.current):null,
      decision:this.phase==='recorded'?{...this.preview(this.current),status:this.records.at(-1).status,
        choice:this.records.at(-1).choice,stake:money(this.records.at(-1).stakeMinor),available_date:this.current.available_date}:null,
      results:this.phase==='result'?this.lastBatch:[],season:this.phase==='season'?this.seasonSummary:null,
      stats:this.statistics(),curve:this.curve,revision:this.revision,
      scope:this.scope,firstDate:this.rows[0].date,lastDate:this.rows.at(-1).date};
  }
}

// 唯一计时器，generation抵消已经入队的旧回调，切页/重启/隐藏均可取消。
export class Playback {
  constructor(step,notify=()=>{},clock={set:(fn,delay)=>setTimeout(fn,delay),clear:id=>clearTimeout(id)}) {
    this.step=step;this.notify=notify;this.clock=clock;this.timer=null;this.running=false;this.speed=1;this.generation=0;
  }
  delay(phase) {if(this.speed==='recap')return this.highlight?280:160;return phase==='season'?Math.max(120,700/this.speed):Math.max(35,500/this.speed);}
  play() {if(this.running)return;this.running=true;this.generation++;this.schedule();this.notify();}
  schedule() {
    const generation=this.generation;
    this.timer=this.clock.set(()=>{
      if(!this.running||generation!==this.generation)return;
      this.timer=null;
      const view=this.step();
      if(view.phase==='finished'){this.pause();return;}
      if(this.running&&generation===this.generation)this.schedule();
    },this.delay(this.phase??'preview'));
  }
  pause() {this.running=false;this.generation++;if(this.timer!==null)this.clock.clear(this.timer);this.timer=null;this.notify();}
  setSpeed(speed) {if(![1,3,10,'recap'].includes(speed))throw Error('无效速度');const was=this.running;this.pause();this.speed=speed;this.highlight=false;if(was)this.play();}
  dispose(){this.pause();}
}
