import { system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

// After a player breaks a log, the natural leaves around it that no longer reach a log within
// logDistance steps (through leaves, as vanilla counts) decay over the next few seconds, with their
// normal drops. Player-placed leaves (persistent_bit) are never broken, but they do carry the
// distance, as in vanilla.
//
// Logs broken close together within delayTicks are checked once, together: chopping a tree log by log
// or felling it whole (Bedrock Essentials+ sneak-break, which fires one break event for the whole tree)
// costs one check. Felled trees leave an empty trunk column, so the check follows it up to the canopy.

/** @typedef {{ x: number, y: number, z: number }} Pos */
/** @typedef {{ dim: string, seeds: Pos[], due: number, latest: number }} Check */

const MAX_SEEDS = 64; // broken logs one check starts from
const MAX_PENDING = 32; // checks waiting at once
const MAX_QUEUE = 6000; // leaves waiting to decay
const MAX_WAIT = 200; // ticks: a check waits at most this long while logs keep breaking nearby
const MERGE = 10; // blocks: a log this close to a waiting check's logs joins that check

// What a block is, for the check.
const OTHER = 0;
const AIR = 1;
const LOG = 2;
const LEAF = 3; // natural: may decay
const PLACED = 4; // player-placed (persistent_bit): carries the distance, never decays
const UNKNOWN = 5; // unloaded or outside the world: treated as if it held a log

const enabled = () => get("enabled") === true;

/** @param {string} id */
const isLeaf = (id) => id.endsWith("_leaves") || id === "minecraft:azalea_leaves_flowered" || id === "minecraft:leaves" || id === "minecraft:leaves2";
/** Logs and wood, stripped or not: what keeps leaves alive. @param {string} id */
const isLog = (id) => id.endsWith("_log") || id.endsWith("_wood") || id === "minecraft:log" || id === "minecraft:log2";

/** @type {Check[]} */
const pending = [];
/** @type {{ dim: string, x: number, y: number, z: number }[]} */
const queue = [];
let running = false;

// ---------------------------------------------------------------------------
// Log breaks
// ---------------------------------------------------------------------------

world.afterEvents.playerBreakBlock.subscribe(({ block, brokenBlockPermutation, dimension }) => {
  if (!isLog(brokenBlockPermutation.type.id) || !enabled()) return;
  const at = block.location;
  const pos = { x: at.x, y: at.y, z: at.z };
  const now = system.currentTick;
  const near = pending.find(
    (c) =>
      c.dim === dimension.id &&
      c.seeds.length < MAX_SEEDS &&
      c.seeds.some((s) => Math.abs(s.x - pos.x) <= MERGE && Math.abs(s.y - pos.y) <= MERGE && Math.abs(s.z - pos.z) <= MERGE)
  );
  if (near) {
    near.seeds.push(pos);
    near.latest = now;
    return;
  }
  if (pending.length >= MAX_PENDING) return; // a lot is going on: vanilla decay handles the rest
  pending.push({ dim: dimension.id, seeds: [pos], due: now, latest: now });
});

// ---------------------------------------------------------------------------
// The check (a job, spread over ticks)
// ---------------------------------------------------------------------------

/** @param {number} x @param {number} y @param {number} z */
const keyOf = (x, y, z) => `${x},${y},${z}`;

const SIDES = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * Finds the leaves near the broken logs that no longer reach a log, and queues them to decay.
 * @param {Check} check
 * @returns {Generator<void, void, void>}
 */
function* runCheck(check) {
  try {
    const dim = world.getDimension(check.dim);
    const maxBlocks = CONFIG.maxBlocks;
    const depthLimit = CONFIG.searchDepth;
    /** @type {Map<string, number>} */
    const kinds = new Map();
    let reads = 0;

    /** @param {number} x @param {number} y @param {number} z */
    const kindAt = (x, y, z) => {
      const key = keyOf(x, y, z);
      const known = kinds.get(key);
      if (known !== undefined) return known;
      reads++;
      let k = UNKNOWN;
      try {
        const b = dim.getBlock({ x, y, z });
        if (b) {
          const id = b.typeId;
          if (id === "minecraft:air") k = AIR;
          else if (isLog(id)) k = LOG;
          else if (isLeaf(id)) k = b.permutation.getState("persistent_bit") === true ? PLACED : LEAF;
          else k = OTHER;
        }
      } catch {
        k = UNKNOWN;
      }
      kinds.set(key, k);
      return k;
    };
    const leafy = (/** @type {number} */ k) => k === LEAF || k === PLACED;

    // 1. Where to start: leaves next to each broken log, and up its now-empty trunk column.
    /** @type {Pos[]} */
    const starts = [];
    for (const s of check.seeds) {
      for (const [dx, dy, dz] of SIDES) if (leafy(kindAt(s.x + dx, s.y + dy, s.z + dz))) starts.push({ x: s.x + dx, y: s.y + dy, z: s.z + dz });
      for (let dy = 1; dy <= CONFIG.fellHeight; dy++) {
        const y = s.y + dy;
        const k = kindAt(s.x, y, s.z);
        if (leafy(k)) {
          starts.push({ x: s.x, y, z: s.z });
          break;
        }
        if (k !== AIR) break; // a log still stands above (its leaves are held), or the column ends
        for (const [dx, , dz] of SIDES) if ((dx || dz) && leafy(kindAt(s.x + dx, y, s.z + dz))) starts.push({ x: s.x + dx, y, z: s.z + dz });
        if (dy % 8 === 0) yield;
      }
      yield;
    }
    if (!starts.length) return;

    // 2. Every leaf connected to those, up to searchDepth steps. A leaf next to a log, or next to
    // anything unread (cut off by the limits, unloaded), counts as held at distance 1.
    /** @type {Map<string, { x: number, y: number, z: number, natural: boolean, held: boolean, next: string[] }>} */
    const leaves = new Map();
    /** @type {{ key: string, depth: number }[]} */
    const frontier = [];
    for (const p of starts) {
      const key = keyOf(p.x, p.y, p.z);
      if (leaves.has(key)) continue;
      leaves.set(key, { ...p, natural: kinds.get(key) === LEAF, held: false, next: [] });
      frontier.push({ key, depth: 1 });
    }
    for (let i = 0; i < frontier.length; i++) {
      const { key, depth } = frontier[i];
      const node = /** @type {NonNullable<ReturnType<typeof leaves.get>>} */ (leaves.get(key));
      if (reads >= maxBlocks) {
        node.held = true; // its neighbors were never read
        continue;
      }
      for (const [dx, dy, dz] of SIDES) {
        const x = node.x + dx, y = node.y + dy, z = node.z + dz;
        const k = kindAt(x, y, z);
        if (k === LOG || k === UNKNOWN) node.held = true;
        else if (leafy(k)) {
          const nkey = keyOf(x, y, z);
          const other = leaves.get(nkey);
          if (other) {
            node.next.push(nkey);
            other.next.push(key); // links go both ways (a repeat is harmless)
          } else if (depth < depthLimit && reads < maxBlocks) {
            leaves.set(nkey, { x, y, z, natural: k === LEAF, held: false, next: [key] });
            node.next.push(nkey);
            frontier.push({ key: nkey, depth: depth + 1 });
          } else node.held = true; // beyond what this check reads: it might reach a log
        }
      }
      if (i % 16 === 15) yield;
    }

    // 3. Distance to a log through leaves, from every held leaf at once.
    /** @type {Map<string, number>} */
    const dist = new Map();
    /** @type {string[]} */
    const wave = [];
    for (const [key, node] of leaves) {
      if (node.held) {
        dist.set(key, 1);
        wave.push(key);
      }
    }
    for (let i = 0; i < wave.length; i++) {
      const key = wave[i];
      const d = /** @type {number} */ (dist.get(key));
      if (d >= CONFIG.logDistance) continue;
      for (const nkey of /** @type {NonNullable<ReturnType<typeof leaves.get>>} */ (leaves.get(key)).next) {
        if (!dist.has(nkey)) {
          dist.set(nkey, d + 1);
          wave.push(nkey);
        }
      }
      if (i % 64 === 63) yield;
    }

    // 4. Natural leaves with no log in reach decay, in a random order so a canopy thins out evenly.
    /** @type {{ dim: string, x: number, y: number, z: number }[]} */
    const doomed = [];
    for (const [key, node] of leaves) {
      if (node.natural && !dist.has(key)) doomed.push({ dim: check.dim, x: node.x, y: node.y, z: node.z });
    }
    for (let i = doomed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [doomed[i], doomed[j]] = [doomed[j], doomed[i]];
    }
    for (const d of doomed) {
      if (queue.length >= MAX_QUEUE) break;
      queue.push(d);
    }
  } catch (e) {
    console.warn(`[leaves] ${e}`);
  } finally {
    running = false;
  }
}

// ---------------------------------------------------------------------------
// Ticker: start due checks one at a time, and decay a few leaves per tick
// ---------------------------------------------------------------------------

system.runInterval(() => {
  if (!pending.length && !queue.length) return;
  if (!enabled()) {
    pending.length = 0;
    queue.length = 0;
    return;
  }
  const now = system.currentTick;

  if (!running && pending.length) {
    const i = pending.findIndex((c) => now - c.latest >= CONFIG.delayTicks || now - c.due >= MAX_WAIT);
    if (i >= 0) {
      const [check] = pending.splice(i, 1);
      running = true;
      try {
        system.runJob(runCheck(check));
      } catch (e) {
        running = false;
        console.warn(`[leaves] ${e}`);
      }
    }
  }

  const n = Math.min(queue.length, get("leavesPerTick"));
  for (const leaf of queue.splice(0, n)) {
    try {
      const dim = world.getDimension(leaf.dim);
      const b = dim.getBlock(leaf);
      // Still a natural leaf? (Someone may have broken it, or sheared and placed it back.)
      if (!b || !isLeaf(b.typeId) || b.permutation.getState("persistent_bit") === true) continue;
      // "destroy" breaks it like a hand would: the leaves' own loot (saplings, sticks, apples), particles and sound.
      dim.runCommand(`setblock ${leaf.x} ${leaf.y} ${leaf.z} air destroy`);
    } catch {
      // unloaded meanwhile: vanilla decay takes over there
    }
  }
}, 1);

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "leaves_bp");
  },
  { namespaces: ["realm"] }
);
