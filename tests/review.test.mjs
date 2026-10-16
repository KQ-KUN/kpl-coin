import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {ReplayReview} from '../src/review.mjs';import {decodeOfficial} from '../src/official-data.mjs';
import {createCompetitionGame} from '../src/competition.mjs';
const data=decodeOfficial(JSON.parse(readFileSync(new URL('../data/coin-official-v2.1.json',import.meta.url))));
const encoded=v=>JSON.stringify(v,(k,v)=>typeof v==='bigint'?v.toString():v);
test('review only stores revealed public results, deduplicates and resets without future quotes',()=>{
 const r=new ReplayReview();r.remember({phase:'preview',quote:{id:'future',score_a:4},results:[]});assert.equal(r.entries.length,0);
 const view={results:[{id:'done',score_a:4,score_b:2,assetAfter:'10065.05'}]};r.remember(view);r.remember(view);
 assert.equal(r.entries.length,1);assert.equal(Object.isFrozen(r.entries[0]),true);assert.equal(r.canPrevious(view),false);
 const next={phase:'preview',results:[]};assert.equal(r.previous(next).id,'done');assert.equal(r.forward(next),null);
 assert.equal(r.active,false);r.clear();assert.equal(r.entries.length,0);assert.equal(r.indices.size,0);
});
test('back and forward inspect prior real result without changing ledger, cursor, records or final output',()=>{
 const s=createCompetitionGame(data,'trader',null,{type:'season_team',seasonId:'KPL2020S1',teamId:'smoba:10027'}),r=new ReplayReview();
 s.advance();const first=s.choose('a','100.00');r.remember(first);s.advance();const second=s.choose('b','100.00');r.remember(second);
 const snapshot=()=>encoded({ledger:s.ledger,cursor:s.cursor,records:s.records,curve:s.curve,pending:[...s.pending]});const before=snapshot();
 for(let i=0;i<30;i++){assert.equal(r.previous(second).id,first.results[0].id);assert.equal(r.forward(second),null);assert.equal(r.active,false);}
 assert.equal(snapshot(),before);assert.equal(s.statistics().participated,2);
 const third=s.advance();assert.equal(third.quote.score_a,undefined);assert.equal(r.previous(third).id,second.results[0].id);
 assert.equal(r.previous(third).id,first.results[0].id);assert.equal(r.forward(third).id,second.results[0].id);assert.equal(r.forward(third),null);
});
test('recap review memory remains bounded by unique revealed matches and does not affect canonical outcome',()=>{
 const s=createCompetitionGame(data,'loyal','smoba:10027',{},'all'),r=new ReplayReview();let v;
 do{v=s.recap();r.remember(v);}while(v.phase!=='finished');
 assert.ok(r.entries.length<=327);assert.equal(new Set(r.entries.map(x=>x.id)).size,r.entries.length);
 const reference=createCompetitionGame(data,'loyal','smoba:10027',{},'all').finish();assert.deepEqual(v.stats,reference.stats);
 const before=encoded(s.ledger);if(r.entries.length){r.previous(v);r.forward(v);}assert.equal(encoded(s.ledger),before);
});
