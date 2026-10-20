// Town Projects' automatic project spots (F37): what counts as natural ground, the column model, the grading plan
// (the terrain rule) and the scan that picks a spot for each project. No @minecraft import, so the unit tests
// (tools/town-sites.test.mjs) run it in node; main.js reads the world for it.
//
// The terrain rule: a build never touches a man-made block. Only the natural kinds below (and wild plants) count as
// natural; everything else is man-made, including anything a future update adds. Ground is leveled only inside a
// spot's region (its footprint plus a 2-block apron), at most `levelDepth` (3) blocks up or down, with steps of at
// most 1 between neighboring columns, so a town keeps its elevation and its builds follow the land.

/** @param {string[]} a */
const mc = (a) => a.map((b) => `minecraft:${b}`);

/** Natural ground (an allow list: every other block is man-made). */
export const NATURAL = new Set(
  mc([
    "grass_block", "dirt", "coarse_dirt", "podzol", "mycelium", "dirt_with_roots", "mud", "sand", "red_sand", "gravel", "clay", "stone",
    "granite", "diorite", "andesite", "deepslate", "tuff", "calcite", "sandstone", "red_sandstone", "snow", "snow_layer",
  ]),
);
/** What may lie under natural ground: natural ground, ores and bedrock. */
export const UNDER = new Set([
  ...NATURAL,
  ...mc([
    "bedrock", "coal_ore", "iron_ore", "copper_ore", "gold_ore", "redstone_ore", "lit_redstone_ore", "lapis_ore", "diamond_ore", "emerald_ore",
    "deepslate_coal_ore", "deepslate_iron_ore", "deepslate_copper_ore", "deepslate_gold_ore", "deepslate_redstone_ore", "lit_deepslate_redstone_ore",
    "deepslate_lapis_ore", "deepslate_diamond_ore", "deepslate_emerald_ore",
  ]),
]);
UNDER.delete("minecraft:snow_layer");
/** Wild plants a build may replace (farmed plants such as crops, saplings and sweet berry bushes are man-made). */
export const WILD = new Set(
  mc([
    "short_grass", "tall_grass", "fern", "large_fern", "deadbush", "leaf_litter", "pink_petals", "wildflowers", "bush", "firefly_bush",
    "short_dry_grass", "tall_dry_grass", "brown_mushroom", "red_mushroom", "vine", "poppy", "dandelion", "cornflower", "azure_bluet", "oxeye_daisy",
    "allium", "lily_of_the_valley", "orange_tulip", "red_tulip", "white_tulip", "pink_tulip", "blue_orchid", "sunflower", "lilac", "rose_bush",
    "peony", "torchflower", "open_eyeblossom", "closed_eyeblossom", "snow_layer",
  ]),
);
export const WATERY = new Set(mc(["water", "flowing_water", "seagrass", "kelp", "waterlily", "bubble_column"]));
const LAVA = new Set(mc(["lava", "flowing_lava"]));
const AIR = "minecraft:air";
/** Kinds that fall when nothing holds them up. */
export const GRAVITY = new Set(mc(["sand", "red_sand", "gravel"]));

/** @param {string} id */
export const isLeaves = (id) => /_leaves(_flowered)?$/.test(id);
/** A tree's trunk or roots: never cut, and a column with one is a tree. @param {string} id */
export const isLog = (id) => /_(log|wood|stem|hyphae)$/.test(id) || id === "minecraft:mangrove_roots" || id === "minecraft:muddy_mangrove_roots";

/**
 * What a block read gives the module: its id and, for leaves, whether a player placed them (`persistent_bit`).
 * @typedef {{ id: string, persistent?: boolean }} BlockInfo
 */
/**
 * A column of the world, as the scan sees it. k: N natural ground, W water over a bed, T a tree, M man-made (or an
 * overhang, a roof, a basement), L lava, U unknown (not loaded: candidates using it wait). g: the ground's top y,
 * top: its block, w: a W column's water surface y, lf: natural leaves above the ground.
 * @typedef {{ k: "N" | "W" | "T" | "M" | "L" | "U", g?: number, top?: string, w?: number, lf?: number }} Column
 */
/** @type {Column} */
export const UNKNOWN = Object.freeze({ k: "U" });

/**
 * Reads one column from its topmost block down. `at(y)` returns the block there (undefined: not loaded);
 * `surface()` returns the highest water block's y (getTopmostBlock skips water, C15), called only for a column
 * whose ground is under water. About 3 to 5 reads a column.
 * @param {number | undefined} topY @param {(y: number) => BlockInfo | undefined} at @param {() => number | undefined} [surface]
 * @returns {Column}
 */
export function readColumn(topY, at, surface) {
  if (typeof topY !== "number" || !Number.isFinite(topY)) return UNKNOWN;
  let leafy = false;
  /** @type {number | undefined} */
  let wTop;
  for (let y = topY, i = 0; i < 48; i++, y--) {
    const b = at(y);
    if (!b) return UNKNOWN;
    const id = b.id;
    if (id === AIR) continue;
    if (isLog(id)) return { k: "T", g: y };
    if (isLeaves(id)) {
      if (b.persistent) return { k: "M", g: y };
      leafy = true;
      continue;
    }
    if (WILD.has(id)) continue;
    if (LAVA.has(id)) return { k: "L", g: y };
    if (WATERY.has(id)) {
      if (wTop === undefined) wTop = y;
      continue;
    }
    if (!NATURAL.has(id)) return { k: "M", g: y };
    const g = y;
    let w = wTop;
    if (w === undefined && g === topY) {
      const above = at(g + 1);
      if (!above) return UNKNOWN;
      if (LAVA.has(above.id)) return { k: "L", g };
      if (WATERY.has(above.id)) {
        const s = surface?.();
        if (typeof s !== "number" || s <= g) return UNKNOWN;
        w = s;
      }
    }
    const u1 = at(g - 1);
    const u2 = at(g - 2);
    if (!u1 || !u2) return UNKNOWN;
    // A natural block over an air gap (a roof, an overhang, a dirt hut) or over something man-made (a basement).
    if (!UNDER.has(u1.id) || !UNDER.has(u2.id)) return { k: "M", g, top: id };
    if (w !== undefined) return { k: "W", g, w, top: id };
    return leafy ? { k: "N", g, top: id, lf: 1 } : { k: "N", g, top: id };
  }
  return UNKNOWN;
}

/**
 * May a block stay in (or be changed inside) an automatic spot's region? Air, wild plants, natural ground and what
 * lies under it, natural leaves, and water for a dock. Everything else (man-made, logs, lava, placed leaves) fails.
 * @param {BlockInfo} b @param {boolean} dock
 */
export function allowedInRegion(b, dock) {
  const id = b.id;
  if (id === AIR || WILD.has(id) || UNDER.has(id) || id === "minecraft:snow_layer") return true;
  if (isLeaves(id)) return !b.persistent;
  return dock && WATERY.has(id);
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** @typedef {{ x1: number, z1: number, x2: number, z2: number }} Rect inclusive */
/** @typedef {{ min: { x: number, y: number, z: number }, max: { x: number, y: number, z: number } }} Box */

/** @param {Box} b @returns {Rect} */
export const rectOf = (b) => ({ x1: b.min.x, z1: b.min.z, x2: b.max.x, z2: b.max.z });
/** @param {Rect} r @param {number} m @returns {Rect} */
export const grow = (r, m) => ({ x1: r.x1 - m, z1: r.z1 - m, x2: r.x2 + m, z2: r.z2 + m });
/** @param {Rect} a @param {Rect} b */
export const overlaps = (a, b) => a.x1 <= b.x2 && b.x1 <= a.x2 && a.z1 <= b.z2 && b.z1 <= a.z2;
/** Chebyshev distance from a column to a rectangle (0 inside). @param {Rect} r @param {number} x @param {number} z */
export const distTo = (r, x, z) => Math.max(r.x1 - x, 0, x - r.x2, r.z1 - z, 0, z - r.z2);
/** Is a circle's center within `rad` of the rectangle? @param {Rect} r @param {number} x @param {number} z @param {number} rad */
export const nearRect = (r, x, z, rad) => Math.hypot(Math.max(r.x1 - x, 0, x - r.x2), Math.max(r.z1 - z, 0, z - r.z2)) <= rad;
/** The region (footprint plus the apron) of a footprint. @param {Rect} fp */
export const regionOf = (fp) => grow(fp, 2);

/**
 * The facing (0 south, 1 west, 2 north, 3 east) whose forward points away from the center, so the build's front (the
 * spot side, where the notice board's signs are) faces the center. @param {number} dx @param {number} dz
 */
export function facingOut(dx, dz) {
  if (Math.abs(dx) >= Math.abs(dz) && dx !== 0) return dx > 0 ? 3 : 1;
  return dz < 0 ? 2 : 0;
}

// ---------------------------------------------------------------------------
// The grading plan
// ---------------------------------------------------------------------------

/**
 * The plan for a pad height: per region column the new ground top. Footprint columns go to `pad`; an apron column at
 * distance d (1 or 2) goes to pad + clamp(g - pad, -d, d), so the apron steps back to the ground. Fails when a
 * column moves more than `depth`, when a step between neighbors (one of them changed; the ring outside the region
 * counted at its natural height) is more than 1, or when a cut column has water at or above its new top, or lava,
 * next to it. `col(x, z)` must give every region column (all N) and the ring around it.
 * @param {Rect} region @param {Rect} fp @param {(x: number, z: number) => Column} col @param {number} pad @param {number} depth
 * @returns {{ ok: true, vol: number, t: number[], g: number[] } | { ok: false, why: string }}
 */
export function gradePlan(region, fp, col, pad, depth) {
  const rd = region.z2 - region.z1 + 1;
  const rw = region.x2 - region.x1 + 1;
  /** @type {number[]} */
  const t = new Array(rw * rd);
  /** @type {number[]} */
  const g = new Array(rw * rd);
  let vol = 0;
  for (let i = 0; i < rw; i++)
    for (let j = 0; j < rd; j++) {
      const x = region.x1 + i;
      const z = region.z1 + j;
      const c = col(x, z);
      if (c.k !== "N" || typeof c.g !== "number") return { ok: false, why: "not natural" };
      const d = distTo(fp, x, z);
      const to = d === 0 ? pad : pad + Math.max(-d, Math.min(d, c.g - pad));
      if (Math.abs(to - c.g) > depth) return { ok: false, why: "too deep" };
      t[i * rd + j] = to;
      g[i * rd + j] = c.g;
      vol += Math.abs(to - c.g);
    }
  /** Height for the step rule: a region column's new top, a natural or water column outside at its own. @param {number} x @param {number} z */
  const heightAt = (x, z) => {
    if (x >= region.x1 && x <= region.x2 && z >= region.z1 && z <= region.z2) {
      const k = (x - region.x1) * rd + (z - region.z1);
      return { h: t[k], changed: t[k] !== g[k] };
    }
    const c = col(x, z);
    if (c.k === "N" && typeof c.g === "number") return { h: c.g, changed: false };
    if (c.k === "W" && typeof c.w === "number") return { h: c.w, changed: false };
    return undefined;
  };
  const SIDES = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let i = 0; i < rw; i++)
    for (let j = 0; j < rd; j++) {
      const x = region.x1 + i;
      const z = region.z1 + j;
      const k = i * rd + j;
      const mine = { h: t[k], changed: t[k] !== g[k] };
      const cut = t[k] < g[k];
      for (const [dx, dz] of SIDES) {
        const nx = x + dx;
        const nz = z + dz;
        const other = heightAt(nx, nz);
        if (other && (mine.changed || other.changed) && Math.abs(mine.h - other.h) > 1) return { ok: false, why: "step" };
        if (cut) {
          const c = col(nx, nz);
          if (c.k === "L") return { ok: false, why: "lava" };
          if (c.k === "W" && typeof c.w === "number" && c.w > t[k]) return { ok: false, why: "water" };
          if (c.k === "U") return { ok: false, why: "unknown" };
        }
      }
    }
  return { ok: true, vol, t, g };
}

/** The plan as saved on the spot (`lv`): outer x, inner z over the region; "." untouched, "0".."6" = pad - 3 .. pad + 3. @param {number[]} t @param {number[]} g @param {number} pad */
export const encodePlan = (t, g, pad) => t.map((to, k) => (to === g[k] ? "." : String(to - pad + 3))).join("");

/**
 * The changed columns of a saved plan, or undefined when it doesn't fit the region (a damaged record: built without
 * leveling). @param {unknown} lv @param {Rect} region @param {number} pad @returns {{ x: number, z: number, t: number }[] | undefined}
 */
export function decodePlan(lv, region, pad) {
  const rd = region.z2 - region.z1 + 1;
  const rw = region.x2 - region.x1 + 1;
  if (typeof lv !== "string" || lv.length !== rw * rd || !/^[.0-6]*$/.test(lv)) return undefined;
  /** @type {{ x: number, z: number, t: number }[]} */
  const out = [];
  for (let k = 0; k < lv.length; k++) {
    if (lv[k] === ".") continue;
    out.push({ x: region.x1 + Math.floor(k / rd), z: region.z1 + (k % rd), t: pad - 3 + Number(lv[k]) });
  }
  return out;
}

/** The median of a list of heights (the lower middle one for an even count). @param {number[]} hs */
export function median(hs) {
  const s = [...hs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

/**
 * The score of a candidate, compared in order (smallest first): leveling in buckets of 6 blocks (plus a bucket for
 * every 48 blocks from the center, every 12 for the well, so it stays near the center), already level, how many of
 * the town's spots have a pad within 1 of this one (so a hillside town gets varied heights), then distance.
 * @param {{ vol: number, dist: number, variety: number, well: boolean }} c @returns {number[]}
 */
export const scoreKey = (c) => [Math.floor(c.vol / 6) + Math.floor(c.dist / (c.well ? 12 : 48)), c.vol === 0 ? 0 : 1, c.variety, c.dist];
/** @param {number[]} a @param {number[]} b */
export function compareKeys(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
}

// ---------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------

/**
 * @typedef {{ id: string, well?: boolean, dock?: boolean, near?: { x: number, z: number }, box: (s: { x: number, y: number, z: number, f: number }) => Box }} ScanProject
 * `near`: look around this point instead of the center (the garden pen beside its garden), from SCAN.minNear to
 * SCAN.maxNear blocks away, nearest first; the build still faces the town's center and stays inside the town.
 * @typedef {{ x: number, y: number, z: number, f: number, a: 1, lv?: string, lt?: string }} AutoSpot
 * @typedef {{
 *   cx: number, cz: number, radius: number, depth: number, projects: ScanProject[],
 *   taken?: Rect[], pads?: number[], posts?: { x: number, z: number, r: number }[], claims?: Rect[], claimsMore?: boolean,
 *   placed?: (r: Rect, y1: number, y2: number) => boolean, final?: boolean,
 * }} ScanInput
 * `final`: a candidate that waits for unknown columns no longer holds back a valid one (the scan waited enough).
 * Requests the scan yields: ["c", x, z] a column (answer a Column), ["b", x, y, z] a block (BlockInfo or undefined),
 * ["claims", x1, z1, x2, z2] how many claims overlap (a number), ["tick"] the scan's own work for this tick is done
 * (answer nothing; the caller ends its tick).
 * @typedef {["c", number, number] | ["b", number, number, number] | ["claims", number, number, number, number] | ["tick"]} ScanRequest
 * @typedef {{ x: number, z: number, f: number, pad: number, vol: number, lv?: string, lt?: string, dist: number, key: number[], region: Rect, cuts: { x: number, z: number, t: number }[] }} Candidate
 */

export const SCAN = { ringStep: 3, arcStep: 3, minWell: 6, minOther: 10, minNear: 9, maxNear: 30, edge: 8, keep: 4, enough: 6, past: 16, finalists: 3, workTick: 400 };

/**
 * Picks a spot for each project, one after another (the well first), reading columns as it goes (yield). Returns
 * the picks, the projects with no valid spot (`nos`) and those waiting for unknown columns (`wait`).
 * @param {ScanInput} input
 * @returns {Generator<ScanRequest, { picks: { id: string, spot: AutoSpot }[], nos: string[], wait: string[] }, any>}
 */
export function* scanTown(input) {
  /** @type {Map<number, Column>} */
  const cache = new Map();
  // Work counted in column lookups (cached or not), so a scan over columns it already read still stops for the
  // tick: without it, later projects re-walk cached rings and evaluate every candidate in one tick (F37 review).
  let work = 0;
  /** Ends the tick when this tick's work is used up. @returns {Generator<ScanRequest, void, any>} */
  function* pace() {
    if (work < SCAN.workTick) return;
    work = 0;
    yield ["tick"];
  }
  /** @param {number} x @param {number} z @returns {Generator<ScanRequest, Column, any>} */
  function* col(x, z) {
    work++;
    const key = (x + 32768) * 65536 + (z + 32768);
    let c = cache.get(key);
    if (!c) {
      c = /** @type {Column} */ ((yield ["c", x, z]) ?? UNKNOWN);
      cache.set(key, c);
    }
    return c;
  }
  /** Synchronous lookup of a column already read. @param {number} x @param {number} z */
  const known = (x, z) => {
    work++;
    return cache.get((x + 32768) * 65536 + (z + 32768)) ?? UNKNOWN;
  };
  const taken = [...(input.taken ?? [])];
  const pads = [...(input.pads ?? [])];
  /** @type {{ id: string, spot: AutoSpot }[]} */
  const picks = [];
  /** @type {string[]} */
  const nos = [];
  /** @type {string[]} */
  const wait = [];
  const order = [...input.projects].sort((a, b) => Number(!!b.well) - Number(!!a.well));
  for (const p of order) {
    const res = p.dock ? yield* pickDock(p) : yield* pickBuild(p);
    if (res === "wait") wait.push(p.id);
    else if (!res) nos.push(p.id);
    else {
      picks.push({ id: p.id, spot: res.spot });
      taken.push(res.region);
      pads.push(res.spot.y - 1);
    }
  }
  return { picks, nos, wait };

  /** Cheap checks first, no reads: the town's edge, other spots, posts and places, claims. @param {Rect} region */
  function blockedWithoutReads(region) {
    work += 8 + taken.length + (input.posts?.length ?? 0) + (input.claims?.length ?? 0);
    const lim = input.radius - SCAN.keep;
    for (const [x, z] of [[region.x1, region.z1], [region.x1, region.z2], [region.x2, region.z1], [region.x2, region.z2]])
      if (Math.hypot(x - input.cx, z - input.cz) > lim) return "edge";
    if (taken.some((r) => overlaps(r, region))) return "taken";
    if ((input.posts ?? []).some((q) => nearRect(region, q.x, q.z, q.r))) return "post";
    if ((input.claims ?? []).some((r) => overlaps(r, region))) return "claim";
    return undefined;
  }

  /** Candidate positions on a ring of radius r around (ox, oz): [x, z]. @param {number} r @param {number} [ox] @param {number} [oz] */
  function ring(r, ox = input.cx, oz = input.cz) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / SCAN.arcStep));
    /** @type {[number, number][]} */
    const out = [];
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const a = (i * 2 * Math.PI) / n;
      const x = Math.round(ox + r * Math.cos(a));
      const z = Math.round(oz + r * Math.sin(a));
      const k = `${x},${z}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push([x, z]);
    }
    return out;
  }

  /** @param {Candidate[]} list */
  function best(list) {
    return list.reduce((a, b) => (compareKeys(b.key, a.key) < 0 ? b : a));
  }

  /** @param {ScanProject} p @returns {Generator<ScanRequest, { spot: AutoSpot, region: Rect } | "wait" | undefined, any>} */
  function* pickBuild(p) {
    /** @type {Candidate[]} */
    const valid = [];
    let waitDist = Infinity;
    const o = p.near ?? { x: input.cx, z: input.cz };
    const rMax = p.near ? SCAN.maxNear : input.radius - SCAN.edge;
    for (let r = p.near ? SCAN.minNear : p.well ? SCAN.minWell : SCAN.minOther; r <= rMax; r += SCAN.ringStep) {
      for (const [x, z] of ring(r, o.x, o.z)) {
        if (x === input.cx && z === input.cz) continue;
        const f = facingOut(x - input.cx, z - input.cz);
        const res = yield* evalBuild(p, x, z, f, o);
        if (res === "wait") waitDist = Math.min(waitDist, Math.hypot(x - o.x, z - o.z));
        else if (res) valid.push(...res);
      }
      if (valid.length >= SCAN.enough && r + SCAN.ringStep > best(valid).dist + SCAN.past) break;
    }
    return yield* decide(valid, waitDist);
  }

  /**
   * The best valid candidates, checked block by block; or wait, or none. @param {Candidate[]} valid @param {number} waitDist
   * @returns {Generator<ScanRequest, { spot: AutoSpot, region: Rect } | "wait" | undefined, any>}
   */
  function* decide(valid, waitDist) {
    valid.sort((a, b) => compareKeys(a.key, b.key));
    if (valid.length && !input.final && waitDist < valid[0].dist + SCAN.past) return "wait";
    for (const c of valid.slice(0, SCAN.finalists)) {
      if (!(yield* deepCheck(c))) continue;
      /** @type {AutoSpot} */
      const spot = { x: c.x, y: c.pad + 1, z: c.z, f: c.f, a: 1 };
      if (c.lv !== undefined) {
        spot.lv = c.lv;
        if (c.lt) spot.lt = c.lt;
      }
      return { spot, region: c.region };
    }
    return Number.isFinite(waitDist) ? "wait" : undefined;
  }

  /**
   * One position: undefined (rejected), "wait" (a column isn't loaded) or the valid pads there.
   * `o`: where distance is measured from (the center, or the project's `near`).
   * @param {ScanProject} p @param {number} x @param {number} z @param {number} f @param {{ x: number, z: number }} o @returns {Generator<ScanRequest, Candidate[] | "wait" | undefined, any>}
   */
  function* evalBuild(p, x, z, f, o) {
    const fp = rectOf(p.box({ x, y: 0, z, f }));
    const region = regionOf(fp);
    yield* pace();
    if (blockedWithoutReads(region)) return undefined;
    let unknown = false;
    for (let i = region.x1; i <= region.x2; i++)
      for (let j = region.z1; j <= region.z2; j++) {
        const c = yield* col(i, j);
        if (c.k === "U") unknown = true;
        else if (c.k !== "N") return undefined;
      }
    if (unknown) return "wait";
    // The ring just outside: for the step rule, cut columns next to water, and trees whose leaves reach in.
    for (let i = region.x1 - 1; i <= region.x2 + 1; i++)
      for (let j = region.z1 - 1; j <= region.z2 + 1; j++) {
        if (i >= region.x1 && i <= region.x2 && j >= region.z1 && j <= region.z2) continue;
        const c = yield* col(i, j);
        if (c.k === "U") return "wait";
        if (c.k === "T") {
          for (let a = i - 2; a <= i + 2; a++) for (let b = j - 2; b <= j + 2; b++) if (distTo(region, a, b) === 0 && known(a, b).lf) return undefined;
        }
      }
    /** @type {number[]} */
    const gs = [];
    for (let i = fp.x1; i <= fp.x2; i++) for (let j = fp.z1; j <= fp.z2; j++) gs.push(/** @type {number} */ (known(i, j).g));
    const m = median(gs);
    const dist = Math.hypot(x - o.x, z - o.z);
    /** @type {Candidate[]} */
    const out = [];
    for (const pad of [m, m - 1, m + 1]) {
      yield* pace();
      const plan = gradePlan(region, fp, known, pad, input.depth);
      if (!plan.ok) continue;
      if (input.placed?.(region, pad - 5, pad + 12)) return undefined;
      const variety = pads.filter((q) => Math.abs(q - pad) <= 1).length;
      const rd = region.z2 - region.z1 + 1;
      /** @type {{ x: number, z: number, t: number }[]} */
      const cuts = [];
      plan.t.forEach((to, k) => {
        if (to < plan.g[k]) cuts.push({ x: region.x1 + Math.floor(k / rd), z: region.z1 + (k % rd), t: to });
      });
      /** @type {Candidate} */
      const c = { x, z, f, pad, vol: plan.vol, dist, key: scoreKey({ vol: plan.vol, dist, variety, well: !!p.well }), region, cuts };
      if (plan.vol > 0) {
        c.lv = encodePlan(plan.t, plan.g, pad);
        c.lt = topOf(region);
      }
      out.push(c);
    }
    return out.length ? out : undefined;
  }

  /** The most common top block of a region (what a fill gets on top), without "minecraft:". @param {Rect} region */
  function topOf(region) {
    /** @type {Map<string, number>} */
    const n = new Map();
    for (let i = region.x1; i <= region.x2; i++)
      for (let j = region.z1; j <= region.z2; j++) {
        const top = known(i, j).top;
        if (top) n.set(top, (n.get(top) ?? 0) + 1);
      }
    let pick = "minecraft:grass_block";
    let most = 0;
    for (const [k, v] of n)
      if (v > most) {
        pick = k;
        most = v;
      }
    return pick.replace(/^minecraft:/, "");
  }

  /**
   * A finalist, block by block: under every cut column's new top, 2 natural solid blocks; claims if there may be more.
   * @param {Candidate} c @returns {Generator<ScanRequest, boolean, any>}
   */
  function* deepCheck(c) {
    for (const cut of c.cuts)
      for (const y of [cut.t - 1, cut.t - 2]) {
        const b = /** @type {BlockInfo | undefined} */ (yield ["b", cut.x, y, cut.z]);
        if (!b || !UNDER.has(b.id)) return false;
      }
    if (input.claimsMore) {
      const n = yield ["claims", c.region.x1, c.region.z1, c.region.x2, c.region.z2];
      if (typeof n !== "number" || n > 0) return false;
    }
    return true;
  }

  /**
   * A dock: on the shoreline nearest the center (natural land at the water's level or one above), facing the water,
   * with its 3 x 10 deck over water of the same surface and its margin water or natural ground. No leveling.
   * @param {ScanProject} p @returns {Generator<ScanRequest, { spot: AutoSpot, region: Rect } | "wait" | undefined, any>}
   */
  function* pickDock(p) {
    /** @type {Candidate[]} */
    const valid = [];
    let waitDist = Infinity;
    const rMax = input.radius - SCAN.edge;
    for (let r = 4; r <= rMax; r += SCAN.ringStep) {
      for (const [x, z] of ring(r)) {
        yield* pace();
        const c = yield* col(x, z);
        if (c.k === "U") {
          waitDist = Math.min(waitDist, r);
          continue;
        }
        if (c.k !== "W") continue;
        // Walk toward the center to the shore.
        const dx = x - input.cx;
        const dz = z - input.cz;
        const step = Math.abs(dx) >= Math.abs(dz) ? [-Math.sign(dx), 0] : [0, -Math.sign(dz)];
        for (let k = 1; k <= SCAN.ringStep + 1; k++) {
          const sx = x + step[0] * k;
          const sz = z + step[1] * k;
          const s = yield* col(sx, sz);
          if (s.k === "W") continue;
          if (s.k === "N" && typeof s.g === "number" && typeof c.w === "number" && (s.g === c.w || s.g === c.w + 1)) {
            const toWater = facingOut(-step[0], -step[1]);
            for (const f of [toWater, (toWater + 1) % 4, (toWater + 3) % 4]) {
              const res = yield* evalDock(p, sx, sz, f, c.w);
              if (res === "wait") waitDist = Math.min(waitDist, r);
              else if (res) valid.push(res);
            }
          }
          break;
        }
      }
      if (valid.length && r + SCAN.ringStep > best(valid).dist + SCAN.past) break;
    }
    return yield* decide(valid, waitDist);
  }

  /** @param {ScanProject} p @param {number} x @param {number} z @param {number} f @param {number} w @returns {Generator<ScanRequest, Candidate | "wait" | undefined, any>} */
  function* evalDock(p, x, z, f, w) {
    const fp = rectOf(p.box({ x, y: w + 1, z, f }));
    const region = regionOf(fp);
    yield* pace();
    if (blockedWithoutReads(region)) return undefined;
    let unknown = false;
    for (let i = region.x1; i <= region.x2; i++)
      for (let j = region.z1; j <= region.z2; j++) {
        const c = yield* col(i, j);
        if (c.k === "U") {
          unknown = true;
          continue;
        }
        const deck = distTo(fp, i, j) === 0;
        if (deck ? c.k !== "W" || c.w !== w : c.k !== "W" && c.k !== "N") return undefined;
      }
    if (unknown) return "wait";
    if (input.placed?.(region, w - 9, w + 4)) return undefined;
    const dist = Math.hypot(x - input.cx, z - input.cz);
    return { x, z, f, pad: w, vol: 0, dist, key: [0, 0, 0, dist], region, cuts: [] };
  }
}
