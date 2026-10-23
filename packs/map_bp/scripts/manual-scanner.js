// Explicit manual jobs only. The host supplies remaining credits from its ONE scanner ledger.
import {FillJobs,countCircleAnchors,validateRadius} from "./terrain-work.js";
import {COL,colKey,sampleCoord} from "./terrain.js";
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("./terrain.js").Store} Store */
/** @typedef {import("./terrain.js").Pick} Pick */
/** @typedef {{store:Store,dim:import("@minecraft/server").Dimension,py:number}} Snapshot */
/** @typedef {{id:string,player:Player,store:Store,dim:import("@minecraft/server").Dimension,py:number,x:number,z:number,at:number,pos:number,missed:number,missRun:number,picks:Pick[],viewer:{x:number,z:number,radius:number},manualOwner:string,failed?:Map<string,Pick>}} ManualPlan */
/** @typedef {"continued"|"mapped"|"unavailable"|"failed"|"canceled"|"capacity"} StepResult */
/** @typedef {{manualOwner?:string,automatic?:boolean,tick:number}} Lease */
/** @typedef {{terrain:import("./terrain.js").TerrainWorld,profile:()=>string,maxRadius:(p:Player)=>number,players:()=>Player[],visible:(p:Player)=>boolean,snapshot:(p:Player)=>Snapshot,step:(plan:ManualPlan,pick:Pick,now:number)=>StepResult,pending:Map<string,Lease>}} Host */
/** @typedef {{player:Player,job:import("./terrain-work.js").FillJob,plan:ManualPlan,profile:string,lastMessage:number,waiting:string,sampled:number,reused:number,now:number,lastProgress:number}} Context */
export class ManualScanner {
  /** @param {Host} host */
  constructor(host) {
    this.host=host;
    this.fills=new FillJobs(sampleCoord,colKey,8);
    /** @type {Map<string,Context>} */ this.contexts=new Map();
    /** @type {Map<string,string>} */ this.last=new Map();
    /** @type {Set<string>} */ this.viewerPins=new Set();
    this.stats={nativeSteps:0,inspections:0,completed:0,sampled:0,reused:0,unavailable:0,failed:0,deferred:0};
  }
  /** @param {Player} p @param {string} message */
  send(p,message) {try {if(p.isValid)p.sendMessage("§7[Map] "+message);} catch {}}
  /** @param {Context} c */
  describe(c) {
    const p=c.job.progress(), elapsed=c.now-c.plan.at;
    let estimate="";
    if(!p.finished&&!p.canceled&&p.visited>0&&elapsed>=80) {
      if(c.now-c.lastProgress>=80)estimate=" Estimate paused until work resumes.";
      else {
        const seconds=Math.ceil(p.remaining*elapsed/p.visited/20);
        estimate=` Est. processing left: ${seconds<60?seconds+"s":Math.ceil(seconds/60)+"m"} at observed pace (20 TPS).`;
      }
    }
    return `Scan radius ${c.job.spec.radius} world blocks (${2*c.job.spec.radius} across): ${p.mapped} / ${p.total} 2-block samples mapped (${c.sampled} new, ${c.reused} reused); ${p.unavailable} unavailable; ${p.failed} failed; ${p.remaining} remaining.${c.waiting?" Waiting: "+c.waiting+".":""}${estimate}`;
  }
  /** @param {string} owner @param {string} message */
  remember(owner,message) {
    this.last.delete(owner);this.last.set(owner,message);
    while(this.last.size>64) {const first=this.last.keys().next().value;if(first===undefined)break;this.last.delete(first);}
  }
  /** @param {Player} p @param {number} radius @param {number} now */
  start(p,radius,now) {
    validateRadius(radius,this.host.maxRadius(p));
    if(this.contexts.has(p.id))throw new Error("A scan is already active. Use /realm:minimap status or /realm:minimap cancel.");
    const at=p.location,s=this.host.snapshot(p),count=countCircleAnchors(at,radius,sampleCoord,colKey);
    const normal=Math.max(6000,this.host.players().filter(x=>this.host.visible(x)).length*1200);
    const reserved=[...this.contexts.values()].reduce((n,c)=>n+c.job.total,0);
    if(count+reserved+normal>this.host.terrain.maxTotalCols)throw new Error("Scan cannot be retained within the shared cache capacity; choose a smaller radius or wait for another scan.");
    const profile=this.host.profile();
    const job=this.fills.start({owner:p.id,storeId:s.store.id,profile,center:{x:at.x,z:at.z},radius});
    if(job.finished) {
      this.fills.retire(p.id);
      const message=`Processed radius ${radius} world blocks: 0 canonical 2-block samples, 0 mapped.`;
      this.remember(p.id,message);this.send(p,message);return;
    }
    const plan={id:"manual:"+p.id,player:p,store:s.store,dim:s.dim,py:s.py,x:at.x,z:at.z,at:now,pos:0,missed:0,missRun:0,picks:[],viewer:{x:at.x,z:at.z,radius},manualOwner:p.id};
    this.contexts.set(p.id,{player:p,job,plan,profile,lastMessage:now,waiting:"",sampled:0,reused:0,now,lastProgress:now});
    this.host.terrain.protect("scan:"+p.id,s.store,at,radius);
    this.capacity(normal);
    this.send(p,`Started fixed-origin radius ${radius} world blocks (${2*radius} across; ${job.total} canonical 2-block samples). Loaded terrain only; unloaded columns count unavailable. Shared RAM, not restart-safe.`);
  }
  /** Preserve the normal cache's high-water limit; all reservations still fit the one global cap. @param {number} normal */
  capacity(normal) {
    const reserved=[...this.contexts.values()].reduce((n,c)=>n+c.job.total,0);
    this.host.terrain.maxCols=Math.min(this.host.terrain.maxTotalCols,Math.max(this.host.terrain.maxCols,6000,Math.min(48000,normal),reserved+normal));
  }
  /** Release only this scanner's temporary normal-viewer pins, once after the final job. */
  clearViewerPins() {for(const owner of this.viewerPins)this.host.terrain.unprotect(owner);this.viewerPins.clear();}
  /** @param {Player} p */
  status(p) {const c=this.contexts.get(p.id);this.send(p,c?this.describe(c):(this.last.get(p.id)??"No scan is active."));}
  /** @param {string} owner @param {string} [reason] @param {boolean} [notify] */
  cancel(owner,reason="Canceled",notify=true) {
    const c=this.contexts.get(owner);if(!c)return;
    this.contexts.delete(owner);this.fills.cancel(owner);this.host.terrain.unprotect("scan:"+owner);
    if(!this.contexts.size)this.clearViewerPins();
    for(const[key,lease]of this.host.pending) {
      if(lease.manualOwner!==owner)continue;
      if(lease.automatic) {lease.manualOwner=undefined;continue;}
      let transfer;
      for(const[other,next]of this.contexts) {
        const t=next.job.pending;
        if(t&&next.plan.store===c.plan.store&&t.key===Number(key.slice(key.lastIndexOf("|")+1))) {transfer=other;break;}
      }
      if(transfer)lease.manualOwner=transfer;else this.host.pending.delete(key);
    }
    const message=reason+". "+this.describe(c)+" Completed samples remain in shared RAM, subject to later edits/eviction.";
    this.remember(owner,message);if(notify)this.send(c.player,message);
  }
  /** @param {Player[]} players @param {number} now @param {boolean} [trustedRoster] */
  synchronize(players,now,trustedRoster=false) {
    if(!this.contexts.size) {
      this.clearViewerPins();
      // No per-player handles/settings or store iteration when manual scanning is idle.
      // Counting the supplied roster conservatively preserves 40-viewer normal headroom.
      this.host.terrain.maxCols=Math.min(this.host.terrain.maxTotalCols,Math.max(this.host.terrain.maxCols,6000,Math.min(48000,players.length*1200)));
      return;
    }
    const online=new Map(players.map(p=>[p.id,p]));this.clearViewerPins();let viewers=0;
    for(const p of players)try {
      if((!trustedRoster&&!p.isValid)||!this.host.visible(p))continue;
      const s=this.host.snapshot(p),owner="viewer:"+p.id;
      this.host.terrain.protect(owner,s.store,p.location,36);this.viewerPins.add(owner);viewers++;
    } catch {}
    for(const[owner,c]of this.contexts) {
      c.now=now;
      const p=online.get(owner);
      try {
        if(!p||(!trustedRoster&&!p.isValid)) {this.cancel(owner,"Player left",false);continue;}
        const s=this.host.snapshot(p);
        if(s.store!==c.plan.store||s.dim.id!==c.plan.dim.id||(s.py!==c.plan.py&&s.dim.id==="minecraft:nether")||this.host.profile()!==c.profile||c.job.spec.radius>this.host.maxRadius(p)) {
          this.cancel(owner,"Store, layer, profile or permission changed");continue;
        }
      } catch {this.cancel(owner,"Player or terrain context unavailable",false);}
    }
    const normal=Math.max(6000,viewers*1200);
    while([...this.contexts.values()].reduce((n,c)=>n+c.job.total,0)+normal>this.host.terrain.maxTotalCols) {
      const owner=[...this.contexts.keys()].at(-1);if(owner===undefined)break;
      this.cancel(owner,"Canceled to retain normal viewers within the global cache cap");
    }
    this.capacity(normal);
    for(const c of this.contexts.values())if(now-c.lastMessage>=40) {this.send(c.player,this.describe(c));c.lastMessage=now;}
  }
  /** Cache inspections and native operations are both bounded. No independent interval/time budget.
   * @param {number} now @param {number} available @param {()=>boolean} canContinue @param {boolean} [foregroundPending] @returns {number} */
  tick(now,available,canContinue,foregroundPending=true) {
    const credits=Math.max(0,Math.floor(available)),opLimit=foregroundPending?Math.min(8,credits):credits,inspectionLimit=foregroundPending?64:Math.min(256,Math.max(64,opLimit*4));
    let ops=0,inspected=0,visits=0;const blocked=new Set();
    while(inspected<inspectionLimit&&this.contexts.size&&visits++<inspectionLimit*2) {
      if(!canContinue())break;
      const next=this.fills.next();if(!next)break;
      const{job,ticket}=next,c=this.contexts.get(job.spec.owner);if(!c)continue;
      c.now=now;
      if(blocked.has(job.spec.owner)) {if(blocked.size>=this.contexts.size)break;continue;}
      inspected++;this.stats.inspections++;const owner=job.spec.owner,store=c.plan.store;
      if(job.canceled||this.fills.jobs.get(owner)!==job) {blocked.add(owner);continue;}
      if((ticket.x-job.spec.center.x)**2+(ticket.z-job.spec.center.z)**2>job.spec.radius**2) {job.settle(ticket,"failed");this.stats.failed++;continue;}
      const sample=store.cols.get(ticket.key);
      if(sample&&sample.valid!==false&&now-sample.tick<=2400) {
        job.settle(ticket,"mapped");c.reused++;this.stats.reused++;c.lastProgress=now;c.waiting="";this.stats.completed++;
      } else {
        const key=store.id+"|"+ticket.key,lease=this.host.pending.get(key),miss=store.miss.get(ticket.key);
        if(lease&&lease.manualOwner!==owner) {c.waiting="shared reader";blocked.add(owner);this.stats.deferred++;continue;}
        if(miss!==undefined&&now-miss<5) {c.waiting="terrain retry backoff";blocked.add(owner);continue;}
        if(ops>=opLimit||!canContinue()) {c.waiting="foreground mapping or elapsed budget";blocked.add(owner);continue;}
        if(!this.host.terrain.makeRoom(store,ticket.x,ticket.z,COL,now)) {c.waiting="cache capacity";blocked.add(owner);continue;}
        if(!canContinue()){c.waiting="elapsed scanner budget";this.stats.deferred++;break;}
        const pick={wx:ticket.x,wz:ticket.z,key:ticket.key,resolution:COL,queuedAt:c.plan.at,since:now};c.plan.picks=[pick];
        const result=this.host.step(c.plan,pick,now);ops++;this.stats.nativeSteps++;
        if(this.contexts.get(owner)!==c||job.canceled)continue;
        if(result==="mapped") {
          const actual=store.cols.get(ticket.key);
          if(actual&&actual.valid!==false&&actual.tick===now) {job.settle(ticket,"mapped");c.sampled++;this.stats.sampled++;this.stats.completed++;}
          else {job.settle(ticket,"failed");this.stats.failed++;}
          c.lastProgress=now;
        } else if(result==="unavailable"||result==="failed") {job.settle(ticket,result);this.stats[result]++;c.lastProgress=now;}
        else if(result==="canceled") {this.cancel(owner,"Reader context canceled");continue;}
        else if(result==="capacity") {c.waiting="cache capacity";blocked.add(owner);continue;}
        c.waiting="";
      }
      if(job.finished) {
        const message="Processed request. "+this.describe(c)+" Shared RAM only; later edits/eviction can change retention. Unavailable terrain was not force-loaded; move and scan again.";
        this.send(c.player,message);this.remember(owner,message);this.contexts.delete(owner);this.fills.retire(owner);this.host.terrain.unprotect("scan:"+owner);
        if(!this.contexts.size)this.clearViewerPins();
      }
    }
    return ops;
  }
}
