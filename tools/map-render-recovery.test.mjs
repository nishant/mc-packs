// Narrow recovery regressions using actual current main/Side/persistence. Pure VM, not Native CPU evidence.
import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "./map-v2-fixture.mjs";
import { SPEED,BALANCED } from "../packs/map_bp/scripts/map-profile.js";
import { DetailPersistence } from "../packs/map_bp/scripts/detail-persistence.js";
import { COL, colKey } from "../packs/map_bp/scripts/terrain.js";
import { SCAN_POLICY } from "../packs/map_bp/scripts/scan-policy.js";
const point={x:.2,y:64,z:-.2};
const raw={kind:"stone",y:64,depth:0,palette:100};
const native=f=>f.queries.filter(q=>q[0]!=="entities");
function view(f,markers=[],north=true,at=point){const p=f.roster[0];p.state.at={...at};const v={player:p,markers,second:"",compass:true,radar:true,radius:36,north,terrain:false,dim:p.state.dim.id,px:at.x,pz:at.z,heading:0,x:at.x,y:at.y,z:at.z,dirty:true};f.api.views.set(p.id,v);return v;}
function draw(f,v,at=point,h=0,t=10){f.context.system.currentTick=t;f.roster[0].state.at={...at};f.api.render(f.roster[0],v,t,false,h,at);return f.api.lastText.get("p0").radar;}
function radar(f,rebuild=true,t=10,id="p0"){return f.api.radarOf(0,[],36,true,f.roster[0].state.at,"minecraft:overworld",true,id,rebuild,t);}

test("radar pixel loop performs zero provider lookup, request or raw restoration calls",()=>{
 const f=fixture(1);f.emit("worldLoad");let lookups=0,restores=0,requests=0;
 const lookup=f.api.detailPersistence.lookup.bind(f.api.detailPersistence),restore=f.api.terrain.restoreDetail.bind(f.api.terrain),request=f.api.previewPersistence.request.bind(f.api.previewPersistence);
 f.api.detailPersistence.lookup=(...a)=>{lookups++;return lookup(...a);};f.api.terrain.restoreDetail=(...a)=>{restores++;return restore(...a);};f.api.previewPersistence.request=(...a)=>{requests++;return request(...a);};
 radar(f,true);assert.equal(lookups,0);assert.equal(restores,0);assert.equal(requests,0);assert.equal(f.io.length,0);assert.equal(SCAN_POLICY.previewScanning,true,"resident diagnosis uses the observe-p4 candidate, not a claimed detail-only winner");assert.ok(f.api.terrainBaseMemo.get("p0").need.every(p=>p.resolution===COL||(SCAN_POLICY.previewScanning&&p.resolution===4)));
 f.api.planFor(f.roster[0],11);assert.equal(lookups,0,"selected V1/V2 profiles disable terrain-provider IO in planning too");const n=lookups;f.api.planFor(f.roster[0],12);assert.equal(lookups,n,"unchanged footprint is not requested every plan");
});

test("denied empty-memo raster cannot bypass admission; real Native2 still progresses using fallback plan",()=>{
 const f=fixture(1,{profile:SPEED}),before=f.api.counters().radarRebuilds;radar(f,false);const memo=f.api.terrainBaseMemo.get("p0");
 assert.equal(f.api.counters().radarRebuilds,before);assert.equal(memo.key,"");assert.equal(memo.geometry,undefined);assert.equal(memo.need.length,0);
 const plan=f.api.planFor(f.roster[0],11);assert.ok(plan?.picks.length>0);assert.ok(plan.picks.every(p=>p.resolution===COL));
 f.scan(12);assert.ok(native(f).length>0);assert.ok(f.api.detailCost.nativeCompleted>0);assert.equal(f.api.counters().radarRebuilds,before,"progress is not coupled to a raster build");
});

test("retained optional persistence host restores <=128 raw samples globally while rendering restores zero; visit/time bounds hold",()=>{
 const f=fixture(2,{profile:{...BALANCED,persistence:true}});f.emit("worldLoad");radar(f,true);const memo=f.api.terrainBaseMemo.get("p0"),store=memo.needStore;
 const plan=f.api.planFor(f.roster[0],10);const picks=plan.picks.filter(p=>p.resolution===COL).slice(0,100);assert.equal(picks.length,100);
 for(const p of picks)assert.ok(f.api.detailPersistence.note(store.id,p.wx,p.wz,raw,10000));
 for(let i=0;i<2;i++)f.api.scanPlans.set("p"+i,{id:"p"+i,store,picks:picks.map(p=>({...p})),pos:0,at:1,x:point.x,z:point.z});
 let visits=0;const lookup=f.api.detailPersistence.lookup.bind(f.api.detailPersistence);f.api.detailPersistence.lookup=(...a)=>{visits++;return lookup(...a);};
 const before=f.api.detailCost.hydrated;radar(f,true,11);assert.equal(f.api.detailCost.hydrated,before);assert.equal(visits,0);
 f.context.system.currentTick=12;f.api.replayVisibleDetail(12);f.api.replayVisibleDetail(12);
 assert.equal(f.api.detailCost.hydrated-before,100);assert.equal(store.coarse.size,100);assert.ok(visits<=128,"global host visit budget");assert.equal(native(f).length,0);
 const n=visits;f.api.featureEnvelope.used=4;f.api.replayVisibleDetail(13);assert.equal(visits,n,"exhausted feature time prevents extra work");
 const cached=plan.picks.filter(p=>p.resolution===COL).slice(0,320);for(const p of cached)f.api.terrain.put(store,p.wx,p.wz,raw,14,COL);
 f.api.scanPlans.clear();f.api.scanPlans.set("cached",{id:"cached",store,picks:cached,pos:0,at:1,x:point.x,z:point.z});
 let hasVisits=0;const has=store.cols.has.bind(store.cols);store.cols.has=key=>{hasVisits++;return has(key);};f.api.featureEnvelope.used=0;f.api.replayVisibleDetail(14);
 assert.equal(hasVisits,128,"even already-shared cached demand cannot walk beyond128 visited picks");assert.equal(visits,n);
});

test("unrelated decoded detail page read never dirties every view or clears other memo keys",()=>{
 const properties=new Map(),provider=new DetailPersistence({get:k=>properties.get(k),set:(k,v)=>properties.set(k,v)},{ready:true});
 provider.lookup("minecraft:overworld|surface",1001,1001,10000);for(let i=0;i<5&&provider.needsLoad;i++)provider.loadOne(10000);assert.ok(provider.note("minecraft:overworld|surface",1001,1001,raw,10000));for(let i=0;i<5&&provider.needsFlush;i++)provider.flushOne(10000);assert.equal(provider.stats().dirtyPages,0);
 const f=fixture(2,{properties,profile:{...BALANCED,persistence:true}});f.emit("worldLoad");for(let i=0;i<2;i++){f.api.views.set("p"+i,{dirty:false,rsig:"sig"+i});f.api.terrainBaseMemo.set("p"+i,{key:"stable"+i});}
 f.api.detailPersistence.lookup("minecraft:overworld|surface",1001,1001,10000);for(let t=1;t<=3;t++)f.readPump(t);
 assert.ok(f.io.some(e=>e[0]==="get"&&e[1].startsWith("map:detail:")));for(let i=0;i<2;i++){assert.equal(f.api.views.get("p"+i).dirty,false);assert.equal(f.api.views.get("p"+i).rsig,"sig"+i);assert.equal(f.api.terrainBaseMemo.get("p"+i).key,"stable"+i);}
});

test("north-up heading-only change reuses the exact body with ordinary/star/party markers and zero terrain work",()=>{
 const f=fixture(1),markers=[{kind:"folk",x:8,z:-4},{kind:"star",x:-10,z:15},{kind:"party",x:50,z:-100}],v=view(f,markers);
 const first=draw(f,v,point,0),a=f.api.counters(),wire=f.api.lastSent.get("p0").rtext;
 const second=draw(f,v,point,90,11),b=f.api.counters();assert.equal(second,first);assert.equal(b.radarBuilds,a.radarBuilds);assert.equal(b.radarRebuilds,a.radarRebuilds);assert.ok(b.radarReuses>a.radarReuses);assert.notEqual(f.api.lastSent.get("p0").rtext,wire,"self-arrow changes independently");assert.equal(native(f).length,0);
});

for(const scenario of ["collision-cross-sign","offmap-direction","ordered-tie"])test(`cached vs fresh exact marker projection: ${scenario}`,()=>{
 let a={x:.2,y:64,z:.1},b={x:.2,y:64,z:-.1},markersA,markersB;
 if(scenario==="collision-cross-sign"){markersA=[{kind:"camp",x:4.5,z:.1},{kind:"site",x:4.5,z:-.1}];markersB=markersA;}
 if(scenario==="offmap-direction"){a={x:-.1,y:64,z:0};b={x:.1,y:64,z:0};markersA=[{kind:"party",x:100,z:-100/Math.tan(Math.PI/8)}];markersB=markersA;}
 if(scenario==="ordered-tie"){b=a;markersA=[{kind:"camp",x:4.5,z:1},{kind:"site",x:4.5,z:1}];markersB=markersA.slice().reverse();}
 const cached=fixture(1),v=view(cached,markersA,true,a);const old=draw(cached,v,a);v.markers=markersB;const result=draw(cached,v,b,0,11);
 const fresh=fixture(1),vf=view(fresh,markersB,true,b);const expected=draw(fresh,vf,b,0,11);assert.equal(result,expected);assert.notEqual(result,old,"fixture actually crosses a visible marker choice, not a vacuous cache case");assert.equal(native(cached).length,0);
});

test("rotated signature includes full heading and compatible pass preserves rsig/lag/checked",()=>{
 const f=fixture(1),v=view(f,[{kind:"star",x:80,z:30}],false);draw(f,v,point,0);const s0=f.api.radarSig(0,v.markers,36,false,point,v.dim,false,"p0",10),s1=f.api.radarSig(.2,v.markers,36,false,point,v.dim,false,"p0",10);assert.notEqual(s0,s1);
 const g=fixture(1);g.api.pass(g.roster[0],g.roster,[],1);const before=g.api.views.get("p0");before.rsig="kept";before.lag=true;before.checked=7;g.api.pass(g.roster[0],g.roster,[],2);const after=g.api.views.get("p0");assert.equal(after.rsig,"kept");assert.equal(after.lag,true);assert.equal(after.checked,7);
});
