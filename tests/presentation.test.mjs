import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {homeTeams,teamIcon} from '../src/presentation.mjs';
import {decodeOfficial} from '../src/official-data.mjs';
import {filterCompetition} from '../src/competition.mjs';
const data=decodeOfficial(JSON.parse(readFileSync(new URL('../data/coin-official-v2.1.json',import.meta.url))));

test('home limits selectable favorites to audited KPL entities without removing cup opponents or matches',()=>{
  const teams=homeTeams(data.teams);
  assert.equal(teams.length,27);
  assert.deepEqual(teams.slice(0,3).map(t=>t.id),['smoba:10027','smoba:10001','smoba:10006']);
  assert.ok(teams.every(t=>t.identity_status==='frozen_A_entity'));
  assert.equal(data.teams.length,112);assert.equal(data.rows.length,2631);
  for(const kind of ['all','league','cup']){
    const filtered=filterCompetition(data,kind);
    assert.ok(homeTeams(filtered.teams).every(t=>filtered.rows.some(r=>[r.team_a_id,r.team_b_id].includes(t.id))));
  }
});

test('historical Fire leopard image is bound to exact entity and does not change frozen data',()=>{
  const fire=data.teams.find(t=>t.id==='smoba:10101:fire-leopard-2022'),uug=data.teams.find(t=>t.id==='smoba:10101:uug-2025');
  assert.equal(fire.icon,null);assert.equal(teamIcon(fire),'assets/teams/fire-leopard-2022.png');
  assert.equal(teamIcon(uug),'assets/teams/10101.png');
  assert.equal(teamIcon(data.teams.find(t=>t.id==='cup:20210005:10101')),null);
  const bytes=readFileSync(new URL('../assets/teams/fire-leopard-2022.png',import.meta.url));
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'977f317a7021204be7a8b4fb91517cad5f6f86ac4663463639b8faa33d7a23f8');
});
