// 仅保存引擎已经公开的赛果，不读取未来行，也不调用账本或改变会话游标。
export class ReplayReview{
  constructor(){this.clear();}
  clear(){this.entries=[];this.indices=new Map();this.cursor=null;}
  remember(view){
    for(const r of view.results??[])if(!this.indices.has(r.id)){
      this.indices.set(r.id,this.entries.length);this.entries.push(Object.freeze({...r}));
    }
  }
  currentIndex(view){
    if(this.cursor!==null)return this.cursor;
    const last=view.results?.at(-1);
    return last&&this.indices.has(last.id)?this.indices.get(last.id):this.entries.length;
  }
  canPrevious(view){return this.currentIndex(view)>0;}
  previous(view){
    if(!this.canPrevious(view))return null;
    this.cursor=this.currentIndex(view)-1;return this.entries[this.cursor];
  }
  forward(view){
    if(this.cursor===null)return null;
    const id=view?.results?.at(-1)?.id;
    const liveIndex=id&&this.indices.has(id)?this.indices.get(id):this.entries.length;
    if(this.cursor+1<liveIndex)return this.entries[++this.cursor];
    this.cursor=null;return null;
  }
  exit(){this.cursor=null;}
  get active(){return this.cursor!==null;}
}
