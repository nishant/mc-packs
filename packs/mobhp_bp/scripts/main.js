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
    const text = { rawtext: [{ text: "§f" }, nameOf(hurtEntity), { text: `  §f${current}/${max} ${bar(current, max)}` }] };
    if (getFor(attacker, "where") === "hotbar") {
      attacker.onScreenDisplay.setActionBar(text);
      // Ask the Coordinates HUD, if installed, to leave this on screen for a moment.
      system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: attacker.id, ticks: CONFIG.holdTicks }));
    } else if (getFor(attacker, "where") === "middle") {
      // The subtitle line in the middle of the screen: other add-ons that redraw the action bar can't cover it.
      attacker.onScreenDisplay.setTitle("§r", { subtitle: text, fadeInDuration: 0, stayDuration: CONFIG.holdTicks, fadeOutDuration: 6 });
    } else {
      showSide(attacker, text, CONFIG.holdTicks);
    }
  } catch (e) {
    console.warn(`[mobhp] ${e}`);
  }
});

// ---- The right side of the screen ----
// Side HUD (hud_rp, in Realm Resources) shows the subtitle in a box above the scoreboard whenever the
// title is exactly SIDE, and hides the vanilla title for SIDE and SIDE_CLEAR. Packs that share the box
// say "realm:side" { player, from, ticks } when they write, so only the last writer clears it.
const SIDE = "§s§1§r";
const SIDE_CLEAR = "§s§0§r";
/** player id -> the pack that last wrote the side box */
const sideOwner = new Map();
/** player id -> tick this pack's text is due to disappear */
const sideUntil = new Map();

/** Shows text on the right side for `ticks`, then clears it if nobody wrote there since. @param {Player} player @param {any} text @param {number} ticks */
function showSide(player, text, ticks) {
  player.onScreenDisplay.setTitle(SIDE, { subtitle: text, fadeInDuration: 0, stayDuration: ticks, fadeOutDuration: 0 });
  sideOwner.set(player.id, "mobhp");
  system.sendScriptEvent("realm:side", JSON.stringify({ player: player.id, from: "mobhp", ticks }));
  const until = system.currentTick + ticks;
  sideUntil.set(player.id, until);
  system.runTimeout(() => {
    if (sideUntil.get(player.id) !== until) return;
    sideUntil.delete(player.id);
    if (sideOwner.get(player.id) !== "mobhp" || !player.isValid) return;
    try {
      player.onScreenDisplay.setTitle(SIDE_CLEAR, { fadeInDuration: 0, stayDuration: 1, fadeOutDuration: 0 });
    } catch {
      // left meanwhile
    }
  }, ticks);
}

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:side") return;
    try {
      const m = JSON.parse(message);
      if (typeof m?.player === "string" && typeof m.from === "string") sideOwner.set(m.player, m.from);
    } catch {
      // not ours
    }
  },
  { namespaces: ["realm"] }
);

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
