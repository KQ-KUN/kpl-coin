import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {decodeOfficial} from '../src/official-data.mjs';
import {createCompetitionGame} from '../src/competition.mjs';
import {readCheckpoint,recordSession,restoreCheckpoint} from '../src/checkpoint.mjs';
const bytes=readFileSync(new URL('../data/coin-official-v2.1.json',import.meta.url));
const data=decodeOfficial(JSON.parse(bytes));
const identity={gameVersion:'0.5.0',dataHash:createHash('sha256').update(bytes).digest('hex'),ledgerHash:createHash('sha256').update(readFileSync(new URL('../runtime/ledger.mjs',import.meta.url))).digest('hex')};
const context=(mode='loyal',scope={type:'all'})=>({identity,mode,scope,teamId:'smoba:10027',competitionKind:'all',profile:'official'});
const factory=c=>createCompetitionGame(data,c.mode,c.teamId,c.scope,c.competitionKind);
const ui={speed:3,completeTracked:false,recapTracked:false};
function tracked(c=context()) {const session=factory(c);return recordSession(session,c);}
function equalState(a,b){assert.deepEqual(a.ledger,b.ledger);assert.equal(a.phase,b.phase);assert.equal(a.cursor,b.cursor);assert.deepEqual(a.statistics(),b.statistics());}
test('pending loyal stake restores through original transitions, never credits an extra settlement',()=>{
  const rec=tracked();rec.session.advance();rec.session.advance();
  assert.equal(rec.session.phase,'recorded');assert.ok(rec.session.ledger.reservedMinor>0n);
  const raw=rec.snapshot(ui),a=restoreCheckpoint(raw,identity,factory),b=restoreCheckpoint(raw,identity,factory);
  equalState(a.session,rec.session);equalState(a.session,b.session);
  a.session.advance();b.session.advance();equalState(a.session,b.session);
  assert.deepEqual(readCheckpoint(raw).actions,[['advance'],['advance']]);
});
test('manual trader restore preserves each scope, chosen side and fully settled balance',()=>{
  for(const scope of [{type:'all'},{type:'team',teamId:'smoba:10027'},{type:'season',seasonId:'KPL2020S1'},
    {type:'season_team',seasonId:'KPL2020S1',teamId:'smoba:10027'}]){
    const rec=tracked(context('trader',scope));rec.session.advance();rec.session.choose('a','100.00');
    const restored=restoreCheckpoint(rec.snapshot(ui),identity,factory);equalState(restored.session,rec.session);
    assert.equal(restored.session.records.length,1);assert.equal(restored.session.completed,1);
    restored.session.advance();rec.session.advance();equalState(restored.session,rec.session);
  }
});
test('recap and finish are logged once despite their internal nested advances/choices',()=>{
  const rec=tracked();rec.session.advance();rec.session.recap();
  assert.deepEqual(readCheckpoint(rec.snapshot(ui)).actions,[['advance'],['recap']]);
  equalState(restoreCheckpoint(rec.snapshot(ui),identity,factory).session,rec.session);
  rec.session.finish();const raw=rec.snapshot({...ui,completeTracked:true});
  assert.equal(readCheckpoint(raw).actions.length,3);
  const a=restoreCheckpoint(raw,identity,factory),b=restoreCheckpoint(raw,identity,factory);
  assert.equal(a.ui.completeTracked,true);assert.equal(a.session.phase,'finished');equalState(a.session,b.session);equalState(a.session,rec.session);
});
test('recording resumes with prior actions rather than forgetting earlier settled history',()=>{
  const rec=tracked(context('trader'));rec.session.advance();rec.session.choose('skip');
  const old=restoreCheckpoint(rec.snapshot(ui),identity,factory);
  const next=recordSession(old.session,old.context,()=>{},old.actions);next.session.advance();next.session.choose('b','50.00');
  const again=restoreCheckpoint(next.snapshot(ui),identity,factory);equalState(again.session,next.session);assert.equal(again.session.records.length,2);
});
test('invalid or incompatible saves are rejected without mutating an existing session',()=>{
  const rec=tracked();rec.session.advance();const raw=rec.snapshot(ui),before=structuredClone(rec.session.ledger);
  for(const bad of ['{',JSON.stringify({...JSON.parse(raw),actions:[['release','2020-01-01']]}),JSON.stringify({...JSON.parse(raw),expected:{cashMinor:'999999999'}})])assert.throws(()=>restoreCheckpoint(bad,identity,factory),/存档/);
  for(const changed of [{gameVersion:'99'}, {dataHash:'0'.repeat(64)},{ledgerHash:'1'.repeat(64)}])assert.throws(()=>restoreCheckpoint(raw,{...identity,...changed},factory),/版本/);
  assert.deepEqual(rec.session.ledger,before);
});
