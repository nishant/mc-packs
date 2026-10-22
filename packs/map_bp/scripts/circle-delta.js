// Pure canonical2 membership differences. No world/store reads, native calls, or scheduling policy.
import {validateRadius} from "./terrain-work.js";

/** @typedef {{x:number,z:number}} Point */
/** @typedef {(x:number,z:number,resolution:number)=>number} ColKey */
/** @typedef {{kind:'entered'|'exited',x:number,z:number,key:number}} CircleChange */
/** @typedef {{x:number,z:number,x0:number,x1:number,z0:number,z1:number}} Bounds */
/** @typedef {{lo:number,hi:number}} Span */

/** Same canonical anchor as terrain.sampleCoord(w, 2), without importing terrain or its palette data.
 * @param {number} value */
const sample2=value=>Math.floor(value/2)*2+1;

/** Snapshot caller-owned positions before any lazy work; never retain a mutable pose reference.
 * @param {Point} center @param {number} radius @param {string} label @returns {Bounds} */
function boundsOf(center,radius,label) {
  if(!center||!Number.isFinite(center.x)||!Number.isFinite(center.z))throw new RangeError(`Finite ${label} circle center required.`);
  const x=center.x,z=center.z,x0=sample2(x-radius),z0=sample2(z-radius);
  let x1=sample2(x+radius),z1=sample2(z+radius);
  if(x1>x+radius)x1-=2;if(z1>z+radius)z1-=2;
  if(!Number.isSafeInteger(x0)||!Number.isSafeInteger(x1)||!Number.isSafeInteger(z0)||!Number.isSafeInteger(z1))throw new RangeError(`Safely addressable ${label} circle center required.`);
  return {x,z,x0,x1,z0,z1};
}

/** One exact row of circleAnchors, including its bounding-box and IEEE squared-distance semantics.
 * Sqrt narrows the search; at most two candidates per side reconcile floating-point edge rounding.
 * @param {Bounds} circle @param {number} z @param {number} radius2 @returns {Span|undefined} */
function rowSpan(circle,z,radius2) {
  if(z<circle.z0||z>circle.z1)return undefined;
  const dz2=(z-circle.z)**2,remaining=radius2-dz2;
  if(remaining<0)return undefined;
  const reach=Math.sqrt(remaining);
  let lo=Math.max(circle.x0,sample2(circle.x-reach)-2),hi=Math.min(circle.x1,sample2(circle.x+reach)+2);
  while(lo<=hi&&(lo-circle.x)**2+dz2>radius2)lo+=2;
  while(lo<=hi&&(hi-circle.x)**2+dz2>radius2)hi-=2;
  return lo<=hi?{lo,hi}:undefined;
}

/** @param {number} lo @param {number} hi @param {number} z @param {'entered'|'exited'} kind @param {ColKey} colKey @returns {Generator<CircleChange>} */
function* emit(lo,hi,z,kind,colKey) {
  for(let x=lo;x<=hi;x+=2) {
    const key=colKey(x,z,2);
    if(key>=0)yield {kind,x,z,key};
  }
}

/** Emit at most two disjoint intervals, never walk the unchanged middle or a teleport gap.
 * @param {Span|undefined} a @param {Span|undefined} b @param {number} z
 * @param {'entered'|'exited'} kind @param {ColKey} colKey @returns {Generator<CircleChange>} */
function* subtract(a,b,z,kind,colKey) {
  if(!a)return;
  if(!b) {yield* emit(a.lo,a.hi,z,kind,colKey);return;}
  if(a.lo<b.lo)yield* emit(a.lo,Math.min(a.hi,b.lo-2),z,kind,colKey);
  if(a.hi>b.hi)yield* emit(Math.max(a.lo,b.hi+2),a.hi,z,kind,colKey);
}

/** Merge two short row streams instead of walking the coordinate gap after a teleport.
 * @param {Bounds} oldCircle @param {Bounds} nextCircle @param {number} radius @param {ColKey} colKey
 * @returns {Generator<CircleChange>} */
function* changes(oldCircle,nextCircle,radius,colKey) {
  if(oldCircle.x===nextCircle.x&&oldCircle.z===nextCircle.z)return;
  const radius2=radius*radius;
  let oldZ=oldCircle.z0,nextZ=nextCircle.z0;
  while(oldZ<=oldCircle.z1||nextZ<=nextCircle.z1) {
    let z;
    if(oldZ>oldCircle.z1) {z=nextZ;nextZ+=2;}
    else if(nextZ>nextCircle.z1) {z=oldZ;oldZ+=2;}
    else if(oldZ<nextZ) {z=oldZ;oldZ+=2;}
    else if(nextZ<oldZ) {z=nextZ;nextZ+=2;}
    else {z=oldZ;oldZ+=2;nextZ+=2;}
    const oldSpan=rowSpan(oldCircle,z,radius2),nextSpan=rowSpan(nextCircle,z,radius2);
    yield* subtract(oldSpan,nextSpan,z,'exited',colKey);
    yield* subtract(nextSpan,oldSpan,z,'entered',colKey);
  }
}

/** Lazy exact canonical2 ENTERED/EXITED geometry, not cache freshness or native-read demand.
 * Interface: horizontal integer world-block radius follows circleAnchors' supported range; step must be 2.
 * Origins are snapshotted at this call, including when the iterator is resumed after movement.
 * Rows ascend by z; within a row exits precede entries, with each kind ascending by x. No duplicate keys per kind.
 * Cost is O(oldRows + newRows + geometricDeltaPoints), O(1) live memory. Only difference candidates call colKey.
 * A negative key is filtered just as circleAnchors filters it; no full-footprint keys, arrays, or Sets are built.
 * Callers retain their own stale/invalid/retry/age/continuation policy; unchanged membership is not proof of freshness.
 * @param {Point} oldCenter @param {Point} newCenter @param {number} radius @param {number} step @param {ColKey} colKey
 * @returns {Generator<CircleChange>}
 */
export function circleDelta(oldCenter,newCenter,radius,step,colKey) {
  validateRadius(radius);
  if(step!==2)throw new RangeError('Circle delta supports canonical 2-block steps only.');
  if(typeof colKey!=='function')throw new TypeError('Circle delta requires a canonical column-key function.');
  return changes(boundsOf(oldCenter,radius,'old'),boundsOf(newCenter,radius,'new'),radius,colKey);
}
