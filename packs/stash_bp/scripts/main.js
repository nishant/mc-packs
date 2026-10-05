import {
  Block,
  BlockTypes,
  BlockVolume,
  CommandPermissionLevel,
  Container,
  CustomCommandStatus,
  Dimension,
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
  const container = block.typeId === ENDER_CHEST ? undefined : containerOf(block);
  const inv = player.getComponent("minecraft:inventory")?.container;

  const body = [];
  if (container) body.push(`${name} · ${usedSlots(container, 0, container.size)} of ${container.size} slots used`);
  else body.push(`§7${name}: add-ons can't see inside, so it can't be sorted.§r`);
  if (inv) body.push(`Your inventory · ${usedSlots(inv, MAIN_FIRST, MAIN_END)} of ${MAIN_END - MAIN_FIRST} slots used`);
  body.push("", "§8All the details: /realm:stash_help");

  /** @type {{ text: string, run: (p: Player) => void }[]} */
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
  const { player, block, itemStack, isFirstEvent } = event;
  if (!player.isSneaking || !freeHand(itemStack)) return;
  const tap = getFor(player, "sneakTap"); // the realm's choice, or the player's own from /realm:prefs
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
            "§e• Sort this chest§r (or barrel, shulker box…): merges partial stacks of the same item, then orders the slots by item, the biggest stack first, empty slots last.",
            "§e• Quick stack my inventory§r: the same as §e/realm:stash§r.",
            "§e• Sort my inventory§r: the same as §e/realm:sort§r.",
            "§7An ender chest's menu has no Sort button: add-ons can't see inside one. Holding anything else (a block, a hopper, honeycomb) keeps its usual sneak-tap use.",
          ].join("\n")
        : `Sneak and tap a ${storageKinds(player)} with an empty hand, or holding a tool, weapon or armor, to sort it: it doesn't open; partial stacks merge, then the slots are ordered by item, the biggest stack first. The bar above the hotbar says §eSorted 31 stacks§r.`
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
      `Sorts your main inventory${sortHotbar ? " and your hotbar" : " (slots 9–35)"}: partial stacks merge, then everything is ordered by item, the biggest stack first, empty slots last.`,
      sortHotbar ? "§7Your hotbar is sorted too." : "§7Your hotbar stays exactly as it is. To sort it too, turn that on in /realm:prefs.",
    ].join("\n")
  );

  form.divider().header("/realm:stash_help");
  form.label("§7Usage:§r §e/realm:stash_help\nShows this page.");

  form.divider().header("Good to know");
  form.label(
    [
      `• One sort or stash per ${seconds} s per player.`,
      "• Enchanted items and items with a custom name or lore are never merged, only moved, so they stay exactly as they were: gear, written books, filled maps, banners, shulker boxes with their contents.",
      "• Another player having the chest open is fine.",
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
