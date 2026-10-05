import { Block, ItemStack, Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

/** @typedef {{ block: string, state: string, ripe: number, seed: string, sound: string }} Crop */

/** @type {Map<string, Crop>} */
const crops = new Map(CONFIG.crops.map((c) => [c.block, c]));

/**
 * Drops used only if `/loot … mine` doesn't work from scripts: close to the vanilla ranges,
 * without Fortune. [item, min, max] per crop.
 * @type {Record<string, [string, number, number][]>}
 */
const FALLBACK_DROPS = {
  "minecraft:wheat": [["minecraft:wheat", 1, 1], ["minecraft:wheat_seeds", 0, 3]],
  "minecraft:carrots": [["minecraft:carrot", 2, 5]],
  "minecraft:potatoes": [["minecraft:potato", 2, 5]],
  "minecraft:beetroot": [["minecraft:beetroot", 1, 1], ["minecraft:beetroot_seeds", 0, 3]],
  "minecraft:nether_wart": [["minecraft:nether_wart", 2, 4]],
  "minecraft:cocoa": [["minecraft:cocoa_beans", 2, 3]],
};
let lootWarned = false;

/** @param {import("@minecraft/server").ItemStack | undefined} item */
const isHoe = (item) => !!item && item.typeId.endsWith("_hoe");

/** @param {Block} block @returns {Crop | undefined} the crop if the block is a fully grown one */
function ripeCrop(block) {
  const crop = crops.get(block.typeId);
  if (!crop) return undefined;
  return block.permutation.getState(/** @type {any} */ (crop.state)) === crop.ripe ? crop : undefined;
}

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { player, block, itemStack, isFirstEvent } = event;
  if (!isFirstEvent || player.isSneaking) return;
  // Seeds, bone meal and anything else in hand keep their vanilla use.
  if (itemStack ? !isHoe(itemStack) : get("requireHoe")) return;
  const crop = ripeCrop(block);
  if (!crop) return;

  event.cancel = true;
  const { x, y, z } = block.location;
  const dimension = block.dimension;
  system.run(() => {
    try {
      const b = dimension.getBlock({ x, y, z });
      if (b && ripeCrop(b) === crop && player.isValid) harvest(player, b, crop);
    } catch (e) {
      console.warn(`[harvest] ${e}`);
    }
  });
});

/** @param {Player} player @param {Block} block @param {Crop} crop */
function harvest(player, block, crop) {
  const center = block.center();
  dropLoot(player, block, center);

  // Replant: back to its first growth stage. Other states (cocoa's direction) stay as they are.
  if (!get("replantCostsSeed") || takeSeed(player, crop.seed, center)) {
    block.setPermutation(block.permutation.withState(/** @type {any} */ (crop.state), 0));
  } else {
    block.setType("minecraft:air");
    player.onScreenDisplay.setActionBar("§7No seed to replant it");
  }
  block.dimension.playSound(crop.sound, center);
  if (get("damageHoe")) damageHeldHoe(player);
}

/**
 * The block's own Bedrock loot table, with the held item as the tool so Fortune counts.
 * @param {Player} player @param {Block} block @param {import("@minecraft/server").Vector3} at
 */
function dropLoot(player, block, at) {
  const { x, y, z } = block.location;
  let problem = "no success";
  try {
    const res = player.runCommand(`loot spawn ${at.x} ${at.y} ${at.z} mine ${x} ${y} ${z} mainhand`);
    if (res.successCount > 0) return;
  } catch (e) {
    problem = String(e);
  }
  if (!lootWarned) {
    lootWarned = true;
    console.warn(`[harvest] /loot failed (${problem}); using built-in drops when it does`);
  }
  for (const [item, min, max] of FALLBACK_DROPS[block.typeId] ?? []) {
    const count = min + Math.floor(Math.random() * (max - min + 1));
    if (count > 0) block.dimension.spawnItem(new ItemStack(item, count), at);
  }
}

/**
 * Takes one seed for the replant: from the item entities that just dropped, else from the
 * player's inventory. Returns false if there was none.
 * @param {Player} player @param {string} seed @param {import("@minecraft/server").Vector3} at
 */
function takeSeed(player, seed, at) {
  for (const entity of player.dimension.getEntities({ type: "minecraft:item", location: at, maxDistance: 1.5 })) {
    const stack = entity.getComponent("minecraft:item")?.itemStack;
    if (stack?.typeId !== seed) continue;
    const { location } = entity;
    entity.remove();
    if (stack.amount > 1) {
      stack.amount -= 1;
      player.dimension.spawnItem(stack, location);
    }
    return true;
  }
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) return false;
  for (let i = 0; i < container.size; i++) {
    const item = container.getItem(i);
    if (item?.typeId !== seed) continue;
    const slot = container.getSlot(i);
    if (item.amount > 1) slot.amount = item.amount - 1;
    else slot.setItem(undefined);
    return true;
  }
  return false;
}

/** @param {Player} player */
function damageHeldHoe(player) {
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) return;
  const slot = player.selectedSlotIndex;
  const item = container.getItem(slot);
  if (!isHoe(item)) return;
  const durability = item?.getComponent("minecraft:durability");
  if (!item || !durability) return;
  const unbreaking = item.getComponent("minecraft:enchantable")?.getEnchantment("unbreaking")?.level ?? 0;
  if (Math.random() >= 1 / (unbreaking + 1)) return; // vanilla Unbreaking: 1 in (level + 1) uses costs durability
  if (durability.damage >= durability.maxDurability) {
    container.setItem(slot, undefined);
    player.playSound("random.break");
    return;
  }
  durability.damage += 1;
  container.setItem(slot, item);
}

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "harvest_bp");
  },
  { namespaces: ["realm"] }
);
