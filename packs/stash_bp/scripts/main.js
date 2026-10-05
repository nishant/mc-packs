import {
  Block,
  BlockVolume,
  CommandPermissionLevel,
  Container,
  CustomCommandStatus,
  ItemStack,
  Player,
  system,
  world,
} from "@minecraft/server";
import { CONFIG } from "./config.js";

const containerTypes = new Set(CONFIG.containerTypes);
const MAIN_FIRST = 9; // player inventory: 0–8 hotbar, 9–35 main
const MAIN_END = 36;
const SIDES = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

// ---------------------------------------------------------------------------
// Cooldown
// ---------------------------------------------------------------------------

/** @type {Map<string, number>} player id → tick of last use */
const lastUse = new Map();
world.afterEvents.playerLeave.subscribe(({ playerId }) => lastUse.delete(playerId));

/** @param {Player} player @returns {boolean} true if the player may act now (and starts the cooldown) */
function ready(player) {
  const now = system.currentTick;
  if (now - (lastUse.get(player.id) ?? -Infinity) < CONFIG.cooldownTicks) return false;
  lastUse.set(player.id, now);
  return true;
}

// ---------------------------------------------------------------------------
// Sorting (only native moves, so no item data is ever copied)
// ---------------------------------------------------------------------------

/** No custom name, lore or enchantments: safe to merge by changing amounts. @param {ItemStack} item */
function plain(item) {
  if (!item.isStackable || item.nameTag || item.getLore().length) return false;
  const ench = item.getComponent("minecraft:enchantable");
  return !ench || ench.getEnchantments().length === 0;
}

/**
 * Merges partial stacks, then orders slots [from, to) by item id and largest stack first,
 * empty slots last. Returns the number of stacks.
 * @param {Container} container @param {number} from @param {number} to
 */
function sortRange(container, from, to) {
  /** @type {(ItemStack | undefined)[]} */
  const items = [];
  for (let i = from; i < to; i++) items[i] = container.getItem(i);

  // 1. Merge: change amounts in place (ContainerSlot.amount), never re-create a stack.
  for (let i = from; i < to; i++) {
    const a = items[i];
    if (!a || !plain(a) || a.amount >= a.maxAmount) continue;
    let amount = a.amount;
    for (let j = i + 1; j < to && amount < a.maxAmount; j++) {
      const b = items[j];
      if (!b || b.typeId !== a.typeId || !plain(b) || !a.isStackableWith(b)) continue;
      const move = Math.min(a.maxAmount - amount, b.amount);
      amount += move;
      if (move === b.amount) {
        container.setItem(j, undefined);
        items[j] = undefined;
      } else {
        container.getSlot(j).amount = b.amount - move;
        b.amount -= move;
      }
    }
    if (amount !== a.amount) container.getSlot(i).amount = amount;
    a.amount = amount;
  }

  // 2. Order: selection sort, applied with swapItems.
  const keys = items.map((it) => (it ? { id: it.typeId, n: it.amount } : undefined));
  /** @param {{ id: string, n: number } | undefined} x @param {{ id: string, n: number } | undefined} y */
  const before = (x, y) => !!x && (!y || x.id < y.id || (x.id === y.id && x.n > y.n));
  let stacks = 0;
  for (let i = from; i < to; i++) {
    let best = i;
    for (let j = i + 1; j < to; j++) if (before(keys[j], keys[best])) best = j;
    if (best !== i) {
      container.swapItems(i, best, container);
      [keys[i], keys[best]] = [keys[best], keys[i]];
    }
    if (keys[i]) stacks++;
  }
  return stacks;
}

/** @param {Block} block */
const containerOf = (block) => block.getComponent("minecraft:inventory")?.container;

/** @param {Player} player @param {Block} block */
function sortBlock(player, block) {
  const container = containerOf(block);
  if (!container) return;
  const stacks = sortRange(container, 0, container.size);
  player.onScreenDisplay.setActionBar(`§aSorted ${stacks} stack${stacks === 1 ? "" : "s"}`);
  player.playSound("random.click", { pitch: 1.4, volume: 0.5 });
}

/** @param {Player} player */
function sortInventory(player) {
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) return;
  const stacks = sortRange(container, CONFIG.sortHotbar ? 0 : MAIN_FIRST, MAIN_END);
  player.onScreenDisplay.setActionBar(`§aSorted ${stacks} stack${stacks === 1 ? "" : "s"} in your inventory`);
}

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { player, block, itemStack, isFirstEvent } = event;
  if (!CONFIG.sneakTapSorts || !player.isSneaking || itemStack || !containerTypes.has(block.typeId)) return;
  event.cancel = true; // sneak-tap sorts instead of opening
  if (!isFirstEvent || !ready(player)) return;
  const { x, y, z } = block.location;
  const dimension = block.dimension;
  system.run(() => {
    try {
      const b = dimension.getBlock({ x, y, z });
      if (b && containerTypes.has(b.typeId) && player.isValid) sortBlock(player, b);
    } catch (e) {
      console.warn(`[stash] ${e}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Quick stack
// ---------------------------------------------------------------------------

/** @typedef {{ block: Block, container: Container, ids: Set<string>, dist: number }} Target */

/** "typeId:amount,…" for every slot, to recognize the two halves of one double chest. @param {Container} c */
function signature(c) {
  const parts = [];
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    parts.push(it ? `${it.typeId}:${it.amount}` : "");
  }
  return parts.join(",");
}

/** A chest's facing, from whichever state this game version uses. @param {Block} b */
function facingOf(b) {
  const s = b.permutation.getAllStates();
  return s["minecraft:cardinal_direction"] ?? s["facing_direction"];
}

/**
 * The other half of a double chest whose halves both report the whole 54 slots. The halves share
 * a type, a facing and (being one container) the same contents, and sit side by side across the
 * facing. In a row of identical double chests the pairs start at the row's end, so the number of
 * identical chests behind a half says which side its partner is on.
 * @param {Block} block
 * @param {(b: Block) => string | undefined} sigOf contents signature of a 54-slot container, else undefined
 * @returns {Block | undefined}
 */
function partnerOf(block, sigOf) {
  const sig = sigOf(block);
  if (sig === undefined) return undefined;
  const facing = facingOf(block);
  // north/south (or facing_direction 2/3) pair along x, east/west (4/5) along z
  const alongX = facing === "north" || facing === "south" || facing === 2 || facing === 3;
  const alongZ = facing === "east" || facing === "west" || facing === 4 || facing === 5;
  const dirs = SIDES.filter((d) => (alongX ? d.x !== 0 : alongZ ? d.z !== 0 : true));
  /** @param {Block | undefined} b */
  const twin = (b) => !!b && b.typeId === block.typeId && facingOf(b) === facing && sigOf(b) === sig;
  const found = dirs.filter((d) => twin(block.offset(d)));
  if (found.length < 2) return found.length ? block.offset(found[0]) : undefined;
  const d = found.find((f) => found.some((g) => g.x === -f.x && g.z === -f.z));
  if (!d) return block.offset(found[0]);
  const back = { x: -d.x, y: 0, z: -d.z };
  let behind = 0;
  for (let b = block.offset(back); behind < 64 && twin(b); b = b?.offset(back)) behind++;
  return block.offset(behind % 2 === 0 ? d : back);
}

/** Caches contents signatures for one pass: "typeId:amount,…" per slot, 54-slot containers only. */
function signatures() {
  /** @type {Map<string, string | undefined>} */
  const cache = new Map();
  /** @param {Block} b */
  return (b) => {
    const key = `${b.x},${b.y},${b.z}`;
    if (!cache.has(key)) {
      const c = containerOf(b);
      cache.set(key, c && c.size > 27 ? signature(c) : undefined);
    }
    return cache.get(key);
  };
}

/**
 * Finds the listed containers within stashRadius, nearest first, reading a few per tick.
 * @param {Player} player
 * @returns {Generator<void, Target[], void>}
 */
function* findTargets(player) {
  const { dimension } = player;
  const r = CONFIG.stashRadius;
  const p = { x: Math.floor(player.location.x), y: Math.floor(player.location.y), z: Math.floor(player.location.z) };
  const minY = Math.max(dimension.heightRange.min, p.y - r);
  const maxY = Math.min(dimension.heightRange.max - 1, p.y + r);
  if (minY > maxY) return [];
  // One native query for the whole cube; locations in unloaded chunks are skipped.
  const found = dimension.getBlocks(
    new BlockVolume({ x: p.x - r, y: minY, z: p.z - r }, { x: p.x + r, y: maxY, z: p.z + r }),
    { includeTypes: [...containerTypes] },
    true
  );

  /** @type {Target[]} */
  const targets = [];
  /** @type {Set<string>} "x,y,z" of the double-chest halves already counted */
  const counted = new Set();
  const sigOf = signatures();
  let read = 0;
  for (const loc of found.getBlockLocationIterator()) {
    const block = dimension.getBlock(loc);
    const container = block && containerOf(block);
    if (!block || !container) continue;
    const ids = new Set();
    for (let i = 0; i < container.size; i++) {
      const it = container.getItem(i);
      if (it) ids.add(it.typeId);
    }
    if (container.size > 27) {
      // Either half of a double chest may report the whole 54 slots: count it once.
      const other = partnerOf(block, sigOf);
      counted.add(`${loc.x},${loc.y},${loc.z}`);
      if (other && counted.has(`${other.x},${other.y},${other.z}`)) continue;
    }
    const dx = loc.x - p.x, dy = loc.y - p.y, dz = loc.z - p.z;
    if (ids.size) targets.push({ block, container, ids, dist: dx * dx + dy * dy + dz * dz });
    if (++read % 8 === 0) yield;
  }
  return targets.sort((a, b) => a.dist - b.dist);
}

/** @param {Player} player */
function* stash(player) {
  try {
    yield* quickStack(player);
  } catch (e) {
    console.warn(`[stash] ${e}`);
  }
}

/** @param {Player} player */
function* quickStack(player) {
  const targets = yield* findTargets(player);
  if (!player.isValid) return;
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv) return;

  let moved = 0;
  /** @type {Set<Target>} */
  const received = new Set();
  for (let slot = MAIN_FIRST; slot < MAIN_END; slot++) {
    const item = inv.getItem(slot);
    if (!item || (item.nameTag && !CONFIG.stashNamedItems)) continue;
    let left = item.amount;
    for (const t of targets) {
      if (!t.ids.has(item.typeId) || !t.container.isValid) continue;
      const rest = inv.transferItem(slot, t.container); // native move: fills matching stacks, then empty slots
      // The leftover should stay in the slot; if it was handed back instead, put it back.
      if (rest && !inv.getItem(slot)) inv.setItem(slot, rest);
      const now = inv.getItem(slot)?.amount ?? 0;
      if (now < left) {
        moved += left - now;
        received.add(t);
      }
      left = now;
      if (!left) break;
    }
  }

  for (const t of received) {
    const c = t.block.center();
    try {
      t.block.dimension.spawnParticle("minecraft:villager_happy", { x: c.x, y: c.y + 0.7, z: c.z });
    } catch {
      // particle in an unloaded spot: not worth reporting
    }
  }
  const noun = [...received].every((t) => t.block.typeId.endsWith("chest")) ? "chest" : "container";
  player.onScreenDisplay.setActionBar(
    moved
      ? `§aStashed ${moved} item${moved === 1 ? "" : "s"} into ${received.size} ${noun}${received.size === 1 ? "" : "s"}`
      : targets.length
        ? "§7Nothing to stash: no nearby container holds the same items"
        : "§7No containers nearby"
  );
  if (moved) player.playSound("random.pop", { pitch: 0.8 });
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * @param {import("@minecraft/server").CustomCommandOrigin} origin
 * @param {(player: Player) => void} run
 */
function playerCommand(origin, run) {
  const player = origin.initiator ?? origin.sourceEntity;
  if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
  if (!ready(player)) return { status: CustomCommandStatus.Failure, message: "Too fast. Try again in a moment." };
  system.run(() => {
    try {
      run(player);
    } catch (e) {
      console.warn(`[stash] ${e}`);
    }
  });
  return { status: CustomCommandStatus.Success };
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:stash",
      description: "Put your items into nearby chests that already hold the same items",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => playerCommand(origin, (player) => system.runJob(stash(player)))
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:sort",
      description: "Sort your inventory (the hotbar stays as it is)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => playerCommand(origin, sortInventory)
  );
});
