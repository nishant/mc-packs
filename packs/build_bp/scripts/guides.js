// Block guides: outlines of the blocks a build, paste or destroy would touch, drawn with particles only
// the player sees. The particles come from the Easy Building Guides resource pack (build_rp):
//   realm:guide_x, realm:guide_y, realm:guide_z  a one-block square facing x, y or z (texture: outline or corners)
//   realm:guide_dot                               a small dot in the middle of a block
// Each takes `variable.color` (RGBA), `variable.life` (seconds) and, for the squares, `variable.style`
// (0 outline, 1 corner outline). Without the resource pack the player sees nothing, so the "Box edges"
// style uses vanilla particles along the edges of the box around the cells instead.
//
// drawGuide(player, cells, kind) is the one entry point (also used for the paste ghost and the destroy guide).
// It draws at most every `guideRate` ticks per player and kind (a player choice, never faster than the realm's
// `guideFastest`), and at most `guideMax` particles: only the outer faces of the shape (or one dot per surface
// block), thinned evenly beyond the budget.
import { MolangVariableMap, Player, system } from "@minecraft/server";
import { get, getFor } from "./settings.js";
import { faceCopies, modsOn } from "./modifiers.js";

/** @typedef {{ x: number, y: number, z: number }} Pos */
/** @typedef {"build" | "destroy" | "paste" | "mark"} GuideKind */

/** Build guide colors players can pick (`guideColor`), as RGB 0..1. */
export const GUIDE_COLORS = {
  white: [1, 1, 1],
  green: [0.35, 1, 0.35],
  cyan: [0.3, 0.95, 1],
  yellow: [1, 0.92, 0.3],
  orange: [1, 0.6, 0.2],
  purple: [0.8, 0.45, 1],
};
/** Fixed colors for the other kinds: destroy red, paste light blue, marks (modifier centers, waypoints) gold. */
const KIND_COLORS = { destroy: [1, 0.25, 0.2], paste: [0.45, 0.75, 1], mark: [1, 0.8, 0.1] };
/** Vanilla particles for the "Box edges" style. */
const KIND_SPARKLES = { destroy: "minecraft:basic_flame_particle", paste: "minecraft:blue_flame_particle", mark: "minecraft:endrod" };

/** The six faces: axis (0 x, 1 y, 2 z) and side. */
const SIDES = [
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [2, 1],
  [2, -1],
];
const FACE_IDS = ["realm:guide_x", "realm:guide_y", "realm:guide_z"];
const DOT_ID = "realm:guide_dot";

/**
 * What to draw for one list of cells, worked out once per list (cached by the array).
 * faces: [x, y, z, axis, side] of every face with no cell beside it; surface: cells with at least one such face.
 * @typedef {{ faces: number[][], surface: Pos[], min: Pos, max: Pos }} Outline
 */
/** @type {WeakMap<object, Outline>} */
const outlines = new WeakMap();

/** @param {Pos[]} cells @returns {Outline} */
function outlineOf(cells) {
  const job = outlineJob(cells);
  let r = job.next();
  while (!r.done) r = job.next();
  return r.value;
}

/**
 * Works out (and caches) the outline of a list of cells as a generator for system.runJob, pausing every few
 * thousand cells, so a big shape's guide doesn't stall a tick.
 * @param {Pos[]} cells @returns {Generator<void, Outline, void>}
 */
export function* outlineJob(cells) {
  let o = outlines.get(cells);
  if (o) return o;
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const c of cells) {
    if (c.x < min.x) min.x = c.x;
    if (c.y < min.y) min.y = c.y;
    if (c.z < min.z) min.z = c.z;
    if (c.x > max.x) max.x = c.x;
    if (c.y > max.y) max.y = c.y;
    if (c.z > max.z) max.z = c.z;
  }
  // Number keys within the box grown by one on each side (much cheaper than strings for thousands of cells).
  const sy = max.y - min.y + 3, sz = max.z - min.z + 3;
  const key = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => ((x - min.x + 1) * sy + (y - min.y + 1)) * sz + (z - min.z + 1);
  const set = new Set();
  for (const c of cells) {
    set.add(key(c.x, c.y, c.z));
    if (set.size % 4096 === 0) yield;
  }
  const step = [sy * sz, sz, 1]; // a key's change for one block along x, y and z
  /** @type {number[][]} */
  const faces = [];
  /** @type {Pos[]} */
  const surface = [];
  const seen = new Set();
  for (const c of cells) {
    const k = key(c.x, c.y, c.z);
    if (seen.has(k)) continue;
    seen.add(k);
    if (seen.size % 2048 === 0) yield;
    let open = false;
    for (const [axis, side] of SIDES) {
      if (set.has(k + side * step[axis])) continue;
      faces.push([c.x, c.y, c.z, axis, side]);
      open = true;
    }
    if (open) surface.push(c);
  }
  o = { faces, surface, min, max };
  outlines.set(cells, o);
  return o;
}

/** Every n-th item so that at most `max` are left, spread evenly. @template T @param {T[]} list @param {number} max @returns {T[]} */
function thin(list, max) {
  if (list.length <= max) return list;
  const out = [];
  const step = list.length / max;
  for (let i = 0; i < max; i++) out.push(list[Math.floor(i * step)]);
  return out;
}

/** @type {Map<string, number>} last tick each player's guide of each kind was drawn */
const lastDrawn = new Map();
/** @type {Map<string, number>} until which tick a preview (Build, Paste or Destroy here now) owns a player's guide of that kind */
const previews = new Map();
/** Seconds each guide particle outlives the next draw of the same one, for network delay. */
const OVERLAP = 0.2;

/** How often this player's guides refresh, in ticks (1 to 20). @param {Player} player */
export function guideRate(player) {
  const fastest = Math.max(1, Math.min(20, Number(get("guideFastest")) || 1));
  return Math.max(fastest, Math.min(20, Math.round(Number(getFor(player, "guideRate")) || 4)));
}

/** The player's guide style: "outline", "corners", "dots", "box" or "off". @param {Player} player */
export function guideStyle(player) {
  return String(getFor(player, "guideStyle") ?? "outline");
}

/** Most guide particles spawned in one tick, for all players together; the rest wait for the next tick. */
const TICK_BUDGET = 600;

/**
 * Particles waiting to be spawned: each draw is spread over the ticks until the next one (its refresh), so a
 * 400-square guide refreshed every 4 ticks costs 100 particles a tick, not 400 every fourth tick.
 * @type {Map<string, { player: Player, list: (string | number)[][], vars?: MolangVariableMap, i: number, perTick: number }>}
 */
const queue = new Map();

/**
 * How long a server tick really takes lately, in milliseconds: the slowest recent one (50 when the server keeps up),
 * easing back by a millisecond a tick. Guide particles live in real time on the player's screen while the next
 * draw comes in server ticks, so on a busy realm each one has to last longer or the outline blinks.
 */
let tickMs = 50;
let lastTickAt = Date.now();

system.runInterval(() => {
  const at = Date.now();
  tickMs = Math.max(50, Math.min(1000, at - lastTickAt), tickMs - 1);
  lastTickAt = at;
  if (!queue.size) return;
  let left = TICK_BUDGET;
  for (const [slot, f] of [...queue]) {
    if (left <= 0) break;
    if (!f.player.isValid) {
      queue.delete(slot);
      continue;
    }
    const end = Math.min(f.list.length, f.i + Math.min(f.perTick, left));
    left -= end - f.i;
    for (; f.i < end; f.i++) {
      const [id, x, y, z] = f.list[f.i];
      try {
        f.player.spawnParticle(String(id), { x: Number(x), y: Number(y), z: Number(z) }, f.vars);
      } catch {
        // unloaded, or a bad particle
      }
    }
    if (f.i >= f.list.length) queue.delete(slot);
    else {
      // Round robin: the next tick starts with the others.
      queue.delete(slot);
      queue.set(slot, f);
    }
  }
}, 1);

/**
 * Draws a guide over these cells for this player only. Call it as often as you like (every tick is fine):
 * it draws at most every `guideRate` ticks per player and kind, and returns whether it drew.
 * @param {Player} player
 * @param {Pos[]} cells block positions (keep passing the same array while it doesn't change: its outline is cached)
 * @param {GuideKind} [kind] "build" (the player's color), "destroy" (red), "paste" (light blue ghost), "mark" (gold)
 * @param {{ offset?: Pos, force?: boolean, every?: number, preview?: boolean, mods?: { m: import("./modifiers.js").Mods, center: Pos } }} [opts]
 *   offset: added to every cell (so a cached relative list can move); force: draw now even if one was drawn less than
 *   `guideRate` ticks ago; every: how many ticks apart the caller calls (when not every tick), so each particle lasts
 *   until the next draw; preview: a "here now" preview, which the steady guide of the same kind leaves alone while it
 *   lasts (two lists in one slot would cut each other short); mods: also outline the modifier copies (worked out face
 *   by face, so the cells stay the shape alone)
 */
export function drawGuide(player, cells, kind = "build", opts = {}) {
  if (!player?.isValid || !cells?.length) return false;
  const style = guideStyle(player);
  if (style === "off") return false;
  const rate = guideRate(player);
  const now = system.currentTick;
  const slot = `${player.id}|${kind}`;
  if (opts.preview) previews.set(slot, now + 25);
  else if ((previews.get(slot) ?? -1) >= now) return false;
  const gap = now - (lastDrawn.get(slot) ?? -999);
  if (!opts.force && gap < rate) return false;
  lastDrawn.set(slot, now);
  // Each particle lasts until the same one is drawn again, plus a margin: the refresh (for a caller that runs every
  // few ticks, the first of its calls at least that far apart), or how long a forced caller waited. In real time:
  // a lagging server stretches the ticks.
  const every = opts.every ? Math.ceil(rate / opts.every) * opts.every : Math.max(rate, gap <= 20 ? gap : rate);
  const life = (every * tickMs) / 1000 + OVERLAP;
  const o = outlineOf(cells);
  const dx = opts.offset?.x ?? 0, dy = opts.offset?.y ?? 0, dz = opts.offset?.z ?? 0;
  const budget = Math.max(20, Math.round(Number(get("guideMax")) || 400));
  const mods = opts.mods && modsOn(opts.mods.m) ? faceCopies(opts.mods.m, opts.mods.center) : undefined;
  const seen = new Set();
  /** The copies of a face (or block: axis -1), moved by the offset; each spot once. */
  const copiesOf = (/** @type {number[]} */ f) => {
    const moved = [f[0] + dx, f[1] + dy, f[2] + dz, f[3], f[4]];
    const all = mods ? mods.of(moved) : [moved];
    return all.filter((g) => {
      const k = g.join();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  const per = mods ? Math.max(1, Math.floor(budget / mods.copies)) : budget;
  /** @type {(string | number)[][]} */
  const list = [];
  /** @type {MolangVariableMap | undefined} */
  let vars;
  if (style === "box") {
    const particle = kind === "build" ? String(getFor(player, "particle")) : KIND_SPARKLES[kind] ?? "minecraft:endrod";
    let min = { x: o.min.x + dx, y: o.min.y + dy, z: o.min.z + dz }, max = { x: o.max.x + dx, y: o.max.y + dy, z: o.max.z + dz };
    if (mods) {
      const corners = [];
      for (const x of [o.min.x, o.max.x]) for (const y of [o.min.y, o.max.y]) for (const z of [o.min.z, o.max.z]) corners.push(...copiesOf([x, y, z, -1, 0]));
      min = { x: Math.min(...corners.map((c) => c[0])), y: Math.min(...corners.map((c) => c[1])), z: Math.min(...corners.map((c) => c[2])) };
      max = { x: Math.max(...corners.map((c) => c[0])), y: Math.max(...corners.map((c) => c[1])), z: Math.max(...corners.map((c) => c[2])) };
    }
    for (const p of boxPoints(min, max, Math.min(budget, 240))) list.push([particle, p[0], p[1], p[2]]);
  } else {
    const rgb = kind === "build" ? GUIDE_COLORS[/** @type {keyof GUIDE_COLORS} */ (String(getFor(player, "guideColor")))] ?? GUIDE_COLORS.white : KIND_COLORS[kind];
    vars = new MolangVariableMap();
    vars.setColorRGBA("variable.color", { red: rgb[0], green: rgb[1], blue: rgb[2], alpha: kind === "paste" ? 0.75 : 1 });
    vars.setFloat("variable.life", life);
    vars.setFloat("variable.style", style === "corners" ? 1 : 0);
    if (style === "dots") {
      for (const c of thin(o.surface, per)) for (const g of copiesOf([c.x, c.y, c.z, -1, 0])) list.push([DOT_ID, g[0] + 0.5, g[1] + 0.5, g[2] + 0.5]);
    } else {
      for (const f of thin(o.faces, per)) {
        for (const [x, y, z, axis, side] of copiesOf(f)) {
          const p = [x + 0.5, y + 0.5, z + 0.5];
          p[axis] += side * 0.505;
          list.push([FACE_IDS[axis], p[0], p[1], p[2]]);
        }
      }
    }
  }
  queue.delete(slot);
  queue.set(slot, { player, list, vars, i: 0, perTick: Math.max(1, Math.ceil(list.length / every)) });
  return true;
}

/** Points along the 12 edges of a box of whole blocks (min..max), at most about `budget`. @param {Pos} min @param {Pos} max @param {number} budget */
function boxPoints(min, max, budget) {
  const x0 = min.x, y0 = min.y, z0 = min.z, x1 = max.x + 1, y1 = max.y + 1, z1 = max.z + 1;
  const perimeter = 4 * (x1 - x0 + y1 - y0 + z1 - z0);
  const step = Math.max(0.5, perimeter / budget);
  /** @type {number[][]} */
  const out = [];
  /** @param {number[]} a @param {number[]} b */
  const edge = (a, b) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
    }
  };
  for (const y of [y0, y1]) {
    edge([x0, y, z0], [x1, y, z0]);
    edge([x0, y, z1], [x1, y, z1]);
    edge([x0, y, z0], [x0, y, z1]);
    edge([x1, y, z0], [x1, y, z1]);
  }
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) edge([x, y0, z], [x, y1, z]);
  return out;
}

/**
 * Vanilla sparkles along the 12 edges of a box of whole blocks (min..max), for the "Box edges" style and selections.
 * @param {Player} player @param {Pos} min @param {Pos} max @param {string} particle @param {number} budget
 */
export function drawBox(player, min, max, particle, budget = 240) {
  for (const p of boxPoints(min, max, budget)) {
    try {
      player.spawnParticle(particle, { x: p[0], y: p[1], z: p[2] });
    } catch {
      // unloaded or a bad particle
    }
  }
}

/** Forget a player who left. @param {string} playerId */
export function forgetGuides(playerId) {
  for (const k of [...lastDrawn.keys()]) if (k.startsWith(`${playerId}|`)) lastDrawn.delete(k);
  for (const k of [...previews.keys()]) if (k.startsWith(`${playerId}|`)) previews.delete(k);
  for (const k of [...queue.keys()]) if (k.startsWith(`${playerId}|`)) queue.delete(k);
}
