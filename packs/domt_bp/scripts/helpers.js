// Small tools the cards use: safe teleports, gifts, spawns, safe zones and timed block restores.
import { Dimension, Entity, EnchantmentTypes, ItemStack, Player, system, world } from "@minecraft/server";

// ---------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------

/** @param {number} ticks */
export const wait = (ticks) => new Promise((r) => system.runTimeout(() => r(undefined), Math.max(1, Math.floor(ticks))));

/** @template T @param {readonly T[]} list @returns {T} */
export const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** @param {number} a @param {number} b whole number from a to b */
export const between = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/** "minecraft:golden_carrot" -> "Golden Carrot". @param {string} id */
export const prettyId = (id) =>
  id
    .replace(/^minecraft:/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** @param {() => void} fn */
export function attempt(fn) {
  try {
    fn();
  } catch {
    // purely cosmetic: a sound or particle that isn't there
  }
}

/** @param {Player} p @param {string} sound @param {number} [pitch] @param {number} [volume] */
export const sound = (p, sound, pitch = 1, volume = 1) => attempt(() => p.playSound(sound, { pitch, volume }));

/** Particles around a point, `n` of them in a small cloud. @param {Dimension} dim @param {string} id @param {import("@minecraft/server").Vector3} at @param {number} [n] @param {number} [spread] */
export function burst(dim, id, at, n = 12, spread = 1.2) {
  for (let i = 0; i < n; i++) {
    const loc = { x: at.x + (Math.random() - 0.5) * 2 * spread, y: at.y + Math.random() * 2 * spread, z: at.z + (Math.random() - 0.5) * 2 * spread };
    attempt(() => dim.spawnParticle(id, loc));
  }
}

/** Adds a status effect. @param {Entity} e @param {string} id @param {number} seconds @param {number} [amp] */
export function effect(e, id, seconds, amp = 0) {
  e.addEffect(id, Math.max(1, Math.round(seconds * 20)), { amplifier: amp, showParticles: true });
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/**
 * @typedef {object} GiftOptions
 * @property {string} [name] custom name
 * @property {string[]} [lore]
 * @property {[string, number][]} [enchants] enchantment id and level; ones the item can't take are skipped
 */

/** @param {string} id @param {number} amount @param {GiftOptions} [opts] */
export function makeItem(id, amount = 1, opts = {}) {
  const stack = new ItemStack(id, amount);
  if (opts.name) stack.nameTag = opts.name;
  if (opts.lore) stack.setLore(opts.lore);
  if (opts.enchants?.length) enchant(stack, opts.enchants);
  return stack;
}

/** Adds what enchantments fit. @param {ItemStack} stack @param {[string, number][]} list @returns {number} how many were added */
export function enchant(stack, list) {
  const comp = stack.getComponent("minecraft:enchantable");
  if (!comp) return 0;
  let n = 0;
  for (const [id, level] of list) {
    const type = EnchantmentTypes.get(id);
    if (!type) continue;
    const e = { type, level: Math.max(1, Math.min(type.maxLevel, level)) };
    try {
      if (comp.canAddEnchantment(e)) {
        comp.addEnchantment(e);
        n++;
      }
    } catch {
      // incompatible with one already on it
    }
  }
  return n;
}

/** Gives a stack (or many), dropping what doesn't fit at the player's feet. @param {Player} p @param {ItemStack} stack */
export function giveStack(p, stack) {
  const inv = p.getComponent("minecraft:inventory")?.container;
  const rest = inv ? inv.addItem(stack) : stack;
  if (rest) p.dimension.spawnItem(rest, p.location);
}

/** Gives `amount` of an item in as many stacks as it takes. @param {Player} p @param {string} id @param {number} amount @param {GiftOptions} [opts] */
export function give(p, id, amount = 1, opts = {}) {
  const max = new ItemStack(id, 1).maxAmount;
  let left = Math.max(1, Math.floor(amount));
  while (left > 0) {
    const n = Math.min(max, left);
    giveStack(p, makeItem(id, n, opts));
    left -= n;
  }
}

// Enchantments that suit each kind of gear, for random enchanted gifts.
export const ENCHANTS = {
  pickaxe: ["efficiency", "unbreaking", "fortune", "silk_touch", "mending"],
  axe: ["efficiency", "unbreaking", "sharpness", "mending"],
  shovel: ["efficiency", "unbreaking", "fortune", "mending"],
  sword: ["sharpness", "smite", "bane_of_arthropods", "looting", "fire_aspect", "knockback", "unbreaking", "mending"],
  bow: ["power", "punch", "flame", "infinity", "unbreaking"],
  armor: ["protection", "fire_protection", "blast_protection", "projectile_protection", "unbreaking", "thorns", "mending"],
  boots: ["protection", "feather_falling", "depth_strider", "unbreaking", "mending"],
  helmet: ["protection", "respiration", "aqua_affinity", "unbreaking", "mending"],
  book: ["efficiency", "unbreaking", "fortune", "silk_touch", "sharpness", "looting", "protection", "feather_falling", "power", "infinity", "respiration", "depth_strider", "fire_aspect", "smite", "thorns", "mending", "frost_walker", "loyalty", "riptide", "channeling", "impaling", "multishot", "quick_charge", "piercing"],
};

/**
 * An item with `count` random enchantments from `pool`, up to `maxLevel` each.
 * @param {string} id @param {string[]} pool @param {number} count @param {number} maxLevel @param {GiftOptions} [opts]
 */
export function randomEnchanted(id, pool, count, maxLevel, opts = {}) {
  const stack = makeItem(id, 1, opts);
  const options = [...pool].sort(() => Math.random() - 0.5);
  let added = 0;
  for (const name of options) {
    if (added >= count) break;
    added += enchant(stack, [[`minecraft:${name}`, between(1, maxLevel)]]);
  }
  return { stack, added };
}

// ---------------------------------------------------------------------------
// Blocks and safe spots
// ---------------------------------------------------------------------------

/** Small plants and decorations a player can stand in. */
const PASSABLE = /(^minecraft:(short_grass|tall_grass|fern|large_fern|deadbush|dead_bush|snow_layer|vine|glow_lichen|leaf_litter|wildflowers|bush|firefly_bush|short_dry_grass|tall_dry_grass|pink_petals)$)|(flower|tulip|dandelion|poppy|orchid|allium|bluet|daisy|cornflower|lily_of_the_valley|wither_rose|sapling|_carpet|torch$)/;
/** Never stand on or in these. */
const HARMFUL = /lava|fire|magma|cactus|campfire|sweet_berry_bush|powder_snow|wither_rose|pointed_dripstone|cobweb|water|bubble_column|kelp|seagrass|scaffolding|end_portal|portal|lily_pad|pressure_plate|tripwire|trapdoor|_door$|_sign$|ladder/;

/** @param {Dimension} dim @param {import("@minecraft/server").Vector3} loc */
export function blockAt(dim, loc) {
  try {
    const r = dim.heightRange;
    if (loc.y < r.min || loc.y >= r.max) return undefined;
    return dim.getBlock(loc);
  } catch {
    return undefined;
  }
}

/** Air or something you can stand inside without harm. @param {import("@minecraft/server").Block | undefined} b */
export const open = (b) => !!b && (b.isAir || (!b.isLiquid && PASSABLE.test(b.typeId) && !HARMFUL.test(b.typeId)));

/** A full block to stand on: not air, not liquid, nothing harmful, not a plant. @param {import("@minecraft/server").Block | undefined} b */
export const floor = (b) => !!b && !b.isAir && !b.isLiquid && !HARMFUL.test(b.typeId) && !PASSABLE.test(b.typeId) && !/leaves|slab|fence|wall|pane|bars|chain|lantern|rail|button|lever|bed$|carpet|snow_layer/.test(b.typeId);

/**
 * Can a player stand with their feet at this block position? Solid floor, two open blocks, no lava
 * beside the feet. Undefined when the chunk isn't loaded.
 * @param {Dimension} dim @param {number} x @param {number} y @param {number} z
 */
export function standable(dim, x, y, z) {
  const below = blockAt(dim, { x, y: y - 1, z });
  const feet = blockAt(dim, { x, y, z });
  const head = blockAt(dim, { x, y: y + 1, z });
  if (!floor(below) || !open(feet) || !open(head)) return false;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const side = blockAt(dim, { x: x + dx, y, z: z + dz });
    if (side && /lava|fire/.test(side.typeId)) return false;
  }
  return true;
}

/** Feet position near height `y` in this column (searching up to `dy` up and down), nearest first. @param {Dimension} dim @param {number} x @param {number} z @param {number} y @param {number} dy */
export function spotNear(dim, x, z, y, dy) {
  const fx = Math.floor(x);
  const fz = Math.floor(z);
  const fy = Math.floor(y);
  for (let d = 0; d <= dy; d++) {
    for (const yy of d ? [fy + d, fy - d] : [fy]) {
      if (standable(dim, fx, yy, fz)) return { x: fx + 0.5, y: yy, z: fz + 0.5 };
    }
  }
  return undefined;
}

/** The open-sky surface of a column (overworld and End), or the highest safe pocket under the Nether roof. @param {Dimension} dim @param {number} x @param {number} z */
export function surface(dim, x, z) {
  const fx = Math.floor(x);
  const fz = Math.floor(z);
  if (dim.id === "minecraft:nether") {
    for (let y = 118; y > 6; y--) if (standable(dim, fx, y, fz)) return { x: fx + 0.5, y, z: fz + 0.5 };
    return undefined;
  }
  let top;
  try {
    top = dim.getTopmostBlock({ x: fx, z: fz });
  } catch {
    return undefined;
  }
  if (!top) return undefined;
  const y = top.location.y + 1;
  return standable(dim, fx, y, fz) ? { x: fx + 0.5, y, z: fz + 0.5 } : undefined;
}

/**
 * A safe spot `minD` to `maxD` blocks away in a random direction, in loaded chunks: near the
 * player's height first (so cave players stay in caves), then the surface.
 * @param {Entity} e @param {number} minD @param {number} maxD @param {number} [tries]
 */
export function randomSpot(e, minD, maxD, tries = 40) {
  const dim = e.dimension;
  const at = e.location;
  for (let i = 0; i < tries; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = minD + Math.random() * (maxD - minD);
    const x = at.x + Math.cos(a) * d;
    const z = at.z + Math.sin(a) * d;
    const spot = spotNear(dim, x, z, at.y, 6) ?? (dim.id === "minecraft:nether" ? undefined : surface(dim, x, z));
    if (spot) return spot;
  }
  return undefined;
}

/** Teleports an entity to a safe spot `minD` to `maxD` away. @param {Player} p @param {number} minD @param {number} maxD @returns {boolean} */
export function safeHop(p, minD, maxD) {
  const spot = randomSpot(p, minD, maxD);
  if (!spot) return false;
  const from = p.location;
  burst(p.dimension, "minecraft:portal_reverse_particle", from, 16);
  p.teleport(spot, { dimension: p.dimension, keepVelocity: false });
  burst(p.dimension, "minecraft:portal_reverse_particle", spot, 16);
  sound(p, "mob.endermen.portal");
  return true;
}

/**
 * Teleports a player far away, possibly into another dimension, where the chunks aren't loaded yet:
 * the player waits high in the air (held in place, with Slow Falling) until the place loads, then
 * lands on the safest spot found near the first target that has one (ocean or lava sea: next
 * target). Puts them back where they were if no target works.
 * @param {Player} p @param {Dimension} dim @param {{ x: number, z: number }[]} targets
 * @returns {Promise<import("@minecraft/server").Vector3 | undefined>} where they landed
 */
export async function farTeleport(p, dim, targets) {
  const home = { dim: p.dimension, at: { ...p.location } };
  const hoverY = dim.id === "minecraft:nether" ? 130 : dim.heightRange.max - 4;
  effect(p, "minecraft:slow_falling", 60);
  effect(p, "minecraft:resistance", 30, 4);
  /** @type {import("@minecraft/server").Vector3 | undefined} */
  let landed;
  for (const target of targets) {
    if (landed || !p.isValid) break;
    const hover = { x: Math.floor(target.x) + 0.5, y: hoverY, z: Math.floor(target.z) + 0.5 };
    attempt(() => p.teleport(hover, { dimension: dim, keepVelocity: false }));
    /** @type {string | undefined} a ticking area, if the player alone doesn't load the place quickly */
    let area;
    try {
      for (let t = 0; t < 40; t++) {
        await wait(5);
        if (!p.isValid) return undefined;
        attempt(() => p.teleport(hover, { dimension: dim, keepVelocity: false }));
        if (!blockAt(dim, { x: hover.x, y: 64, z: hover.z })) {
          if (t === 4 && !area) {
            const name = `domt_${system.currentTick}`;
            try {
              dim.runCommand(`tickingarea add circle ${Math.floor(hover.x)} 64 ${Math.floor(hover.z)} 1 "${name}" true`);
              area = name;
            } catch {
              // all ticking areas in use: keep waiting for the player to load it
            }
          }
          continue;
        }
        // Loaded: look for a spot in this column, then in rings around it.
        for (let r = 0; r <= 12 && !landed; r += 2) {
          for (let k = 0; k < (r ? 12 : 1) && !landed; k++) {
            const a = (k / 12) * Math.PI * 2;
            landed = surface(dim, hover.x + Math.cos(a) * r, hover.z + Math.sin(a) * r);
          }
        }
        break;
      }
    } finally {
      if (area) {
        const name = area;
        system.runTimeout(() => attempt(() => dim.runCommand(`tickingarea remove "${name}"`)), 100);
      }
    }
  }
  if (!p.isValid) return undefined;
  p.teleport(landed ?? home.at, { dimension: landed ? dim : home.dim, keepVelocity: false });
  p.removeEffect("minecraft:slow_falling");
  p.removeEffect("minecraft:resistance");
  return landed;
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

/**
 * Spawns `n` of a mob on safe spots `minR` to `maxR` blocks around the player (at their feet when
 * there's no room).
 * @param {Player} p @param {string} type @param {number} n @param {number} [minR] @param {number} [maxR]
 * @returns {Entity[]}
 */
export function spawnAround(p, type, n, minR = 3, maxR = 6) {
  /** @type {Entity[]} */
  const out = [];
  for (let i = 0; i < n; i++) {
    const spot = randomSpot(p, minR, maxR, 20) ?? p.location;
    try {
      const e = p.dimension.spawnEntity(type, spot);
      out.push(e);
      burst(p.dimension, "minecraft:basic_smoke_particle", spot, 6, 0.6);
    } catch (err) {
      console.warn(`[domt] spawn ${type}: ${err}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Crowns (the shared `crowns` scoreboard)
// ---------------------------------------------------------------------------

function crownsObjective() {
  const existing = world.scoreboard.getObjective("crowns");
  if (existing) return existing;
  try {
    return world.scoreboard.addObjective("crowns", "Crowns");
  } catch {
    return /** @type {import("@minecraft/server").ScoreboardObjective} */ (world.scoreboard.getObjective("crowns"));
  }
}

/** @param {Player} p */
export function crownsOf(p) {
  try {
    return crownsObjective().getScore(p) ?? 0;
  } catch {
    return 0;
  }
}

/** Adds (or with a negative amount takes, never below 0) Crowns. @param {Player} p @param {number} n @returns {number} the change */
export function addCrowns(p, n) {
  const have = crownsOf(p);
  const change = Math.max(-have, Math.floor(n));
  if (change) crownsObjective().addScore(p, change);
  else if (crownsObjective().getScore(p) === undefined) crownsObjective().addScore(p, 0);
  return change;
}

// ---------------------------------------------------------------------------
// Safe zones (realm:zones protocol): no block changes inside any zone
// ---------------------------------------------------------------------------

/** @typedef {{ id: string, name?: string, dim: string, x: number, z: number, r: number, shape?: string }} Zone */

/** @type {Map<string, Zone[]>} the latest full list per provider */
const zonesBySrc = new Map();
/** @type {Map<string, Zone[]>} parts still arriving */
const incoming = new Map();

/** @param {any} msg */
function takeZones(msg) {
  if (!msg || typeof msg !== "object" || typeof msg.src !== "string") return;
  const parts = Number(msg.parts) || 0;
  const part = Number(msg.part) || 1;
  const list = Array.isArray(msg.zones) ? msg.zones.filter((/** @type {any} */ z) => z && typeof z.x === "number" && typeof z.z === "number" && typeof z.r === "number") : [];
  if (parts <= 0 || (parts <= 1 && !list.length)) {
    zonesBySrc.set(msg.src, []);
    incoming.delete(msg.src);
    return;
  }
  const buf = part <= 1 ? [] : incoming.get(msg.src) ?? [];
  buf.push(...list);
  if (part >= parts) {
    zonesBySrc.set(msg.src, buf);
    incoming.delete(msg.src);
  } else incoming.set(msg.src, buf);
}

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:zones") return;
    try {
      takeZones(JSON.parse(message));
    } catch {
      // malformed: ignore
    }
  },
  { namespaces: ["realm"] },
);
system.runTimeout(() => attempt(() => system.sendScriptEvent("realm:zones_ping", "{}")), 120);

/** Is any part of the square of half-size `pad` around (x, z) inside a safe zone? Every zone counts as its full square, to be safe. @param {string} dimId @param {number} x @param {number} z @param {number} [pad] */
export function inZone(dimId, x, z, pad = 0) {
  for (const list of zonesBySrc.values()) {
    for (const zone of list) {
      if ((zone.dim ?? "minecraft:overworld") !== dimId) continue;
      const reach = zone.r + pad;
      if (Math.abs(x - zone.x) <= reach && Math.abs(z - zone.z) <= reach) return true;
    }
  }
  return false;
}

/** How many zones are known (for the test path and the odds page). */
export const zoneCount = () => [...zonesBySrc.values()].reduce((n, l) => n + l.length, 0);

// ---------------------------------------------------------------------------
// Timed restores: block changes that undo themselves, saved so a restart doesn't lose them
// ---------------------------------------------------------------------------

/**
 * @typedef {object} RestoreTask
 * @property {string} id
 * @property {string} dim
 * @property {number} at when to restore (ms since 1970)
 * @property {string[]} types block ids used in `blocks`
 * @property {number[][]} blocks [x, y, z, original type index, placed type index]: put back only where the placed block is still there
 * @property {number[]} [sweep] [x1, y1, z1, x2, y2, z2, type index, back to type index]: also turn every such block in this box back (mycelium that spread)
 */

const TASKS = "domt:tasks"; // world: JSON list of task ids
const taskKey = (/** @type {string} */ id) => `domt:task:${id}`;

/** @returns {string[]} */
function taskIds() {
  try {
    const raw = world.getDynamicProperty(TASKS);
    const v = typeof raw === "string" ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** @param {RestoreTask} task */
export function saveTask(task) {
  world.setDynamicProperty(taskKey(task.id), JSON.stringify(task));
  const ids = taskIds();
  if (!ids.includes(task.id)) world.setDynamicProperty(TASKS, JSON.stringify([...ids, task.id]));
}

/** @param {string} id @returns {RestoreTask | undefined} */
function loadTask(id) {
  try {
    const raw = world.getDynamicProperty(taskKey(id));
    return typeof raw === "string" ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

/** @param {string} id */
function dropTask(id) {
  world.setDynamicProperty(taskKey(id), undefined);
  const ids = taskIds().filter((x) => x !== id);
  world.setDynamicProperty(TASKS, ids.length ? JSON.stringify(ids) : undefined);
}

/** Restores a task's blocks. @param {RestoreTask} task @returns {boolean} false when a chunk isn't loaded (try later) */
function runTask(task) {
  const dim = world.getDimension(task.dim);
  for (const [x, y, z] of task.blocks) if (!blockAt(dim, { x, y, z })) return false;
  for (const [x, y, z, orig, placed] of task.blocks) {
    const b = blockAt(dim, { x, y, z });
    if (b && b.typeId === task.types[placed]) attempt(() => b.setType(task.types[orig]));
  }
  if (task.sweep) {
    const [x1, y1, z1, x2, y2, z2, from, to] = task.sweep;
    for (let x = x1; x <= x2; x++)
      for (let z = z1; z <= z2; z++)
        for (let y = y1; y <= y2; y++) {
          const b = blockAt(dim, { x, y, z });
          if (b && b.typeId === task.types[from]) attempt(() => b.setType(task.types[to]));
        }
  }
  return true;
}

/** Restores every task that is due (or, with `id`, that one now). @param {string} [id] @returns {number} how many were restored */
export function restoreDue(id) {
  let n = 0;
  for (const tid of taskIds()) {
    if (id && tid !== id) continue;
    const task = loadTask(tid);
    if (!task) {
      dropTask(tid);
      continue;
    }
    if (!id && task.at > Date.now()) continue;
    try {
      if (runTask(task)) {
        dropTask(tid);
        n++;
      }
    } catch (e) {
      console.warn(`[domt] restore ${tid}: ${e}`);
    }
  }
  return n;
}

/** Tasks waiting (for the operator page). */
export const pendingTasks = () => taskIds().length;

system.runInterval(() => {
  try {
    restoreDue();
  } catch (e) {
    console.warn(`[domt] restore: ${e}`);
  }
}, 200);
