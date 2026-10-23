// CURRENT snapshot counter parity and fixed-raster work only; no native CPU claim.
import assert from "node:assert/strict";
import test from "node:test";
import { RADAR_PIXELS, snapshotCoverage, rasterCadenceReady } from "../packs/map_bp/scripts/raster-work.js";
const SIZE=33*33;
const inside=i=>(i%33-16)**2+(Math.floor(i/33)-16)**2<=256;
function make(){const flags=new Uint8Array(SIZE),ticks=new Float64Array(SIZE),coarseX=new Float64Array(SIZE),coarseZ=new Float64Array(SIZE);for(let i=0;i<SIZE;i++){if(!inside(i))flags[i]=32;coarseX[i]=(i%33-16)*2;coarseZ[i]=(Math.floor(i/33)-16)*2;}return{flags,ticks,geometry:{coarseX,coarseZ}};}
// Frozen current full1089 loop, with independently added expiry bookkeeping. Includes estimated64 counters.
function reference(g,flags,ticks,at,radius,now,maxAge){const out={firstTick:now,detailCells:0,previewCells:0,unknownCells:0,eligibleCells:0,eligibleKnownCells:0,eligibleDetailCells:0,sampled2:0,live2:0,persisted2:0,validEmpty2:0,invalidated2:0,totalCells:0,maskExcludedCells:0,estimatedCells:0,eligibleEstimatedCells:0,nextExpiry:Infinity};for(let i=0;i<flags.length;i++){const f=flags[i];if(f&32){out.maskExcludedCells++;continue;}out.totalCells++;const valid=!!(f&1),preview=!!(f&8),estimated=!!(f&64);if(valid)out.detailCells++;else if(preview)out.previewCells++;else if(estimated)out.estimatedCells++;else out.unknownCells++;if((g.coarseX[i]-at.x)**2+(g.coarseZ[i]-at.z)**2>radius*radius)continue;out.eligibleCells++;if(estimated)out.eligibleEstimatedCells++;if(f&16)out.invalidated2++;if(valid||preview)out.eligibleKnownCells++;if(!valid)continue;out.eligibleDetailCells++;out.sampled2++;if(f&2)out.persisted2++;else if(now-ticks[i]<=maxAge){out.live2++;out.nextExpiry=Math.min(out.nextExpiry,ticks[i]+maxAge+1);}if(f&4)out.validEmpty2++;}return out;}

test("fixed797 entries are deeply frozen, row-major and keep original33-grid/34-wire offsets",()=>{
 assert.equal(RADAR_PIXELS.length,797);assert.ok(Object.isFrozen(RADAR_PIXELS));assert.equal(new Set(RADAR_PIXELS.map(p=>p.index)).size,797);
 assert.deepEqual(RADAR_PIXELS.map(p=>p.index),Array.from({length:SIZE},(_,i)=>i).filter(inside));
 for(const p of RADAR_PIXELS){assert.ok(Object.isFrozen(p));assert.equal(p.piece,Math.floor(p.index/33)*34+p.index%33);}
 assert.equal(RADAR_PIXELS[0].index,16);assert.equal(RADAR_PIXELS.at(-1).piece,1104);
});

test("300 seeded CURRENT raster snapshots preserve every genuine/estimate/tombstone counter",()=>{
 let seed=0x38f02d21;const random=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 const kinds=[0,1,3,5,7,8,16,32,64],ages=[-10,0,1,9,10,11,100,Infinity];
 for(let round=0;round<300;round++){const s=make(),now=100+round,at={x:(random()%100-50)/10,z:(random()%100-50)/10},radius=8+random()%40;for(const{index:i}of RADAR_PIXELS){s.flags[i]=kinds[random()%kinds.length];s.ticks[i]=now-ages[random()%ages.length];}const beforeFlags=s.flags.slice(),beforeTicks=s.ticks.slice();assert.deepEqual(snapshotCoverage(s.geometry,s.flags,s.ticks,at,radius,now,10),reference(s.geometry,s.flags,s.ticks,at,radius,now,10));assert.deepEqual(s.flags,beforeFlags);assert.deepEqual(s.ticks,beforeTicks);}
});

test("estimates never become actual/live/known; valid empty and tombstones stay distinct",()=>{
 const s=make(),indices=RADAR_PIXELS.filter(p=>Math.abs(s.geometry.coarseX[p.index])<8&&Math.abs(s.geometry.coarseZ[p.index])<8).map(p=>p.index);
 const [a,b,c,d,e,f]=indices;s.flags[a]=1;s.ticks[a]=20;s.flags[b]=3;s.ticks[b]=1;s.flags[c]=5;s.ticks[c]=20;s.flags[d]=16;s.flags[e]=64;s.ticks[e]=20;s.flags[f]=8;
 const out=snapshotCoverage(s.geometry,s.flags,s.ticks,{x:0,z:0},36,25,5);
 assert.equal(out.detailCells,3);assert.equal(out.sampled2,3);assert.equal(out.live2,2);assert.equal(out.persisted2,1);assert.equal(out.validEmpty2,1);assert.equal(out.invalidated2,1);assert.equal(out.previewCells,1);assert.equal(out.estimatedCells,1);assert.equal(out.eligibleEstimatedCells,1);assert.equal(out.eligibleKnownCells,4);assert.equal(out.nextExpiry,26);assert.equal(out.maskExcludedCells,292);assert.equal(out.totalCells,797);
});

test("nextExpiry uses exact maxAge+1 boundary and excludes outside-policy or persisted cells",()=>{
 const s=make(),center=16*33+16,edge=16;s.flags[center]=1;s.ticks[center]=10;s.flags[edge]=1;s.ticks[edge]=-100;
 assert.equal(snapshotCoverage(s.geometry,s.flags,s.ticks,{x:0,z:0},4,20,10).nextExpiry,21);
 const expired=snapshotCoverage(s.geometry,s.flags,s.ticks,{x:0,z:0},4,21,10);assert.equal(expired.live2,0);assert.equal(expired.nextExpiry,Infinity);
 s.flags[center]=3;assert.equal(snapshotCoverage(s.geometry,s.flags,s.ticks,{x:0,z:0},4,20,10).nextExpiry,Infinity);
});

test("fixed mask never reads geometric coordinates outside797, including stale outside scratch flags",()=>{
 const s=make();s.flags.fill(0);let reads=0;
 const wrap=array=>new Proxy(array,{get(target,key){if(typeof key==="string"&&/^\d+$/.test(key)){const i=Number(key);assert.ok(inside(i));reads++;return target[i];}return Reflect.get(target,key,target);}});
 const out=snapshotCoverage({coarseX:wrap(s.geometry.coarseX),coarseZ:wrap(s.geometry.coarseZ)},s.flags,s.ticks,{x:0,z:0},36,100,10);
 assert.equal(reads,797*2);assert.equal(out.totalCells,797);assert.equal(out.maskExcludedCells,292);assert.equal(out.unknownCells,797);
});

test("inside explicit mask adds one exclusion rather than double-counting the292 fixed outside cells",()=>{
 const s=make();s.flags[16*33+16]=32;const out=snapshotCoverage(s.geometry,s.flags,s.ticks,{x:0,z:0},36,10,5);
 assert.equal(out.totalCells,796);assert.equal(out.maskExcludedCells,293);
});

test("movement/origin key change bypasses2tick sample batching while stationary cadence still waits",()=>{
 assert.equal(rasterCadenceReady("old","new",10,10,1),true);assert.equal(rasterCadenceReady(undefined,"new",10,10,1),true);
 assert.equal(rasterCadenceReady("same","same",undefined,10,1),true);
 assert.equal(rasterCadenceReady("same","same",10,10,1),false);assert.equal(rasterCadenceReady("same","same",10,11,1),false);assert.equal(rasterCadenceReady("same","same",10,12,1),true);
 assert.equal(rasterCadenceReady("same","same",10,12,3),false);assert.equal(rasterCadenceReady("same","same",10,13,3),true);
 assert.equal(rasterCadenceReady("same","same",20,10,1),false);
});
