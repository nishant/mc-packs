import "./diag.js";
import { CommandPermissionLevel, CustomCommandStatus, EquipmentSlot, Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get, getFor, onChange, setFor } from "./settings.js";
import { onScriptEvent } from "./script-events.js";

// Player property "durability:off" (true = warnings off) is the "off" preference in settings.js.

/** Held items wear down when used (mining, fighting, a bow, a hoe...): checked after each use, hit or hotbar change. */
const HELD = [EquipmentSlot.Mainhand, EquipmentSlot.Offhand];
/** Armor wears down a point per hit: checked after the wearer is hurt. */
const ARMOR = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet];
/** An elytra wears down while gliding, which fires no event: its wearer's armor is checked every ARMOR_EVERY checks. */
const ARMOR_EVERY = 4;
const ALL = [...HELD, ...ARMOR];
/** Every slot of every player is also checked once in this many checks (5 s by default), spread over the checks by
 * player, for what fires no event (armor put on by a dispenser or a command, another pack changing an item). */
const SWEEP_EVERY = 10;

const OK = 0;
const WARN = 1;
const CRITICAL = 2;
/** Share of an item's durability it must be repaired above a level before that level warns again. */
const REARM = 0.02;

/** player id → slot key → { typeId, level } of the last check */
const state = new Map();
/** Item type → max durability, and the types with none (a type's durability is fixed while the world runs). @type {Map<string, number>} */
const maxOf = new Map();
/** @type {Set<string>} */
const undamageable = new Set();

/** Players whose held items may have worn down or changed since their last check. @type {Set<string>} */
const heldDirty = new Set();
/** Players who were hurt (armor wears) since their last check. @type {Set<string>} */
const armorDirty = new Set();
/** Players wearing an elytra at their last armor check. @type {Set<string>} */
const gliders = new Set();
/** Each player's share of the sweep (0 to SWEEP_EVERY - 1), from a hash of their id. @type {Map<string, number>} */
const sweepSlot = new Map();
/** @param {string} id */
function slotOf(id) {
  let s = sweepSlot.get(id);
  if (s !== undefined) return s;
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  sweepSlot.set(id, (s = (h >>> 8) % SWEEP_EVERY));
  return s;
}

/** @param {unknown} e @returns {e is Player} */
const isPlayer = (e) => e instanceof Player || /** @type {any} */ (e)?.typeId === "minecraft:player";
/** @param {unknown} e */
const held = (e) => {
  if (isPlayer(e)) heldDirty.add(e.id);
};

// What wears a held item down, or changes it: each marks the player for the next check.
world.afterEvents.playerBreakBlock.subscribe(({ player }) => held(player));
world.afterEvents.playerInteractWithBlock.subscribe(({ player }) => held(player));
world.afterEvents.playerInteractWithEntity.subscribe(({ player }) => held(player));
world.afterEvents.itemUse.subscribe(({ source }) => held(source));
world.afterEvents.itemReleaseUse.subscribe(({ source }) => held(source));
world.afterEvents.itemCompleteUse.subscribe(({ source }) => held(source));
world.afterEvents.itemStopUseOn.subscribe(({ source }) => held(source));
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity }) => held(damagingEntity), { entityTypes: ["minecraft:player"] });
world.afterEvents.entityHitBlock.subscribe(({ damagingEntity }) => held(damagingEntity), { entityTypes: ["minecraft:player"] });
world.afterEvents.playerHotbarSelectedSlotChange.subscribe(({ player }) => held(player));
/** Can be worn (put on from the inventory, or taken off into it). @param {import("@minecraft/server").ItemStack | undefined} item */
const wearable = (item) => !!item && /_(helmet|chestplate|leggings|boots)$|:elytra$/.test(item.typeId);
world.afterEvents.playerInventoryItemChange.subscribe(({ player, itemStack, beforeItemStack }) => {
  held(player);
  if (player && (wearable(beforeItemStack) || wearable(itemStack))) armorDirty.add(player.id);
});
// Hurt: armor wears, and a shield in the off hand.
world.afterEvents.entityHurt.subscribe(
  ({ hurtEntity }) => {
    if (!isPlayer(hurtEntity)) return;
    heldDirty.add(hurtEntity.id);
    armorDirty.add(hurtEntity.id);
  },
  { entityTypes: ["minecraft:player"] },
);
world.afterEvents.playerSpawn.subscribe(({ player }) => {
  heldDirty.add(player.id);
  armorDirty.add(player.id);
});

let round = 0;
system.runInterval(() => {
  round++;
  const sweep = round % SWEEP_EVERY;
  const glide = round % ARMOR_EVERY === 0;
  for (const player of world.getAllPlayers()) {
    try {
      const id = player.id;
      const all = armorDirty.has(id) || slotOf(id) === sweep || (glide && gliders.has(id));
      if (!all && !heldDirty.has(id)) continue;
      heldDirty.delete(id);
      if (all) armorDirty.delete(id);
      check(player, all ? ALL : HELD);
    } catch (e) {
      console.warn(`[durability] ${e}`);
    }
  }
}, CONFIG.checkIntervalTicks);

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  state.delete(playerId);
  heldDirty.delete(playerId);
  armorDirty.delete(playerId);
  gliders.delete(playerId);
  sweepSlot.delete(playerId);
});

// Turning warnings back on (here, in /realm:prefs or with /realm:durability) starts the levels over.
onChange((key, player) => {
  if (!player || key !== "off") return;
  state.delete(player.id);
  heldDirty.add(player.id);
  armorDirty.add(player.id);
});

/** @param {Player} player @param {EquipmentSlot[]} slots */
function check(player, slots) {
  if (getFor(player, "off") === true) return;
  const equippable = player.getComponent("minecraft:equippable");
  if (!equippable) return;

  let seen = state.get(player.id);
  if (!seen) state.set(player.id, (seen = new Map()));

  for (const slot of slots) {
    // Each hotbar slot counts separately, so switching to another worn tool warns again.
    const key = slot === EquipmentSlot.Mainhand ? `${slot}:${player.selectedSlotIndex}` : slot;
    const item = equippable.getEquipment(slot);
    if (slot === EquipmentSlot.Chest) {
      if (item?.typeId === "minecraft:elytra") gliders.add(player.id);
      else gliders.delete(player.id);
    }
    if (!item) {
      seen.delete(key);
      continue;
    }
    const typeId = item.typeId;

    // An item type's durability never changes while the world runs: ask the game once per type.
    if (undamageable.has(typeId)) {
      seen.delete(key);
      continue;
    }
    const durability = item.getComponent("minecraft:durability");
    let max = maxOf.get(typeId);
    if (max === undefined) {
      max = durability?.maxDurability ?? 0;
      if (max <= 0) undamageable.add(typeId);
      else maxOf.set(typeId, max);
    }
    if (!durability || max <= 0) {
      seen.delete(key);
      continue;
    }

    const left = max - durability.damage;
    const prev = seen.get(key);
    const prevLevel = prev && prev.typeId === typeId ? prev.level : OK;
    // A level only clears once the item is a little above it again (REARM of its durability), so a
    // Mending tool hovering at the line (each ore's XP repairs a point or two) doesn't warn every few blocks.
    const rearm = Math.ceil(max * REARM);
    const level = Math.max(levelFor(left, max), Math.min(prevLevel, levelFor(left - rearm, max)));
    seen.set(key, { typeId, level });

    // Only notify when it gets worse; a new item or a repair resets.
    if (level > prevLevel) notify(player, itemName(item), left, max, level);
  }
}

/** @param {number} left @param {number} max */
function levelFor(left, max) {
  const maxUses = get("maxUsesForWarning");
  if (maxUses > 0 && left > maxUses) return OK;
  const pct = (left / max) * 100;
  if (pct <= get("criticalPercent")) return CRITICAL;
  if (pct <= get("warnPercent")) return WARN;
  return OK;
}

/**
 * @param {Player} player
 * @param {string} name
 * @param {number} left
 * @param {number} max
 * @param {number} level
 */
function notify(player, name, left, max, level) {
  const pct = ((left / max) * 100).toFixed(left / max < 0.1 ? 1 : 0);
  // Ask the Coordinates HUD, if installed, to leave the warning on screen for a moment.
  system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: player.id, ticks: 60, from: "durability_bp" }));
  if (level === CRITICAL) {
    const text = `§c§l! ${name} is about to break!§r §c${left}/${max} (${pct}%)`;
    player.onScreenDisplay.setActionBar(text);
    if (get("chatOnCritical")) player.sendMessage(text);
    player.playSound("random.anvil_land", { volume: 0.4, pitch: 1.4 });
  } else {
    player.onScreenDisplay.setActionBar(`§e! ${name} is low: ${left}/${max} (${pct}%)`);
    player.playSound("note.pling", { volume: 0.7, pitch: 0.8 });
  }
}

/** @param {import("@minecraft/server").ItemStack} item */
function itemName(item) {
  if (item.nameTag) return item.nameTag;
  return item.typeId
    .replace(/^[^:]+:/, "")
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:durability",
      description: "Enable or disable low-durability warnings for yourself",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      }
      const nowOff = getFor(player, "off") !== true;
      system.run(() => setFor(player, "off", nowOff));
      return {
        status: CustomCommandStatus.Success,
        message: nowOff
          ? "Low-durability warnings: Disabled. Run /realm:durability again to enable them."
          : "Low-durability warnings: Enabled. Run /realm:durability again to disable them.",
      };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
onScriptEvent(
  "realm:help_ping",
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "durability_bp");
  },
);
