import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {decodeOfficial} from '../src/official-data.mjs';import {Session} from '../src/engine.mjs';
import {InteractiveTrader} from '../src/interactive.mjs';import {selectRows} from '../src/challenge.mjs';
const raw=JSON.parse(readFileSync(new URL('../data/coin-official-v2.1.json',import.meta.url))),data=decodeOfficial(raw);
test('KIC2022 formal schema separates 82 binary matches and 48 BO2 archives',()=>{
 assert.equal(data.rows.length,2631);assert.equal(data.rows.filter(r=>r.season_id==='KIC2022').length,82);assert.equal(data.metadata.archive.length,48);
 for(const mutate of [r=>r.archive[0].odds_a='1.500000000000',r=>r.archive[0].score_a=3,r=>r.matches[0][12]=2,r=>r.archive.pop()]){
  const d=structuredClone(raw);mutate(d);assert.throws(()=>decodeOfficial(d));
 }
});
test('KIC2022 filters real qualifiers/knockout series and never count archived BO2',()=>{
 assert.equal(selectRows(data,{type:'season',seasonId:'KIC2022'}).length,82);
 assert.equal(selectRows(data,{type:'season_team',seasonId:'KIC2022',teamId:'smoba:10027'}).length,10);
 assert.equal(selectRows(data,{type:'season_team',seasonId:'KIC2022',teamId:'smoba:10006'}).length,3);
 assert.equal(data.metadata.archive.filter(r=>[r.team_a_id,r.team_b_id].includes('smoba:10006')).length,6);
});
test('all 112 entities canonical replay, no trophy/BO2 reward, no double settlement',()=>{
 for(const t of data.teams){const s=new Session(data,'loyal',t.id),v=s.finish();assert.equal(v.stats.eligible,t.match_count);
  assert.equal(s.ledger.reservedMinor,0n);assert.equal(new Set(s.ledger.settledIds).size,s.ledger.settledIds.length);
  assert.equal(s.ledger.cashMinor,1000000n+s.records.reduce((n,r)=>n+r.netMinor,0n));
  assert.ok(s.ledger.settledIds.every(id=>!raw.archive.some(r=>r.id===id)));
 }
});
test('KIC2022 final win loss skip resolve accurately without preview answer',()=>{
 const r=data.rows.find(r=>r.id==='tga:KIC2022:KIC2022M7W2D1');assert.equal(r.score_a,4);assert.equal(r.score_b,2);
 const outcomes=[];
 for(const side of ['a','b','skip']){const s=new InteractiveTrader({...data,rows:[r]});const preview=s.advance();assert.equal(preview.quote.winner_id,undefined);assert.equal(preview.quote.score_a,undefined);
  const v=s.choose(side,side==='skip'?'0.00':'100.00');outcomes.push(v.stats.final);assert.equal(s.ledger.reservedMinor,0n);
 }
 assert.ok(Number(outcomes[0])>10000);assert.equal(outcomes[1],'9900.00');assert.equal(outcomes[2],'10000.00');
});
test('KIC2022 full selected challenge win loss skip conserves per-season ledger',()=>{
 const s=new InteractiveTrader(data,null,{type:'season',seasonId:'KIC2022'});let v=s.advance(),count=0;
 while(v.phase!=='finished'){s.choose(count%3===0?'skip':count%2?'a':'b',count%3===0?'0.00':'100.00');count++;v=s.advance();}
 assert.equal(count,82);assert.equal(v.stats.eligible,82);assert.equal(v.stats.participated,54);assert.equal(v.stats.perSeason.length,1);assert.equal(v.stats.perSeason[0].net,v.stats.net);
});
