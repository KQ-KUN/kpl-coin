import {Session} from './engine.mjs';
import {InteractiveTrader} from './interactive.mjs';
import {historyIndex} from './challenge.mjs';

export const competitionLabels={all:'全部比赛',league:'联赛',cup:'杯赛'};
// 赛事类型按已审计ID明确分类；年度总决赛归入联赛，选拔属于对应杯赛。
const leagues=new Set(['KPL2020S1','KPL2020S2','KPL2021S1','KPL2021S2','KPL2022S1','KPL2022S2','KPL2023S1','KPL2023S2','KPL2024S1','KPL2024S2','KPL2024S3','KPL2025S1','KPL2025S2','KPL2025S3','KPL2026S1','KPL2026S2']);
const cups=new Set(['KCC2019W','KCC2020Q','KCC2020','KCC2020W','KCC2021','KCC2021C','KCC2022C','KCC2023','KCC2024','KCC2025','KCC2026','KIC2022','KIC2023']);
export function competitionType(seasonId){
  if(leagues.has(seasonId))return 'league';
  if(cups.has(seasonId))return 'cup';
  throw Error('未审计的赛事类型');
}
export function filterCompetition(source,kind='all'){
  if(!Object.hasOwn(competitionLabels,kind))throw Error('无效赛事类型');
  const rows=source.rows.filter(r=>{const type=competitionType(r.season_id);return kind==='all'||type===kind;});
  const participation=new Map(),seasonIds=new Set();
  for(const r of rows){seasonIds.add(r.season_id);for(const id of [r.team_a_id,r.team_b_id]){
    const p=participation.get(id)??{count:0,first:r.date,last:r.date};p.count++;p.last=r.date;participation.set(id,p);
  }}
  const teams=source.teams.filter(t=>participation.has(t.id)).map(t=>{
    const p=participation.get(t.id);return {...t,match_count:p.count,first_date:p.first,last_date:p.last};
  });
  return {...source,rows,teams,seasons:source.seasons.filter(s=>seasonIds.has(s.id)),competitionKind:kind};
}
export function createCompetitionGame(source,mode,teamId,scope,kind='all'){
  const selected=filterCompetition(source,kind);
  const session=mode==='trader'?new InteractiveTrader(selected,teamId,scope):new Session(selected,mode,teamId,scope);
  // 参赛范围可筛选，但赛前近五场仍使用完整已验收历史，严格依原截止规则。
  session.history=historyIndex(source.rows);
  return session;
}
