import {
  Block,
  BlockTypes,
  BlockVolume,
  CommandPermissionLevel,
  Container,
  CustomCommandStatus,
  Dimension,
  Direction,
  ItemStack,
  Player,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, getFor } from "./settings.js";

const containerTypes = new Set(CONFIG.containerTypes);
const keepItems = new Set(CONFIG.keepItems);
const ENDER_CHEST = "minecraft:ender_chest"; // add-ons can't see inside: menu only, never sorted or stashed into
const MAIN_FIRST = 9; // player inventory: 0–8 hotbar, 9–35 main
const MAIN_END = 36;
const SIDES = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

/** "Chest", "Copper chest", "Shulker box"…: one name per kind, whatever its color or stage. @param {string} typeId */
function nameOf(typeId) {
  const id = typeId.replace(/^minecraft:/, "");
  const kind = id.endsWith("shulker_box") ? "shulker box" : id.endsWith("copper_chest") ? "copper chest" : id.replaceAll("_", " ");
  return kind[0].toUpperCase() + kind.slice(1);
}

/** "a, b or c" @param {string[]} words @param {string} [last] */
const orList = (words, last = "or") =>
  words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} ${last} ${words.at(-1)}`;

/** "chest, trapped chest, copper chest…": one name per kind. @param {string[]} ids */
const kindsOf = (ids) => [...new Set(ids.map((id) => nameOf(id).toLowerCase()))];

/** The kinds of storage the sneak-tap works on, e.g. "chest, trapped chest, copper chest, barrel or shulker box". @param {Player} player */
function storageKinds(player) {
  const kinds = kindsOf(CONFIG.containerTypes);
  if (getFor(player, "sneakTap") === "menu") kinds.push("ender chest");
  return orList(kinds);
}

/** Empty, or gear (a tool, weapon or armor: anything with durability), which has no sneak-tap use on a chest. @param {ItemStack | undefined} item */
const freeHand = (item) => !item || !!item.getComponent("minecraft:durability");

/** Items /realm:stash leaves with the player. @param {ItemStack} item */
function kept(item) {
  if (keepItems.has(item.typeId)) return true;
  if (item.nameTag && !get("stashNamedItems")) return true;
  return !get("stashGear") && !!item.getComponent("minecraft:durability");
}

/** @param {Container} c @param {number} from @param {number} to */
function usedSlots(c, from, to) {
  let n = 0;
  for (let i = from; i < to; i++) if (c.getItem(i)) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Cooldown
// ---------------------------------------------------------------------------

/** @type {Map<string, number>} player id → tick of last use */
const lastUse = new Map();
/** @type {Set<string>} player ids with the sneak-tap menu open, so a second tap doesn't stack another */
const menuOpen = new Set();
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  lastUse.delete(playerId);
  menuOpen.delete(playerId);
});

/** @param {Player} player @returns {boolean} true if the player may act now (and starts the cooldown) */
function ready(player) {
  const now = system.currentTick;
  if (now - (lastUse.get(player.id) ?? -Infinity) < get("cooldownTicks")) return false;
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
  const stacks = sortRange(container, getFor(player, "sortHotbar") ? 0 : MAIN_FIRST, MAIN_END);
  player.onScreenDisplay.setActionBar(`§aSorted ${stacks} stack${stacks === 1 ? "" : "s"} in your inventory`);
}

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

/** Copper chests of any stage, waxed or not, are one kind. @param {string} typeId */
const family = (typeId) => (typeId.endsWith("copper_chest") ? "copper_chest" : typeId);

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
  const twin = (b) => !!b && family(b.typeId) === family(block.typeId) && facingOf(b) === facing && sigOf(b) === sig;
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

/** @type {string[] | undefined} */
let knownTypes;
/** The listed container ids this game version has (copper chests are newer than 1.21.100). */
const stashTypes = () => (knownTypes ??= CONFIG.stashTypes.filter((id) => BlockTypes.get(id)));

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
    { includeTypes: stashTypes() },
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
    if (lockedOut(player, block, sigOf)) continue; // someone else's locked chest
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
    if (!item || kept(item)) continue;
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
// Chest locks
// ---------------------------------------------------------------------------

// One world property per locked block: "stash:lock:<dimension>:<x>,<y>,<z>" → JSON Lock. Both halves
// of a double chest get one; the second half carries `h` so it isn't counted twice.
const LOCK_PREFIX = "stash:lock:";
const CHEST_ITEMS = new Set(["minecraft:chest", "minecraft:trapped_chest", "minecraft:hopper", ...CONFIG.containerTypes.filter((id) => id.endsWith("copper_chest"))]);

/** @typedef {{ o: string, n: string, s: { i: string, n: string }[], h?: 1 }} Lock owner id and name, shared with, second half */

/** @type {Map<string, Lock> | undefined} key (without the prefix) → lock; this pack is the only writer */
let lockCache;

/** @returns {Map<string, Lock>} */
function locks() {
  if (lockCache) return lockCache;
  /** @type {Map<string, Lock>} */
  const map = new Map();
  try {
    for (const id of world.getDynamicPropertyIds()) {
      if (!id.startsWith(LOCK_PREFIX)) continue;
      try {
        const raw = world.getDynamicProperty(id);
        const lock = typeof raw === "string" ? JSON.parse(raw) : undefined;
        if (lock && typeof lock.o === "string") map.set(id.slice(LOCK_PREFIX.length), { ...lock, s: Array.isArray(lock.s) ? lock.s : [] });
      } catch {
        // a corrupt entry is no lock
      }
    }
  } catch {
    return map; // the world isn't loaded yet: no locks for now, and read them again next time
  }
  return (lockCache = map);
}

/** @param {string} dim @param {import("@minecraft/server").Vector3} p */
const lockKey = (dim, p) => `${dim}:${p.x},${p.y},${p.z}`;

/** @param {string} key @param {Lock | undefined} lock */
function saveLock(key, lock) {
  if (lock) locks().set(key, lock);
  else locks().delete(key);
  world.setDynamicProperty(LOCK_PREFIX + key, lock ? JSON.stringify(lock) : undefined);
}

const locksOn = () => get("locks") === true;
/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

/**
 * The lock on this block or, for a double chest, on its other half.
 * @param {Block} block @param {(b: Block) => string | undefined} [sigOf]
 * @returns {Lock | undefined}
 */
function lockAt(block, sigOf) {
  if (!containerTypes.has(block.typeId)) return undefined;
  const all = locks();
  if (!all.size) return undefined;
  const own = all.get(lockKey(block.dimension.id, block.location));
  if (own) return own;
  if (!block.typeId.endsWith("chest") || (containerOf(block)?.size ?? 0) <= 27) return undefined;
  const other = partnerOf(block, sigOf ?? signatures());
  return other ? all.get(lockKey(block.dimension.id, other.location)) : undefined;
}

/** @param {Player} player @param {Lock} lock */
const allowed = (player, lock) => lock.o === player.id || lock.s.some((s) => s.i === player.id);

/** Locked, and not to this player. @param {Player} player @param {Block} block @param {(b: Block) => string | undefined} [sigOf] */
function lockedOut(player, block, sigOf) {
  if (!locksOn()) return false;
  const lock = lockAt(block, sigOf);
  return !!lock && !allowed(player, lock);
}

/** @param {string} id @returns {number} containers this player has locked (a double chest once) */
const lockCount = (id) => [...locks().values()].filter((l) => l.o === id && !l.h).length;

/** The block next to `block` on `face`. @param {Block} block @param {Direction} face */
function across(block, face) {
  const d = {
    [Direction.Down]: { x: 0, y: -1, z: 0 },
    [Direction.Up]: { x: 0, y: 1, z: 0 },
    [Direction.North]: { x: 0, y: 0, z: -1 },
    [Direction.South]: { x: 0, y: 0, z: 1 },
    [Direction.West]: { x: -1, y: 0, z: 0 },
    [Direction.East]: { x: 1, y: 0, z: 0 },
  }[face];
  return d ? block.offset(d) : undefined;
}

/**
 * Someone else's locked container next to where this item would be placed: a hopper could drain it
 * and a chest could join it into a double chest the placer could open.
 * @param {Player} player @param {Block} block @param {Direction} face @param {ItemStack | undefined} item
 * @returns {Lock | undefined}
 */
function lockNextToPlacement(player, block, face, item) {
  if (!item || !CHEST_ITEMS.has(item.typeId) || !locks().size) return undefined;
  const at = block.isAir || block.isLiquid ? block : across(block, face);
  if (!at) return undefined;
  for (const d of [...SIDES, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }]) {
    const next = at.offset(d);
    const lock = next && lockAt(next);
    if (lock && !allowed(player, lock)) return lock;
  }
  return undefined;
}

/** "Locked by Sam" in the bar above the hotbar, from a before event. @param {Player} player @param {Lock} lock */
function sayLocked(player, lock) {
  system.run(() => {
    if (player.isValid) player.onScreenDisplay.setActionBar(`§cLocked by ${lock.n}`);
  });
}

/**
 * Locks the container at `at` (both halves of a double chest) to the player.
 * @param {Player} player @param {Dimension} dimension @param {import("@minecraft/server").Vector3} at
 */
function lock(player, dimension, at) {
  const block = dimension.getBlock(at);
  if (!block || !containerTypes.has(block.typeId) || !locksOn()) return;
  if (lockAt(block)) {
    player.onScreenDisplay.setActionBar("§7It's already locked");
    return;
  }
  const max = get("maxLocks");
  if (lockCount(player.id) >= max) {
    player.onScreenDisplay.setActionBar(`§cYou already have ${max} locked containers. Unlock one first.`);
    return;
  }
  /** @type {Lock} */
  const l = { o: player.id, n: player.name, s: [] };
  saveLock(lockKey(dimension.id, at), l);
  const other = (containerOf(block)?.size ?? 0) > 27 ? partnerOf(block, signatures()) : undefined;
  if (other) saveLock(lockKey(dimension.id, other.location), { ...l, h: 1 });
  player.onScreenDisplay.setActionBar(`§aLocked: only you can open this ${nameOf(block.typeId).toLowerCase()}`);
  player.playSound("random.door_close", { pitch: 1.4, volume: 0.6 });
}

/**
 * Every key (one, or both halves) holding the lock on this block.
 * @param {Block} block @returns {string[]}
 */
function lockKeys(block) {
  const keys = [lockKey(block.dimension.id, block.location)];
  const other = block.typeId.endsWith("chest") && (containerOf(block)?.size ?? 0) > 27 ? partnerOf(block, signatures()) : undefined;
  if (other) keys.push(lockKey(block.dimension.id, other.location));
  return keys.filter((k) => locks().has(k));
}

/** Changes (or removes, with undefined) the lock on every half. @param {Block} block @param {(l: Lock) => Lock | undefined} change */
function updateLock(block, change) {
  for (const key of lockKeys(block)) {
    const l = locks().get(key);
    if (l) saveLock(key, change(l));
  }
}

/**
 * The owner's lock menu: share with a player online, stop sharing, unlock.
 * @param {Player} player @param {Dimension} dimension @param {import("@minecraft/server").Vector3} at
 */
async function lockMenu(player, dimension, at) {
  const block = dimension.getBlock(at);
  const l = block && lockAt(block);
  if (!block || !l || l.o !== player.id) return;
  const name = nameOf(block.typeId).toLowerCase();
  const others = world.getAllPlayers().filter((p) => p.id !== player.id && !l.s.some((s) => s.i === p.id));

  // Each action gets the block as read again after the form closes.
  /** @type {{ text: string, run: (b: Block) => void }[]} */
  const actions = [];
  if (l.s.length < CONFIG.maxShared) {
    for (const p of others) {
      const { id, name: pName } = p;
      actions.push({
        text: `Share with ${pName}\n§8They can open and sort it too`,
        run: (b) =>
          updateLock(b, (x) => (x.s.length >= CONFIG.maxShared || x.s.some((y) => y.i === id) ? x : { ...x, s: [...x.s, { i: id, n: pName }] })),
      });
    }
  }
  for (const s of l.s) {
    actions.push({ text: `Stop sharing with ${s.n}`, run: (b) => updateLock(b, (x) => ({ ...x, s: x.s.filter((y) => y.i !== s.i) })) });
  }
  actions.push({ text: `Unlock this ${name}\n§8Anyone can open it again`, run: (b) => updateLock(b, () => undefined) });

  const body = [
    `Only you${l.s.length ? ` and ${orList(l.s.map((s) => s.n), "and")}` : ""} can open, sort or break this ${name}.`,
    l.s.length >= CONFIG.maxShared
      ? `§7Shared with the most players allowed (${CONFIG.maxShared}).`
      : others.length
        ? "§7You can share it with players who are online now."
        : "§7To share it, come back when the other player is online.",
  ];
  const form = new ActionFormData().title("§lChest lock").body(body.join("\n"));
  for (const a of actions) form.button(a.text);
  const res = await show(player, form, 3);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  const now = dimension.getBlock(at);
  if (!now || lockAt(now)?.o !== player.id) return; // broken or unlocked meanwhile
  const chosen = actions[res.selection];
  if (!chosen) return;
  chosen.run(now);
  player.onScreenDisplay.setActionBar("§aLock updated");
}

// Breaking: only the owner and the players it's shared with.
world.beforeEvents.playerBreakBlock.subscribe((event) => {
  const { player, block } = event;
  if (!containerTypes.has(block.typeId) || !lockedOut(player, block)) return;
  event.cancel = true;
  const lock = lockAt(block);
  if (lock) sayLocked(player, lock);
});

// A broken or replaced block takes its lock with it. When that was the counted half of a double
// chest, the half left standing (now a single chest, marked `h`) becomes the counted one, so the
// owner's lock count stays right and the leftover can't sit outside the maxLocks limit.
world.afterEvents.playerBreakBlock.subscribe(({ block }) => {
  try {
    const key = lockKey(block.dimension.id, block.location);
    const gone = locks().get(key);
    if (!gone) return;
    saveLock(key, undefined);
    if (gone.h) return;
    for (const d of SIDES) {
      const next = block.offset(d);
      if (!next) continue;
      const k = lockKey(block.dimension.id, next.location);
      const l = locks().get(k);
      if (!l?.h || l.o !== gone.o || (containerOf(next)?.size ?? 0) > 27) continue;
      const { h, ...rest } = l;
      saveLock(k, rest);
    }
  } catch (e) {
    console.warn(`[stash] ${e}`);
  }
});
world.afterEvents.playerPlaceBlock.subscribe(({ block }) => {
  const key = lockKey(block.dimension.id, block.location);
  if (locks().has(key)) saveLock(key, undefined); // a leftover of a container that went some other way
});

// Explosions never break a locked container (the blast still hurts as usual).
world.beforeEvents.explosion.subscribe((event) => {
  if (!locksOn() || !locks().size) return;
  try {
    const dim = event.dimension.id;
    const blocks = event.getImpactedBlocks();
    const kept = blocks.filter((b) => !locks().has(lockKey(dim, b.location)));
    if (kept.length !== blocks.length) event.setImpactedBlocks(kept);
  } catch (e) {
    console.warn(`[stash] ${e}`);
  }
});

// ---------------------------------------------------------------------------
// Sneak-tap menu
// ---------------------------------------------------------------------------

/**
 * Shows a form, retrying while the player still has chat or another screen open.
 * @param {Player} player @param {ActionFormData} form @param {number} attempts one a second
 * @returns {Promise<import("@minecraft/server-ui").ActionFormResponse | undefined>} undefined if it never got shown
 */
async function show(player, form, attempts = 20) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await new Promise((r) => system.runTimeout(() => r(undefined), 20));
  }
  return undefined;
}

/**
 * Sort this container, quick stack, or sort your inventory.
 * @param {Player} player @param {Dimension} dimension @param {import("@minecraft/server").Vector3} at the tapped block
 */
async function openMenu(player, dimension, at) {
  const block = dimension.getBlock(at);
  if (!block || menuOpen.has(player.id)) return;
  const name = nameOf(block.typeId);
  const lockOn = locksOn() && containerTypes.has(block.typeId);
  const l = lockOn ? lockAt(block) : undefined;
  const mine = !!l && l.o === player.id;
  const open = !l || allowed(player, l);
  const container = block.typeId === ENDER_CHEST || !open ? undefined : containerOf(block);
  const inv = player.getComponent("minecraft:inventory")?.container;

  const body = [];
  if (container) body.push(`${name} - ${usedSlots(container, 0, container.size)} of ${container.size} slots used`);
  else if (!open) body.push(`§c${name}: locked by ${l?.n}.§r`);
  else body.push(`§7${name}: add-ons can't see inside, so it can't be sorted.§r`);
  if (l && open) body.push(`§6Locked by ${mine ? "you" : l.n}${l.s.length ? `, shared with ${orList(l.s.map((s) => s.n), "and")}` : ""}§r`);
  if (inv) body.push(`Your inventory - ${usedSlots(inv, MAIN_FIRST, MAIN_END)} of ${MAIN_END - MAIN_FIRST} slots used`);
  body.push("", "§8All the details: /realm:stash_help");

  /** @type {{ text: string, run: (p: Player) => void, free?: boolean }[]} free: not a sort, so no cooldown */
  const actions = [];
  if (container) {
    actions.push({
      text: `Sort this ${name.toLowerCase()}\n§8Merge stacks, order by item`,
      run: (p) => {
        const b = dimension.getBlock(at);
        if (b && containerTypes.has(b.typeId)) sortBlock(p, b);
      },
    });
  }
  if (lockOn && !l) {
    actions.push({ text: `Lock this ${name.toLowerCase()}\n§8Only you can open or break it`, run: (p) => lock(p, dimension, at), free: true });
  } else if (mine) {
    actions.push({ text: `Share or unlock\n§8${l.s.length ? `Shared with ${l.s.length} player${l.s.length === 1 ? "" : "s"}` : "Only you can open it"}`, run: (p) => lockMenu(p, dimension, at).catch((e) => console.warn(`[stash] ${e}`)), free: true });
  } else if (l && isOp(player)) {
    actions.push({
      text: `Remove the lock (operator)\n§8Locked by ${l.n}`,
      run: (p) => {
        const b = dimension.getBlock(at);
        if (b) updateLock(b, () => undefined);
        p.onScreenDisplay.setActionBar(`§aRemoved ${l.n}'s lock`);
      },
      free: true,
    });
  }
  actions.push({
    text: `Quick stack my inventory\n§8Into storage within ${CONFIG.stashRadius} blocks`,
    run: (p) => system.runJob(stash(p)),
  });
  actions.push({
    text: `Sort my inventory\n§8${getFor(player, "sortHotbar") ? "Hotbar included" : "The hotbar stays as it is"}`,
    run: sortInventory,
  });

  const form = new ActionFormData().title("§lQuick Stack & Sort").body(body.join("\n"));
  for (const a of actions) form.button(a.text);

  menuOpen.add(player.id);
  try {
    // Only a short retry: a menu popping up long after the tap would be a surprise.
    const res = await show(player, form, 3);
    if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
    const chosen = actions[res.selection];
    if (chosen?.free) {
      chosen.run(player);
      return;
    }
    if (!ready(player)) {
      player.onScreenDisplay.setActionBar("§7Too fast. Try again in a moment.");
      return;
    }
    actions[res.selection]?.run(player);
  } finally {
    menuOpen.delete(player.id);
  }
}

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { player, block, itemStack, isFirstEvent, blockFace } = event;
  if (event.cancel) return; // another pack (Land Claims) already refused this tap
  if (locksOn()) {
    const near = lockNextToPlacement(player, block, blockFace, itemStack);
    if (near) {
      event.cancel = true; // no hopper under it, no chest joining it
      if (isFirstEvent) sayLocked(player, near);
      return;
    }
  }
  const tap = getFor(player, "sneakTap"); // the realm's choice, or the player's own from /realm:prefs
  const menuTap = player.isSneaking && freeHand(itemStack) && tap === "menu";
  // Someone else's locked container doesn't open; the sneak-tap menu still shows (who locked it, inventory buttons).
  if (!menuTap && containerTypes.has(block.typeId) && lockedOut(player, block)) {
    event.cancel = true;
    const l = lockAt(block);
    if (isFirstEvent && l) sayLocked(player, l);
    return;
  }
  if (!player.isSneaking || !freeHand(itemStack)) return;
  if (tap === "off") return;
  const menu = tap === "menu";
  if (!containerTypes.has(block.typeId) && !(menu && block.typeId === ENDER_CHEST)) return;
  event.cancel = true; // the sneak-tap replaces opening it
  if (!isFirstEvent || (!menu && !ready(player))) return;
  const { x, y, z } = block.location;
  const { dimension } = block;
  system.run(() => {
    if (!player.isValid) return;
    if (menu) {
      openMenu(player, dimension, { x, y, z }).catch((e) => console.warn(`[stash] ${e}`));
      return;
    }
    try {
      const b = dimension.getBlock({ x, y, z });
      if (b && containerTypes.has(b.typeId)) sortBlock(player, b);
    } catch (e) {
      console.warn(`[stash] ${e}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

/** @param {Player} player */
async function showHelp(player) {
  const r = CONFIG.stashRadius;
  const seconds = +(get("cooldownTicks") / 20).toFixed(2);
  const tap = getFor(player, "sneakTap");
  const sortHotbar = getFor(player, "sortHotbar");
  const form = new ActionFormData()
    .title("§lQuick Stack & Sort: help")
    .body("Sort your storage with one tap, and empty your inventory into the chests that already hold each item.");

  if (tap !== "off") {
    form.divider().header("Sneak-tap");
    form.label(
      tap === "menu"
        ? [
            `Sneak and tap a ${storageKinds(player)} with an empty hand, or holding a tool, weapon or armor. It doesn't open; this menu does:`,
            "§e- Sort this chest§r (or barrel, shulker box...): merges partial stacks of the same item, then orders the slots by item, the biggest stack first, empty slots last.",
            "§e- Quick stack my inventory§r: the same as §e/realm:stash§r.",
            "§e- Sort my inventory§r: the same as §e/realm:sort§r.",
            "§7An ender chest's menu has no Sort button: add-ons can't see inside one. Holding anything else (a block, a hopper, honeycomb) keeps its usual sneak-tap use.",
          ].join("\n")
        : `Sneak and tap a ${storageKinds(player)} with an empty hand, or holding a tool, weapon or armor, to sort it: it doesn't open; partial stacks merge, then the slots are ordered by item, the biggest stack first. The bar above the hotbar says §eSorted 31 stacks§r.`
    );
  }

  if (locksOn() && tap === "menu") {
    form.divider().header("Chest locks");
    form.label(
      [
        "§e- Lock this chest§r (or barrel, shulker box...) in the sneak-tap menu: only you can open, sort, break or quick stack into it. Both halves of a double chest are locked.",
        `§e- Share or unlock§r: share it with up to ${CONFIG.maxShared} players who are online, stop sharing, or unlock it.`,
        "Others who tap it see §cLocked by <name>§r. Nobody else can put a hopper under it or a chest next to it, and explosions don't break it.",
        `§7Up to ${get("maxLocks")} locked containers each. Operators can remove any lock from the menu. A hopper that was already under it still empties it.`,
      ].join("\n")
    );
  }

  form.divider().header("/realm:stash");
  form.label(
    [
      "§7Usage:§r §e/realm:stash",
      `Quick stack. Every item in your main inventory goes into a ${orList(kindsOf(CONFIG.stashTypes))} within ${r} blocks that already holds the same item, nearest first. Matching stacks are topped up first, then empty slots.`,
      `The bar says §eStashed 143 items into 3 chests§r, and every container that got something sparkles.`,
      `§7Never takes from your hotbar, armor or offhand. Stays with you: ${orList(
        [
          ...(get("stashGear") ? [] : ["gear (tools, weapons, armor)"]),
          ...(get("stashNamedItems") ? [] : ["items with a custom name"]),
          ...(CONFIG.keepItems.some((id) => id.endsWith("shulker_box")) ? ["shulker boxes"] : []),
          ...(CONFIG.keepItems.some((id) => id.endsWith("bundle")) ? ["bundles"] : []),
          ...(keepItems.has("minecraft:totem_of_undying") ? ["totems"] : []),
          ...(CONFIG.keepItems.some((id) => /map|compass|clock/.test(id)) ? ["what you find your way with (maps, compasses, clocks)"] : []),
        ],
        "and"
      )}. Double chests count once; ${CONFIG.stashTypes.some((id) => id.endsWith("shulker_box")) ? "" : "placed shulker boxes and "}ender chests never receive anything; containers in unloaded chunks are never touched.`,
    ].join("\n")
  );

  form.divider().header("/realm:sort");
  form.label(
    [
      "§7Usage:§r §e/realm:sort",
      `Sorts your main inventory${sortHotbar ? " and your hotbar" : " (slots 9 to 35)"}: partial stacks merge, then everything is ordered by item, the biggest stack first, empty slots last.`,
      sortHotbar ? "§7Your hotbar is sorted too." : "§7Your hotbar stays exactly as it is. To sort it too, turn that on in /realm:prefs.",
    ].join("\n")
  );

  form.divider().header("/realm:stash_help");
  form.label("§7Usage:§r §e/realm:stash_help\nShows this page.");

  form.divider().header("Good to know");
  form.label(
    [
      `- One sort or stash per ${seconds} s per player.`,
      "- Enchanted items and items with a custom name or lore are never merged, only moved, so they stay exactly as they were: gear, written books, filled maps, banners, shulker boxes with their contents.",
      "- Another player having the chest open is fine.",
    ].join("\n")
  );

  form.button("Close");
  await show(player, form);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {import("@minecraft/server").CustomCommandOrigin} origin */
function originPlayer(origin) {
  const player = origin.initiator ?? origin.sourceEntity;
  return player instanceof Player ? player : undefined;
}

/**
 * @param {import("@minecraft/server").CustomCommandOrigin} origin
 * @param {(player: Player) => void} run
 */
function playerCommand(origin, run) {
  const player = originPlayer(origin);
  if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
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

// The descriptions are what /help and autocomplete show.
system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:stash",
      description: `Quick stack: moves your main inventory into storage within ${CONFIG.stashRadius} blocks that already holds the same items. More: /realm:stash_help`,
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => playerCommand(origin, (player) => system.runJob(stash(player)))
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:sort",
      description: "Sorts your inventory: merges stacks, then orders by item. The hotbar too if that's on in /realm:prefs. More: /realm:stash_help",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => playerCommand(origin, sortInventory)
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:stash_help",
      description: "How Quick Stack & Sort works: the sneak-tap menu, /realm:stash and /realm:sort, with usage",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = originPlayer(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => showHelp(player).catch((e) => console.warn(`[stash] ${e}`)));
      return { status: CustomCommandStatus.Success };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "stash_bp");
  },
  { namespaces: ["realm"] }
);
