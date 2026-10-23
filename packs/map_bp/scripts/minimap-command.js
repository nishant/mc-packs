import {CommandPermissionLevel,CustomCommandParamType,CustomCommandStatus,Player,system} from "@minecraft/server";
import {MANUAL_SCAN_MAX_RADIUS,parseMinimapCommand} from "./terrain-work.js";

/** @typedef {{toggle:(player:Player)=>void,start:(player:Player,radius:number)=>void,status:(player:Player)=>void,cancel:(player:Player)=>void}} MinimapActions */

/** Replace the old realm:minimap registration; do not register the same name twice.
 * Caller invokes this inside its existing system.beforeEvents.startup callback.
 * World/store mutations run on system.run, never directly in the restricted command callback.
 * @param {import('@minecraft/server').CustomCommandRegistry} registry
 * @param {MinimapActions} actions
 */
export function registerMinimapCommand(registry,actions) {
  registry.registerCommand({
    name:'realm:minimap', description:'Toggle minimap; scan <block radius>, status, cancel',
    permissionLevel:CommandPermissionLevel.Any, cheatsRequired:false,
    optionalParameters:[
      {name:'action',type:CustomCommandParamType.String},
      // Stable native String parameters reject unquoted numeric tokens before the callback.
      // Keep status/cancel as first-position actions so the radius can be a genuine Integer.
      {name:'radius',type:CustomCommandParamType.Integer}
    ]
  },(origin,action,radius)=>{
    const player=origin.initiator ?? origin.sourceEntity;
    if (!(player instanceof Player)) return {status:CustomCommandStatus.Failure,message:'Must be run by a player.'};
    const parsed=parseMinimapCommand(action,radius,MANUAL_SCAN_MAX_RADIUS);
    if(parsed.kind==='error')return {status:CustomCommandStatus.Failure,message:parsed.message};
    system.run(()=>{
      try {
        if(!player.isValid)return;
        switch(parsed.kind){
          case 'toggle': actions.toggle(player); break;
          case 'scan': actions.start(player,parsed.radius); break;
          case 'status': actions.status(player); break;
          case 'cancel': actions.cancel(player); break;
        }
      } catch(error) {
        try {if(player.isValid)player.sendMessage('§e[Map] '+(error instanceof Error?error.message:String(error)));} catch {}
      }
    });
    return {status:CustomCommandStatus.Success};
  });
}
