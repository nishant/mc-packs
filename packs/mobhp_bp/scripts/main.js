import { CommandPermissionLevel, CustomCommandStatus, Entity, Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get, getFor, setFor } from "./settings.js";

// The "on" preference (player property "mobhp:pref") and the world options live in settings.js.

/** @param {Player} player */
const showsFor = (player) => get("enabled") === true && getFor(player, "on") === true;

/** The mob's name as the game shows it: its name tag, a player's name, or the translated mob name. @param {Entity} entity */
function nameOf(entity) {
  if (entity instanceof Player) return { text: entity.name };
  if (entity.nameTag) return { text: entity.nameTag };
  return { translate: entity.localizationKey };
}

/** @param {number} current @param {number} max */
function bar(current, max) {
  const length = get("barLength");
  const share = max > 0 ? Math.min(Math.max(current / max, 0), 1) : 0;
  const filled = current > 0 ? Math.max(1, Math.round(share * length)) : 0;
  const color = share > 0.5 ? "§a" : share > 0.25 ? "§e" : "§c";
  return `${color}${"|".repeat(filled)}§8${"|".repeat(length - filled)}`;
}

world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource }) => {
  const attacker = damageSource.damagingEntity;
  if (!(attacker instanceof Player) || attacker.id === hurtEntity.id) return;
  try {
    if (hurtEntity instanceof Player && get("players") !== true) return;
    if (!showsFor(attacker)) return;
    const health = hurtEntity.getComponent("minecraft:health");
    if (!health) return;
    const max = Math.round(health.effectiveMax);
    const current = Math.max(0, Math.ceil(health.currentValue));
    attacker.onScreenDisplay.setActionBar({
      rawtext: [{ text: "§f" }, nameOf(hurtEntity), { text: `  §f${current}/${max} ${bar(current, max)}` }],
    });
    // Ask the Coordinates HUD, if installed, to leave this on screen for a moment.
    system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: attacker.id, ticks: CONFIG.holdTicks }));
  } catch (e) {
    console.warn(`[mobhp] ${e}`);
  }
});

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:mobhp",
      description: "Show or hide the health of mobs you hit, for yourself",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      }
      const nowOn = getFor(player, "on") !== true;
      system.run(() => setFor(player, "on", nowOn));
      const realmOff = get("enabled") !== true ? " §7(Mob health is disabled on this realm right now, so nothing shows until an operator enables it.)" : "";
      return {
        status: CustomCommandStatus.Success,
        message:
          (nowOn ? "Mob health: Enabled. Run /realm:mobhp again to hide it." : "Mob health: Disabled. Run /realm:mobhp again to show it.") + realmOff,
      };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "mobhp_bp");
  },
  { namespaces: ["realm"] }
);
