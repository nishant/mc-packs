// Expansive Inventory: extra pages of the main inventory (slots 9-35), switched with three buttons that
// sit inside the inventory grid, with the menu from /realm:inv, and with items auto-stored when a page fills.
//
// The active page lives in the player's real inventory. Every other page is saved in the player's dynamic
// properties (`stash:page:<n>`, split into `stash:page:<n>:<k>` when it is large) as one JSON record per
// stack. Nothing is ever cleared before its copy is saved and read back, and an item that can't be copied
// exactly (shulker boxes, bundles, potions, banners, maps, fireworks, trimmed armor...) isn't copied at all:
// it stays in its slot and travels with the player from page to page, like the hotbar does.
import { CommandPermissionLevel, EnchantmentType, ItemLockMode, ItemStack, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { get, getFor, setFor } from "./settings.js";

export const BTN_PREV = "custom:inv_prev";
export const BTN_MENU = "custom:inv_menu";
export const BTN_NEXT = "custom:inv_next";

/** The three buttons, by the main-inventory slot they live in (9 = top left, 13 = top middle, 17 = top right). */
const BUTTONS = /** @type {const} */ ([
  { kind: "prev", id: BTN_PREV, slot: 9 },
  { kind: "menu", id: BTN_MENU, slot: 13 },
  { kind: "next", id: BTN_NEXT, slot: 17 },
]);
const BUTTON_IDS = new Set([BTN_PREV, BTN_MENU, BTN_NEXT]);
export const BUTTON_SLOTS = [9, 13, 17];
/** The 24 slots of a page: slots 9-35 without the buttons. */
export const STORAGE_SLOTS = [10, 11, 12, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];
const HOTBAR = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const PAGE_SIZE = STORAGE_SLOTS.length;

const MAX_PAGES = 25;
const PAGE_PROP = "stash:page:";
const CUR_PROP = "stash:cur";
const OP_PROP = "stash:op_pages";
/** A saved page is split above this many UTF-8 bytes (a dynamic property holds up to 32 KB). */
const PROP_LIMIT = 28000;
const CHUNK_CHARS = 9000;
const CLICK_DEBOUNCE = 6;
const SCAN_ROWS = 100;

/**
 * One saved stack: `s` is its slot on the page, the rest rebuilds the ItemStack.
 * @typedef {{ s: number, id: string, n: number, name?: string, lore?: string[], keep?: 1, lock?: string, dmg?: number,
 *   ench?: [string, number][], color?: { red: number, green: number, blue: number }, props?: Record<string, any>,
 *   place?: string[], destroy?: string[] }} Rec
 */
/** @typedef {{ bar: (player: Player, text: string) => void, sort: (player: Player) => void, stash: (player: Player) => void }} Hooks */

/** @type {Hooks} */
let hooks = { bar: (p, t) => p.onScreenDisplay.setActionBar(t), sort: () => {}, stash: () => {} };

/** Connects this module to main.js: the action bar line, "Sort this page" and "Quick stack". @param {Hooks} h */
export function initPages(h) {
  hooks = h;
}

/** @param {ItemStack | undefined} item @returns {boolean} */
export const isButton = (item) => !!item && BUTTON_IDS.has(item.typeId);

/** @param {Player} player */
const invOf = (player) => player.getComponent("minecraft:inventory")?.container;

/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

/** The button slots that currently hold their own button, so sorting and stashing leave them alone. @param {import("@minecraft/server").Container} inv @returns {Set<number>} */
export function buttonSlots(inv) {
  /** @type {Set<number>} */
  const held = new Set();
  for (const b of BUTTONS) if (inv.getItem(b.slot)?.typeId === b.id) held.add(b.slot);
  return held;
}

// ---------------------------------------------------------------------------
// Page counts
// ---------------------------------------------------------------------------

/** How many pages this player has: an operator's own count (/realm:inv_pages), else the realm's `pages`. @param {Player} player */
export function totalPages(player) {
  if (isOp(player)) {
    try {
      const own = player.getDynamicProperty(OP_PROP);
      if (typeof own === "number" && Number.isInteger(own) && own >= 1) return Math.min(own, MAX_PAGES);
    } catch {
      // unreadable: the realm's count
    }
  }
  const pages = Number(get("pages"));
  return Number.isInteger(pages) ? Math.max(1, Math.min(MAX_PAGES, pages)) : 1;
}

/** @param {Player} player */
export function curPage(player) {
  try {
    const v = player.getDynamicProperty(CUR_PROP);
    if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_PAGES) return v;
  } catch {
    // unreadable: page 1
  }
  return 1;
}

/** @param {number} cur @param {number} total */
const prevOf = (cur, total) => (cur <= 1 ? total : cur - 1);
/** @param {number} cur @param {number} total */
const nextOf = (cur, total) => (cur >= total ? 1 : cur + 1);

/** @param {Player} player */
const buttonsWanted = (player) => !buttonsMissing && totalPages(player) > 1 && getFor(player, "invButtons") !== false;

// ---------------------------------------------------------------------------
// Copying a stack to JSON and back
// ---------------------------------------------------------------------------

// Items whose data the API can't read all of, so a copy would lose something. They are never copied.
const OPAQUE_ID =
  /shulker_box|bundle|banner|shield|firework|filled_map|written_book|writable_book|enchanted_book|potion|tipped_arrow|ominous_bottle|goat_horn|player_head|suspicious_stew|axolotl_bucket|cod_bucket|salmon_bucket|pufferfish_bucket|tropical_fish_bucket|tadpole_bucket|crossbow|decorated_pot|bee_nest|beehive|lodestone_compass|leather_|armor_stand|command_block|structure_block|jigsaw/;

/** True when a copy of this item could lose data, so it must stay where it is. @param {ItemStack} item */
export function isOpaque(item) {
  if (OPAQUE_ID.test(item.typeId)) return true;
  try {
    if (item.hasTag("minecraft:trimmable_armors") || item.getComponent("minecraft:potion")) return true;
  } catch {
    return true;
  }
  return false;
}

/** @param {ItemStack} item @returns {Omit<Rec, "s">} */
function serializeStack(item) {
  /** @type {Omit<Rec, "s">} */
  const rec = { id: item.typeId, n: item.amount };
  if (item.nameTag !== undefined) rec.name = item.nameTag;
  const lore = item.getLore();
  if (lore.length) rec.lore = lore;
  if (item.keepOnDeath) rec.keep = 1;
  if (item.lockMode !== ItemLockMode.none) rec.lock = item.lockMode;
  const place = item.getCanPlaceOn();
  if (place.length) rec.place = place;
  const destroy = item.getCanDestroy();
  if (destroy.length) rec.destroy = destroy;
  const dmg = item.getComponent("minecraft:durability")?.damage;
  if (dmg) rec.dmg = dmg;
  const ench = item.getComponent("minecraft:enchantable")?.getEnchantments();
  if (ench?.length) rec.ench = ench.map((e) => /** @type {[string, number]} */ ([e.type.id, e.level])).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const color = item.getComponent("minecraft:dyeable")?.color;
  if (color) rec.color = { red: color.red, green: color.green, blue: color.blue };
  const ids = item.getDynamicPropertyIds().sort();
  if (ids.length) rec.props = Object.fromEntries(ids.map((k) => [k, item.getDynamicProperty(k)]));
  return rec;
}

/** @param {Omit<Rec, "s">} rec @param {number} [amount] @returns {ItemStack | undefined} undefined when it can't be rebuilt exactly */
function deserializeStack(rec, amount = rec.n) {
  try {
    const item = new ItemStack(rec.id, amount);
    if (rec.name !== undefined) item.nameTag = rec.name;
    if (rec.lore?.length) item.setLore(rec.lore);
    if (rec.keep) item.keepOnDeath = true;
    if (rec.lock && rec.lock !== ItemLockMode.none) item.lockMode = /** @type {ItemLockMode} */ (rec.lock);
    if (rec.place?.length) item.setCanPlaceOn(rec.place);
    if (rec.destroy?.length) item.setCanDestroy(rec.destroy);
    if (rec.dmg) {
      const d = item.getComponent("minecraft:durability");
      if (!d) return undefined;
      d.damage = rec.dmg;
    }
    if (rec.ench?.length) {
      const e = item.getComponent("minecraft:enchantable");
      if (!e) return undefined;
      e.addEnchantments(rec.ench.map(([id, level]) => ({ type: new EnchantmentType(id), level })));
    }
    if (rec.color) {
      const d = item.getComponent("minecraft:dyeable");
      if (!d) return undefined;
      d.color = rec.color;
    }
    if (rec.props) for (const [k, v] of Object.entries(rec.props)) item.setDynamicProperty(k, v);
    return item;
  } catch {
    return undefined;
  }
}

/**
 * The copy of this item, but only when rebuilding it gives back exactly the same record.
 * @param {ItemStack} item @returns {Omit<Rec, "s"> | undefined}
 */
function toRecord(item) {
  try {
    if (isOpaque(item)) return undefined;
    const rec = serializeStack(item);
    const text = JSON.stringify(rec);
    if (text.length > 6000) return undefined;
    const back = deserializeStack(rec);
    return back && back.typeId === item.typeId && JSON.stringify(serializeStack(back)) === text ? rec : undefined;
  } catch {
    return undefined;
  }
}

/** @type {Map<string, number>} */
const maxCache = new Map();
/** @param {string} id */
function maxOf(id) {
  let m = maxCache.get(id);
  if (m === undefined) {
    try {
      m = new ItemStack(id, 1).maxAmount;
    } catch {
      m = 1;
    }
    maxCache.set(id, m);
  }
  return m;
}

/** What makes two records the same item, whatever the amount and slot. @param {Omit<Rec, "s">} r */
const sigOf = (r) => JSON.stringify([r.id, r.name, r.lore, r.keep, r.lock, r.dmg, r.ench, r.color, r.props, r.place, r.destroy]);

/** "diamond_pickaxe" → "Diamond pickaxe". @param {string} typeId */
function pretty(typeId) {
  const s = typeId.replace(/^[^:]*:/, "").replaceAll("_", " ");
  return s[0].toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Saved pages
// ---------------------------------------------------------------------------

/** @param {string} s */
function byteLength(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? 4 : c >= 0xdc00 && c < 0xe000 ? 0 : 3;
  }
  return n;
}

/**
 * The stacks saved for a page, or undefined when the saved data can't be read (then nothing is written to it).
 * @param {Player} player @param {number} page @returns {Rec[] | undefined}
 */
function readPage(player, page) {
  try {
    const key = PAGE_PROP + page;
    const raw = player.getDynamicProperty(key);
    if (raw === undefined) return [];
    if (typeof raw !== "string") return undefined;
    let json = raw;
    if (raw.startsWith("#")) {
      const count = Number.parseInt(raw.slice(1), 10);
      if (!Number.isInteger(count) || count < 1 || count > 64) return undefined;
      const parts = [];
      for (let i = 0; i < count; i++) {
        const part = player.getDynamicProperty(`${key}:${i}`);
        if (typeof part !== "string") return undefined;
        parts.push(part);
      }
      json = parts.join("");
    }
    const list = JSON.parse(json);
    if (!Array.isArray(list)) return undefined;
    return list.filter((e) => e && typeof e.id === "string" && Number.isInteger(e.n) && e.n > 0 && Number.isInteger(e.s));
  } catch {
    return undefined;
  }
}

/** Saves a page (nothing left removes it). @param {Player} player @param {number} page @param {Rec[]} entries @returns {boolean} */
function writePage(player, page, entries) {
  try {
    const key = PAGE_PROP + page;
    const old = player.getDynamicProperty(key);
    const oldChunks = typeof old === "string" && old.startsWith("#") ? Number.parseInt(old.slice(1), 10) || 0 : 0;
    let chunks = 0;
    if (!entries.length) player.setDynamicProperty(key, undefined);
    else {
      const json = JSON.stringify(entries);
      if (byteLength(json) <= PROP_LIMIT) player.setDynamicProperty(key, json);
      else {
        chunks = Math.ceil(json.length / CHUNK_CHARS);
        for (let i = 0; i < chunks; i++) player.setDynamicProperty(`${key}:${i}`, json.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS));
        player.setDynamicProperty(key, `#${chunks}`);
      }
    }
    for (let i = chunks; i < oldChunks; i++) player.setDynamicProperty(`${key}:${i}`, undefined);
    return true;
  } catch (e) {
    console.warn(`[stash] saving page ${page}: ${e}`);
    return false;
  }
}

/**
 * Adds a stack to a page's records. "merge" only tops up matching stacks; "fill" also takes an empty slot.
 * @param {Rec[]} entries @param {Omit<Rec, "s">} rec @param {"merge" | "fill"} mode @returns {number} how many were added
 */
function addToEntries(entries, rec, mode) {
  let left = rec.n;
  const max = maxOf(rec.id);
  if (max > 1) {
    const sig = sigOf(rec);
    for (const e of entries) {
      if (!left) break;
      if (e.n >= max || e.id !== rec.id || sigOf(e) !== sig) continue;
      const take = Math.min(max - e.n, left);
      e.n += take;
      left -= take;
    }
  }
  if (left && mode === "fill") {
    const used = new Set(entries.map((e) => e.s));
    const free = STORAGE_SLOTS.find((s) => !used.has(s));
    if (free !== undefined) {
      entries.push({ ...rec, n: left, s: free });
      left = 0;
    }
  }
  return rec.n - left;
}

/**
 * Puts a stack onto saved pages: matching stacks first, then empty slots. Returns what didn't fit.
 * @param {Player} player @param {ItemStack} item @param {number[]} pages
 * @returns {{ rem: ItemStack | undefined, moved: Map<number, number> }}
 */
function storeOnPages(player, item, pages) {
  /** @type {Map<number, number>} */
  const moved = new Map();
  const rec = toRecord(item);
  if (!rec || !pages.length) return { rem: item, moved };
  /** @type {Map<number, Rec[] | undefined>} */
  const loaded = new Map();
  /** @type {Set<number>} */
  const dirty = new Set();
  let left = item.amount;
  for (const mode of /** @type {const} */ (["merge", "fill"])) {
    for (const p of pages) {
      if (!left) break;
      if (!loaded.has(p)) loaded.set(p, readPage(player, p));
      const entries = loaded.get(p);
      if (!entries) continue;
      const n = addToEntries(entries, { ...rec, n: left }, mode);
      if (!n) continue;
      left -= n;
      dirty.add(p);
      moved.set(p, (moved.get(p) ?? 0) + n);
    }
  }
  for (const p of dirty) {
    if (writePage(player, p, /** @type {Rec[]} */ (loaded.get(p)))) continue;
    // not saved: hand those back instead of losing them
    left += moved.get(p) ?? 0;
    moved.delete(p);
  }
  if (!left) return { rem: undefined, moved };
  const rem = item.clone();
  rem.amount = left;
  return { rem, moved };
}

// ---------------------------------------------------------------------------
// Placing items in the live inventory
// ---------------------------------------------------------------------------

/**
 * Puts a stack into some slots of a container: matching stacks first, then an empty slot. Returns what didn't fit.
 * @param {import("@minecraft/server").Container} inv @param {ItemStack} item @param {number[]} slots @returns {ItemStack | undefined}
 */
function placeIn(inv, item, slots) {
  let left = item.amount;
  const max = item.maxAmount;
  if (max > 1) {
    for (const s of slots) {
      const have = inv.getItem(s);
      if (!have || have.amount >= max || !have.isStackableWith(item)) continue;
      const take = Math.min(max - have.amount, left);
      inv.getSlot(s).amount = have.amount + take;
      left -= take;
      if (!left) return undefined;
    }
  }
  for (const s of slots) {
    if (inv.getItem(s)) continue;
    const put = item.clone();
    put.amount = left;
    inv.setItem(s, put);
    return undefined;
  }
  const rem = item.clone();
  rem.amount = left;
  return rem;
}

/**
 * Finds a home for an item that mustn't stay where it is: this page, then the hotbar, then the other
 * pages, and at the player's feet when everything is full. Nothing is ever destroyed.
 * @param {Player} player @param {import("@minecraft/server").Container} inv @param {ItemStack} item @param {number} [limit] pages the player has
 */
export function rescueItem(player, inv, item, limit = totalPages(player)) {
  // Without the buttons, their three slots are free too.
  let rem = placeIn(inv, item, buttonsWanted(player) ? STORAGE_SLOTS : [...STORAGE_SLOTS, ...BUTTON_SLOTS].sort((a, b) => a - b));
  if (rem) rem = placeIn(inv, rem, HOTBAR);
  if (rem) {
    const cur = curPage(player);
    const others = [];
    for (let p = 1; p <= limit; p++) if (p !== cur) others.push(p);
    rem = storeOnPages(player, rem, others).rem;
  }
  if (rem) player.dimension.spawnItem(rem, player.location);
}

/** @param {import("@minecraft/server").Container} inv */
function usedOnPage(inv) {
  let n = 0;
  for (const s of STORAGE_SLOTS) if (inv.getItem(s)) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Switching pages
// ---------------------------------------------------------------------------

/** @type {Set<string>} */
const switching = new Set();
/** @type {Map<string, { page: number, keys: Map<string, number> }>} what each player's page held at the last auto-store look */
const snapshots = new Map();

/**
 * Saves the active page and shows another. The page being left is saved and read back before anything
 * is cleared; whatever of the new page doesn't fit (a carried item is in its slot) stays saved on that page.
 * @param {Player} player @param {number} target @returns {boolean} true if the player is on that page now
 */
export function switchPage(player, target) {
  const id = player.id;
  const inv = invOf(player);
  if (!inv || switching.has(id)) return false;
  const total = totalPages(player);
  const cur = curPage(player);
  if (!Number.isInteger(target) || target < 1 || target > MAX_PAGES || (target > total && cur <= total)) return false;
  if (target === cur) {
    refreshButtons(player);
    return true;
  }
  switching.add(id);
  try {
    const incoming = readPage(player, target);
    const stayed = readPage(player, cur);
    if (!incoming || !stayed) {
      hooks.bar(player, `§cPage #${incoming ? cur : target} can't be read, so it wasn't opened`);
      return false;
    }

    // Leaving: copy every stack that copies exactly; the rest stay in their slots.
    /** @type {Rec[]} */
    const leaving = [];
    /** @type {number[]} */
    const copied = [];
    for (const s of STORAGE_SLOTS) {
      const item = inv.getItem(s);
      if (!item || isButton(item)) continue;
      const rec = toRecord(item);
      if (!rec) continue;
      leaving.push({ s, ...rec });
      copied.push(s);
    }
    const saved = [...leaving, ...stayed];
    if (!writePage(player, cur, saved) || readPage(player, cur)?.length !== saved.length) {
      hooks.bar(player, "§cCouldn't save this page, so it wasn't switched");
      return false;
    }
    for (const s of copied) inv.setItem(s, undefined);
    player.setDynamicProperty(CUR_PROP, target === 1 ? undefined : target);

    // Arriving: each stack to its slot, else the first free one; what doesn't fit stays saved on that page.
    /** @type {Rec[]} */
    const unplaced = [];
    for (const e of incoming) {
      const item = deserializeStack(e);
      if (!item) {
        unplaced.push(e);
        continue;
      }
      const slot = STORAGE_SLOTS.includes(e.s) && !inv.getItem(e.s) ? e.s : STORAGE_SLOTS.find((s) => !inv.getItem(s));
      if (slot === undefined) unplaced.push(e);
      else inv.setItem(slot, item);
    }
    if (!writePage(player, target, unplaced)) console.warn(`[stash] page ${target} kept its saved copy`);
    snapshots.delete(id);
    refreshButtons(player);
    const stuck = unplaced.length;
    hooks.bar(player, `§8[§bPage #${target}/${total}§8] §7${usedOnPage(inv)}/${PAGE_SIZE} slots used${stuck ? ` §e(${stuck} more stack${stuck === 1 ? "" : "s"} wait here for room)` : ""}`);
    player.playSound("random.click", { pitch: 1.2, volume: 0.6 });
    return true;
  } catch (e) {
    console.warn(`[stash] switching page: ${e}`);
    return false;
  } finally {
    switching.delete(id);
  }
}

/**
 * Makes the saved pages fit the player's page count: leaves a page that no longer exists and moves
 * everything saved on the removed pages into the pages that are left (or the hotbar, or the floor).
 * @param {Player} player
 */
export function enforcePageCount(player) {
  const inv = invOf(player);
  if (!inv) return;
  const total = totalPages(player);
  if (curPage(player) > total && !switchPage(player, 1)) return;
  let moved = 0;
  for (let p = total + 1; p <= MAX_PAGES; p++) {
    const entries = readPage(player, p);
    if (!entries?.length) continue;
    /** @type {Rec[]} */
    const left = [];
    for (const e of entries) {
      const item = deserializeStack(e);
      if (!item) {
        left.push(e);
        continue;
      }
      rescueItem(player, inv, item, total);
      moved += e.n;
    }
    writePage(player, p, left);
  }
  if (moved) hooks.bar(player, `§7Moved ${moved} item${moved === 1 ? "" : "s"} from removed inventory pages into your inventory`);
}

// ---------------------------------------------------------------------------
// The buttons in the inventory grid
// ---------------------------------------------------------------------------

let buttonsMissing = false;

/** @param {"prev" | "menu" | "next"} kind @param {number} cur @param {number} total @returns {ItemStack | undefined} */
function makeButton(kind, cur, total) {
  const prev = prevOf(cur, total);
  const next = nextOf(cur, total);
  try {
    const item = new ItemStack(kind === "prev" ? BTN_PREV : kind === "menu" ? BTN_MENU : BTN_NEXT, 1);
    if (kind === "prev") {
      item.nameTag = `§r§8[§b<§8] §fPage ${prev}/${total} §7(Prev)`;
      item.setLore(["§7Click in inventory to switch", `§7to Page #${prev}`, "§8Expansive Inventory"]);
    } else if (kind === "next") {
      item.nameTag = `§r§8[§b>§8] §fPage ${next}/${total} §7(Next)`;
      item.setLore(["§7Click in inventory to switch", `§7to Page #${next}`, "§8Expansive Inventory"]);
    } else {
      item.nameTag = `§r§8[§bPage ${cur}/${total}§8] §fInventory Menu`;
      item.setLore([`§7Viewing Page #${cur} of ${total}`, "§7Click (then close inventory) or run", "§b/realm:inv §7for all pages & item scan", "§8Expansive Inventory"]);
    }
    item.keepOnDeath = true;
    return item;
  } catch (e) {
    if (!buttonsMissing) console.warn(`[stash] the page button items aren't installed (${e}): add stash_bp's items and the build_rp textures`);
    buttonsMissing = true;
    return undefined;
  }
}

/**
 * Puts the three buttons in their slots with this page's numbers. A real item in a button slot is moved to
 * safety first, never overwritten.
 * @param {Player} player
 */
function refreshButtons(player) {
  const inv = invOf(player);
  if (!inv) return;
  const cur = curPage(player);
  const total = totalPages(player);
  for (const b of BUTTONS) {
    const want = makeButton(b.kind, cur, total);
    if (!want) return;
    const have = inv.getItem(b.slot);
    if (have?.typeId === b.id && have.nameTag === want.nameTag) continue;
    if (have) {
      inv.setItem(b.slot, undefined);
      if (!isButton(have)) rescueItem(player, inv, have);
    }
    inv.setItem(b.slot, want);
  }
}

/** Takes the buttons out of the grid, wherever they ended up. @param {Player} player */
function removeButtons(player) {
  const inv = invOf(player);
  if (!inv) return;
  for (const s of [...HOTBAR, ...BUTTON_SLOTS, ...STORAGE_SLOTS]) if (isButton(inv.getItem(s))) inv.setItem(s, undefined);
}

/** Clears buttons the player moved or shift-clicked out of their slots. @param {import("@minecraft/server").Container} inv */
function sweepStrays(inv) {
  for (const s of [...HOTBAR, ...STORAGE_SLOTS]) if (isButton(inv.getItem(s))) inv.setItem(s, undefined);
}

/** Removes buttons that were dropped on the ground near a player. @param {Player} player */
function removeDropped(player) {
  try {
    for (const e of player.dimension.getEntities({ type: "minecraft:item", location: player.location, maxDistance: 6 })) {
      if (isButton(e.getComponent("minecraft:item")?.itemStack)) e.remove();
    }
  } catch {
    // the area isn't loaded
  }
}

/** @type {Map<string, number>} player id → tick of the last button action */
const lastClick = new Map();
/** @type {Map<string, boolean>} player id → whether the buttons are in place (false: taken out) */
const buttonState = new Map();
/** @type {Set<string>} */
const dead = new Set();

/**
 * A button was clicked (it left its slot): save anything real that took its place, put the buttons back,
 * and do what the button says, at most once per click.
 * @param {Player} player @param {readonly ("prev" | "menu" | "next")[]} kinds
 */
function clicked(player, kinds) {
  const inv = invOf(player);
  if (!inv) return;
  for (const b of BUTTONS) {
    const have = inv.getItem(b.slot);
    if (!have || have.typeId === b.id) continue;
    inv.setItem(b.slot, undefined);
    if (!isButton(have)) rescueItem(player, inv, have);
  }
  sweepStrays(inv);
  removeDropped(player);
  const now = system.currentTick;
  const kind = kinds.includes("prev") ? "prev" : kinds.includes("next") ? "next" : kinds[0];
  // All three gone at once is a wipe (/clear, a respawn), not a click.
  if (!kind || kinds.length === BUTTONS.length || now - (lastClick.get(player.id) ?? -1000) < CLICK_DEBOUNCE) {
    refreshButtons(player);
    return;
  }
  lastClick.set(player.id, now);
  const cur = curPage(player);
  const total = totalPages(player);
  if (kind === "prev") switchPage(player, prevOf(cur, total));
  else if (kind === "next") switchPage(player, nextOf(cur, total));
  else {
    refreshButtons(player);
    hooks.bar(player, "§bClose inventory to open the Inventory Pages menu");
    openInvMenu(player).catch((e) => console.warn(`[stash] ${e}`));
  }
}

/** Looks at the three slots: a missing button is a click. @param {Player} player */
function pollButtons(player) {
  const inv = invOf(player);
  if (!inv) return;
  const missing = BUTTONS.filter((b) => inv.getItem(b.slot)?.typeId !== b.id).map((b) => b.kind);
  if (missing.length) clicked(player, missing);
}

// A button dropped from the inventory screen is removed at once, and counts as the click.
world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  try {
    if (entity.typeId !== "minecraft:item") return;
    const item = entity.getComponent("minecraft:item")?.itemStack;
    if (!isButton(item)) return;
    const at = entity.location;
    const dim = entity.dimension;
    entity.remove();
    system.run(() => {
      for (const p of world.getAllPlayers()) {
        if (p.dimension.id !== dim.id || buttonState.get(p.id) !== true) continue;
        const d = { x: p.location.x - at.x, y: p.location.y - at.y, z: p.location.z - at.z };
        if (d.x * d.x + d.y * d.y + d.z * d.z <= 36) pollButtons(p);
      }
    });
  } catch (e) {
    console.warn(`[stash] ${e}`);
  }
});

// A button that got into the hand (right-click) goes back to its slot and does its action.
world.beforeEvents.itemUse.subscribe((event) => {
  const item = event.itemStack;
  if (!isButton(item)) return;
  event.cancel = true;
  const player = event.source;
  const type = item.typeId;
  system.run(() => {
    try {
      if (!player.isValid || dead.has(player.id)) return;
      const inv = invOf(player);
      if (!inv) return;
      if (!buttonsWanted(player)) {
        removeButtons(player);
        return;
      }
      for (const s of [...HOTBAR, ...STORAGE_SLOTS]) if (isButton(inv.getItem(s))) inv.setItem(s, undefined);
      clicked(player, [type === BTN_PREV ? "prev" : type === BTN_NEXT ? "next" : "menu"]);
    } catch (e) {
      console.warn(`[stash] ${e}`);
    }
  });
});

world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (deadEntity.typeId !== "minecraft:player") return;
  dead.add(deadEntity.id);
  buttonState.delete(deadEntity.id);
  snapshots.delete(deadEntity.id);
});
world.afterEvents.playerSpawn.subscribe(({ player }) => {
  dead.delete(player.id);
  buttonState.delete(player.id);
  snapshots.delete(player.id);
});
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  for (const m of [lastClick, buttonState, snapshots, lastTotal]) m.delete(playerId);
  dead.delete(playerId);
  menuOpen.delete(playerId);
  switching.delete(playerId);
});

// ---------------------------------------------------------------------------
// Ticking: buttons every 2 ticks, auto-store every 10
// ---------------------------------------------------------------------------

/** @type {Map<string, number>} player id → page count seen last */
const lastTotal = new Map();

/** What a stack counts as when looking for new pickups: its item and name, not its amount. @param {ItemStack} item */
const keyOf = (item) => `${item.typeId}|${item.nameTag ?? ""}|${item.getLore().join("/")}`;

/** How many empty slots this page has, and how many stacks of each kind. @param {import("@minecraft/server").Container} inv */
function lookAtPage(inv) {
  /** @type {Map<string, number>} */
  const keys = new Map();
  let empty = 0;
  for (const s of STORAGE_SLOTS) {
    const item = inv.getItem(s);
    if (!item) empty++;
    else if (!isButton(item)) keys.set(keyOf(item), (keys.get(keyOf(item)) ?? 0) + 1);
  }
  return { empty, keys };
}

/** Free slots across every page the player has. @param {Player} player @param {import("@minecraft/server").Container} inv */
function freeEverywhere(player, inv) {
  const total = totalPages(player);
  const cur = curPage(player);
  let free = PAGE_SIZE - usedOnPage(inv);
  for (let p = 1; p <= total; p++) if (p !== cur) free += PAGE_SIZE - Math.min(PAGE_SIZE, readPage(player, p)?.length ?? PAGE_SIZE);
  return free;
}

/**
 * When the page is full or down to one free slot, the newest stack moves to another page, so the player never
 * stops picking things up. A stack is "new" when the page holds more stacks of its kind than at the last look.
 * @param {Player} player
 */
function autoStore(player) {
  const inv = invOf(player);
  if (!inv || switching.has(player.id)) return;
  const total = totalPages(player);
  const cur = curPage(player);
  const now = lookAtPage(inv);
  const before = snapshots.get(player.id);
  snapshots.set(player.id, { page: cur, keys: now.keys });
  if (!before || before.page !== cur || now.empty > 1) return;

  /** @type {number[]} */
  const others = [];
  for (let p = 1; p <= total; p++) if (p !== cur) others.push(p);
  /** @type {Map<string, number>} */
  const extra = new Map();
  for (const [k, n] of now.keys) if (n > (before.keys.get(k) ?? 0)) extra.set(k, n - (before.keys.get(k) ?? 0));
  if (!extra.size) return;

  let movedCount = 0;
  let name = "";
  /** @type {Map<number, number>} */
  const perPage = new Map();
  let empty = now.empty;
  for (let i = STORAGE_SLOTS.length - 1; i >= 0 && extra.size && empty < 2; i--) {
    const s = STORAGE_SLOTS[i];
    const item = inv.getItem(s);
    if (!item || isButton(item)) continue;
    const key = keyOf(item);
    const want = extra.get(key);
    if (!want) continue;
    extra.set(key, want - 1);
    if (want - 1 <= 0) extra.delete(key);
    const { rem, moved } = storeOnPages(player, item, others);
    let n = 0;
    for (const [p, c] of moved) {
      n += c;
      perPage.set(p, (perPage.get(p) ?? 0) + c);
    }
    if (!n) continue;
    inv.setItem(s, rem);
    if (!rem) empty++;
    movedCount += n;
    name = item.nameTag ?? pretty(item.typeId);
  }
  if (!movedCount) return;
  snapshots.set(player.id, { page: cur, keys: lookAtPage(inv).keys });
  const dest = [...perPage.entries()].sort((a, b) => b[1] - a[1])[0][0];
  hooks.bar(player, `§8[§bPage #${dest}§8] §7Auto-stored §f${movedCount}x ${name} §7(${freeEverywhere(player, inv)} slots left)`);
}

/** @param {Player} player @param {boolean} withAutoStore */
function tickPlayer(player, withAutoStore) {
  if (!player.isValid || dead.has(player.id)) return;
  const inv = invOf(player);
  if (!inv) return;
  const total = totalPages(player);
  if (lastTotal.get(player.id) !== total) {
    enforcePageCount(player);
    lastTotal.set(player.id, total);
  }
  if (!buttonsWanted(player)) {
    if (buttonState.get(player.id) !== false) {
      removeButtons(player);
      buttonState.set(player.id, false);
    }
    // Without buttons there is nothing to click, but auto-store still keeps the page from clogging.
  } else if (buttonState.get(player.id) !== true) {
    refreshButtons(player);
    sweepStrays(inv);
    buttonState.set(player.id, true);
    return;
  } else {
    pollButtons(player);
    if (withAutoStore) sweepStrays(inv);
  }
  if (total > 1 && withAutoStore && getFor(player, "autoStore") !== false) autoStore(player);
}

let beat = 0;
system.runInterval(() => {
  const withAutoStore = ++beat % 5 === 0;
  for (const player of world.getAllPlayers()) {
    try {
      tickPlayer(player, withAutoStore);
    } catch (e) {
      console.warn(`[stash] ${e}`);
    }
  }
}, 2);

// ---------------------------------------------------------------------------
// Operators' own page count
// ---------------------------------------------------------------------------

/**
 * Sets an operator's own number of pages (0 = follow the realm's `pages`), moving the items of any page
 * that goes away into the pages that are left.
 * @param {Player} player @param {number} count 0 to 25 @returns {{ ok: boolean, message: string }}
 */
export function setOpPages(player, count) {
  if (!isOp(player)) return { ok: false, message: "§cOnly operators can set their own page count." };
  if (!Number.isInteger(count) || count < 0 || count > MAX_PAGES) return { ok: false, message: `§cChoose a page count from 0 to ${MAX_PAGES} (0 = the realm's ${get("pages")}).` };
  player.setDynamicProperty(OP_PROP, count === 0 ? undefined : count);
  enforcePageCount(player);
  lastTotal.set(player.id, totalPages(player));
  buttonState.delete(player.id);
  return {
    ok: true,
    message:
      count === 0
        ? `§aYour inventory pages now follow the realm: ${get("pages")} page(s).`
        : `§aYour personal inventory now has ${count} page(s). (Realm default remains ${get("pages")}.)`,
  };
}

// ---------------------------------------------------------------------------
// /realm:inv
// ---------------------------------------------------------------------------

/** @type {Set<string>} */
const menuOpen = new Set();

/**
 * Shows a form, retrying while another screen (the inventory, chat) is still open.
 * @template R @param {Player} player @param {{ show: (p: Player) => Promise<R> }} form @param {number} [attempts] one a second
 * @returns {Promise<R | undefined>}
 */
async function showForm(player, form, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (!player.isValid) return undefined;
    const res = /** @type {any} */ (await form.show(player));
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await new Promise((r) => system.runTimeout(() => r(undefined), 20));
  }
  return undefined;
}

/** How full each page is: the live page from the inventory, the others from what's saved. @param {Player} player @param {import("@minecraft/server").Container} inv */
function pageUsage(player, inv) {
  const total = totalPages(player);
  const cur = curPage(player);
  const usage = [];
  for (let p = 1; p <= total; p++) usage.push(p === cur ? usedOnPage(inv) : Math.min(PAGE_SIZE, readPage(player, p)?.length ?? 0));
  return usage;
}

/** Every kind of item across the pages, with how many and where. @param {Player} player @param {import("@minecraft/server").Container} inv */
function scanItems(player, inv) {
  const total = totalPages(player);
  const cur = curPage(player);
  /** @type {Map<string, { name: string, count: number, pages: Set<number> }>} */
  const found = new Map();
  /** @param {string} key @param {string} name @param {number} n @param {number} page */
  const add = (key, name, n, page) => {
    const f = found.get(key) ?? { name, count: 0, pages: new Set() };
    f.count += n;
    f.pages.add(page);
    found.set(key, f);
  };
  for (const s of STORAGE_SLOTS) {
    const item = inv.getItem(s);
    if (item && !isButton(item)) add(`${item.typeId}|${item.nameTag ?? ""}`, item.nameTag ?? pretty(item.typeId), item.amount, cur);
  }
  for (let p = 1; p <= total; p++) {
    for (const e of readPage(player, p) ?? []) add(`${e.id}|${e.name ?? ""}`, e.name ?? pretty(e.id), e.n, p);
  }
  return [...found.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** @param {Player} player */
export async function openInvMenu(player) {
  if (menuOpen.has(player.id)) return;
  menuOpen.add(player.id);
  try {
    const inv = invOf(player);
    if (!inv) return;
    const total = totalPages(player);
    const cur = curPage(player);
    const usage = pageUsage(player, inv);
    const free = total * PAGE_SIZE - usage.reduce((a, b) => a + b, 0);
    const form = new ActionFormData()
      .title("§lExpansive Inventory")
      .body(
        total > 1
          ? `Page #${cur} of ${total}\n${total * PAGE_SIZE - free} of ${total * PAGE_SIZE} slots used, ${free} free across all pages\n§7The hotbar is shared by every page.`
          : "Your inventory has a single page.\n§7The realm's page count is 1 (operators can change it in /realm:config)."
      );
    /** @type {(() => void)[]} */
    const actions = [];
    if (total > 1) {
      for (let p = 1; p <= total; p++) {
        form.button(`Page #${p}${p === cur ? " (Active)" : ""}\n§8${usage[p - 1]}/${PAGE_SIZE} slots used`);
        actions.push(() => void switchPage(player, p));
      }
      form.button("Scan all items across pages\n§8Find which page holds an item");
      actions.push(() => scanMenu(player).catch((e) => console.warn(`[stash] ${e}`)));
    }
    form.button("Sort this page\n§8Merge stacks, order by item");
    actions.push(() => hooks.sort(player));
    form.button("Quick stack to nearby chests\n§8Into storage holding the same items");
    actions.push(() => hooks.stash(player));
    form.button("Inventory settings\n§8Page buttons, auto-store" + (isOp(player) ? ", your page count" : ""));
    actions.push(() => settingsMenu(player).catch((e) => console.warn(`[stash] ${e}`)));

    const res = await showForm(player, form);
    if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
    menuOpen.delete(player.id);
    actions[res.selection]?.();
  } finally {
    menuOpen.delete(player.id);
  }
}

/** Every item across the pages; choosing one opens a page that holds it. @param {Player} player */
async function scanMenu(player) {
  const inv = invOf(player);
  if (!inv) return;
  const cur = curPage(player);
  const list = scanItems(player, inv);
  const shown = list.slice(0, SCAN_ROWS);
  const form = new ActionFormData().title("§lScan all items").body(list.length ? `${list.length} kinds of items. Choose one to go to a page that holds it.` : "Nothing in your pages.");
  for (const f of shown) {
    const pages = [...f.pages].sort((a, b) => a - b);
    form.button(`${f.name} x${f.count} - Page${pages.length === 1 ? "" : "s"} ${pages.map((p) => `#${p}`).join(", ")}`);
  }
  form.button("Back");
  const res = await showForm(player, form, 3);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  const pick = shown[res.selection];
  if (!pick) {
    openInvMenu(player).catch((e) => console.warn(`[stash] ${e}`));
    return;
  }
  const pages = [...pick.pages].sort((a, b) => a - b);
  switchPage(player, pages.includes(cur) ? cur : pages[0]);
}

/** @param {Player} player */
async function settingsMenu(player) {
  const op = isOp(player);
  const form = new ModalFormData()
    .title("§lInventory settings")
    .toggle("In-inventory page buttons", { defaultValue: getFor(player, "invButtons") !== false, tooltip: "The three buttons in the top row of your inventory" })
    .toggle("Auto-store pickups into other pages", { defaultValue: getFor(player, "autoStore") !== false, tooltip: "When this page is full, new stacks move to another page" });
  if (op) {
    let own = 0;
    try {
      const v = player.getDynamicProperty(OP_PROP);
      if (typeof v === "number") own = v;
    } catch {
      // none
    }
    form.slider("My personal page count (0 = realm default)", 0, MAX_PAGES, { defaultValue: own, valueStep: 1, tooltip: `The realm's default is ${get("pages")}` });
  }
  const res = await showForm(player, form, 3);
  if (!res || res.canceled || !res.formValues || !player.isValid) return;
  const [buttons, auto, count] = res.formValues;
  if (typeof buttons === "boolean") setFor(player, "invButtons", buttons);
  if (typeof auto === "boolean") setFor(player, "autoStore", auto);
  if (op && typeof count === "number") {
    const out = setOpPages(player, Math.round(count));
    player.sendMessage(out.message);
  }
  hooks.bar(player, "§aInventory settings saved");
}
