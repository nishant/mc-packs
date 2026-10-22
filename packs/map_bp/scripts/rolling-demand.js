// Incremental moving demand for the fixed north-up actual2 profile. No Native queries or terrain writes.
// Mutable planner-owned tickets may update d/visible; coordinates, identities and original request timestamps stay put.
import{COL,colKey,sampleCoord}from"./terrain.js";
import{circleDelta}from"./circle-delta.js";
import{orderLatticeWork}from"./terrain-work.js";
/** @typedef {import('./terrain.js').Pick & {d:number,stale:boolean,queuedAt:number,visible?:boolean}} RollingPick */
/** @typedef {{x:number,z:number}} Point */
/** @typedef {{store:import('./terrain.js').Store,picks:import('./terrain.js').Pick[],pos:number,at:number,previous:Point,current:Point,radius:number,geometry:ReturnType<typeof import('./terrain.js').northUpRadarGeometry>,now:number,maxAge:number,missRetry:number,failed?:Map<string,import('./terrain.js').Pick>,rerank:boolean}} RollInput */
/** @param {RollInput} input */
export function rollTerrainDemand(input){
 const{store,previous,current,radius,geometry,now,maxAge,missRetry}=input;
 const size=2*geometry.half+1,half=geometry.half,cell=geometry.radius/half,tx=geometry.x[half],tz=geometry.z[half*size],r2=radius*radius;
 /** @type {Map<number,RollingPick>} */const byKey=new Map();
  /** @type {RollingPick[]} */const visible=[];
 /** @type {RollingPick[]} */const holes=[];
 /** @type {RollingPick[]} */const stale=[];
 const stats={tailVisited:0,entered:0,exited:0,rawChecks:0,added:0,nearPromoted:0};
 let nextFresh=Infinity,nextRetry=Infinity;
 /** @param {number} key @param {number} x @param {number} z */
 const isVisible=(key,x,z)=>{const c=Math.round((x-tx)/cell),r=Math.round((z-tz)/cell);return c>=-half&&c<=half&&r>=-half&&r<=half&&c*c+r*r<=half*half&&geometry.coarseKey[(r+half)*size+c+half]===key;};
 /** @param {RollingPick} p */
 const append=p=>{byKey.set(p.key,p);if(p.stale)stale.push(p);else if(p.visible)visible.push(p);else holes.push(p);};
 for(let i=input.pos;i<input.picks.length;i++){
  stats.tailVisited++;const original=input.picks[i];
  if((original.resolution??COL)!==COL||original.store&&original.store!==store)return undefined;
  const dx=original.wx-current.x,dz=original.wz-current.z,d=dx*dx+dz*dz;
  if(d>r2||original.key<0)continue;
  const prior=byKey.get(original.key);if(prior){prior.queuedAt=Math.min(prior.queuedAt,original.queuedAt??input.at);continue;}
  // These are the planner's own work tickets, never raw Store columns or renderer snapshots.
  const p=/** @type {RollingPick} */(original);p.d=d;p.visible=isVisible(p.key,p.wx,p.wz);p.stale=original.stale===true;p.queuedAt=original.queuedAt??input.at;
  append(p);
 }
 for(const change of circleDelta(previous,current,radius,COL,colKey)){
  if(change.kind==='exited'){stats.exited++;continue;}stats.entered++;
  if(byKey.has(change.key))continue;
  stats.rawChecks++;const sample=store.cols.get(change.key),valid=!!sample&&sample.valid!==false;
  if(valid&&now-sample.tick<=maxAge){nextFresh=Math.min(nextFresh,sample.tick+maxAge+1);continue;}
  const miss=store.miss.get(change.key);if(miss!==undefined&&now-miss<missRetry){nextRetry=Math.min(nextRetry,miss+missRetry);continue;}
  const old=input.failed?.get(store.id+'|'+change.key),dx=change.x-current.x,dz=change.z-current.z;
  const p={wx:change.x,wz:change.z,key:change.key,resolution:COL,d:dx*dx+dz*dz,stale:valid,visible:isVisible(change.key,change.x,change.z),queuedAt:old?.queuedAt??now,since:valid?now:now-maxAge};
  append(p);stats.added++;
 }
 if(input.rerank)return{picks:orderLatticeWork([...byKey.values()],now,false),nextFresh,nextRetry,stats};
  /** @type {RollingPick[]} */const out=[];
 /** @type {RollingPick[]} */const focus=[];
 const used=new Set();
 /** @type {RollingPick|undefined} */let agedHole;
 for(const p of holes)if(now-p.queuedAt>=80&&(!agedHole||p.queuedAt<agedHole.queuedAt||p.queuedAt===agedHole.queuedAt&&(p.d<agedHole.d||p.d===agedHole.d&&p.key<agedHole.key)))agedHole=p;
 if(agedHole){out.push(agedHole);used.add(agedHole.key);}
 const cx=sampleCoord(current.x,COL),cz=sampleCoord(current.z,COL);
 for(let z=-1;z<=1;z++)for(let x=-1;x<=1;x++){
  const key=colKey(cx+x*COL,cz+z*COL,COL),p=byKey.get(key);if(!p||p.stale||used.has(key))continue;
  stats.rawChecks++;const sample=store.cols.get(key);if(sample&&sample.valid!==false&&now-sample.tick<=maxAge)continue;
  focus.push(p);
 }
 focus.sort((a,b)=>a.d-b.d||a.key-b.key);
 for(let i=0;i<8&&i<focus.length;i++){out.push(focus[i]);used.add(focus[i].key);stats.nearPromoted++;}
 let v=0,h=0,s=0,round=0;
 while(v<visible.length||h<holes.length){
  for(let j=0;j<3;j++){while(v<visible.length&&used.has(visible[v].key))v++;if(v<visible.length)out.push(visible[v++]);}
  while(h<holes.length&&used.has(holes[h].key))h++;if(h<holes.length)out.push(holes[h++]);
  if(++round%4===0&&s<stale.length)out.push(stale[s++]);
 }
 while(s<stale.length)out.push(stale[s++]);
 return{picks:out,nextFresh,nextRetry,stats};
}
