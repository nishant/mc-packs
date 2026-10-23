import {fixture as actualFixture} from "./map-movement-fixture.mjs";
import {circleAnchors} from "../packs/map_bp/scripts/terrain-work.js";
// Offline RAM-capacity reproduction only. No scanner, native IO, persistence or quotas are modified.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { COL, TerrainWorld, colKey, northUpRadarGeometry, retainVisible, sampleCoord } from "../packs/map_bp/scripts/terrain.js";
import { CONFIG } from "../packs/map_bp/scripts/config.js";
import { SCAN_POLICY } from "../packs/map_bp/scripts/scan-policy.js";
const OW="minecraft:overworld", COUNT=40, RADIUS=36, HALF=16, SPACING=128;
const main=fs.readFileSync(new URL("../packs/map_bp/scripts/main.js",import.meta.url),"utf8");
const min=Number(main.match(/^const STORE_MIN = (\d+);/m)?.[1]);
const each=Number(main.match(/^const STORE_PER_VIEWER = (\d+);/m)?.[1]);
const actual=actualFixture(0);actual.api.manualScans.capacity(COUNT*each);const productionCap=actual.api.terrain.maxCols;
// Independent Main eligibility formula, applied to canonical2 sample anchors, never square corners.
const policyPointRadius=(x,z,at)=> (x-at.x)**2+(z-at.z)**2<=RADIUS**2;
const required=new Map();
const views=Array.from({length:COUNT},(_,i)=>{
  const at={x:i*SPACING+.1,z:.1};
  const geometry=northUpRadarGeometry(OW+"|surface",Math.round(at.x),Math.round(at.z),RADIUS,HALF);
  const points=new Map();
  for(const a of circleAnchors(at,RADIUS,sampleCoord,colKey)){assert.ok(!required.has(a.key));points.set(a.key,{key:a.key,x:a.x,z:a.z});required.set(a.key,{key:a.key,x:a.x,z:a.z,owner:i});}
  assert.equal(points.size,1020);
  return {at,geometry,points};
});
const RAW={kind:"stone",y:64,depth:0,palette:146};
function coverage(store){
  const rows=views.map((v,actor)=>{let known=0;for(const key of v.points.keys())if(store.cols.get(key)?.valid===true)known++;return {actor,known,total:v.points.size,fraction:known/v.points.size};});
  return {rows,known:rows.reduce((n,r)=>n+r.known,0),missing:required.size-rows.reduce((n,r)=>n+r.known,0),minimum:Math.min(...rows.map(r=>r.fraction)),below50:rows.filter(r=>r.fraction<.5).length};
}
function renderRetention(store,view,now){
  // Match Main's full1089-cell coarse traversal: a known entry receives the real bounded retainVisible bit.
  for(const key of view.geometry.coarseKey){const c=store.cols.get(key);if(c)retainVisible(store,key,now);}
}
function run(capacity){
  const world=new TerrainWorld(capacity),store=world.store(OW),completed=new Set(),paint=[];
  let initialPuts=0;
  for(const [i,view]of views.entries()){
    for(const p of view.points.values()){
      assert.equal(world.put(store,p.x,p.z,RAW,100+i,COL),true);
      assert.ok(store.cols.get(p.key)?.valid);completed.add(p.key);initialPuts++;
      assert.ok(store.cols.size<=capacity);
    }
    renderRetention(store,view,100+i);
    paint.push([...view.points.keys()].filter(k=>store.cols.has(k)).length);
  }
  const initial=coverage(store),initialKeys=new Set(store.cols.keys());
  let secondPuts=0;const secondRestored=new Set();
  for(const [i,view]of views.entries()){
    for(const p of view.points.values())if(!store.cols.has(p.key)){
      assert.equal(world.put(store,p.x,p.z,RAW,200+i,COL),true);secondRestored.add(p.key);secondPuts++;
    }
    renderRetention(store,view,200+i);
    assert.ok(store.cols.size<=capacity);
  }
  const second=coverage(store);
  const lostSinceInitial=[...initialKeys].filter(k=>!store.cols.has(k)).length;
  assert.equal(store.fine.size,0);assert.equal(store.preview.size,0);assert.equal(store.coarse.size,store.cols.size);
  assert.ok([...store.cols.keys()].every(k=>required.has(k)),"every retained/evicted key belongs to a CURRENT required view");
  return {capacity,required:required.size,initialPuts,uniqueCompleted:completed.size,minimumAtOwnPaint:Math.min(...paint),initial,second,secondPuts,restoredUnique:secondRestored.size,lostSinceInitial,entries:store.cols.size};
}
const cases=new Map();const measured=cap=>{if(!cases.has(cap))cases.set(cap,run(cap));return cases.get(cap);};
const report=r=>({capacity:r.capacity,required:r.required,initialPuts:r.initialPuts,uniqueCompleted:r.uniqueCompleted,minimumAtOwnPaint:r.minimumAtOwnPaint,initialMissing:r.initial.missing,initialMinPct:100*r.initial.minimum,initialBelow50:r.initial.below50,secondPuts:r.secondPuts,restoredUnique:r.restoredUnique,secondMissing:r.second.missing,secondMinPct:100*r.second.minimum,secondBelow50:r.second.below50,lostSinceInitial:r.lostSinceInitial,entries:r.entries});
test("40 real north-up views require40800 unique legal2 cells in one shared Overworld store",()=>{
  assert.equal(COL,2);assert.equal(CONFIG.radarCells,33);assert.equal(CONFIG.radarRadius,36);assert.equal(CONFIG.revealRadius,36);assert.equal(CONFIG.fineDetail,false);assert.equal(required.size,40800);assert.equal(each,1200);assert.equal(min,6000);
  assert.equal(actual.api.terrain.maxTotalCols,131072);assert.ok(productionCap<=actual.api.terrain.maxTotalCols);
  const w=new TerrainWorld();assert.equal(w.store(OW,4),w.store(OW,80));assert.notEqual(w.store(OW),w.store("minecraft:the_end"));assert.notEqual(w.store("minecraft:nether",68),w.store("minecraft:nether",76));
});
test("24k reproduces lost CURRENT cells and repeated stationary rescans; RAM-only48k retains all",t=>{
  const small=measured(24000),large=measured(48000);
  t.diagnostic(JSON.stringify({productionCap,limited:report(small),capacityOnlyControl:report(large)}));
  assert.equal(small.uniqueCompleted,40800);assert.equal(small.minimumAtOwnPaint,1020,"each actor was100percent before later CURRENT actors displaced it");assert.equal(small.entries,24000);assert.equal(small.initial.missing,16800);
  assert.ok(small.initial.minimum<.5&&small.second.minimum<.5,"old24k50percent failure remains explicitly reproduced");assert.ok(small.secondPuts>0);assert.ok(small.lostSinceInitial>0,"stationary restoration evicts other current completed data");
  assert.equal(large.uniqueCompleted,40800);assert.equal(large.entries,40800);assert.equal(large.initial.missing,0);assert.equal(large.secondPuts,0);assert.equal(large.second.missing,0);assert.equal(large.second.minimum,1);
});
test("CURRENT Main48k cap preserves50percent floor AND100percent completed detail for EVERY stationary actor",t=>{
  assert.equal(productionCap,48000,"read the lead capacity-only fix from actual Main");const current=measured(productionCap);t.diagnostic(JSON.stringify(report(current)));
  assert.ok(current.initial.minimum>=.5,"RED acceptance proof: currently visible completed cells dropped below50percent after initial cohort fill");
  assert.ok(current.second.minimum>=.5,"stationary actors keep the unchanged50percent floor");
  assert.equal(current.initial.missing,0);assert.equal(current.second.missing,0);assert.equal(current.second.minimum,1);assert.equal(current.secondPuts,0,"capacity-only fix needs no re-acquisition for the same stationary cohort");
});

test("RAM ceiling metadata:24Nether bands plus three standard surface stores, no preallocation or native-gain claim",t=>{const w=new TerrainWorld(48000,24);for(const dim of [OW,"minecraft:the_end","minecraft:nether"])w.store(dim);for(let i=0;i<40;i++)w.store("minecraft:nether",i*8+4);const bands=[...w.stores.keys()].filter(id=>id.includes("|layer"));assert.equal(bands.length,24);assert.equal(w.stores.size,27);assert.equal([...w.stores.values()].reduce((n,s)=>n+s.cols.size,0),0);t.diagnostic(JSON.stringify({maxBandStores:24,standardSurfaceStores:3,maxStandardStores:27,historicalPerStoreOnlyCeiling:27*48000,currentGlobalNativeEntryCeiling:w.maxTotalCols,bytesOrNativeTimingMeasured:false}));});
