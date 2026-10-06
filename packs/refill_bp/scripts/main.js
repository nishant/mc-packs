import {
  CommandPermissionLevel,
  Container,
  CustomCommandStatus,
  ItemLockMode,
  ItemStack,
  Player,
  PlayerInventoryType,
  system,
  world,
} from "@minecraft/server";
import { get, getFor, setFor } from "./settings.js";

// The "on" preference (player property "refill:pref") and the world options live in settings.js.

const HOTBAR = 9;
const MAIN_END = 36; // slots 9-35 are the main inventory
/** A slot that empties this many ticks before or after the player used something counts as used up. */
const USE_WINDOW = 3;
/** A tool with this many uses left or fewer, that disappears right after a use, broke. */
const BROKEN_LEFT = 2;
/** Worn items: using them puts them on (or on a pet), which empties the slot without breaking anything. */
const WORN = /(_helmet|_chestplate|_leggings|_boots|^minecraft:elytra|^minecraft:wolf_armor)$/;

/** player id -> { tick, wear } of their last use (placing, eating, throwing, hitting, mining, tapping). `wear` is a use that wears a tool down in hand rather than throwing or shooting it. */
const lastUse = new Map();

/** @param {unknown} who @param {boolean} wear */
function used(who, wear) {
  if (who instanceof Player) lastUse.set(who.id, { tick: system.currentTick, wear });
}

world.afterEvents.playerPlaceBlock.subscribe(({ player }) => used(player, false));
world.afterEvents.playerBreakBlock.subscribe(({ player }) => used(player, true));
world.afterEvents.playerInteractWithBlock.subscribe(({ player }) => used(player, true));
world.afterEvents.playerInteractWithEntity.subscribe(({ player }) => used(player, true));
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity }) => used(damagingEntity, true));
world.afterEvents.itemUse.subscribe(({ source }) => used(source, false));
world.afterEvents.itemCompleteUse.subscribe(({ source }) => used(source, false));
world.afterEvents.itemReleaseUse.subscribe(({ source }) => used(source, false));
world.afterEvents.playerLeave.subscribe(({ playerId }) => lastUse.delete(playerId));

/** @param {Player} player */
const refillsFor = (player) => get("enabled") === true && getFor(player, "on") === true;

/** @param {ItemStack} item @returns {number | undefined} uses left, or undefined without durability */
function usesLeft(item) {
  const d = item.getComponent("minecraft:durability");
  return d && d.maxDurability > 0 ? d.maxDurability - d.damage : undefined;
}

/** @param {ItemStack} item @returns {string[]} */
function enchantIds(item) {
  try {
    return (item.getComponent("minecraft:enchantable")?.getEnchantments() ?? []).map((e) => e.type.id);
  } catch {
    return [];
  }
}

/** @param {ItemStack} item */
const movable = (item) => item.lockMode === ItemLockMode.none;

/**
 * The main-inventory slot to refill from, or -1.
 * @param {Container} inv @param {ItemStack} gone what ran out @param {boolean} broke a tool broke
 */
function sourceSlot(inv, gone, broke) {
  let best = -1;
  let bestScore = -Infinity;
  const goneEnchants = broke ? enchantIds(gone) : [];
  for (let i = HOTBAR; i < Math.min(MAIN_END, inv.size); i++) {
    const item = inv.getItem(i);
    if (!item || item.typeId !== gone.typeId || !movable(item)) continue;
    let score;
    if (!broke) {
      // Only what the used-up stack could have stacked with: same data, name, lore and enchantments.
      if (!item.isStackableWith(gone)) continue;
      score = item.amount; // the fullest stack
    } else {
      // A named spare only replaces a tool with the same name.
      if (item.nameTag !== undefined && item.nameTag !== gone.nameTag) continue;
      const left = usesLeft(item);
      if (left === undefined) continue;
      const ench = enchantIds(item);
      // A plain tool is only replaced by a plain one, so enchanted spares are kept for later.
      if (goneEnchants.length === 0 && ench.length > 0) continue;
      const shared = ench.filter((id) => goneEnchants.includes(id)).length;
      score = shared * 100000 + left; // most enchantments in common, then most uses left
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** @param {Player} player @param {number} slot @param {ItemStack} gone @param {boolean} broke */
function refill(player, slot, gone, broke) {
  if (!player.isValid || !refillsFor(player)) return;
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv || !inv.isValid || inv.getItem(slot)) return; // something else went into the slot meanwhile
  const from = sourceSlot(inv, gone, broke);
  if (from < 0) return;
  // A native swap with the empty slot: the stack moves whole, with every bit of its data.
  inv.swapItems(from, slot, inv);
}

world.afterEvents.playerInventoryItemChange.subscribe(({ player, beforeItemStack, itemStack, inventoryType, slot }) => {
  if (itemStack || !beforeItemStack || inventoryType !== PlayerInventoryType.Hotbar) return;
  if (slot < 0 || slot >= HOTBAR) return;
  try {
    if (slot !== player.selectedSlotIndex || !refillsFor(player)) return;
    const gone = beforeItemStack;
    const single = gone.maxAmount <= 1;
    const left = usesLeft(gone);
    // Single items only come back when they broke: a thrown trident or a sword moved by hand doesn't.
    if (single && (left === undefined || WORN.test(gone.typeId))) return;
    const emptiedAt = system.currentTick;
    // Wait a moment: the use that emptied the slot may be reported just after this.
    system.runTimeout(() => {
      try {
        const use = lastUse.get(player.id);
        if (!use || Math.abs(use.tick - emptiedAt) > USE_WINDOW) return; // moved, dropped or put away by hand
        if (single) {
          // Broke: it was nearly worn out, or it vanished while being used in hand (mining, hitting, tapping).
          if (get("refillTools") !== true) return;
          if (/** @type {number} */ (left) > BROKEN_LEFT && !use.wear) return;
        }
        refill(player, slot, gone, single);
      } catch (e) {
        console.warn(`[refill] ${e}`);
      }
    }, 2);
  } catch (e) {
    console.warn(`[refill] ${e}`);
  }
});

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:refill",
      description: "Enable or disable hotbar refills for yourself",
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
      const realmOff = get("enabled") !== true ? " §7(Hotbar refill is disabled on this realm right now, so nothing is refilled until an operator enables it.)" : "";
      return {
        status: CustomCommandStatus.Success,
        message:
          (nowOn
            ? "Hotbar refill: Enabled. Run /realm:refill again to disable it."
            : "Hotbar refill: Disabled. Run /realm:refill again to enable it.") + realmOff,
      };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "refill_bp");
  },
  { namespaces: ["realm"] }
);
