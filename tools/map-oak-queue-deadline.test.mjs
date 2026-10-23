// JS inspection bounds/queue semantics only; not native CPU or server acceptance.
import assert from "node:assert/strict";
import test from "node:test";
import { COL, TerrainWorld, colKey, spendBudget } from "../packs/map_bp/scripts/terrain.js";
const raw={kind:"stone",y:64,depth:0};
function scene(count=1000){const world=new TerrainWorld(6000),store=world.store("minecraft:overworld");const picks=Array.from({length:count},(_,i)=>({wx:i*2+1,wz:1,key:colKey(i*2+1,1,COL),resolution:COL,since:10,queuedAt:1}));return{world,store,picks,plan:{id:"p",store,picks,pos:0,at:10},metrics:{completeSkips:0,coolingSkips:0}};}

test("first deadline check precedes admission, cache inspection and every skip",()=>{
 const s=scene();let admits=0,checks=0,reads=0;
 const spent=spendBudget([s.plan],1,1,0,50,()=>reads++,s.metrics,()=>{admits++;return false;},()=>{checks++;return false;});
 assert.equal(checks,1);assert.equal(admits,0);assert.equal(reads,0);assert.equal(s.plan.pos,0);assert.equal(spent.size,0);
 assert.deepEqual(s.metrics,{completeSkips:0,coolingSkips:0});
});

for(const kind of["rejected","complete","cooling","known"])test(kind+" prefix yields within16 inspections and resumes at the exact next ticket",()=>{
 const s=scene();if(kind==="complete")for(const p of s.picks)s.world.put(s.store,p.wx,p.wz,raw,49,COL);
 if(kind==="cooling")for(const p of s.picks)s.store.miss.set(p.key,49);
 let inspected=0,checks=0,native=0;const notices=[];
 const admit=(_plan,_pick)=>{inspected++;return kind!=="rejected";};
 const prepare=()=>kind==="known"?"known":undefined;
 const observer=(_plan,p,stamp)=>notices.push([p.key,stamp]);
 const spent=spendBudget([s.plan],4,4,0,50,()=>native++,s.metrics,admit,()=>{checks++;return inspected<5;},prepare,observer);
 assert.equal(inspected,16,"only one bounded stride may cross the elapsed boundary");assert.equal(checks,2);
 assert.equal(s.plan.pos,16);assert.equal(native,0);assert.equal(spent.size,0);
 if(kind==="complete")assert.equal(s.metrics.completeSkips,16);
 if(kind==="cooling")assert.equal(notices.length,16);
 const first=s.plan.pos;let resumedChecks=0;
 spendBudget([s.plan],4,4,0,51,()=>native++,s.metrics,(_plan,p)=>{assert.ok(s.picks.indexOf(p)>=first);return kind!=="rejected";},()=>{resumedChecks++;return true;},prepare,observer);
 assert.equal(s.plan.pos,s.picks.length);assert.equal(native,0);
 assert.ok(resumedChecks<=Math.ceil((s.picks.length-first)/16)+1,"no deadline call per skipped item");
 if(kind==="complete")assert.equal(s.metrics.completeSkips,1000);
 if(kind==="cooling"){assert.equal(notices.length,1000);assert.equal(new Set(notices.map(n=>n[0])).size,1000);assert.ok(notices.every(n=>n[1]===49));assert.equal(s.metrics.coolingSkips,1000);}
});

test("deferred frontiers across many plans share one bounded inspection stride and retain every cursor",()=>{
 const s=scene();const plans=s.picks.map((p,i)=>({id:"p"+i,store:s.store,picks:[p],pos:0,at:10}));let prepared=0,checks=0;
 const spent=spendBudget(plans,4,4,0,50,()=>assert.fail("no native work"),s.metrics,undefined,()=>{checks++;return prepared<5;},()=>{prepared++;return"defer";});
 assert.equal(prepared,16);assert.equal(checks,2);assert.equal(spent.size,0);assert.ok(plans.every(p=>p.pos===0));
});

test("fresh deadline check before EVERY actual operation catches time consumed by preparation",()=>{
 const s=scene(2);let expired=false,checks=0,reads=0;
 const spent=spendBudget([s.plan],2,2,0,50,()=>reads++,s.metrics,undefined,()=>{checks++;return!expired;},()=>{expired=true;return undefined;});
 assert.equal(checks,2,"entry check cannot substitute for the later pre-Native check");assert.equal(reads,0);assert.equal(spent.size,0);assert.equal(s.plan.pos,0);
});

test("a read continuation keeps its ticket and exactly one operation credit when deadline expires",()=>{
 const s=scene(2);let expired=false,reads=0;
 const first=spendBudget([s.plan],2,2,0,50,()=>{reads++;expired=true;return false;},s.metrics,undefined,()=>!expired);
 assert.equal(reads,1);assert.deepEqual([...first],[["p",1]]);assert.equal(s.plan.pos,0);
 const resumed=spendBudget([s.plan],1,1,0,51,()=>{reads++;return true;},s.metrics,undefined,()=>true);
 assert.equal(reads,2);assert.deepEqual([...resumed],[["p",1]]);assert.equal(s.plan.pos,1);
});

test("fair round-robin ledger and cooling observer11th argument stay unchanged with an open deadline",()=>{
 const s=scene(8),a={id:"a",store:s.store,picks:s.picks.slice(0,4),pos:0,at:10},b={id:"b",store:s.store,picks:s.picks.slice(4),pos:0,at:10};
 s.store.miss.set(a.picks[0].key,49);const seen=[],read=[];
 const spent=spendBudget([a,b],4,2,1,50,(p,ticket)=>{read.push([p.id,ticket.key]);return true;},s.metrics,undefined,()=>true,undefined,(p,ticket,stamp)=>seen.push([p.id,ticket.key,stamp]));
 assert.deepEqual(read.map(r=>r[0]),["b","a","b","a"]);assert.deepEqual([...spent],[["b",2],["a",2]]);
 assert.deepEqual([a.pos,b.pos],[3,2]);assert.deepEqual(seen,[["a",a.picks[0].key,49]]);assert.deepEqual(s.metrics,{completeSkips:0,coolingSkips:1});
});

test("expired Native deadline never advances or charges an unattempted ready ticket after a completed prefix",()=>{
 const s=scene(2);s.world.put(s.store,s.picks[0].wx,1,raw,49,COL);let inspected=0,checks=0;
 const spent=spendBudget([s.plan],2,2,0,50,()=>assert.fail("deadline expired"),s.metrics,()=>{inspected++;return true;},()=>{checks++;return checks===1;});
 assert.equal(inspected,2);assert.equal(checks,2);assert.equal(s.plan.pos,1);assert.equal(spent.size,0);assert.equal(s.metrics.completeSkips,1);
});
