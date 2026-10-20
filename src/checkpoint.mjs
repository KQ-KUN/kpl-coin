// Checkpoints contain public actions, never an alternate balance or payout implementation.
const METHODS=new Set(['advance','choose','recap','finish']);
const MODES=new Set(['loyal','trader']);
const SCOPE_TYPES=new Set(['all','team','season','season_team']);
export const CHECKPOINT_KEY='kpl-coin:checkpoint:v1';
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function summary(session){
  return {phase:session.phase,cursor:session.cursor,revision:session.revision,
    cashMinor:session.ledger.cashMinor.toString(),reservedMinor:session.ledger.reservedMinor.toString(),
    records:session.records.length,completed:session.completed,current:session.current?.id??null,
    positions:Object.keys(session.ledger.positions).sort(),curve:session.curve.length,recapHighlights:session.recapHighlights};
}
export function readCheckpoint(raw){
  let value;
  try{if(typeof raw!=='string'||raw.length>2_000_000)throw Error();value=JSON.parse(raw);}catch{throw Error('本地存档损坏，无法继续。可以重新开始。');}
  const c=value?.context;
  if(!isObject(value)||value.schemaVersion!==1||!isObject(c)||!MODES.has(c.mode)||!SCOPE_TYPES.has(c.scope?.type)
    ||!['all','league','cup'].includes(c.competitionKind)||!['official','v1'].includes(c.profile)
    ||typeof c.identity?.gameVersion!=='string'||!sha(c.identity?.dataHash)||!sha(c.identity?.ledgerHash)
    ||!Array.isArray(value.actions)||value.actions.length>20000||!isObject(value.expected)||!isObject(value.ui))throw Error('本地存档格式不兼容，请重新开始。');
  for(const action of value.actions){
    if(!Array.isArray(action)||!METHODS.has(action[0]))throw Error('本地存档包含无效操作。');
    if(action[0]==='choose'){
      if(action.length!==3||!['a','b','skip'].includes(action[1])||!['0.00','50.00','100.00','200.00','500.00'].includes(action[2]))throw Error('本地存档包含无效选择。');
    }else if(action.length!==1)throw Error('本地存档包含无效操作。');
  }
  if(![1,3,10,'recap'].includes(value.ui.speed)||typeof value.ui.completeTracked!=='boolean'||typeof value.ui.recapTracked!=='boolean')throw Error('本地存档控制状态无效。');
  return value;
}
export function recordSession(session,context,onChange=()=>{},priorActions=[]){
  const actions=priorActions.map(action=>[...action]);let depth=0;
  for(const name of METHODS){
    const original=session[name];
    session[name]=function(...args){
      const outer=depth++===0,before=outer?JSON.stringify(summary(session)):null;
      try{
        const result=original.apply(this,args);
        if(outer&&before!==JSON.stringify(summary(session))){actions.push(name==='choose'?[name,args[0],args[1]??'0.00']:[name,...args]);onChange();}
        return result;
      }finally{depth--;}
    };
  }
  return {session,snapshot(ui){
    return JSON.stringify({schemaVersion:1,savedAt:new Date().toISOString(),context,actions,expected:summary(session),ui});
  }};
}
export function restoreCheckpoint(raw,identity,createSession){
  const value=readCheckpoint(raw),saved=value.context.identity;
  if(saved.gameVersion!==identity.gameVersion||saved.dataHash!==identity.dataHash||saved.ledgerHash!==identity.ledgerHash)throw Error('存档的游戏或数据版本已变化，不能继续旧挑战。可以重新开始。');
  let session;
  try{
    session=createSession(value.context);
    for(const [name,...args] of value.actions)session[name](...args);
    if(JSON.stringify(summary(session))!==JSON.stringify(value.expected))throw Error('state mismatch');
  }catch{throw Error('本地存档无法按原引擎恢复，可能已损坏。可以重新开始。');}
  return {session,...value};
}
