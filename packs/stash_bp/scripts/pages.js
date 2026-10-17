// Expansive Inventory: extra pages of the main inventory (slots 9-35), switched with three buttons that
// sit inside the inventory grid, with the menu from /realm:inv, and with items auto-stored when a page fills.
//
// The active page lives in the real inventory. Inactive pages are native World structure snapshots;
// the player holds only their committed index. Old JSON pages are read once and migrated on use.
import { CommandPermissionLevel, EnchantmentType, ItemLockMode, ItemStack, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { get, getFor, setFor } from "./settings.js";
import { carried, commitInventory, discardSnapshot, InventoryRecoveryError, inventoryReady, loadSnapshot, saveSnapshot, stateOf } from "./page-store.js";

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
const OP_PROP = "stash:op_pages";
const CLICK_DEBOUNCE = 1;
const SCAN_ROWS = 100;

/**
 * One saved stack: `s` is its slot on the page, the rest rebuilds the ItemStack.
 * @typedef {{ s: number, id: string, n: number, name?: string, lore?: string[], keep?: 1, lock?: string, dmg?: number,
 *   ench?: [string, number][], color?: { red: number, green: number, blue: number }, props?: Record<string, any>,
 *   place?: string[], destroy?: string[], item?: ItemStack }} Rec
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
  if (getFor(player, "invOff") === true) return 1;
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
  return stateOf(player).cur;
}

/** @param {number} cur @param {number} total */
const prevOf = (cur, total) => (cur <= 1 ? total : cur - 1);
/** @param {number} cur @param {number} total */
const nextOf = (cur, total) => (cur >= total ? 1 : cur + 1);

/** @param {Player} player */
const buttonsWanted = (player) => !buttonsMissing && totalPages(player) > 1 && getFor(player, "invButtons") !== false;

// ---------------------------------------------------------------------------
// Reading old JSON pages (new saves always use native ItemStacks)
// ---------------------------------------------------------------------------

/** @param {Omit<Rec, "s">} rec @param {number} [amount] @returns {ItemStack | undefined} undefined when it can't be rebuilt exactly */
function deserializeStack(rec, amount = rec.n) {
  try {
    if (rec.item) {
      const copy = rec.item.clone();
      copy.amount = amount;
      return copy;
    }
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

/** Native clones preserve even metadata stable scripts cannot inspect. @param {ItemStack} item @returns {Omit<Rec, "s">} */
function toRecord(item) {
  return { id: item.typeId, n: item.amount, name: item.nameTag, item: item.clone() };
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

/** "diamond_pickaxe" → "Diamond pickaxe". @param {string} typeId */
function pretty(typeId) {
  const s = typeId.replace(/^[^:]*:/, "").replaceAll("_", " ");
  return s[0].toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Saved pages
// ---------------------------------------------------------------------------

/**
 * The stacks saved for a page, or undefined when the saved data can't be read (then nothing is written to it).
 * @param {Player} player @param {number} page @returns {Rec[] | undefined}
 */
function readPage(player, page) {
  try {
    const state = stateOf(player);
    if (state.pending) throw new Error("inventory recovery is pending; tell an operator");
    const ref = state.pages[page];
    if (ref) return loadSnapshot(player, ref).map(({ s, item }) => ({ s, ...toRecord(item) }));
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
    const used = new Set();
    for (const e of list) {
      if (!e || typeof e.id !== "string" || !Number.isInteger(e.n) || e.n < 1 || !STORAGE_SLOTS.includes(e.s) || used.has(e.s)) throw new Error("invalid legacy saved stack");
      used.add(e.s);
      const item = deserializeStack(e);
      if (!item || item.amount !== e.n) throw new Error(`cannot reconstruct legacy ${e.id}`);
      e.item = item;
    }
    return list;
  } catch (e) {
    console.warn(`[stash] reading page ${page}: ${e}`);
    return undefined;
  }
}

/** @param {Rec[]} entries @returns {import("./page-store.js").Entry[]} */
function nativeEntries(entries) {
  return entries.map((e) => {
    const item = deserializeStack(e);
    if (!item) throw new Error(`can't restore ${e.id}; page left unchanged`);
    return { s: e.s, item };
  });
}

/**
 * Builds immutable page images, then commits them together with the inventory.
 * Empty snapshots intentionally shadow legacy JSON so it can never be restored twice.
 * @param {Player} player @param {Map<number, Rec[]>} edits @param {import("./page-store.js").Entry[]} after @param {number} [cur]
 */
function commitPages(player, edits, after, cur = curPage(player)) {
  const old = stateOf(player);
  if (old.pending) throw new Error("inventory recovery is pending; tell an operator");
  const next = { ...old, cur, pages: { ...old.pages } };
  /** @type {import("./page-store.js").Ref[]} */
  const created = [];
  try {
    for (const [page, entries] of edits) {
      const ref = saveSnapshot(player, nativeEntries(entries));
      created.push(ref);
      next.pages[page] = ref;
    }
    commitInventory(player, old, next, after);
  } catch (e) {
    const live = stateOf(player);
    if (!(e instanceof InventoryRecoveryError) && !live.pending) for (const ref of created) if (!Object.values(live.pages).some((r) => r.id === ref.id)) discardSnapshot(ref);
    throw e;
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
    const item = deserializeStack(rec);
    for (const e of entries) {
      if (!left) break;
      const have = deserializeStack(e);
      if (e.n >= max || !item || !have?.isStackableWith(item)) continue;
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
 * @param {Map<number, Rec[]>} [edits]
 * @returns {{ rem: ItemStack | undefined, moved: Map<number, number>, edits: Map<number, Rec[]> }}
 */
function storeOnPages(player, item, pages, edits = new Map()) {
  /** @type {Map<number, number>} */
  const moved = new Map();
  const rec = toRecord(item);
  if (!pages.length) return { rem: item, moved, edits };
  /** @type {Map<number, Rec[] | undefined>} */
  const loaded = new Map();
  let left = item.amount;
  for (const mode of /** @type {const} */ (["merge", "fill"])) {
    for (const p of pages) {
      if (!left) break;
      if (!loaded.has(p)) loaded.set(p, edits.get(p) ?? readPage(player, p));
      const entries = loaded.get(p);
      if (!entries) throw new Error(`page ${p} can't be read; nothing moved`);
      const n = addToEntries(entries, { ...rec, n: left }, mode);
      if (!n) continue;
      left -= n;
      edits.set(p, entries);
      moved.set(p, (moved.get(p) ?? 0) + n);
    }
  }
  if (!left) return { rem: undefined, moved, edits };
  const rem = item.clone();
  rem.amount = left;
  return { rem, moved, edits };
}

// ---------------------------------------------------------------------------
// Placing items in the live inventory
// ---------------------------------------------------------------------------

/**
 * Puts a stack into some slots of a container: matching stacks first, then an empty slot. Returns what didn't fit.
 * @param {Map<number, ItemStack>} items @param {ItemStack} item @param {number[]} slots @returns {ItemStack | undefined}
 */
function placeIn(items, item, slots) {
  let left = item.amount;
  const max = item.maxAmount;
  if (max > 1) {
    for (const s of slots) {
      const have = items.get(s);
      if (!have || have.amount >= max || !have.isStackableWith(item)) continue;
      const take = Math.min(max - have.amount, left);
      const copy = have.clone();
      copy.amount = have.amount + take;
      items.set(s, copy);
      left -= take;
      if (!left) return undefined;
    }
  }
  for (const s of slots) {
    if (items.get(s)) continue;
    const put = item.clone();
    put.amount = left;
    items.set(s, put);
    return undefined;
  }
  const rem = item.clone();
  rem.amount = left;
  return rem;
}

/**
 * Finds a home for an item that mustn't stay where it is: this page, then the hotbar, then the other
 * pages. If all storage is full, the original stays in its button slot instead of being overwritten.
 * @param {Player} player @param {import("@minecraft/server").Container} inv @param {ItemStack} item @param {number} sourceSlot
 */
export function rescueItem(player, inv, item, sourceSlot) {
  const items = new Map(carried(inv).map((e) => [e.s, e.item]));
  items.delete(sourceSlot);
  // Without the buttons, their three slots are free too.
  let rem = placeIn(items, item, STORAGE_SLOTS);
  if (rem) rem = placeIn(items, rem, HOTBAR);
  /** @type {Map<number, Rec[]>} */
  let edits = new Map();
  if (rem) {
    const cur = curPage(player);
    const others = [];
    for (let p = 1; p <= totalPages(player); p++) if (p !== cur) others.push(p);
    const planned = storeOnPages(player, rem, others);
    rem = planned.rem;
    edits = planned.edits;
  }
  if (rem) {
    hooks.bar(player, "§cInventory is full. Move the item out of the button slot to use pages");
    return false;
  }
  commitPages(player, edits, [...items].map(([s, item]) => ({ s, item })));
  return true;
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
/** @type {Set<string>} */
const recoveryWarned = new Set();
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
    if (!inventoryReady(player)) {
      hooks.bar(player, "§cInventory recovery is safely saved and needs an operator");
      return false;
    }
    const incoming = readPage(player, target);
    const stayed = readPage(player, cur);
    if (!incoming || !stayed) {
      hooks.bar(player, `§cPage #${incoming ? cur : target} can't be read, so it wasn't opened`);
      return false;
    }

    /** @type {Rec[]} */
    const leaving = [];
    for (const s of STORAGE_SLOTS) {
      const item = inv.getItem(s);
      if (!item || isButton(item)) continue;
      leaving.push({ s, ...toRecord(item) });
    }
    // A legacy active-page remainder has to fit before it can migrate. Never append duplicate slots.
    const used = new Set(leaving.map((e) => e.s));
    for (const e of stayed) {
      const s = STORAGE_SLOTS.find((slot) => !used.has(slot));
      if (s === undefined) throw new Error("legacy active page has overflow; make room before switching");
      used.add(s);
      leaving.push({ ...e, s });
    }
    const after = carried(inv).filter((e) => !STORAGE_SLOTS.includes(e.s));
    for (const e of incoming) {
      const item = deserializeStack(e);
      if (!item) throw new Error(`can't restore ${e.id}`);
      after.push({ s: e.s, item });
    }
    commitPages(player, new Map([[cur, leaving], [target, []]]), after, target);
    snapshots.delete(id);
    refreshButtons(player);
    hooks.bar(player, `§8[§bPage #${target}/${total}§8] §7${usedOnPage(inv)}/${PAGE_SIZE} slots used`);
    player.playSound("random.click", { pitch: 1.2, volume: 0.6 });
    return true;
  } catch (e) {
    console.warn(`[stash] switching page: ${e}`);
    hooks.bar(player, `§cPage not switched: ${e}`);
    return false;
  } finally {
    switching.delete(id);
  }
}

/**
 * Makes the saved pages fit the player's page count: leaves a page that no longer exists and moves
 * everything saved on removed pages into the remaining inventory. Overflow stays durably saved.
 * @param {Player} player
 */
export function enforcePageCount(player) {
  const inv = invOf(player);
  if (!inv) return false;
  const total = totalPages(player);
  if (curPage(player) > total && !switchPage(player, 1)) return false;
  const items = new Map(carried(inv).map((e) => [e.s, e.item]));
  /** @type {Map<number, Rec[]>} */
  const edits = new Map();
  let moved = 0;
  let waiting = false;
  for (let p = total + 1; p <= MAX_PAGES; p++) {
    const entries = readPage(player, p);
    if (!entries) return false;
    if (!entries.length) continue;
    /** @type {Rec[]} */
    const left = [];
    for (const e of entries) {
      const item = deserializeStack(e);
      if (!item) throw new Error(`can't restore ${e.id}`);
      const slots = buttonsWanted(player) ? STORAGE_SLOTS : [...STORAGE_SLOTS, ...BUTTON_SLOTS].sort((a, b) => a - b);
      let rem = placeIn(items, item, slots);
      if (rem) rem = placeIn(items, rem, HOTBAR);
      if (rem) {
        const others = [];
        for (let n = 1; n <= total; n++) if (n !== curPage(player)) others.push(n);
        rem = storeOnPages(player, rem, others, edits).rem;
      }
      moved += e.n - (rem?.amount ?? 0);
      if (rem) left.push({ s: e.s, ...toRecord(rem) });
    }
    if (left.length) waiting = true;
    if (left.length !== entries.length || left.some((e, i) => e.n !== entries[i].n)) edits.set(p, left);
  }
  if (moved) commitPages(player, edits, [...items].map(([s, item]) => ({ s, item })));
  if (moved) hooks.bar(player, `§7Moved ${moved} item${moved === 1 ? "" : "s"} from removed inventory pages into your inventory`);
  if (waiting) hooks.bar(player, "§eRemoved pages are safely saved. Make room in your inventory to receive them");
  return !waiting;
}

// ---------------------------------------------------------------------------
// The buttons in the inventory grid
// ---------------------------------------------------------------------------

let buttonsMissing = false;

/** @type {Set<string>} players whose button slots were just written by this script, so the change events they cause aren't clicks */
const updatingButtons = new Set();

/** Marks a button-slot write about to happen; its change events arrive after the code finishes, so the mark stays until the next tick. @param {Player} player */
function markUpdating(player) {
  const id = player.id;
  if (updatingButtons.has(id)) return;
  updatingButtons.add(id);
  system.run(() => updatingButtons.delete(id));
}

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
    item.lockMode = ItemLockMode.inventory;
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
    markUpdating(player);
    if (have) {
      if (!isButton(have) && !rescueItem(player, inv, have, b.slot)) return;
    }
    inv.setItem(b.slot, want);
  }
}

/** Takes the buttons out of the grid, wherever they ended up. @param {Player} player */
function removeButtons(player) {
  const inv = invOf(player);
  if (!inv) return;
  for (const s of [...HOTBAR, ...BUTTON_SLOTS, ...STORAGE_SLOTS]) {
    if (!isButton(inv.getItem(s))) continue;
    markUpdating(player);
    inv.setItem(s, undefined);
  }
}

/** Clears buttons the player moved or shift-clicked out of their slots. @param {Player} player @param {import("@minecraft/server").Container} inv */
function sweepStrays(player, inv) {
  for (const s of [...HOTBAR, ...STORAGE_SLOTS]) {
    if (!isButton(inv.getItem(s))) continue;
    markUpdating(player);
    inv.setItem(s, undefined);
  }
}

/** @param {ItemStack | undefined} item @returns {"prev" | "menu" | "next" | undefined} */
const kindOf = (item) => BUTTONS.find((b) => b.id === item?.typeId)?.kind;

/** A button on the cursor is deleted, so it can never stay stuck to the mouse. @param {Player} player @returns {"prev" | "menu" | "next" | undefined} which button it was */
function clearCursorButton(player) {
  try {
    const cursor = player.getComponent("minecraft:cursor_inventory");
    const kind = kindOf(cursor?.item);
    if (!kind) return undefined;
    cursor?.clear();
    return kind;
  } catch {
    return undefined;
  }
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
  const onCursor = clearCursorButton(player);
  if (onCursor && !kinds.includes(onCursor)) kinds = [...kinds, onCursor];
  for (const b of BUTTONS) {
    const have = inv.getItem(b.slot);
    if (!have || have.typeId === b.id) continue;
    markUpdating(player);
    if (!isButton(have) && !rescueItem(player, inv, have, b.slot)) return;
  }
  sweepStrays(player, inv);
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
  const onCursor = clearCursorButton(player);
  const missing = BUTTONS.filter((b) => inv.getItem(b.slot)?.typeId !== b.id).map((b) => b.kind);
  if (onCursor && !missing.includes(onCursor)) missing.push(onCursor);
  if (missing.length) clicked(player, missing);
}

// A button picked up in the inventory screen, or any change in its slot, counts as the click right away.
world.afterEvents.playerInventoryItemChange?.subscribe((event) => {
  try {
    const player = event.player;
    if (!player?.isValid || dead.has(player.id) || updatingButtons.has(player.id) || switching.has(player.id)) return;
    if (!buttonsWanted(player)) return;
    const cursorKind = clearCursorButton(player);
    const own = BUTTONS.find((b) => b.slot === event.slot);
    // The script putting a button into its own slot (a rename after a switch) is not a click.
    if (!cursorKind && own && event.itemStack?.typeId === own.id) return;
    if (!cursorKind && !isButton(event.beforeItemStack) && !isButton(event.itemStack) && !own) return;
    const inv = invOf(player);
    const gone = inv ? BUTTONS.filter((b) => inv.getItem(b.slot)?.typeId !== b.id).map((b) => b.kind) : [];
    if (gone.length === BUTTONS.length) {
      clicked(player, gone);
      return;
    }
    const kind = cursorKind ?? kindOf(event.beforeItemStack) ?? kindOf(event.itemStack) ?? own?.kind;
    if (kind) clicked(player, [kind]);
  } catch (e) {
    console.warn(`[stash] ${e}`);
  }
});

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
      sweepStrays(player, inv);
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
  for (const m of [lastClick, buttonState, snapshots, lastTotal, lastEnforce]) m.delete(playerId);
  recoveryWarned.delete(playerId);
  dead.delete(playerId);
  updatingButtons.delete(playerId);
  menuOpen.delete(playerId);
  switching.delete(playerId);
});

// ---------------------------------------------------------------------------
// Ticking: buttons every 2 ticks, auto-store every 10
// ---------------------------------------------------------------------------

/** @type {Map<string, number>} player id → page count seen last */
const lastTotal = new Map();
/** @type {Map<string, { total: number, tick: number }>} */
const lastEnforce = new Map();

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
    const { rem, moved, edits } = storeOnPages(player, item, others);
    let n = 0;
    for (const [p, c] of moved) {
      n += c;
      perPage.set(p, (perPage.get(p) ?? 0) + c);
    }
    if (!n) continue;
    const after = carried(inv).filter((e) => e.s !== s);
    if (rem) after.push({ s, item: rem });
    commitPages(player, edits, after);
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
  if (!inventoryReady(player)) {
    if (!recoveryWarned.has(player.id)) {
      recoveryWarned.add(player.id);
      player.sendMessage("§cInventory pages are paused: a failed save needs operator recovery. Original inventory images are safely saved.");
    }
    return;
  }
  recoveryWarned.delete(player.id);
  const total = totalPages(player);
  const attempt = lastEnforce.get(player.id);
  if (lastTotal.get(player.id) !== total && (!attempt || attempt.total !== total || system.currentTick - attempt.tick >= 20)) {
    lastEnforce.set(player.id, { total, tick: system.currentTick });
    if (enforcePageCount(player)) lastTotal.set(player.id, total);
  }
  if (!buttonsWanted(player)) {
    if (buttonState.get(player.id) !== false) {
      removeButtons(player);
      buttonState.set(player.id, false);
    }
    // Without buttons there is nothing to click, but auto-store still keeps the page from clogging.
  } else if (buttonState.get(player.id) !== true) {
    refreshButtons(player);
    sweepStrays(player, inv);
    buttonState.set(player.id, true);
    return;
  } else {
    pollButtons(player);
    if (withAutoStore) sweepStrays(player, inv);
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
  if (enforcePageCount(player)) lastTotal.set(player.id, totalPages(player));
  else lastTotal.delete(player.id);
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
          : getFor(player, "invOff") === true
            ? "You're using the normal 27-slot inventory (no buttons or extra pages).\n§7Enable Expansive Inventory below to get your pages back."
            : "Your inventory has a single page.\n§7The realm's page count is 1 (operators can change it in /realm:config)."
      );
    const off = getFor(player, "invOff") === true;
    /** @type {(() => void)[]} */
    const actions = [];
    if (off) {
      form.button("Enable Expansive Inventory (5 pages)\n§8Restore extra pages and dark slot buttons");
      actions.push(() => {
        setFor(player, "invOff", false);
        enforcePageCount(player);
        if (buttonsWanted(player)) refreshButtons(player);
        player.sendMessage("§aExpansive Inventory enabled!");
      });
    } else if (total > 1) {
      form.button("Use normal inventory (turn off pages)\n§8Remove buttons and bring items to 1 page");
      actions.push(() => {
        setFor(player, "invOff", true);
        enforcePageCount(player);
        removeButtons(player);
        player.sendMessage("§aSwitched to normal 1-page inventory (no buttons). Run /realm:inv anytime to re-enable 5 pages.");
      });
    }
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
    .toggle("Expansive inventory (extra pages)", { defaultValue: getFor(player, "invOff") !== true, tooltip: "Off: a normal 27-slot inventory with no buttons. Items on other pages move back to your inventory" })
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
    form.slider("My personal page count (0 = realm default, 1 = normal inventory)", 0, MAX_PAGES, { defaultValue: own, valueStep: 1, tooltip: `The realm's default is ${get("pages")}` });
  }
  const res = await showForm(player, form, 3);
  if (!res || res.canceled || !res.formValues || !player.isValid) return;
  const [expansive, buttons, auto, count] = res.formValues;
  if (typeof expansive === "boolean") setFor(player, "invOff", !expansive);
  if (typeof buttons === "boolean") setFor(player, "invButtons", buttons);
  if (typeof auto === "boolean") setFor(player, "autoStore", auto);
  if (op && typeof count === "number") {
    const out = setOpPages(player, Math.round(count));
    player.sendMessage(out.message);
  }
  hooks.bar(player, "§aInventory settings saved");
}
