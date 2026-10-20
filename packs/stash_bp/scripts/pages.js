// Expansive Inventory: extra pages of the main inventory (slots 9-35), switched with three buttons that
// sit inside the inventory grid, with the menu from /realm:inv, and with items auto-stored when a page fills.
//
// The active page lives in the real inventory. Inactive pages are native World structure snapshots;
// the player holds only their committed index. Old JSON pages are read once and migrated on use.
import { CommandPermissionLevel, EnchantmentType, ItemLockMode, ItemStack, Player, PlayerInventoryType, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { get, getFor, onChange, setFor } from "./settings.js";
import { carried, commitInventory, discardSnapshot, exportPending, indexedEntries, InventoryRecoveryError, inventoryReady, kindsOfRecs, loadSnapshot, parseKind, pendingSummary, pruneIndex, recordIndex, saveSnapshot, signature, stateOf } from "./page-store.js";

export const BTN_PREV = "custom:inv_prev";
export const BTN_MENU = "custom:inv_menu";
export const BTN_NEXT = "custom:inv_next";

/** The top row's last three slots, left to right: previous, current page/menu, next. */
const BUTTONS = /** @type {const} */ ([
  { kind: "prev", id: BTN_PREV, slot: 15 },
  { kind: "menu", id: BTN_MENU, slot: 16 },
  { kind: "next", id: BTN_NEXT, slot: 17 },
]);
const BUTTON_IDS = new Set([BTN_PREV, BTN_MENU, BTN_NEXT]);
export const BUTTON_SLOTS = [15, 16, 17];
/** The 24 slots of a page: slots 9-35 without the buttons. */
export const STORAGE_SLOTS = [9, 10, 11, 12, 13, 14, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];
const OLD_STORAGE_SLOTS = [10, 11, 12, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];
const OLD_BUTTON_SLOTS = [9, 13, 17];
const HOTBAR = [0, 1, 2, 3, 4, 5, 6, 7, 8];
/** The three rows of a page as the inventory screen draws them: the top row has only its first six slots (the buttons take the rest). */
const ROWS = [STORAGE_SLOTS.slice(0, 6), STORAGE_SLOTS.slice(6, 15), STORAGE_SLOTS.slice(15)];
const PAGE_SIZE = STORAGE_SLOTS.length;

const MAX_PAGES = 25;
const PAGE_PROP = "stash:page:";
const OP_PROP = "stash:op_pages";
const SCAN_ROWS = 100;

/**
 * One saved stack: `s` is its slot on the page, the rest rebuilds the ItemStack.
 * @typedef {{ s: number, id: string, n: number, name?: string, lore?: string[], keep?: 1, lock?: string, dmg?: number,
 *   ench?: [string, number][], color?: { red: number, green: number, blue: number }, props?: Record<string, any>,
 *   place?: string[], destroy?: string[], item?: ItemStack }} Rec
 */
/** @typedef {{ bar: (player: Player, text: string) => void, sort: (player: Player) => void, stash: (player: Player) => void }} Hooks */
/** @typedef {"prev" | "menu" | "next"} ButtonKind */

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
 * Absent layout metadata always means the old grid, even when no buttons are visible.
 * Permute all 27 slots so full normal inventories and real items in old control slots also fit.
 * The native transaction commits the active image and layout together; inactive refs retain their
 * own old layout until rewritten. A recovery journal is never interpreted as proof of custody.
 * @param {Player} player
 */
function ensureLayout(player) {
  const old = stateOf(player);
  if (old.pending) throw new Error("inventory recovery is pending; tell an operator");
  if (old.layout === 2) return;
  const inv = invOf(player);
  if (!inv) throw new Error("player inventory is unavailable");
  const after = carried(inv).filter((e) => !isButton(e.item)).map(({ s, item }) => {
    const ordinal = OLD_STORAGE_SLOTS.indexOf(s);
    const control = OLD_BUTTON_SLOTS.indexOf(s);
    return { s: ordinal >= 0 ? STORAGE_SLOTS[ordinal] : control >= 0 ? BUTTON_SLOTS[control] : s, item };
  });
  commitInventory(player, old, { ...old, layout: 2 }, after);
}

/** @param {number} slot @param {2 | undefined} layout */
function pageSlot(slot, layout) {
  const slots = layout === 2 ? STORAGE_SLOTS : OLD_STORAGE_SLOTS;
  const ordinal = slots.indexOf(slot);
  if (ordinal < 0) throw new Error("invalid saved page slot");
  return STORAGE_SLOTS[ordinal];
}

/**
 * The stacks saved for a page, or undefined when the saved data can't be read (then nothing is written to it).
 * @param {Player} player @param {number} page @returns {Rec[] | undefined}
 */
function readPage(player, page) {
  try {
    const state = stateOf(player);
    if (state.pending) throw new Error("inventory recovery is pending; tell an operator");
    const ref = state.pages[page];
    if (ref) return loadSnapshot(player, ref).map(({ s, item }) => ({ s: pageSlot(s, ref.layout), ...toRecord(item) }));
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
      if (!e || typeof e.id !== "string" || !Number.isInteger(e.n) || e.n < 1 || !OLD_STORAGE_SLOTS.includes(e.s) || used.has(e.s)) throw new Error("invalid legacy saved stack");
      used.add(e.s);
      const item = deserializeStack(e);
      if (!item || item.amount !== e.n) throw new Error(`cannot reconstruct legacy ${e.id}`);
      e.item = item;
    }
    return list.map((e) => ({ ...e, s: pageSlot(e.s, undefined) }));
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
 * The committed revision of a player's saved pages: it changes whenever any page's snapshot does (a page ref id is
 * never reused). It rides on every notice and every reply, so a reply computed before a change can be told from one
 * after it. @param {Player} player @returns {string | undefined}
 */
export function revisionOf(player) {
  try {
    const state = stateOf(player);
    return `${Object.entries(state.pages).map(([p, r]) => `${p}=${r.id}`).join(",")}`;
  } catch {
    return undefined;
  }
}

/** Tells packs that count items (Saga's collect steps) that what the saved pages hold changed, with the new revision. @param {Player} player */
function announceChange(player) {
  try {
    system.sendScriptEvent("realm:stash_changed", JSON.stringify({ player: player.id, rev: revisionOf(player) }));
  } catch {
    // a notice that can't be sent only delays a recount
  }
}

/** @typedef {{ id: string, name?: string, lore?: string[], n: number, x?: boolean }} CountRow x: its lore was too long to send */

/** @type {Map<string, { sig: string, rows: Map<string, CountRow[]> }>} per player: what each ask has on saved pages, valid while the page refs are the same */
const storedCache = new Map();

/** Could a saved page hold a named stack? False only when the committed index says it holds none. @param {Player} player @param {number} page */
function mayHoldNamed(player, page) {
  try {
    const kinds = indexedEntries(stateOf(player), page);
    return !kinds || kinds.some((k) => k.name !== undefined && k.name !== "");
  } catch {
    return true;
  }
}

/**
 * What the player's saved pages (not the active one) hold of an item and/or custom name, as one row per kind, name and
 * lore, for realm:stash_count. A step with an item reads only pages the committed index says may hold it; a step with
 * only a name reads the pages that may hold any named stack, and every named stack goes out (the asker matches the name,
 * the way it does for live items). The answer is kept until a page changes. Undefined when a page can't be read, so a
 * caller waits rather than counting it as empty.
 * @param {Player} player @param {string | undefined} id @param {string} [name]
 * @returns {CountRow[] | undefined}
 */
export function storedCount(player, id, name) {
  let state;
  try {
    state = stateOf(player);
  } catch {
    return undefined;
  }
  if (state.pending) return undefined;
  const cur = curPage(player);
  const pagesNow = new Set(Object.keys(state.pages).map(Number));
  /** @type {string[]} */
  const legacy = [];
  for (let p = 1; p <= totalPages(player); p++) {
    const raw = player.getDynamicProperty(PAGE_PROP + p);
    if (raw === undefined) continue;
    pagesNow.add(p);
    if (!state.pages[p]) legacy.push(`${p}:L${typeof raw === "string" ? raw.length : "?"}`);
  }
  const sig = `${cur}|${Object.entries(state.pages).map(([p, r]) => `${p}:${r.id}`).join(",")}|${legacy.join(",")}`;
  let cache = storedCache.get(player.id);
  if (!cache || cache.sig !== sig) {
    cache = { sig, rows: new Map() };
    storedCache.set(player.id, cache);
  }
  const ask = id === undefined ? `\u0000${name ?? ""}` : id;
  const known = cache.rows.get(ask);
  if (known) return known;
  /** @type {Map<string, CountRow>} */
  const out = new Map();
  for (const p of [...pagesNow].sort((a, b) => a - b)) {
    if (p === cur || !(id === undefined ? mayHoldNamed(player, p) : mayHold(player, p, id))) continue;
    const entries = readPage(player, p);
    if (!entries) return undefined;
    for (const e of entries) {
      if (id !== undefined ? e.id !== id : !e.name) continue;
      const item = deserializeStack(e);
      if (!item) return undefined;
      const lore = item.getLore();
      const long = lore.join("\n").length > 200;
      const key = `${e.id}|${e.name ?? ""}|${JSON.stringify(long ? [] : lore)}|${long}`;
      const row = out.get(key) ?? { id: e.id, name: e.name, lore: lore.length && !long ? lore : undefined, n: 0, x: long ? true : undefined };
      row.n += e.n;
      out.set(key, row);
    }
  }
  const rows = [...out.values()];
  cache.rows.set(ask, rows);
  return rows;
}

/**
 * Builds immutable page images, then commits them together with the inventory.
 * Empty snapshots intentionally shadow legacy JSON so it can never be restored twice.
 * `decorate` runs once on the index about to be written, so whatever else the index records (a content index)
 * lands in the same single write; if it throws, nothing changes.
 * @param {Player} player @param {Map<number, Rec[]>} edits @param {import("./page-store.js").Entry[]} after @param {number} [cur]
 * @param {(next: import("./page-store.js").State, edits: Map<number, Rec[]>) => void} [decorate]
 */
function commitPages(player, edits, after, cur = curPage(player), decorate) {
  const old = stateOf(player);
  if (old.pending) throw new Error("inventory recovery is pending; tell an operator");
  const next = { ...old, cur, pages: { ...old.pages } };
  /** @type {import("./page-store.js").Ref[]} */
  const created = [];
  try {
    for (const [page, entries] of edits) {
      const ref = saveSnapshot(player, nativeEntries(entries));
      ref.layout = 2;
      created.push(ref);
      next.pages[page] = ref;
      recordIndex(next, page, ref, kindsOfRecs(entries));
    }
    pruneIndex(next);
    decorate?.(next, edits);
    commitInventory(player, old, next, after);
    if (edits.size) announceChange(player);
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
 * Could a saved page take this item (a matching stack or a free slot)? False only when the committed index and the
 * page's saved stack count prove it can't; an unknown page is read, never skipped.
 * @param {Player} player @param {number} page @param {string} id
 */
function mayTake(player, page, id) {
  try {
    const state = stateOf(player);
    if (state.pending || !state.pages[page]) return true;
    if (!indexedEntries(state, page)) return true;
    const held = savedStacks(player, page);
    return held === undefined || held < PAGE_SIZE || mayHold(player, page, id);
  } catch {
    return true;
  }
}

/**
 * Puts a stack onto saved pages: matching stacks first, then empty slots. Returns what didn't fit.
 * @param {Player} player @param {ItemStack} item @param {number[]} pages
 * @param {Map<number, Rec[]>} [edits]
 * @param {boolean} [perPage] fill each page (matching stacks, then free slots) before the next, so earlier pages fill first
 * @returns {{ rem: ItemStack | undefined, moved: Map<number, number>, edits: Map<number, Rec[]> }}
 */
function storeOnPages(player, item, pages, edits = new Map(), perPage = false) {
  /** @type {Map<number, number>} */
  const moved = new Map();
  const rec = toRecord(item);
  if (!pages.length) return { rem: item, moved, edits };
  /** @type {Map<number, Rec[] | undefined>} */
  const loaded = new Map();
  let left = item.amount;
  /** @param {number} p @param {"merge" | "fill"} mode */
  const put = (p, mode) => {
    if (!left) return;
    if (!loaded.has(p) && !edits.has(p) && !mayTake(player, p, rec.id)) return;
    if (!loaded.has(p)) loaded.set(p, edits.get(p) ?? readPage(player, p));
    const entries = loaded.get(p);
    if (!entries) throw new Error(`page ${p} can't be read; nothing moved`);
    const n = addToEntries(entries, { ...rec, n: left }, mode);
    if (!n) return;
    left -= n;
    edits.set(p, entries);
    moved.set(p, (moved.get(p) ?? 0) + n);
  };
  if (perPage) {
    for (const p of pages) for (const mode of /** @type {const} */ (["merge", "fill"])) put(p, mode);
  } else {
    for (const mode of /** @type {const} */ (["merge", "fill"])) for (const p of pages) put(p, mode);
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
/** @type {Map<string, { page: number, amounts: Map<string, number>, live: Map<string, number> }>} what each player's page, and everything they carry, held at the last auto-store look */
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
  try { ensureLayout(player); }
  catch (e) {
    hooks.bar(player, `§cPage not switched: ${e}`);
    return false;
  }
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
    if (buttonsWanted(player)) for (const b of BUTTONS) {
      const have = after.find((e) => e.s === b.slot);
      // Never overwrite a real stack in a reserved slot; button repair must rescue it first.
      if (have && !isButton(have.item)) throw new Error("move the item out of the button slot before switching");
      const index = after.findIndex((e) => e.s === b.slot);
      if (index >= 0) after.splice(index, 1);
      const item = makeButton(b.kind, target, total);
      if (!item) throw new Error("page controls are unavailable");
      after.push({ s: b.slot, item });
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
  ensureLayout(player);
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
// Moving stacks between pages
// ---------------------------------------------------------------------------

/**
 * @typedef {"gone" | "busy" | "layout" | "recovery" | "invalid" | "same-page" | "empty" | "stale" | "slot-locked" | "unreadable" | "no-room" | "failed"} TransferCode
 * @typedef {{ from?: number, slots: number[], to: number, partial?: boolean, expect?: Map<number, string>,
 *   reason?: string, decorate?: (next: import("./page-store.js").State, edits: Map<number, Rec[]>) => void }} TransferRequest
 * @typedef {{ ok: true, reason: string, from: number, to: number, stacks: number, items: number, left: { slot: number, amount: number }[] }} Transferred
 * @typedef {{ ok: false, reason: string, code: TransferCode, message: string, fit?: number }} NotTransferred
 */

/**
 * The one way stacks change pages. Takes stacks out of slots of one page and puts them on another (`from` defaults to
 * the page being shown; either side may be any page the player has, never the same one), merging into matching
 * stacks first and then taking empty slots in order. Planning happens on copies in memory: the request is refused
 * before anything is written when a slot is empty, stale, locked to its slot, or the destination can't take every
 * stack (`partial: true` instead moves what fits and returns what is left, slot by slot). Only after that is it one
 * commitPages transaction: the page images and both inventory images are saved and read back before a live slot
 * changes, a failure rolls back, and one write of the page index commits it. Stacks travel as native ItemStacks
 * (clones), the hotbar, cursor and page buttons are never touched, and nothing is announced: a move is not a pickup.
 *   slots   slots of the `from` page (9-14, 18-35), each at most once
 *   expect  slot -> signature(): what the caller saw; any difference refuses the move ("stale")
 *   reason  carried back in the result ("manual"; later callers may say "route" or "fill")
 *   decorate  called once with the index about to be written (see commitPages)
 * @param {Player} player @param {TransferRequest} request @returns {Transferred | NotTransferred}
 */
export function transferStacks(player, request) {
  const reason = request.reason ?? "manual";
  /** @param {TransferCode} code @param {string} message @param {{ fit?: number }} [extra] @returns {NotTransferred} */
  const refuse = (code, message, extra) => ({ ok: false, reason, code, message, ...extra });
  const id = player.id;
  const inv = invOf(player);
  if (!inv || !alive(player)) return refuse("gone", "You can't move items right now");
  if (switching.has(id)) return refuse("busy", "Another inventory change is still running. Try again in a moment");
  try {
    if (stateOf(player).pending) return refuse("recovery", "Inventory recovery is safely saved and needs an operator");
    ensureLayout(player);
  } catch (e) {
    return refuse("layout", `Items not moved: ${e}`);
  }
  switching.add(id);
  try {
    const total = totalPages(player);
    const cur = curPage(player);
    const from = request.from ?? cur;
    const to = request.to;
    const exists = (/** @type {number} */ p) => Number.isInteger(p) && p >= 1 && p <= total;
    const wanted = [...request.slots].sort((a, b) => a - b);
    if (cur > total || !exists(from) || !exists(to) || !wanted.length || new Set(wanted).size !== wanted.length || wanted.some((s) => !STORAGE_SLOTS.includes(s))) {
      return refuse("invalid", "Choose a page you have, and slots of the page being moved from");
    }
    if (from === to) return refuse("same-page", `Those items are already on Page #${to}`);

    /** @type {Map<number, Map<number, ItemStack>>} page -> slot -> stack, copies the plan changes freely */
    const model = new Map();
    /** @param {number} page @returns {Map<number, ItemStack> | undefined} */
    const load = (page) => {
      let slots = model.get(page);
      if (slots) return slots;
      slots = new Map();
      if (page === cur) {
        for (const s of STORAGE_SLOTS) {
          const item = inv.getItem(s);
          if (item && !isButton(item)) slots.set(s, item);
        }
      } else {
        const entries = readPage(player, page);
        if (!entries) return undefined;
        for (const e of entries) {
          const item = deserializeStack(e);
          if (!item) throw new Error(`can't restore ${e.id}`);
          slots.set(e.s, item);
        }
      }
      model.set(page, slots);
      return slots;
    };
    const source = load(from);
    const target = load(to);
    if (!source || !target) return refuse("unreadable", `Page #${source ? to : from} can't be read, so nothing was moved`);

    const moving = [];
    for (const slot of wanted) {
      const item = source.get(slot);
      if (!item) return refuse(request.expect ? "stale" : "empty", request.expect ? "That stack changed since the menu showed it. Nothing was moved" : "There is nothing in that slot");
      if (request.expect && request.expect.get(slot) !== signature(item)) return refuse("stale", "That stack changed since the menu showed it. Nothing was moved");
      if (item.lockMode === ItemLockMode.slot) return refuse("slot-locked", `${item.nameTag ?? pretty(item.typeId)} is locked to its slot, so nothing was moved`);
      moving.push({ slot, item });
    }

    let fit = 0;
    let stacks = 0;
    let items = 0;
    /** @type {{ slot: number, amount: number }[]} */
    const left = [];
    for (const { slot, item } of moving) {
      const rem = placeIn(target, item, STORAGE_SLOTS);
      if (!rem) {
        fit++;
        stacks++;
        items += item.amount;
        source.delete(slot);
        continue;
      }
      if (!request.partial) continue; // counted below; nothing has been written
      const placed = item.amount - rem.amount;
      if (placed) {
        stacks++;
        items += placed;
        source.set(slot, rem);
      }
      left.push({ slot, amount: rem.amount });
    }
    if ((!request.partial && fit < moving.length) || !items) {
      return refuse("no-room", `Page #${to} has room for ${fit} of ${moving.length} stack${moving.length === 1 ? "" : "s"}. Nothing was moved`, { fit });
    }
    /** @type {Map<number, Rec[]>} */
    const edits = new Map();
    for (const page of [from, to]) {
      if (page === cur) continue;
      const slots = model.get(page) ?? new Map();
      edits.set(page, [...slots].sort((a, b) => a[0] - b[0]).map(([s, item]) => ({ s, ...toRecord(item) })));
    }
    let after = carried(inv);
    if (model.has(cur)) {
      // Only the page's own stacks are rewritten: the hotbar, the buttons and anything else stays as it is.
      after = after.filter((e) => isButton(e.item) || !STORAGE_SLOTS.includes(e.s));
      for (const [s, item] of model.get(cur) ?? []) after.push({ s, item });
    }
    try {
      commitPages(player, edits, after, cur, request.decorate);
    } catch (e) {
      console.warn(`[stash] moving items between pages: ${e}`);
      return refuse(e instanceof InventoryRecoveryError ? "recovery" : "failed", `Items not moved: ${e}`);
    }
    snapshots.delete(id); // what the page held changed by our hand: not a pickup for auto-store to look for
    return { ok: true, reason, from, to, stacks, items, left };
  } catch (e) {
    console.warn(`[stash] moving items between pages: ${e}`);
    return refuse("failed", `Items not moved: ${e}`);
  } finally {
    switching.delete(id);
  }
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
  ensureLayout(player);
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
    inv.setItem(s, undefined);
  }
}

/** Clears buttons the player moved or shift-clicked out of their slots. @param {Player} player @param {import("@minecraft/server").Container} inv */
function sweepStrays(player, inv) {
  for (const s of [...HOTBAR, ...STORAGE_SLOTS]) {
    if (!isButton(inv.getItem(s))) continue;
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

/** @type {Map<string, { kinds: ButtonKind[], wipe: boolean }>} live observations before deferred reconciliation */
const queuedButtons = new Map();
/** @type {Set<string>} only synchronous script mutations; never a whole-tick input lock */
const reconciling = new Set();
/** @type {Map<string, boolean>} player id → whether the buttons are in place (false: taken out) */
const buttonState = new Map();
/** @type {Set<string>} */
const dead = new Set();
/** @type {Map<string, number>} player id → a number that changes when the player dies, respawns, leaves or changes dimension */
const lifeGen = new Map();
let lifeEpoch = 0;
/** @param {string} id */
const bumpLife = (id) => void lifeGen.set(id, ++lifeEpoch);
/** An open menu keeps this from before its first form; a different one means the player went through something since. @param {Player} player */
const lifeOf = (player) => lifeGen.get(player.id) ?? 0;
/**
 * Here and healthy: the checks every step after an `await` repeats. Death is read from health too, because some
 * ways a player dies never emit entityDie.
 * @param {Player} player
 */
function alive(player) {
  try {
    if (!player.isValid || dead.has(player.id)) return false;
    const health = player.getComponent("minecraft:health");
    return !health || health.currentValue > 0;
  } catch {
    return false;
  }
}
/**
 * Items whose data (potion, level, pattern, color) the id, name and lore don't show: never refilled from another page.
 * Not rockets: refilling them mid-glide is the point, even if a Flight 1 stack can stand in for a Flight 3 one.
 */
const HIDDEN_DATA = /^minecraft:(firework_star|arrow|ominous_bottle|[a-z_]*banner)$/;

/**
 * A button was clicked (it left its slot): save anything real that took its place, put the buttons back,
 * and do what the button says, at most once per click.
 * @param {Player} player @param {readonly ("prev" | "menu" | "next")[]} kinds @param {boolean} [wipe]
 */
function clicked(player, kinds, wipe = false) {
  const inv = invOf(player);
  if (!inv) return;
  const onCursor = clearCursorButton(player);
  if (onCursor && !kinds.includes(onCursor)) kinds = [...kinds, onCursor];
  for (const b of BUTTONS) {
    const have = inv.getItem(b.slot);
    if (!have || have.typeId === b.id) continue;
    if (!isButton(have) && !rescueItem(player, inv, have, b.slot)) return;
  }
  sweepStrays(player, inv);
  removeDropped(player);
  // A co-observed wipe is not the same as three separately observed genuine gestures.
  if (!kinds.length || wipe) {
    refreshButtons(player);
    return;
  }
  // Restore all consumed controls before processing possibly several distinct queued gestures.
  refreshButtons(player);
  for (const kind of kinds) {
    const cur = curPage(player);
    const total = totalPages(player);
    if (kind === "prev" || kind === "next") {
      if (!switchPage(player, kind === "prev" ? prevOf(cur, total) : nextOf(cur, total))) refreshButtons(player);
    } else {
      hooks.bar(player, "§bClose inventory to open the Inventory Pages menu");
      openInvMenu(player).catch((e) => console.warn(`[stash] ${e}`));
    }
  }
}

/** Observe live slots/cursor, never historical event payloads. @param {Player} player @returns {{ kinds: ButtonKind[], wipe: boolean }} */
function observedButtons(player) {
  const inv = invOf(player);
  if (!inv) return { kinds: [], wipe: false };
  /** @type {ButtonKind | undefined} */
  let onCursor;
  try { onCursor = kindOf(player.getComponent("minecraft:cursor_inventory")?.item); }
  catch { /* A slot request is still observable when the cursor is unavailable. */ }
  const missing = BUTTONS.filter((b) => inv.getItem(b.slot)?.typeId !== b.id).map((b) => b.kind);
  const wipe = missing.length === BUTTONS.length && !onCursor &&
    ![...HOTBAR, ...STORAGE_SLOTS].some((s) => isButton(inv.getItem(s)));
  if (onCursor && !missing.includes(onCursor)) missing.push(onCursor);
  return { kinds: missing, wipe };
}

/** @param {Player} player */
function pollButtons(player) {
  if (reconciling.has(player.id) || switching.has(player.id)) return;
  const observed = observedButtons(player);
  const request = queuedButtons.get(player.id) ?? observed;
  for (const kind of observed.kinds) if (!request.kinds.includes(kind)) request.kinds.push(kind);
  queuedButtons.delete(player.id);
  if (!request.kinds.length) return;
  reconciling.add(player.id);
  try { clicked(player, request.kinds, request.wipe); }
  finally { reconciling.delete(player.id); }
}

// Event payloads may arrive several ticks after our writes, or after a newer gesture. They are wakeups,
// not requests. Only the current slot/cursor transaction can request a switch. Reconcile outside the
// engine's inventory event dispatch so a client transaction finishes before we replace its slots.
world.afterEvents.playerInventoryItemChange?.subscribe((event) => {
  try {
    const player = event.player;
    if (event.inventoryType !== PlayerInventoryType.Inventory || !Number.isInteger(event.slot) || event.slot < 9 || event.slot > 35) return;
    if (!player?.isValid || dead.has(player.id) || reconciling.has(player.id) || switching.has(player.id)) return;
    if (!buttonsWanted(player) || !BUTTON_SLOTS.includes(event.slot) && !isButton(event.beforeItemStack) && !isButton(event.itemStack)) return;
    if (buttonState.get(player.id) !== true || !inventoryReady(player)) return;
    // Old control positions are storage in layout 2; finish migration before interpreting gestures.
    if (stateOf(player).layout !== 2) return;
    const request = observedButtons(player);
    const observed = request.kinds;
    if (!observed.length) return;
    // Several slots may already be updated when the first event arrives. Use its slot only to order
    // gestures that are independently visible now; an old payload can never add a missing gesture.
    const own = BUTTONS.find((b) => b.slot === event.slot);
    const first = own ? observed.indexOf(own.kind) : -1;
    if (own && first > 0 && event.beforeItemStack?.typeId === own.id && event.itemStack?.typeId !== own.id) {
      observed.unshift(...observed.splice(first, 1));
    }
    const pending = queuedButtons.get(player.id);
    if (pending) {
      for (const kind of observed) if (!pending.kinds.includes(kind)) pending.kinds.push(kind);
      return;
    }
    queuedButtons.set(player.id, request);
    system.run(() => {
      if (queuedButtons.get(player.id) !== request) return;
      try {
        if (!player.isValid || dead.has(player.id) || !buttonsWanted(player) || !inventoryReady(player)) {
          queuedButtons.delete(player.id);
          return;
        }
        ensureLayout(player);
        pollButtons(player);
      } catch (e) { console.warn(`[stash] ${e}`); }
    });
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
  bumpLife(deadEntity.id);
  buttonState.delete(deadEntity.id);
  snapshots.delete(deadEntity.id);
  queuedButtons.delete(deadEntity.id);
});
world.afterEvents.playerSpawn.subscribe(({ player }) => {
  dead.delete(player.id);
  bumpLife(player.id);
  buttonState.delete(player.id);
  snapshots.delete(player.id);
  queuedButtons.delete(player.id);
});
world.afterEvents.playerDimensionChange.subscribe(({ player }) => bumpLife(player.id));
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  for (const m of [buttonState, snapshots, lastTotal, lastEnforce, backoff, lifeGen]) m.delete(playerId);
  recoveryWarned.delete(playerId);
  dead.delete(playerId);
  queuedButtons.delete(playerId);
  reconciling.delete(playerId);
  menuOpen.delete(playerId);
  moveOpen.delete(playerId);
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

/** How many empty slots this page has, and how many items of each kind. @param {import("@minecraft/server").Container} inv */
function lookAtPage(inv) {
  /** @type {Map<string, number>} */
  const amounts = new Map();
  let empty = 0;
  for (const s of STORAGE_SLOTS) {
    const item = inv.getItem(s);
    if (!item) empty++;
    else if (!isButton(item)) amounts.set(keyOf(item), (amounts.get(keyOf(item)) ?? 0) + item.amount);
  }
  return { empty, amounts };
}

/** @type {string[]} the armor and offhand slots (EquipmentSlot values) */
const WORN = ["Head", "Chest", "Legs", "Feet", "Offhand"];

/**
 * Everything the player carries right now: the page, the hotbar, the cursor and worn equipment, by kind. A stack that
 * merely moves between those (a click, a shift-click, a hotbar swap) leaves this total alone, so only a stack that
 * really came from outside is a pickup.
 * @param {Player} player @param {import("@minecraft/server").Container} inv @param {Map<string, number>} page
 */
function liveTotals(player, inv, page) {
  const live = new Map(page);
  /** @param {ItemStack | undefined} item */
  const add = (item) => {
    if (item && !isButton(item)) live.set(keyOf(item), (live.get(keyOf(item)) ?? 0) + item.amount);
  };
  for (const s of HOTBAR) add(inv.getItem(s));
  try { add(player.getComponent("minecraft:cursor_inventory")?.item); } catch { /* an unreadable cursor counts as empty */ }
  try {
    const worn = player.getComponent("minecraft:equippable");
    if (worn) for (const slot of WORN) add(worn.getEquipment(/** @type {any} */ (slot)));
  } catch { /* no equipment to count */ }
  return live;
}
/** Free slots across every page the player has. @param {Player} player @param {import("@minecraft/server").Container} inv */
function freeEverywhere(player, inv) {
  const total = totalPages(player);
  const cur = curPage(player);
  let free = PAGE_SIZE - usedOnPage(inv);
  for (let p = 1; p <= total; p++) if (p !== cur) free += PAGE_SIZE - Math.min(PAGE_SIZE, savedStacks(player, p) ?? PAGE_SIZE);
  return free;
}

/**
 * How many stacks a saved page holds, from its ref (the slots are checked against the snapshot whenever it loads),
 * so no snapshot is restored for a count. Undefined when the page can't be read.
 * @param {Player} player @param {number} page
 */
function savedStacks(player, page) {
  try {
    const state = stateOf(player);
    const ref = state.pages[page];
    if (ref && !state.pending && Array.isArray(ref.slots)) return ref.slots.length;
  } catch {
    // fall back to reading the page, which reports the problem
  }
  return readPage(player, page)?.length;
}

/** Could a saved page hold this item? False only when the committed index says it holds none; an unknown page may. @param {Player} player @param {number} page @param {string} id */
function mayHold(player, page, id) {
  try {
    const kinds = indexedEntries(stateOf(player), page);
    if (!kinds) return true;
    return kinds.some((k) => k.id === id);
  } catch {
    return true;
  }
}

/**
 * A stack that really arrived on the active page (a pickup, not a click, hotbar swap, cursor drop or armor change)
 * goes to the earliest other page with room, so page 1 fills first, but only while the active page is full or down to
 * one free slot (as before pages were routed), and only until two slots are free again. The pickup is told apart from a move by
 * the total of everything carried (page, hotbar, cursor, worn gear): a kind only counts when that total grew, and
 * only up to that growth. Every page touched is read once and everything is one transaction, so a failure changes
 * nothing, and the look is always refreshed first so a failed attempt is never retried against old numbers.
 * @param {Player} player
 */
function autoStore(player) {
  const inv = invOf(player);
  if (!inv || switching.has(player.id) || queuedButtons.has(player.id) || reconciling.has(player.id)) return;
  const total = totalPages(player);
  const cur = curPage(player);
  const now = lookAtPage(inv);
  const live = liveTotals(player, inv, now.amounts);
  const before = snapshots.get(player.id);
  snapshots.set(player.id, { page: cur, amounts: now.amounts, live });
  if (!before || before.page !== cur || now.empty > 1) return;

  /** @type {Map<string, number>} */
  const gains = new Map();
  for (const [k, n] of now.amounts) {
    const gain = Math.min(n - (before.amounts.get(k) ?? 0), (live.get(k) ?? 0) - (before.live.get(k) ?? 0));
    if (gain > 0) gains.set(k, gain);
  }
  if (!gains.size) return;
  /** @type {number[]} */
  const targets = [];
  for (let p = 1; p <= total; p++) if (p !== cur) targets.push(p);
  if (!targets.length) return;

  /** @type {Map<number, Rec[]>} */
  const edits = new Map();
  /** @type {Map<number, ItemStack | undefined>} */
  const changed = new Map();
  /** @type {Map<number, number>} */
  const perPage = new Map();
  let movedCount = 0;
  let name = "";
  let empty = now.empty;
  for (let i = STORAGE_SLOTS.length - 1; i >= 0 && gains.size && empty < 2; i--) {
    const s = STORAGE_SLOTS[i];
    const item = inv.getItem(s);
    if (!item || isButton(item) || item.lockMode === ItemLockMode.slot) continue;
    const key = keyOf(item);
    const want = gains.get(key);
    if (!want) continue;
    const piece = item.clone();
    piece.amount = Math.min(item.amount, want);
    if (want - piece.amount > 0) gains.set(key, want - piece.amount);
    else gains.delete(key);
    const { rem, moved } = storeOnPages(player, piece, targets, edits, true);
    let n = 0;
    for (const [p, c] of moved) {
      n += c;
      perPage.set(p, (perPage.get(p) ?? 0) + c);
    }
    if (!n) continue;
    const left = item.amount - n;
    if (left > 0) {
      const keep = item.clone();
      keep.amount = left;
      changed.set(s, keep);
    } else {
      changed.set(s, undefined);
      empty++;
    }
    movedCount += n;
    name = item.nameTag ?? pretty(item.typeId);
    void rem;
  }
  if (!movedCount) return;
  const after = carried(inv).filter((e) => !changed.has(e.s));
  for (const [s, item] of changed) if (item) after.push({ s, item });
  try {
    commitPages(player, edits, after);
  } catch (e) {
    console.warn(`[stash] auto-store: ${e}`);
    snapshots.delete(player.id); // the next look is a fresh baseline, so this pickup is never retried as new
    hooks.bar(player, "§cAuto-store could not move your pickup. Nothing changed");
    return;
  }
  const look = lookAtPage(inv);
  snapshots.set(player.id, { page: cur, amounts: look.amounts, live: liveTotals(player, inv, look.amounts) });
  const dest = [...perPage.entries()].sort((a, b) => a[0] - b[0]).sort((a, b) => b[1] - a[1])[0][0];
  hooks.bar(player, `§8[§bPage #${dest}§8] §7Auto-stored §f${movedCount}x ${name} §7(${freeEverywhere(player, inv)} slots left)`);
}

/**
 * Manual "Fill earlier pages": every page after page 1, hidden or active, pours into the pages before it. Source pages go
 * in order (2, 3, ...), each source stack in slot order and unsorted, into the earliest earlier page that can take it
 * (matching stacks first, then a free slot, destination by destination). The hotbar, cursor, buttons and slot-locked
 * stacks stay; what doesn't fit stays. Everything, the active page included, is one transaction like every page edit,
 * so a failure changes nothing. Works with auto-store disabled.
 * @param {Player} player
 * @returns {{ ok: true, stacks: number, items: number, left: number } | { ok: false, message: string }}
 */
export function fillEarlierPages(player) {
  const id = player.id;
  const inv = invOf(player);
  if (!inv || !alive(player)) return { ok: false, message: "You can't move items right now" };
  if (switching.has(id)) return { ok: false, message: "Another inventory change is still running. Try again in a moment" };
  try {
    if (stateOf(player).pending) return { ok: false, message: "Inventory recovery is safely saved and needs an operator" };
    ensureLayout(player);
  } catch (e) {
    return { ok: false, message: `Items not moved: ${e}` };
  }
  switching.add(id);
  try {
    const cur = curPage(player);
    const total = totalPages(player);
    if (total <= 1 || cur > total) return { ok: false, message: "There is no earlier page to fill" };
    /** @type {Map<number, Rec[]>} */
    const edits = new Map();
    /** @type {(Rec & { fixed?: boolean })[]} the live page as records, so it can be a destination too; slot-locked stacks can't be merged into */
    const live = [];
    /** @type {Map<number, number>} */
    const liveWas = new Map();
    for (const s of STORAGE_SLOTS) {
      const item = inv.getItem(s);
      if (!item || isButton(item)) continue;
      liveWas.set(s, item.amount);
      const fixed = item.lockMode === ItemLockMode.slot;
      live.push({ s, ...toRecord(item), n: fixed ? Number.MAX_SAFE_INTEGER : item.amount, fixed });
    }
    if (cur < total) edits.set(cur, live);
    let stacks = 0;
    let items = 0;
    let left = 0;
    for (let p = 2; p <= total; p++) {
      /** @type {Rec[] | undefined} */
      let source;
      if (p === cur) source = live;
      else {
        if (!stateOf(player).pages[p] && player.getDynamicProperty(PAGE_PROP + p) === undefined) continue;
        source = edits.get(p) ?? readPage(player, p);
        if (!source) return { ok: false, message: `Page ${p} can't be read. Nothing was moved` };
      }
      const earlier = Array.from({ length: p - 1 }, (_, i) => i + 1);
      const kept = [];
      let touched = false;
      for (const rec of [...source].sort((a, b) => a.s - b.s)) {
        const stackItem = /** @type {Rec & { fixed?: boolean }} */ (rec).fixed ? undefined : deserializeStack(rec);
        if (!stackItem || stackItem.lockMode === ItemLockMode.slot) {
          kept.push(rec);
          continue;
        }
        const { rem } = storeOnPages(player, stackItem, earlier, edits, true);
        const n = rec.n - (rem?.amount ?? 0);
        left += rem?.amount ?? 0;
        if (n) {
          stacks++;
          items += n;
          touched = true;
          rec.n -= n;
        }
        if (rec.n > 0) kept.push(rec);
      }
      if (touched && p !== cur) edits.set(p, kept);
    }
    if (!items) return { ok: false, message: "Nothing fit on the earlier pages. Nothing was moved" };
    edits.delete(cur);
    /** @type {Map<number, ItemStack | undefined>} */
    const changed = new Map();
    const liveNow = new Set();
    for (const rec of live) {
      liveNow.add(rec.s);
      if (/** @type {Rec & { fixed?: boolean }} */ (rec).fixed || rec.n === liveWas.get(rec.s)) continue;
      changed.set(rec.s, rec.n > 0 ? deserializeStack(rec) : undefined);
    }
    for (const s of liveWas.keys()) if (!liveNow.has(s)) changed.set(s, undefined);
    const after = carried(inv).filter((e) => !changed.has(e.s));
    for (const [s, item] of changed) if (item) after.push({ s, item });
    try {
      commitPages(player, edits, after, cur);
    } catch (e) {
      console.warn(`[stash] filling earlier pages: ${e}`);
      return { ok: false, message: `Items not moved: ${e}` };
    }
    snapshots.delete(id); // our own move, not a pickup
    return { ok: true, stacks, items, left };
  } catch (e) {
    console.warn(`[stash] filling earlier pages: ${e}`);
    return { ok: false, message: `Items not moved: ${e}` };
  } finally {
    switching.delete(id);
  }
}
/**
 * Hotbar Refill ran out of a stack and found none like it on this page (realm:refill_need): the fullest stack like it on
 * another page goes into the empty hotbar slot. "Like it": the same item, name and lore, as Hotbar Refill matches them.
 * Not for items whose kind hides data the API can't compare (an arrow's potion, a banner's pattern),
 * and not for a player who just died (the stack would drop with the death loot).
 * @param {Player} player @param {number} slot hotbar slot 0-8 @param {{ id: string, name?: string, sameLore: (lore: string[]) => boolean }} want
 * @returns {{ n: number, page: number } | undefined} what came, from where
 */
export function refillFromPages(player, slot, want) {
  const inv = invOf(player);
  if (!inv || dead.has(player.id) || HIDDEN_DATA.test(want.id) || switching.has(player.id) || !inventoryReady(player) || !HOTBAR.includes(slot) || inv.getItem(slot)) return undefined;
  const total = totalPages(player);
  const cur = curPage(player);
  /** @type {{ page: number, entries: Rec[], k: number, n: number } | undefined} */
  let best;
  for (let p = 1; p <= total; p++) {
    if (p === cur || !mayHold(player, p, want.id)) continue;
    const entries = readPage(player, p);
    if (!entries) continue;
    entries.forEach((e, k) => {
      if (e.id !== want.id || (e.name ?? undefined) !== (want.name ?? undefined)) return;
      const item = deserializeStack(e);
      if (!item || item.lockMode !== ItemLockMode.none || !want.sameLore(item.getLore())) return;
      if (!best || e.n > best.n) best = { page: p, entries, k, n: e.n };
    });
  }
  if (!best) return undefined;
  const { page, entries, k, n } = best;
  const item = deserializeStack(entries[k]);
  if (!item) return undefined;
  commitPages(player, new Map([[page, entries.filter((_, i) => i !== k)]]), [...carried(inv), { s: slot, item }]);
  return { n, page };
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
  ensureLayout(player);
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
  if (total > 1 && withAutoStore) {
    if (getFor(player, "autoStore") !== false) autoStore(player);
    else snapshots.delete(player.id); // what arrived while it was off is not new when it is turned back on
  }
}

/** @type {Map<string, { until: number, text: string, logged: number }>} a player whose last tick failed waits before the next try */
const backoff = new Map();
/** Ticks a failed player waits (a page save that can't stage here retries when they move), and how often the same warning repeats. */
const RETRY_TICKS = 40;
const WARN_TICKS = 1200;

/**
 * When each player's inventory (or a setting of this pack) last changed. A player whose inventory changed
 * in the last second is looked at every 2 ticks (button clicks, and every 10 ticks pickups to auto-store);
 * a quiet one every 5 s, spread over the ticks, without the page scan, which a quiet inventory can't need
 * (that runs every 25 s anyway, in case an event was missed). A look costs 0.1 to 0.4 ms, so idle players
 * have to be looked at rarely.
 * @type {Map<string, number>}
 */
const changedAt = new Map();
const ACTIVE_TICKS = 20;
world.afterEvents.playerInventoryItemChange?.subscribe(({ player }) => {
  if (player) changedAt.set(player.id, system.currentTick);
});
world.afterEvents.playerSpawn.subscribe(({ player }) => changedAt.set(player.id, system.currentTick));
world.afterEvents.playerLeave.subscribe(({ playerId }) => changedAt.delete(playerId));
// A new page count or button choice shows at once, not at the next quiet look.
onChange((key, player) => {
  const now = system.currentTick;
  if (player) changedAt.set(player.id, now);
  else for (const p of world.getAllPlayers()) changedAt.set(p.id, now);
});

/** Beats (2 ticks each) between looks at a quiet player, and between a quiet player's page scans. */
const QUIET_BEATS = 50;
const QUIET_SCAN_BEATS = 250;

let beat = 0;
system.runInterval(() => {
  ++beat;
  const now = system.currentTick;
  let i = 0;
  for (const player of world.getAllPlayers()) {
    const turn = (beat + i++) % QUIET_BEATS === 0;
    const wait = backoff.get(player.id);
    if (wait && now < wait.until) continue;
    const active = now - (changedAt.get(player.id) ?? -Infinity) <= ACTIVE_TICKS || !buttonState.has(player.id);
    if (!active && !turn) continue;
    const withAutoStore = active ? beat % 5 === 0 : (beat + i - 1) % QUIET_SCAN_BEATS === 0;
    try {
      tickPlayer(player, withAutoStore);
      if (wait) backoff.delete(player.id);
    } catch (e) {
      const text = String(e);
      const repeat = wait?.text === text && now - wait.logged < WARN_TICKS;
      if (!repeat) console.warn(`[stash] ${text}`);
      backoff.set(player.id, { until: now + RETRY_TICKS, text, logged: repeat && wait ? wait.logged : now });
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
/** @type {Set<string>} players with the Move to page menu open, so a second one doesn't stack on it */
const moveOpen = new Set();

/**
 * Shows a form, retrying while another screen (the inventory, chat) is still open.
 * @template R @param {Player} player
 * @param {{ show: (p: Player) => Promise<R> } | (() => { show: (p: Player) => Promise<R> } | undefined)} form
 * @param {number} [attempts] one a second
 * @returns {Promise<R | undefined>}
 */
async function showForm(player, form, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (!player.isValid) return undefined;
    const current = typeof form === "function" ? form() : form;
    if (!current) return undefined;
    const res = /** @type {any} */ (await current.show(player));
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
  for (let p = 1; p <= total; p++) usage.push(p === cur ? usedOnPage(inv) : Math.min(PAGE_SIZE, savedStacks(player, p) ?? 0));
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
  const state = stateOf(player);
  for (let p = 1; p <= total; p++) {
    const kinds = indexedEntries(state, p);
    if (kinds) {
      for (const { id, name, n } of kinds) add(`${id}|${name ?? ""}`, name ?? pretty(id), n, p);
      continue;
    }
    for (const e of readPage(player, p) ?? []) add(`${e.id}|${e.name ?? ""}`, e.name ?? pretty(e.id), e.n, p);
  }
  return [...found.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Build display and action indices together from the currently committed inventory. @param {Player} player */
function inventoryMenu(player) {
  if (player.isValid) {
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
      {
        form.button("Fill earlier pages\n§8Pull every later page's stacks into free space on earlier pages");
        actions.push(() => {
          const r = fillEarlierPages(player);
          player.sendMessage(r.ok ? `§aMoved ${r.items} items (${r.stacks} stacks) to earlier pages${r.left ? `; ${r.left} did not fit and stayed here` : ""}.` : `§c${r.message}`);
        });
      }
      form.button("Move to page\n§8Send a stack or a whole row to another page");
      actions.push(() => openMoveMenu(player).catch((e) => console.warn(`[stash] ${e}`)));
    }
    form.button("Sort this page\n§8Merge stacks, order by item");
    actions.push(() => hooks.sort(player));
    form.button("Quick stack to nearby chests\n§8Into storage holding the same items");
    actions.push(() => hooks.stash(player));
    form.button("Inventory settings\n§8Page buttons, auto-store" + (isOp(player) ? ", your page count" : ""));
    actions.push(() => settingsMenu(player).catch((e) => console.warn(`[stash] ${e}`)));

    return { form, actions };
  }
}

/** @param {Player} player */
export async function openInvMenu(player) {
  if (menuOpen.has(player.id)) return;
  menuOpen.add(player.id);
  try {
    /** @type {(() => void)[]} */
    let actions = [];
    const res = await showForm(player, () => {
      const current = inventoryMenu(player);
      actions = current?.actions ?? [];
      return current?.form;
    });
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

/** One line a button can show for a stack. @param {ItemStack} item */
const stackLabel = (item) => `${(item.nameTag ?? pretty(item.typeId)).replace(/\s+/g, " ").slice(0, 32)} x${item.amount}`;
/** @param {number} n @param {string} one */
const plural = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * Move to page: choose a stack or a whole row of the page being shown, then another page. The move is one
 * transferStacks call at the end, after every await has been checked again: the player must be alive, in the same
 * life (no death, respawn, leaving or dimension change since the menu opened) and still on the same page, and the
 * stacks must be the ones that were listed. A page that filled up meanwhile refuses the whole row.
 * @param {Player} player
 */
export async function openMoveMenu(player) {
  if (moveOpen.has(player.id)) return;
  moveOpen.add(player.id);
  try {
    await moveMenu(player);
  } catch (e) {
    console.warn(`[stash] move to page: ${e}`);
    if (alive(player)) hooks.bar(player, `§cMove to page isn't available: ${e}`);
  } finally {
    moveOpen.delete(player.id);
  }
}

/** @param {Player} player */
async function moveMenu(player) {
  const life = lifeOf(player);
  const here = () => alive(player) && lifeOf(player) === life;
  const inv = invOf(player);
  if (!inv || !here()) return;
  try {
    ensureLayout(player);
  } catch (e) {
    hooks.bar(player, `§cItems not moved: ${e}`);
    return;
  }
  const total = totalPages(player);
  const cur = curPage(player);
  if (total < 2 || cur > total) {
    hooks.bar(player, "§7You only have one page");
    return;
  }

  // What the page holds right now, with the signature each stack has while the menu is open.
  /** @type {{ slot: number, item: ItemStack, sig: string, row: number, spot: number }[]} */
  const stacks = [];
  ROWS.forEach((slots, r) =>
    slots.forEach((slot, i) => {
      const item = inv.getItem(slot);
      if (item && !isButton(item)) stacks.push({ slot, item, sig: signature(item), row: r + 1, spot: i + 1 });
    })
  );
  if (!stacks.length) {
    hooks.bar(player, "§7Nothing on this page to move");
    return;
  }
  const sigs = new Map(stacks.map((s) => [s.slot, s.sig]));

  for (;;) {
    const what = new ActionFormData()
      .title("§lMove to page")
      .body(`Page #${cur} of ${total}\nChoose a stack or a whole row. It goes to the page you pick next, whole, or nothing moves.\n§7The hotbar and the page buttons never move.`);
    /** @type {number[][]} the slots each button stands for; the last button is Back */
    const choices = [];
    ROWS.forEach((_, r) => {
      const own = stacks.filter((s) => s.row === r + 1);
      if (!own.length) return;
      what.button(`Whole row ${r + 1}: ${plural(own.length, "stack")}\n§8${own.reduce((n, s) => n + s.item.amount, 0)} items`);
      choices.push(own.map((s) => s.slot));
    });
    for (const s of stacks) {
      what.button(`${stackLabel(s.item)}\n§8Row ${s.row}, spot ${s.spot}`);
      choices.push([s.slot]);
    }
    what.button("Back");
    const picked = await showForm(player, what, 3);
    if (!picked || picked.canceled || picked.selection === undefined || !here()) return;
    const slots = choices[picked.selection];
    if (!slots) {
      openInvMenu(player).catch((e) => console.warn(`[stash] ${e}`));
      return;
    }

    /** @type {number[]} */
    const targets = [];
    const where = new ActionFormData().title("§lMove to which page?").body(`Moving ${plural(slots.length, "stack")} from Page #${cur}. A page that can't take all of it refuses the move, and nothing changes.`);
    for (let p = 1; p <= total; p++) {
      if (p === cur) continue;
      const held = savedStacks(player, p);
      where.button(`Page #${p}\n§8${held === undefined ? "can't be read" : `${PAGE_SIZE - held} of ${PAGE_SIZE} slots free`}`);
      targets.push(p);
    }
    where.button("Back");
    const chosen = await showForm(player, where, 3);
    if (!chosen || chosen.canceled || chosen.selection === undefined || !here()) return;
    const to = targets[chosen.selection];
    if (to === undefined) continue;

    if (curPage(player) !== cur) {
      hooks.bar(player, "§cYour page changed. Open Move to page again");
      return;
    }
    const result = transferStacks(player, { from: cur, slots, to, expect: new Map(slots.map((s) => [s, sigs.get(s) ?? ""])), reason: "manual" });
    hooks.bar(player, result.ok ? `§aMoved ${plural(result.stacks, "stack")} (${result.items} items) to Page #${to}` : `§c${result.message}`);
    return;
  }
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

/** At most this many lines of the export list go into the confirm form; the rest are summed up in one line. */
const RECOVER_LINES = 18;

/**
 * Operator recovery for a stuck inventory journal: the operator sees exactly what will be exported (only what the
 * player no longer carries from the saved before-image) and confirms; the plan is computed again on submit and must be
 * the same (the player's inventory or the journal may have changed meanwhile), and only then is the export run. The
 * form is retried while the operator's chat is still closing (UserBusy).
 * @param {Player} operator @param {Player} target
 * @returns {Promise<string>}
 */
export async function recoverInventory(operator, target) {
  const own = (/** @type {{ s: number, item: ItemStack | undefined }} */ e) => BUTTON_SLOTS.includes(e.s) && isButton(e.item);
  if (!alive(operator) || !isOp(operator)) return "Only an operator who is here and healthy can recover an inventory.";
  const first = pendingSummary(target, own);
  if (!first) return `${target.name} has nothing waiting for recovery.`;
  if (!alive(target)) return `${target.name} is not alive right now; run it again once they have respawned. Nothing changed.`;
  if (first.error) return `The saved images could not be read, nothing changed (${first.error}).`;
  /** @param {{ id: string, name: string | undefined, n: number }} l */
  const line = (l) => `- ${l.n} x ${l.name ? `${l.name} (${pretty(l.id)})` : pretty(l.id)}`;
  const list = first.lines.slice(0, RECOVER_LINES).map(line);
  if (first.lines.length > RECOVER_LINES) list.push(`- and ${first.lines.length - RECOVER_LINES} more stacks`);
  const changed = first.changed.slice(0, RECOVER_LINES).map(line);
  if (first.changed.length > RECOVER_LINES) changed.push(`- and ${first.changed.length - RECOVER_LINES} more`);
  let body = first.items
    ? `${target.name}'s inventory move did not finish. Of the ${first.kept} stacks in their saved before-image, these ${first.items} are no longer in their inventory:\n` +
      `${list.join("\n")}\n` +
      `Confirming puts them into ${first.chests} chest(s) on empty floor next to you, then clears the journal. Stacks they still carry (inventory, cursor, armor and offhand) are not copied, and their inventory is not touched. ` +
      `Anything they dropped or put in a chest since counts as missing: check with them first.` +
      (first.started ? "\nThis export was already started: only the stacks not yet placed are listed, and it must be finished in the dimension where it began." : "")
    : `${target.name}'s inventory move did not finish, but they still carry everything in their saved before-image${first.changed.length ? " except the items below" : ""}. Confirming exports nothing and clears the journal.`;
  if (first.changed.length) {
    body +=
      `\n\nThey carry an item of the same type as each of these, but it was used, renamed, enchanted or dyed since, so it may be the same item or a new one:\n` +
      `${changed.join("\n")}\n` +
      `These are not exported unless you choose "Also export the changed items" (if they are the same items, that makes a second copy: check with them first).`;
  }
  const form = new ActionFormData()
    .title("§lRecover inventory")
    .body(body)
    .button(first.items ? "§cExport to chests" : "§cClear the journal");
  if (first.changed.length) form.button(`§cAlso export the changed items (${first.chestsWithChanged} chest(s))`);
  form.button("Cancel");
  const res = /** @type {any} */ (await showForm(operator, form, 20));
  const choices = first.changed.length ? 2 : 1;
  if (!res || res.canceled || typeof res.selection !== "number" || res.selection >= choices) return "Canceled, nothing changed.";
  const withChanged = res.selection === 1;
  if (!alive(operator) || !isOp(operator) || !alive(target)) return "The operator or the player is no longer available; nothing was exported. Run it again.";
  const again = pendingSummary(target, own);
  if (!again || again.key !== first.key) return "The journal or the player's inventory changed while you were deciding; nothing was exported. Run it again.";
  return exportPending(operator, target, own, withChanged).message;
}
