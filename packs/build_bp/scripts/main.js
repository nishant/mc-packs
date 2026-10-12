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
import { PARAMS, SHAPES, boxOf, cellsOf, shapeOf, valueOf } from "./shapes.js";
import { allZones } from "./zones.js";

const PACK = "build_bp";
const PLAN_PROP = "build:plan"; // player: JSON Plan
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
};

const SRC = ["hand", "mix", "typed"];
const SRC_NAMES = ["The block you place (or hold)", "Random mix of your hotbar blocks", "The block id typed below"];
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
 * @typedef {{ x: number, y: number, z: number, before: BlockPermutation, after: BlockPermutation, cost?: string }} Placed
 * @typedef {{ dim: string, label: string, cells: Placed[] }} BuildRecord
 * @typedef {{ on: boolean, start?: { dim: string, x: number, y: number, z: number, id: string, paid?: string }, busy: boolean, undo: BuildRecord[], redo: BuildRecord[], paused: number, hintAt: number }} State
 */

/** @type {Map<string, State>} */
const states = new Map();
/** @param {Player} player @returns {State} */
function stateOf(player) {
  let s = states.get(player.id);
  if (!s) states.set(player.id, (s = { on: false, busy: false, undo: [], redo: [], paused: 0, hintAt: 0 }));
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
  if (plan.size === "points" && s.points) return `${s.name} (between two blocks)`;
  const { W, H, D } = boxOf(plan.shape, (k) => val(plan, k));
  return `${s.name} ${W} x ${H} x ${D}`;
}

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

/** Hotbar block items, each once. @param {Player} player @returns {{ perm: BlockPermutation, item: string }[]} */
function hotbarBlocks(player) {
  const c = containerOf(player);
  if (!c) return [];
  const seen = new Set();
  const out = [];
  for (let i = 0; i < 9; i++) {
    const item = c.getItem(i);
    const perm = blockOfItem(item);
    if (!perm || !item || seen.has(item.typeId) || isForbidden(perm.type.id)) continue;
    seen.add(item.typeId);
    out.push({ perm, item: item.typeId });
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

/** Takes up to n of an item from the inventory (hotbar last). @param {Player} player @param {string} id @param {number} n */
function takeItems(player, id, n) {
  const c = containerOf(player);
  if (!c || n <= 0) return 0;
  let taken = 0;
  const order = [];
  for (let i = 9; i < c.size; i++) order.push(i);
  for (let i = 0; i < 9; i++) order.push(i);
  for (const i of order) {
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
      const rest = c?.addItem(stack) ?? stack;
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
 * The blocks a build uses.
 * @typedef {{ main: () => BlockPermutation, base: BlockPermutation, second?: BlockPermutation, mix?: string[] }} Materials
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
  /** @type {(() => BlockPermutation) | undefined} */
  let main;
  /** @type {string[] | undefined} */
  let mix;
  if (plan.src === "typed") {
    base = permOf(plan.block.trim());
    if (!base) return `There is no block called "${plan.block}". Change it in /realm:build -> Blocks and placing.`;
    if (base.type.id === "minecraft:air" && (survival || !isOp(player))) return "Only operators in creative can build with air.";
  } else if (plan.src === "mix") {
    const list = hotbarBlocks(player);
    if (!list.length) return "Put some blocks in your hotbar for the random mix.";
    const have = countItems(player);
    const left = list.map((b) => (survival ? have.get(b.item) ?? 0 : 1));
    base = list[0].perm;
    mix = list.map((b) => nice(b.perm.type.id));
    main = () => {
      let total = left.reduce((a, b) => a + b, 0);
      if (total <= 0) {
        left.fill(1);
        total = left.length;
      }
      let r = Math.random() * total;
      let i = 0;
      for (; i < left.length - 1; i++) {
        r -= left[i];
        if (r < 0) break;
      }
      if (survival) left[i] = Math.max(0, left[i] - 1);
      return list[i].perm;
    };
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
  }
  if (second && isForbidden(second.type.id)) return `${nice(second.type.id)} can't be built with the tools.`;
  const fixed = base;
  return { main: main ?? (() => fixed), base, second, mix };
}

// ---------------------------------------------------------------------------
// Layout: shape cells -> world blocks
// ---------------------------------------------------------------------------

const FACINGS = [[0, 1], [-1, 0], [0, -1], [1, 0]]; // yaw 0 (south), 90 (west), 180 (north), -90 (east)
/** The way a player faces, snapped to x or z. @param {Player} player @returns {number[]} */
function facingOf(player) {
  const yaw = player.getRotation().y;
  return FACINGS[(((Math.round(yaw / 90) % 4) + 4) % 4)];
}
/** Right and forward in the world. @param {number[]} F @param {boolean} turn */
function frameOf(F, turn) {
  const R = [-F[1], F[0]];
  return turn ? { R: F, F: [-R[0], -R[1]] } : { R, F };
}

/** @typedef {{ du: number, dv: number, dw: number, c: import("./shapes.js").Cell }} Rel */

/** @type {Map<string, { key: string, rel: Rel[], min: number[], max: number[] }>} preview boxes per player */
const layoutCache = new Map();

/**
 * The shape's cells relative to the block it is built at (du right, dv up, dw away), copies included.
 * @param {Plan} plan @param {boolean} stairs @param {{ W: number, H: number, D: number, a: number[], b: number[] }} [pts]
 * @returns {Rel[]}
 */
function relCells(plan, stairs, pts) {
  const v = (/** @type {string} */ k) => val(plan, k);
  let W, H, D, au, av, aw;
  /** @type {Map<string, import("./shapes.js").Cell>} */
  let cells;
  if (pts) {
    ({ W, H, D } = pts);
    // Two blocks at the same height: the shape keeps the height from its settings.
    if (H === 1 && shapeOf(plan.shape).params.includes("height")) H = v("height");
    [au, av, aw] = pts.a;
    cells = cellsOf(plan.shape, v, W, H, D, { a: pts.a, b: pts.b }, stairs);
  } else {
    ({ W, H, D } = boxOf(plan.shape, v));
    au = plan.anchor === "corner" ? 0 : Math.floor((W - 1) / 2);
    aw = plan.anchor === "center" ? Math.floor((D - 1) / 2) : 0;
    av = -Math.max(-32, Math.min(32, plan.up));
    cells = cellsOf(plan.shape, v, W, H, D, undefined, stairs);
  }
  /** @type {Rel[]} */
  let rel = [...cells.values()].map((c) => ({ du: c.u - au, dv: c.v - av, dw: c.w - aw, c }));
  const n = Math.max(1, Math.min(16, Math.round(plan.repeat)));
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
 * The world blocks of a build at T.
 * @param {Plan} plan @param {Materials} mats @param {{ x: number, y: number, z: number }} T
 * @param {{ R: number[], F: number[] }} fr @param {{ x: number, y: number, z: number }} [B] two-point mode: the end
 * @returns {WorldCell[]}
 */
function worldCells(plan, mats, T, fr, B) {
  const stairs = isStair(mats.base);
  const rel = relCells(plan, stairs, B ? pointsBox(T, B, fr) : undefined);
  const { R, F } = fr;
  /** @param {number[]} d */
  const wd = (d) => [d[0] * R[0] + d[1] * F[0], d[0] * R[1] + d[1] * F[1]];
  /** @type {WorldCell[]} */
  const out = [];
  for (const { du, dv, dw, c } of rel) {
    /** @type {BlockPermutation | undefined} */
    let perm;
    let late = false;
    switch (c.k) {
      case "m":
        perm = mats.main();
        break;
      case "a":
        perm = mats.second ?? (c.fb ? permOf(c.fb) : undefined) ?? mats.main();
        break;
      case "s": {
        const m = mats.main();
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
    out.push({ x: T.x + du * R[0] + dw * F[0], y: T.y + dv, z: T.z + du * R[1] + dw * F[1], perm, late });
  }
  // Bottom up, things that hang on others last.
  out.sort((a, b) => (a.late === b.late ? a.y - b.y : a.late ? 1 : -1));
  return out;
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
 * @param {{ x: number, y: number, z: number, perm: BlockPermutation, expect?: string }[]} cells `expect`: only where this block is (redo)
 * @param {string} label
 * @param {{ mode: "air" | "soft" | "all", redo?: boolean }} opts
 * @returns {Promise<boolean>} whether anything was built
 */
async function build(player, dim, cells, label, opts) {
  const s = stateOf(player);
  const creative = isCreative(player);
  const limit = creative ? get("maxBlocksCreative") : get("maxBlocks");
  if (!cells.length) {
    player.sendMessage("§eNothing to build: the shape has no blocks.");
    return false;
  }
  if (cells.length > limit) {
    player.sendMessage(`§eThat's ${cells.length} blocks; the most one build can place is ${limit}${creative ? "" : " in survival"}. Make it smaller.`);
    return false;
  }
  const { min, max } = boundsOf(cells);
  if (!isOp(player) && get("safeZonesOperatorsOnly") === true) {
    const zone = safeZoneIn(dim.id, min, max);
    if (zone) {
      player.sendMessage(`§eThat would build in the safe zone ${zone.name}. Only operators can build there with the tools.`);
      return false;
    }
  }
  s.busy = true;
  try {
    if (get("inOthersClaims") !== true) {
      const claims = await claimsIn(player, dim.id, min, max);
      if (!player.isValid) return false;
      if (!claims) {
        player.sendMessage("§eLand Claims didn't answer, so nothing was built. Try again.");
        return false;
      }
      if (claims.length) {
        player.sendMessage(`§eThat would reach into ${claims[0].n}'s claim. Build somewhere else, or make it smaller.`);
        return false;
      }
    }
    const range = dim.heightRange;
    const perTick = Math.max(10, get("blocksPerTick"));

    // 1. What can go where (reading only).
    /** @type {{ x: number, y: number, z: number, perm: BlockPermutation, expect?: string, cost?: string }[]} */
    const todo = [];
    let blocked = 0, unloaded = 0, unpayable = 0;
    const pay = !creative && get("requireItems") === true;
    for (let i = 0; i < cells.length; i++) {
      if (i && i % (perTick * 4) === 0) {
        await tick();
        if (!player.isValid) return false;
      }
      const c = cells[i];
      if (c.y < range.min || c.y >= range.max) {
        blocked++;
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
      if (!pay) {
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

    // 3. Place, a few hundred blocks a tick.
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
      if (!block || (opts.redo ? block.typeId !== c.expect : !replaceable(block.typeId, opts.mode))) {
        if (c.cost) paid.set(c.cost, (paid.get(c.cost) ?? 0) + 1);
        changed++;
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
    // Anything paid for but not placed goes back.
    for (const [id, n] of [...paid]) if (n <= 0) paid.delete(id);
    if (paid.size && player.isValid) giveItems(player, paid);

    if (placed.length) {
      s.undo.push({ dim: dim.id, label, cells: placed });
      while (s.undo.length > Math.max(1, get("undoSteps"))) s.undo.shift();
      if (!opts.redo) s.redo = [];
    }
    if (!player.isValid) return placed.length > 0;
    const skipped = blocked + changed;
    const notes = [];
    if (skipped) notes.push(`${plural(skipped, "spot")} already taken`);
    if (unloaded) notes.push(`${plural(unloaded, "block")} too far away`);
    if (unpayable) notes.push(`${plural(unpayable, "block")} that can't be built in survival`);
    if (!placed.length) {
      player.sendMessage(short.length ? `§eNot enough blocks: you need ${short.join(", ")}.` : `§eNothing was built${notes.length ? `: ${notes.join(", ")}` : ""}.`);
      return false;
    }
    note(player, `§aBuilt ${plural(placed.length, "block")}§7 - /realm:build_undo takes it back`);
    if (short.length) player.sendMessage(`§eOut of blocks: built ${placed.length} of ${todo.length}. Still needed: ${short.join(", ")}.`);
    if (notes.length && skipped + unloaded + unpayable >= Math.max(4, cells.length / 10)) player.sendMessage(`§7Skipped ${notes.join(", ")}.`);
    return true;
  } finally {
    s.busy = false;
  }
}

/**
 * Undoes (or redoes) the player's last build.
 * @param {Player} player @param {boolean} redo
 */
async function undo(player, redo) {
  const s = stateOf(player);
  if (s.busy) return player.sendMessage("§eWait for the build to finish.");
  const list = redo ? s.redo : s.undo;
  const rec = list.pop();
  if (!rec) return player.sendMessage(redo ? "§eNothing to redo." : "§eNothing to undo. Builds are forgotten when the server restarts.");
  const dim = world.getDimension(rec.dim);
  if (redo) {
    const cells = rec.cells.map((c) => ({ x: c.x, y: c.y, z: c.z, perm: c.after, expect: c.before.type.id }));
    const ok = await build(player, dim, cells, rec.label, { mode: "air", redo: true });
    if (!ok) s.redo.push(rec);
    return;
  }
  s.busy = true;
  try {
    const perTick = Math.max(10, get("blocksPerTick"));
    /** @type {Map<string, number>} */
    const refund = new Map();
    let back = 0, gone = 0;
    for (let i = rec.cells.length - 1, n = 0; i >= 0; i--, n++) {
      if (n && n % perTick === 0) await tick();
      const c = rec.cells[i];
      let block;
      try {
        block = dim.getBlock(c);
      } catch {
        block = undefined;
      }
      if (!block || block.typeId !== c.after.type.id) {
        gone++;
        continue;
      }
      try {
        block.setPermutation(c.before);
      } catch {
        gone++;
        continue;
      }
      back++;
      if (c.cost) refund.set(c.cost, (refund.get(c.cost) ?? 0) + 1);
    }
    if (player.isValid && refund.size) giveItems(player, refund);
    if (back) s.redo.push(rec);
    while (s.redo.length > Math.max(1, get("undoSteps"))) s.redo.shift();
    if (!player.isValid) return;
    const given = [...refund.values()].reduce((a, b) => a + b, 0);
    note(player, `§aUndone: ${rec.label}§7 (${plural(back, "block")}${given ? `, ${given} given back` : ""})`);
    if (gone) player.sendMessage(`§7${plural(gone, "block")} had changed since and stayed as they are.`);
  } finally {
    s.busy = false;
  }
}

// ---------------------------------------------------------------------------
// Where to build: the block you look at, or the block you placed
// ---------------------------------------------------------------------------

/** @type {Record<string, number[]>} */
const FACE = { Up: [0, 1, 0], Down: [0, -1, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0] };

/** The spot a block would be placed on the face you look at. @param {Player} player */
function lookTarget(player) {
  let hit;
  try {
    hit = player.getBlockFromViewDirection({ maxDistance: get("reach"), includeLiquidBlocks: false, includePassableBlocks: false });
  } catch {
    hit = undefined;
  }
  if (!hit) return undefined;
  const n = FACE[hit.face] ?? [0, 1, 0];
  const b = hit.block.location;
  return { x: b.x + n[0], y: b.y + n[1], z: b.z + n[2] };
}

/**
 * Builds the player's shape at T (or between their start block and T).
 * @param {Player} player @param {{ x: number, y: number, z: number }} T @param {BlockPermutation} [placed]
 */
async function buildAt(player, T, placed) {
  const plan = planOf(player);
  const s = stateOf(player);
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
    s.start = undefined;
    const size = get("maxSize");
    const span = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y), Math.abs(end.z - start.z)) + 1;
    if (span > size) {
      player.sendMessage(`§eThose blocks are ${span} apart; a shape can be at most ${size} blocks each way. Place the start block again.`);
      return false;
    }
  }
  const cells = worldCells(plan, mats, start, fr, end);
  const label = twoPoint ? shapeOf(plan.shape).name : planLabel(plan);
  return build(player, player.dimension, cells, label, { mode: replaceMode(player, plan) });
}

// ---------------------------------------------------------------------------
// Build mode: placing a block builds the shape
// ---------------------------------------------------------------------------

world.afterEvents.playerPlaceBlock.subscribe(({ player, block }) => {
  const s = states.get(player.id);
  if (!s?.on || player.isSneaking) return;
  if (refusal(player)) return;
  if (s.busy) {
    note(player, "§eStill building the last one...");
    return;
  }
  const perm = block.permutation;
  // Two-block things (doors, beds, tall flowers) and forbidden blocks place normally.
  if (isForbidden(perm.type.id) || perm.getState("upper_block_bit") !== undefined) return;
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
  // The placed blocks only mark the spot: they go back into your hand and the build starts there.
  /** @type {Map<string, number>} */
  const back = new Map();
  /** @param {{ x: number, y: number, z: number }} p @param {string} id @param {string | undefined} paid */
  const lift = (p, id, paid) => {
    try {
      const b = dim.getBlock(p);
      if (b && b.typeId === id) {
        b.setPermutation(AIR());
        if (paid) back.set(paid, (back.get(paid) ?? 0) + 1);
      }
    } catch {
      // unloaded
    }
  };
  lift(T, perm.type.id, survival ? costOf(perm) ?? undefined : undefined);
  if (twoPoint && s.start) lift(s.start, s.start.id, s.start.paid);
  if (back.size) giveItems(player, back);
  buildAt(player, T, perm).catch((e) => console.warn(`[build] ${e}`));
});

// ---------------------------------------------------------------------------
// Outline preview and the build mode line
// ---------------------------------------------------------------------------

/**
 * The box a build would fill at T, relative cells cached per plan.
 * @param {Player} player @param {Plan} plan @param {{ x: number, y: number, z: number }} T
 */
function previewBox(player, plan, T) {
  const fr = frameOf(facingOf(player), plan.turn);
  const s = stateOf(player);
  const twoPoint = plan.size === "points" && shapeOf(plan.shape).points;
  if (twoPoint && s.start && s.start.dim === player.dimension.id) {
    const a = s.start;
    const flat = a.y === T.y && shapeOf(plan.shape).params.includes("height") ? val(plan, "height") - 1 : 0;
    return { min: { x: Math.min(a.x, T.x), y: Math.min(a.y, T.y), z: Math.min(a.z, T.z) }, max: { x: Math.max(a.x, T.x), y: Math.max(a.y, T.y) + flat, z: Math.max(a.z, T.z) } };
  }
  if (twoPoint) return { min: T, max: T };
  const key = JSON.stringify(plan) + fr.R.join() + fr.F.join() + get("maxSize");
  let cached = layoutCache.get(player.id);
  if (!cached || cached.key !== key) {
    const rel = relCells(plan, false);
    const pts = rel.map((r) => ({ x: r.du * fr.R[0] + r.dw * fr.F[0], y: r.dv, z: r.du * fr.R[1] + r.dw * fr.F[1] }));
    const b = pts.length ? boundsOf(pts) : { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    cached = { key, rel, min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] };
    layoutCache.set(player.id, cached);
  }
  return {
    min: { x: T.x + cached.min[0], y: T.y + cached.min[1], z: T.z + cached.min[2] },
    max: { x: T.x + cached.max[0], y: T.y + cached.max[1], z: T.z + cached.max[2] },
  };
}

/**
 * Sparkles along the 12 edges of a box (whole blocks min..max), only the player sees them.
 * @param {Player} player @param {{ min: { x: number, y: number, z: number }, max: { x: number, y: number, z: number } }} box
 */
function drawBox(player, box) {
  const particle = String(getFor(player, "particle"));
  const x0 = box.min.x, y0 = box.min.y, z0 = box.min.z, x1 = box.max.x + 1, y1 = box.max.y + 1, z1 = box.max.z + 1;
  const perimeter = 4 * (x1 - x0 + y1 - y0 + z1 - z0);
  const step = Math.max(0.5, perimeter / 240);
  /** @param {number[]} a @param {number[]} b */
  const edge = (a, b) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      try {
        player.spawnParticle(particle, { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, z: a[2] + (b[2] - a[2]) * f });
      } catch {
        // unloaded or a bad particle
      }
    }
  };
  for (const y of [y0, y1]) {
    edge([x0, y, z0], [x1, y, z0]);
    edge([x0, y, z1], [x1, y, z1]);
    edge([x0, y, z0], [x0, y, z1]);
    edge([x1, y, z0], [x1, y, z1]);
  }
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) edge([x, y0, z], [x, y1, z]);
}

/** Is the player holding a block that can be placed? @param {Player} player */
const holdingBlock = (player) => !!blockOfItem(containerOf(player)?.getItem(player.selectedSlotIndex));

system.runInterval(() => {
  const now = system.currentTick;
  for (const player of world.getAllPlayers()) {
    const s = states.get(player.id);
    if (!s?.on) continue;
    try {
      if (refusal(player)) continue;
      if (!holdingBlock(player)) continue;
      const plan = planOf(player);
      if (getFor(player, "preview") === true) {
        const T = lookTarget(player);
        if (T) drawBox(player, previewBox(player, plan, T));
      }
      if (now - s.hintAt >= 20 && now >= s.paused && getFor(player, "hint") === true) {
        s.hintAt = now;
        const twoPoint = plan.size === "points" && shapeOf(plan.shape).points;
        const text = twoPoint && s.start
          ? `§bBuild: §f${shapeOf(plan.shape).name}§7 - place the end block (start ${s.start.x} ${s.start.y} ${s.start.z})`
          : twoPoint
            ? `§bBuild: §f${shapeOf(plan.shape).name}§7 - place the start block (sneak: just one block)`
            : `§bBuild: §f${planLabel(plan)}§7 - place a block (sneak: just one)`;
        system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: player.id, ticks: HINT_TICKS, from: PACK }));
        player.onScreenDisplay.setActionBar(text);
      }
    } catch (e) {
      console.warn(`[build] ${e}`);
    }
  }
}, 10);

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  const s = states.get(playerId);
  if (s) {
    s.on = false;
    s.start = undefined;
  }
  layoutCache.delete(playerId);
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

/** @param {Player} player */
async function mainMenu(player) {
  const why = refusal(player);
  if (why) return player.sendMessage(`§e${why}`);
  const s = stateOf(player);
  const plan = planOf(player);
  const blocks = plan.src === "typed" ? nice(plan.block) : plan.src === "mix" ? "a random mix of your hotbar blocks" : "the block you place";
  const second = plan.second === "typed" && plan.secondBlock ? nice(plan.secondBlock) : plan.second === "none" ? "none" : "the hotbar slot right of your hand";
  const body = [
    `Shape: §b${planLabel(plan)}§r`,
    `Blocks: ${blocks}; second block: ${second}`,
    `Replace: ${REPLACE_NAMES[REPLACE.indexOf(plan.replace)]}`,
    s.on ? "§aBuild mode is on:§r placing a block builds the shape there. Sneak to place just one." : "Build mode is off: turn it on to build by placing a block, or use Build here now.",
    isCreative(player) || get("requireItems") !== true ? "Building is free in creative." : "Builds use blocks from your inventory; undo gives them back.",
  ].join("\n");
  /** @type {{ text: string, run: () => unknown }[]} */
  const actions = [
    { text: s.on ? "Build mode: §aOn" : "Build mode: Off", run: () => toggleMode(player) },
    { text: "Choose a shape", run: () => chooseShape(player) },
    { text: `Shape settings: ${shapeOf(plan.shape).name}`, run: () => shapeForm(player, plan.shape) },
    { text: "Blocks and placing", run: () => placingForm(player) },
    { text: "Build here now", run: () => buildHereMenu(player) },
  ];
  if (s.start) actions.push({ text: "Forget the start block", run: () => ((s.start = undefined), note(player, "§7Start block forgotten")) });
  if (s.undo.length) actions.push({ text: `Undo: ${s.undo[s.undo.length - 1].label}`, run: () => undo(player, false) });
  if (s.redo.length) actions.push({ text: `Redo: ${s.redo[s.redo.length - 1].label}`, run: () => undo(player, true) });
  const form = new ActionFormData().title(TITLE).body(body);
  for (const a of actions) form.button(a.text);
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  await actions[res.selection]?.run();
}

/** @param {Player} player */
function toggleMode(player) {
  const s = stateOf(player);
  s.on = !s.on;
  s.start = undefined;
  note(player, s.on ? `§aBuild mode on:§7 placing a block builds a ${planLabel(planOf(player))}` : "§7Build mode off: blocks place one at a time");
}

/** @param {Player} player */
async function chooseShape(player) {
  const form = new ActionFormData().title("Choose a shape");
  let group = "";
  for (const s of SHAPES) {
    if (s.group !== group) {
      group = s.group;
      form.header(group);
    }
    form.button(`${s.name}\n§8${s.about.length > 48 ? `${s.about.slice(0, 45)}...` : s.about}`);
  }
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  const shape = SHAPES[res.selection];
  if (shape) await shapeForm(player, shape.id);
}

/** The settings of one shape; saving picks it and turns build mode on. @param {Player} player @param {string} id */
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
  if (!res || res.canceled || !player.isValid) return;
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
  const twoPoint = plan.size === "points";
  player.sendMessage(
    twoPoint
      ? `§a${shape.name}:§r place the start block, then the end block, and it fills the space between. Or look at a spot and use /realm:build_here twice.`
      : `§a${planLabel(plan)}:§r build mode is on. Place a block and it builds there, or look at a spot and use /realm:build_here. Sneak to place just one block.`
  );
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
    .toggle("Outline preview in build mode", { defaultValue: getFor(player, "preview") === true })
    .submitButton("Save");
  const res = await show(player, form);
  if (!res || res.canceled || !player.isValid) return;
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
  setFor(player, "preview", !!v[12]);
  /** @type {string[]} */
  const problems = [];
  if (next.src === "typed" && !permOf(next.block)) problems.push(`there is no block called "${next.block}"`);
  if (next.second === "typed" && next.secondBlock && !permOf(next.secondBlock)) problems.push(`there is no block called "${next.secondBlock}"`);
  for (const id of [next.src === "typed" ? next.block : "", next.second === "typed" ? next.secondBlock : ""]) {
    const p = id && permOf(id);
    if (p && isForbidden(p.type.id)) problems.push(`${nice(p.type.id)} can't be built with the tools`);
  }
  if (problems.length) {
    player.sendMessage(`§eNot saved: ${problems.join("; ")}. Block ids look like minecraft:stone_bricks.`);
    return;
  }
  savePlan(player, next);
  player.sendMessage(`§aSaved.§r ${planLabel(next)}, replacing ${REPLACE_NAMES[REPLACE.indexOf(next.replace)].toLowerCase()}.`);
}

/** Outline at the block you look at for a few seconds, then confirm with the cost. @param {Player} player */
async function buildHereMenu(player) {
  const plan = planOf(player);
  if (plan.size === "points" && shapeOf(plan.shape).points) return buildHere(player);
  const T = lookTarget(player);
  if (!T) return player.sendMessage(`§eLook at a block within ${get("reach")} blocks first.`);
  const mats = materialsOf(player, plan);
  if (typeof mats === "string") return player.sendMessage(`§e${mats}`);
  const cells = worldCells(plan, mats, T, frameOf(facingOf(player), plan.turn));
  const box = boundsOf(cells);
  const secs = Math.max(0, get("previewSeconds"));
  for (let t = 0; t < secs * 2; t++) {
    if (!player.isValid) return;
    drawBox(player, box);
    await new Promise((r) => system.runTimeout(() => r(undefined), 10));
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
  if (!res || res.canceled || res.selection !== 0 || !player.isValid) return;
  if (stateOf(player).busy) return player.sendMessage("§eWait for the last build to finish.");
  await build(player, player.dimension, cells, planLabel(plan), { mode: replaceMode(player, plan) });
}

/** /realm:build_here: builds at the block you look at, no questions. @param {Player} player */
async function buildHere(player) {
  if (stateOf(player).busy) return player.sendMessage("§eWait for the last build to finish.");
  const T = lookTarget(player);
  if (!T) return player.sendMessage(`§eLook at a block within ${get("reach")} blocks first.`);
  await buildAt(player, T);
}

// ---------------------------------------------------------------------------
// Commands and script events
// ---------------------------------------------------------------------------

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id === "realm:help_ping") {
      system.sendScriptEvent("realm:help_pong", PACK);
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
});
