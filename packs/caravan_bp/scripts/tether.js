// Generated from tools/tether-shared.js by node tools/sync-tether.mjs: edit that file, not this copy.
// Entity tethers: keeping a mob that walks with the vanilla AI near its home without rubber-banding it. Every pack
// that keeps a walking mob at a place keeps this same file as scripts/tether.js: edit tools/tether-shared.js, then run
// node tools/sync-tether.mjs (npm run check fails on a stale copy). It imports nothing, so unit tests run it in node.
//
// Why: the old pattern ("past N blocks from home, teleport it to home") loops on open ground. Nothing stops the
// vanilla AI from walking out again, so the mob strolls 10 blocks, snaps back, strolls out, snaps back (F42).
// A tether instead steers: past a soft radius the mob is slowed (its `minecraft:movement` value) and pushed gently
// toward home (a small impulse, facing home) until it is back inside, where its speed comes back. The teleport is only
// the last resort (in water or lava, stuck down a hole, or past the hard radius), goes to a free spot near home (not
// the exact center, where it may stand in another mob), and waits out a cooldown that doubles while snaps keep coming.
//
//   import { createTether, createSnapGuard, freeSpotNear, settledBelow } from "./tether.js";
//
//   const tether = createTether({ soft: 4, hard: 12 });   // options below
//   // every few ticks, for each mob (its dimension is the caller's to check):
//   const what = tether.check(ent, home, system.currentTick);   // "in" | "steer" | "rest" | "snap" | "held" | "skip"
//   tether.release(ent);       // speed back to normal now (before a scene, a talk or removal takes the mob over)
//   tether.forget(entityId);   // on entityRemove / entityDie: drops what it keeps for that id
//   tether.snaps, tether.steers, tether.stats(id)   // counters (tests and /realm:diag-style reports read them)
//
//   createTether options (blocks and ticks):
//     soft (4)          steering starts past this horizontal distance from home
//     hard (12)         past this (horizontally, or this far above or below home) it is teleported back
//     slow (0.15)       movement while steering, as a share of the mob's default movement
//     pull (0.22)       impulse toward home per check while steering (blocks per tick, grows to 2x at the hard radius)
//     water (true)      in water: teleported out (villagers and traders don't swim back to shore)
//     lava (true)       in lava: teleported out
//     holeDrop (3), holeChecks (6)   this far below home for this many checks in a row: stuck down a hole
//     cooldown (20), maxCooldown (600), window (400)   the snap guard below
//     spot (soft - 1)   a snap lands within this of home, on a free standable block
//     stall (80), rest (200), rests (3)   steered this long without getting half a block closer, with a wall or fence
//                       right ahead of it toward home: the push stops and it walks at its own speed for `rest` ticks,
//                       so its AI can find the way around; stuck like that `rests` times in a row: the last resort
//
//   const guard = createSnapGuard({ cooldown: 20, maxCooldown: 600, window: 400 });
//   if (guard.allow(id, now)) { ent.teleport(at); guard.snapped(id, now); }
//     For places that pin a mob that does not walk (an NPC on its post, an anchored story character): the first
//     put-back is free, then each one soon after the last (within `window` ticks of its wait ending) waits a cooldown that doubles up to
//     `maxCooldown`, so a mob that keeps falling or being pushed is not teleported every check. guard.snaps counts.
//
//   freeSpotNear(dim, home, radius, seed?)   a standable spot (floor under, feet and head free, no liquid) within
//                                            radius of home that a mob can walk to from home (no wall or fence in
//                                            the way), at home's floor height first, never 2 up or down; or
//                                            undefined; `seed` turns the search so mobs differ
//   settledBelow(ent, anchor)                 true when the mob dropped straight down from its anchor (its floor went
//                                            or it was put a block high) and stands on the ground: move the anchor
//                                            there instead of lifting it back up, which would loop.
//
// Cost per check: the mob's location and isInWater, one getBlock (lava) and, only while steering or on a state
// change, its movement component and an impulse. Nothing else is read.

/** @typedef {{ x: number, y: number, z: number }} Vec */

/** Blocks a mob stands in, not on (plants, torches, signs, carpets, rails...). */
const PASSABLE =
  /(^|:|_)(air|short_grass|tall_grass|grass|fern|large_fern|deadbush|bush|vine|vines|sapling|propagule|flower|tulip|poppy|dandelion|orchid|allium|bluet|daisy|cornflower|lily_of_the_valley|rose|lilac|peony|sunflower|petals|leaf_litter|torchflower|crimson_roots|warped_roots|hanging_roots|sprouts|fungus|mushroom|wheat|carrots|potatoes|beetroot|torch|candle|sign|banner|carpet|rail|button|lever|pressure_plate|tripwire|redstone_wire|string|snow_layer|light_block(_\d+)?|structure_void)$/;
/** Blocks a mob can't step up onto from the side (taller than a block, or a gate). */
const NO_STEP = /fence|wall|gate|iron_bars|pane|border_block/;
/** Floors nobody should be put on. */
const BAD_FLOOR = /lava|fire|magma|cactus|campfire|powder_snow|sweet_berry|leaves|scaffolding/;

/** @param {any} b */
const open = (b) => !!b && !b.isLiquid && (b.isAir || PASSABLE.test(b.typeId));
/** @param {any} b */
const floor = (b) => !!b && !b.isAir && !b.isLiquid && !PASSABLE.test(b.typeId) && !BAD_FLOOR.test(b.typeId);

/** @param {any} dim @param {number} x @param {number} y @param {number} z */
function block(dim, x, y, z) {
  try {
    const b = dim.getBlock({ x, y, z });
    if (b) void b.typeId; // a column that isn't ticking hands back a block that throws when read
    return b;
  } catch {
    return undefined;
  }
}

/**
 * A standable spot within `radius` of `home` that a mob can walk to from home: floor under, feet and head free, no
 * liquid, and nothing in the straight line from home that it can't step over (a wall, a fence, a gate). Spots at
 * home's own floor height come first, then home's own block, then a block lower, then a block higher; never two up
 * (a roof or a wall top) or two down. Undefined when none (or unloaded).
 * @param {any} dim @param {Vec} home @param {number} radius @param {number} [seed]
 * @returns {Vec | undefined}
 */
export function freeSpotNear(dim, home, radius, seed = 0) {
  const hx = Math.floor(home.x);
  const hy = Math.floor(home.y);
  const hz = Math.floor(home.z);
  /** @type {number[]} */
  const rings = [];
  for (let r = 1.5; r <= Math.max(1.5, radius); r += 1.5) rings.push(r);
  const turn = ((seed % 8) + 8) % 8;
  /** @param {number} x @param {number} z @param {number[]} dys */
  const at = (x, z, dys) => {
    for (const dy of dys) {
      const y = hy + dy;
      const feet = block(dim, x, y, z);
      if (!open(feet)) continue;
      if (!open(block(dim, x, y + 1, z))) continue;
      if (!floor(block(dim, x, y - 1, z))) continue;
      return { x: x + 0.5, y, z: z + 0.5 };
    }
    return undefined;
  };
  /** Can a mob walk the straight line from home to this column (stepping up at most one plain block)? @param {number} x @param {number} z */
  const reach = (x, z) => {
    const tx = x + 0.5;
    const tz = z + 0.5;
    const d = Math.hypot(tx - home.x, tz - home.z);
    const n = Math.ceil(d / 0.5);
    for (let i = 1; i < n; i++) {
      const cx = Math.floor(home.x + ((tx - home.x) * i) / n);
      const cz = Math.floor(home.z + ((tz - home.z) * i) / n);
      if ((cx === hx && cz === hz) || (cx === x && cz === z)) continue;
      const b = block(dim, cx, hy, cz);
      if (open(b)) continue;
      if (!b || NO_STEP.test(b.typeId) || !open(block(dim, cx, hy + 1, cz)) || !open(block(dim, cx, hy + 2, cz))) return false;
    }
    return true;
  };
  /** @param {number[]} dys */
  const ringsAt = (dys) => {
    for (const r of rings) {
      for (let k = 0; k < 8; k++) {
        const a = ((k + turn) % 8) * (Math.PI / 4);
        const x = Math.floor(home.x + Math.cos(a) * r);
        const z = Math.floor(home.z + Math.sin(a) * r);
        if (x === hx && z === hz) continue;
        const s = at(x, z, dys);
        if (s && reach(x, z)) return s;
      }
    }
    return undefined;
  };
  return ringsAt([0]) ?? at(hx, hz, [0]) ?? ringsAt([-1]) ?? ringsAt([1]) ?? at(hx, hz, [-1, 1]);
}

/**
 * Did the mob drop straight down from its anchor and come to rest there (its floor was broken, or the anchor was a
 * block or more above the ground)? Then the caller should move its anchor down to where it stands: lifting it back
 * up would only let it fall again, every check. @param {any} ent @param {Vec} anchor
 */
export function settledBelow(ent, anchor) {
  try {
    const l = ent.location;
    if (Math.hypot(l.x - anchor.x, l.z - anchor.z) > 1 || l.y > anchor.y - 0.9 || l.y < anchor.y - 16) return false;
    if (!ent.isOnGround) return false;
    return !floor(block(ent.dimension, Math.floor(anchor.x), Math.floor(anchor.y - 0.01), Math.floor(anchor.z)));
  } catch {
    return false;
  }
}

/**
 * @typedef {object} SnapGuard
 * @property {number} snaps put-backs so far
 * @property {(id: string, now: number) => boolean} allow may this entity be put back now?
 * @property {(id: string, now: number) => void} snapped records a put-back
 * @property {(id: string) => number} count put-backs of one entity
 * @property {(id: string) => void} forget drops what is kept for an entity
 */

/**
 * @typedef {object} Tether
 * @property {number} snaps last-resort teleports so far
 * @property {number} steers times a mob started being steered home
 * @property {number} soft
 * @property {number} hard
 * @property {(ent: any, home: Vec, now: number) => "in" | "steer" | "rest" | "snap" | "held" | "skip"} check
 * @property {(ent: any) => void} release
 * @property {(id: string) => void} forget
 * @property {(id?: string) => { snaps: number, steers: number, steering: number }} stats
 */

/**
 * Backoff for put-backs: the first is allowed, then each one that comes within `window` ticks after the previous
 * wait ended waits `cooldown` ticks, doubling up to `maxCooldown`. @param {{ cooldown?: number, maxCooldown?: number, window?: number }} [o] @returns {SnapGuard}
 */
export function createSnapGuard(o = {}) {
  const cooldown = o.cooldown ?? 20;
  const maxCooldown = o.maxCooldown ?? 600;
  const window = o.window ?? 400;
  /** id -> { last snap tick, current wait, snaps } @type {Map<string, { at: number, wait: number, n: number }>} */
  const byId = new Map();
  /** @type {SnapGuard} */
  const guard = {
    snaps: 0,
    /** May this entity be put back now? @param {string} id @param {number} now */
    allow(id, now) {
      const s = byId.get(id);
      return !s || now < s.at || now - s.at >= s.wait;
    },
    /** Records a put-back. @param {string} id @param {number} now */
    snapped(id, now) {
      const s = byId.get(id);
      // Again soon after the last wait ended: wait twice as long next time. Quiet for a window: back to the start.
      const again = !!s && now >= s.at && now - s.at < s.wait + window;
      byId.set(id, { at: now, wait: again && s ? Math.min(maxCooldown, s.wait * 2) : cooldown, n: (s?.n ?? 0) + 1 });
      guard.snaps++;
    },
    /** @param {string} id */
    count: (id) => byId.get(id)?.n ?? 0,
    /** @param {string} id */
    forget(id) {
      byId.delete(id);
    },
  };
  return guard;
}

/**
 * @typedef {object} TetherOptions
 * @property {number} [soft] @property {number} [hard] @property {number} [slow] @property {number} [pull]
 * @property {boolean} [water] @property {boolean} [lava] @property {number} [holeDrop] @property {number} [holeChecks]
 * @property {number} [cooldown] @property {number} [maxCooldown] @property {number} [window] @property {number} [spot]
 * @property {number} [stall] @property {number} [rest] @property {number} [rests]
 */

/** @param {TetherOptions} [o] @returns {Tether} */
export function createTether(o = {}) {
  const soft = o.soft ?? 4;
  const hard = Math.max(soft + 1, o.hard ?? 12);
  const slow = o.slow ?? 0.15;
  const pull = o.pull ?? 0.22;
  const water = o.water ?? true;
  const lava = o.lava ?? true;
  const holeDrop = o.holeDrop ?? 3;
  const holeChecks = o.holeChecks ?? 6;
  const spot = Math.max(1.5, o.spot ?? soft - 1);
  const stall = o.stall ?? 80;
  const rest = o.rest ?? 200;
  const rests = o.rests ?? 3;
  const guard = createSnapGuard(o);
  /** Progress while outside: closest yet, when it last got closer, a rest's end, rests in a row. @type {Map<string, { best: number, at: number, until: number, n: number }>} */
  const prog = new Map();
  /** Entities slowed by us (id -> true). @type {Set<string>} */
  const steering = new Set();
  /** Entities whose speed was put back at least once since the world loaded (a slowed one saved mid-steer). @type {Set<string>} */
  const seen = new Set();
  /** Checks in a row each mob has been down a hole. @type {Map<string, number>} */
  const low = new Map();
  /** Steering starts per entity. @type {Map<string, number>} */
  const steerN = new Map();

  /** @param {any} ent @param {number | undefined} share of the default movement, or undefined for the default */
  const speed = (ent, share) => {
    try {
      const m = ent.getComponent("minecraft:movement");
      if (!m) return;
      if (share === undefined) m.resetToDefaultValue();
      else m.setCurrentValue(Math.max(m.effectiveMin ?? 0, m.defaultValue * share));
    } catch {
      // unloaded, or a mob without a movement value
    }
  };

  /** @param {string} id */
  const idOf = (id) => String(id);

  /** @type {Tether} */
  const tether = {
    snaps: 0,
    steers: 0,
    soft,
    hard,
    /**
     * One check of a mob against its home. Returns "in" (inside, at its own speed), "steer" (outside the soft radius:
     * slowed and pushed home), "rest" (outside but stuck against a wall toward home: left to its own AI a while), "snap" (teleported back: water, lava, a hole or past the hard radius), "held" (it should
     * snap but its cooldown runs: slowed and pushed meanwhile) or "skip" (unloaded or gone).
     * @param {any} ent @param {Vec} home @param {number} now the game tick
     * @returns {"in" | "steer" | "rest" | "snap" | "held" | "skip"}
     */
    check(ent, home, now) {
      /** @type {Vec} */
      let l;
      /** @type {string} */
      let id;
      try {
        id = idOf(ent.id);
        l = ent.location;
      } catch {
        return "skip";
      }
      const dx = l.x - home.x;
      const dz = l.z - home.z;
      const flat = Math.hypot(dx, dz);
      let why = flat > hard || Math.abs(l.y - home.y) > hard;
      try {
        if (!why && water && ent.isInWater) why = true;
      } catch {
        return "skip";
      }
      if (!why && lava) why = !!block(ent.dimension, Math.floor(l.x), Math.floor(l.y), Math.floor(l.z))?.typeId?.includes("lava");
      if (!why && l.y < home.y - holeDrop) {
        const n = (low.get(id) ?? 0) + 1;
        low.set(id, n);
        why = n >= holeChecks;
      } else if (!why) low.delete(id);
      if (!why && flat > soft) {
        // Not getting closer with a wall or fence right ahead toward home (behind a tent or a house): pushing it into
        // the wall at a crawl would pin it there for good, so it walks at its own speed for a while to find the way
        // around. Stuck like that a few times in a row: the last resort.
        const p = prog.get(id);
        if (!p) prog.set(id, { best: flat, at: now, until: 0, n: 0 });
        else if (now < p.until) return "rest";
        else if (flat < p.best - 0.5) {
          p.best = flat;
          p.at = now;
        } else if (now - p.at >= stall) {
          if (!walled(ent.dimension, l, dx, dz, flat)) p.at = now;
          else if (p.n >= rests) why = true;
          else {
            p.n++;
            p.until = now + rest;
            p.best = flat;
            p.at = p.until;
            steering.delete(id);
            speed(ent, undefined);
            return "rest";
          }
        }
      }
      if (why) {
        if (guard.allow(id, now)) {
          low.delete(id);
          // A free spot near home, else home itself, but never into a chunk that isn't loaded.
          let to = freeSpotNear(ent.dimension, home, spot, hashId(id));
          if (!to) {
            if (!block(ent.dimension, Math.floor(home.x), Math.floor(home.y), Math.floor(home.z))) return "skip";
            to = home;
          }
          try {
            ent.teleport(to);
            ent.clearVelocity();
          } catch {
            return "skip";
          }
          guard.snapped(id, now);
          tether.snaps++;
          prog.delete(id);
          if (steering.delete(id) || !seen.has(id)) speed(ent, undefined);
          seen.add(id);
          return "snap";
        }
        steer(ent, id, dx, dz, flat);
        return "held";
      }
      if (flat > soft) {
        steer(ent, id, dx, dz, flat);
        return "steer";
      }
      // Back inside (with a block of room, so it doesn't flip at the edge): its own speed again.
      if (flat <= soft - 1) prog.delete(id);
      if ((steering.has(id) && flat <= soft - 1) || !seen.has(id)) {
        steering.delete(id);
        seen.add(id);
        speed(ent, undefined);
      }
      return "in";
    },
    /** Its own speed again now. @param {any} ent */
    release(ent) {
      try {
        const id = idOf(ent.id);
        steering.delete(id);
        seen.add(id);
      } catch {
        return;
      }
      speed(ent, undefined);
    },
    /** @param {string} id */
    forget(id) {
      steering.delete(id);
      seen.delete(id);
      low.delete(id);
      prog.delete(id);
      steerN.delete(id);
      guard.forget(id);
    },
    /** Counters: all mobs, or one. @param {string} [id] */
    stats(id) {
      if (id === undefined) return { snaps: tether.snaps, steers: tether.steers, steering: steering.size };
      return { snaps: guard.count(id), steers: steerN.get(id) ?? 0, steering: steering.has(id) ? 1 : 0 };
    },
  };

  /** Slowed, facing home and pushed toward it. @param {any} ent @param {string} id @param {number} dx @param {number} dz @param {number} flat */
  function steer(ent, id, dx, dz, flat) {
    if (!steering.has(id)) {
      steering.add(id);
      seen.add(id);
      tether.steers++;
      steerN.set(id, (steerN.get(id) ?? 0) + 1);
      speed(ent, slow);
    }
    if (flat < 0.01) return;
    const k = pull * (1 + Math.min(1, Math.max(0, (flat - soft) / (hard - soft))));
    try {
      ent.applyImpulse({ x: (-dx / flat) * k, y: 0, z: (-dz / flat) * k });
    } catch {
      // unloaded, or riding something
    }
    try {
      ent.setRotation({ x: 0, y: (Math.atan2(dx, -dz) * 180) / Math.PI });
    } catch {
      // unloaded
    }
  }

  return tether;
}

/**
 * Is there a wall or fence right ahead of a mob, toward home (it can't walk on that way)? @param {any} dim
 * @param {Vec} l where it stands @param {number} dx @param {number} dz home to it @param {number} flat their length
 */
function walled(dim, l, dx, dz, flat) {
  if (flat < 0.01) return false;
  const y = Math.floor(l.y + 0.01);
  for (const ahead of [0.8, 1.3]) {
    const x = Math.floor(l.x - (dx / flat) * ahead);
    const z = Math.floor(l.z - (dz / flat) * ahead);
    if (x === Math.floor(l.x) && z === Math.floor(l.z)) continue;
    const feet = block(dim, x, y, z);
    if (!feet) return false; // not loaded: no verdict
    if (open(feet)) continue;
    if (NO_STEP.test(feet.typeId) || !open(block(dim, x, y + 1, z)) || !open(block(dim, x, y + 2, z))) return true;
  }
  return false;
}

/** @param {string} s */
function hashId(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}
