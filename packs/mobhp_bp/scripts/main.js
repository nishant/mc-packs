import { CommandPermissionLevel, CustomCommandStatus, Entity, Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get, getFor, setFor } from "./settings.js";
import { isSlot, sideBoxes } from "./side.js";

// The "on" preference (player property "mobhp:pref") and the world options live in settings.js.

/** @param {Player} player */
const showsFor = (player) => get("enabled") === true && getFor(player, "on") === true;

/** The mob's name as the game shows it: its name tag, a player's name, or the translated mob name. @param {Entity} entity */
function nameOf(entity) {
  if (entity instanceof Player) return { text: entity.name };
  if (entity.nameTag && !showingOurs(entity)) return { text: entity.nameTag };
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

/** The mob's name as plain text, for the side boxes and name tags: its name tag, a player's name, or its id made readable. @param {Entity} entity */
function plainName(entity) {
  if (entity instanceof Player) return entity.name;
  if (entity.nameTag && !showingOurs(entity)) return entity.nameTag;
  const id = entity.typeId.includes(":") ? entity.typeId.slice(entity.typeId.indexOf(":") + 1) : entity.typeId;
  return id
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

const side = sideBoxes("mobhp");
/** The box mob health uses when "Above the mob" can't be used (players, named mobs). */
const FALLBACK_SLOT = "right1";

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
    const numbers = `§f${current}/${max} ${bar(current, max)}`;
    let where = getFor(attacker, "where");
    if (where === "overhead") {
      // A killing blow: no name on a dying mob (a named mob's death can show in chat); take ours off now.
      if (current <= 0) dropOverhead(hurtEntity);
      else if (showOverhead(hurtEntity, numbers)) return;
      // Players and mobs with a name of their own keep it: the realm's default box, or the first box.
      const base = get("showAt");
      where = isSlot(base) ? base : FALLBACK_SLOT;
    }
    if (where === "hotbar") {
      const text = { rawtext: [{ text: "§f" }, nameOf(hurtEntity), { text: `  ${numbers}` }] };
      // Ask the Coordinates HUD, if installed, to leave this on screen for a moment.
      system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: attacker.id, ticks: CONFIG.holdTicks, from: "mobhp_bp" }));
      attacker.onScreenDisplay.setActionBar(text);
      return;
    }
    side.show(attacker, isSlot(where) ? where : FALLBACK_SLOT, `§f${plainName(hurtEntity)}  ${numbers}`, CONFIG.holdTicks);
  } catch (e) {
    console.warn(`[mobhp] ${e}`);
  }
});

// ---- Above the mob ----
// The health goes in the mob's name tag for holdTicks, then the tag is taken off again. While it shows, the
// mob carries the tag TAGGED and the property TAG_PROP (the name tag we wrote), so a restart or an unloaded
// chunk mid-display still takes it off when the mob loads again. Named mobs never despawn, so no name may stay.
const TAGGED = "mobhp_tag";
const TAG_PROP = "mobhp:tag";
/** entity id -> { entity, until } of name tags showing now */
const overhead = new Map();

/** Is the mob's name tag the health this pack wrote (not a name someone gave it meanwhile)? @param {Entity} entity */
function showingOurs(entity) {
  try {
    return entity.hasTag(TAGGED) && entity.nameTag === entity.getDynamicProperty(TAG_PROP);
  } catch {
    return false;
  }
}

/** @param {Entity} entity @param {string} numbers @returns {boolean} false when this mob can't show it (a player, or a mob with a name) */
function showOverhead(entity, numbers) {
  if (entity instanceof Player) return false;
  const ours = showingOurs(entity);
  if (entity.nameTag && !ours) {
    // Named (with a name tag, or by another pack) while our health showed: keep that name and forget ours.
    if (entity.hasTag(TAGGED)) {
      overhead.delete(entity.id);
      untag(entity);
    }
    return false;
  }
  const text = numbers;
  if (!ours) entity.addTag(TAGGED);
  entity.setDynamicProperty(TAG_PROP, text);
  entity.nameTag = text;
  overhead.set(entity.id, { entity, until: system.currentTick + CONFIG.holdTicks });
  return true;
}

/** Takes our name tag off a mob (only if it's still ours: another pack may have named it meanwhile). @param {Entity} entity */
function untag(entity) {
  try {
    if (!entity.isValid) return;
    const wrote = entity.getDynamicProperty(TAG_PROP);
    if (typeof wrote !== "string" || entity.nameTag === wrote) entity.nameTag = "";
    entity.setDynamicProperty(TAG_PROP, undefined);
    entity.removeTag(TAGGED);
  } catch (e) {
    console.warn(`[mobhp] ${e}`);
  }
}

/** Takes our name tag off a mob now, if it shows one. @param {Entity} entity */
function dropOverhead(entity) {
  try {
    if (entity instanceof Player || !entity.hasTag(TAGGED)) return;
  } catch {
    return;
  }
  overhead.delete(entity.id);
  untag(entity);
}

world.afterEvents.entityDie.subscribe(({ deadEntity }) => dropOverhead(deadEntity));

system.runInterval(() => {
  if (!overhead.size) return;
  const now = system.currentTick;
  for (const [id, o] of overhead) {
    if (o.until > now && o.entity.isValid) continue;
    overhead.delete(id);
    untag(o.entity);
  }
}, 5);

// Left over from before a restart, or from a chunk that unloaded while the health showed.
world.afterEvents.entityLoad.subscribe(({ entity }) => {
  try {
    if (entity.hasTag(TAGGED) && !overhead.has(entity.id)) untag(entity);
  } catch {
    // gone again
  }
});
world.afterEvents.worldLoad.subscribe(() => {
  for (const dim of ["overworld", "nether", "the_end"]) {
    try {
      for (const e of world.getDimension(dim).getEntities({ tags: [TAGGED] })) untag(e);
    } catch {
      // not loaded
    }
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
