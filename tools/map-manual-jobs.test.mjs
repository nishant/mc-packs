import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {circleAnchors,countCircleAnchors,FillJobs,parseMinimapCommand,MANUAL_SCAN_MAX_RADIUS,MANUAL_SCAN_DEFAULT_RADIUS} from "../packs/map_bp/scripts/terrain-work.js";
import {sampleCoord,colKey} from "../packs/map_bp/scripts/terrain.js";

for(const radius of [4,64,128,256,384])for(const center of [{x:.1,z:.1},{x:-100.4,z:-45.7},{x:29999990.2,z:29999990.1}])test("bounded row count matches actual canonical keys radius"+radius+JSON.stringify(center),()=>{
  assert.equal(countCircleAnchors(center,radius,sampleCoord,colKey),[...circleAnchors(center,radius,sampleCoord,colKey)].length);
});

test("native Integer radius is horizontal world blocks, maximum384, default64, optionally host-limited",()=>{
  assert.equal(MANUAL_SCAN_MAX_RADIUS,384);assert.equal(MANUAL_SCAN_DEFAULT_RADIUS,64);
  assert.deepEqual(parseMinimapCommand("scan",384),{kind:"scan",radius:384});
  assert.deepEqual(parseMinimapCommand("fill",384),{kind:"scan",radius:384});
  assert.equal(parseMinimapCommand("scan",385).kind,"error");
  assert.equal(parseMinimapCommand("scan",129,128).kind,"error");
  assert.equal(parseMinimapCommand("scan",undefined).radius,64);
  for(const value of ["64",-1,0,2.5,Infinity,NaN,"64 blocks","1e2"])assert.equal(parseMinimapCommand("scan",value).kind,"error");
  assert.match(parseMinimapCommand("scan",385).message,/world blocks/);
  assert.deepEqual(parseMinimapCommand("status"),{kind:"status"});
  assert.deepEqual(parseMinimapCommand("cancel"),{kind:"cancel"});
  assert.equal(parseMinimapCommand("scan","status").kind,"error","old string subcommand cannot be passed to a native Integer slot");
  assert.equal(parseMinimapCommand("status",4).kind,"error");
});

test("fixed-origin bounded queue retains tickets, honest failures and cancel state",()=>{
  const q=new FillJobs(sampleCoord,colKey,2),origin={x:.1,z:.1},spec={owner:"a",storeId:"overworld",profile:"native",center:origin,radius:4},a=q.start(spec);
  origin.x=100;assert.equal(a.spec.center.x,.1);
  const ticket=a.peek();assert.equal(a.peek(),ticket);
  assert.equal(a.settle(ticket,"unavailable"),true);
  assert.equal(a.progress().mapped,0);assert.equal(a.progress().unavailable,1);
  assert.equal(a.settle(ticket,"mapped"),false);
  q.start({...spec,owner:"b"});assert.throws(()=>q.start({...spec,owner:"c"}));
  const pending=a.peek();q.cancel("a");
  assert.equal(a.settle(pending,"mapped"),false);assert.equal(a.progress().mapped,0);
});

function commandFixture() {
  class Player {
    constructor(level){this.commandPermissionLevel=level;this.isValid=true;this.messages=[];}
    sendMessage(text){this.messages.push(text);}
  }
  const scheduled=[],actions=[],registry={registerCommand(spec,fn){this.spec=spec;this.fn=fn;}};
  const context={Player,CommandPermissionLevel:{Any:0,GameDirectors:1},CustomCommandParamType:{String:1,Integer:2},CustomCommandStatus:{Failure:0,Success:1},system:{run:fn=>scheduled.push(fn)},parseMinimapCommand,MANUAL_SCAN_MAX_RADIUS};
  const src=fs.readFileSync(new URL("../packs/map_bp/scripts/minimap-command.js",import.meta.url),"utf8").replace(/^import .+;\n/gm,"").replace(/^export /gm,"");
  const register=vm.runInNewContext(src+"\n;registerMinimapCommand;",context);
  const handlers={toggle:()=>actions.push("toggle"),start:(p,r)=>actions.push(r),status:()=>actions.push("status"),cancel:()=>actions.push("cancel")};
  register(registry,handlers);
  return {Player,scheduled,actions,registry,handlers};
}

test("actual command registry uses native Integer radius, stays public, and defers every action",()=>{
  const {Player,scheduled,actions,registry}=commandFixture();
  assert.equal(registry.spec.permissionLevel,0);assert.equal(registry.spec.cheatsRequired,false);
  assert.deepEqual(Array.from(registry.spec.optionalParameters,p=>[p.name,p.type]),[["action",1],["radius",2]],"regression: native String radius rejects unquoted numeric input before this callback");
  const normal=new Player(0),op=new Player(1);
  assert.equal(registry.fn({sourceEntity:normal},"scan",385).status,0);
  assert.equal(registry.fn({sourceEntity:normal},"scan",384).status,1);
  assert.equal(registry.fn({sourceEntity:op},"scan",384).status,1);
  registry.fn({sourceEntity:normal},"fill",4);registry.fn({sourceEntity:normal},"scan");
  registry.fn({sourceEntity:normal});registry.fn({sourceEntity:normal},"status");registry.fn({sourceEntity:normal},"cancel");
  assert.equal(actions.length,0);
  for(const fn of scheduled)fn();
  assert.deepEqual(actions,[384,384,4,64,"toggle","status","cancel"]);
});

test("deferred command does not run after leave and reports admission errors safely",()=>{
  const {Player,scheduled,actions,registry,handlers}=commandFixture(),p=new Player(0);
  assert.equal(registry.fn({sourceEntity:{}},"scan",4).status,0);
  registry.fn({sourceEntity:p},"scan",4);p.isValid=false;
  scheduled.shift()();assert.deepEqual(actions,[]);
  p.isValid=true;handlers.start=()=>{throw new Error("shared capacity is full");};
  registry.fn({sourceEntity:p},"scan",384);
  assert.equal(p.messages.length,0);scheduled.shift()();
  assert.match(p.messages[0],/shared capacity is full/);
});
