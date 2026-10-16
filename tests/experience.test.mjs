import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decode} from '../src/data.mjs';
import {Session,Playback} from '../src/engine.mjs';
import {selectRows,historyIndex,recentForm} from '../src/challenge.mjs';
import {minor,money} from '../runtime/ledger.mjs';
const data=decode(JSON.parse(readFileSync(new URL('../data/coin-ui-v1.json',import.meta.url))));
const ag='smoba:10027';
const signedMinor=value=>value.startsWith('-')?-minor(value.slice(1)):minor(value);

test('recap all 27 teams equals ordinary replay in every record, cash, date curve and statistics',()=>{
  for(const t of data.teams){const a=new Session(data,'loyal',t.id),b=new Session(data,'loyal',t.id);a.finish();
    let guard=200;while(b.phase!=='finished'&&guard-->0)b.recap();assert.equal(b.phase,'finished');
    assert.deepEqual(b.records,a.records);assert.deepEqual(b.curve,a.curve);assert.deepEqual(b.statistics(),a.statistics());
    assert.deepEqual(b.ledger,a.ledger);assert.ok(b.recapHighlights<=8);
  }
});
test('interrupted recap, arbitrary ordinary speed switches, finish and repeat finish cannot double settle',()=>{
  const s=new Session(data,'loyal',ag),ref=new Session(data,'loyal',ag);ref.finish();
  for(let i=0;i<10;i++){s.recap();s.advance();}
  s.finish();s.recap();s.finish();assert.deepEqual(s.ledger,ref.ledger);assert.deepEqual(s.curve,ref.curve);
});
test('all four scopes are exact filters of immutable original rows, all season/team pairs verified',()=>{
  assert.equal(selectRows(data,{type:'all'}).length,1989);
  for(const season of data.seasons){
    assert.deepEqual(selectRows(data,{type:'season',seasonId:season.id}),data.rows.filter(r=>r.season_id===season.id));
    for(const t of data.teams)assert.deepEqual(selectRows(data,{type:'season_team',seasonId:season.id,teamId:t.id}),
      data.rows.filter(r=>r.season_id===season.id&&[r.team_a_id,r.team_b_id].includes(t.id)));
  }
  for(const t of data.teams)assert.equal(selectRows(data,{type:'team',teamId:t.id}).length,t.match_count);
  assert.throws(()=>selectRows(data,{type:'season',seasonId:'future'}));assert.throws(()=>selectRows(data,{type:'team',teamId:'10101'}));
});
test('every selectable season/team challenge settles win loss skip with canonical ledger, exact expected profit',()=>{
  for(const season of data.seasons)for(const t of data.teams){const scope={type:'season_team',seasonId:season.id,teamId:t.id};
    if(!selectRows(data,scope).length)continue;
    const s=new Session(data,'trader',null,scope);let i=0,expected=0n,guard=1000;
    while(s.phase!=='finished'&&guard-->0){s.advance();if(s.phase==='preview'){
      const r=s.current,cycle=i++%3,side=cycle===0?(r.winner_id===r.team_a_id?'a':'b'):cycle===1?(r.winner_id===r.team_a_id?'b':'a'):'skip';
      s.choose(side,side==='skip'?'0.00':'100.00');
    }}
    for(const r of s.records)expected+=r.netMinor;
    assert.equal(s.statistics().final,money(1000000n+expected));assert.equal(s.completed,s.rows.length);
    assert.equal(s.ledger.reservedMinor,0n);assert.equal(new Set(s.ledger.settledIds).size,s.ledger.settledIds.length);
  }
});
test('all previews recent-five use strictly prior known results from full history, including excluded challenge seasons',()=>{
  const index=historyIndex(data.rows);
  for(const r of data.rows)for(const id of [r.team_a_id,r.team_b_id]){
    const actual=recentForm(index,id,r.date);
    const expected=data.rows.filter(x=>[x.team_a_id,x.team_b_id].includes(id)&&x.available_date<r.date)
      .slice(-5).map(x=>({date:x.date,available_date:x.available_date,result:x.winner_id===id?'W':'L'}));
    assert.deepEqual(actual,expected);assert.ok(actual.every(x=>x.available_date<r.date));
  }
  const scope={type:'season_team',seasonId:data.seasons.at(-1).id,teamId:ag};
  const s=new Session(data,'trader',null,scope);const q=s.advance().quote;
  assert.ok(q.form_a.length||q.form_b.length);assert.ok((q.form_a.concat(q.form_b)).some(x=>x.date<q.date));
  assert.ok(!JSON.stringify(q).includes('winner_id'));
});
test('future changes and same-day result changes cannot affect prior-form preview',()=>{
  const r=data.rows[100],index=historyIndex(data.rows);
  const changed=data.rows.map(x=>x.available_date>=r.date?{...x,winner_id:x.winner_id===x.team_a_id?x.team_b_id:x.team_a_id}:x);
  for(const id of [r.team_a_id,r.team_b_id])assert.deepEqual(recentForm(index,id,r.date),recentForm(historyIndex(changed),id,r.date));
});
test('new extrema and best/worst seasons independently equal B frozen rows, no participants => null',()=>{
  for(const [slug,id]of [['AG',ag],['Wolves','smoba:10001'],['eStar','smoba:10006']]){
    const ref=JSON.parse(readFileSync(new URL(`fixtures/loyal-${slug}.json`,import.meta.url)));
    const s=new Session(data,'loyal',id).finish().stats;
    const nets=ref.per_match.map(r=>signedMinor(r.net_profit));
    assert.equal(s.maxSingleProfit,money(nets.reduce((a,b)=>a>b?a:b,0n)));
    assert.equal(s.maxSingleLoss,money(nets.reduce((a,b)=>a<b?a:b,0n)));
    const seasons=ref.per_season.filter(r=>r.participated>0);
    const sorted=[...seasons].sort((a,b)=>signedMinor(a.net_profit)>signedMinor(b.net_profit)?-1:signedMinor(a.net_profit)<signedMinor(b.net_profit)?1:0);
    assert.equal(s.bestSeason.net,sorted[0].net_profit);assert.equal(s.worstSeason.net,sorted.at(-1).net_profit);
  }
  const s=new Session(data,'trader');s.finish();assert.equal(s.statistics().maxSingleProfit,null);assert.equal(s.statistics().bestSeason,null);
});
test('recap clock estimates 10-20 seconds for featured teams; rapid switches and stale callbacks cancel safely',()=>{
  for(const id of [ag,'smoba:10001','smoba:10006']){
    let ms=0,next=0;const tasks=new Map();const s=new Session(data,'loyal',id);
    const clock={set(fn,delay){tasks.set(++next,{fn,delay});return next;},clear(id){tasks.delete(id);}};
    const p=new Playback(()=>{const v=s.recap();p.highlight=Boolean(v.review?.highlight);return v;},()=>{},clock);p.speed='recap';p.play();
    while(tasks.size){const [id,t]=tasks.entries().next().value;tasks.delete(id);ms+=t.delay;t.fn();}
    assert.ok(ms>=10000&&ms<=20000,`${id} ${ms}ms`);assert.equal(s.phase,'finished');
    p.play();const old=tasks.values().next().value.fn;for(let i=0;i<50;i++)p.setSpeed([1,3,10,'recap'][i%4]);
    p.dispose();old();assert.equal(tasks.size,0);
  }
});
test('a queued stale callback cannot erase the new timer handle before pause',()=>{
  let next=0,steps=0;const tasks=new Map();
  const clock={set(fn){tasks.set(++next,fn);return next;},clear(id){tasks.delete(id);}};
  const p=new Playback(()=>{steps++;return{phase:'preview'};},()=>{},clock);
  p.play();const stale=tasks.values().next().value;p.setSpeed('recap');stale();p.pause();
  assert.equal(tasks.size,0);assert.equal(steps,0);
});
test('worst/best ties select earliest participated season, all skipped seasons excluded',()=>{
  const s=new Session(data,'trader');s.finish();
  const seasons=new Set();
  for(const r of s.records)if(!seasons.has(r.row.season_id)&&seasons.size<2){
    seasons.add(r.row.season_id);r.status='placed';r.stakeMinor=10000n;r.netMinor=100n;r.won=true;
  }
  const stats=s.statistics();assert.equal(stats.bestSeason.seasonId,[...seasons][0]);assert.equal(stats.worstSeason.seasonId,[...seasons][0]);
});
test('ten complete full-history trader runs preserve conservation and unique settlement under fixed mixed choices',()=>{
  for(let run=0;run<10;run++){
    const s=new Session(data,'trader');s.bulk=true;let i=0,guard=s.events.length*3+10;
    while(s.phase!=='finished'&&guard-->0){
      s.advance();if(s.phase==='preview'){
        const amounts=['50.00','100.00','200.00','500.00'];const stake=amounts[(i+run)%4];
        const choice=i++%7===0||minor(stake)>s.ledger.cashMinor?'skip':(i+run)%2?'a':'b';
        s.choose(choice,choice==='skip'?'0.00':stake);
      }
    }
    s.bulk=false;assert.equal(s.phase,'finished');assert.equal(s.completed,1989);assert.equal(s.ledger.reservedMinor,0n);
    assert.ok(s.ledger.cashMinor>=0n);const net=s.records.reduce((n,r)=>n+r.netMinor,0n);
    assert.equal(s.statistics().final,money(1000000n+net));assert.equal(new Set(s.ledger.settledIds).size,s.ledger.settledIds.length);
    const before=s.statistics();s.finish();assert.deepEqual(s.statistics(),before);
  }
});
