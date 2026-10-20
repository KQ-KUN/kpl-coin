import {verifyBytes} from './data.mjs';
const columns=['id','date','available_date','season_index','team_a_index','team_b_index','p_a','odds_a','odds_b','winner_index','score_a','score_b','best_of','stage_index','quality_index','name_a_index','name_b_index'];
const forbidden=new Set(['smoba:20200001:2020050601','smoba:20200001:2020050602','smoba:202100201:20210020104292']);
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const units=v=>{if(typeof v!=='string'||!/^\d+\.\d{12}$/.test(v))throw Error('无效扩展精度');return BigInt(v.replace('.',''));};
export function decodeOfficial(d){
  const versions={'coin-official-2.0.0':['elo-day-official-v2.0.0',2549,104,28],'coin-official-2.1.0':['elo-day-official-v2.1.0',2631,112,29]},expected=versions[d.schema_version];
  if(!expected||d.model_version!==expected[0]||JSON.stringify(d.columns)!==JSON.stringify(columns)
    ||d.matches.length!==expected[1]||d.teams.length!==expected[2]||d.seasons.length!==expected[3]||d.honors.length!==40)throw Error('扩展版本不匹配');
  if(new Set(d.teams.map(t=>t.id)).size!==d.teams.length||new Set(d.seasons.map(s=>s.id)).size!==d.seasons.length)throw Error('扩展实体重复');
  const seen=new Set();let last='';
  const rows=d.matches.map(v=>{
    if(!Array.isArray(v)||v.length!==17)throw Error('扩展比赛字段错误');
    const [id,date,available,s,a,b,p,oa,ob,w,sa,sb,bo,st,q,na,nb]=v,order=`${date}/${id}`;
    if(typeof id!=='string'||forbidden.has(id)||seen.has(id)||order<last||!validDate(date)||!validDate(available)||available<=date||date>d.cutoff
      ||![s,a,b,w,sa,sb,bo,st,q,na,nb].every(Number.isInteger)||a===b||!d.teams[a]||!d.teams[b]||!d.seasons[s]||![a,b].includes(w)
      ||!d.stages[st]||!['accepted_official_series','accepted_official_schedule','accepted_cross_source','accepted_cross_source_import'].includes(d.quality_statuses[q])
      ||typeof d.historical_names[na]!=='string'||typeof d.historical_names[nb]!=='string'||![1,3,5,7,9].includes(bo)
      ||Math.min(sa,sb)<0||Math.max(sa,sb)!==Math.floor(bo/2)+1||Math.min(sa,sb)>=Math.max(sa,sb)||w!==(sa>sb?a:b))throw Error('无效扩展比赛');
    const pu=units(p);if(pu<=0n||pu>=1000000000000n||units(oa)<=1000000000000n||units(ob)<=1000000000000n)throw Error('无效扩展倍率');
    seen.add(id);last=order;const pb=(1000000000000n-pu).toString().padStart(13,'0');
    return {id,date,available_date:available,season_id:d.seasons[s].id,season_name:d.seasons[s].name,team_a_id:d.teams[a].id,team_b_id:d.teams[b].id,
      name_a:d.historical_names[na],name_b:d.historical_names[nb],p_a:p,p_b:`${pb.slice(0,-12)}.${pb.slice(-12)}`,odds_a:oa,odds_b:ob,
      winner_id:d.teams[w].id,score_a:sa,score_b:sb,best_of:bo,stage_category:d.stages[st].category,stage_name:d.stages[st].source_name,quality:d.quality_statuses[q]};
  });
  for(const t of d.teams){
    if(rows.filter(r=>[r.team_a_id,r.team_b_id].includes(t.id)).length!==t.match_count)throw Error('扩展参赛数不一致');
    if(t.icon!==null&&!/^assets\/teams\/\d+\.png$/.test(t.icon))throw Error('扩展队徽路径错误');
  }
  if(new Set(d.honors.map(h=>h.id)).size!==40||d.honors.some(h=>!validDate(h.date)||h.date>d.cutoff||typeof h.champion_id!=='string'))throw Error('荣誉清单无效');
  if(d.schema_version==='coin-official-2.1.0'){
    if(!Array.isArray(d.archive)||d.archive.length!==48||new Set(d.archive.map(r=>r.id)).size!==48)throw Error('BO2档案不完整');
    for(const r of d.archive)if(seen.has(r.id)||r.best_of!==2||!validDate(r.date)||r.date>d.cutoff||typeof r.name_a!=='string'||typeof r.name_b!=='string'||r.team_a_id===r.team_b_id||![r.score_a,r.score_b].every(Number.isInteger)||Math.min(r.score_a,r.score_b)<0||r.score_a+r.score_b!==2||'odds_a' in r||'p_a' in r)throw Error('无效BO2只读档案');
  }
  return {metadata:d,rows,teams:d.teams,seasons:d.seasons,honors:d.honors};
}
export async function loadOfficial(){
  const compiled='__COIN_BUILD_ID__',documentBuild=document.documentElement.dataset.build;
  if(documentBuild&&compiled!==documentBuild)throw Error('扩展页面版本不一致，请重新加载。');
  const r=await fetch('./release.json',{cache:'no-store'});if(!r.ok)throw Error('扩展版本加载失败');
  const release=await r.json();if(documentBuild&&release.build_id!==compiled)throw Error('扩展发布版本不一致');
  const [response,mr]=await Promise.all([fetch('./data/coin-official-v2.1.json',{cache:'no-store'}),fetch('./data/official-manifest-v2.1.json',{cache:'no-store'})]);
  if(!response.ok||!mr.ok)throw Error('官方赛事扩展加载失败，请重新加载。');
  const bytes=await response.arrayBuffer(),m=await mr.json();
  if(!release.official||release.official.schema!=='coin-official-2.1.0'||m.schema_version!==release.official.schema||release.official.sha256!==m.sha256||release.official.model!==m.model_version||release.ledger_sha256!==m.ledger_sha256||bytes.byteLength!==m.bytes||bytes.byteLength!==release.official.bytes||m.budget_bytes!==524288||bytes.byteLength>m.budget_bytes)throw Error('扩展缓存版本不一致');
  await verifyBytes(bytes,m.sha256);return {...decodeOfficial(JSON.parse(new TextDecoder().decode(bytes))),
    identity:{gameVersion:release.version,dataHash:m.sha256,ledgerHash:m.ledger_sha256}};
}
