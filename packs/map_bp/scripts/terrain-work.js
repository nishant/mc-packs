/** Pure scheduling/geometry helpers. No Minecraft calls, timers, or new native budget. */
/** @typedef {{x:number,z:number}} Point */
/** @typedef {Point & {key:number,d:number,visible:boolean}} Anchor */
/** @typedef {(x:number,resolution:number)=>number} SampleCoord */
/** @typedef {(x:number,z:number,resolution:number)=>number} ColKey */

/** Horizontal world-block radius. A complete canonical2 circle must still pass shared-capacity admission. */
export const MANUAL_SCAN_MAX_RADIUS = 384;
export const MANUAL_SCAN_DEFAULT_RADIUS = 64;

/** @param {number} radius @param {number} [max] */
export function validateRadius(radius, max = MANUAL_SCAN_MAX_RADIUS) {
  if (!Number.isInteger(radius) || radius < 1 || radius > max) throw new RangeError(`Radius must be an integer from 1 to ${max}.`);
  return radius;
}

/** Every canonical2 anchor inside the circle, independent of screen pixels.
 * Uses the existing module's coordinate/key functions, including negative coordinates.
 * @param {Point} center @param {number} radius @param {SampleCoord} sampleCoord @param {ColKey} colKey
 * @returns {Generator<Anchor>}
 */
export function* circleAnchors(center, radius, sampleCoord, colKey) {
  validateRadius(radius);
  if (!Number.isFinite(center.x) || !Number.isFinite(center.z)) throw new RangeError('Finite scan origin required.');
  const x0 = sampleCoord(center.x - radius, 2), z0 = sampleCoord(center.z - radius, 2);
  for (let z = z0; z <= center.z + radius; z += 2) {
    for (let x = x0; x <= center.x + radius; x += 2) {
      const d = (x - center.x) ** 2 + (z - center.z) ** 2;
      if (d > radius * radius) continue;
      const key = colKey(x, z, 2);
      if (key >= 0) yield {x, z, key, d, visible:false};
    }
  }
}

/** Clip a canonical2 segment to colKey's rectangular valid world. Its origin projection is normally valid.
 * Endpoints and binary searches avoid walking hundreds of out-of-world cells before one ticket.
 * @param {number} lo @param {number} hi @param {number} origin @param {(value:number)=>boolean} valid
 */
function clipManualSegment(lo,hi,origin,valid) {
  if(lo>hi)return undefined;
  const left=valid(lo),right=valid(hi);
  if(left&&right)return {lo,hi};
  const probe=left?lo:right?hi:Math.max(lo,Math.min(hi,origin));
  if(!left&&!right&&!valid(probe))return undefined;
  if(!left) {
    let a=0,b=(probe-lo)/2;
    while(a<b) {const m=Math.floor((a+b)/2);if(valid(lo+m*2))b=m;else a=m+1;}
    lo+=a*2;
  }
  if(!right) {
    let a=0,b=(hi-probe)/2;
    while(a<b) {const m=Math.ceil((a+b)/2);if(valid(probe+m*2))a=m;else b=m-1;}
    hi=probe+a*2;
  }
  return {lo,hi};
}

/** Manual-only lazy center-out square rings, with each edge clipped to the exact world-block circle.
 * Auto/diagnostic circleAnchors order stays unchanged. No footprint-sized array or native operation is created.
 * At most one extra empty ring is examined after the last geometric ring; rectangle clipping bounds border skips.
 * @param {Point} center @param {number} radius @param {SampleCoord} sampleCoord @param {ColKey} colKey
 * @returns {Generator<Anchor>}
 */
export function* manualCircleAnchors(center,radius,sampleCoord,colKey) {
  validateRadius(radius);
  if(!Number.isFinite(center.x)||!Number.isFinite(center.z))throw new RangeError('Finite scan origin required.');
  const cx=sampleCoord(center.x,2),cz=sampleCoord(center.z,2),radius2=radius*radius;
  if(!Number.isSafeInteger(cx)||!Number.isSafeInteger(cz))throw new RangeError('Safely addressable scan origin required.');
  const x0=sampleCoord(center.x-radius,2),z0=sampleCoord(center.z-radius,2);
  let x1=sampleCoord(center.x+radius,2),z1=sampleCoord(center.z+radius,2);
  if(x1>center.x+radius)x1-=2;if(z1>center.z+radius)z1-=2;
  /** @param {number} fixed @param {boolean} horizontal @param {number} lo @param {number} hi @param {boolean} [reverse] @returns {Generator<Anchor>} */
  function* edge(fixed,horizontal,lo,hi,reverse=false) {
    if(fixed<(horizontal?z0:x0)||fixed>(horizontal?z1:x1))return;
    const origin=horizontal?center.x:center.z,delta=fixed-(horizontal?center.z:center.x),remaining=radius2-delta**2;
    if(remaining<0)return;
    const span=Math.sqrt(remaining),left=origin-span,right=origin+span;
    let first=sampleCoord(left,2),last=sampleCoord(right,2);
    if(first<left)first+=2;if(last>right)last-=2;
    // One boundary anchor of slack protects exact d<=r*r semantics from sqrt/addition rounding.
    // The final squared-distance check rejects it in O(1), never a walk through outside corners.
    first=Math.max(first-2,lo,horizontal?x0:z0);last=Math.min(last+2,hi,horizontal?x1:z1);
    const clipped=clipManualSegment(first,last,horizontal?cx:cz,v=>colKey(horizontal?v:fixed,horizontal?fixed:v,2)>=0);
    if(!clipped)return;
    const count=(clipped.hi-clipped.lo)/2+1;
    for(let i=0;i<count;i++) {
      const axis=reverse?clipped.hi-i*2:clipped.lo+i*2,x=horizontal?axis:fixed,z=horizontal?fixed:axis;
      const d=(x-center.x)**2+(z-center.z)**2;
      if(d>radius2)continue;
      const key=colKey(x,z,2);if(key>=0)yield {x,z,key,d,visible:false};
    }
  }
  yield* edge(cz,true,cx,cx);
  const rings=Math.ceil((radius+1)/2);
  for(let ring=1;ring<=rings;ring++) {
    const reach=ring*2;
    yield* edge(cz-reach,true,cx-reach,cx+reach);
    yield* edge(cx+reach,false,cz-reach+2,cz+reach);
    yield* edge(cz+reach,true,cx-reach,cx+reach-2,true);
    yield* edge(cx-reach,false,cz-reach+2,cz+reach-2,true);
  }
}

/** Run only when the footprint changes / planning is due, never once per render pixel.
 * First queue currently displayed detail; second queue fills the intervening lattice holes.
 * Host retains validity, miss cooldown, stale refresh and request-age policy.
 * @param {Point} center @param {number} radius @param {ReadonlySet<number>} visibleKeys
 * @param {SampleCoord} sampleCoord @param {ColKey} colKey @returns {Anchor[]}
 */
export function completeFootprint(center, radius, visibleKeys, sampleCoord, colKey) {
  const out = Array.from(circleAnchors(center, radius, sampleCoord, colKey));
  for (const p of out) p.visible = visibleKeys.has(p.key);
  out.sort((a,b) => Number(b.visible) - Number(a.visible) || a.d - b.d || a.key - b.key);
  return out;
}

/** A fixed circular display mask, independent of what has finished scanning.
 * Outside pixels require a same-advance transparent glyph in the resource pack.
 * @param {number} col @param {number} row @param {number} [r]
 */
export function insideRadar(col, row, r = 16) { return col * col + row * row <= r * r; }

/** Clamp a marker to a valid integer cell on a circular edge.
 * @param {number} x @param {number} z @param {number} [r] @returns {Point}
 */
export function circularMarker(x, z, r = 16) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new RangeError('Finite marker coordinates required.');
  const length = Math.hypot(x,z), scale = length > r ? r / length : 1;
  let c = Math.round(x * scale), row = Math.round(z * scale);
  while (!insideRadar(c,row,r)) {
    if (Math.abs(c) >= Math.abs(row)) c -= Math.sign(c);
    else row -= Math.sign(row);
  }
  return {x:c,z:row};
}

/** @typedef {'mapped'|'unavailable'|'failed'} Outcome */
/** @typedef {{owner:string,storeId:string,profile:string,center:Point,radius:number}} FillSpec */
/** @typedef {{total:number,visited:number,mapped:number,unavailable:number,failed:number,remaining:number,finished:boolean,canceled:boolean}} Progress */

/** A lazy queue for ONE fixed-origin manual scan. It does not execute native reads.
 * The host dispatches its current ticket through the SAME ledger as automatic scanning.
 * At most one ticket per job is in flight; continuation keeps that ticket until completion.
 */
export class FillJob {
  /** @param {FillSpec} spec @param {SampleCoord} sampleCoord @param {ColKey} colKey */
  constructor(spec, sampleCoord, colKey) {
    validateRadius(spec.radius);
    this.spec = Object.freeze({...spec, center:Object.freeze({...spec.center})});
    // Count only coordinates; no native operations or full array of records allocated.
    this.total = 0;
    this.total = countCircleAnchors(spec.center,spec.radius,sampleCoord,colKey);
    this.cursor = manualCircleAnchors(this.spec.center,this.spec.radius,sampleCoord,colKey);
    /** @type {Anchor | undefined} */ this.pending = undefined;
    this.visited = 0; this.mapped = 0; this.unavailable = 0; this.failed = 0;
    this.finished = this.total===0; this.canceled = false;
  }
  /** @returns {Anchor | undefined} */
  peek() {
    if (this.canceled || this.finished) return undefined;
    if (this.pending) return this.pending;
    const next = this.cursor.next();
    if (next.done) { this.finished = true; return undefined; }
    this.pending = next.value;
    return this.pending;
  }
  /** Call 'mapped' only for a verified valid existing record or a committed genuine2 sample.
   * A failed query, placeholder glyph or preview is never a mapped result.
   * @param {Anchor} ticket @param {Outcome} outcome
   */
  settle(ticket, outcome) {
    if (this.canceled || this.pending !== ticket) return false;
    if (outcome !== 'mapped' && outcome !== 'unavailable' && outcome !== 'failed') throw new Error('Invalid outcome');
    this[outcome]++;
    this.visited++;
    this.pending = undefined;
    if (this.visited === this.total) this.finished = true;
    return true;
  }
  cancel() { this.canceled = true; this.pending = undefined; this.cursor.return(undefined); }
  /** @returns {Progress} */
  progress() {
    return {total:this.total,visited:this.visited,mapped:this.mapped,unavailable:this.unavailable,
      failed:this.failed,remaining:this.total-this.visited,finished:this.finished,canceled:this.canceled};
  }
}

/** Bounded job count; one job per player. No independent interval or native-operation allowance. */
export class FillJobs {
  /** @param {SampleCoord} sampleCoord @param {ColKey} colKey @param {number} [maxJobs] */
  constructor(sampleCoord, colKey, maxJobs = 8) {
    this.sampleCoord = sampleCoord; this.colKey = colKey; this.maxJobs = maxJobs;
    /** @type {Map<string,FillJob>} */ this.jobs = new Map();
    this.rotation = 0;
  }
  /** @param {FillSpec} spec */
  start(spec) {
    if (this.jobs.has(spec.owner)) throw new Error('A scan is already active. Use /realm:minimap status or /realm:minimap cancel.');
    if (this.jobs.size >= this.maxJobs) throw new Error('Scan queue is full. Try again shortly.');
    const job = new FillJob(spec,this.sampleCoord,this.colKey);
    this.jobs.set(spec.owner,job);
    return job;
  }
  /** @param {string} owner */
  cancel(owner) { const job=this.jobs.get(owner); if(job)job.cancel(); this.jobs.delete(owner); return job?.progress(); }
  /** Host checks global remaining operation/time credits BEFORE dispatching a returned ticket.
   * Round robin prevents one large request monopolizing the manual share.
   * @returns {{job:FillJob,ticket:Anchor} | undefined}
   */
  next() {
    const all = [...this.jobs.values()];
    if (!all.length) return undefined;
    for (let i=0;i<all.length;i++) {
      const job = all[this.rotation++ % all.length];
      const ticket = job.peek();
      if (ticket) return {job,ticket};
    }
    return undefined;
  }
  /** Remove only after sending final status. @param {string} owner */
  retire(owner) { const job=this.jobs.get(owner); if (job?.finished || job?.canceled) this.jobs.delete(owner); }
}

/** Parse the stable String action + Integer radius grammar, preserving the no-argument toggle.
 * Status/cancel are top-level actions: a native Integer cannot also accept the old string subcommands.
 * @param {unknown} action @param {unknown} value @param {number} [maxRadius]
 * @returns {{kind:'toggle'}|{kind:'status'}|{kind:'cancel'}|{kind:'scan',radius:number}|{kind:'error',message:string}}
 */
export function parseMinimapCommand(action,value,maxRadius=MANUAL_SCAN_MAX_RADIUS) {
  if (action === undefined && value === undefined) return {kind:'toggle'};
  if ((action === 'status' || action === 'cancel') && value === undefined) return {kind:action};
  if (action !== 'scan' && action !== 'fill') return {kind:'error',message:'Use /realm:minimap, /realm:minimap scan 64, /realm:minimap status, or /realm:minimap cancel.'};
  const radius = value === undefined ? MANUAL_SCAN_DEFAULT_RADIUS : value;
  if (typeof radius !== 'number' || !Number.isInteger(radius) || radius < 1 || radius > maxRadius) return {kind:'error',message:`Scan radius must be an integer from 1 to ${maxRadius} world blocks. Use /realm:minimap status or /realm:minimap cancel for an active scan.`};
  return {kind:'scan',radius};
}

/** Cell-aligned square candidates are cached; admission rechecks the exact circle.
 * @param {Point} center @param {number} radius @param {SampleCoord} sampleCoord @param {ColKey} colKey */
export function circleCandidates(center,radius,sampleCoord,colKey){
 validateRadius(radius);
 const x0=sampleCoord(center.x-radius,2),x1=sampleCoord(center.x+radius,2),z0=sampleCoord(center.z-radius,2),z1=sampleCoord(center.z+radius,2);
 /** @type {Anchor[]} */ const anchors=[];
 for(let z=z0;z<=z1;z+=2)for(let x=x0;x<=x1;x+=2){const key=colKey(x,z,2);if(key>=0)anchors.push({x,z,key,d:0,visible:false});}
 return {key:[radius,x0,x1,z0,z1].join("|"),anchors};
}
/** @typedef {import("./terrain.js").Pick & {d:number,stale:boolean,queuedAt:number,visible?:boolean}} LatticePick */
/** Current missing detail gets the first burst; holes retain a service share and age.
 * @param {LatticePick[]} picks @param {number} now @param {boolean} previewEnabled */
export function orderLatticeWork(picks,now,previewEnabled){
 /** @type {LatticePick[]} */ const agedVisible=[];
 /** @type {LatticePick[]} */ const freshVisible=[];
 /** @type {LatticePick[]} */ const agedHoles=[];
 /** @type {LatticePick[]} */ const freshHoles=[];
 /** @type {LatticePick[]} */ const agedPreviews=[];
 /** @type {LatticePick[]} */ const freshPreviews=[];
 /** @type {LatticePick[]} */ const agedStale=[];
 /** @type {LatticePick[]} */ const freshStale=[];
 // Age is stable during this call. Partition once instead of checking it in every comparison.
 for(const p of picks){
  if(p.stale)(now-p.queuedAt>=80?agedStale:freshStale).push(p);
  else if(p.resolution===4){if(previewEnabled)(now-p.queuedAt>=80?agedPreviews:freshPreviews).push(p);}
  else if(p.visible!==false)(now-p.queuedAt>=80?agedVisible:freshVisible).push(p);
  else(now-p.queuedAt>=80?agedHoles:freshHoles).push(p);
 }
 const agedCmp=(/** @type {LatticePick} */ a,/** @type {LatticePick} */ b)=>a.queuedAt-b.queuedAt||a.d-b.d||a.key-b.key;
 const freshCmp=(/** @type {LatticePick} */ a,/** @type {LatticePick} */ b)=>a.d-b.d||a.key-b.key;
 const visible=agedVisible.sort(agedCmp).concat(freshVisible.sort(freshCmp));
 const holes=agedHoles.sort(agedCmp).concat(freshHoles.sort(freshCmp));
 const previews=agedPreviews.sort(agedCmp).concat(freshPreviews.sort(freshCmp));
 const stale=agedStale.sort(agedCmp).concat(freshStale.sort(freshCmp));
 /** @type {LatticePick[]} */ const out=[];let v=0,h=0,p=0,s=0,round=0;
 if(agedHoles.length)out.push(holes[h++]);
 for(let i=0;i<8&&v<visible.length;i++)out.push(visible[v++]);
 while(v<visible.length||h<holes.length||p<previews.length){
  for(let i=0;i<3&&v<visible.length;i++)out.push(visible[v++]);
  if(h<holes.length)out.push(holes[h++]);
  if(p<previews.length)out.push(previews[p++]);
  if(++round%4===0&&s<stale.length)out.push(stale[s++]);
 }
 while(s<stale.length)out.push(stale[s++]);return out;
}

/** Count a circle by rows without allocating tens of thousands of ticket objects.
 * Reconcile the few sqrt-boundary anchors with circleAnchors' exact squared-distance test.
 * Real colKey has rectangular world bounds; boundary rows use exact fallback validation.
 * @param {Point} center @param {number} radius @param {SampleCoord} sampleCoord @param {ColKey} colKey */
export function countCircleAnchors(center,radius,sampleCoord,colKey) {
  validateRadius(radius);
  if(!Number.isFinite(center.x)||!Number.isFinite(center.z))throw new RangeError("Finite scan origin required.");
  const minX=sampleCoord(center.x-radius,2),radius2=radius*radius;
  let maxX=sampleCoord(center.x+radius,2),total=0;
  if(maxX>center.x+radius)maxX-=2;
  for(let z=sampleCoord(center.z-radius,2);z<=center.z+radius;z+=2) {
    const dz2=(z-center.z)**2,left=radius2-dz2;if(left<0)continue;
    const span=Math.sqrt(left);
    let x0=Math.max(minX,sampleCoord(center.x-span,2)-2),x1=Math.min(maxX,sampleCoord(center.x+span,2)+2);
    // At most two extra candidates on either side; never walk the full row for circle membership.
    while(x0<=x1&&(x0-center.x)**2+dz2>radius2)x0+=2;
    while(x0<=x1&&(x1-center.x)**2+dz2>radius2)x1-=2;
    if(x1<x0)continue;
    if(colKey(x0,z,2)>=0&&colKey(x1,z,2)>=0)total+=(x1-x0)/2+1;
    else for(let x=x0;x<=x1;x+=2)if(colKey(x,z,2)>=0)total++;
  }
  return total;
}

/** Logical cells protected by the8px cardinal badges at the calibrated33-grid edge. @param {number} [r] */
export function radarBadgeCells(r=16){const seen=new Set();/** @type {Point[]} */const out=[];for(let d=0;d<3;d++)for(let x=-1;x<=1;x++)for(const[c,row]of[[x,-r+d],[x,r-d],[-r+d,x],[r-d,x]]){const key=c+"|"+row;if(!seen.has(key)&&insideRadar(c,row,r)){seen.add(key);out.push({x:c,z:row});}}return out;}
/** Bounded circular-safe collision alternatives, including inward cells. @param {number} c @param {number} row @param {number} [r] */
export function circularMarkerNeighbors(c,row,r=16){/** @type {Point[]} */const out=[];for(let d=1;d<=3;d++)for(let z=-d;z<=d;z++)for(let x=-d;x<=d;x++){if(Math.max(Math.abs(x),Math.abs(z))!==d)continue;const a=c+x,b=row+z;if((a||b)&&insideRadar(a,b,r))out.push({x:a,z:b});}return out;}
