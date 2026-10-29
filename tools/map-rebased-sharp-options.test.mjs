import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { CONFIG } from '../packs/map_bp/scripts/config.js';
const source=fs.readFileSync(new URL('../packs/map_bp/scripts/settings.js',import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../packs/map_bp/scripts/main.js',import.meta.url),'utf8');
const fn=n=>main.match(new RegExp('^function '+n+'\\([\\s\\S]*?^\\}','m'))[0];
const RADAR_OFF_RESET_PROP='map:radarOffReset20261022';
function harness(){
  const sent=[],saved=new Map([['map:cfg',JSON.stringify({radarNorthUp:false,nativeTerrain:false,mobRadius:48,mobRadiusMax:48})]]);let handler;
  class Player {constructor(){this.id='p';this.props=new Map([['map:pref',JSON.stringify({showMobs:false,showTown:false,showHome:false,terrain:false,mobRadius:48,radarNorthUp:false})]]);}getDynamicProperty(k){return this.props.get(k);}setDynamicProperty(k,v){if(v===undefined)this.props.delete(k);else this.props.set(k,v);}sendMessage(){} }
  const player=new Player();const context={CONFIG:{...CONFIG},Player,world:{getDynamicProperty:k=>saved.get(k),setDynamicProperty:(k,v)=>saved.set(k,v),getEntity:id=>id===player.id?player:undefined},system:{sendScriptEvent:(id,text)=>sent.push([id,JSON.parse(text)])},onScriptEvent:(_ids,fn)=>{handler=fn;},console};
  const api=vm.runInNewContext(source.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'')+';({get,getFor,set,setFor,describe,OPTIONS})',context);return {api,player,sent,context,request:m=>handler({id:'realm:cfg_ping',message:JSON.stringify(m)})};
}
test('canonical shared settings tail is byte-identical to published1fd',()=>{const tail=source.slice(source.indexOf('// ---- Shared:'));assert.equal(crypto.createHash('sha256').update(tail).digest('hex'),'d915cd0b371c076aa0ff5ad159fba8e568f5a423b2fb4609c3606c03be8c03f2');});
test('real options schema protocol lists the latest player bindings, exact world bounds and no internal fields',()=>{
  const h=harness();h.request({id:'schema',player:h.player.id});
  const packets=h.sent.filter(p=>p[0]==='realm:cfg_schema').map(p=>p[1]);assert.ok(packets.length);
  const options=packets.flatMap(p=>p.options);
  assert.deepEqual(options.filter(o=>o.scope==='player').map(o=>o.key),['compass','radar','terrain','showMobs','showTown','showHome','mobRadius']);
  for(const key of ['mobRadius','mobRadiusMax']){const o=options.find(o=>o.scope==='world'&&o.key===key);assert.equal(o.max,48);assert.equal(o.min,8);}
  const playerMob=options.find(o=>o.scope==='player'&&o.key==='mobRadius');assert.equal(playerMob.max,48);assert.equal(playerMob.min,8);assert.ok(!/player/i.test(options.find(o=>o.scope==='world'&&o.key==='mobRadius').label));
  for(const key of ['showMobs','showTown','showHome','radarTerrain','radarDefault'])assert.ok(options.some(o=>o.scope==='world'&&o.key===key),key);
  assert.ok(!options.some(o=>/north|rotat|turn/i.test(o.key+' '+(o.label||''))),'no orientation option in player or world schema');
  for(const internal of ['radarNorthUp','nativeTerrain','radarRadius','revealRadius','radarCells','fineDetail',RADAR_OFF_RESET_PROP])assert.ok(!options.some(o=>o.key===internal),internal+' must not be a menu option');
});
test('actual command get/set remains independent; removed internal fields cannot be written',()=>{
  const h=harness(),context={getFor:h.api.getFor,setFor:h.api.setFor};const toggle=vm.runInNewContext(fn('toggleMinimap')+';'+fn('toggleCompass')+';({toggleMinimap,toggleCompass})',context);
  toggle.toggleMinimap(h.player);assert.equal(h.api.getFor(h.player,'radar'),true);assert.equal(h.api.getFor(h.player,'compass'),true);
  toggle.toggleMinimap(h.player);toggle.toggleCompass(h.player);assert.equal(h.api.getFor(h.player,'radar'),false);assert.equal(h.api.getFor(h.player,'compass'),false);
  const writes={showMobs:false,showTown:false,showHome:false,terrain:false,mobRadius:40};
  for(const [key,value] of Object.entries(writes)){assert.equal(h.api.setFor(h.player,key,value),undefined,key);assert.equal(h.api.getFor(h.player,key),value,key);}
  for(const key of ['radarNorthUp','nativeTerrain','radarRadius','revealRadius','radarCells','fineDetail'])assert.equal(h.api.setFor(h.player,key,false),"isn't a preference");
  assert.notEqual(h.api.set('radarNorthUp',false),undefined,"radarNorthUp isn't a world setting");
  assert.equal(h.api.getFor(h.player,'compass'),false);
});
test('one-time radar OFF migration: existing radar resets once, later opt-ins persist, compass untouched',()=>{
  const h=harness();
  assert.equal(h.api.setFor(h.player,'radar',true),undefined);assert.equal(h.api.setFor(h.player,'compass',false),undefined);
  const reset=vm.runInNewContext('const RADAR_OFF_RESET="'+RADAR_OFF_RESET_PROP+'";'+fn('resetRadarOffOnce')+';resetRadarOffOnce',{setFor:h.api.setFor});
  assert.equal(reset(h.player),true);
  assert.equal(h.api.getFor(h.player,'radar'),false);assert.equal(h.api.getFor(h.player,'compass'),false);
  assert.equal(h.player.getDynamicProperty(RADAR_OFF_RESET_PROP),true);
  assert.equal(h.api.setFor(h.player,'radar',true),undefined);
  assert.equal(reset(h.player),false);assert.equal(h.api.getFor(h.player,'radar'),true);
});
test('legacy non-radar player choices still apply; world mob bounds are 8..48 and reject above 48',()=>{
  const h=harness(),prefs=vm.runInNewContext('('+fn('prefsOf')+')',{get:h.api.get,getFor:h.api.getFor,CONFIG:h.context.CONFIG,prefCache:new Map(),idOf:(p)=>p.id});const p=prefs(h.player);
  assert.equal(p.compass,true);assert.equal(p.radar,false);
  assert.equal(p.north,true,'saved player+world radarNorthUp false cannot rotate the live radar');assert.equal(p.terrain,false);assert.equal(p.mobs,false);assert.equal(p.town,false);assert.equal(p.home,false);
  assert.equal(p.radius,48);assert.equal(p.radarRadius,36);assert.equal(p.revealRadius,36);
  for(const key of ['mobRadius','mobRadiusMax']){assert.equal(h.api.set(key,48),undefined);assert.notEqual(h.api.set(key,49),undefined);assert.equal(h.api.get(key),48);assert.equal(h.api.set(key,32),undefined);assert.equal(h.api.get(key),32);}
  assert.equal(h.api.set('showMobs',false),undefined);assert.equal(h.api.getFor(h.player,'showMobs'),false);assert.equal(h.api.get('nativeTerrain'),true);
});
