// Optional minimap surface/movement regression: build terrain BEFORE opt-in, then verify actual canonical native samples.
// Default-OFF and opting out are checked; this is not the old cave/fine-cache saturation or active-radar performance test.
// node tools/test-bds/run.mjs --quiet --flat --only map_bp,hud_rp --scenario tools/test-bds/examples/map-flight.js --timeout 180
const mapStateParts = new Map();
function reassembleMapState(message, now = 0) {
  for (const [k, e] of mapStateParts) if (now - e.at > 200) mapStateParts.delete(k);
  const d = JSON.parse(message),
    c = d && d.chunk;
  if (!c) return d;
  if (d.channel !== "state" || d.v !== 1 || !Number.isInteger(c.total) || c.total < 1 || c.total > 12 || !Number.isInteger(c.index) || c.index < 0 || c.index >= c.total || typeof c.text !== "string") throw Error("bad map state packet");
  const key = `${d.player ?? ""}:${c.id}`;
  let e = mapStateParts.get(key);
  if (!e) {
    if (mapStateParts.size >= 16) mapStateParts.delete(mapStateParts.keys().next().value);
    e = { total: c.total, parts: new Array(c.total), got: 0, at: now };
    mapStateParts.set(key, e);
  }
  if (e.total !== c.total || e.parts[c.index] !== undefined) {
    mapStateParts.delete(key);
    throw Error("bad map state packet");
  }
  e.parts[c.index] = c.text;
  if (++e.got < e.total) return undefined;
  mapStateParts.delete(key);
  return JSON.parse(e.parts.join(""));
}


export default async function(t) {
  const sys=t.system,dim=t.dimension,replies=[];
  let request=0;
  sys.afterEvents.scriptEventReceive.subscribe(({id,message})=>{
    if(id!=="realm:map_state"&&id!=="realm:cfg_ack")return;
    try{const m=id==="realm:map_state"?reassembleMapState(message,sys.currentTick):JSON.parse(message);if(m!==undefined)replies.push({id,m,tick:sys.currentTick});}catch{}
  },{namespaces:["realm"]});
  const send=(id,m)=>sys.sendScriptEvent(id,JSON.stringify(m));
  const ask=async(p,action,extra={})=>{
    const since=t.tick;replies.length=0;send("realm:map_debug",{player:p.id,action,...extra});
    await t.waitUntil(()=>replies.some(e=>e.id==="realm:map_state"&&e.m.player===p.id&&e.tick>=since),{timeout:40,message:"map debug "+action});
    return replies.filter(e=>e.id==="realm:map_state"&&e.m.player===p.id&&e.tick>=since).at(-1).m;
  };
  const set=async(p,key,value)=>{
    const id="surface_"+(++request);send("realm:cfg_set",{id,pack:"map_bp",player:p.id,key,value});
    await t.waitUntil(()=>replies.some(e=>e.id==="realm:cfg_ack"&&e.m.id===id),{timeout:80,message:"preference "+key});
    t.assert(replies.find(e=>e.id==="realm:cfg_ack"&&e.m.id===id).m.ok===true,"preference saved: "+key+"="+value);
  };
  const raw=async(p,points,message)=>{
    let last;
    for(let i=0;i<40;i++){
      last=await ask(p,"detail_raw",{points});
      if(last.samples?.length===points.length&&last.samples.every(s=>s?.valid===true&&s.source==="native"))return last;
      await t.wait(5);
    }
    t.log("unresolved native samples "+JSON.stringify(last));t.fail(message);
  };
  await t.server("/gamerule domobspawning false");
  // Build ALL command-created terrain before opting in. /fill does not emit player block-change invalidations.
  await t.loadArea(0,100,{radius:4});
  await t.loadArea(75,0,{radius:4});
  await t.server("/fill -8 -45 92 8 -45 108 stone");
  await t.server("/fill 60 -61 -20 100 -61 20 sand");
  const flier=await t.player("Flier",{op:true,x:0,y:-60,z:0,gameMode:"creative"});
  const roofed=await t.player("Roofed",{op:true,x:0,y:-60,z:100,gameMode:"creative"});
  await t.wait(20);
  for(const p of[flier,roofed]){
    const before=await ask(p,"state");
    t.check(!before.radar,p.name+" starts with the optional radar OFF");
  }
  // This is an explicit two-viewer terrain-functionality case, not a general CI/performance default.
  for(const p of[flier,roofed]){await set(p,"terrain",true);await set(p,"radar",true);}
  const roof=await raw(roofed,[[1,101],[-7,93]],"fresh upper roof is acquired");
  t.check(roof.store.endsWith("|surface")&&roof.samples.every(s=>s.kind==="stone"&&s.y===-45),"fresh roofed viewer reads the actual upper surface, not an old cave layer or cached grass");
  for(let x=0;x<=75;x+=3){flier.teleport({x:x+.5,y:-60,z:.5},{rotation:{x:0,y:270}});await t.wait(1);}
  const points=[[69,1],[75,1],[81,1],[87,1],[75,7],[75,-5]];
  t.check(new Set(points.map(p=>p.join(","))).size===6&&points.every(p=>p.every(v=>Math.abs(v)%2===1)),"movement probes are six distinct canonical two-block anchors");
  const one=await raw(flier,points.slice(0,4),"movement reaches the first four sand samples");
  const two=await raw(flier,points.slice(4),"movement reaches the last two sand samples");
  const sand=[...one.samples,...two.samples];
  t.check(one.store.endsWith("|surface")&&two.store===one.store&&sand.every(s=>s.kind==="sand"&&s.y===-61&&Number.isInteger(s.palette)&&s.palette>=0&&s.palette<512),"all six movement samples are genuinely acquired sand at the native surface height with real color indexes");
  const stillRoof=await raw(roofed,[[1,101],[-7,93]],"other viewer retains its actual roof");
  t.check(stillRoof.store===one.store&&stillRoof.samples.every(s=>s.kind==="stone"&&s.y===-45),"moving viewer does not overwrite another location's shared surface samples");
  const pose=await ask(flier,"state");
  t.check(pose.pose?.dim===dim.id&&pose.pose.north===true&&Math.abs(pose.pose.x-flier.location.x)<1,"accepted state follows the current location and north-up terrain view");
  // No cache-filling flight, old fine-detail tier, command-edit refresh promise or active-radar performance benchmark.
  // Freshness, cache limits and ledger partitioning have focused regression coverage instead.
  for(const p of[flier,roofed])await set(p,"radar",false);
  await t.wait(20);
  for(const p of[flier,roofed])t.check(!(await ask(p,"state")).radar,p.name+" can opt out again without disabling the compass");
  await ask(flier,"cost");await t.wait(20);const off=await ask(flier,"cost");
  t.check(off.cost.scanReads===0,"after both opt out, optional terrain sampling performs zero native reads");
}
