// 范围只筛选冻结记录，评级实体使用完整 ID，禁止按简称或 provider 合并。
export function selectRows(dataset,scope={type:'all'}) {
  if(!['season_team','season','team','all'].includes(scope.type))throw Error('无效挑战范围');
  if(['season_team','season'].includes(scope.type)&&!dataset.seasons.some(s=>s.id===scope.seasonId))throw Error('无效赛季');
  if(['season_team','team'].includes(scope.type)&&!dataset.teams.some(t=>t.id===scope.teamId))throw Error('无效战队实体');
  return dataset.rows.filter(r=>(!['season_team','season'].includes(scope.type)||r.season_id===scope.seasonId)
    &&(!['season_team','team'].includes(scope.type)||[r.team_a_id,r.team_b_id].includes(scope.teamId)));
}

// 未核实分钟时刻，同一结果可用日期也不纳入赛前信息，采用严格早于开赛日期。
export function historyIndex(rows) {
  const index=new Map();
  for(const r of rows)for(const id of [r.team_a_id,r.team_b_id]) {
    if(!index.has(id))index.set(id,[]);
    index.get(id).push({id:r.id,date:r.date,available_date:r.available_date,won:r.winner_id===id});
  }
  for(const list of index.values())list.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  return index;
}
export function recentForm(index,teamId,date) {
  return (index.get(teamId)??[]).filter(r=>r.available_date<date).slice(-5)
    .map(r=>({date:r.date,available_date:r.available_date,result:r.won?'W':'L'}));
}
