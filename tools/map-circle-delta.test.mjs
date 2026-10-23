import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {circleDelta} from "../packs/map_bp/scripts/circle-delta.js";
import {circleAnchors} from "../packs/map_bp/scripts/terrain-work.js";
import {sampleCoord,colKey} from "../packs/map_bp/scripts/terrain.js";

function keys(center,radius) {
  const result=new Set();
  for(const anchor of circleAnchors(center,radius,sampleCoord,colKey))result.add(anchor.key);
  return result;
}
function expectedDelta(oldCenter,newCenter,radius) {
  const old=keys(oldCenter,radius),next=keys(newCenter,radius),entered=new Set(),exited=new Set();
  for(const key of next)if(!old.has(key))entered.add(key);
  for(const key of old)if(!next.has(key))exited.add(key);
  return {old,next,entered,exited};
}
function parity(oldCenter,newCenter,radius) {
  const expected=expectedDelta(oldCenter,newCenter,radius),entered=new Set(),exited=new Set();
  let lastZ=-Infinity,lastKind="exited",lastX=-Infinity;
  for(const change of circleDelta(oldCenter,newCenter,radius,2,colKey)) {
    assert.equal(change.key,colKey(change.x,change.z,2));
    assert.equal(change.x,sampleCoord(change.x,2));assert.equal(change.z,sampleCoord(change.z,2));
    assert.ok(change.z>=lastZ,"rows ascend without walking a teleport gap");
    if(change.z!==lastZ) {lastKind="exited";lastX=-Infinity;}
    if(change.kind!==lastKind) {assert.equal(change.kind,"entered");lastX=-Infinity;}
    assert.ok(change.x>=lastX,"each kind is emitted in ascending x order");
    const target=change.kind==="entered"?entered:exited;
    assert.equal(target.has(change.key),false,"no duplicate key within a kind");target.add(change.key);
    if(change.kind==="entered") {assert.ok(expected.next.has(change.key));assert.equal(expected.old.has(change.key),false);}
    else {assert.equal(change.kind,"exited");assert.ok(expected.old.has(change.key));assert.equal(expected.next.has(change.key),false);}
    lastZ=change.z;lastKind=change.kind;lastX=change.x;
  }
  assert.deepEqual(entered,expected.entered);assert.deepEqual(exited,expected.exited);
}

const moves=[
  {name:"stationary",old:{x:.2,z:-.2},next:{x:.2,z:-.2}},
  {name:"fractional same bbox",old:{x:.1,z:.1},next:{x:.4,z:.4}},
  {name:"cross zero",old:{x:-.2,z:.3},next:{x:.2,z:-.3}},
  {name:"negative diagonal",old:{x:-100.4,z:-45.7},next:{x:-98.4,z:-47.7}},
  {name:"real positive border",old:{x:29999999.8,z:-29999999.7},next:{x:29999996.4,z:-29999997.1}},
  {name:"packed positive border",old:{x:33554431.2,z:33554431.4},next:{x:33554432.3,z:33554429.1}},
  {name:"packed negative border",old:{x:-33554431.9,z:-33554431.8},next:{x:-33554432.8,z:-33554429.3}},
  {name:"IEEE near circle edge",old:{x:1+1e-9,z:0},next:{x:1+2e-8,z:0}},
];
for(const radius of [1,4,36,64,128,384])for(const move of moves)test("exact delta radius"+radius+" "+move.name,()=>parity(move.old,move.next,radius));

for(const [name,old,next] of [
  ["far x",{x:.2,z:-.2},{x:29999900.2,z:-.2}],
  ["far z",{x:.2,z:-.2},{x:.2,z:29999900.2}],
  ["opposite corners",{x:-29999990.4,z:29999990.1},{x:29999990.2,z:-29999990.1}],
  ["disjoint nearby x",{x:-100.2,z:-200.4},{x:100.2,z:-200.4}],
])test("teleport delta skips coordinate gap: "+name,()=>{
  const radius=36,expected=expectedDelta(old,next,radius);let calls=0,count=0;
  const key=(x,z,step)=>{calls++;return colKey(x,z,step);};
  for(const change of circleDelta(old,next,radius,2,key)) {count++;assert.ok(expected[change.kind].has(change.key));}
  assert.equal(count,expected.entered.size+expected.exited.size);
  assert.equal(calls,count,"only geometric difference points, never the huge x/z gap, invoke the key function");
  parity(old,next,radius);
});

test("golden canonical2 row difference preserves exits-before-entries ordering",()=>{
  const actual=Array.from(circleDelta({x:0,z:0},{x:2,z:0},2,2,colKey));
  const coords=[
    {kind:"exited",x:-1,z:-1},{kind:"entered",x:3,z:-1},
    {kind:"exited",x:-1,z:1},{kind:"entered",x:3,z:1},
  ];
  assert.deepEqual(actual,coords.map(change=>({...change,key:colKey(change.x,change.z,2)})));
});

test("golden IEEE boundary retains the exact canonical membership instead of idealized sqrt membership",()=>{
  const actual=Array.from(circleDelta({x:1+1e-9,z:0},{x:1+2e-8,z:0},1,2,colKey));
  assert.deepEqual(actual,[
    {kind:"exited",x:1,z:-1,key:colKey(1,-1,2)},
    {kind:"exited",x:1,z:1,key:colKey(1,1,2)},
  ]);
});

test("same bounding box is not stationary: only changed edge keys are evaluated",()=>{
  const old={x:.1,z:.1},next={x:.4,z:.4},radius=36,expected=expectedDelta(old,next,radius);
  for(const axis of ["x","z"]) {
    assert.equal(sampleCoord(old[axis]-radius,2),sampleCoord(next[axis]-radius,2));
    assert.equal(sampleCoord(old[axis]+radius,2),sampleCoord(next[axis]+radius,2));
  }
  let calls=0;const key=(x,z,step)=>{calls++;return colKey(x,z,step);};
  const actual=Array.from(circleDelta(old,next,radius,2,key));
  assert.ok(actual.length>0);assert.equal(calls,expected.entered.size+expected.exited.size);
  assert.ok(calls<expected.old.size/8,"do not perform about 1k unchanged raw/key lookups per fractional pose");
});

test("identical centers issue zero key calls and snapshot validation is immediate",()=>{
  const cursor=circleDelta({x:.2,z:-.2},{x:.2,z:-.2},36,2,()=>{throw Error("unexpected key lookup");});
  assert.equal(cursor.next().done,true);
  assert.throws(()=>circleDelta({x:Infinity,z:0},{x:0,z:0},36,2,colKey),/Finite old/);
  assert.throws(()=>circleDelta({x:0,z:0},{x:NaN,z:0},36,2,colKey),/Finite new/);
  assert.throws(()=>circleDelta({x:1e100,z:0},{x:0,z:0},36,2,colKey),/Safely addressable/);
  for(const step of [0,1,4,2.5])assert.throws(()=>circleDelta({x:0,z:0},{x:1,z:1},36,step,colKey),/2-block/);
  for(const radius of [0,-1,1.5,Infinity,385])assert.throws(()=>circleDelta({x:0,z:0},{x:1,z:1},radius,2,colKey),/Radius/);
  assert.throws(()=>circleDelta({x:0,z:0},{x:1,z:1},36,2,null),/key function/);
});

test("lazy iteration snapshots mutable inputs and stops without finishing the footprint",()=>{
  const old={x:.2,z:-.2},next={x:1000.2,z:1000.2},radius=384;
  const expected=expectedDelta(old,next,radius);let calls=0;
  const cursor=circleDelta(old,next,radius,2,(x,z,step)=>{calls++;return colKey(x,z,step);});
  old.x=100000;next.z=-100000;
  assert.equal(calls,0,"constructing a delta never enumerates footprint keys");
  for(let i=0;i<8;i++) {
    const value=cursor.next().value;
    assert.ok(expected[value.kind].has(value.key),"lazy work uses original snapshots, not later caller mutation");
  }
  assert.equal(calls,8,"only consumed output keys are evaluated");
  cursor.return();assert.equal(calls,8);
});

test("deterministic fractional/negative movement series matches full-circle golden sets",()=>{
  let seed=0x7c2391;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  let old={x:-31.7,z:-.3};
  for(let i=0;i<80;i++) {
    const next={x:old.x+(random()-.5)*5,z:old.z+(random()-.5)*5};
    parity(old,next,36);old=next;
  }
});

test("new helper has no native/provider/clock work or footprint-sized collection",()=>{
  const source=fs.readFileSync(new URL("../packs/map_bp/scripts/circle-delta.js",import.meta.url),"utf8");
  assert.doesNotMatch(source,/@minecraft|new (?:Set|Map)|Array\.from|\.push\(|Date\.|performance\.|getBlock|getDynamicProperty/);
});
