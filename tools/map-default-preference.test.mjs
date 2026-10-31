import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {CONFIG} from "../packs/map_bp/scripts/config.js";
function subject(worldRadar){class Player{constructor(){this.id="p";this.name="p";this.props=new Map();}getDynamicProperty(k){return this.props.get(k);}setDynamicProperty(k,v){if(v===undefined)this.props.delete(k);else this.props.set(k,v);}}const props=new Map(worldRadar===undefined?[]:[["map:cfg",JSON.stringify({radarDefault:worldRadar})]]),p=new Player();const context={CONFIG,Player,world:{getDynamicProperty:k=>props.get(k),setDynamicProperty:(k,v)=>props.set(k,v),getAllPlayers:()=>[p]},system:{sendScriptEvent(){}},onScriptEvent(){},console};const strip=t=>t.replace(/^import .+;\r?\n/gm,"").replace(/^export /gm,"");const src=strip(fs.readFileSync(new URL("../packs/map_bp/scripts/settings-core.js",import.meta.url),"utf8"))+"\n"+strip(fs.readFileSync(new URL("../packs/map_bp/scripts/settings.js",import.meta.url),"utf8")).replace("onScriptEvent: onSettingsEvent","onScriptEvent");const api=vm.runInNewContext(src+"\n;({getFor,setFor});",context);return{api,p};}
test("new radar preference defaults off while compass remains independent",()=>{const{api,p}=subject();assert.equal(api.getFor(p,"radar"),false);assert.equal(api.getFor(p,"compass"),true);});
for(const value of[true,false])test("explicit saved radar choice is preserved: "+value,()=>{const{api,p}=subject();p.props.set("map:pref",JSON.stringify({radar:value}));assert.equal(api.getFor(p,"radar"),value);});
test("explicit matching-default radar choice remains stored, not erased",()=>{const{api,p}=subject(true);assert.equal(api.setFor(p,"radar",true),undefined);assert.equal(JSON.parse(p.props.get("map:pref")).radar,true);});
