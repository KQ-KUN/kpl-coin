import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {decode} from '../src/data.mjs';
import {Session,Playback} from '../src/engine.mjs';
import {money} from '../runtime/ledger.mjs';

const data=JSON.parse(readFileSync(new URL('../data/coin-ui-v1.json',import.meta.url)));
const dataset=decode(data);
function reference(slug){return JSON.parse(readFileSync(new URL(`fixtures/loyal-${slug}.json`,import.meta.url)));}

for(const [slug,tid]of [['AG','smoba:10027'],['Wolves','smoba:10001'],['eStar','smoba:10006']]){
  test(`${slug} full replay exactly matches B money, risk, streaks, every settlement and seasons`,()=>{
    const session=new Session(dataset,'loyal',tid);const expected=reference(slug);const result=session.finish();const s=result.stats;
    assert.equal(s.final,expected.final_coins);assert.equal(s.net,expected.net_profit);assert.equal(s.totalStaked,expected.total_staked);
    assert.equal(s.participated,expected.participated);assert.equal(s.wins,expected.wins);
    assert.equal(s.highest,expected.highest_assets);assert.equal(s.maxDrawdown,expected.max_drawdown);
    assert.equal(s.longestWin,expected.longest_win_streak);assert.equal(s.longestLoss,expected.longest_loss_streak);
    assert.equal(s.maxDrawdownFraction,Number(expected.max_drawdown_fraction));
    for(const r of session.records){const e=expected.per_match.find(x=>x.match_id===r.row.id);
      assert.equal(money(r.netMinor),e.net_profit);assert.equal(money(r.cashAfter),e.cash_after_placement);
      assert.equal(r.won,e.won);assert.equal(r.batch,e.settled_batch);
    }
    assert.deepEqual(s.perSeason.map(r=>[r.seasonId,r.opening,r.final,r.totalStaked,r.net,r.participated,r.wins]),
      expected.per_season.map(r=>[r.season_id,r.opening_coins,r.final_coins,r.total_staked,r.net_profit,r.participated,r.wins]));
    assert.deepEqual(result.curve.slice(1).map(p=>[p.date,money(p.assetMinor),money(p.cashMinor),money(p.reservedMinor)]),
      expected.asset_curve.map(p=>[p.date,p.asset,p.cash,p.reserved]));
    assert.equal(session.ledger.settledIds.length,expected.participated);
  });
}
test('loyal replay for all 27 valid entities finishes, never mixes reused provider identity',()=>{
  for(const t of dataset.teams){const s=new Session(dataset,'loyal',t.id);const v=s.finish();
    assert.equal(v.phase,'finished');assert.equal(v.stats.eligible,t.match_count);assert.ok(s.ledger.cashMinor>=0n);
    assert.ok(s.records.every(r=>[r.row.team_a_id,r.row.team_b_id].includes(t.id)));
  }
});
test('preview and recorded public view cannot expose score or winner',()=>{
  const s=new Session(dataset,'trader');let v=s.advance();
  for(const key of ['winner_id','score_a','score_b'])assert.ok(!Object.hasOwn(v.quote,key));
  v=s.choose('a','100.00');for(const key of ['winner_id','score_a','score_b'])assert.ok(!Object.hasOwn(v.decision,key));
  assert.equal(v.results.length,0);
});
test('date batches reserve same-day stakes before any result, reveal only at availability',()=>{
  const s=new Session(dataset,'trader');const a=s.advance().quote;s.choose('a','100.00');
  const b=s.advance().quote;assert.equal(a.date,b.date);assert.equal(s.ledger.reservedMinor,10000n);assert.equal(s.ledger.cashMinor,990000n);
  s.choose('b','100.00');const v=s.advance();assert.equal(v.phase,'result');
  assert.ok(v.results.every(r=>r.batch>a.date));assert.equal(s.ledger.reservedMinor,0n);
});
test('trader win, loss, skip, fixed permitted stakes and total money are correct',()=>{
  const s=new Session(dataset,'trader');s.advance();s.choose('a','100.00');s.advance();s.choose('b','100.00');
  const results=s.advance().results;assert.equal(results[0].won,true);assert.equal(results[0].net,'90.48');
  assert.equal(results[1].won,false);assert.equal(results[1].net,'-100.00');
  s.finish();assert.equal(s.statistics().final,'9990.48');assert.equal(s.statistics().participated,2);assert.equal(s.statistics().hitRate,.5);
  assert.equal(s.ledger.settledIds.length,2);
});
test('trader balance limits reject before mutating state; skip remains available',()=>{
  const s=new Session(dataset,'trader');s.advance();s.ledger.cashMinor=4999n;
  assert.throws(()=>s.choose('a','50.00'),/不足/);assert.equal(s.records.length,0);assert.equal(s.phase,'preview');
  assert.throws(()=>s.choose('a','75.00'),/允许/);s.choose('skip','0.00');assert.equal(s.records[0].stakeMinor,0n);
});
test('duplicate confirm, repeat finish and arbitrary restarts cannot double settle',()=>{
  const s=new Session(dataset,'loyal','smoba:10027');s.advance();s.advance();assert.throws(()=>s.choose('a','100.00'));
  const first=s.finish().stats;assert.deepEqual(s.finish().stats,first);
  for(let i=0;i<10;i++)assert.deepEqual(new Session(dataset,'loyal','smoba:10027').finish().stats,first);
});
test('loyal insufficient cash permanently stops new stakes, pending positions still settle',()=>{
  const s=new Session(dataset,'loyal','smoba:10027');s.ledger.cashMinor=9999n;s.initialMinor=9999n;s.peakMinor=9999n;
  const v=s.finish();assert.equal(v.stats.participated,0);assert.equal(v.stats.stopped,true);assert.equal(v.stats.final,'99.99');
});
test('exact vendored ledger matches sole B implementation',()=>{
  const a=readFileSync(new URL('../runtime/ledger.mjs',import.meta.url));
  const manifest=JSON.parse(readFileSync(new URL('../data/assets-manifest.json',import.meta.url)));
  assert.equal(createHash('sha256').update(a).digest('hex'),manifest.canonical_ledger_sha256);
  const fixtures=JSON.parse(readFileSync(new URL('fixtures/manifest.json',import.meta.url)));
  for(const [name,hash]of Object.entries(fixtures.files))assert.equal(createHash('sha256').update(readFileSync(new URL('fixtures/'+name,import.meta.url))).digest('hex'),hash);
});
test('runtime rejects quarantine, false winner, bad score and unknown schema',()=>{
  for(const fn of [d=>d.schema_version='coin-runtime-1.1-proposal',d=>d.matches[0][0]='smoba:20200001:2020050601',
    d=>d.matches[0][10]=2,d=>d.matches[0][9]=d.matches[0][5],d=>d.matches[0][6]='1.000000000000']){
    const d=structuredClone(data);fn(d);assert.throws(()=>decode(d));
  }
});
test('runtime every score, BO, stage and historical name matches verified A',()=>{
  const fields=JSON.parse(readFileSync(new URL('fixtures/a-match-fields.json',import.meta.url)));
  for(const r of dataset.rows)assert.deepEqual([r.score_a,r.score_b,r.best_of,r.stage_category,r.stage_name,r.quality,r.name_a,r.name_b],fields[r.id]);
  assert.ok(readFileSync(new URL('../data/coin-ui-v1.json',import.meta.url)).length<512*1024);
});
function fakeClock(){let next=0;const tasks=new Map();return {tasks,set(fn,delay){const id=++next;tasks.set(id,{fn,delay});return id;},clear(id){tasks.delete(id);},tick(){const [id,t]=tasks.entries().next().value;tasks.delete(id);t.fn();}};}
test('playback has exactly one timer and pause, speed, dispose invalidate queued callbacks',()=>{
  const clock=fakeClock();let steps=0;const p=new Playback(()=>{steps++;return{phase:'preview'};},()=>{},clock);
  p.play();p.play();assert.equal(clock.tasks.size,1);const old=clock.tasks.values().next().value.fn;
  p.setSpeed(10);assert.equal(clock.tasks.size,1);old();assert.equal(steps,0);
  clock.tick();assert.equal(steps,1);assert.equal(clock.tasks.size,1);p.pause();assert.equal(clock.tasks.size,0);
  p.play();const stale=clock.tasks.values().next().value.fn;p.dispose();stale();assert.equal(steps,1);assert.equal(clock.tasks.size,0);
});
test('finished playback leaves no active timer',()=>{
  const clock=fakeClock();const p=new Playback(()=>({phase:'finished'}),()=>{},clock);p.play();clock.tick();
  assert.equal(p.running,false);assert.equal(clock.tasks.size,0);
});
