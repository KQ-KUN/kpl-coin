// 本次统计接入候选；与平台 helper/端点同时发布，失败不影响游戏。
export const ANALYTICS_ENABLED=true;
export const COIN_EVENTS=Object.freeze(['coin-select-mode','coin-select-team','coin-start','coin-complete','coin-recap','coin-copy','coin-restart','coin-resume']);
export function trackCoin(event,{approved=ANALYTICS_ENABLED,helper=globalThis.KPLAnalytics,webdriver=globalThis.navigator?.webdriver}={}) {
  if(!approved||webdriver===true||!COIN_EVENTS.includes(event)||typeof helper?.trackEvent!=='function')return false;
  try{return helper.trackEvent(event)===true;}catch{return false;}
}
