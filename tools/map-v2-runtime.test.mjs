// Actual production v2 VM tests. No BDS/native/client execution or timing certification.
import assert from "node:assert/strict";
import nodeTest from "node:test";
const test=(name,...args)=>nodeTest("Retained persistence-host diagnostic (not default V1/V2): "+name,...args);
import { fixture as actualFixture, plain } from "./map-v2-fixture.mjs";
import { BALANCED } from "../packs/map_bp/scripts/map-profile.js";
const fixture=(count=1,options={})=>actualFixture(count,{...options,profile:{...BALANCED,persistence:true,preview:true,...options.profile,...(options.config?.nativeTerrain===false?{palette:"material"}:{})}});
import { COL, PREVIEW, colKey, sampleCoord } from "../packs/map_bp/scripts/terrain.js";
import { G } from "../packs/map_bp/scripts/glyphs.js";
const pick=(wx,wz,resolution=COL)=>({wx,wz,resolution,key:colKey(wx,wz,resolution)});
function seed(f,picks,index=0){const p=f.roster[index],plan=f.api.planFor(p,1);plan.picks=picks.map(q=>({...q,queuedAt:1,since:1}));plan.pos=0;return plan;}
const raw=c=>({kind:c.kind,y:c.y,depth:c.depth,...(c.palette===undefined?{}:{palette:c.palette})});
const native=f=>f.queries.filter(q=>q[0]!=="entities");
function detail(f,now){f.context.system.currentTick=now;f.event("realm:map_debug",{action:"detail",player:"p0"});const text=f.messages.filter(m=>m[0]==="event"&&m[1]==="realm:map_state").at(-1)[2];assert.ok(text.length<2048);return JSON.parse(text).detail;}
function paint(f,now){f.context.system.currentTick=now;f.api.rebuildBudget.tick();f.api.drawBudget.tick();let v=f.api.views.get("p0");if(!v){f.api.pass(f.roster[0],f.roster,[],now);v=f.api.views.get("p0");}return f.api.render(f.roster[0],v,now,false,0,f.roster[0].state.at);}
function acquire(f,x=3,z=3){const p=seed(f,[pick(x,z)]);for(let t=2;t<=10&&!p.store.cols.has(colKey(x,z,COL));t++)f.scan(t);assert.ok(p.store.cols.has(colKey(x,z,COL)));return p;}
// Recipe isolation only: never changes the source policy or the real benchmark arm.
function policyFixture(previewScanning,count=1,options={}){const f=fixture(count,{...options,profile:{...options.profile,preview:previewScanning}});f.context.SCAN_POLICY=Object.freeze({...f.context.SCAN_POLICY,previewScanning});return f;}

test("default fine1 is off and genuine2 has Native completion service before coarse-only completion",()=>{
 const f=fixture(1);assert.equal(f.config.fineDetail,false);f.emit("worldLoad");
 for(let tick=1;tick<=12;tick++)f.tick(tick);
 assert.ok(f.api.counters().scanReads>0,"actual production scanner advances Native thunks");
 assert.ok(f.puts.length>0);assert.equal(f.puts[0][5],COL,"detail service begins with genuine2, not an entire preview phase");
 for(const p of f.api.scanPlans.values())assert.ok(p.picks.every(k=>k.resolution!==1));
 for(const s of f.api.terrain.stores.values())assert.equal(s.fine.size,0);
 assert.equal(f.api.detailCost.nativeCompleted,f.api.queue.nativeSuccess,"each completed2 or Native4's actual2 seed records one genuine2 result");
 assert.equal(f.api.counters().scanReads,native(f).length,"operations, continuations and completed samples are not conflated");
 assert.ok(f.warnings.every(x=>x.includes("[map-lab]")||x.startsWith("[map] Oak terrain with marked display estimates")),"only explicit experimental profile notice");
});

test("partial and failed readers never note detail; actual done2 notes raw kind/height/palette",()=>{
 const f=fixture(1,{profile:{ops:1}}),p=seed(f,[pick(3,3)]);
 f.scan(2);assert.equal(f.api.counters().scanReads,1);assert.equal(f.api.detailCost.nativeCompleted,0);assert.equal(f.api.detailPersistence.stats().residentPages,0);assert.equal(p.store.cols.size,0);assert.equal(f.api.pendingTerrain.size,1);
 f.scan(3);assert.equal(f.api.counters().scanReads,2);assert.equal(f.api.detailCost.nativeCompleted,1);
 const stored=p.store.cols.get(colKey(3,3,COL));assert.ok(stored?.valid);const known=f.api.detailPersistence.lookup(p.store.id,3,3,10150);assert.equal(known.state,"known");assert.deepEqual(raw(known.sample),raw(stored));assert.equal(known.sample.acquiredAtMs,10150);
 const failed=fixture(1),miss=seed(failed,[pick(1,1)]);failed.failWhen(()=>true);failed.scan(2);
 assert.ok(failed.api.queue.nativeMiss>0);assert.equal(failed.api.detailCost.nativeCompleted,0);assert.equal(failed.api.detailPersistence.stats().residentPages,0);assert.equal(miss.store.cols.size,0);
});

test("completed Native4 persists exactly its ONE actual canonical2 point, not its painted footprint",()=>{
 const f=fixture(1,{profile:{ops:2}}),p=seed(f,[pick(-1,3,PREVIEW)]);f.scan(2);
 assert.equal(f.api.detailCost.nativeCompleted,1);assert.equal(p.store.coarse.size,1);
 const exact=f.api.detailPersistence.lookup(p.store.id,-1,3,10100);assert.equal(exact.state,"known");assert.deepEqual(raw(exact.sample),raw(p.store.cols.get(colKey(-1,3,COL))));
 for(const [x,z]of [[-3,1],[-1,1],[-3,3]])assert.notEqual(f.api.detailPersistence.lookup(p.store.id,x,z,10100).state,"known",`${x},${z} was never sampled`);
});

test("resident DETAIL raw data restores missing live2 RAM without any Native or property IO",()=>{
 const f=fixture(1);f.emit("worldLoad");const p=seed(f,[pick(3,3)]);
 // Ready detail hydration gets its bounded first opportunity before native fallback. Drive the actual shared pump.
 for(let tick=2;tick<=10&&!p.store.cols.has(colKey(3,3,COL));tick++){f.readPump(tick);f.scan(tick);}
 const original={...p.store.cols.get(colKey(3,3,COL))};assert.ok(original.valid);
 // Decode outstanding footprint pages before this one-point RESIDENT replay oracle; these are not timed as RAM replay.
 for(let t=original.tick+1;t<=original.tick+12;t++)f.readPump(t);
 assert.equal(f.api.detailPersistence.needsLoad,false);assert.equal(f.api.previewPersistence.stats().pending,0);
 p.store.cols.clear();p.store.coarse.clear();p.store.fine.clear();
 const beforeQueries=native(f).length,beforeIO=f.io.length,evictedAt=original.tick+13;
 f.context.system.currentTick=evictedAt;
 f.api.radarOf(0,[],36,true,f.roster[0].state.at,"minecraft:overworld",true,"p0",true,evictedAt);
 assert.equal(p.store.cols.size,0,"read-only raster must not perform the replay");
 const plan=f.api.planFor(f.roster[0],evictedAt);assert.ok(plan?.picks.some(k=>k.key===colKey(3,3,COL)));
 let restored,published;
 for(let t=evictedAt;t<=evictedAt+4;t++){f.readPump(t);paint(f,t);restored=p.store.cols.get(colKey(3,3,COL));published=detail(f,t);if(restored?.valid&&published.published2>=1)break;}
 assert.ok(restored?.valid);assert.equal(restored.source,"persisted");assert.deepEqual(raw(restored),raw(original));assert.equal(restored.acquiredAtMs,original.acquiredAtMs);
 assert.ok(published.published2>=1&&published.publicationTick<=evictedAt+4,"one genuinely resident raw2 point publishes within4 ticks, not a whole-viewport latency claim");
 assert.equal(native(f).length,beforeQueries);assert.equal(f.io.length,beforeIO);assert.ok(f.api.detailCost.hydrated>=1);
});

test("shared measured pumps allow at most one property GET and one SET total per tick across both families",()=>{
 const f=fixture(1);f.emit("worldLoad");const store=f.api.terrain.store("minecraft:overworld");
 f.api.detailPersistence.lookup(store.id,3,3,10000);f.api.previewPersistence.request(store.id,3,3);
 for(let tick=1;tick<=6;tick++)f.readPump(tick);
 assert.ok(f.api.detailPersistence.note(store.id,3,3,{kind:"stone",y:64,depth:0,palette:100},10300));
 assert.ok(f.api.previewPersistence.note(store.id,3,3,G.Q_STONE,10300));
 const writer=f.intervals.find(i=>i.fn.toString().includes("detailPersistence.flushOne"));assert.equal(writer.period,2,"actual registered write-pump opportunity cadence");
 for(let tick=20;tick<=400;tick+=20){f.readPump(tick);f.writePump(tick);}
 for(let tick=1;tick<=400;tick++)for(const kind of ["get","set"])assert.ok(f.ioAt.filter(e=>e[0]===kind&&e[1]===tick).length<=1,`${kind} attempts at${tick}`);
 const lowWrites=f.ioAt.filter(e=>e[0]==="set");for(let i=1;i<lowWrites.length;i++)assert.ok(lowWrites[i][1]-lowWrites[i-1][1]>=10,"low-pressure writes use elapsed10-tick spacing, independent of absolute module tick phase");
 assert.ok(f.ioAt.some(e=>e[0]==="get"&&e[2].startsWith("map:detail:")));assert.ok(f.ioAt.some(e=>e[0]==="get"&&e[2].startsWith("map:preview:")));
 assert.ok(f.ioAt.some(e=>e[0]==="set"&&e[2].startsWith("map:detail:")));assert.ok(f.ioAt.some(e=>e[0]==="set"&&e[2].startsWith("map:preview:")));
});

for(const offset of [1,7,19])test(`registered2-tick writer at phase${offset} drains low-pressure raw and legacy data by elapsed cadence`,()=>{
 const f=fixture(1);f.emit("worldLoad");const store=f.api.terrain.store("minecraft:overworld");
 f.api.detailPersistence.lookup(store.id,3,3,10000);f.api.previewPersistence.request(store.id,3,3);for(let t=1;t<=16;t++)f.readPump(t);
 assert.ok(f.api.detailPersistence.note(store.id,3,3,raw({kind:"stone",y:64,depth:0,palette:100}),10300));assert.ok(f.api.previewPersistence.note(store.id,3,3,G.Q_STONE,10300));
 assert.equal(f.api.detailPersistence.stats().dirtyPages,1);assert.equal(f.api.previewPersistence.stats().dirtyPages,1);
 const writer=f.intervals.find(i=>i.fn.toString().includes("detailPersistence.flushOne"));assert.equal(writer.period,2);
 for(let t=offset+writer.period;t<=700;t+=writer.period){f.context.system.currentTick=t;writer.fn();assert.ok(f.ioAt.filter(e=>e[0]==="set"&&e[1]===t).length<=1,"one SET per actual callback");}
 const writes=f.ioAt.filter(e=>e[0]==="set");assert.ok(writes.length>=4,"actual page and index writes for BOTH persistence families must occur");
 assert.ok(writes.some(e=>e[2].startsWith("map:detail:")&&!e[2].endsWith(":index")));assert.ok(writes.some(e=>e[2]==="map:detail:v1:index"));assert.ok(writes.some(e=>e[2].startsWith("map:preview:")));
 assert.ok(writes.every(e=>e[1]%2===offset%2));assert.ok(writes.every(e=>e[1]%100!==0),"this regression never gives the old modulus gate a lucky absolute tick");
 for(let i=1;i<writes.length;i++)assert.ok(writes[i][1]-writes[i-1][1]>=10,"normal elapsed spacing remains10 or more");
 for(const p of [f.api.detailPersistence,f.api.previewPersistence]){assert.equal(p.stats().dirtyPages,0);assert.equal(p.stats().pendingCommit,false);}
});

test("dirty-page pressure permits2-tick writes at an offset without exceeding one SET per callback",()=>{
 const f=fixture(1);f.emit("worldLoad");const store=f.api.terrain.store("minecraft:overworld");
 for(let i=0;i<8;i++)f.api.detailPersistence.lookup(store.id,3+i*64,3,10000);for(let t=1;t<=20;t++)f.readPump(t);
 for(let i=0;i<8;i++)assert.ok(f.api.detailPersistence.note(store.id,3+i*64,3,{kind:"stone",y:64,depth:0,palette:100},10300));assert.equal(f.api.detailPersistence.stats().dirtyPages,8);
 const writer=f.intervals.find(i=>i.fn.toString().includes("detailPersistence.flushOne"));assert.equal(writer.period,2);const pressure=new Map();
 for(let t=21;t<=161;t+=writer.period){pressure.set(t,f.api.detailPersistence.dirtyCount>=8);f.context.system.currentTick=t;writer.fn();assert.ok(f.ioAt.filter(e=>e[0]==="set"&&e[1]===t).length<=1);}
 const writes=f.ioAt.filter(e=>e[0]==="set");assert.ok(writes.length>=2);assert.equal(writes[0][1],21);assert.equal(writes[1][1],23,"pressure is served on the next real2-tick opportunity");
 for(let i=1;i<writes.length;i++)if(writes[i][1]-writes[i-1][1]<10)assert.equal(pressure.get(writes[i][1]),true,"only actual pressure bypasses normal spacing");
});

test("targeted mutation retains unrelated pending work and records an actual detail tombstone",()=>{
 const f=fixture(1),p=seed(f,[]),key=(x,z,r)=>`${p.store.id}|${colKey(x,z,r)}`;
 const affected=key(3,3,COL),preview=key(3,3,PREVIEW),unrelated=key(101,101,COL),job={tick:1};
 f.api.pendingTerrain.set(affected,job);f.api.pendingTerrain.set(preview,job);f.api.pendingTerrain.set(unrelated,job);
 f.api.blockChanged({dimension:{id:"minecraft:overworld"},location:{x:2,y:64,z:2}});
 assert.equal(f.api.pendingTerrain.has(affected),false);assert.equal(f.api.pendingTerrain.has(preview),false);assert.equal(f.api.pendingTerrain.get(unrelated),job);
 assert.equal(f.api.detailPersistence.lookup(p.store.id,3,3,10000).state,"invalid");assert.equal(f.api.detailCost.invalidationBackpressure,0);
});

test("detail metrics count genuinely loaded empty2 as valid, not unknown/grass",()=>{
 const f=fixture(1,{rayMiss:true,airProbe:true});const p=acquire(f);const c=p.store.cols.get(colKey(3,3,COL));assert.equal(c.kind,"empty");assert.equal(c.valid,true);
 const m=detail(f,4);assert.equal(m.sampled2,1);assert.equal(m.validEmpty2,1);assert.equal(m.unknown2,m.eligible-1);assert.equal(m.published2,0);
});

test("held title and failed setTitle never turn prepared/lastText detail into publication",()=>{
 const held=fixture(1);acquire(held);held.context.system.currentTick=3;held.hold(held.roster[0],10);paint(held,4);
 let m=detail(held,4);assert.ok(m.sampled2>0);assert.equal(m.published2,0);assert.equal(m.publicationTick,null);assert.equal(held.messages.filter(x=>x[0]==="title").length,0);assert.equal(held.api.views.get("p0").dirty,true);
 paint(held,14);m=detail(held,14);assert.equal(m.published2,m.sampled2);assert.ok(held.api.side.delivery(held.roster[0]));
 const failed=fixture(1,{titleFailure:true});acquire(failed);paint(failed,4);assert.ok(failed.api.lastText.has("p0"));assert.ok(failed.api.preparedDetailFrames.has("p0"));assert.equal(detail(failed,4).published2,0);
 failed.failTitles(false);paint(failed,8);assert.equal(detail(failed,8).published2,1);
});

test("publication tick is the actual receipt tick, not the time of repeated diagnostic reads",()=>{
 const f=fixture(1);acquire(f);paint(f,4);const receipt=f.api.side.delivery(f.roster[0]);assert.ok(receipt);
 const first=detail(f,4),titles=f.messages.filter(x=>x[0]==="title").length;assert.equal(first.publicationTick,receipt.tick);
 const later=detail(f,9);assert.equal(later.publicationTick,receipt.tick);assert.equal(f.messages.filter(x=>x[0]==="title").length,titles);
});

test("identical body can acknowledge real empty provenance without another title; new pose still forces delivery",()=>{
 const f=fixture(1,{rayMiss:true,airProbe:true});paint(f,1);const n=f.messages.filter(x=>x[0]==="title").length;assert.equal(detail(f,1).published2,0);
 acquire(f);paint(f,6);const m=detail(f,6);assert.equal(m.sampled2,1);assert.equal(m.published2,1);assert.equal(f.messages.filter(x=>x[0]==="title").length,n,"same accepted body/projection acknowledges new validity without resending");
 f.roster[0].state.at.x=1.2;paint(f,10);assert.ok(f.messages.filter(x=>x[0]==="title").length>n,"changed rounded view key needs a new owned receipt even if body glyphs coincide");
});

test("portal removes old published credit but preserves shared mapped data and unrelated pending jobs",()=>{
 const f=fixture(1);const p=acquire(f);paint(f,4);assert.equal(detail(f,4).published2,1);
 const other={tick:4};f.api.pendingTerrain.set("unrelated",other);f.roster[0].state.dim=f.dims.nether;f.emit("playerDimensionChange",{player:f.roster[0]});
 assert.equal(detail(f,5).published2,0);assert.equal(f.api.publishedDetailFrames.has("p0"),false);assert.equal(f.api.preparedDetailFrames.has("p0"),false);assert.equal(f.api.terrainBaseMemo.has("p0"),false);assert.equal(f.api.passAt.has("p0"),false);
 assert.ok(p.store.cols.has(colKey(3,3,COL)));assert.equal(f.api.pendingTerrain.get("unrelated"),other);
});

test("isolated DETAIL2-ONLY raw restore retains original wall age, not old game ticks",()=>{
 const first=policyFixture(false);first.roster[0].state.at={x:-1,y:64,z:1};first.emit("worldLoad");const p=seed(first,[pick(-1,3)]);for(let t=2;t<=12&&!p.store.cols.has(colKey(-1,3,COL));t++){first.readPump(t);first.scan(t);}
 const original={...p.store.cols.get(colKey(-1,3,COL))};assert.ok(original.valid);
 for(let t=13;t<30&&first.api.detailPersistence.needsLoad;t++)first.readPump(t);
 for(let t=100;t<=600&&first.api.detailPersistence.needsFlush;t+=20)first.writePump(t);
 assert.ok(first.ioAt.some(e=>e[0]==="set"&&e[2].startsWith("map:detail:")),"restart data really passed through the scheduled storage adapter");
 assert.equal(first.api.detailPersistence.stats().dirtyPages,0);assert.equal(first.api.detailPersistence.stats().pendingCommit,false);
 const second=policyFixture(false,1,{properties:first.properties,wallStart:200000});second.roster[0].state.at={x:-1,y:64,z:1};second.emit("worldLoad");const store=second.api.terrain.store("minecraft:overworld");second.api.playerStore.set("p0",store);
 second.context.system.currentTick=1;second.api.radarOf(0,[],36,true,second.roster[0].state.at,"minecraft:overworld",true,"p0",true,1);
 assert.equal(store.cols.size,0,"restart renderer stays read-only");const plan=second.api.planFor(second.roster[0],1);assert.ok(plan?.picks.some(k=>k.key===colKey(-1,3,COL)));assert.ok(plan.picks.every(k=>k.resolution===COL),"isolated raw-detail oracle has no preview class demand");
 const before=native(second).length;for(let t=1;t<=8;t++)second.readPump(t);second.context.system.currentTick=9;
 const c=store.cols.get(colKey(-1,3,COL));assert.ok(c?.valid);assert.equal(c.source,"persisted");assert.deepEqual(raw(c),raw(original));assert.equal(c.acquiredAtMs,original.acquiredAtMs);assert.ok(c.tick<0,"wall age is expressed in the NEW local epoch, not old game ticks copied forward");assert.ok(200450-c.acquiredAtMs>120000,"restored valid data is older than two minutes");assert.equal(native(second).length,before);
 // Consume the pre-hydration MISSING request before any new raster generation asks for background stale refresh.
 second.scan(9);const duplicate=second.queries.filter(q=>q[0]==="ray"?q[3].x===-.5&&q[3].z===3.5:q[0]==="color"?q[2]===-.5&&q[3]===3.5:false);
 assert.equal(duplicate.length,0,"valid old restored detail is not forced through foreground Native again");assert.equal(store.cols.get(colKey(-1,3,COL)).acquiredAtMs,original.acquiredAtMs);
 second.api.radarOf(0,[],36,true,second.roster[0].state.at,"minecraft:overworld",true,"p0",true,10);
 assert.equal(second.api.planFor(second.roster[0],10).picks.find(k=>k.key===colKey(-1,3,COL))?.stale,true,"old valid data may still request explicit background verification");
});

test("preview-enabled CONTROL records legitimate preview-class Native work even at an already-known2 anchor",()=>{
 const f=policyFixture(true);f.roster[0].state.at={x:-1,y:64,z:1};const p=acquire(f,-1,3);
 f.context.system.currentTick=3;f.api.radarOf(0,[],36,true,f.roster[0].state.at,"minecraft:overworld",true,"p0",true,3);
 const memo=f.api.terrainBaseMemo.get("p0"),requested=f.api.planFor(f.roster[0],5).picks.find(k=>k.resolution===PREVIEW&&k.wx===-1&&k.wz===3);
 assert.ok(requested,"preview control legitimately requests fallback for other unknown2 cells sharing this4 footprint");assert.equal(p.store.coarse.size,1);
 const plan=seed(f,[{...requested}]);plan.at=5;
 const before=native(f).length,putBefore=f.puts.length,previewBefore=f.api.previewCost.nativeReads;
 f.scan(4);
 assert.equal(native(f).length-before,2,"one actual preview ray/color pair is reported, not hidden as an illegal known2 foreground duplicate");
 assert.equal(f.api.previewCost.nativeReads-previewBefore,2);assert.equal(f.puts[putBefore][5],PREVIEW);assert.equal(p.store.preview.size,1);assert.equal(p.store.coarse.size,1,"preview does not fabricate three extra2 samples");
 const metrics=detail(f,6);assert.equal(metrics.sampled2,1);assert.ok(metrics.unknown2>0,"coarse fallback does not pretend unknown2 terrain is complete");
});

test("shared genuine2 work uses one partial reader and does not duplicate columns across viewers",()=>{
 const f=fixture(2),picks=Array.from({length:12},(_,i)=>pick(-23+i*2,1));seed(f,picks.map(p=>({...p})),0);seed(f,picks.map(p=>({...p})),1);f.api.setReadCostForTest(.02);f.scan(2);
 assert.equal(native(f).length,24);assert.equal(f.queries.filter(q=>q[0]==="ray").length,12);assert.equal(f.queries.filter(q=>q[0]==="color").length,12);assert.equal(f.api.detailCost.nativeCompleted,12);
});

test("unused viewer share is work-conserving when another genuine2 queue remains ready",()=>{
 const f=fixture(2);seed(f,[pick(1,1),pick(3,1)],0);seed(f,Array.from({length:20},(_,i)=>pick(-29+i*2,3)),1);f.api.setReadCostForTest(.02);f.scan(2);
 assert.equal(native(f).length,BALANCED.ops,"four operations for the short queue must not strand eight ready global credits");
});

test("invalidation backpressure fails closed instead of hydrating lower-priority preview over dirty detail",()=>{
 const f=fixture(1);f.emit("worldLoad");f.api.detailPersistence.maxResidentPages=1;const store=f.api.terrain.store("minecraft:overworld");
 assert.ok(f.api.detailPersistence.note(store.id,101,101,{kind:"stone",y:64,depth:0},10000));
 f.api.terrain.put(store,3,3,{kind:"grass",y:64,depth:0},1,PREVIEW);store.cols.clear();store.coarse.clear();
 f.api.blockChanged({dimension:{id:"minecraft:overworld"},location:{x:2,y:64,z:2}});assert.ok(f.api.detailCost.invalidationBackpressure>0);
 f.api.radarOf(0,[],36,true,f.roster[0].state.at,"minecraft:overworld",true,"p0",true,2);
 assert.equal(store.cols.size,0);assert.equal(f.api.terrainBaseMemo.get("p0").coverage.previewCells,0,"blocked raw detail never falls through to glyph-preview known coverage");
 f.configChanged("*");const current=f.api.terrain.store("minecraft:overworld");f.api.terrain.put(current,3,3,{kind:"grass",y:64,depth:0},1,PREVIEW);current.cols.clear();current.coarse.clear();
 f.api.radarOf(0,[],36,true,f.roster[0].state.at,"minecraft:overworld",true,"p0",true,3);
 assert.equal(f.api.terrainBaseMemo.get("p0").coverage.previewCells,0,"same-profile config reset must not clear fail-closed hydration state");
});

test("a canceled reader or retired store cannot commit after its native query returns",()=>{
 for(const mode of ["canceled","retired"]){const f=fixture(1,{config:{nativeTerrain:false}}),p=seed(f,[pick(3,3)]);
 f.failWhen(()=>{if(mode==="canceled")f.api.blockChanged({dimension:{id:"minecraft:overworld"},location:{x:3,y:64,z:3}});else{f.api.terrain.stores.delete(p.store.id);f.api.terrain.store("minecraft:overworld");}return false;});
 f.scan(2);assert.equal(p.store.cols.size,0,mode);assert.equal(f.api.detailCost.nativeCompleted,0,mode);assert.equal(native(f).length,1,"obsolete completed reader cannot replay the same native thunk until quota exhaustion: "+mode);assert.equal(f.api.pendingTerrain.size,0,mode);
 }
});
