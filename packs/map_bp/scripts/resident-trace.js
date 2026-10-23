// Bounded, opt-in diagnostic buffer. No game APIs, timers, chat, persistence or wire traffic.
export class ResidentTrace {
  playerId = "";
  enabled = false;
/** @type {any[]} */
  events = [];
  dropped = 0;
  started = 0;
  current = {x:0,z:0};
  last = new Map();
  frames = new Map();
/** @type {any} */
  visible = undefined;
  /** @param {string} playerId @param {number} tick */
  start(playerId, tick) { this.playerId=playerId;this.enabled=true;this.started=tick;this.events=[];this.dropped=0;this.last.clear();this.frames.clear();this.visible=undefined; }
  /** @param {string} playerId */
  active(playerId) { return this.enabled && playerId===this.playerId; }
  /** @param {string} tag @param {any} frame */
  frame(tag, frame) { if(!this.enabled)return; if(this.frames.size>=16)this.frames.delete(this.frames.keys().next().value);this.frames.set(tag,frame); }
  /** @param {string} playerId @param {number} tick @param {string} stage @param {string} reason @param {any} [data] */
  note(playerId,tick,stage,reason,data={}) {
    if(!this.active(playerId))return;
    if(Number.isFinite(data.x)&&Number.isFinite(data.z))this.current={x:data.x,z:data.z};
    const key=reason+"|"+(data.view??"")+"|"+(data.tag??"")+"|"+(data.x??"")+"|"+(data.z??"");
    const prior=this.last.get(stage);
    if(prior && prior.key===key){prior.row.end=tick;prior.row.count++;prior.row.last=data;return;}
    if(this.events.length>=256){this.dropped++;return;}
    const row={tick,end:tick,count:1,stage,reason,...data};this.events.push(row);this.last.set(stage,{key,row});
    if(stage==="side"&&(reason==="native_return"||reason==="receipt_accept")) { const f=this.frames.get(data.tag);if(f)this.visible={...f,tag:data.tag,submitted:tick};else if(reason==="native_return")this.visible=undefined; }
  }
  /** @param {number} tick @param {number} x @param {number} z */
  older(tick,x,z) { const v=this.visible;return v?{visibleTag:v.tag,visibleView:v.view,frameAge:Number.isFinite(v.built)?tick-v.built:null,submissionAge:tick-v.submitted,dx:x-v.x,dz:z-v.z}: {visibleTag:null,frameAge:null,submissionAge:null}; }
  /** @param {number} [offset] */
  page(offset=0) { const at=Math.max(0,Math.floor(offset));return {started:this.started,enabled:this.enabled,total:this.events.length,dropped:this.dropped,offset:at,next:Math.min(at+2,this.events.length),events:this.events.slice(at,at+2)}; }
  stop() { this.enabled=false; }
}
