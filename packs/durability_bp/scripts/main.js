import "./diag.js";
import { CommandPermissionLevel, CustomCommandStatus, EquipmentSlot, Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get, getFor, onChange, setFor } from "./settings.js";
import { onScriptEvent } from "./script-events.js";

// Player property "durability:off" (true = warnings off) is the "off" preference in settings.js.

/** Held items wear down fast (mining, fighting): looked at every check. */
const HELD = [EquipmentSlot.Mainhand, EquipmentSlot.Offhand];
/** Armor wears down a point per hit: every ARMOR_EVERY checks is soon enough, and keeps 40 players cheap. */
const ARMOR = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet];
const ARMOR_EVERY = 4;
const ALL = [...HELD, ...ARMOR];

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

let round = 0;
system.runInterval(() => {
  const slots = ++round % ARMOR_EVERY === 0 ? ALL : HELD;
  for (const player of world.getAllPlayers()) {
    try {
      check(player, slots);
    } catch (e) {
      console.warn(`[durability] ${e}`);
    }
  }
}, CONFIG.checkIntervalTicks);

world.afterEvents.playerLeave.subscribe(({ playerId }) => state.delete(playerId));

// Turning warnings back on (here, in /realm:prefs or with /realm:durability) starts the levels over.
onChange((key, player) => {
  if (player && key === "off") state.delete(player.id);
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
