// 展示补丁独立于冻结比赛资料；精确实体ID避免继承同provider_id的UUG头像。
const historicalIcons=Object.freeze({
  'smoba:10101:fire-leopard-2022':'assets/teams/fire-leopard-2022.png',
});
export function teamIcon(t){return historicalIcons[t.id]??t.icon;}
export function homeTeams(teams){
  const featured=['smoba:10027','smoba:10001','smoba:10006'];
  // V1保留的27个KPL/K甲历史实体；新杯赛对手仍可在历史操盘中选择。
  return teams.filter(t=>t.identity_status==='frozen_A_entity'||t.identity_status===undefined).sort((a,b)=>{
    const ai=featured.indexOf(a.id),bi=featured.indexOf(b.id);
    return (ai<0?99:ai)-(bi<0?99:bi)||a.id.localeCompare(b.id);
  });
}
