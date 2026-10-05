import { CommandPermissionLevel, CustomCommandStatus, EquipmentSlot, Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get, getFor, onChange, setFor } from "./settings.js";

// Player property "durability:off" (true = warnings off) is the "off" preference in settings.js.

const SLOTS = [
  EquipmentSlot.Mainhand,
  EquipmentSlot.Offhand,
  EquipmentSlot.Head,
  EquipmentSlot.Chest,
  EquipmentSlot.Legs,
  EquipmentSlot.Feet,
];

const OK = 0;
const WARN = 1;
const CRITICAL = 2;

/** player id → slot key → { typeId, level } of the last check */
const state = new Map();

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    try {
      check(player);
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

/** @param {Player} player */
function check(player) {
  if (getFor(player, "off") === true) return;
  const equippable = player.getComponent("minecraft:equippable");
  if (!equippable) return;

  let seen = state.get(player.id);
  if (!seen) state.set(player.id, (seen = new Map()));

  for (const slot of SLOTS) {
    // Each hotbar slot counts separately, so switching to another worn tool warns again.
    const key = slot === EquipmentSlot.Mainhand ? `${slot}:${player.selectedSlotIndex}` : slot;
    const item = equippable.getEquipment(slot);
    const durability = item?.getComponent("minecraft:durability");

    if (!item || !durability || durability.maxDurability <= 0) {
      seen.delete(key);
      continue;
    }

    const max = durability.maxDurability;
    const left = max - durability.damage;
    const level = levelFor(left, max);
    const prev = seen.get(key);
    seen.set(key, { typeId: item.typeId, level });

    // Only notify when it gets worse; a new item or a repair resets.
    const prevLevel = prev && prev.typeId === item.typeId ? prev.level : OK;
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
  if (level === CRITICAL) {
    const text = `§c§l⚠ ${name} is about to break!§r §c${left}/${max} (${pct}%)`;
    player.onScreenDisplay.setActionBar(text);
    if (get("chatOnCritical")) player.sendMessage(text);
    player.playSound("random.anvil_land", { volume: 0.4, pitch: 1.4 });
  } else {
    player.onScreenDisplay.setActionBar(`§e⚠ ${name} is low: ${left}/${max} (${pct}%)`);
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
      description: "Turn low-durability warnings on or off for yourself",
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
          ? "Durability warnings off for you. Run /realm:durability again to turn them back on."
          : "Durability warnings on for you.",
      };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "durability_bp");
  },
  { namespaces: ["realm"] }
);
