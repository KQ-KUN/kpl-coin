import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decode} from '../src/data.mjs';
import {InteractiveTrader} from '../src/interactive.mjs';
import {initialState,place,settle,money} from '../runtime/ledger.mjs';
const data=decode(JSON.parse(readFileSync(new URL('../data/coin-ui-v1.json',import.meta.url))));

test('interactive preview hides winner/scores, confirmation reveals exactly that match and settles once',()=>{
  const s=new InteractiveTrader(data);const before=s.advance(),row=s.current;
  assert.equal(before.quote.score_a,undefined);assert.equal(before.quote.winner_id,undefined);
  const r=s.choose('a','100.00');assert.equal(r.phase,'result');assert.equal(r.results.length,1);
  assert.equal(r.results[0].id,row.id);assert.equal(r.results[0].score_a,row.score_a);
  assert.equal(r.stats.reserved,'0.00');assert.equal(r.stats.completed,1);
  const canonical=settle(place(initialState(),row,'a','100.00').state,row.id,row.winner_id);
  assert.equal(r.stats.final,money(canonical.state.cashMinor));assert.equal(r.results[0].net,money(canonical.receipt.netMinor));
  const balance=s.ledger.cashMinor;assert.throws(()=>s.choose('a','100.00'),/重复/);assert.equal(s.ledger.cashMinor,balance);
  const next=s.advance();assert.equal(next.phase,'preview');assert.equal(next.quote.id,s.rows[1].id);
});

test('interactive win/loss/skip and insufficient balance use original ledger with no extra confirmation phase',()=>{
  const s=new InteractiveTrader(data);s.advance();
  s.choose(s.current.winner_id===s.current.team_a_id?'a':'b','100.00');assert.equal(s.lastBatch[0].won,true);
  s.advance();s.choose(s.current.winner_id===s.current.team_a_id?'b':'a','100.00');assert.equal(s.lastBatch[0].net,'-100.00');
  s.advance();const cash=s.ledger.cashMinor;s.choose('skip');assert.equal(s.ledger.cashMinor,cash);
  assert.equal(s.statistics().participated,2);assert.equal(s.statistics().completed,3);
  assert.equal(s.statistics().highest,'10090.48');assert.equal(s.statistics().maxDrawdown,'100.00');
  assert.equal(s.statistics().maxSingleProfit,'90.48');assert.equal(s.statistics().maxSingleLoss,'-100.00');
  assert.equal(s.statistics().perSeason[0].net,'-9.52');assert.equal(s.statistics().hitRate,.5);
  s.advance();s.ledger.cashMinor=4999n;
  assert.throws(()=>s.choose('a','50.00'),/不足/);assert.equal(s.phase,'preview');assert.equal(s.ledger.cashMinor,4999n);
  assert.equal(s.choose('skip').results[0].status,'skipped');
});

test('interactive complete 1989-match run equals independent canonical ledger and preserves chronological curve',()=>{
  const s=new InteractiveTrader(data);let v=s.advance(),reference=initialState(),index=0,net=0n;
  while(v.phase!=='finished'){
    assert.equal(v.phase,'preview');const row=s.current,choice=index++%3===0?'skip':index%2?'a':'b';
    const stake=choice==='skip'?'0.00':'50.00';
    const p=place(reference,row,choice,stake);
    if(choice==='skip')reference=p.state;
    else{const r=settle(p.state,row.id,row.winner_id);reference=r.state;net+=r.receipt.netMinor;}
    v=s.choose(choice,stake);assert.equal(v.results.length,1);assert.equal(s.ledger.cashMinor,reference.cashMinor);
    assert.equal(s.ledger.reservedMinor,0n);v=s.advance();
  }
  assert.equal(index,1989);assert.equal(v.stats.final,money(reference.cashMinor));assert.equal(v.stats.net,money(net));
  assert.equal(s.ledger.settledIds.length,new Set(s.ledger.settledIds).size);
  assert.ok(v.curve.every((p,i)=>!i||p.date>=v.curve[i-1].date));
  assert.equal(v.stats.perSeason.reduce((n,r)=>n+BigInt(r.totalStaked.replace('.','')),0n),BigInt(v.stats.totalStaked.replace('.','')));
});

test('interactive finish and restart never invent participation or duplicate settlement',()=>{
  for(let i=0;i<3;i++){
    const s=new InteractiveTrader(data);s.advance();s.choose('a','100.00');const first=s.ledger.cashMinor;
    const v=s.finish();assert.equal(v.stats.participated,1);assert.equal(s.ledger.cashMinor,first);
    assert.equal(s.finish().stats.final,v.stats.final);assert.equal(s.ledger.settledIds.length,1);
  }
});
