import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {decodeOfficial} from '../src/official-data.mjs';import {Session} from '../src/engine.mjs';
import {InteractiveTrader} from '../src/interactive.mjs';import {initialState,place,settle,money} from '../runtime/ledger.mjs';
const raw=JSON.parse(readFileSync(new URL('../data/coin-official-v2.json',import.meta.url))),data=decodeOfficial(raw);
test('official extension strict schema accepts BO1/3/9, rejects BO2, quarantine, unsafe icons and false winners',()=>{
  assert.equal(data.rows.length,2549);assert.equal(data.honors.length,40);
  assert.deepEqual([...new Set(data.rows.map(r=>r.best_of))].sort(),[1,3,5,7,9]);
  for(const change of [r=>r.matches[0][12]=2,r=>r.matches[0][9]=999,r=>r.teams[0].icon='https://elsewhere/logo.png',r=>r.matches[0][0]='smoba:20200001:2020050601']){
    const altered=structuredClone(raw);change(altered);assert.throws(()=>decodeOfficial(altered));
  }
});
test('all extended entities full faithful replay conserves ledger, and trophies never add rewards',()=>{
  for(const t of data.teams){const s=new Session(data,'loyal',t.id);const v=s.finish();assert.equal(v.stats.eligible,t.match_count);
    assert.equal(s.ledger.reservedMinor,0n);assert.equal(s.ledger.settledIds.length,new Set(s.ledger.settledIds).size);
    const net=s.records.reduce((n,r)=>n+r.netMinor,0n);assert.equal(s.ledger.cashMinor,1000000n+net);
  }
});
test('2026 cup BO9 final resolves Wolves championship and uses the canonical payout',()=>{
  const r=data.rows.find(r=>r.id==='smoba:20260002:2026052301');assert.equal(r.best_of,9);assert.equal(r.score_b,5);
  const d={...data,rows:[r]},s=new InteractiveTrader(d,null,{type:'all'});const preview=s.advance();
  assert.equal(preview.quote.winner_id,undefined);const result=s.choose('b','100.00');
  const expected=settle(place(initialState(),r,'b','100.00').state,r.id,r.winner_id);
  assert.equal(result.stats.final,money(expected.state.cashMinor));
  const trophy=data.honors.find(h=>h.final_match_id===r.id);assert.equal(trophy.champion_id,'smoba:10001');
});
test('expanded canonical win loss skip full history decisions never leave pending balance',()=>{
  const s=new InteractiveTrader(data);let v=s.advance(),count=0;
  while(v.phase!=='finished'){
    const stake=s.ledger.cashMinor>=5000n?'50.00':'0.00';
    s.choose(stake==='0.00'||count%3===0?'skip':count%2?'a':'b',stake==='0.00'||count%3===0?'0.00':stake);count++;v=s.advance();
  }
  assert.equal(count,2549);assert.equal(s.ledger.reservedMinor,0n);assert.ok(s.ledger.cashMinor>=0n);
});
