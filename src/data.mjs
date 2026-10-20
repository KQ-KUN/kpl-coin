// 只接受正式C schema；结果不进入赛前view。
const COLUMNS = ['id','date','available_date','season_index','team_a_index','team_b_index','p_a','odds_a','odds_b','winner_index',
  'score_a','score_b','best_of','stage_index','quality_index','name_a_index','name_b_index'];
const EXCLUDED = new Set(['smoba:20200001:2020050601','smoba:20200001:2020050602','smoba:202100201:20210020104292']);
const validDate = d => typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
  && Number.isFinite(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0,10)===d;
const units = v => { if(typeof v!=='string'||!/^\d+\.\d{12}$/.test(v))throw Error('无效精度'); return BigInt(v.replace('.','')); };

export async function verifyBytes(bytes,digest) {
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  const actual=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
  if(actual!==digest)throw Error('运行时数据校验失败，请重新构建或解压');
}

export function decode(data) {
  if(data.schema_version!=='coin-ui-1.0.0'||data.model_version!=='elo-day-v1.0.0'
      ||JSON.stringify(data.columns)!==JSON.stringify(COLUMNS)||data.matches.length!==1989
      ||data.teams.length!==27||data.seasons.length!==16)throw Error('不支持的数据版本');
  if(new Set(data.teams.map(t=>t.id)).size!==27)throw Error('实体重复');
  const seen=new Set();let last='';
  const rows=data.matches.map(v=>{
    if(!Array.isArray(v)||v.length!==17)throw Error('无效比赛行');
    const [id,date,available,s,a,b,p,oa,ob,w,sa,sb,bo,st,q,na,nb]=v;
    const order=`${date}/${id}`;
    if(typeof id!=='string'||seen.has(id)||EXCLUDED.has(id)||order<last||!validDate(date)||!validDate(available)
        ||available<=date||date>data.cutoff||![s,a,b,w,sa,sb,bo,st,q,na,nb].every(Number.isInteger)
        ||a===b||!(w===a||w===b)||!data.teams[a]||!data.teams[b]||!data.seasons[s]
        ||!data.stages[st]||!data.quality_statuses[q]||typeof data.historical_names[na]!=='string'
        ||typeof data.historical_names[nb]!=='string'||!['accepted_cross_source','accepted_cross_source_import'].includes(data.quality_statuses[q])
        ||![5,7].includes(bo)||Math.min(sa,sb)<0||Math.max(sa,sb)!==Math.floor(bo/2)+1
        ||Math.min(sa,sb)>=Math.max(sa,sb)||w!==(sa>sb?a:b))throw Error('无效比赛或隔离数据');
    const pu=units(p);if(pu<=0n||pu>=1000000000000n||units(oa)<=1000000000000n||units(ob)<=1000000000000n)throw Error('无效概率或倍率');
    seen.add(id);last=order;
    const pb=(1000000000000n-pu).toString().padStart(13,'0');
    return {id,date,available_date:available,season_id:data.seasons[s].id,season_name:data.seasons[s].name,
      team_a_id:data.teams[a].id,team_b_id:data.teams[b].id,name_a:data.historical_names[na],name_b:data.historical_names[nb],
      p_a:p,p_b:`${pb.slice(0,-12)}.${pb.slice(-12)}`,odds_a:oa,odds_b:ob,winner_id:data.teams[w].id,
      score_a:sa,score_b:sb,best_of:bo,stage_category:data.stages[st].category,
      stage_name:data.stages[st].source_name,quality:data.quality_statuses[q]};
  });
  for(const t of data.teams) {
    if(rows.filter(r=>[r.team_a_id,r.team_b_id].includes(t.id)).length!==t.match_count)throw Error('战队参赛数量不一致');
    if(t.icon!==null&&!/^assets\/teams\/\d+\.png$/.test(t.icon))throw Error('无效队徽路径');
  }
  return {metadata:data,rows,teams:data.teams,seasons:data.seasons};
}

export async function loadData() {
  const compiledBuild='__COIN_BUILD_ID__';
  const documentBuild=document.documentElement.dataset.build;
  let release;
  if(documentBuild&&documentBuild!==compiledBuild)throw Error('页面版本不一致，请重新加载。');
  if(documentBuild){
    const response=await fetch('./release.json',{cache:'no-store'});
    if(!response.ok)throw Error('版本信息加载失败，请重新加载。');
    release=await response.json();
    if(release.build_id!==documentBuild||release.model!=='elo-day-v1.0.0'||release.schema!=='coin-ui-1.0.0')throw Error('页面版本不一致，请重新加载。');
  }
  const [response,manifestResponse]=await Promise.all([fetch('./data/coin-ui-v1.json',{cache:'no-store'}),fetch('./data/assets-manifest.json',{cache:'no-store'})]);
  if(!response.ok||!manifestResponse.ok)throw Error('历史数据加载失败，请重新加载；若仍失败，请稍后再试。');
  const bytes=await response.arrayBuffer(),manifest=await manifestResponse.json();
  if(release&&manifest.assets['data/coin-ui-v1.json'].sha256!==release.runtime_sha256)throw Error('数据版本不一致，请重新加载。');
  if(bytes.byteLength>manifest.runtime_budget_bytes)throw Error('数据超出运行时预算');
  await verifyBytes(bytes,manifest.assets['data/coin-ui-v1.json'].sha256);
  return {...decode(JSON.parse(new TextDecoder().decode(bytes))),identity:{gameVersion:release?.version??'source',
    dataHash:manifest.assets['data/coin-ui-v1.json'].sha256,ledgerHash:manifest.assets['runtime/ledger.mjs'].sha256}};
}
