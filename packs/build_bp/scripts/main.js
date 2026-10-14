import {
  BlockPermutation,
  BlockTypes,
  CommandPermissionLevel,
  CustomCommandStatus,
  Dimension,
  GameMode,
  ItemStack,
  Player,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, getFor, setFor } from "./settings.js";
import { PARAMS, SHAPES, TooBig, boxOf, cellsJob, curveCells, shapeOf, valueOf } from "./shapes.js";
import { allZones } from "./zones.js";
import { drawBox, drawGuide, forgetGuides, guideRate, outlineJob } from "./guides.js";
import { DEFAULT_MODS, applyMods, applyModsJob, modsLabel, modsOn, needsCenter, normalizeMods } from "./modifiers.js";
import { DEFAULT_PALETTE, DIRS, DIR_NAMES, FROM, FROM_NAMES, PATTERNS, PATTERN_NAMES, normalizePalette, paletteLabel, picker } from "./palette.js";
import { lastLabel, remember, setupUndo, undo } from "./undo.js";
import { clipboardMenu, copyCommand, cutCommand, isPasting, isSelecting, pasteCommand, setupClipboard } from "./clipboard.js";
import { destroyMenu, isDestroying, setupDestroy, toggleDestroy } from "./destroy.js";

const PACK = "build_bp";
const PLAN_PROP = "build:plan"; // player: JSON Plan
const OWED_PROP = "build:owed"; // world: items owed to players who left mid-build (see refund)
const TITLE = "Easy Building";
const HINT_TICKS = 30;

/**
 * What a player has set up: the shape, its settings (each shape remembers its own) and how it is placed.
 * @typedef {object} Plan
 * @property {string} shape
 * @property {Record<string, import("./shapes.js").Values>} values
 * @property {"menu" | "points"} size
 * @property {"hand" | "mix" | "typed"} src
 * @property {string} block typed main block id
 * @property {"next" | "none" | "typed"} second
 * @property {string} secondBlock
 * @property {"air" | "soft" | "all"} replace
 * @property {"front" | "center" | "corner"} anchor
 * @property {number} up
 * @property {boolean} turn
 * @property {"none" | "lr" | "fb" | "both" | "radial"} copies
 * @property {number} repeat
 * @property {number} gap
 * @property {"away" | "right" | "up"} repeatDir
 * @property {import("./modifiers.js").Mods} mods mirror, radial and array (world axes, around a center)
 * @property {import("./palette.js").Palette} palette where the palette's blocks come from and how they are spread
 */

/** @type {Plan} */
const DEFAULT_PLAN = {
  shape: "wall",
  values: {},
  size: "menu",
  src: "hand",
  block: "minecraft:stone_bricks",
  second: "next",
  secondBlock: "",
  replace: "soft",
  anchor: "front",
  up: 0,
  turn: false,
  copies: "none",
  repeat: 1,
  gap: 1,
  repeatDir: "away",
  mods: DEFAULT_MODS,
  palette: DEFAULT_PALETTE,
};

const BOOK = "realm:building_book";
/** Most points a curve can go through. */
const MAX_POINTS = 32;

const SRC = ["hand", "mix", "typed"];
const SRC_NAMES = ["The block you place (or hold)", "Your palette (hotbar blocks by default; see Palette)", "The block id typed below"];
const SECOND = ["next", "none", "typed"];
const SECOND_NAMES = ["The block in the hotbar slot right of your hand", "None (the main block)", "The block id typed below"];
const REPLACE = ["air", "soft", "all"];
const REPLACE_NAMES = ["Air only", "Air and soft blocks (water, grass, flowers, snow)", "Everything but chests and other protected blocks"];
const ANCHOR = ["front", "center", "corner"];
const ANCHOR_NAMES = ["Starts at the block, centered", "Centered on the block", "Corner at the block (goes away and right)"];
const COPIES = ["none", "lr", "fb", "both", "radial"];
const COPIES_NAMES = ["None", "Mirror left-right", "Mirror front-back", "Mirror both ways (4)", "Turned around the block (4)"];
const REPEAT_DIR = ["away", "right", "up"];
const REPEAT_DIR_NAMES = ["Away from you", "To the right", "Up"];

/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
/** @param {Player} player */
const isCreative = (player) => player.getGameMode() === GameMode.Creative;
/** Adventure and spectator players can't place or break blocks, so the tools don't either. @param {Player} player */
const cantBuild = (player) => {
  const mode = player.getGameMode();
  return mode === GameMode.Adventure || mode === GameMode.Spectator;
};
const CANT_BUILD = "§eThe building tools don't work in adventure or spectator mode.";

/** @param {string[]} globs */
const matcher = (globs) => {
  const res = globs.map((g) => new RegExp(`^${g.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")}$`));
  return (/** @type {string} */ id) => res.some((re) => re.test(id));
};
const isSoft = matcher(CONFIG.softBlocks);
const isProtectedBlock = matcher(CONFIG.protectedBlocks);
const isForbidden = matcher(CONFIG.forbiddenBlocks);

/** "minecraft:oak_planks" -> "oak planks" @param {string} id */
const nice = (id) => id.replace(/^minecraft:/, "").replaceAll("_", " ");
/** Blocks a ladder or lantern can't hang on. */
const NOT_FULL = /(_stairs|_slab|fence|_wall|_pane|_gate|door|carpet|glass|leaves|lantern|torch|chain|bars|^minecraft:air)$/;
/** @param {number} n @param {string} one @param {string} [many] */
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// Per-player state (memory only)
// ---------------------------------------------------------------------------

/**
 * Undo and redo history lives in undo.js.
 * @typedef {import("./undo.js").Placed} Placed
 * @typedef {{ on: boolean, start?: { dim: string, x: number, y: number, z: number, id: string, paid?: string }, way?: { dim: string, pts: { x: number, y: number, z: number }[] }, busy: boolean, paused: number, hintAt: number, usedAt: number, bookAt: number }} State
 */

/** @type {Map<string, State>} */
const states = new Map();
/** @param {Player} player @returns {State} */
function stateOf(player) {
  let s = states.get(player.id);
  if (!s) states.set(player.id, (s = { on: false, busy: false, paused: 0, hintAt: 0, usedAt: -99, bookAt: -99 }));
  return s;
}

/** @param {Player} player @returns {Plan} */
function planOf(player) {
  let raw;
  try {
    raw = player.getDynamicProperty(PLAN_PROP);
  } catch {
    raw = undefined;
  }
  /** @type {any} */
  let p = {};
  try {
    p = typeof raw === "string" ? JSON.parse(raw) : {};
  } catch {
    p = {};
  }
  /** @type {any} */
  const plan = { ...DEFAULT_PLAN, values: {} };
  if (p && typeof p === "object") {
    for (const k of Object.keys(DEFAULT_PLAN)) {
      /** @type {any} */
      const def = /** @type {any} */ (DEFAULT_PLAN)[k];
      if (k === "values") plan.values = p.values && typeof p.values === "object" ? p.values : {};
      else if (typeof p[k] === typeof def) plan[k] = p[k];
    }
  }
  if (!SHAPES.some((s) => s.id === plan.shape)) plan.shape = DEFAULT_PLAN.shape;
  if (!["menu", "points"].includes(plan.size)) plan.size = "menu";
  if (!SRC.includes(plan.src)) plan.src = "hand";
  if (!SECOND.includes(plan.second)) plan.second = "next";
  if (!REPLACE.includes(plan.replace)) plan.replace = "soft";
  if (!ANCHOR.includes(plan.anchor)) plan.anchor = "front";
  if (!COPIES.includes(plan.copies)) plan.copies = "none";
  if (!REPEAT_DIR.includes(plan.repeatDir)) plan.repeatDir = "away";
  plan.mods = normalizeMods(p?.mods);
  plan.palette = normalizePalette(p?.palette);
  return plan;
}

/** @param {Player} player @param {Plan} plan */
function savePlan(player, plan) {
  player.setDynamicProperty(PLAN_PROP, JSON.stringify(plan));
  layoutCache.delete(player.id);
}

/** A shape setting, kept within the realm's limits. @param {Plan} plan @param {string} key */
function val(plan, key) {
  const v = valueOf(plan.shape, plan.values[plan.shape], key);
  const p = PARAMS[key];
  if (p?.type !== "int" || typeof v !== "number") return v;
  const size = get("maxSize");
  const max = p.max === "size" ? size : p.max === "half" ? Math.max(1, Math.floor(size / 2)) : p.max ?? size;
  return Math.max(p.min ?? 1, Math.min(max, Math.round(v)));
}

/** "Wall 5 x 3 x 1" @param {Plan} plan */
function planLabel(plan) {
  const s = shapeOf(plan.shape);
  if (s.way) return `${s.name} (through points)`;
  if (plan.size === "points" && s.points) return `${s.name} (between two blocks)`;
  const { W, H, D } = boxOf(plan.shape, (k) => val(plan, k));
  return `${s.name} ${W} x ${H} x ${D}`;
}

/** A note above the hotbar that a menu also shows at its top (the menu hides the hotbar). @param {Player} player @param {string} text */
const noted = (player, text) => (note(player, text), text);

/** A note above the hotbar; `realm:actionbar` first, so the HUD and other lines wait. @param {Player} player @param {string} text */
function note(player, text, ticks = 60) {
  system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: player.id, ticks, from: PACK }));
  player.onScreenDisplay.setActionBar(text);
  const s = stateOf(player);
  s.paused = Math.max(s.paused, system.currentTick + ticks);
}

/** Why this player can't use the tools now, or undefined. @param {Player} player */
function refusal(player) {
  if (get("enabled") !== true) return "Easy Building is disabled on this realm. An operator can enable it in /realm:config (Easy Building).";
  if (get("operatorsOnly") === true && !isOp(player)) return "Only operators can use the building tools on this realm.";
  return undefined;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

/** @type {Map<string, BlockPermutation | null>} */
const permCache = new Map();
/** A block by id, or undefined if there is no such block. @param {string} id */
function permOf(id) {
  const full = id.includes(":") ? id : `minecraft:${id}`;
  if (!permCache.has(full)) {
    let p = null;
    try {
      p = BlockPermutation.resolve(full);
    } catch {
      p = null;
    }
    permCache.set(full, p);
  }
  return permCache.get(full) ?? undefined;
}

/** The block an item places, if it is a block item. @param {ItemStack | undefined} item */
function blockOfItem(item) {
  if (!item) return undefined;
  const perm = permOf(item.typeId);
  if (!perm) return undefined;
  try {
    if (perm.getItemStack(1)?.typeId !== item.typeId) return undefined;
  } catch {
    return undefined;
  }
  return perm;
}

/** States that count blocks stacked into one spot, and their value for a single one. */
const STACKS = { height: 0, cluster_count: 0, candles: 0, turtle_egg_count: "one_egg", growth: 0 };
const STACKERS = /(snow_layer|sea_pickle|candle|turtle_egg|pink_petals|wildflowers|leaf_litter)$/;
/** Was this block placed onto one already there (a double slab, a second candle...)? @param {BlockPermutation} perm */
function stacked(perm) {
  const id = perm.type.id;
  if (id.includes("double_slab")) return true;
  if (!STACKERS.test(id)) return false;
  for (const [state, one] of Object.entries(STACKS)) {
    const v = perm.getState(/** @type {any} */ (state));
    if (v !== undefined && v !== one) return true;
  }
  return false;
}

/** @param {BlockPermutation} perm */
const isStair = (perm) => perm.getState("weirdo_direction") !== undefined && perm.type.id.endsWith("_stairs");

/**
 * The item a block costs in survival: `null` free, undefined can't be paid for.
 * @param {BlockPermutation} perm @returns {string | null | undefined}
 */
function costOf(perm) {
  const id = perm.type.id;
  if (id === "minecraft:water") return null;
  if (id === "minecraft:farmland") return "minecraft:dirt";
  // A double slab's item is one slab, but it breaks into two: building them for one each would make slabs.
  if (id.includes("double_slab")) return undefined;
  // The top half of a door or tall plant comes with its bottom half (pastes, undo of destroy mode).
  if (perm.getState("upper_block_bit") === true) return null;
  try {
    return perm.getItemStack(1)?.typeId;
  } catch {
    return undefined;
  }
}

/** World direction [x, z] -> stair `weirdo_direction` (the side its tall back is on). @param {number[]} d */
const weirdo = (d) => (d[0] > 0 ? 0 : d[0] < 0 ? 1 : d[1] > 0 ? 2 : 3);
/** @param {number[]} d */
const cardinal = (d) => (d[0] > 0 ? "east" : d[0] < 0 ? "west" : d[1] > 0 ? "south" : "north");
/** Ladder facing_direction: the way it faces (2 north, 3 south, 4 west, 5 east). @param {number[]} d */
const ladderFacing = (d) => (d[0] > 0 ? 5 : d[0] < 0 ? 4 : d[1] > 0 ? 3 : 2);

/** A fence gate to match a fence (oak without a match). @param {BlockPermutation} main */
function gateFor(main) {
  const id = main.type.id;
  if (id === "minecraft:oak_fence") return "minecraft:fence_gate";
  const m = /^(.+)_fence$/.exec(id);
  if (m && BlockTypes.get(`${m[1]}_fence_gate`)) return `${m[1]}_fence_gate`;
  return "minecraft:fence_gate";
}

/** @param {BlockPermutation} perm @param {string} state @param {string | number | boolean} value */
function withState(perm, state, value) {
  try {
    return perm.withState(/** @type {any} */ (state), value);
  } catch {
    return perm;
  }
}

/** @param {Player} player */
const containerOf = (player) => player.getComponent("minecraft:inventory")?.container;

/**
 * The palette's blocks: block items in the hotbar, the rest of the inventory or both, one entry per slot, in slot
 * order, each with how many of that item the player has in all.
 * @param {Player} player @param {"hotbar" | "inventory" | "both"} from
 * @returns {import("./palette.js").Entry[]}
 */
function paletteBlocks(player, from) {
  const c = containerOf(player);
  if (!c) return [];
  const have = countItems(player);
  const out = [];
  const lo = from === "inventory" ? 9 : 0, hi = from === "hotbar" ? 9 : c.size;
  for (let i = lo; i < hi; i++) {
    const item = c.getItem(i);
    const perm = blockOfItem(item);
    if (!perm || !item || isForbidden(perm.type.id)) continue;
    out.push({ perm, item: item.typeId, slot: i, count: have.get(item.typeId) ?? 0 });
  }
  return out;
}

/** How many of each item a player carries. @param {Player} player */
function countItems(player) {
  /** @type {Map<string, number>} */
  const have = new Map();
  const c = containerOf(player);
  if (!c) return have;
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (it) have.set(it.typeId, (have.get(it.typeId) ?? 0) + it.amount);
  }
  return have;
}

/** Has the player named this stack or given it lore? Those are used last. @param {ItemStack} it */
const special = (it) => {
  try {
    return it.nameTag !== undefined || it.getLore().length > 0;
  } catch {
    return false;
  }
};

/** Takes up to n of an item from the inventory (hotbar last, named stacks after plain ones). @param {Player} player @param {string} id @param {number} n */
function takeItems(player, id, n) {
  const c = containerOf(player);
  if (!c || n <= 0) return 0;
  let taken = 0;
  const order = [];
  for (let i = 9; i < c.size; i++) order.push(i);
  for (let i = 0; i < 9; i++) order.push(i);
  /** @type {number[]} */
  const last = [];
  for (const i of order) {
    const it = c.getItem(i);
    if (it?.typeId === id && special(it)) last.push(i);
  }
  for (const i of [...order.filter((i) => !last.includes(i)), ...last]) {
    if (taken >= n) break;
    const it = c.getItem(i);
    if (!it || it.typeId !== id) continue;
    const take = Math.min(it.amount, n - taken);
    taken += take;
    if (take === it.amount) c.setItem(i);
    else {
      it.amount -= take;
      c.setItem(i, it);
    }
  }
  return taken;
}

/** Gives items back; what doesn't fit drops at the player's feet. @param {Player} player @param {Map<string, number>} items */
function giveItems(player, items) {
  const c = containerOf(player);
  for (const [id, total] of items) {
    let left = total;
    while (left > 0) {
      let stack;
      try {
        stack = new ItemStack(id, 1);
      } catch {
        break;
      }
      stack.amount = Math.min(left, stack.maxAmount);
      left -= stack.amount;
      // addItem returns what didn't fit, or undefined when all of it did (`?? stack` here would drop a copy).
      const rest = c ? c.addItem(stack) : stack;
      if (rest) {
        try {
          player.dimension.spawnItem(rest, player.location);
        } catch {
          // nowhere to drop it
        }
      }
    }
  }
}

/**
 * Items a build or undo owes a player who left before getting them, given back when they next join.
 * World property `build:owed`: JSON { [playerId]: { [itemId]: count } }.
 * @param {Player} player @param {string} pid the player's id (read before they could leave) @param {Map<string, number>} items
 */
function refund(player, pid, items) {
  if (!items.size) return;
  if (player.isValid) return giveItems(player, items);
  try {
    const raw = world.getDynamicProperty(OWED_PROP);
    /** @type {Record<string, Record<string, number>>} */
    const owed = typeof raw === "string" ? JSON.parse(raw) : {};
    const mine = (owed[pid] ??= {});
    for (const [id, n] of items) mine[id] = (mine[id] ?? 0) + n;
    world.setDynamicProperty(OWED_PROP, JSON.stringify(owed));
  } catch (e) {
    console.warn(`[build] owed: ${e}`);
  }
}

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  try {
    const raw = world.getDynamicProperty(OWED_PROP);
    if (typeof raw !== "string") return;
    const owed = JSON.parse(raw);
    const mine = owed?.[player.id];
    if (!mine) return;
    delete owed[player.id];
    world.setDynamicProperty(OWED_PROP, Object.keys(owed).length ? JSON.stringify(owed) : undefined);
    /** @type {Map<string, number>} */
    const items = new Map();
    for (const [id, n] of Object.entries(mine)) if (Number(n) > 0) items.set(id, Math.floor(Number(n)));
    giveItems(player, items);
    const total = [...items.values()].reduce((a, b) => a + b, 0);
    player.sendMessage(`§aEasy Building:§r ${plural(total, "block")} from a build you left during ${total === 1 ? "was" : "were"} given back.`);
  } catch (e) {
    console.warn(`[build] owed: ${e}`);
  }
});

/**
 * The blocks a build uses. `chooser(box)` gives the main block for each spot of a build that fills `box`
 * (the same block everywhere, unless it is the palette).
 * @typedef {{ base: BlockPermutation, second?: BlockPermutation, mix?: string[], chooser: (box: { min: Pos, max: Pos }) => (x: number, y: number, z: number) => BlockPermutation }} Materials
 * @typedef {{ x: number, y: number, z: number }} Pos
 */

/**
 * @param {Player} player @param {Plan} plan @param {BlockPermutation} [placed] the block just placed (build mode)
 * @returns {Materials | string} the materials, or why there are none
 */
function materialsOf(player, plan, placed) {
  const c = containerOf(player);
  const survival = !isCreative(player);
  /** @type {BlockPermutation | undefined} */
  let base;
  /** @type {Materials["chooser"] | undefined} */
  let chooser;
  /** @type {string[] | undefined} */
  let mix;
  if (plan.src === "typed") {
    base = permOf(plan.block.trim());
    if (!base) return `There is no block called "${plan.block}". Change it in /realm:build -> Blocks and placing.`;
    if (base.type.id === "minecraft:air" && (survival || !isOp(player))) return "Only operators in creative can build with air.";
  } else if (plan.src === "mix") {
    const pal = plan.palette;
    const list = paletteBlocks(player, pal.from);
    if (!list.length) return `Put some blocks in ${pal.from === "hotbar" ? "your hotbar" : "your inventory"} for the palette (/realm:build -> Palette).`;
    base = list[0].perm;
    mix = [...new Set(list.map((b) => nice(b.perm.type.id)))];
    chooser = (box) => picker(list, pal, survival, box);
  } else {
    base = placed ?? blockOfItem(c?.getItem(player.selectedSlotIndex));
    if (!base) return "Hold a block (or pick another main block in /realm:build -> Blocks and placing).";
    if (!placed && isStair(base)) base = withState(base, "weirdo_direction", weirdo(facingOf(player)));
  }
  if (isForbidden(base.type.id)) return `${nice(base.type.id)} can't be built with the tools.`;
  /** @type {BlockPermutation | undefined} */
  let second;
  if (plan.second === "typed" && plan.secondBlock.trim()) {
    second = permOf(plan.secondBlock.trim());
    if (!second) return `There is no block called "${plan.secondBlock}". Change it in /realm:build -> Blocks and placing.`;
  } else if (plan.second === "next" && player.selectedSlotIndex < 8) {
    second = blockOfItem(c?.getItem(player.selectedSlotIndex + 1));
    // A block the tools never place (TNT, a door...) next to your hand just isn't a second block.
    if (second && isForbidden(second.type.id)) second = undefined;
  }
  if (second && isForbidden(second.type.id)) return `${nice(second.type.id)} can't be built with the tools.`;
  const fixed = base;
  return { base, second, mix, chooser: chooser ?? (() => () => fixed) };
}

// ---------------------------------------------------------------------------
// Layout: shape cells -> world blocks
// ---------------------------------------------------------------------------

const FACINGS = [[0, 1], [-1, 0], [0, -1], [1, 0]]; // yaw 0 (south), 90 (west), 180 (north), -90 (east)
/** @type {Map<string, { i: number, tick: number }>} the way each player faced last (an index into FACINGS) and when */
const lastFacing = new Map();
/**
 * The way a player faces, snapped to x or z. It keeps the last way until the look is 10 degrees past the diagonal,
 * so looking along a diagonal doesn't flip the guide (and the build) back and forth.
 * @param {Player} player @returns {number[]}
 */
function facingOf(player) {
  const yaw = player.getRotation().y;
  const now = system.currentTick;
  const prev = lastFacing.get(player.id);
  // Only while the guide keeps asking (it does every few ticks): a build long after uses the plain way you face.
  let i = prev && now - prev.tick <= 40 && Math.abs(((((yaw - prev.i * 90) % 360) + 540) % 360) - 180) <= 55 ? prev.i : -1;
  if (i < 0) i = ((Math.round(yaw / 90) % 4) + 4) % 4;
  lastFacing.set(player.id, { i, tick: now });
  return FACINGS[i];
}
/** Right and forward in the world. @param {number[]} F @param {boolean} turn */
function frameOf(F, turn) {
  const R = [-F[1], F[0]];
  return turn ? { R: F, F: [-R[0], -R[1]] } : { R, F };
}

/** @typedef {{ du: number, dv: number, dw: number, c: import("./shapes.js").Cell }} Rel */

/** Room over the cap while a shape is laid out (some shapes add cells and take a few away again). @param {number} cap */
const slack = (cap) => (Number.isFinite(cap) ? Math.ceil(cap * 1.25) + 64 : cap);
/** The most blocks one build of this player's may place. @param {Player} player @returns {number} */
const limitOf = (player) => (isCreative(player) ? get("maxBlocksCreative") : Math.floor(get("maxBlocks") * (1 + Math.min(100, callingValue(player, "buildEye")) / 100)));

/** @type {Map<string, { key: string, guide: { cells: Pos[], offset?: Pos } | undefined }>} guide cells per player */
const layoutCache = new Map();
/** @type {Map<string, { key: string, rel: Rel[] | undefined, turned: Map<string, Pos[]>, busy: boolean, job: number | undefined }>} each player's shape relative to its start block (undefined: too big), turned to each facing; busy: still being laid out */
const relCache = new Map();
/** @type {Map<string, { key: string, from: string, cells: Pos[] | undefined, last: Pos[] | undefined, done: boolean, job: number | undefined }>} each player's two-block guide laid out for where they look (cells undefined: too big; last: the one shown meanwhile) */
const pointsCache = new Map();
/** Two-block guides over a box up to this many blocks are laid out at once; bigger ones over the next ticks. */
const POINTS_NOW = 4096;
/** Thrown while the guide's layout is still being worked out. */
class Pending extends Error {}

/**
 * The shape's cells relative to the block it is built at (du right, dv up, dw away), copies included.
 * Throws TooBig past `cap` blocks (the most one build may place), before copies and repeats multiply it.
 * @param {Plan} plan @param {boolean} stairs @param {{ W: number, H: number, D: number, a: number[], b: number[] }} [pts]
 * @param {number} [cap]
 * @returns {Rel[]}
 */
function relCells(plan, stairs, pts, cap = Infinity) {
  const job = relCellsJob(plan, stairs, pts, cap);
  let r = job.next();
  while (!r.done) r = job.next();
  return r.value;
}

/**
 * relCells as a generator for system.runJob (the guide lays big shapes out over several ticks).
 * @param {Plan} plan @param {boolean} stairs @param {{ W: number, H: number, D: number, a: number[], b: number[] }} [pts]
 * @param {number} [cap]
 * @returns {Generator<void, Rel[], void>}
 */
function* relCellsJob(plan, stairs, pts, cap = Infinity) {
  const v = (/** @type {string} */ k) => val(plan, k);
  let W, H, D, au, av, aw;
  /** @type {Map<number, import("./shapes.js").Cell>} */
  let cells;
  if (pts) {
    ({ W, H, D } = pts);
    // Two blocks at the same height: the shape keeps the height from its settings.
    if (H === 1 && shapeOf(plan.shape).params.includes("height")) H = boxOf(plan.shape, v).H;
    [au, av, aw] = pts.a;
    cells = yield* cellsJob(plan.shape, v, W, H, D, { a: pts.a, b: pts.b }, stairs, slack(cap));
  } else {
    ({ W, H, D } = boxOf(plan.shape, v));
    au = plan.anchor === "corner" ? 0 : Math.floor((W - 1) / 2);
    aw = plan.anchor === "center" ? Math.floor((D - 1) / 2) : 0;
    av = -Math.max(-32, Math.min(32, plan.up));
    cells = yield* cellsJob(plan.shape, v, W, H, D, undefined, stairs, slack(cap));
  }
  /** @type {Rel[]} */
  let rel = [];
  for (const c of cells.values()) {
    rel.push({ du: c.u - au, dv: c.v - av, dw: c.w - aw, c });
    if (rel.length % 4096 === 0) yield;
  }
  const n = Math.max(1, Math.min(16, Math.round(plan.repeat)));
  if (cells.size * n > cap) throw new TooBig(cells.size * n);
  if (n > 1) {
    const gap = Math.max(0, Math.min(16, Math.round(plan.gap)));
    const all = [];
    for (let i = 0; i < n; i++) {
      const o = { du: 0, dv: 0, dw: 0 };
      if (plan.repeatDir === "right") o.du = i * (W + gap);
      else if (plan.repeatDir === "up") o.dv = i * (H + gap);
      else o.dw = i * (D + gap);
      for (const r of rel) all.push({ du: r.du + o.du, dv: r.dv + o.dv, dw: r.dw + o.dw, c: r.c });
    }
    rel = all;
  }
  /** @type {((r: Rel) => Rel)[]} */
  const copies = [(r) => r];
  /** @param {Rel} r @param {number} su @param {number} sw */
  const mirror = (r, su, sw) => ({ du: r.du * su, dv: r.dv, dw: r.dw * sw, c: r.c.d ? { ...r.c, d: [r.c.d[0] * su, r.c.d[1] * sw] } : r.c });
  /** @param {Rel} r */
  const turn = (r) => ({ du: r.dw, dv: r.dv, dw: -r.du, c: r.c.d ? { ...r.c, d: [r.c.d[1], -r.c.d[0]] } : r.c });
  if (plan.copies === "lr" || plan.copies === "both") copies.push((r) => mirror(r, -1, 1));
  if (plan.copies === "fb" || plan.copies === "both") copies.push((r) => mirror(r, 1, -1));
  if (plan.copies === "both") copies.push((r) => mirror(r, -1, -1));
  if (plan.copies === "radial") copies.push(turn, (r) => turn(turn(r)), (r) => turn(turn(turn(r))));
  if (copies.length === 1) return rel;
  /** @type {Map<string, Rel>} */
  const seen = new Map();
  for (const fn of copies) for (const r of rel) {
    const m = /** @type {Rel} */ (fn(r));
    const key = `${m.du},${m.dv},${m.dw}`;
    if (!seen.has(key)) seen.set(key, m);
  }
  return [...seen.values()];
}

/**
 * Two placed blocks as a box in the shape's frame.
 * @param {{ x: number, y: number, z: number }} A @param {{ x: number, y: number, z: number }} B @param {{ R: number[], F: number[] }} fr
 */
function pointsBox(A, B, fr) {
  const min = { x: Math.min(A.x, B.x), y: Math.min(A.y, B.y), z: Math.min(A.z, B.z) };
  const max = { x: Math.max(A.x, B.x), y: Math.max(A.y, B.y), z: Math.max(A.z, B.z) };
  // The box's corner where u, v and w are all 0.
  const O = { x: 0, y: min.y, z: 0 };
  for (const axis of [0, 1]) {
    const s = fr.R[axis] || fr.F[axis];
    const lo = axis === 0 ? min.x : min.z, hi = axis === 0 ? max.x : max.z;
    if (axis === 0) O.x = s > 0 ? lo : hi;
    else O.z = s > 0 ? lo : hi;
  }
  /** @param {{ x: number, y: number, z: number }} P */
  const local = (P) => [(P.x - O.x) * fr.R[0] + (P.z - O.z) * fr.R[1], P.y - O.y, (P.x - O.x) * fr.F[0] + (P.z - O.z) * fr.F[1]];
  const W = Math.abs(fr.R[0] ? max.x - min.x : max.z - min.z) + 1;
  const D = Math.abs(fr.F[0] ? max.x - min.x : max.z - min.z) + 1;
  return { W, H: max.y - min.y + 1, D, a: local(A), b: local(B) };
}

/**
 * @typedef {{ x: number, y: number, z: number, perm: BlockPermutation, late: boolean }} WorldCell
 */

/**
 * The world blocks of a build at T, modifiers included.
 * @param {Plan} plan @param {Materials} mats @param {{ x: number, y: number, z: number }} T
 * @param {{ R: number[], F: number[] }} fr @param {{ x: number, y: number, z: number }} [B] two-point mode: the end
 * @param {number} [cap] see relCells
 * @param {string} [dimId] the dimension it is built in (a modifier center elsewhere doesn't count)
 * @returns {Promise<WorldCell[]>}
 */
function worldCells(plan, mats, T, fr, B, cap, dimId) {
  // Laid out by a job: a big shape takes a few ticks instead of stalling one.
  return jobResult(worldCellsJob(plan, mats, T, fr, B, cap, dimId));
}

/**
 * worldCells as a generator for system.runJob.
 * @param {Plan} plan @param {Materials} mats @param {Pos} T @param {{ R: number[], F: number[] }} fr @param {Pos} [B]
 * @param {number} [cap] @param {string} [dimId] @returns {Generator<void, WorldCell[], void>}
 */
function* worldCellsJob(plan, mats, T, fr, B, cap, dimId) {
  const stairs = isStair(mats.base);
  const rel = yield* relCellsJob(plan, stairs, B ? pointsBox(T, B, fr) : undefined, cap);
  const { R, F } = fr;
  /** @param {number[]} d */
  const wd = (d) => [d[0] * R[0] + d[1] * F[0], d[0] * R[1] + d[1] * F[1]];
  /** @type {Pos[]} */
  const pos = [];
  for (const { du, dv, dw } of rel) {
    pos.push({ x: T.x + du * R[0] + dw * F[0], y: T.y + dv, z: T.z + du * R[1] + dw * F[1] });
    if (pos.length % 2048 === 0) yield;
  }
  const main = mats.chooser(boundsOf(pos.length ? pos : [T]));
  yield;
  /** @type {WorldCell[]} */
  const out = [];
  for (let i = 0; i < rel.length; i++) {
    if (i && i % 2048 === 0) yield;
    const { c } = rel[i];
    const { x, y, z } = pos[i];
    /** @type {BlockPermutation | undefined} */
    let perm;
    let late = false;
    switch (c.k) {
      case "m":
        perm = main(x, y, z);
        break;
      case "a":
        perm = mats.second ?? (c.fb ? permOf(c.fb) : undefined) ?? main(x, y, z);
        break;
      case "s": {
        const m = main(x, y, z);
        perm = isStair(m) && c.d ? withState(withState(m, "weirdo_direction", weirdo(wd(c.d))), "upside_down_bit", !!c.up) : m;
        break;
      }
      case "g": {
        const g = permOf(gateFor(mats.base));
        perm = g && c.d ? withState(g, "minecraft:cardinal_direction", cardinal(wd(c.d))) : g;
        break;
      }
      case "x": {
        perm = permOf(c.id ?? "minecraft:air");
        if (!perm) break;
        if (c.id === "minecraft:ladder" && c.d) perm = withState(perm, "facing_direction", ladderFacing(wd(c.d)));
        else if (c.id === "minecraft:lantern") perm = withState(perm, "hanging", !!c.up);
        else if (c.id === "minecraft:torch") perm = withState(perm, "torch_facing_direction", "top");
        late = c.id === "minecraft:ladder" || c.id === "minecraft:lantern" || c.id === "minecraft:torch";
        break;
      }
    }
    if (!perm) continue;
    if (c.full && NOT_FULL.test(perm.type.id)) perm = permOf("minecraft:oak_planks") ?? perm;
    out.push({ x, y, z, perm, late });
  }
  yield;
  return yield* finishCellsJob(plan, out, T, cap, dimId);
}

/**
 * Runs a generator as a job (system.runJob) and gives its result.
 * @template R @param {Generator<void, R, void>} gen @returns {Promise<R>}
 */
function jobResult(gen) {
  return new Promise((resolve, reject) => {
    system.runJob(
      (function* () {
        try {
          resolve(yield* gen);
        } catch (e) {
          reject(e);
        }
      })()
    );
  });
}

/** Where mirrors and radial copies turn: the set center (in this dimension), else the block the build starts at. @param {Plan} plan @param {Pos} T @param {string} [dimId] */
const centerOf = (plan, T, dimId) => (plan.mods.center && (!dimId || plan.mods.center.dim === dimId) ? plan.mods.center : T);

/**
 * Adds the modifier copies and sorts: bottom up, things that hang on others last.
 * @template {{ x: number, y: number, z: number, late?: boolean }} C
 * @param {Plan} plan @param {C[]} cells @param {Pos} T @param {number} [cap] @param {string} [dimId] @returns {C[]}
 */
function finishCells(plan, cells, T, cap = Infinity, dimId) {
  const job = finishCellsJob(plan, cells, T, cap, dimId);
  let r = job.next();
  while (!r.done) r = job.next();
  return r.value;
}

/**
 * finishCells as a generator for system.runJob.
 * @template {{ x: number, y: number, z: number, late?: boolean }} C
 * @param {Plan} plan @param {C[]} cells @param {Pos} T @param {number} [cap] @param {string} [dimId] @returns {Generator<void, C[], void>}
 */
function* finishCellsJob(plan, cells, T, cap = Infinity, dimId) {
  let out = cells;
  if (modsOn(plan.mods)) {
    try {
      out = yield* applyModsJob(cells, plan.mods, centerOf(plan, T, dimId), cap);
    } catch (e) {
      if (e instanceof RangeError) throw new TooBig(Math.max(cap + 1, Number(e.message) || 0));
      throw e;
    }
  }
  // Bottom up, things that hang on others last: by layer (linear, unlike a sort of thousands of blocks).
  let lo = Infinity, hi = -Infinity;
  for (const c of out) {
    if (c.y < lo) lo = c.y;
    if (c.y > hi) hi = c.y;
  }
  if (out.length < 2) return out;
  /** @type {C[][]} */
  const layers = Array.from({ length: 2 * (hi - lo + 1) }, () => []);
  for (const c of out) layers[(c.late ? hi - lo + 1 : 0) + c.y - lo].push(c);
  return layers.flat();
}

/**
 * The world blocks of a curve through points, modifiers included.
 * @param {Plan} plan @param {Materials} mats @param {Pos[]} pts @param {number} cap @param {string} dimId @returns {WorldCell[]}
 */
function curveWorldCells(plan, mats, pts, cap, dimId) {
  const pos = curveCells(/** @type {"curve" | "curvewall"} */ (plan.shape), (k) => val(plan, k), pts, slack(cap));
  if (pos.length > cap) throw new TooBig(pos.length);
  const main = mats.chooser(boundsOf(pos));
  return finishCells(plan, pos.map((p) => ({ ...p, perm: main(p.x, p.y, p.z), late: false })), pts[0], cap, dimId);
}

/** @param {{ x: number, y: number, z: number }[]} cells */
function boundsOf(cells) {
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const c of cells) {
    if (c.x < min.x) min.x = c.x;
    if (c.y < min.y) min.y = c.y;
    if (c.z < min.z) min.z = c.z;
    if (c.x > max.x) max.x = c.x;
    if (c.y > max.y) max.y = c.y;
    if (c.z > max.z) max.z = c.z;
  }
  return { min, max };
}

// ---------------------------------------------------------------------------
// Where a build may go: claims and safe zones
// ---------------------------------------------------------------------------

let claimsAnswered = false;
let nextAsk = 1;
/** @type {Map<string, (claims: { n: string }[]) => void>} */
const asking = new Map();

/**
 * Other players' claims (Land Claims) this box reaches into, asked over `realm:claims_check`.
 * Waits briefly when Land Claims has never answered (it may not be installed).
 * @param {Player} player @param {string} dim @param {{ x: number, z: number }} min @param {{ x: number, z: number }} max
 * @returns {Promise<{ n: string }[] | undefined>} undefined: no answer while Land Claims is known to be installed
 */
function claimsIn(player, dim, min, max) {
  const id = `b${nextAsk++}`;
  return new Promise((resolve) => {
    asking.set(id, resolve);
    system.sendScriptEvent("realm:claims_check", JSON.stringify({ id, player: player.id, dim, x1: min.x, z1: min.z, x2: max.x, z2: max.z }));
    system.runTimeout(() => {
      if (!asking.has(id)) return;
      asking.delete(id);
      resolve(claimsAnswered ? undefined : []);
    }, claimsAnswered ? 40 : 5);
  });
}

/** A Safe Zones zone (from /realm:zones) reaching into this box. @param {string} dim @param {{ x: number, z: number }} min @param {{ x: number, z: number }} max */
function safeZoneIn(dim, min, max) {
  for (const zone of allZones()) {
    if (zone.src !== "zones" || zone.dim !== dim) continue;
    const x0 = min.x, x1 = max.x + 1, z0 = min.z, z1 = max.z + 1;
    if (zone.shape === "square") {
      if (zone.x + zone.r >= x0 && zone.x - zone.r <= x1 && zone.z + zone.r >= z0 && zone.z - zone.r <= z1) return zone;
      continue;
    }
    const cx = Math.max(x0, Math.min(zone.x, x1)), cz = Math.max(z0, Math.min(zone.z, z1));
    if ((cx - zone.x) ** 2 + (cz - zone.z) ** 2 <= zone.r * zone.r) return zone;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

const tick = () => new Promise((r) => system.run(() => r(undefined)));
const AIR = () => /** @type {BlockPermutation} */ (permOf("minecraft:air"));

/**
 * Takes a block placed only to mark a spot out of the world again, if it is still there.
 * @param {Dimension} dim @param {Pos} p @param {string} id
 */
function liftBlock(dim, p, id) {
  try {
    const b = dim.getBlock(p);
    if (b && b.typeId === id) {
      b.setPermutation(AIR());
      return true;
    }
  } catch {
    // unloaded
  }
  return false;
}

/**
 * Why a player may not change blocks in this box (safe zones, other players' claims), or undefined.
 * @param {Player} player @param {Dimension} dim
 * @param {{ x: number, y: number, z: number }} min @param {{ x: number, y: number, z: number }} max
 * @param {string} [verb] "build", "cut", "destroy"...
 * @returns {Promise<string | undefined>}
 */
async function areaRefusal(player, dim, min, max, verb = "build") {
  if (!isOp(player) && get("safeZonesOperatorsOnly") === true) {
    const zone = safeZoneIn(dim.id, min, max);
    if (zone) return `That would ${verb} in the safe zone ${zone.name}. Only operators can ${verb} there with the tools.`;
  }
  if (get("inOthersClaims") === true) return undefined;
  const claims = await claimsIn(player, dim.id, min, max);
  if (!claims) return `Land Claims didn't answer, so nothing was done. Try again.`;
  if (claims.length) return `That would reach into ${claims[0].n}'s claim. Do it somewhere else, or make it smaller.`;
  return undefined;
}

/**
 * May a build put a block where `id` is?
 * @param {string} id @param {"air" | "soft" | "all"} mode
 */
function replaceable(id, mode) {
  if (id === "minecraft:air") return true;
  if (isProtectedBlock(id)) return false;
  if (mode === "all") return true;
  return mode === "soft" && isSoft(id);
}

/** The replace mode a player may use. @param {Player} player @param {Plan} plan */
function replaceMode(player, plan) {
  if (plan.replace === "all" && !isCreative(player) && get("survivalReplaceAll") !== true) return "soft";
  return plan.replace;
}

/**
 * Builds a list of blocks: checks where it may go, charges survival players, places the blocks over
 * a few ticks and remembers it for undo.
 * @param {Player} player
 * @param {Dimension} dim
 * @param {{ x: number, y: number, z: number, perm: BlockPermutation, expect?: string, free?: boolean }[]} cells `expect`: only where this block is (redo); `free`: costs nothing
 * @param {string} label
 * @param {{ mode: "air" | "soft" | "all", redo?: boolean, free?: boolean, kind?: import("./undo.js").Kind, rec?: Partial<import("./undo.js").BuildRecord>, done?: (placed: Placed[]) => void }} opts
 *   `free`: nothing costs items (a cut pasted back); `kind` and `rec`: what undo remembers; `done`: gets the placed blocks instead of undo
 * @returns {Promise<boolean>} whether anything was built
 */
async function build(player, dim, cells, label, opts) {
  const s = stateOf(player);
  if (cantBuild(player)) {
    player.sendMessage(CANT_BUILD);
    return false;
  }
  const pid = player.id;
  const creative = isCreative(player);
  const limit = limitOf(player);
  if (!cells.length) {
    player.sendMessage("§eNothing to build: the shape has no blocks.");
    return false;
  }
  if (cells.length > limit) {
    player.sendMessage(`§eThat's ${cells.length} blocks; the most one build can place is ${limit}${creative ? "" : " in survival"}. Make it smaller.`);
    return false;
  }
  const { min, max } = boundsOf(cells);
  s.busy = true;
  try {
    const why = await areaRefusal(player, dim, min, max);
    if (!player.isValid) return false;
    if (why) {
      player.sendMessage(`§e${why}`);
      return false;
    }
    const range = dim.heightRange;
    const perTick = Math.max(10, get("blocksPerTick"));

    // 1. What can go where (reading only).
    /** @type {{ x: number, y: number, z: number, perm: BlockPermutation, expect?: string, cost?: string }[]} */
    const todo = [];
    let blocked = 0, unloaded = 0, unpayable = 0, outside = 0;
    const pay = !creative && get("requireItems") === true && !opts.free;
    for (let i = 0; i < cells.length; i++) {
      if (i && i % perTick === 0) {
        await tick();
        if (!player.isValid) return false;
      }
      const c = cells[i];
      if (c.y < range.min || c.y >= range.max) {
        outside++;
        continue;
      }
      let block;
      try {
        block = dim.getBlock(c);
      } catch {
        block = undefined;
      }
      if (!block) {
        unloaded++;
        continue;
      }
      const here = block.typeId;
      if (here === c.perm.type.id) continue; // already there
      if (opts.redo ? here !== c.expect : !replaceable(here, opts.mode)) {
        blocked++;
        continue;
      }
      if (!pay || c.free) {
        todo.push(c);
        continue;
      }
      const cost = costOf(c.perm);
      if (cost === undefined) {
        unpayable++;
        continue;
      }
      todo.push(cost === null ? c : { ...c, cost });
    }

    // 2. Pay for it.
    /** @type {Map<string, number>} */
    const need = new Map();
    for (const c of todo) if (c.cost) need.set(c.cost, (need.get(c.cost) ?? 0) + 1);
    /** @type {Map<string, number>} what was taken and not used yet */
    const paid = new Map();
    /** @type {string[]} */
    const short = [];
    if (pay && need.size) {
      const have = countItems(player);
      for (const [id, n] of need) if ((have.get(id) ?? 0) < n) short.push(`${n - (have.get(id) ?? 0)} ${nice(id)}`);
      if (short.length && get("partialBuilds") !== true) {
        player.sendMessage(`§eNot enough blocks: you need ${short.join(", ")} more. Nothing was built.`);
        return false;
      }
      for (const [id, n] of need) paid.set(id, takeItems(player, id, n));
    }

    // 3. Place, a few hundred blocks a tick. The top half of a door or tall flower (pastes, undo of destroy mode)
    // goes last and only onto its own bottom half; a bottom half whose top can't go is taken away again.
    const upper = (/** @type {{ perm: BlockPermutation }} */ c) => c.perm.getState("upper_block_bit") === true;
    if (todo.some(upper)) todo.sort((a, b) => Number(upper(a)) - Number(upper(b)));
    /** @type {Set<string>} bottom halves to take away again */
    const lone = new Set();
    /** @type {Placed[]} */
    const placed = [];
    let changed = 0;
    for (let i = 0; i < todo.length; i++) {
      if (i && i % perTick === 0) {
        await tick();
        if (!player.isValid) break;
      }
      const c = todo[i];
      if (c.cost) {
        const left = paid.get(c.cost) ?? 0;
        if (left <= 0) continue;
        paid.set(c.cost, left - 1);
      }
      let block;
      try {
        block = dim.getBlock(c);
      } catch {
        block = undefined;
      }
      let bad = !block || (opts.redo ? block.typeId !== c.expect : !replaceable(block.typeId, opts.mode));
      if (!bad && upper(c)) {
        let below;
        try {
          below = dim.getBlock({ x: c.x, y: c.y - 1, z: c.z });
        } catch {
          below = undefined;
        }
        if (below?.typeId !== c.perm.type.id || below.permutation.getState("upper_block_bit") !== false) {
          bad = true;
          lone.add(`${c.x},${c.y - 1},${c.z}`);
        }
      }
      if (!block || bad) {
        if (c.cost) paid.set(c.cost, (paid.get(c.cost) ?? 0) + 1);
        if (block) changed++;
        else unloaded++;
        continue;
      }
      const before = block.permutation;
      try {
        block.setPermutation(c.perm);
      } catch {
        if (c.cost) paid.set(c.cost, (paid.get(c.cost) ?? 0) + 1);
        changed++;
        continue;
      }
      placed.push({ x: c.x, y: c.y, z: c.z, before, after: c.perm, cost: c.cost });
    }
    if (lone.size) {
      for (let i = placed.length - 1; i >= 0; i--) {
        const c = placed[i];
        if (!lone.has(`${c.x},${c.y},${c.z}`)) continue;
        try {
          const block = dim.getBlock(c);
          if (block?.typeId === c.after.type.id) block.setPermutation(c.before);
        } catch {
          continue;
        }
        if (c.cost) paid.set(c.cost, (paid.get(c.cost) ?? 0) + 1);
        placed.splice(i, 1);
        changed++;
      }
    }
    // Anything paid for but not placed goes back.
    for (const [id, n] of [...paid]) if (n <= 0) paid.delete(id);
    refund(player, pid, paid);

    if (placed.length) {
      if (opts.done) opts.done(placed);
      else remember(player, { ...opts.rec, dim: dim.id, label, kind: opts.kind ?? "build", cells: placed }, !!opts.redo);
    }
    if (!player.isValid) return placed.length > 0;
    const skipped = blocked + changed;
    const notes = [];
    if (skipped) notes.push(`${plural(skipped, "spot")} already taken`);
    if (unloaded) notes.push(`${plural(unloaded, "block")} too far away`);
    if (outside) notes.push(`${plural(outside, "block")} above or below the world`);
    if (unpayable) notes.push(`${plural(unpayable, "block")} that can't be built in survival`);
    if (!placed.length) {
      player.sendMessage(short.length ? `§eNot enough blocks: you need ${short.join(", ")}.` : `§eNothing was built${notes.length ? `: ${notes.join(", ")}` : ""}.`);
      return false;
    }
    note(player, `§aBuilt ${plural(placed.length, "block")}§7 - /realm:build_undo takes it back`);
    if (short.length) player.sendMessage(`§eOut of blocks: built ${placed.length} of ${todo.length}. Still needed: ${short.join(", ")}.`);
    if (notes.length && skipped + unloaded + unpayable + outside >= Math.max(4, cells.length / 10)) player.sendMessage(`§7Skipped ${notes.join(", ")}.`);
    return true;
  } finally {
    s.busy = false;
  }
}

// ---------------------------------------------------------------------------
// Where to build: the block you look at, or the block you placed
// ---------------------------------------------------------------------------

/** @type {Record<string, number[]>} */
const FACE = { Up: [0, 1, 0], Down: [0, -1, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0] };

/** How far away this player builds at a look: their own reach, never past the realm's. @param {Player} player */
const reachOf = (player) => Math.max(1, Math.min(Number(get("reach")) || 16, Number(getFor(player, "myReach")) || 16));
/** Is Air Build on for this player (and allowed on the realm)? @param {Player} player */
const airOn = (player) => get("airBuild") === true && getFor(player, "airMode") === true;

/** The block spot in midair this player's Air Build aims at. @param {Player} player */
function airTarget(player) {
  const d = Math.max(1, Math.min(reachOf(player), Number(getFor(player, "airDistance")) || 4));
  const head = player.getHeadLocation(), dir = player.getViewDirection();
  return { x: Math.floor(head.x + dir.x * d), y: Math.floor(head.y + dir.y * d), z: Math.floor(head.z + dir.z * d), air: true };
}

/**
 * The spot a block would be placed on the face you look at (within your reach); with Air Build on and no block
 * in reach, the spot in midair in front of you.
 * @param {Player} player @param {boolean} [air] allow Air Build's spot
 * @returns {{ x: number, y: number, z: number, air?: boolean } | undefined}
 */
function lookTarget(player, air = true) {
  let hit;
  try {
    hit = player.getBlockFromViewDirection({ maxDistance: reachOf(player), includeLiquidBlocks: false, includePassableBlocks: false });
  } catch {
    hit = undefined;
  }
  if (!hit) return air && airOn(player) ? airTarget(player) : undefined;
  const n = FACE[hit.face] ?? [0, 1, 0];
  const b = hit.block.location;
  return { x: b.x + n[0], y: b.y + n[1], z: b.z + n[2] };
}

/** @param {Player} player @param {TooBig} e */
const tooBig = (player, e) =>
  `§eThat's more than ${e.n - 1} blocks; the most one build can place is ${limitOf(player)}${isCreative(player) ? "" : " in survival"}. Make it smaller.`;

/**
 * Builds the player's shape at T (or between their start block and T).
 * @param {Player} player @param {{ x: number, y: number, z: number }} T @param {BlockPermutation} [placed]
 */
async function buildAt(player, T, placed) {
  const plan = planOf(player);
  const s = stateOf(player);
  if (shapeOf(plan.shape).way) {
    addPoint(player, T);
    return false;
  }
  const mats = materialsOf(player, plan, placed);
  if (typeof mats === "string") {
    player.sendMessage(`§e${mats}`);
    return false;
  }
  const fr = frameOf(facingOf(player), plan.turn);
  const twoPoint = plan.size === "points" && shapeOf(plan.shape).points;
  let start = T, end;
  if (twoPoint) {
    if (!s.start || s.start.dim !== player.dimension.id) {
      s.start = { dim: player.dimension.id, ...T, id: placed?.type.id ?? "" };
      note(player, "§bStart set§7 - now the end block: place one, or /realm:build_here", 80);
      return false;
    }
    start = { x: s.start.x, y: s.start.y, z: s.start.z };
    end = T;
    const marker = s.start;
    s.start = undefined;
    // A start block that was placed only marked the spot: it goes back into your hand now, whether the end
    // was placed too or came from /realm:build_here.
    if (marker.id && liftBlock(player.dimension, marker, marker.id) && marker.paid) giveItems(player, new Map([[marker.paid, 1]]));
    const size = get("maxSize");
    const span = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y), Math.abs(end.z - start.z)) + 1;
    if (span > size) {
      player.sendMessage(`§eThose blocks are ${span} apart; a shape can be at most ${size} blocks each way. Place the start block again.`);
      return false;
    }
  }
  let cells;
  s.busy = true; // while it is laid out
  try {
    cells = await worldCells(plan, mats, start, fr, end, limitOf(player), player.dimension.id);
  } catch (e) {
    if (!(e instanceof TooBig)) throw e;
    if (player.isValid) player.sendMessage(tooBig(player, e));
    return false;
  } finally {
    s.busy = false;
  }
  if (!player.isValid) return false;
  const label = twoPoint ? shapeOf(plan.shape).name : planLabel(plan);
  return build(player, player.dimension, cells, label, { mode: replaceMode(player, plan) });
}

// ---------------------------------------------------------------------------
// Curves: points placed one by one, then finished
// ---------------------------------------------------------------------------

/** Adds a point to the player's curve. @param {Player} player @param {Pos} T */
function addPoint(player, T) {
  const s = stateOf(player);
  const dim = player.dimension.id;
  if (!s.way || s.way.dim !== dim) s.way = { dim, pts: [] };
  const last = s.way.pts[s.way.pts.length - 1];
  if (last && last.x === T.x && last.y === T.y && last.z === T.z) return;
  if (s.way.pts.length >= MAX_POINTS) {
    note(player, `§eA curve can have ${MAX_POINTS} points: finish it in /realm:build or /realm:build_finish`);
    return;
  }
  const size = get("maxSize");
  const first = s.way.pts[0];
  if (first && Math.max(Math.abs(T.x - first.x), Math.abs(T.y - first.y), Math.abs(T.z - first.z)) >= 2 * size) {
    note(player, `§eThat point is too far from the first one (at most ${2 * size - 1} blocks)`);
    return;
  }
  s.way.pts.push({ x: T.x, y: T.y, z: T.z });
  const n = s.way.pts.length;
  note(player, n === 1 ? "§bPoint 1 set§7 - place the next point" : `§bPoint ${n} set§7 - more points, or finish: /realm:build_finish`, 80);
}

/** Builds the player's curve through its points. @param {Player} player */
async function finishCurve(player) {
  const s = stateOf(player);
  if (s.busy) return player.sendMessage("§eWait for the last build to finish.");
  const plan = planOf(player);
  const shape = shapeOf(plan.shape);
  if (!shape.way) return player.sendMessage("§eChoose Curved line or Curved wall or path first (/realm:build -> Choose a shape).");
  const way = s.way;
  if (!way || way.dim !== player.dimension.id || way.pts.length < 2) {
    return player.sendMessage("§eA curve needs at least two points: place them (build mode) or use /realm:build_here at each.");
  }
  const mats = materialsOf(player, plan);
  if (typeof mats === "string") return player.sendMessage(`§e${mats}`);
  let cells;
  try {
    cells = curveWorldCells(plan, mats, way.pts, limitOf(player), way.dim);
  } catch (e) {
    if (!(e instanceof TooBig)) throw e;
    return player.sendMessage(tooBig(player, e));
  }
  const n = way.pts.length;
  s.way = undefined;
  layoutCache.delete(player.id);
  const ok = await build(player, player.dimension, cells, `${shape.name} through ${n} points`, { mode: replaceMode(player, plan) });
  if (!ok && player.isValid) {
    s.way = way; // keep the points to try again
    layoutCache.delete(player.id);
  }
}

// ---------------------------------------------------------------------------
// Build mode: placing a block builds the shape
// ---------------------------------------------------------------------------

world.afterEvents.playerPlaceBlock.subscribe(({ player, block }) => {
  const s = states.get(player.id);
  if (!s?.on || player.isSneaking) {
    handPlaced(player, block);
    return;
  }
  if (refusal(player)) return;
  if (s.busy) {
    note(player, "§eStill building the last one...");
    return;
  }
  const perm = block.permutation;
  // Two-block things (doors, beds, tall flowers), forbidden blocks and blocks added onto one already there
  // (a slab made double, a second snow layer, candle or sea pickle) place normally: taking those back
  // would also take what was there before.
  if (isForbidden(perm.type.id) || perm.getState("upper_block_bit") !== undefined || stacked(perm)) return;
  const T = { x: block.location.x, y: block.location.y, z: block.location.z };
  const dim = block.dimension;
  const survival = !isCreative(player);
  const plan = planOf(player);
  const twoPoint = plan.size === "points" && shapeOf(plan.shape).points;
  // The start block of a two-block shape stays until the end block is placed.
  if (twoPoint && (!s.start || s.start.dim !== dim.id)) {
    s.start = { dim: dim.id, ...T, id: perm.type.id, paid: survival ? costOf(perm) ?? undefined : undefined };
    note(player, "§bStart set§7 - now place the end block (sneak to place normally)", 80);
    return;
  }
  // The placed block only marks the spot: it goes back into your hand and the build starts there (a two-block
  // shape's start block is taken back by buildAt, which also handles an end set with /realm:build_here).
  const paid = survival ? costOf(perm) ?? undefined : undefined;
  if (liftBlock(dim, T, perm.type.id) && paid) giveItems(player, new Map([[paid, 1]]));
  buildAt(player, T, perm).catch((e) => console.warn(`[build] ${e}`));
});

// ---------------------------------------------------------------------------
// Modifiers on blocks placed and broken by hand (a player choice, default off)
// ---------------------------------------------------------------------------

/** Has this player asked for (and may they have) modifier copies of what they place and break by hand? Cheap: checked on every block. @param {Player} player */
const wantsHandMods = (player) => get("handModifiers") === true && getFor(player, "modsByHand") === true;
/** ...and are any modifiers on, and may they build? @param {Player} player @param {Plan} plan */
const handMods = (player, plan) => wantsHandMods(player) && modsOn(plan.mods) && !refusal(player) && !cantBuild(player);

/** The copies of one block a player's modifiers make (the block itself left out). @param {Plan} plan @param {Pos} p @param {string} dimId */
function handCopies(plan, p, dimId) {
  try {
    return applyMods([{ x: p.x, y: p.y, z: p.z }], plan.mods, centerOf(plan, p, dimId), 4096).filter((c) => c.x !== p.x || c.y !== p.y || c.z !== p.z);
  } catch {
    return [];
  }
}

/** A block placed one at a time: its modifier copies are built too (paid for, claims and zones checked, undoable). @param {Player} player @param {import("@minecraft/server").Block} block */
function handPlaced(player, block) {
  if (!wantsHandMods(player) || isPasting(player) || isSelecting(player)) return;
  const plan = planOf(player);
  if (!handMods(player, plan)) return;
  const s = stateOf(player);
  if (s.busy) return;
  const perm = block.permutation;
  if (isForbidden(perm.type.id) || perm.getState("upper_block_bit") !== undefined || stacked(perm)) return;
  const dim = block.dimension;
  const T = { x: block.location.x, y: block.location.y, z: block.location.z };
  const copies = applyModsTo(plan, [{ ...T, perm }], T, dim.id).filter((c) => c.x !== T.x || c.y !== T.y || c.z !== T.z);
  if (!copies.length) return;
  build(player, dim, copies, `copies of ${nice(perm.type.id)}`, { mode: replaceMode(player, plan) }).catch((e) => console.warn(`[build] ${e}`));
}

/** @template {{ x: number, y: number, z: number, perm?: BlockPermutation }} C @param {Plan} plan @param {C[]} cells @param {Pos} T @param {string} dimId @returns {C[]} */
function applyModsTo(plan, cells, T, dimId) {
  try {
    return applyMods(cells, plan.mods, centerOf(plan, T, dimId), 4096);
  } catch {
    return cells;
  }
}

world.afterEvents.playerBreakBlock.subscribe(({ player, block, brokenBlockPermutation: broken }) => {
  try {
    if (!wantsHandMods(player) || isDestroying(player)) return;
    const plan = planOf(player);
    if (!handMods(player, plan) || stateOf(player).busy) return;
    const id = broken.type.id;
    if (isProtectedBlock(id) || id === "minecraft:air") return;
    const dim = block.dimension;
    const copies = handCopies(plan, block.location, dim.id);
    if (copies.length) handBroken(player, dim, copies, id).catch((e) => console.warn(`[build] ${e}`));
  } catch (e) {
    console.warn(`[build] ${e}`);
  }
});

/**
 * Breaks the modifier copies of a block broken by hand: only where the same block is. Creative players just
 * clear them; survival players get the drops (the game's own, as if broken by hand: `setblock ... destroy`).
 * Copies in someone else's claim or (for non-operators) a safe zone are left alone; undo doesn't bring them back.
 * @param {Player} player @param {Dimension} dim @param {Pos[]} copies @param {string} id
 */
async function handBroken(player, dim, copies, id) {
  const { min, max } = boundsOf(copies);
  if (!isOp(player) && get("safeZonesOperatorsOnly") === true && safeZoneIn(dim.id, min, max)) return;
  if (get("inOthersClaims") !== true) {
    const claims = await claimsIn(player, dim.id, min, max);
    if (!claims || claims.length || !player.isValid) return;
  }
  const creative = isCreative(player);
  let n = 0;
  for (const c of copies) {
    try {
      const b = dim.getBlock(c);
      if (!b || b.typeId !== id) continue;
      if (creative) b.setPermutation(AIR());
      else dim.runCommand(`setblock ${c.x} ${c.y} ${c.z} air destroy`);
      n++;
    } catch {
      // unloaded
    }
  }
  if (n) note(player, `§7Broke ${plural(n, "copy", "copies")} too`, 30);
}

// ---------------------------------------------------------------------------
// The Building Book and Air Build: using an item in the air
// ---------------------------------------------------------------------------

/** Uses of the Building Book closer together than this (in ticks) are one press held down. */
const BOOK_REPEAT = 16;

/** Opens the menu (or, sneaking, turns build mode on or off) with the Building Book. @param {Player} player */
function useBook(player) {
  const s = stateOf(player);
  // Every use counts, acted on or not: holding the button (or a long press) repeats it every 12 ticks or so, and
  // that must not switch build mode on and off again. A new press comes after a pause.
  const last = s.bookAt;
  s.bookAt = system.currentTick;
  if (system.currentTick - last < BOOK_REPEAT) return;
  const why = refusal(player);
  if (why) return player.sendMessage(`§e${why}`);
  if (player.isSneaking) toggleMode(player);
  else mainMenu(player).catch((e) => console.warn(`[build] ${e}`));
}

world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  try {
    if (!(player instanceof Player)) return;
    // While choosing a region's corners, using any item (the book too) sets a corner: clipboard.js handles it.
    if (isSelecting(player)) return;
    if (itemStack?.typeId === BOOK) return useBook(player);
    const perm = blockOfItem(itemStack);
    if (!perm || !airOn(player) || refusal(player) || cantBuild(player)) return;
    const s = stateOf(player);
    if (system.currentTick - s.usedAt < 4 || s.busy) return;
    // Looking at a block within normal reach: the game places it there as usual.
    try {
      if (player.getBlockFromViewDirection({ maxDistance: 6, includeLiquidBlocks: false, includePassableBlocks: false })) return;
    } catch {
      // nothing in view
    }
    s.usedAt = system.currentTick;
    airUse(player, perm).catch((e) => console.warn(`[build] ${e}`));
  } catch (e) {
    console.warn(`[build] ${e}`);
  }
});

/**
 * Air Build: in build mode the shape is built at the spot in midair; otherwise (or sneaking) one block goes
 * there (with its modifier copies when those are on for blocks placed by hand).
 * @param {Player} player @param {BlockPermutation} perm the held block
 */
async function airUse(player, perm) {
  const T = airTarget(player);
  const s = stateOf(player);
  if (s.on && !player.isSneaking) {
    await buildAt(player, T);
    return;
  }
  const plan = planOf(player);
  if (isForbidden(perm.type.id)) return player.sendMessage(`§e${nice(perm.type.id)} can't be built with the tools.`);
  const p = isStair(perm) ? withState(perm, "weirdo_direction", weirdo(facingOf(player))) : perm;
  const cells = handMods(player, plan) ? applyModsTo(plan, [{ ...T, perm: p }], T, player.dimension.id) : [{ x: T.x, y: T.y, z: T.z, perm: p }];
  await build(player, player.dimension, cells, `${nice(perm.type.id)} in the air`, { mode: replaceMode(player, plan) });
}

world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  if (ev.itemStack?.typeId !== BOOK || isSelecting(ev.player)) return;
  ev.cancel = true; // every repeat while the button is held too, so the block is never used
  if (!ev.isFirstEvent) {
    stateOf(ev.player).bookAt = system.currentTick; // still held: not a new press
    return;
  }
  const player = ev.player;
  system.run(() => {
    if (player.isValid) useBook(player);
  });
});

// ---------------------------------------------------------------------------
// Outline preview and the build mode line
// ---------------------------------------------------------------------------

/**
 * The blocks the player's build would fill at T, for the guide: cached until the plan, the way they face or
 * (when the result depends on it) T changes. Without modifiers, two blocks or points it is cached relative to T
 * and drawn with T as the offset.
 * @param {Player} player @param {Plan} plan @param {Pos} T
 * @returns {{ cells: Pos[], offset?: Pos, mods?: { m: import("./modifiers.js").Mods, center: Pos } } | undefined}
 */
function guideFor(player, plan, T) {
  const fr = frameOf(facingOf(player), plan.turn);
  const s = stateOf(player);
  const dim = player.dimension.id;
  const shape = shapeOf(plan.shape);
  const cap = limitOf(player);
  const twoPoint = plan.size === "points" && shape.points;
  const start = twoPoint && s.start && s.start.dim === dim ? s.start : undefined;
  const pts = shape.way && s.way && s.way.dim === dim ? s.way.pts : [];
  // Curves and two-block shapes depend on where you look; other shapes are laid out once and moved (their modifier
  // copies are worked out face by face when drawn).
  const moving = shape.way || twoPoint;
  const planKey = JSON.stringify(plan) + get("maxSize") + cap;
  const baseKey = planKey + fr.R.join() + fr.F.join() + dim;
  const key = baseKey + (moving ? `|${T.x},${T.y},${T.z}|${start ? `${start.x},${start.y},${start.z}` : ""}|${pts.length}` : "");
  const cached = layoutCache.get(player.id);
  if (cached && cached.key === key) return cached.guide;
  /** The shape's blocks relative to the block it starts at: laid out once per plan (and turned once per facing), not per look. */
  const fk = fr.R.join() + fr.F.join();
  const relPos = () => {
    let hit = relCache.get(player.id);
    if (!hit || hit.key !== planKey) {
      if (hit?.job !== undefined) system.clearJob(hit.job); // a layout for settings since changed
      hit = { key: planKey, rel: undefined, turned: new Map(), busy: true, job: undefined };
      relCache.set(player.id, hit);
    }
    const pos = hit.turned.get(fk);
    if (pos) return pos;
    if (!hit.busy && !hit.rel) throw new TooBig(cap + 1);
    if (hit.job === undefined && (hit.rel ? hit.rel.length : roughSize(plan)) <= POINTS_NOW) {
      // A small shape is laid out (or turned to a new facing) at once, so its guide never skips a refresh.
      if (hit.busy) {
        try {
          hit.rel = relCells(plan, false, undefined, cap);
        } catch (e) {
          if (!(e instanceof TooBig)) throw e;
        }
        hit.busy = false;
      }
      if (!hit.rel) throw new TooBig(cap + 1);
      const list = hit.rel.map((r) => ({ x: r.du * fr.R[0] + r.dw * fr.F[0], y: r.dv, z: r.du * fr.R[1] + r.dw * fr.F[1] }));
      hit.turned.set(fk, list);
      return list;
    }
    if (hit.job === undefined) {
      // Laid out (and outlined) over the next ticks, so a big shape doesn't stall one; no guide until then.
      const entry = hit;
      entry.job = system.runJob(
        (function* () {
          try {
            if (entry.busy) entry.rel = yield* relCellsJob(plan, false, undefined, cap);
            const list = [];
            for (const r of entry.rel ?? []) {
              list.push({ x: r.du * fr.R[0] + r.dw * fr.F[0], y: r.dv, z: r.du * fr.R[1] + r.dw * fr.F[1] });
              if (list.length % 4096 === 0) yield;
            }
            if (entry.rel) {
              yield* outlineJob(list);
              entry.turned.set(fk, list);
            }
          } catch (e) {
            if (!(e instanceof TooBig)) console.warn(`[build] guide: ${e}`);
          }
          entry.busy = false;
          entry.job = undefined;
        })()
      );
    }
    throw new Pending();
  };
  /** @type {{ cells: Pos[], offset?: Pos } | undefined} */
  let guide;
  try {
    if (shape.way) {
      const pos = curveCells(/** @type {"curve" | "curvewall"} */ (plan.shape), (k) => val(plan, k), [...pts, T], slack(cap));
      guide = { cells: finishCells(plan, pos, pts[0] ?? T, cap, dim) };
    } else {
      const O = start ?? T;
      // Two blocks farther apart than a shape may be: the build refuses it, so no guide is laid out for it either.
      if (start && Math.max(Math.abs(T.x - start.x), Math.abs(T.y - start.y), Math.abs(T.z - start.z)) + 1 > get("maxSize")) throw new TooBig(cap + 1);
      const box = start ? pointsBox(start, T, fr) : undefined;
      /** The shape's world blocks between the two points (or the one spot before the start is set). @param {{ du: number, dv: number, dw: number }[]} rel */
      const placeAt = (rel) => rel.map((r) => ({ x: r.du * fr.R[0] + r.dw * fr.F[0] + O.x, y: r.dv + O.y, z: r.du * fr.R[1] + r.dw * fr.F[1] + O.z }));
      if (box && box.W * box.H * box.D > POINTS_NOW) {
        // A big two-block shape changes with every look: laid out (and outlined) over the next ticks, so aiming
        // doesn't stall the server for a second each time. A layout under way finishes first (so the guide keeps
        // following the look while it moves); the last one finished for the same start stays up until the next is ready.
        const from = `${baseKey}|${O.x},${O.y},${O.z}`;
        let hit = pointsCache.get(player.id);
        if (!hit || (hit.key !== key && (hit.done || hit.from !== from))) {
          // A new plan, facing or start: the old layout is of no use any more.
          if (hit?.job !== undefined) system.clearJob(hit.job);
          const last = hit && hit.from === from ? (hit.done ? hit.cells : hit.last) : undefined;
          /** @type {{ key: string, from: string, cells: Pos[] | undefined, last: Pos[] | undefined, done: boolean, job: number | undefined }} */
          const entry = (hit = { key, from, cells: undefined, last, done: false, job: undefined });
          pointsCache.set(player.id, entry);
          entry.job = system.runJob(
            (function* () {
              try {
                const cells = withModsGuide(plan, placeAt(yield* relCellsJob(plan, false, box, cap)), O, cap, dim);
                yield* outlineJob(cells);
                entry.cells = cells;
              } catch (e) {
                if (!(e instanceof TooBig)) console.warn(`[build] guide: ${e}`);
              }
              entry.done = true;
              entry.job = undefined;
            })()
          );
        }
        if (!hit.done) return hit.from === from && hit.last ? { cells: hit.last } : undefined;
        if (!hit.cells) throw new TooBig(cap + 1);
        guide = { cells: hit.cells };
      } else {
        guide = moving ? { cells: withModsGuide(plan, placeAt(box ? relCells(plan, false, box, cap) : [{ du: 0, dv: 0, dw: 0 }]), O, cap, dim) } : { cells: relPos() };
      }
    }
  } catch (e) {
    if (e instanceof Pending) return undefined; // not laid out yet: asked again at the next refresh
    if (!(e instanceof TooBig)) throw e;
    guide = undefined; // too big to build: no guide (building says why)
  }
  layoutCache.set(player.id, { key, guide });
  if (guide && !moving) return { cells: guide.cells, offset: T, mods: modsOn(plan.mods) ? { m: plan.mods, center: centerOf(plan, T, dim) } : undefined };
  return guide;
}

/** About how many blocks a plan lays out (its box, repeats and copies): small ones are laid out at once. @param {Plan} plan */
function roughSize(plan) {
  const { W, H, D } = boxOf(plan.shape, (k) => val(plan, k));
  return W * H * D * Math.max(1, plan.repeat) * (plan.copies === "none" ? 1 : 4);
}

/** The guide's modifier copies (like finishCells, without sorting). @param {Plan} plan @param {Pos[]} cells @param {Pos} T @param {number} cap @param {string} dim */
function withModsGuide(plan, cells, T, cap, dim) {
  if (!modsOn(plan.mods)) return cells;
  try {
    return applyMods(cells, plan.mods, centerOf(plan, T, dim), cap);
  } catch (e) {
    if (e instanceof RangeError) throw new TooBig(cap + 1);
    throw e;
  }
}

/** Gold marks: the modifier center, a two-block start and a curve's points. @param {Player} player @param {State} s @param {Plan} plan */
function marksOf(player, s, plan) {
  const dim = player.dimension.id;
  /** @type {Pos[]} */
  const out = [];
  const c = plan.mods.center;
  if (c && c.dim === dim && needsCenter(plan.mods)) out.push(c);
  if (s.start && s.start.dim === dim) out.push(s.start);
  if (s.way && s.way.dim === dim) out.push(...s.way.pts);
  return out;
}

/** Is the player holding a block that can be placed, or the Building Book? @param {Player} player */
function holdingTool(player) {
  const item = containerOf(player)?.getItem(player.selectedSlotIndex);
  return item?.typeId === BOOK || !!blockOfItem(item);
}

system.runInterval(() => {
  const now = system.currentTick;
  for (const player of world.getAllPlayers()) {
    const s = states.get(player.id);
    if (!s?.on) continue;
    try {
      if (refusal(player)) continue;
      const hintDue = now - s.hintAt >= 20 && now >= s.paused && getFor(player, "hint") === true;
      const guideDue = now % guideRate(player) === 0;
      if ((!hintDue && !guideDue) || !holdingTool(player)) continue;
      const plan = planOf(player);
      if (guideDue) {
        const T = lookTarget(player);
        const g = T && guideFor(player, plan, T);
        if (g) drawGuide(player, g.cells, "build", { offset: g.offset, mods: g.mods, force: true });
        const marks = marksOf(player, s, plan);
        if (marks.length) drawGuide(player, marks, "mark", { force: true });
      }
      if (hintDue) {
        s.hintAt = now;
        const shape = shapeOf(plan.shape);
        const twoPoint = plan.size === "points" && shape.points;
        const n = s.way?.pts.length ?? 0;
        const text = shape.way
          ? `§bBuild: §f${shape.name}§7 - ${n ? `${plural(n, "point")} set: place more, then /realm:build_finish` : "place the first point (sneak: just one block)"}`
          : twoPoint && s.start
            ? `§bBuild: §f${shape.name}§7 - place the end block (start ${s.start.x} ${s.start.y} ${s.start.z})`
            : twoPoint
              ? `§bBuild: §f${shape.name}§7 - place the start block (sneak: just one block)`
              : `§bBuild: §f${planLabel(plan)}§7 - place a block (sneak: just one)`;
        system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: player.id, ticks: HINT_TICKS, from: PACK }));
        player.onScreenDisplay.setActionBar(text);
      }
    } catch (e) {
      console.warn(`[build] ${e}`);
    }
  }
}, 1);

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  const s = states.get(playerId);
  if (s) {
    s.on = false;
    s.start = undefined;
    s.way = undefined;
  }
  layoutCache.delete(playerId);
  lastFacing.delete(playerId);
  const pj = pointsCache.get(playerId)?.job;
  if (pj !== undefined) system.clearJob(pj);
  pointsCache.delete(playerId);
  const job = relCache.get(playerId);
  if (job?.job !== undefined) system.clearJob(job.job);
  relCache.delete(playerId);
  forgetGuides(playerId);
});

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

/**
 * Shows a form, retrying while the player still has chat or another screen open.
 * @template {ActionFormData | ModalFormData | MessageFormData} T
 * @param {Player} player @param {T} form
 * @returns {Promise<Awaited<ReturnType<T["show"]>> | undefined>}
 */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = /** @type {any} */ (await form.show(player));
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await new Promise((r) => system.runTimeout(() => r(undefined), 20));
  }
  return undefined;
}

/** The answers of a modal form, inputs only (labels and headers give undefined). @param {any} res */
const inputs = (res) => (res?.formValues ?? []).filter((/** @type {unknown} */ v) => v !== undefined);

/**
 * What a menu action gives back: CLOSE when it needs the world (a preview, a build, picking corners) or the player
 * closed a menu under it, so the menus stay closed; a string is shown at the top of the menu it comes back to;
 * anything else just brings that menu back. Menus close only with their X (or an action that needs the world).
 */
const CLOSE = Symbol("close");

/** @param {Player} player */
async function mainMenu(player) {
  /** @type {unknown} */
  let out;
  while (player.isValid) {
    const why = refusal(player);
    if (why) return player.sendMessage(`§e${why}`);
    out = await mainPage(player, typeof out === "string" ? out : "");
    if (out === CLOSE) return;
  }
}

/** The main page of /realm:build once; its action's answer. @param {Player} player @param {string} notice */
async function mainPage(player, notice) {
  const s = stateOf(player);
  const plan = planOf(player);
  const blocks = plan.src === "typed" ? nice(plan.block) : plan.src === "mix" ? `your palette (${paletteLabel(plan.palette)})` : "the block you place";
  const second = plan.second === "typed" && plan.secondBlock ? nice(plan.secondBlock) : plan.second === "none" ? "none" : "the hotbar slot right of your hand";
  const body = [
    notice ? `${notice}§r\n` : "",
    `Shape: §b${planLabel(plan)}§r`,
    `Blocks: ${blocks}; second block: ${second}`,
    `Replace: ${REPLACE_NAMES[REPLACE.indexOf(plan.replace)]}`,
    `Modifiers: ${modsLabel(plan.mods)}${needsCenter(plan.mods) ? `, around ${plan.mods.center ? `${plan.mods.center.x} ${plan.mods.center.y} ${plan.mods.center.z}` : "the block each build starts at"}` : ""}`,
    s.on ? "§aBuild mode is on:§r placing a block builds the shape there. Sneak to place just one." : "Build mode is off: turn it on to build by placing a block, or use Build here now.",
    isCreative(player) || get("requireItems") !== true ? "Building is free in creative." : "Builds use blocks from your inventory; undo gives them back.",
  ]
    .filter(Boolean)
    .join("\n");
  /** @type {{ text: string, run: () => unknown }[]} */
  const actions = [
    { text: s.on ? "Build mode: §aOn" : "Build mode: Off", run: () => toggleMode(player) },
    { text: "Choose a shape", run: () => chooseShape(player) },
    { text: `Shape settings: ${shapeOf(plan.shape).name}`, run: () => shapeForm(player, plan.shape) },
    { text: "Blocks and placing", run: () => placingForm(player) },
    { text: "Build here now", run: () => buildHereMenu(player) },
    { text: `Modifiers: ${modsLabel(plan.mods)}`, run: () => modifiersForm(player) },
    { text: `Palette: ${paletteLabel(plan.palette)}${plan.src === "mix" ? "" : " (not in use)"}`, run: () => paletteForm(player) },
    { text: "Guides, reach and Air Build", run: () => guidesForm(player) },
    { text: "Copy, cut and paste", run: () => clipboardMenu(player) },
    { text: "Destroy mode", run: () => destroyMenu(player) },
  ];
  if (s.way?.pts.length) {
    const n = s.way.pts.length;
    if (n >= 2) actions.unshift({ text: `Finish the curve (${plural(n, "point")})`, run: async () => (await finishCurve(player), CLOSE) });
    actions.push({ text: "Forget the curve points", run: () => ((s.way = undefined), layoutCache.delete(player.id), noted(player, "§7Curve points forgotten")) });
  }
  if (!hasBook(player)) actions.push({ text: "Get a Building Book", run: () => giveBook(player) });
  if (s.start) actions.push({ text: "Forget the start block", run: () => ((s.start = undefined), noted(player, "§7Start block forgotten")) });
  const undoLabel = lastLabel(player, false), redoLabel = lastLabel(player, true);
  /** Undo or redo, and say what happened here (above the hotbar it's hidden by the menu). @param {boolean} redo */
  const step = async (redo) => (await undo(player, redo)) ?? `§eNothing was ${redo ? "redone" : "undone"}: chat says why.`;
  if (undoLabel) actions.push({ text: `Undo: ${undoLabel}`, run: () => step(false) });
  if (redoLabel) actions.push({ text: `Redo: ${redoLabel}`, run: () => step(true) });
  const form = new ActionFormData().title(TITLE).body(body);
  for (const a of actions) form.button(a.text);
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return CLOSE;
  return actions[res.selection]?.run();
}

/** Build mode on or off; what it is now. @param {Player} player */
function toggleMode(player) {
  const s = stateOf(player);
  s.on = !s.on;
  s.start = undefined;
  return noted(player, s.on ? `§aBuild mode on:§7 placing a block builds a ${planLabel(planOf(player))}` : "§7Build mode off: blocks place one at a time");
}

/** The list of shapes; picking one opens its settings, and Cancel there comes back here. @param {Player} player */
async function chooseShape(player) {
  while (player.isValid) {
    const form = new ActionFormData().title("Choose a shape");
    let group = "";
    for (const s of SHAPES) {
      if (s.group !== group) {
        group = s.group;
        form.header(group);
      }
      form.button(`${s.name}\n§8${s.about.length > 48 ? `${s.about.slice(0, 45)}...` : s.about}`);
    }
    form.button("Back");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || !player.isValid) return CLOSE;
    const shape = SHAPES[res.selection];
    if (!shape) return undefined;
    const out = await shapeForm(player, shape.id);
    if (out !== undefined) return out;
  }
  return CLOSE;
}

/**
 * The settings of one shape; saving picks it and turns build mode on. What it did, or undefined if canceled.
 * @param {Player} player @param {string} id
 */
async function shapeForm(player, id) {
  const plan = planOf(player);
  const shape = shapeOf(id);
  const probe = { ...plan, shape: id };
  const form = new ModalFormData().title(shape.name).label(shape.about);
  const size = get("maxSize");
  for (const key of shape.params) {
    const p = PARAMS[key];
    const cur = val(probe, key);
    if (p.type === "int") {
      const max = p.max === "size" ? size : p.max === "half" ? Math.max(1, Math.floor(size / 2)) : p.max ?? size;
      form.slider(p.label, p.min ?? 1, max, { defaultValue: Math.min(max, cur), valueStep: 1 });
    } else if (p.type === "bool") form.toggle(p.label, { defaultValue: !!cur });
    else form.dropdown(p.label, p.names ?? p.choices ?? [], { defaultValueIndex: Math.max(0, (p.choices ?? []).indexOf(cur)) });
  }
  if (shape.points) {
    form.dropdown("Size", ["From these numbers", "From two blocks you place (start, then end)"], { defaultValueIndex: plan.size === "points" ? 1 : 0 });
  }
  form.submitButton("Use this shape");
  const res = await show(player, form);
  if (!res || res.canceled || !player.isValid) return undefined;
  const values = inputs(res);
  /** @type {import("./shapes.js").Values} */
  const chosen = { ...(plan.values[id] ?? {}) };
  shape.params.forEach((key, i) => {
    const p = PARAMS[key];
    const v = values[i];
    if (p.type === "enum") chosen[key] = (p.choices ?? [])[Number(v)] ?? String(p.def);
    else if (p.type === "bool") chosen[key] = !!v;
    else chosen[key] = Number(v);
  });
  plan.values[id] = chosen;
  plan.shape = id;
  if (shape.points) plan.size = Number(values[shape.params.length]) === 1 ? "points" : "menu";
  savePlan(player, plan);
  const s = stateOf(player);
  s.on = true;
  s.start = undefined;
  if (!shape.way) s.way = undefined;
  const twoPoint = plan.size === "points";
  return said(
    player,
    shape.way
      ? `§a${shape.name}:§r build mode is on. Place a block at each point (or look and use /realm:build_here), then finish with /realm:build_finish or in /realm:build.`
      : twoPoint
        ? `§a${shape.name}:§r build mode is on. Place the start block, then the end block, and it fills the space between. Or look at a spot and use /realm:build_here twice.`
        : `§a${planLabel(plan)}:§r build mode is on. Place a block and it builds there, or look at a spot and use /realm:build_here. Sneak to place just one block.`
  );
}

/** Says it in chat too (kept there after the menu closes) and gives it back for the top of the menu. @param {Player} player @param {string} text */
function said(player, text) {
  player.sendMessage(text);
  return text;
}

/** Blocks, replace mode, where it goes, copies. @param {Player} player */
async function placingForm(player) {
  const plan = planOf(player);
  const creative = isCreative(player);
  const allowAll = creative || get("survivalReplaceAll") === true;
  const replaceNames = allowAll ? REPLACE_NAMES : REPLACE_NAMES.slice(0, 2);
  const form = new ModalFormData()
    .title("Blocks and placing")
    .dropdown("Main block", SRC_NAMES, { defaultValueIndex: SRC.indexOf(plan.src) })
    .textField("Main block id", "minecraft:stone_bricks", { defaultValue: plan.block })
    .dropdown("Second block (patterns, posts, trim)", SECOND_NAMES, { defaultValueIndex: SECOND.indexOf(plan.second) })
    .textField("Second block id", "minecraft:oak_log", { defaultValue: plan.secondBlock })
    .dropdown("Replace", replaceNames, { defaultValueIndex: Math.min(replaceNames.length - 1, REPLACE.indexOf(plan.replace)) })
    .dropdown("Where it goes", ANCHOR_NAMES, { defaultValueIndex: ANCHOR.indexOf(plan.anchor) })
    .slider("Move up or down", -16, 16, { defaultValue: Math.max(-16, Math.min(16, plan.up)), valueStep: 1 })
    .toggle("Turn it a quarter (sideways)", { defaultValue: plan.turn })
    .dropdown("Copies", COPIES_NAMES, { defaultValueIndex: COPIES.indexOf(plan.copies) })
    .slider("Repeat in a row", 1, 16, { defaultValue: plan.repeat, valueStep: 1 })
    .slider("Gap between repeats", 0, 16, { defaultValue: plan.gap, valueStep: 1 })
    .dropdown("Repeat toward", REPEAT_DIR_NAMES, { defaultValueIndex: REPEAT_DIR.indexOf(plan.repeatDir) })
    .submitButton("Save");
  const res = await show(player, form);
  if (!res || res.canceled || !player.isValid) return undefined;
  const v = inputs(res);
  const next = { ...plan };
  next.src = /** @type {Plan["src"]} */ (SRC[Number(v[0])] ?? "hand");
  next.block = String(v[1] ?? "").trim().toLowerCase();
  next.second = /** @type {Plan["second"]} */ (SECOND[Number(v[2])] ?? "next");
  next.secondBlock = String(v[3] ?? "").trim().toLowerCase();
  next.replace = /** @type {Plan["replace"]} */ (REPLACE[Number(v[4])] ?? "soft");
  next.anchor = /** @type {Plan["anchor"]} */ (ANCHOR[Number(v[5])] ?? "front");
  next.up = Math.round(Number(v[6]) || 0);
  next.turn = !!v[7];
  next.copies = /** @type {Plan["copies"]} */ (COPIES[Number(v[8])] ?? "none");
  next.repeat = Math.max(1, Math.round(Number(v[9]) || 1));
  next.gap = Math.max(0, Math.round(Number(v[10]) || 0));
  next.repeatDir = /** @type {Plan["repeatDir"]} */ (REPEAT_DIR[Number(v[11])] ?? "away");
  /** @type {string[]} */
  const problems = [];
  if (next.src === "typed" && !permOf(next.block)) problems.push(`there is no block called "${next.block}"`);
  if (next.second === "typed" && next.secondBlock && !permOf(next.secondBlock)) problems.push(`there is no block called "${next.secondBlock}"`);
  for (const id of [next.src === "typed" ? next.block : "", next.second === "typed" ? next.secondBlock : ""]) {
    const p = id && permOf(id);
    if (p && isForbidden(p.type.id)) problems.push(`${nice(p.type.id)} can't be built with the tools`);
  }
  if (problems.length) return said(player, `§eNot saved: ${problems.join("; ")}. Block ids look like minecraft:stone_bricks.`);
  savePlan(player, next);
  return said(player, `§aSaved.§r ${planLabel(next)}, replacing ${REPLACE_NAMES[REPLACE.indexOf(next.replace)].toLowerCase()}.`);
}

/** Mirror, radial and array, and their center. @param {Player} player */
async function modifiersForm(player) {
  const plan = planOf(player);
  const m = plan.mods;
  const c = m.center;
  const where = c ? `${c.x} ${c.y} ${c.z}${c.dim !== player.dimension.id ? " (in another dimension)" : ""}` : "the block each build starts at";
  const form = new ModalFormData()
    .title("Modifiers")
    .label(`Copies of every build, mirrored, turned around a center or repeated. Center now: ${where}.`)
    .dropdown("Center", ["Keep it", "Center here: the block you look at", "Center here: where you stand", "The block each build starts at"], { defaultValueIndex: 0 })
    .toggle("Mirror X (east-west)", { defaultValue: m.mirrorX })
    .toggle("Mirror Y (up-down)", { defaultValue: m.mirrorY })
    .toggle("Mirror Z (north-south)", { defaultValue: m.mirrorZ })
    .toggle("Mirror between blocks (not through the center block)", { defaultValue: m.half })
    .slider("Only within this many blocks of the center (0: no limit)", 0, 64, { defaultValue: Math.min(64, m.radius), valueStep: 1 })
    .toggle("Radial: turned around the center", { defaultValue: m.radial })
    .slider("Radial slices", 2, 16, { defaultValue: m.slices, valueStep: 1 })
    .toggle("Every other slice mirrored", { defaultValue: m.alt })
    .toggle("Array: repeat in a row", { defaultValue: m.array })
    .slider("Array step X (east)", -32, 32, { defaultValue: Math.max(-32, Math.min(32, m.ax)), valueStep: 1 })
    .slider("Array step Y (up)", -32, 32, { defaultValue: Math.max(-32, Math.min(32, m.ay)), valueStep: 1 })
    .slider("Array step Z (south)", -32, 32, { defaultValue: Math.max(-32, Math.min(32, m.az)), valueStep: 1 })
    .slider("Array copies", 1, 16, { defaultValue: m.count, valueStep: 1 })
    .submitButton("Save");
  const res = await show(player, form);
  if (!res || res.canceled || !player.isValid) return undefined;
  const v = inputs(res);
  /** @type {any} */
  const next = { ...m };
  const pick = Number(v[0]);
  if (pick === 1) {
    const hit = (() => {
      try {
        return player.getBlockFromViewDirection({ maxDistance: reachOf(player), includeLiquidBlocks: false, includePassableBlocks: false });
      } catch {
        return undefined;
      }
    })();
    if (!hit) return said(player, `§eNot saved: look at a block within ${reachOf(player)} blocks to center on it.`);
    next.center = { dim: player.dimension.id, ...hit.block.location };
  } else if (pick === 2) {
    const l = player.location;
    next.center = { dim: player.dimension.id, x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) };
  } else if (pick === 3) next.center = null;
  [next.mirrorX, next.mirrorY, next.mirrorZ, next.half] = [!!v[1], !!v[2], !!v[3], !!v[4]];
  next.radius = Number(v[5]) || 0;
  [next.radial, next.slices, next.alt] = [!!v[6], Number(v[7]) || 4, !!v[8]];
  [next.array, next.ax, next.ay, next.az, next.count] = [!!v[9], Number(v[10]) || 0, Number(v[11]) || 0, Number(v[12]) || 0, Number(v[13]) || 1];
  plan.mods = normalizeMods(next);
  savePlan(player, plan);
  const cc = plan.mods.center;
  const hand = get("handModifiers") === true && getFor(player, "modsByHand") === true ? " Blocks you place and break by hand get copies too." : "";
  return said(player, `§aModifiers:§r ${modsLabel(plan.mods)}${needsCenter(plan.mods) ? ` around ${cc ? `${cc.x} ${cc.y} ${cc.z}` : "the block each build starts at"}` : ""}.${hand}`);
}

/** Where the palette's blocks come from and how they are spread. @param {Player} player */
async function paletteForm(player) {
  const plan = planOf(player);
  const pal = plan.palette;
  const list = paletteBlocks(player, pal.from);
  const kinds = [...new Set(list.map((e) => nice(e.perm.type.id)))];
  const form = new ModalFormData()
    .title("Palette")
    .label(
      `Builds use your palette when the main block is "Your palette". Its blocks now: ${kinds.length ? kinds.slice(0, 12).join(", ") + (kinds.length > 12 ? "..." : "") : "none (put blocks in your hotbar)"}. Patterns go through the blocks in slot order.`
    )
    .toggle("Build with the palette (main block)", { defaultValue: plan.src === "mix" })
    .dropdown("Blocks from", FROM_NAMES, { defaultValueIndex: Math.max(0, FROM.indexOf(pal.from)) })
    .dropdown("Pattern", PATTERN_NAMES, { defaultValueIndex: Math.max(0, PATTERNS.indexOf(pal.pattern)) })
    .dropdown("Direction (stripes, gradient, wave, marble, dissolve)", DIR_NAMES, { defaultValueIndex: Math.max(0, DIRS.indexOf(pal.dir)) })
    .slider("Pattern size (blocks)", 1, 16, { defaultValue: pal.scale, valueStep: 1 })
    .submitButton("Save");
  const res = await show(player, form);
  if (!res || res.canceled || !player.isValid) return undefined;
  const v = inputs(res);
  plan.palette = normalizePalette({ from: FROM[Number(v[1])], pattern: PATTERNS[Number(v[2])], dir: DIRS[Number(v[3])], scale: Number(v[4]) });
  if (v[0]) plan.src = "mix";
  else if (plan.src === "mix") plan.src = "hand";
  savePlan(player, plan);
  return said(player, `§aPalette:§r ${paletteLabel(plan.palette)}${plan.src === "mix" ? ", in use" : ", not in use (builds use the block you place)"}.`);
}

/** The player's own guide, reach and Air Build choices (the same as in /realm:prefs). @param {Player} player */
async function guidesForm(player) {
  const STYLES = ["outline", "corners", "dots", "box", "off"];
  const STYLE_NAMES = ["Outline", "Corner outline", "Particles (a dot per block)", "Box edges (sparkles)", "Off"];
  const COLORS = ["white", "green", "cyan", "yellow", "orange", "purple"];
  const COLOR_NAMES = ["White", "Green", "Cyan", "Yellow", "Orange", "Purple"];
  const maxReach = Math.max(4, Number(get("reach")) || 16);
  const fastest = Math.max(1, Math.min(20, Number(get("guideFastest")) || 1));
  const air = get("airBuild") === true, hand = get("handModifiers") === true;
  const form = new ModalFormData()
    .title("Guides, reach and Air Build")
    .dropdown("Block guides", STYLE_NAMES, { defaultValueIndex: Math.max(0, STYLES.indexOf(String(getFor(player, "guideStyle")))) })
    .dropdown("Guide color", COLOR_NAMES, { defaultValueIndex: Math.max(0, COLORS.indexOf(String(getFor(player, "guideColor")))) })
    .slider("Guide refresh (ticks; 20 is once a second)", Math.min(19, fastest), 20, { defaultValue: guideRate(player), valueStep: 1 })
    .slider("My reach (blocks)", 4, Math.max(5, maxReach), { defaultValue: reachOf(player), valueStep: 1 });
  if (air) {
    form
      .toggle("Air Build: with nothing in reach, using a block in the air builds in midair", { defaultValue: getFor(player, "airMode") === true })
      .slider("Air Build distance (blocks)", 1, maxReach, { defaultValue: Math.min(maxReach, Number(getFor(player, "airDistance")) || 4), valueStep: 1 });
  }
  if (hand) form.toggle("Modifiers copy blocks I place and break by hand", { defaultValue: getFor(player, "modsByHand") === true });
  form.toggle("Build mode line above the hotbar", { defaultValue: getFor(player, "hint") === true }).submitButton("Save");
  const res = await show(player, form);
  if (!res || res.canceled || !player.isValid) return undefined;
  const v = inputs(res);
  let i = 0;
  setFor(player, "guideStyle", STYLES[Number(v[i++])] ?? "outline");
  setFor(player, "guideColor", COLORS[Number(v[i++])] ?? "white");
  setFor(player, "guideRate", Math.round(Number(v[i++]) || 4));
  setFor(player, "myReach", Math.round(Number(v[i++]) || 16));
  if (air) {
    setFor(player, "airMode", !!v[i++]);
    setFor(player, "airDistance", Math.round(Number(v[i++]) || 4));
  }
  if (hand) setFor(player, "modsByHand", !!v[i++]);
  setFor(player, "hint", !!v[i++]);
  layoutCache.delete(player.id);
  return said(player, `§aSaved.§r Guides: ${STYLE_NAMES[STYLES.indexOf(String(getFor(player, "guideStyle")))] ?? "Outline"}; reach ${reachOf(player)}${airOn(player) ? `; Air Build on, ${getFor(player, "airDistance")} blocks away` : ""}.`);
}

/** Does the player carry a Building Book? @param {Player} player */
function hasBook(player) {
  const c = containerOf(player);
  if (!c) return false;
  for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === BOOK) return true;
  return false;
}

/** Gives the player a Building Book (one at a time); what happened. @param {Player} player */
function giveBook(player) {
  if (hasBook(player)) return "§eYou already have a Building Book. Use it to open Easy Building; sneak and use it to turn build mode on or off.";
  let book;
  try {
    book = new ItemStack(BOOK, 1);
  } catch {
    return "§eThe Building Book isn't available on this realm.";
  }
  book.setLore(["Use: open Easy Building", "Sneak and use: build mode on or off"]);
  const rest = containerOf(player)?.addItem(book);
  if (rest) player.dimension.spawnItem(rest, player.location);
  return "§aHere's a Building Book.§r Use it to open Easy Building; sneak and use it to turn build mode on or off.";
}

/**
 * Outline at the block you look at for a few seconds, then confirm with the cost. For the menu: why it can't (a
 * string), undefined when canceled (the menu comes back), CLOSE otherwise.
 * @param {Player} player
 */
async function buildHereMenu(player) {
  const plan = planOf(player);
  if ((plan.size === "points" && shapeOf(plan.shape).points) || shapeOf(plan.shape).way) return buildHere(player).then(() => CLOSE);
  const T = lookTarget(player);
  if (!T) return `§eLook at a block within ${reachOf(player)} blocks first (close this menu, look, and pick Build here now again).`;
  const mats = materialsOf(player, plan);
  if (typeof mats === "string") return `§e${mats}`;
  let cells;
  try {
    cells = await worldCells(plan, mats, T, frameOf(facingOf(player), plan.turn), undefined, limitOf(player), player.dimension.id);
  } catch (e) {
    if (!(e instanceof TooBig)) throw e;
    return tooBig(player, e);
  }
  // The guide over the real blocks for a few seconds (drawn every `guideRate` ticks, each lasting until the next).
  const secs = Math.max(0, get("previewSeconds"));
  const rate = guideRate(player);
  for (let t = 0; t < secs * 20; t += rate) {
    if (!player.isValid) return CLOSE;
    drawGuide(player, cells, "build", { force: true, preview: true });
    await new Promise((r) => system.runTimeout(() => r(undefined), rate));
  }
  /** @type {Map<string, number>} */
  const need = new Map();
  for (const c of cells) {
    const cost = costOf(c.perm);
    if (cost) need.set(cost, (need.get(cost) ?? 0) + 1);
  }
  const have = countItems(player);
  const pay = !isCreative(player) && get("requireItems") === true;
  const lines = [`${planLabel(plan)}: up to ${plural(cells.length, "block")} at ${T.x} ${T.y} ${T.z}.`];
  if (pay) {
    lines.push("Uses from your inventory (spots already filled cost nothing):");
    for (const [id, n] of [...need].slice(0, 8)) {
      const h = have.get(id) ?? 0;
      lines.push(`${h >= n ? "§a" : "§c"}${n} ${nice(id)}§r (you have ${h})`);
    }
  } else lines.push("Free in creative.");
  const res = await show(player, new MessageFormData().title(TITLE).body(lines.join("\n")).button1("Build it").button2("Cancel"));
  if (!res || !player.isValid) return CLOSE;
  if (res.canceled || res.selection !== 0) return undefined;
  if (stateOf(player).busy) return "§eWait for the last build to finish.";
  await build(player, player.dimension, cells, planLabel(plan), { mode: replaceMode(player, plan) });
  return CLOSE;
}

/** /realm:build_here: builds at the block you look at, no questions. @param {Player} player */
async function buildHere(player) {
  if (stateOf(player).busy) return player.sendMessage("§eWait for the last build to finish.");
  const T = lookTarget(player);
  if (!T) return player.sendMessage(`§eLook at a block within ${reachOf(player)} blocks first${get("airBuild") === true ? ", or turn on Air Build (/realm:build -> Guides, reach and Air Build)" : ""}.`);
  await buildAt(player, T);
}

// Callings (Skills): realm:calling carries each player's talent numbers (`bonus`: buildEye: Builder's Eye's percent more blocks). Kept in memory; Skills
// sends it when a player joins or changes it, and again on realm:calling_ping (asked once the world has loaded).
/** @type {Map<string, Record<string, number>>} */
const callingBonus = new Map();
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:calling") return;
    try {
      const m = JSON.parse(message);
      if (m && typeof m.player === "string" && m.bonus && typeof m.bonus === "object") callingBonus.set(m.player, m.bonus);
    } catch {
      // not ours
    }
  },
  { namespaces: ["realm"] },
);
world.afterEvents.worldLoad.subscribe(() => system.runTimeout(() => system.sendScriptEvent("realm:calling_ping", "{}"), 140));
world.afterEvents.playerLeave.subscribe(({ playerId }) => callingBonus.delete(playerId));
/** A Calling talent's number for the player (0 without it). @param {Player} player @param {string} key */
const callingValue = (player, key) => Math.max(0, Number(callingBonus.get(player.id)?.[key]) || 0);

// ---------------------------------------------------------------------------
// Commands and script events
// ---------------------------------------------------------------------------

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id === "realm:help_ping") {
      system.sendScriptEvent("realm:help_pong", "build_bp");
      return;
    }
    if (id === "realm:claims_check_result") {
      try {
        const msg = JSON.parse(message);
        claimsAnswered = true;
        const done = asking.get(String(msg?.id));
        if (!done) return;
        asking.delete(String(msg.id));
        done(Array.isArray(msg.claims) ? msg.claims.map((/** @type {any} */ c) => ({ n: String(c?.n ?? "someone") })) : []);
      } catch {
        // not for us
      }
      return;
    }
    if (id === "realm:actionbar") {
      // Another pack's note: the build mode line waits while it shows (a steady line, like the HUD).
      try {
        const req = JSON.parse(message);
        if (!req || typeof req.player !== "string" || req.from === PACK || req.background === true) return;
        const s = states.get(req.player);
        if (s) s.paused = Math.max(s.paused, system.currentTick + Math.min(Math.max(Number(req.ticks) || 40, 0), 200));
      } catch {
        // not for us
      }
    }
  },
  { namespaces: ["realm"] }
);

// Learn early whether Land Claims is installed, so the first build doesn't wait for it.
world.afterEvents.worldLoad.subscribe(() =>
  system.runTimeout(() => system.sendScriptEvent("realm:claims_check", JSON.stringify({ id: "hello", player: "", dim: "minecraft:overworld", x1: 0, z1: 0, x2: 0, z2: 0 })), 60)
);

/**
 * @param {string} name @param {string} description @param {(player: Player) => unknown} run
 * @param {import("@minecraft/server").CustomCommandRegistry} registry
 */
function command(registry, name, description, run) {
  registry.registerCommand(
    { name, description, permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      const why = refusal(player);
      if (why) return { status: CustomCommandStatus.Failure, message: why };
      system.run(async () => {
        if (!player.isValid) return; // left in the meantime
        try {
          await run(player);
        } catch (e) {
          console.warn(`[build] ${e}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry: r }) => {
  command(r, "realm:build", "Easy Building: pick a shape, its blocks and where it goes", mainMenu);
  command(r, "realm:build_here", "Build your shape at the block you look at", buildHere);
  command(r, "realm:build_mode", "Build mode on or off: placing a block builds your shape", toggleMode);
  command(r, "realm:build_undo", "Undo your last build (blocks come back)", (p) => undo(p, false));
  command(r, "realm:build_redo", "Build again what you last undid", (p) => undo(p, true));
  command(r, "realm:build_finish", "Build your curve through the points you placed", finishCurve);
  command(r, "realm:build_book", "Get a Building Book: use it to open Easy Building", (p) => p.sendMessage(giveBook(p)));
  command(r, "realm:build_copy", "Copy the region you selected (or start selecting one)", copyCommand);
  command(r, "realm:build_cut", "Cut the region you selected: copy it and take it away", cutCommand);
  command(r, "realm:build_paste", "Paste your copy at the block you look at, turned to face your way", pasteCommand);
  command(r, "realm:build_destroy", "Destroy mode on or off: breaking a block with a pickaxe, axe or shovel breaks your shape", toggleDestroy);
});

// ---------------------------------------------------------------------------
// What clipboard.js, destroy.js and undo.js use from here
// ---------------------------------------------------------------------------

/**
 * World positions of the player's shape at T (or between T and `end` in two-block mode). Throws TooBig.
 * @param {Player} player @param {{ x: number, y: number, z: number }} T @param {{ x: number, y: number, z: number }} [end]
 */
function shapeAt(player, T, end) {
  const plan = planOf(player);
  const fr = frameOf(facingOf(player), plan.turn);
  const rel = relCells(plan, false, end ? pointsBox(T, end, fr) : undefined, limitOf(player));
  const pos = rel.map(({ du, dv, dw }) => ({ x: T.x + du * fr.R[0] + dw * fr.F[0], y: T.y + dv, z: T.z + du * fr.R[1] + dw * fr.F[1] }));
  return finishCells(plan, pos, T, limitOf(player), player.dimension.id);
}

/** Are any modifiers on (so a layout depends on where it is, not only on its shape)? @param {Player} player */
const modsActive = (player) => modsOn(planOf(player).mods);

/**
 * The player's modifier copies added to a list of blocks (a paste), each copy's block turned or mirrored.
 * @template {{ x: number, y: number, z: number, perm?: BlockPermutation }} C @param {Player} player @param {C[]} cells @param {Pos} T @returns {C[]}
 */
function withMods(player, cells, T) {
  const plan = planOf(player);
  if (!modsOn(plan.mods)) return cells;
  try {
    return applyMods(cells, plan.mods, centerOf(plan, T, player.dimension.id), limitOf(player));
  } catch (e) {
    if (e instanceof RangeError) throw new TooBig(Math.max(limitOf(player) + 1, Number(e.message) || 0));
    throw e;
  }
}

/** How far in front of the eyes a spot in the air is (Air Build distance, within reach). @param {Player} player */
const airDistance = (player) => Math.max(1, Math.min(reachOf(player), Number(getFor(player, "airDistance")) || 4));

/** The selection box and other plain boxes, as sparkles along its edges. @param {Player} player @param {{ min: Pos, max: Pos }} box */
const drawSelection = (player, box) => drawBox(player, box.min, box.max, String(getFor(player, "particle")));

/** Two-block mode is set for the current shape. @param {Player} player */
const twoBlocks = (player) => {
  const plan = planOf(player);
  return plan.size === "points" && !!shapeOf(plan.shape).points;
};

/** @param {Player} player @param {boolean} on */
function setBuildMode(player, on) {
  const s = stateOf(player);
  s.on = on;
  s.start = undefined;
}

const ctx = {
  isOp, isCreative, cantBuild, CANT_BUILD, note, show, inputs, permOf, nice, plural, containerOf, countItems, giveItems, refund,
  build, areaRefusal, isProtectedBlock, isForbidden, isSoft, stacked, costOf, facingOf, frameOf, FACINGS, lookTarget, planOf,
  replaceMode, limitOf, stateOf, refusal, tick, AIR, boundsOf, drawBox: drawSelection, shapeAt, modsActive, withMods, airDistance, reachOf, twoBlocks, planLabel, CLOSE, noted, setBuildMode, TooBig, tooBig,
};
/** @typedef {typeof ctx} Ctx */
setupUndo(ctx);
setupClipboard(ctx);
setupDestroy(ctx);
