import {Session} from './engine.mjs';

// 独立交互版本：逐场确认与揭晓。冻结日期批引擎及唯一账本保持原字节。
export class InteractiveTrader extends Session {
  constructor(dataset,teamId=null,scope={type:'all'}){super(dataset,'trader',teamId,scope);}
  choose(choice,stake='0.00'){
    const row=this.current;
    super.choose(choice,stake); // 输入、余额和重复确认检查全部沿用已验收逻辑。
    const previousLength=this.curve.length;
    this.release(row.available_date); // release 调用唯一 B settle，不另写金额或统计公式。
    this.date=row.date;
    if(this.curve.length>previousLength){
      // 逐场回放的资产按比赛展示日期绘制；不修改原始结果可用日期。
      this.curve[this.curve.length-1]={...this.curve.at(-1),date:row.date};
    }
    return this.view();
  }
  advance(){
    let view;
    do{view=super.advance();}while(view.phase==='season');
    return view; // 下一步只展示下一场赛前卡片或完整战绩，不插入账务/赛季确认页。
  }
  view(){return {...super.view(),settlementPolicy:'series-reveal-v1'};}
}
