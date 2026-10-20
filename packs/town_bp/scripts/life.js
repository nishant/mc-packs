// Town Projects' small life (F40, `townLife`): the paths a town lays from its builds toward the center, the lantern
// posts beside them, how both are saved (town:w:<town>) and the notice board's text. No @minecraft import, so the unit
// tests (tools/town-life.test.mjs) run it in node; main.js reads and changes the world for it.
//
// The terrain rule holds here too: a path only turns grass_block at ground level into grass_path (a single wild plant
// on it is cleared), with steps of at most 1, and stops at anything else; a post only stands on natural ground, in the
// open. Nothing players built is ever touched, and Remove spot turns both back.
import { NATURAL } from "./sites.js";

/** Most blocks of one path, and blocks between lantern posts along it. */
export const PATH_MAX = 48;
export const POST_EVERY = 8;
/** Most lantern posts in one town. */
export const POSTS_MAX = 12;
/** A path stops this close to the town's center (where the well usually is). */
export const PATH_NEAR = 3;

/** @param {string[]} a */
const mc = (a) => a.map((b) => `minecraft:${b}`);
const AIR = "minecraft:air";
const GRASS = "minecraft:grass_block";
/**
 * Single-block grass tufts a path may clear from the grass it lays (never given back: they grow wild everywhere).
 * Flowers, mushrooms, ferns, petals, two-block plants, crops, saplings and snow stop it: a flower may be someone's
 * flower bed, and taking half of a tall plant away would drop the other half.
 */
export const CLEARABLE = new Set(mc(["short_grass", "short_dry_grass", "tall_dry_grass", "deadbush", "bush", "leaf_litter"]));

/** @typedef {{ x: number, y: number, z: number }} Cell a path block (its y is the grass turned to path), or a post's fence */
/** @typedef {{ x: number, y: number, z: number, c?: 1 }} PathCell c: 1 where a wild plant on it was cleared */
/** A block read: its id, undefined when it isn't loaded. @typedef {{ id: string } | undefined} Read */
/** @typedef {["b", number, number, number]} BlockRequest */

// ---------------------------------------------------------------------------
// Saved cells: 6 base-36 characters each, relative to the town's center (x and z within 1024, y from -64 to 447)
// ---------------------------------------------------------------------------

const CELL = 6;
const SPAN = 2048;
const Y0 = 64;
const YS = 512;

/** @param {Cell[]} cells @param {number} cx @param {number} cz @returns {string} */
export function packCells(cells, cx, cz) {
  let out = "";
  for (const c of cells) {
    const dx = c.x - cx + SPAN / 2;
    const dz = c.z - cz + SPAN / 2;
    const y = c.y + Y0;
    if (!(dx >= 0 && dx < SPAN && dz >= 0 && dz < SPAN && y >= 0 && y < YS)) continue;
    out += ((dx * SPAN + dz) * YS + y).toString(36).padStart(CELL, "0");
  }
  return out;
}

/** @param {unknown} s @param {number} cx @param {number} cz @param {number} [max] @returns {Cell[]} */
export function unpackCells(s, cx, cz, max = Infinity) {
  /** @type {Cell[]} */
  const out = [];
  if (typeof s !== "string" || !/^[0-9a-z]*$/.test(s)) return out;
  for (let i = 0; i + CELL <= s.length && out.length < max; i += CELL) {
    const n = parseInt(s.slice(i, i + CELL), 36);
    if (!Number.isFinite(n)) continue;
    const y = (n % YS) - Y0;
    const r = Math.floor(n / YS);
    out.push({ x: Math.floor(r / SPAN) - SPAN / 2 + cx, y, z: (r % SPAN) - SPAN / 2 + cz });
  }
  return out;
}

/**
 * The saved `town:w:<town>` record, cleaned: { <project or work id>: [path cells, post cells] } (packed), a path at
 * most PATH_MAX blocks, POSTS_MAX posts in the whole town (later ones dropped); "~<id>" holds what Remove spot couldn't
 * reach yet (unloaded), at most 2 paths of it. @param {unknown} raw
 * @returns {Record<string, [string, string]>}
 */
export function readWorks(raw) {
  /** @type {Record<string, [string, string]>} */
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  let posts = 0;
  for (const [id, v] of Object.entries(raw)) {
    const left = id.startsWith("~"); // what a removal couldn't reach yet ("~<id>"), up to two paths of it
    if (!/^~?[a-z0-9_]{1,32}$/.test(id) || !Array.isArray(v)) continue;
    /** Whole cells only, at most n. @param {unknown} s @param {number} n */
    const clean = (s, n) => {
      if (typeof s !== "string" || !/^[0-9a-z]*$/.test(s)) return "";
      const k = Math.min(Math.floor(s.length / CELL), Math.max(0, n));
      return s.slice(0, k * CELL);
    };
    const p = clean(v[0], left ? 2 * PATH_MAX : PATH_MAX);
    const l = clean(v[1], POSTS_MAX - posts);
    posts += l.length / CELL;
    if (p || l) out[id] = [p, l];
  }
  return out;
}

/** Posts saved in a town's record. @param {Record<string, [string, string]>} w */
export const postCount = (w) => Object.values(w).reduce((n, v) => n + v[1].length / CELL, 0);

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * The columns from (x, z) toward (tx, tz), one block at a time along x or z (a 1-wide path you can walk without
 * cutting corners), the start first, the target last. @param {number} x @param {number} z @param {number} tx @param {number} tz
 * @returns {Generator<[number, number], void, void>}
 */
export function* walk(x, z, tx, tz) {
  yield [x, z];
  while (x !== tx || z !== tz) {
    const dx = tx - x;
    const dz = tz - z;
    if (Math.abs(dx) >= Math.abs(dz)) x += Math.sign(dx);
    else z += Math.sign(dz);
    yield [x, z];
  }
}

/**
 * Plans a town path: from `start` (the column in front of a build, its ground near `start.y`) toward the center, one
 * grass block a column, each within 1 block up or down of the last; it stops at anything that isn't grass under air
 * (or under a single wild plant, cleared), at a column `stop` refuses (another build's region, a claim, a placed
 * block), PATH_NEAR blocks from the center, after PATH_MAX blocks, or where a block isn't loaded. Yields block reads.
 * @param {{ start: { x: number, y: number, z: number }, cx: number, cz: number, stop?: (x: number, z: number, y: number) => boolean, max?: number }} o
 * @returns {Generator<BlockRequest, { cells: PathCell[], unloaded: boolean }, Read>}
 */
export function* planPath(o) {
  /** @type {PathCell[]} */
  const cells = [];
  const max = Math.max(0, Math.min(PATH_MAX, o.max ?? PATH_MAX));
  let prev = o.start.y;
  for (const [x, z] of walk(o.start.x, o.start.z, o.cx, o.cz)) {
    if (cells.length >= max || Math.hypot(x - o.cx, z - o.cz) <= PATH_NEAR) break;
    if (o.stop?.(x, z, prev)) break;
    /** @type {Map<number, Read>} */
    const seen = new Map();
    /** @param {number} y @returns {Generator<BlockRequest, Read, Read>} */
    const read = function* (y) {
      if (!seen.has(y)) seen.set(y, yield ["b", x, y, z]);
      return seen.get(y);
    };
    /** @type {PathCell | undefined} */
    let found;
    let unloaded = false;
    let blocked = false;
    for (const y of [prev + 1, prev, prev - 1]) {
      const b = yield* read(y);
      if (!b) {
        unloaded = true;
        break;
      }
      if (b.id === AIR || CLEARABLE.has(b.id)) continue; // open: the ground is lower
      if (b.id !== GRASS) {
        blocked = true; // anything else: stone, sand, a path already there, something built
        break;
      }
      const above = yield* read(y + 1);
      if (!above) unloaded = true;
      else if (above.id === AIR) found = { x, y, z };
      else if (CLEARABLE.has(above.id)) found = { x, y, z, c: 1 };
      else blocked = true;
      break;
    }
    if (unloaded) return { cells, unloaded: true };
    if (blocked || !found) break; // or a drop of more than 1
    cells.push(found);
    prev = found.y;
  }
  return { cells, unloaded: false };
}

// ---------------------------------------------------------------------------
// Lantern posts
// ---------------------------------------------------------------------------

/**
 * Plans lantern posts (a fence with a lantern on it) beside the town's paths: every POST_EVERY blocks along each path,
 * on the natural ground right beside it (left, else right) at the path's height with 2 open blocks above, never on a
 * path or where `stop` refuses, at least 4 blocks from another post, at most `max` new ones. Returns each post's fence
 * block (on the ground: y is the ground's + 1). Yields block reads.
 * @param {{ paths: { id: string, cells: Cell[] }[], posts: Cell[], stop?: (x: number, z: number, y: number) => boolean, max: number }} o
 * @returns {Generator<BlockRequest, { id: string, x: number, y: number, z: number }[], Read>}
 */
export function* planPosts(o) {
  /** @type {{ id: string, x: number, y: number, z: number }[]} */
  const out = [];
  const onPath = new Set(o.paths.flatMap((p) => p.cells.map((c) => `${c.x},${c.z}`)));
  const all = [...o.posts];
  const near = (/** @type {number} */ x, /** @type {number} */ z) => all.some((q) => Math.max(Math.abs(q.x - x), Math.abs(q.z - z)) < 4);
  for (const p of o.paths) {
    for (let i = POST_EVERY - 1; i < p.cells.length; i += POST_EVERY) {
      if (out.length >= o.max) return out;
      const c = p.cells[i];
      const n = p.cells[i + 1] ?? p.cells[i - 1];
      if (!n) continue;
      const dx = Math.sign(n.x - c.x);
      const dz = Math.sign(n.z - c.z);
      for (const [sx, sz] of [[c.x - dz, c.z + dx], [c.x + dz, c.z - dx]]) {
        if (onPath.has(`${sx},${sz}`) || near(sx, sz) || o.stop?.(sx, sz, c.y)) continue;
        const g = yield ["b", sx, c.y, sz];
        if (!g || !NATURAL.has(g.id) || g.id === "minecraft:snow_layer") continue;
        const a1 = yield ["b", sx, c.y + 1, sz];
        const a2 = yield ["b", sx, c.y + 2, sz];
        if (a1?.id !== AIR || a2?.id !== AIR) continue;
        const post = { id: p.id, x: sx, y: c.y + 1, z: sz };
        out.push(post);
        all.push(post);
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The notice board
// ---------------------------------------------------------------------------

/**
 * The three signs of a town's notice board: its name and level; projects done and the resident count; the newest
 * residents (else the top contributors, else a call for help). Plain ASCII but the bold code on the name, 4 lines each.
 * @param {{ name: string, level: string, lvl: number, done: number, total: number, residents: number, newest: string[], top: string[] }} o
 * @returns {[string, string, string]}
 */
export function boardTexts(o) {
  const newest = o.newest.filter((n) => typeof n === "string" && n).slice(-3).reverse();
  return [
    `§l${o.name}§r\n${o.level}\nlevel ${o.lvl}`,
    `Projects done\n${o.done} of ${o.total}\nResidents: ${o.residents}\nSee /realm:town`,
    newest.length ? `New families\n${newest.join("\n")}` : o.top.length ? `Thank you\n${o.top.slice(0, 3).join("\n")}` : "Bring materials\nto the mayor!",
  ];
}
