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
  let o = outlines.get(cells);
  if (o) return o;
  const key = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => `${x},${y},${z}`;
  const set = new Set();
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const c of cells) {
    set.add(key(c.x, c.y, c.z));
    if (c.x < min.x) min.x = c.x;
    if (c.y < min.y) min.y = c.y;
    if (c.z < min.z) min.z = c.z;
    if (c.x > max.x) max.x = c.x;
    if (c.y > max.y) max.y = c.y;
    if (c.z > max.z) max.z = c.z;
  }
  /** @type {number[][]} */
  const faces = [];
  /** @type {Pos[]} */
  const surface = [];
  const seen = new Set();
  for (const c of cells) {
    const k = key(c.x, c.y, c.z);
    if (seen.has(k)) continue;
    seen.add(k);
    let open = false;
    for (const [axis, side] of SIDES) {
      const n = [c.x, c.y, c.z];
      n[axis] += side;
      if (set.has(key(n[0], n[1], n[2]))) continue;
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

/** How often this player's guides refresh, in ticks (1 to 20). @param {Player} player */
export function guideRate(player) {
  const fastest = Math.max(1, Math.min(20, Number(get("guideFastest")) || 1));
  return Math.max(fastest, Math.min(20, Math.round(Number(getFor(player, "guideRate")) || 4)));
}

/** The player's guide style: "outline", "corners", "dots", "box" or "off". @param {Player} player */
export function guideStyle(player) {
  return String(getFor(player, "guideStyle") ?? "outline");
}

/**
 * Draws a guide over these cells for this player only. Call it as often as you like (every tick is fine):
 * it draws at most every `guideRate` ticks per player and kind, and returns whether it drew.
 * @param {Player} player
 * @param {Pos[]} cells block positions (keep passing the same array while it doesn't change: its outline is cached)
 * @param {GuideKind} [kind] "build" (the player's color), "destroy" (red), "paste" (light blue ghost), "mark" (gold)
 * @param {{ offset?: Pos, force?: boolean }} [opts] offset: added to every cell (so a cached relative list can move);
 *   force: draw now even if one was drawn less than `guideRate` ticks ago
 */
export function drawGuide(player, cells, kind = "build", opts = {}) {
  if (!player?.isValid || !cells?.length) return false;
  const style = guideStyle(player);
  if (style === "off") return false;
  const rate = guideRate(player);
  const now = system.currentTick;
  const slot = `${player.id}|${kind}`;
  if (!opts.force && now - (lastDrawn.get(slot) ?? -999) < rate) return false;
  lastDrawn.set(slot, now);
  const o = outlineOf(cells);
  const dx = opts.offset?.x ?? 0, dy = opts.offset?.y ?? 0, dz = opts.offset?.z ?? 0;
  const budget = Math.max(20, Math.round(Number(get("guideMax")) || 400));
  if (style === "box") {
    const particle = kind === "build" ? String(getFor(player, "particle")) : KIND_SPARKLES[kind] ?? "minecraft:endrod";
    drawBox(player, { x: o.min.x + dx, y: o.min.y + dy, z: o.min.z + dz }, { x: o.max.x + dx, y: o.max.y + dy, z: o.max.z + dz }, particle, Math.min(budget, 240));
    return true;
  }
  const rgb = kind === "build" ? GUIDE_COLORS[/** @type {keyof GUIDE_COLORS} */ (String(getFor(player, "guideColor")))] ?? GUIDE_COLORS.white : KIND_COLORS[kind];
  const vars = new MolangVariableMap();
  vars.setColorRGBA("variable.color", { red: rgb[0], green: rgb[1], blue: rgb[2], alpha: kind === "paste" ? 0.75 : 1 });
  vars.setFloat("variable.life", rate / 20 + 0.05);
  vars.setFloat("variable.style", style === "corners" ? 1 : 0);
  if (style === "dots" || kind === "mark") {
    for (const c of thin(o.surface, budget)) {
      try {
        player.spawnParticle(DOT_ID, { x: c.x + dx + 0.5, y: c.y + dy + 0.5, z: c.z + dz + 0.5 }, vars);
      } catch {
        // unloaded
      }
    }
    return true;
  }
  for (const [x, y, z, axis, side] of thin(o.faces, budget)) {
    const p = [x + dx + 0.5, y + dy + 0.5, z + dz + 0.5];
    p[axis] += side * 0.505;
    try {
      player.spawnParticle(FACE_IDS[axis], { x: p[0], y: p[1], z: p[2] }, vars);
    } catch {
      // unloaded
    }
  }
  return true;
}

/**
 * Vanilla sparkles along the 12 edges of a box of whole blocks (min..max), for the "Box edges" style.
 * @param {Player} player @param {Pos} min @param {Pos} max @param {string} particle @param {number} budget
 */
export function drawBox(player, min, max, particle, budget = 240) {
  const x0 = min.x, y0 = min.y, z0 = min.z, x1 = max.x + 1, y1 = max.y + 1, z1 = max.z + 1;
  const perimeter = 4 * (x1 - x0 + y1 - y0 + z1 - z0);
  const step = Math.max(0.5, perimeter / budget);
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

/** Forget a player who left. @param {string} playerId */
export function forgetGuides(playerId) {
  for (const k of [...lastDrawn.keys()]) if (k.startsWith(`${playerId}|`)) lastDrawn.delete(k);
}
