import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {decodeOfficial} from '../src/official-data.mjs';
import {competitionType,filterCompetition,createCompetitionGame} from '../src/competition.mjs';
import {historyIndex,recentForm} from '../src/challenge.mjs';
const data=decodeOfficial(JSON.parse(readFileSync(new URL('../data/coin-official-v2.1.json',import.meta.url))));
test('three competition ranges partition 2631 immutable predictions; annual finals are leagues',()=>{
 const before=JSON.stringify(data);const all=filterCompetition(data),league=filterCompetition(data,'league'),cup=filterCompetition(data,'cup');
 assert.equal(all.rows.length,2631);assert.equal(league.rows.length,1989);assert.equal(cup.rows.length,642);
 assert.equal(new Set([...league.rows,...cup.rows].map(r=>r.id)).size,2631);
 assert.equal(competitionType('KPL2024S3'),'league');assert.equal(competitionType('KPL2025S3'),'league');
 assert.equal(competitionType('KCC2020Q'),'cup');assert.equal(competitionType('KIC2022'),'cup');
 for(const d of [all,league,cup])for(const r of d.rows)assert.equal(r,data.rows.find(x=>x.id===r.id));
 assert.equal(JSON.stringify(data),before);
});
test('teams, selectable seasons and actual dates follow each competition filter without identity joins',()=>{
 for(const kind of ['all','league','cup']){const d=filterCompetition(data,kind);
  for(const t of d.teams){const rows=d.rows.filter(r=>[r.team_a_id,r.team_b_id].includes(t.id));assert.ok(rows.length);assert.equal(t.match_count,rows.length);assert.equal(t.first_date,rows[0].date);assert.equal(t.last_date,rows.at(-1).date);}
  assert.equal(new Set(d.rows.map(r=>r.season_id)).size,d.seasons.length);
 }
 assert.equal(filterCompetition(data,'league').teams.length,27);
 assert.equal(filterCompetition(data,'cup').teams.length,110);
});
test('AG/Wolves/eStar each range full faithful replay conserves sole ledger and selected eligible count',()=>{
 const before=JSON.stringify(data);
 for(const id of ['smoba:10027','smoba:10001','smoba:10006'])for(const kind of ['all','league','cup']){
  const s=createCompetitionGame(data,'loyal',id,{},kind),v=s.finish();
  assert.equal(v.stats.eligible,filterCompetition(data,kind).teams.find(t=>t.id===id).match_count);
  assert.equal(s.ledger.cashMinor,1000000n+s.records.reduce((n,r)=>n+r.netMinor,0n));assert.equal(s.ledger.reservedMinor,0n);
  assert.equal(s.ledger.settledIds.length,new Set(s.ledger.settledIds).size);assert.ok(s.records.every(r=>kind==='all'||competitionType(r.row.season_id)===kind));
 }
 assert.equal(createCompetitionGame(data,'loyal','smoba:10027',{},'all').finish().stats.final,'13572.36');
 // 联赛使用同一扩展模型，不等于旧V1不同评级输入得到的12,077.03。
 assert.equal(createCompetitionGame(data,'loyal','smoba:10027',{},'league').finish().stats.final,'11627.89');
 assert.equal(createCompetitionGame(data,'loyal','smoba:10027',{},'cup').finish().stats.final,'11944.47');
 assert.equal(JSON.stringify(data),before);
});
test('prior-five after filtering still includes strictly known matches of both tournament families',()=>{
 const full=historyIndex(data.rows);
 for(const kind of ['league','cup']){
  const subset=filterCompetition(data,kind),limited=historyIndex(subset.rows);
  const r=subset.rows.find(r=>JSON.stringify(recentForm(full,r.team_a_id,r.date))!==JSON.stringify(recentForm(limited,r.team_a_id,r.date)));
  assert.ok(r);const s=createCompetitionGame(data,'loyal',r.team_a_id,{},kind),preview=s.preview(r);
  assert.deepEqual(preview.form_a,recentForm(full,r.team_a_id,r.date));
  assert.ok(preview.form_a.every(x=>x.available_date<r.date));assert.equal(preview.winner_id,undefined);
 }
});
test('filtered trader mixed win loss skip settles only that range and repeated finish cannot duplicate',()=>{
 for(const kind of ['league','cup']){
  const s=createCompetitionGame(data,'trader',null,{type:'all'},kind);let v=s.advance(),count=0;
  while(v.phase!=='finished'){
   assert.equal(v.quote.score_a,undefined);assert.equal(v.quote.winner_id,undefined);
   const skip=count%3===0||s.ledger.cashMinor<5000n;s.choose(skip?'skip':count%2?'a':'b',skip?'0.00':'50.00');count++;v=s.advance();
  }
  assert.equal(count,kind==='league'?1989:642);assert.ok(s.ledger.cashMinor>=0n);assert.equal(s.ledger.reservedMinor,0n);
  const final=v.stats.final;assert.equal(s.finish().stats.final,final);
 }
 assert.throws(()=>filterCompetition(data,'v1'),/无效赛事类型/);
 assert.throws(()=>filterCompetition({...data,rows:[{...data.rows[0],season_id:'UNREVIEWED'}]},'cup'),/未审计/);
});
