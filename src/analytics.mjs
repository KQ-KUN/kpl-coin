// 待平台白名单与用户批准后，单独提交 enabled=true；E阶段永不发送。
export const ANALYTICS_ENABLED=false;
export const COIN_EVENTS=Object.freeze(['coin-select-mode','coin-select-team','coin-start','coin-complete','coin-recap','coin-copy']);
export function trackCoin(event,{approved=ANALYTICS_ENABLED,helper=globalThis.KPLAnalytics,webdriver=globalThis.navigator?.webdriver}={}) {
  if(!approved||webdriver===true||!COIN_EVENTS.includes(event)||typeof helper?.trackEvent!=='function')return false;
  try{return helper.trackEvent(event)===true;}catch{return false;}
}
