// Atlas of the Realm: every stretch of land has a name. The Overworld is cut into regions (a grid of
// `cellSize` squares centered on world spawn); each region gets a name from its land and a few sites
// (shrines, Starwright tablets, Choir cairns, camps, hermit huts, wrecks, watch posts, fossil digs,
// starglass pools, Fenn's survey markers) that are built, for good, when a player first comes near.
//
// Script events (JSON, each under 2048 characters):
//   realm:saga_progress      { player, act }                          <- Story Questlines: main acts finished (0-5)
//   realm:saga_progress_ping {}                                       -> asks Story Questlines to send it again
//   realm:poi                { kind, dim, x, z, name }                -> a site wanderers count as an anchor
//   realm:quest_done         { player, pack, id: "atlas:<kind>:<site>", label, kind: "explore", guild }
//   realm:journal / realm:skill_xp / realm:title_unlock / realm:trail_unlock / realm:gossip / realm:ingredient_give
//   realm:place_ready        <- story places and camps (kept away from); realm:place_ping at load
//   realm:zones (zones.js), realm:claims_check -> realm:claims_check_result (no sites near towns, claims, zones)
//   realm:sky_event          <- meteors: a Starglass Pool may form near where one fell
//   realm:calendar           <- the Realm day (shrine blessings are once a Realm day)
//   realm:atlas_debug        { player, action, ... } (operators / scripts) -> realm:atlas_state
//   realm:atlas_region       { player, name }                         -> the region a player is in (Minimap), on entering one
//   realm:atlas_sites        { player, part, parts, sites: [[label, x, z, region]] } -> every site a player found (Minimap)
//   realm:atlas_site         { player, site: [label, x, z, region] }  -> one more found site
//   realm:atlas_ping         { player? }                              <- send the region and sites again
// See "Atlas of the Realm" in docs/PACKS.md.
import "./diag.js";
import { BlockPermutation, CommandPermissionLevel, CustomCommandStatus, GameMode, ItemStack, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { ACT_NAMES, ADJECTIVES, GROUPS, KINDS, KIND_HINTS, KIND_NAMES, NOUNS, SURVEY, TABLETS, TIER_ACT } from "./lore.js";
import { PREFABS, turn } from "./prefabs.js";
import { get, getFor } from "./settings.js";
import { protectedBox } from "./zones.js";
import { onScriptEvent } from "./script-events.js";
import { spreadPlayers } from "./spread.js";
import { spawnFresh } from "./spawn.js";

/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("./prefabs.js").Prefab} Prefab */

const PACK = "atlas_bp";
const OVERWORLD = "minecraft:overworld";
const PROP_ORIGIN = "atlas:origin"; // world: JSON { x, z, s }, the grid's center and a salt for the names
const PROP_CELLS = "atlas:cells"; // world: number of parts; parts atlas:cells:<n>, "cx,cz,group;..." in discovery order
const PROP_BUILT = "atlas:built"; // world: number of parts; parts atlas:built:<n>, "cx,cz,i,kind,x,y,z,f,state;..."
const PROP_METEORS = "atlas:meteors"; // world: JSON [[x, z], ...], the last impacts
const PROP_PLAYER = "atlas:p"; // player: JSON PlayerData
const PART = 24000; // characters per saved part (a dynamic property holds 32,767)
const MOB_TAG = "atlas:mob";
const FIGHT_TAG = "atlas:f:";
const SAVE_MAX = 30000;
/** Kinds whose built sites wanderers count as anchors (realm:poi): the lived-in and ruined ones. */
const ANCHORS = new Set(["hermit", "shrine", "tablet", "cairn", "watch", "camp"]);
/** Which guild hears about each kind (Guilds: realm:quest_done). */
const GUILD = { cairn: "wardens", watch: "wardens", fossil: "miners" };
/** Land kinds and their weights for a site's first pick (a wreck needs open water, a pool a fallen meteor). */
const LAND_WEIGHTS = /** @type {[string, number][]} */ ([
  ["shrine", 16],
  ["tablet", 24],
  ["cairn", 10],
  ["camp", 12],
  ["hermit", 8],
  ["watch", 9],
  ["fossil", 10],
  ["survey", 11],
]);
/** Blocks players make and nature doesn't (as Story Questlines checks): a site never covers them. */
const BUILT =
  /planks|glass|chest|barrel|sign|bed$|torch|lantern|door|fence|wool|carpet|concrete|glazed|crafting_table|furnace|smoker|bookshelf|lectern|anvil|hopper|_rail|^minecraft:rail|banner|campfire|loom|smithing|cartography|fletching|grindstone|stonecutter|enchanting|beacon|bell|composter|cauldron|brewing|jukebox|note_block|scaffolding|ladder|stairs|slab|brick|polished|item_frame|flower_pot|candle|shulker|dispenser|dropper|piston|observer|repeater|comparator|redstone_lamp|lever|button|pressure_plate|_wall$|chiseled|path|farmland|hay_block|bone_block|tinted|end_rod/;
const SOFT = /grass$|fern|flower|bush|tulip|orchid|poppy|dandelion|allium|bluet|daisy|lily_of|cornflower|snow_layer|petals|leaf_litter|sapling|vine|seagrass|kelp|deadbush|lilac|peony|sunflower|leaves|mushroom$|_log$|_wood$|azalea|bamboo|cactus|sugar_cane|sweet_berry|moss_carpet|web|pumpkin$|melon_block/;
const TREE = /_leaves$|_log$|_wood$|mushroom_block|azalea|mangrove_roots$|bamboo/;
const WATER_PLANT = /seagrass|kelp|coral|sea_pickle|waterlily/;

const enabled = () => get("enabled") === true;
const isOp = (/** @type {Player} */ p) => p.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
/** @param {string} id */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);
/** @param {string} id @param {unknown} msg */
const send = (id, msg) => {
  try {
    system.sendScriptEvent(id, JSON.stringify(msg));
  } catch (e) {
    console.warn(`[atlas] ${id}: ${e}`);
  }
};
// Town news: Townsfolk gossip at most once per in-game hour from this pack, each event once, so a busy server
// doesn't flood the townsfolk.
const NEWS_GAP = 1000; // ticks, an in-game hour
let newsAt = -NEWS_GAP;
/** @type {Set<string>} */
const newsSeen = new Set();

/** @param {string} key @param {object} msg */
function gossip(key, msg) {
  const now = system.currentTick;
  if (newsSeen.has(key) || now - newsAt < NEWS_GAP) return false;
  newsAt = now;
  newsSeen.add(key);
  if (newsSeen.size > 64) newsSeen.delete(/** @type {string} */ (newsSeen.values().next().value));
  send("realm:gossip", msg);
  return true;
}

/** @param {number} ticks */
const wait = (ticks) => new Promise((r) => system.runTimeout(() => r(undefined), ticks));

// ---------------------------------------------------------------------------
// Hashing and the grid
// ---------------------------------------------------------------------------

let salt = 0;
let ox = 0;
let oz = 0;
/** Read once at load, like the grid itself (a change would move every region). */
let S = 512;
let poiMin = 2;
let poiMax = 4;

/** A 32-bit hash of a few integers and the world's salt. @param {...number} ns */
function h32(...ns) {
  let h = (0x811c9dc5 ^ salt) >>> 0;
  for (const n of ns) {
    h = Math.imul(h ^ (n | 0), 0x01000193);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}
/** A hash of a text. @param {string} s */
function hs(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** @param {number} x @param {number} z @returns {[number, number]} */
const cellOf = (x, z) => [Math.floor((x - ox + S / 2) / S), Math.floor((z - oz + S / 2) / S)];
/** The cell's west and north edges. @param {number} cx @param {number} cz */
const cellMin = (cx, cz) => ({ x: ox + cx * S - S / 2, z: oz + cz * S - S / 2 });

/**
 * @typedef {object} Slot  where a site may be: decided by the hash, built when a player comes near
 * @property {string} key "cx,cz,i"
 * @property {number} cx @property {number} cz @property {number} i
 * @property {number} x @property {number} z
 * @property {string} pref the land kind it prefers
 */
/** @type {Map<string, Slot[]>} */
const slotCache = new Map();

/** The 2-4 slots of a cell, one per quadrant (so they're at least ~80 blocks apart). @param {number} cx @param {number} cz @returns {Slot[]} */
function slotsOf(cx, cz) {
  const ck = `${cx},${cz}`;
  const hit = slotCache.get(ck);
  if (hit) return hit;
  const lo = Math.max(0, Math.min(4, poiMin));
  const hi = Math.max(lo, Math.min(4, poiMax));
  const n = lo + (h32(cx, cz, 1) % (hi - lo + 1));
  const quads = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = h32(cx, cz, 2, i) % (i + 1);
    [quads[i], quads[j]] = [quads[j], quads[i]];
  }
  const min = cellMin(cx, cz);
  const half = S / 2;
  const margin = Math.min(40, Math.floor(S / 8));
  const span = Math.max(1, half - 2 * margin);
  /** @type {Slot[]} */
  const out = [];
  for (let i = 0; i < n; i++) {
    const q = quads[i];
    const x = min.x + (q & 1) * half + margin + (h32(cx, cz, 10, i) % span);
    const z = min.z + (q >> 1) * half + margin + (h32(cx, cz, 11, i) % span);
    let roll = h32(cx, cz, 12, i) % 100;
    let pref = "shrine";
    for (const [k, w] of LAND_WEIGHTS) {
      if (roll < w) {
        pref = k;
        break;
      }
      roll -= w;
    }
    out.push({ key: `${cx},${cz},${i}`, cx, cz, i, x: Math.floor(x), z: Math.floor(z), pref });
  }
  if (slotCache.size > 600) slotCache.clear();
  slotCache.set(ck, out);
  return out;
}

// ---------------------------------------------------------------------------
// Saved world state: regions found, sites built
// ---------------------------------------------------------------------------

/** @typedef {{ n: number, g: number }} Cell  discovery index (region number - 1) and land group */
/** @type {Map<string, Cell>} */
const cells = new Map();
/** @type {string[]} cell keys in discovery order */
const cellOrder = [];

/**
 * @typedef {object} Rec  a slot that was looked at
 * @property {number} cx @property {number} cz @property {number} i
 * @property {number} k kind index in KINDS, -1 when skipped
 * @property {number} x @property {number} y @property {number} z
 * @property {number} f facing 0-3
 * @property {number} s 0 skipped for good, 1 built, 2 being built (finished when someone comes near again)
 */
/** @type {Map<string, Rec>} */
const built = new Map();
/** @type {[number, number][]} */
let meteors = [];

/** Reads a value saved in numbered parts. @param {string} prop */
function readParts(prop) {
  let out = "";
  try {
    const n = Number(world.getDynamicProperty(prop) ?? 0);
    for (let i = 0; i < n; i++) out += String(world.getDynamicProperty(`${prop}:${i}`) ?? "");
  } catch (e) {
    console.warn(`[atlas] read ${prop}: ${e}`);
  }
  return out;
}

/** Saves records ("a;b;c") in parts of at most PART characters. @param {string} prop @param {string[]} items */
function writeParts(prop, items) {
  /** @type {string[]} */
  const parts = [];
  let cur = "";
  for (const it of items) {
    if (cur.length + it.length + 1 > PART) {
      parts.push(cur);
      cur = "";
    }
    cur += (cur ? ";" : "") + it;
  }
  if (cur) parts.push(cur);
  try {
    const old = Number(world.getDynamicProperty(prop) ?? 0);
    parts.forEach((p, i) => world.setDynamicProperty(`${prop}:${i}`, p));
    for (let i = parts.length; i < old; i++) world.setDynamicProperty(`${prop}:${i}`, undefined);
    world.setDynamicProperty(prop, parts.length);
  } catch (e) {
    console.warn(`[atlas] save ${prop}: ${e}`);
  }
}

let cellsDirty = false;
let builtDirty = false;
function saveSoon() {
  if (cellsDirty) writeParts(PROP_CELLS, cellOrder.map((k) => `${k},${cells.get(k)?.g ?? 0}`));
  if (builtDirty) writeParts(PROP_BUILT, [...built.entries()].map(([key, r]) => `${key},${r.k},${r.x},${r.y},${r.z},${r.f},${r.s}`));
  cellsDirty = builtDirty = false;
}
system.runInterval(saveSoon, 100);

function loadWorld() {
  try {
    const o = JSON.parse(String(world.getDynamicProperty(PROP_ORIGIN) ?? "null"));
    if (o && Number.isFinite(o.x) && Number.isFinite(o.z) && Number.isFinite(o.s)) {
      ox = o.x;
      oz = o.z;
      salt = o.s;
    } else {
      const sp = world.getDefaultSpawnLocation();
      ox = Math.floor(sp.x);
      oz = Math.floor(sp.z);
      salt = Math.floor(Math.random() * 0x7fffffff);
      world.setDynamicProperty(PROP_ORIGIN, JSON.stringify({ x: ox, z: oz, s: salt }));
    }
  } catch (e) {
    console.warn(`[atlas] origin: ${e}`);
  }
  for (const it of readParts(PROP_CELLS).split(";")) {
    const [a, b, g] = it.split(",").map(Number);
    if (![a, b, g].every(Number.isFinite)) continue;
    const key = `${a},${b}`;
    if (cells.has(key)) continue;
    cells.set(key, { n: cellOrder.length, g: Math.max(0, Math.min(GROUPS.length - 1, g)) });
    cellOrder.push(key);
  }
  for (const it of readParts(PROP_BUILT).split(";")) {
    const v = it.split(",").map(Number);
    if (v.length !== 9 || !v.every(Number.isFinite)) continue;
    const [cx, cz, i, k, x, y, z, f, s] = v;
    built.set(`${cx},${cz},${i}`, { cx, cz, i, k, x, y, z, f, s });
  }
  try {
    const m = JSON.parse(String(world.getDynamicProperty(PROP_METEORS) ?? "[]"));
    if (Array.isArray(m)) meteors = m.filter((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)).slice(-24);
  } catch {
    meteors = [];
  }
}

/** @param {Rec} r */
const kindOf = (r) => KINDS[r.k] ?? "shrine";
/** @param {Rec} r */
const keyOf = (r) => `${r.cx},${r.cz},${r.i}`;
/** The block players use at a site, in world coordinates. @param {Rec} r */
function heartOf(r) {
  const pf = PREFABS[kindOf(r)];
  const [dx, dz] = turn(pf.heart[0], pf.heart[2], r.f);
  return { x: r.x + dx, y: r.y + pf.heart[1], z: r.z + dz };
}

// ---------------------------------------------------------------------------
// Players' data
// ---------------------------------------------------------------------------

/**
 * @typedef {object} PlayerData
 * @property {number[]} r regions found (their discovery index)
 * @property {string[]} p sites found (slot keys)
 * @property {string[]} x sites whose reward was earned
 * @property {Record<string, number>} s which tablet (0-59) each tablet site showed this player
 * @property {string} t the 60 tablets read, as a 15-digit hex mask
 * @property {number} [b] the Realm day of the last shrine blessing
 * @property {string[]} m milestones reached
 * @property {Record<string, number>} f bones mined at fossil digs not yet cleared
 * @property {number} a the last act heard from Story Questlines (finished main acts)
 * @property {string[]} j kinds already sent to the Field Journal
 */
/** @type {Map<string, PlayerData>} */
const pcache = new Map();

/** @param {Player} player @returns {PlayerData} */
function pdata(player) {
  const hit = pcache.get(player.id);
  if (hit) return hit;
  /** @type {any} */
  let v;
  try {
    v = JSON.parse(String(player.getDynamicProperty(PROP_PLAYER) ?? "{}"));
  } catch {
    v = {};
  }
  const arr = (/** @type {unknown} */ a, /** @type {(x: unknown) => boolean} */ ok) => (Array.isArray(a) ? a.filter(ok) : []);
  const obj = (/** @type {unknown} */ o) => (o && typeof o === "object" && !Array.isArray(o) ? /** @type {Record<string, number>} */ (o) : {});
  /** @type {PlayerData} */
  const d = {
    r: arr(v?.r, (x) => typeof x === "number"),
    p: arr(v?.p, (x) => typeof x === "string"),
    x: arr(v?.x, (x) => typeof x === "string"),
    s: obj(v?.s),
    t: typeof v?.t === "string" && /^[0-9a-f]{15}$/.test(v.t) ? v.t : "0".repeat(15),
    b: typeof v?.b === "number" ? v.b : undefined,
    m: arr(v?.m, (x) => typeof x === "string"),
    f: obj(v?.f),
    a: typeof v?.a === "number" ? v.a : 0,
    j: arr(v?.j, (x) => typeof x === "string"),
  };
  pcache.set(player.id, d);
  return d;
}

/** @param {Player} player */
function savePdata(player) {
  const d = pcache.get(player.id);
  if (!d || !player.isValid) return;
  const json = JSON.stringify(d);
  if (json.length > SAVE_MAX) {
    console.warn(`[atlas] ${player.name}'s atlas is full (${json.length} characters): not saved`);
    return;
  }
  try {
    player.setDynamicProperty(PROP_PLAYER, json);
  } catch (e) {
    console.warn(`[atlas] save ${player.name}: ${e}`);
  }
}

/** Is tablet n (0-59) read? @param {PlayerData} d @param {number} n */
const hasTablet = (d, n) => ((parseInt(d.t[Math.floor(n / 4)], 16) >> n % 4) & 1) === 1;
/** @param {PlayerData} d @param {number} n */
function addTablet(d, n) {
  const i = Math.floor(n / 4);
  const v = parseInt(d.t[i], 16) | (1 << n % 4);
  d.t = d.t.slice(0, i) + v.toString(16) + d.t.slice(i + 1);
}
/** @param {PlayerData} d */
const tabletCount = (d) => TABLETS.reduce((n, _, i) => n + (hasTablet(d, i) ? 1 : 0), 0);

// ---------------------------------------------------------------------------
// Other packs: what they've told us
// ---------------------------------------------------------------------------

/** Main acts each player has finished, from realm:saga_progress. @type {Map<string, number>} */
const acts = new Map();
/** Installed packs (realm:help_pong), refreshed now and then. @type {Set<string>} */
let installed = new Set();
/** @type {Set<string> | undefined} */
let scanning;
/** Story places and camps (realm:place_ready). @type {Map<string, { dim: string, x: number, z: number }>} */
const places = new Map();
/** The Realm day from realm:calendar, when heard. @type {number | undefined} */
let realmDay;
/** Claims check answers waiting. @type {Map<string, (claims: number) => void>} */
const claimAsks = new Map();

function scanPacks() {
  scanning = new Set();
  send("realm:help_ping", {});
  system.runTimeout(() => {
    if (scanning) installed = scanning;
    scanning = undefined;
  }, 40);
}
const sagaInstalled = () => installed.has("saga_bp");

/** The Realm day (Townsfolk's counter when it's there, else the world's day). */
function today() {
  if (realmDay !== undefined) return realmDay;
  try {
    return Math.floor(world.getAbsoluteTime() / 24000);
  } catch {
    return 0;
  }
}

/** Finished main acts (0-5); without Story Questlines every tablet reads in full. @param {Player} player */
function actOf(player) {
  if (!sagaInstalled() && installed.size) return 5;
  return acts.get(player.id) ?? pdata(player).a ?? 0;
}

/** Asks Land Claims whether any claim reaches within `r` of x, z (no answer within a second: none). @param {number} x @param {number} z @param {number} r */
function claimsNear(x, z, r) {
  if (installed.size && !installed.has("claims_bp")) return Promise.resolve(0);
  const id = `atlas${system.currentTick}${Math.floor(Math.random() * 1e6)}`;
  return new Promise((resolve) => {
    claimAsks.set(id, resolve);
    send("realm:claims_check", { id, player: "", dim: OVERWORLD, x1: x - r, z1: z - r, x2: x + r, z2: z + r });
    system.runTimeout(() => {
      if (claimAsks.delete(id)) resolve(0);
    }, 20);
  });
}

// ---------------------------------------------------------------------------
// Regions: names and banners
// ---------------------------------------------------------------------------

/** @param {number} cx @param {number} cz @param {number} g */
const regionName = (cx, cz, g) => `The ${ADJECTIVES[h32(cx, cz, 3) % ADJECTIVES.length]} ${NOUNS[g][h32(cx, cz, 4) % NOUNS[g].length]}`;

/** @param {Dimension} dim @param {number} x @param {number} z */
function topAt(dim, x, z) {
  try {
    const b = dim.getTopmostBlock({ x, z });
    if (!b) return undefined;
    let s = b;
    for (let i = 0; i < 64; i++) {
      const a = s.above();
      if (!a || !(a.isLiquid || WATER_PLANT.test(a.typeId))) break;
      s = a;
    }
    const id = s.isLiquid ? s.typeId : b.typeId;
    let depth = 0;
    if (s.isLiquid) depth = s.location.y - b.location.y;
    return { id, y: s.location.y, depth };
  } catch {
    return undefined;
  }
}

/** The land group under a player, guessed from the top blocks around them (the Field Journal's rules). @param {Player} player */
function guessGroup(player) {
  const dim = player.dimension;
  const { x, y, z } = player.location;
  /** @type {number[]} */
  const votes = [0, 0, 0, 0, 0, 0];
  for (const [dx, dz] of [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12]]) {
    const t = topAt(dim, Math.floor(x + dx), Math.floor(z + dz));
    if (!t) continue;
    const id = t.id.replace("minecraft:", "");
    let g = 0;
    if (id.includes("water") && t.depth >= 6) g = 5;
    else if (/mangrove|mud|waterlily|lily_pad/.test(id) || (id.includes("water") && t.depth < 6)) g = 4;
    else if (/sand|terracotta|hardened_clay|acacia|cactus|deadbush|dead_bush/.test(id)) g = 3;
    else if (/snow|ice|spruce|podzol|stone|calcite|gravel/.test(id) || t.y > 110) g = 2;
    else if (/leaves|_log|azalea|bamboo/.test(id)) g = 1;
    votes[g]++;
  }
  if (y > 120) votes[2]++;
  let best = 0;
  for (let g = 1; g < votes.length; g++) if (votes[g] > votes[best]) best = g;
  return best;
}

/** The cell, found for the first time realm-wide when needed. @param {Player} player @param {number} cx @param {number} cz */
function cellFor(player, cx, cz) {
  const key = `${cx},${cz}`;
  let c = cells.get(key);
  if (c) return c;
  c = { n: cellOrder.length, g: guessGroup(player) };
  cells.set(key, c);
  cellOrder.push(key);
  cellsDirty = true;
  return c;
}

/** Sites a region has (or may have): its slots, minus those skipped for good. @param {number} cx @param {number} cz */
const sitesIn = (cx, cz) => slotsOf(cx, cz).filter((s) => built.get(s.key)?.s !== 0).length;
/** @param {PlayerData} d @param {number} cx @param {number} cz */
const foundIn = (d, cx, cz) => d.p.filter((k) => k.startsWith(`${cx},${cz},`)).length;

/** Sends the title protocol note, then the title. @param {Player} player @param {string} title @param {string} sub */
function banner(player, title, sub) {
  send("realm:title", { player: player.id, ticks: 80, from: PACK });
  try {
    player.onScreenDisplay.setTitle(title, { subtitle: sub, fadeInDuration: 10, stayDuration: 50, fadeOutDuration: 20 });
  } catch (e) {
    console.warn(`[atlas] title: ${e}`);
  }
}

/** Sends the action bar note, then the text. @param {Player} player @param {string} text */
function actionbar(player, text) {
  send("realm:actionbar", { player: player.id, ticks: 50, from: PACK });
  try {
    player.onScreenDisplay.setActionBar(text);
  } catch {
    // left
  }
}

/** Where each player was last loop. @type {Map<string, string>} */
const lastCell = new Map();
/** @type {Map<string, number>} */
const lastBanner = new Map();

/** @param {Player} player @param {number} cx @param {number} cz @param {boolean} joined */
function enterCell(player, cx, cz, joined) {
  const c = cellFor(player, cx, cz);
  const d = pdata(player);
  const isNew = !d.r.includes(c.n);
  if (isNew) {
    d.r.push(c.n);
    savePdata(player);
  }
  const name = regionName(cx, cz, c.g);
  send("realm:atlas_region", { player: player.id, name });
  if ((isNew || !joined) && get("banners") === true && getFor(player, "banner") === true && (isNew || system.currentTick - (lastBanner.get(player.id) ?? -1e9) > 400)) {
    lastBanner.set(player.id, system.currentTick);
    const total = sitesIn(cx, cz);
    banner(player, `§6${name}`, `§7Region ${c.n + 1} - ${foundIn(d, cx, cz)} of ${total} site${total === 1 ? "" : "s"}`);
  }
  if (isNew) {
    player.sendMessage(`§6[Atlas] New region: ${name} §7(Region ${c.n + 1}, ${d.r.length} found; /realm:atlas)`);
    milestones(player, d);
  }
}

// ---------------------------------------------------------------------------
// Building sites: one at a time, as jobs
// ---------------------------------------------------------------------------

let jobBusy = false;
/** When each slot may be looked at again (ms). @type {Map<string, number>} */
const retryAt = new Map();
/** How often each slot waited for unloaded ground. @type {Map<string, number>} */
const waits = new Map();
let readyAt = 0; // no building before the zones, claims and places have been heard (ms)

/** Runs a generator as a job; resolves with what it returns. @template T @param {Generator<void, T, void>} gen @returns {Promise<T | undefined>} */
function runGen(gen) {
  return new Promise((resolve) => {
    /** @returns {Generator<void, void, void>} */
    function* wrap() {
      try {
        while (true) {
          const r = gen.next();
          if (r.done) {
            resolve(r.value);
            return;
          }
          yield;
        }
      } catch (e) {
        console.warn(`[atlas] job: ${e}`);
        resolve(undefined);
      }
    }
    system.runJob(wrap());
  });
}

/**
 * The top of a column: ground (its y), water (surface y and floor), a tree, something built, or not loaded.
 * @param {Dimension} dim @param {number} x @param {number} z
 * @returns {{ kind: "ground" | "water" | "lava" | "tree" | "built" | "none", y: number, floor?: number }}
 */
function surface(dim, x, z) {
  try {
    const top = dim.getTopmostBlock({ x, z });
    if (!top) return { kind: "none", y: 0 };
    let s = top;
    let wet = top.isLiquid;
    for (let i = 0; i < 128; i++) {
      const a = s.above();
      if (!a || !(a.isLiquid || WATER_PLANT.test(a.typeId))) break;
      s = a;
      if (a.isLiquid) wet = true;
    }
    if (wet) {
      if (s.typeId.includes("lava")) return { kind: "lava", y: s.location.y };
      let fl = /** @type {import("@minecraft/server").Block | undefined} */ (top);
      for (let j = 0; j < 128 && fl && (fl.isLiquid || WATER_PLANT.test(fl.typeId)); j++) fl = fl.below();
      return { kind: "water", y: s.location.y, floor: fl ? fl.location.y : top.location.y };
    }
    let b = /** @type {import("@minecraft/server").Block | undefined} */ (top);
    for (let i = 0; i < 40 && b; i++) {
      const id = b.typeId;
      if (b.isLiquid) return { kind: id.includes("lava") ? "lava" : "water", y: b.location.y, floor: b.location.y - 1 };
      if (TREE.test(id)) return { kind: "tree", y: b.location.y };
      if (BUILT.test(id)) return { kind: "built", y: b.location.y };
      if (!SOFT.test(id) && !b.isAir) return { kind: "ground", y: b.location.y };
      b = b.below();
    }
    return { kind: "none", y: 0 };
  } catch {
    return { kind: "none", y: 0 }; // not loaded
  }
}

/** 5 x 5 sample points over a footprint (and a block past it). @param {number} r @param {number} x @param {number} z @param {number} [n] */
function samples(r, x, z, n = 5) {
  /** @type {[number, number][]} */
  const out = [];
  const h = r + 1;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push([Math.round(x - h + (2 * h * i) / (n - 1)), Math.round(z - h + (2 * h * j) / (n - 1))]);
  return out;
}

/**
 * Does this spot suit the prefab? The origin y, "not loaded", or why not.
 * @param {Dimension} dim @param {Prefab} pf @param {number} x @param {number} z @returns {{ y?: number, unloaded?: boolean, why?: string }}
 */
function siteCheck(dim, pf, x, z) {
  if (pf.site === "water") {
    /** @type {number[]} */
    const floors = [];
    for (const [sx, sz] of samples(pf.r, x, z, 3)) {
      const s = surface(dim, sx, sz);
      if (s.kind === "none") return { unloaded: true };
      if (s.kind !== "water" || s.floor === undefined) return { why: "not open water" };
      if (s.y - s.floor < 6) return { why: "too shallow" };
      floors.push(s.floor);
    }
    if (Math.max(...floors) - Math.min(...floors) > 2) return { why: "uneven sea floor" };
    return { y: floors.sort((a, b) => a - b)[Math.floor(floors.length / 2)] };
  }
  /** @type {number[]} */
  const ys = [];
  let trees = 0;
  for (const [sx, sz] of samples(pf.r, x, z)) {
    const s = surface(dim, sx, sz);
    if (s.kind === "none") return { unloaded: true };
    if (s.kind === "built") return { why: "built up" };
    if (s.kind === "lava" || s.kind === "water") return { why: s.kind };
    if (s.kind === "tree") {
      if (++trees > 6) return { why: "trees" };
      continue;
    }
    ys.push(s.y);
  }
  if (ys.length < 6) return { why: "trees" };
  if (Math.max(...ys) - Math.min(...ys) > 3) return { why: "too steep" };
  const y = ys.sort((a, b) => a - b)[Math.floor(ys.length / 2)];
  if (y < -63 || y > 300) return { why: "out of range" };
  return { y };
}

/** Is the footprint box free of anything players build (and all loaded)? As a job. @param {Dimension} dim @param {Prefab} pf @param {number} x @param {number} y @param {number} z @returns {Generator<void, "ok" | "built" | "unloaded", void>} */
function* boxClean(dim, pf, x, y, z) {
  const y0 = pf.site === "water" ? y + 1 : y - 1;
  const y1 = pf.site === "water" ? y + 5 : y + pf.h;
  let n = 0;
  for (let bx = x - pf.r - 1; bx <= x + pf.r + 1; bx++)
    for (let bz = z - pf.r - 1; bz <= z + pf.r + 1; bz++) {
      for (let by = y0; by <= y1; by++) {
        let b;
        try {
          b = dim.getBlock({ x: bx, y: by, z: bz });
        } catch {
          return "unloaded";
        }
        if (!b) return "unloaded";
        if (!b.isAir && BUILT.test(b.typeId)) return "built";
      }
      if (++n % 12 === 0) yield;
    }
  return "ok";
}

/** @param {number} x @param {number} z */
function nearMeteor(x, z) {
  return meteors.some(([mx, mz]) => (mx - x) ** 2 + (mz - z) ** 2 <= 300 * 300);
}

/**
 * Looks at a slot: the kind, the spot (up to 8 nudges), the checks. As a job.
 * @param {Slot} slot @returns {Generator<void, { rec?: Rec, skip?: boolean, retry?: number }, void>}
 */
function* look(slot) {
  const dim = world.getDimension(OVERWORLD);
  const center = surface(dim, slot.x, slot.z);
  if (center.kind === "none") return { retry: 4000 };
  const wet = center.kind === "water" && center.floor !== undefined && center.y - center.floor >= 6;
  let kind = forced.get(slot.key) ?? (wet ? "wreck" : slot.pref);
  if (!wet && !forced.has(slot.key) && nearMeteor(slot.x, slot.z) && h32(slot.cx, slot.cz, 13, slot.i) % 2 === 0) kind = "pool";
  const pf = PREFABS[kind];
  const min = cellMin(slot.cx, slot.cz);
  /** @type {[number, number][]} */
  const offs = [[0, 0]];
  for (let k = 0; k < 8; k++) offs.push([Math.round(Math.cos((k * Math.PI) / 4) * 16), Math.round(Math.sin((k * Math.PI) / 4) * 16)]);
  let unloaded = 0;
  for (const [dx, dz] of offs) {
    const x = slot.x + dx;
    const z = slot.z + dz;
    if (x < min.x + 8 || x > min.x + S - 8 || z < min.z + 8 || z > min.z + S - 8) continue;
    const c = siteCheck(dim, pf, x, z);
    yield;
    if (c.unloaded) {
      unloaded++;
      continue;
    }
    if (c.y === undefined) continue;
    const clean = yield* boxClean(dim, pf, x, c.y, z);
    if (clean === "unloaded") {
      unloaded++;
      continue;
    }
    if (clean !== "ok") continue;
    return { rec: { cx: slot.cx, cz: slot.cz, i: slot.i, k: KINDS.indexOf(/** @type {any} */ (kind)), x, y: c.y, z, f: h32(slot.cx, slot.cz, 14, slot.i) % 4, s: 2 } };
  }
  if (unloaded) return { retry: 4000 };
  return { skip: true };
}

/** Kinds a test asked for (realm:atlas_debug "prefer"), in memory. @type {Map<string, string>} */
const forced = new Map();

/** Block permutations, resolved once (unknown states dropped). @type {Map<string, BlockPermutation | null>} */
const perms = new Map();
/** @param {string} id @param {Record<string, string | number | boolean> | undefined} states */
function perm(id, states) {
  const key = id + JSON.stringify(states ?? {});
  const hit = perms.get(key);
  if (hit !== undefined) return hit;
  /** @type {BlockPermutation | null} */
  let out = null;
  for (const s of [states, undefined]) {
    try {
      out = BlockPermutation.resolve(/** @type {any} */ (`minecraft:${id}`), /** @type {any} */ (s));
      break;
    } catch {
      out = null;
    }
  }
  if (!out) console.warn(`[atlas] unknown block ${id}`);
  perms.set(key, out);
  return out;
}

/** Places a site's prefab, 200 blocks a step. Unloaded blocks are skipped (and counted). @param {Rec} rec @returns {Generator<void, number, void>} */
function* buildSteps(rec) {
  const dim = world.getDimension(OVERWORLD);
  const pf = PREFABS[kindOf(rec)];
  let n = 0;
  let skipped = 0;
  /** @param {number} x @param {number} y @param {number} z @param {string} id @param {any} [states] @param {(b: import("@minecraft/server").Block) => boolean} [when] */
  const put = (x, y, z, id, states, when) => {
    try {
      const b = dim.getBlock({ x, y, z });
      if (!b) {
        skipped++;
        return;
      }
      if (when && !when(b)) return;
      const p = perm(id, states);
      if (p) b.setPermutation(p);
    } catch {
      skipped++;
    }
  };
  if (pf.site === "land") {
    for (let dx = -pf.r; dx <= pf.r; dx++)
      for (let dz = -pf.r; dz <= pf.r; dz++) {
        const x = rec.x + dx;
        const z = rec.z + dz;
        for (let dy = 1; dy <= pf.h; dy++) put(x, rec.y + dy, z, "air", undefined, (b) => !b.isAir && !BUILT.test(b.typeId));
        for (let dy = 0; dy >= -3; dy--) put(x, rec.y + dy, z, "dirt", undefined, (b) => b.isAir || b.isLiquid || SOFT.test(b.typeId));
        if (pf.floor) put(x, rec.y, z, pf.floor);
        if (++n % 20 === 0) yield;
      }
  }
  for (const [dx, dy, dz, id, states] of pf.blocks) {
    const [rx, rz] = turn(dx, dz, rec.f);
    put(rec.x + rx, rec.y + dy, rec.z + rz, id, states);
    if (++n % 200 === 0) yield;
  }
  return skipped;
}

/** Sends a site to the wanderers (anchors) when it's of a kind they count. @param {Rec} rec */
function sendPoi(rec) {
  const kind = kindOf(rec);
  if (rec.s === 1 && ANCHORS.has(kind)) send("realm:poi", { kind, dim: OVERWORLD, x: rec.x, z: rec.z, name: KIND_NAMES[kind] });
}

/** Looks at a slot and builds it, or finishes a build that was cut short. @param {Slot} slot @param {Rec | undefined} redo */
async function work(slot, redo) {
  jobBusy = true;
  try {
    let rec = redo;
    if (!rec) {
      const sp = Math.hypot(slot.x - ox, slot.z - oz);
      if (sp < Number(get("spawnDistance"))) {
        built.set(slot.key, { cx: slot.cx, cz: slot.cz, i: slot.i, k: -1, x: slot.x, y: 0, z: slot.z, f: 0, s: 0 });
        builtDirty = true;
        return;
      }
      const avoid = Math.max(0, Number(get("avoidRadius")) || 0);
      const pd = Number(CONFIG.placeDistance) || 48;
      const reach = avoid + 24; // the nudges move a site up to 16 blocks, and a prefab is up to 7 across
      if (protectedBox(OVERWORLD, { x: slot.x - reach, z: slot.z - reach }, { x: slot.x + reach, z: slot.z + reach })) {
        retryAt.set(slot.key, Date.now() + 600000);
        return;
      }
      for (const pl of places.values()) {
        if (pl.dim === OVERWORLD && (pl.x - slot.x) ** 2 + (pl.z - slot.z) ** 2 < (pd + 24) ** 2) {
          retryAt.set(slot.key, Date.now() + 600000);
          return;
        }
      }
      if ((await claimsNear(slot.x, slot.z, reach)) > 0) {
        retryAt.set(slot.key, Date.now() + 600000);
        return;
      }
      const res = await runGen(look(slot));
      if (!res) {
        retryAt.set(slot.key, Date.now() + 60000);
        return;
      }
      if (res.retry) {
        const w = (waits.get(slot.key) ?? 0) + 1;
        waits.set(slot.key, w);
        retryAt.set(slot.key, Date.now() + (w > 15 ? 60000 : res.retry));
        return;
      }
      waits.delete(slot.key);
      if (!res.rec) {
        built.set(slot.key, { cx: slot.cx, cz: slot.cz, i: slot.i, k: -1, x: slot.x, y: 0, z: slot.z, f: 0, s: 0 });
        builtDirty = true;
        return;
      }
      if (built.has(slot.key) || !enabled()) return; // changed meanwhile
      rec = res.rec;
      built.set(slot.key, rec);
      builtDirty = true;
      saveSoon(); // saved as "being built" first: a restart mid-way finishes it rather than looking again
    }
    const skipped = await runGen(buildSteps(rec));
    if (skipped === undefined || skipped > 0) {
      retryAt.set(slot.key, Date.now() + 20000); // finish it when the rest is loaded
      return;
    }
    rec.s = 1;
    builtDirty = true;
    sendPoi(rec);
    console.log(`[atlas] built ${kindOf(rec)} ${slot.key} at ${rec.x} ${rec.y} ${rec.z}`);
  } catch (e) {
    console.warn(`[atlas] site ${slot.key}: ${e}`);
    retryAt.set(slot.key, Date.now() + 60000);
  } finally {
    jobBusy = false;
  }
}

// ---------------------------------------------------------------------------
// Finding sites and their rewards
// ---------------------------------------------------------------------------

/** @param {Player} player @param {number} amount */
function addCrowns(player, amount) {
  if (amount <= 0) return;
  try {
    const obj = world.scoreboard.getObjective("crowns") ?? world.scoreboard.addObjective("crowns", "Crowns");
    obj.addScore(player, Math.floor(amount));
  } catch (e) {
    console.warn(`[atlas] crowns: ${e}`);
  }
}

/** @param {Player} player @param {string} skill @param {number} amount */
const skillXp = (player, skill, amount) => amount > 0 && send("realm:skill_xp", { player: player.id, skill, amount });

/** The region a site is in, by name. @param {Rec} rec */
function regionOf(rec) {
  const c = cells.get(`${rec.cx},${rec.cz}`);
  return c ? regionName(rec.cx, rec.cz, c.g) : "";
}

/** Pays a site's reward once per player: Crowns, the quest for Guilds (and the stories). @param {Player} player @param {Rec} rec @returns {boolean} whether it was the first time */
function earn(player, rec) {
  const d = pdata(player);
  const key = keyOf(rec);
  if (d.x.includes(key)) return false;
  d.x.push(key);
  const kind = kindOf(rec);
  /** @type {Record<string, number>} */
  const crowns = CONFIG.crowns;
  const c = Math.max(0, Number(crowns[kind]) || 0);
  addCrowns(player, c);
  if (c > 0) player.sendMessage(`§6+${c} Crowns`);
  send("realm:quest_done", { player: player.id, pack: PACK, id: `atlas:${kind}:${key}`, label: `${KIND_NAMES[kind]}${regionOf(rec) ? ` in ${regionOf(rec)}` : ""}`, kind: "explore", guild: GUILD[/** @type {keyof GUILD} */ (kind)] ?? "wayfarers" });
  savePdata(player);
  return true;
}

/** Fights and other timed things at sites. @typedef {{ id: number, kind: "cairn" | "watch" | "wreck", key: string, rec: Rec, player: string, start: number, spawned: number, killed: number, wave: number }} Fight */
/** @type {Map<number, Fight>} */
const fights = new Map();
let fightNext = 1;
const fightAt = (/** @type {string} */ key) => [...fights.values()].find((f) => f.key === key);

/** A player comes within findRange of a built site for the first time. @param {Player} player @param {Rec} rec */
function found(player, rec) {
  const d = pdata(player);
  const key = keyOf(rec);
  if (d.p.includes(key)) return;
  d.p.push(key);
  const kind = kindOf(rec);
  const region = regionOf(rec);
  player.sendMessage(`§6[Atlas] Found: ${KIND_NAMES[kind]}${region ? ` (${region})` : ""}. §7${KIND_HINTS[kind]}`);
  try {
    player.playSound("random.orb", { pitch: 0.8, volume: 0.6 });
  } catch {
    // left
  }
  skillXp(player, "exploration", Number(CONFIG.findXp) || 0);
  if (kind === "shrine") {
    skillXp(player, "exploration", Number(CONFIG.shrineXp) || 0);
    earn(player, rec);
  }
  if (kind === "hermit") earn(player, rec);
  if (!d.j.includes(kind)) {
    d.j.push(kind);
    send("realm:journal", { player: player.id, page: "places", entry: `atlas_${kind}`, label: KIND_NAMES[kind] });
  }
  if (kind === "wreck" && !fightAt(key)) startFight(player, rec, "wreck");
  savePdata(player);
  milestones(player, d);
  send("realm:atlas_site", { player: player.id, site: siteEntry(rec) });
}

/** A found site for the Minimap: [label, x, z, region]. @param {Rec} rec */
const siteEntry = (rec) => [KIND_NAMES[kindOf(rec)], rec.x, rec.z, regionOf(rec)];

/** The region a player is in and every site they found (realm:atlas_ping), the sites in parts under 2048 characters. @param {Player} player */
function sendMapData(player) {
  const ck = lastCell.get(player.id);
  if (ck) {
    const [cx, cz] = ck.split(",").map(Number);
    const c = cells.get(ck);
    if (c) send("realm:atlas_region", { player: player.id, name: regionName(cx, cz, c.g) });
  }
  const items = [];
  for (const key of pdata(player).p) {
    const rec = built.get(key);
    if (rec && rec.s !== 0) items.push(siteEntry(rec));
  }
  /** @type {unknown[][]} */
  const parts = [];
  let cur = [];
  let len = 0;
  for (const it of items) {
    const n = JSON.stringify(it).length + 1;
    if (cur.length && len + n > 1800) {
      parts.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(it);
    len += n;
  }
  if (cur.length) parts.push(cur);
  if (!parts.length) return send("realm:atlas_sites", { player: player.id, part: 1, parts: 0, sites: [] });
  parts.forEach((p, i) => send("realm:atlas_sites", { player: player.id, part: i + 1, parts: parts.length, sites: p }));
}

/** When each site was last tidied for a player still to finish it. @type {Map<string, number>} */
const tidied = new Map();

/** Puts back a cairn's bell or a dig's bones for a player who hasn't done them yet. @param {Player} player @param {Rec} rec */
function tidy(player, rec) {
  const kind = kindOf(rec);
  if (kind !== "cairn" && kind !== "fossil") return;
  const key = keyOf(rec);
  if (pdata(player).x.includes(key) || fightAt(key)) return;
  const now = Date.now();
  if (now - (tidied.get(key) ?? 0) < 120000) return;
  tidied.set(key, now);
  const dim = world.getDimension(OVERWORLD);
  const pf = PREFABS[kind];
  const spots = kind === "cairn" ? [pf.heart] : (pf.bones ?? []);
  const id = kind === "cairn" ? "bell" : "bone_block";
  for (const [dx, dy, dz] of spots) {
    const [rx, rz] = turn(dx, dz, rec.f);
    try {
      const b = dim.getBlock({ x: rec.x + rx, y: rec.y + dy, z: rec.z + rz });
      const p = perm(id, id === "bell" ? { attachment: "standing" } : undefined);
      if (b && b.isAir && p) b.setPermutation(p);
    } catch {
      // not loaded
    }
  }
}

// ---------------------------------------------------------------------------
// The player loop: every 2 seconds, cell math and a 9-cell distance check (no block reads)
// ---------------------------------------------------------------------------

/** @param {Player} player */
function tickPlayer(player) {
  if (!player.isValid || player.dimension.id !== OVERWORLD) {
    lastCell.delete(player.id);
    return;
  }
  if (player.getGameMode() === GameMode.Spectator) return;
  const { x, z } = player.location;
  const [cx, cz] = cellOf(x, z);
  const ck = `${cx},${cz}`;
  const was = lastCell.get(player.id);
  if (was !== ck) {
    const min = cellMin(cx, cz);
    const inside = Math.min(x - min.x, min.x + S - x, z - min.z, min.z + S - z);
    if (was === undefined || inside >= 8) {
      lastCell.set(player.id, ck);
      enterCell(player, cx, cz, was === undefined);
    }
  }
  const d = pdata(player);
  const find = (Number(CONFIG.findRange) || 10) ** 2;
  const range = Math.max(16, Number(get("buildRange")) || 64) ** 2;
  const now = Date.now();
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++)
      for (const slot of slotsOf(cx + dx, cz + dz)) {
        const rec = built.get(slot.key);
        if (rec?.s === 0) continue;
        const ax = rec ? rec.x : slot.x;
        const az = rec ? rec.z : slot.z;
        const d2 = (ax - x) ** 2 + (az - z) ** 2;
        if (rec?.s === 1) {
          if (d2 <= find && !d.p.includes(slot.key)) found(player, rec);
          if (d2 <= 24 * 24) tidy(player, rec);
          continue;
        }
        if (d2 > range || jobBusy || now < readyAt || now < (retryAt.get(slot.key) ?? 0)) continue;
        work(slot, rec).catch((e) => console.warn(`[atlas] ${e}`));
      }
}

// Each player every 2 seconds as before, a tenth of them every 4 ticks (scripts/spread.js), so a full server never
// does every player's cell math on one tick.
spreadPlayers(system, world, {
  every: 40,
  parts: 10,
  visit: (share) => {
    if (!enabled()) return;
    for (const p of share) {
      try {
        tickPlayer(p);
      } catch (e) {
        console.warn(`[atlas] ${e}`);
      }
    }
  },
});

// ---------------------------------------------------------------------------
// Using a site: taps, hits, breaks
// ---------------------------------------------------------------------------

/** The built site whose heart (or, for a dig, a bone) is at or next to a block. @param {Vector3} at @param {number} reach */
function siteAt(at, reach) {
  const [cx, cz] = cellOf(at.x, at.z);
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++)
      for (const slot of slotsOf(cx + dx, cz + dz)) {
        const rec = built.get(slot.key);
        if (!rec || rec.s !== 1) continue;
        if (Math.abs(rec.x - at.x) > 8 || Math.abs(rec.z - at.z) > 8) continue;
        const h = heartOf(rec);
        if (Math.abs(h.x - at.x) <= reach && Math.abs(h.y - at.y) <= reach && Math.abs(h.z - at.z) <= reach) return rec;
      }
  return undefined;
}

/** @param {Player} player @param {Vector3} at @param {string} typeId */
function onUse(player, at, typeId) {
  if (!enabled() || player.dimension.id !== OVERWORLD) return;
  const container = typeId === "minecraft:barrel" || typeId === "minecraft:chest";
  const rec = siteAt(at, container ? 0 : 1);
  if (!rec) return;
  const kind = kindOf(rec);
  if (container !== (kind === "camp" || kind === "wreck")) return;
  if (!pdata(player).p.includes(keyOf(rec))) found(player, rec);
  switch (kind) {
    case "shrine":
      return bless(player, rec);
    case "tablet":
      return void readTablet(player, rec).catch((e) => console.warn(`[atlas] tablet: ${e}`));
    case "survey":
      return void readSurvey(player, rec).catch((e) => console.warn(`[atlas] survey: ${e}`));
    case "pool":
      return poolDust(player, rec);
    case "watch":
      return startWatch(player, rec);
    case "camp":
    case "wreck":
      return loot(player, rec);
    case "cairn":
      if (!pdata(player).x.includes(keyOf(rec))) actionbar(player, "§7The Choir's bell. Break it to silence it.");
      return;
  }
}

/** @type {Map<string, number>} */
const lastUse = new Map();
world.afterEvents.playerInteractWithBlock.subscribe(({ player, block, isFirstEvent }) => {
  if (!isFirstEvent) return;
  try {
    onUse(player, block.location, block.typeId);
  } catch (e) {
    console.warn(`[atlas] ${e}`);
  }
});
world.afterEvents.entityHitBlock.subscribe(({ damagingEntity, hitBlock }) => {
  if (!(damagingEntity instanceof Player)) return;
  try {
    const now = system.currentTick;
    if (now - (lastUse.get(damagingEntity.id) ?? -100) < 10) return;
    lastUse.set(damagingEntity.id, now);
    const id = hitBlock.typeId;
    if (id === "minecraft:barrel" || id === "minecraft:chest" || id === "minecraft:bone_block") return;
    onUse(damagingEntity, hitBlock.location, id);
  } catch (e) {
    console.warn(`[atlas] ${e}`);
  }
});

/** Removes what a broken site block dropped (no bell or bone farms). @param {Vector3} at @param {string} item */
function eatDrops(at, item) {
  system.runTimeout(() => {
    try {
      const dim = world.getDimension(OVERWORLD);
      for (const e of dim.getEntities({ type: "minecraft:item", location: { x: at.x + 0.5, y: at.y + 0.5, z: at.z + 0.5 }, maxDistance: 3 })) {
        const it = e.getComponent("minecraft:item")?.itemStack;
        if (it?.typeId === item) e.remove();
      }
    } catch {
      // gone
    }
  }, 1);
}

world.afterEvents.playerBreakBlock.subscribe(({ player, block, brokenBlockPermutation }) => {
  if (!enabled() || player.dimension.id !== OVERWORLD) return;
  const id = brokenBlockPermutation.type.id;
  if (id !== "minecraft:bell" && id !== "minecraft:bone_block") return;
  try {
    const at = block.location;
    if (id === "minecraft:bell") {
      const rec = siteAt(at, 0);
      if (!rec || kindOf(rec) !== "cairn") return;
      eatDrops(at, id);
      breakCairn(player, rec);
      return;
    }
    const rec = siteAt(at, 4);
    if (!rec || kindOf(rec) !== "fossil") return;
    const isBone = (PREFABS.fossil.bones ?? []).some(([dx, dy, dz]) => {
      const [rx, rz] = turn(dx, dz, rec.f);
      return rec.x + rx === at.x && rec.y + dy === at.y && rec.z + rz === at.z;
    });
    if (!isBone) return;
    eatDrops(at, id);
    dig(player, rec);
  } catch (e) {
    console.warn(`[atlas] break: ${e}`);
  }
});

/** A shrine's blessing, once a Realm day: by the land around it. @param {Player} player @param {Rec} rec */
function bless(player, rec) {
  const d = pdata(player);
  const day = today();
  if (d.b === day) {
    actionbar(player, "§7The shrine has blessed you today. Come back tomorrow.");
    return;
  }
  const g = GROUPS[cells.get(`${rec.cx},${rec.cz}`)?.g ?? 0];
  const [effect, label] = g === "high" || g === "dry" ? ["speed", "Speed"] : g === "wet" || g === "sea" ? ["village_hero", "Hero of the Village (better trades)"] : ["regeneration", "Regeneration"];
  const minutes = Math.max(1, Number(get("blessingMinutes")) || 10);
  try {
    player.addEffect(effect, minutes * 1200, { amplifier: 0, showParticles: true });
  } catch (e) {
    console.warn(`[atlas] blessing: ${e}`);
    return;
  }
  d.b = day;
  savePdata(player);
  player.sendMessage(`§a[Atlas] The shrine blesses you: ${label} for ${minutes} minutes. §7(Once a day.)`);
  try {
    player.playSound("random.levelup", { pitch: 1.4, volume: 0.5 });
  } catch {
    // left
  }
}

/** Shows a form, waiting while the player is busy (chat open). @param {Player} player @param {ActionFormData} form */
async function show(player, form) {
  for (let i = 0; i < 20; i++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await wait(20);
  }
  return undefined;
}

/** A tablet's text as this player can read it now. @param {Player} player @param {number} n */
function tabletText(player, n) {
  const t = TABLETS[n];
  const tier = Math.floor(n / 12);
  if (actOf(player) >= TIER_ACT[tier]) return { title: t.title, body: t.text, full: true };
  const words = t.text.split(" ").slice(0, 6).join(" ");
  return {
    title: "Worn carving",
    body: `§7The carving is in an older script than the rest. You make out a few words:\n\n"${words}..."\n\nThe rest won't come clear yet. It may read differently once you've seen more of the story (after ${ACT_NAMES[tier]}).`,
    full: false,
  };
}

/** Reads a tablet site: the first time it gives the next tablet you haven't read. @param {Player} player @param {Rec} rec */
async function readTablet(player, rec) {
  const d = pdata(player);
  const key = keyOf(rec);
  let n = d.s[key];
  if (typeof n !== "number" || n < 0 || n >= TABLETS.length) {
    n = TABLETS.findIndex((_, i) => !hasTablet(d, i));
    if (n < 0) n = hs(key) % TABLETS.length; // all 60 read: an old friend
    d.s[key] = n;
    const fresh = !hasTablet(d, n);
    addTablet(d, n);
    savePdata(player);
    if (earn(player, rec) && fresh) player.sendMessage(`§6[Atlas] Starwright Tablet ${n + 1} of 60 added to your codex (${tabletCount(d)} read; /realm:atlas).`);
    milestones(player, d);
  }
  await showTablet(player, n);
}

/** @param {Player} player @param {number} n */
async function showTablet(player, n) {
  const t = tabletText(player, n);
  const form = new ActionFormData().title(`Starwright Tablet ${n + 1}`).body(`§l${t.title}§r\n\n${t.body}`).button("Close");
  await show(player, form);
}

/** Fenn's note at a survey marker (codex). @param {Player} player @param {Rec} rec */
async function readSurvey(player, rec) {
  const n = hs(keyOf(rec)) % SURVEY.length;
  if (earn(player, rec)) player.sendMessage("§6[Atlas] Fenn's survey note added to your codex (/realm:atlas).");
  await show(player, new ActionFormData().title("Fenn's Survey Marker").body(SURVEY[n]).button("Close"));
}

/** A Starglass Pool's star-dust: Starwright Flour (Kitchen), once per pool. @param {Player} player @param {Rec} rec */
function poolDust(player, rec) {
  if (!earn(player, rec)) {
    actionbar(player, "§7The water is still. You've taken its star-dust already.");
    return;
  }
  const n = Math.max(1, Number(CONFIG.poolFlour) || 2);
  if (installed.has("cooking_bp") || !installed.size) {
    send("realm:ingredient_give", { player: player.id, ingredient: "starwright_flour", amount: n });
    player.sendMessage(`§d[Atlas] Star-dust gathers in your hands: Starwright Flour x${n} (Kitchen).`);
  } else {
    giveItems(player, [["minecraft:glowstone_dust", n * 2]]);
    player.sendMessage(`§d[Atlas] Star-dust gathers in your hands.`);
  }
  skillXp(player, "exploration", 20);
}

/** Puts items in a player's inventory (what doesn't fit drops at their feet). @param {Player} player @param {[string, number][]} items */
function giveItems(player, items) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  for (const [id, n] of items) {
    try {
      const stack = new ItemStack(id, n);
      const left = inv ? inv.addItem(stack) : stack;
      if (left) player.dimension.spawnItem(left, player.location);
    } catch (e) {
      console.warn(`[atlas] give ${id}: ${e}`);
    }
  }
}

/** @type {Record<string, [string, number, number, number][]>} what a camp barrel or a wreck chest can hold: id, min, max, weight */
const LOOT = {
  camp: [
    ["minecraft:bread", 3, 6, 4],
    ["minecraft:arrow", 8, 16, 3],
    ["minecraft:torch", 6, 12, 3],
    ["minecraft:iron_nugget", 4, 9, 3],
    ["minecraft:string", 2, 5, 2],
    ["minecraft:leather", 1, 3, 2],
    ["minecraft:cooked_salmon", 2, 4, 2],
    ["minecraft:emerald", 1, 2, 1],
    ["minecraft:compass", 1, 1, 1],
  ],
  wreck: [
    ["minecraft:gold_nugget", 6, 14, 4],
    ["minecraft:iron_ingot", 2, 5, 3],
    ["minecraft:prismarine_shard", 3, 8, 3],
    ["minecraft:dried_kelp", 4, 10, 2],
    ["minecraft:emerald", 1, 3, 2],
    ["minecraft:gold_ingot", 1, 2, 2],
    ["minecraft:nautilus_shell", 1, 1, 1],
  ],
};

/** A camp's barrel or a wreck's chest: three things, rolled once per player. @param {Player} player @param {Rec} rec */
function loot(player, rec) {
  const kind = kindOf(rec);
  if (!earn(player, rec)) return;
  const table = LOOT[kind];
  const total = table.reduce((n, t) => n + t[3], 0);
  /** @type {[string, number][]} */
  const got = [];
  let seed = hs(`${keyOf(rec)}|${player.name}`);
  for (let k = 0; k < 3; k++) {
    seed = h32(seed, k);
    let roll = seed % total;
    const t = table.find((e) => (roll -= e[3]) < 0) ?? table[0];
    if (got.some((g) => g[0] === t[0])) continue;
    got.push([t[0], t[1] + (h32(seed, 7) % (t[2] - t[1] + 1))]);
  }
  giveItems(player, got);
  const names = got.map(([id, n]) => `${n} ${id.replace("minecraft:", "").replace(/_/g, " ")}`).join(", ");
  player.sendMessage(`§6[Atlas] ${kind === "camp" ? "In the barrel" : "In the sea chest"}: ${names}.`);
}

/** A fossil dig: 12 bones to clear. @param {Player} player @param {Rec} rec */
function dig(player, rec) {
  const d = pdata(player);
  const key = keyOf(rec);
  if (d.x.includes(key)) {
    actionbar(player, "§7You've cleared this dig already.");
    return;
  }
  const need = (PREFABS.fossil.bones ?? []).length;
  const n = (d.f[key] ?? 0) + 1;
  if (n < need) {
    d.f[key] = n;
    savePdata(player);
    actionbar(player, `§eFossil dig: ${n}/${need} bones`);
    return;
  }
  delete d.f[key];
  earn(player, rec);
  skillXp(player, "mining", Number(CONFIG.fossilXp) || 0);
  player.sendMessage("§6[Atlas] You've uncovered the whole skeleton. Something very big, very long ago.");
}

// ---------------------------------------------------------------------------
// Fights: a cairn's keepers, a watch post's three waves, a wreck's drowned
// ---------------------------------------------------------------------------

/** @param {Entity} ent */
function noBanner(ent) {
  if (ent.typeId !== "minecraft:pillager" && ent.typeId !== "minecraft:vindicator") return;
  try {
    ent.runCommand("replaceitem entity @s slot.armor.head 0 air");
  } catch {
    // nothing worn
  }
}

/** Spawns fight mobs around a site. @param {Fight} f @param {string[]} types @param {string} [name] */
function spawnMobs(f, types, name) {
  const dim = world.getDimension(OVERWORLD);
  types.forEach((type, k) => {
    const a = (k / types.length) * Math.PI * 2 + f.spawned;
    const dist = f.kind === "wreck" ? 3 : 5;
    const at = { x: f.rec.x + 0.5 + Math.cos(a) * dist, y: f.rec.y + (f.kind === "wreck" ? 2 : 1), z: f.rec.z + 0.5 + Math.sin(a) * dist };
    try {
      if (f.kind !== "wreck") {
        const top = topAt(dim, Math.floor(at.x), Math.floor(at.z));
        if (top && !top.id.includes("water") && Math.abs(top.y - f.rec.y) < 6) at.y = top.y + 1;
      }
      const e = spawnFresh(dim, type, at);
      e.addTag(MOB_TAG);
      e.addTag(FIGHT_TAG + f.id);
      if (name) e.nameTag = name;
      noBanner(e);
      f.spawned++;
    } catch (e) {
      console.warn(`[atlas] spawn ${type}: ${e}`);
    }
  });
}

/** @param {Player} player @param {Rec} rec @param {"cairn" | "watch" | "wreck"} kind */
function startFight(player, rec, kind) {
  if (fights.size >= 6) return undefined;
  /** @type {Fight} */
  const f = { id: fightNext++, kind, key: keyOf(rec), rec, player: player.id, start: system.currentTick, spawned: 0, killed: 0, wave: 0 };
  fights.set(f.id, f);
  if (kind === "cairn") spawnMobs(f, ["minecraft:pillager", "minecraft:pillager", "minecraft:vindicator"], "§7Choir Bellkeeper");
  else if (kind === "wreck") spawnMobs(f, ["minecraft:drowned", "minecraft:drowned"]);
  return f;
}

/** @param {Player} player @param {Rec} rec */
function breakCairn(player, rec) {
  const key = keyOf(rec);
  if (pdata(player).x.includes(key)) {
    player.sendMessage("§7[Atlas] You silenced this cairn already. Its keepers don't come for you twice.");
    return;
  }
  if (fightAt(key)) return;
  if (!pdata(player).p.includes(key)) found(player, rec);
  const f = startFight(player, rec, "cairn");
  if (!f) return;
  player.sendMessage("§c[Atlas] The bell cracks, and the Gray Choir comes running to its cairn. Beat its three keepers!");
}

/** @param {Player} player @param {Rec} rec */
function startWatch(player, rec) {
  const key = keyOf(rec);
  if (pdata(player).x.includes(key)) {
    actionbar(player, "§7The post is quiet now. You held it once.");
    return;
  }
  if (fightAt(key)) return;
  const f = startFight(player, rec, "watch");
  if (!f) return;
  player.sendMessage(`§c[Atlas] The alarm bell rings out. Hold the watch post for ${Number(CONFIG.watchSeconds) || 60} seconds!`);
}

/** Removes a fight's mobs (with a puff). @param {Fight} f */
function clearMobs(f) {
  try {
    for (const e of world.getDimension(OVERWORLD).getEntities({ tags: [FIGHT_TAG + f.id] })) {
      try {
        const l = e.location;
        e.dimension.spawnParticle("minecraft:knockback_roar_particle", { x: l.x, y: l.y + 1, z: l.z });
      } catch {
        // unloaded
      }
      e.remove();
    }
  } catch {
    // unloaded
  }
}

/** @param {Fight} f @param {boolean} won */
function endFight(f, won) {
  fights.delete(f.id);
  clearMobs(f);
  const p = online(f.player);
  if (!p || f.kind === "wreck") return;
  if (won) {
    earn(p, f.rec);
    p.sendMessage(f.kind === "cairn" ? "§a[Atlas] The cairn is silent. The Choir won't ring here again for you." : "§a[Atlas] The watch post holds. Whoever kept it would be proud.");
    gossip(`${p.id}:${f.key}`, { kind: "atlas_site", player: p.id, name: p.name, place: KIND_NAMES[f.kind] });
  } else p.sendMessage(f.kind === "cairn" ? "§7[Atlas] The Choir's keepers slip away. The bell will be back in its place." : "§7[Atlas] The watch post falls again. Ring the bell to try once more.");
}

const WAVES = [
  ["minecraft:zombie", "minecraft:zombie"],
  ["minecraft:skeleton", "minecraft:zombie", "minecraft:husk"],
  ["minecraft:vindicator", "minecraft:skeleton", "minecraft:skeleton"],
];

system.runInterval(() => {
  for (const f of [...fights.values()]) {
    try {
      const p = online(f.player);
      const age = system.currentTick - f.start;
      const hp = p?.getComponent("minecraft:health")?.currentValue ?? 0;
      const far = !p || p.dimension.id !== OVERWORLD || (p.location.x - f.rec.x) ** 2 + (p.location.z - f.rec.z) ** 2 > 48 * 48;
      if (f.kind === "wreck") {
        if (age > 6000 || (far && age > 1200)) endFight(f, false);
        continue;
      }
      if (!p || hp <= 0 || far) {
        endFight(f, false);
        continue;
      }
      if (f.kind === "cairn") {
        if (f.killed >= f.spawned && f.spawned > 0) endFight(f, true);
        else if (age > 6000) endFight(f, false);
        continue;
      }
      const secs = Math.max(10, Number(CONFIG.watchSeconds) || 60);
      const wave = Math.min(WAVES.length - 1, Math.floor((age / 20 / secs) * WAVES.length));
      if (f.wave <= wave && f.wave < WAVES.length) {
        spawnMobs(f, WAVES[f.wave]);
        f.wave++;
      }
      if (age >= secs * 20) endFight(f, true);
      else actionbar(p, `§eHold the watch post: ${Math.ceil(secs - age / 20)}s`);
    } catch (e) {
      console.warn(`[atlas] fight: ${e}`);
      endFight(f, false);
    }
  }
}, 20);

world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  if (!fights.size) return;
  try {
    const tag = deadEntity.getTags().find((t) => t.startsWith(FIGHT_TAG));
    if (!tag) return;
    const f = fights.get(Number(tag.slice(FIGHT_TAG.length)));
    if (f) f.killed++;
  } catch {
    // gone
  }
});

/** Our mobs left over from before a restart (or a fight that ended unloaded) go. @param {Entity} e */
function sweepMob(e) {
  try {
    if (!e.isValid || !e.hasTag(MOB_TAG)) return;
    const tag = e.getTags().find((t) => t.startsWith(FIGHT_TAG));
    if (tag && fights.has(Number(tag.slice(FIGHT_TAG.length)))) return;
    e.remove();
  } catch {
    // gone
  }
}
world.afterEvents.entityLoad.subscribe(({ entity }) => sweepMob(entity));

// ---------------------------------------------------------------------------
// Milestones: titles, the trail, gossip
// ---------------------------------------------------------------------------

/** @param {Player} player @param {PlayerData} d */
function milestones(player, d) {
  const counts = { regions: d.r.length, sites: d.p.length, tablets: tabletCount(d) };
  /** @type {Record<string, [number, string][]>} */
  const table = /** @type {any} */ (CONFIG.milestones);
  let changed = false;
  for (const [what, list] of Object.entries(table)) {
    const have = counts[/** @type {keyof typeof counts} */ (what)] ?? 0;
    for (const [n, title] of list) {
      const id = `${what}:${n}`;
      if (have < n || d.m.includes(id)) continue;
      d.m.push(id);
      changed = true;
      send("realm:title_unlock", { player: player.id, title });
      player.sendMessage(`§6[Atlas] ${n} ${what} found! §7Title: ${title}`);
      gossip(`${player.id}:${id}`, { kind: "atlas", player: player.id, name: player.name, place: title, n });
    }
  }
  const trail = Number(CONFIG.trailSites) || 25;
  if (counts.sites >= trail && !d.m.includes("trail")) {
    d.m.push("trail");
    changed = true;
    send("realm:trail_unlock", { player: player.id, trail: "glyphs" });
  }
  if (changed) savePdata(player);
}

// ---------------------------------------------------------------------------
// Story progress: tablets reread
// ---------------------------------------------------------------------------

/** realm:saga_progress: a player's finished main acts. @param {any} msg */
function onProgress(msg) {
  if (typeof msg.player !== "string" || typeof msg.act !== "number" || !Number.isFinite(msg.act)) return;
  const act = Math.max(0, Math.min(5, Math.floor(msg.act)));
  acts.set(msg.player, act);
  const p = online(msg.player);
  if (!p) return;
  const d = pdata(p);
  if (act === d.a) return;
  const before = d.a;
  d.a = act;
  savePdata(p);
  if (act < before) return;
  let clearer = 0;
  for (let i = 0; i < TABLETS.length; i++) {
    const need = TIER_ACT[Math.floor(i / 12)];
    if (hasTablet(d, i) && need > before && need <= act) clearer++;
  }
  if (clearer) p.sendMessage(`§6[Atlas] The Starwright tablets read differently now: ${clearer} you'd found make sense at last. §7/realm:atlas -> Starwright Tablets`);
}

// ---------------------------------------------------------------------------
// The menu
// ---------------------------------------------------------------------------

/** @param {number} dx @param {number} dz */
function compass(dx, dz) {
  const a = (Math.atan2(dx, -dz) * 180) / Math.PI;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((a + 360) % 360) / 45) % 8];
}

/** @param {Player} player */
async function menu(player) {
  const d = pdata(player);
  const { x, z } = player.location;
  const [cx, cz] = cellOf(x, z);
  const here = player.dimension.id === OVERWORLD ? cells.get(`${cx},${cz}`) : undefined;
  /** @type {Record<string, number>} */
  const byKind = {};
  for (const k of d.p) {
    const r = built.get(k);
    if (r && r.k >= 0) byKind[kindOf(r)] = (byKind[kindOf(r)] ?? 0) + 1;
  }
  const kinds = KINDS.filter((k) => byKind[k]).map((k) => `${KIND_NAMES[k]} ${byKind[k]}`);
  const read = tabletCount(d);
  let clear = 0;
  for (let i = 0; i < TABLETS.length; i++) if (hasTablet(d, i) && tabletText(player, i).full) clear++;
  const notes = surveyNotes(d).length;
  const lines = [
    here ? `§6You are in ${regionName(cx, cz, here.g)}§r (Region ${here.n + 1}): ${foundIn(d, cx, cz)} of ${sitesIn(cx, cz)} sites found here.` : "§7Regions are in the Overworld.",
    `Regions found: §e${d.r.length}§r (${cellOrder.length} known in the realm)`,
    `Sites found: §e${d.p.length}§r${kinds.length ? `\n§7${kinds.join(", ")}§r` : ""}`,
    `Starwright Tablets: §e${read} of ${TABLETS.length}§r${read > clear ? ` (${read - clear} still worn)` : ""}`,
    `Fenn's survey notes: §e${notes} of ${SURVEY.length}§r`,
    `Shrine blessing: ${d.b === today() ? "§7used today" : "§aready"}§r`,
  ];
  const form = new ActionFormData().title("Atlas of the Realm").body(lines.join("\n"));
  /** @type {(() => Promise<void>)[]} */
  const acts2 = [];
  form.button(`Starwright Tablets\n§8${read} of 60 read`);
  acts2.push(() => tabletsMenu(player));
  form.button(`Fenn's Survey Notes\n§8${notes} of ${SURVEY.length}`);
  acts2.push(() => surveyMenu(player));
  form.button(`Regions You've Found\n§8${d.r.length}`);
  acts2.push(() => regionsPage(player));
  form.button("The Nearest Site Ahead\n§8Which way to go");
  acts2.push(() => nearestPage(player));
  if (isOp(player)) {
    form.button("§4Sites Near Here\n§8Operators: teleport");
    acts2.push(() => opSites(player));
  }
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  await acts2[res.selection]?.();
}

/** @param {PlayerData} d */
function surveyNotes(d) {
  /** @type {number[]} */
  const out = [];
  for (const k of d.x) {
    const r = built.get(k);
    if (r && kindOf(r) === "survey") {
      const n = hs(k) % SURVEY.length;
      if (!out.includes(n)) out.push(n);
    }
  }
  return out.sort((a, b) => a - b);
}

/** @param {Player} player */
async function tabletsMenu(player) {
  const d = pdata(player);
  const list = TABLETS.map((_, i) => i).filter((i) => hasTablet(d, i));
  const form = new ActionFormData().title("Starwright Tablets");
  form.body(list.length ? "The tablets you've read, in order. Worn ones read in full once you've seen more of the story." : "You haven't read a tablet yet. They stand alone out in the wilds: a carved stone on a tuff step.");
  for (const i of list) {
    const t = tabletText(player, i);
    form.button(`${i + 1}. ${t.full ? t.title : "§8Worn carving"}`);
  }
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  if (res.selection >= list.length) return menu(player);
  await showTablet(player, list[res.selection]);
  return tabletsMenu(player);
}

/** @param {Player} player */
async function surveyMenu(player) {
  const notes = surveyNotes(pdata(player));
  const body = notes.length ? notes.map((n) => SURVEY[n]).join("\n\n") : "Aldous Fenn left stone posts all over the realm with notes for whoever came after. You haven't found one yet.";
  const res = await show(player, new ActionFormData().title("Fenn's Survey Notes").body(body).button("Back"));
  if (res && !res.canceled) return menu(player);
}

/** @param {Player} player */
async function regionsPage(player) {
  const d = pdata(player);
  const rows = d.r
    .slice(-30)
    .reverse()
    .map((n) => {
      const key = cellOrder[n];
      const c = cells.get(key);
      if (!key || !c) return "";
      const [cx, cz] = key.split(",").map(Number);
      return `${regionName(cx, cz, c.g)} §7(Region ${n + 1}): ${foundIn(d, cx, cz)} of ${sitesIn(cx, cz)} sites§r`;
    })
    .filter(Boolean);
  const body = rows.length ? `${d.r.length > 30 ? "The last 30:\n" : ""}${rows.join("\n")}` : "No regions yet: walk out of town.";
  const res = await show(player, new ActionFormData().title("Regions You've Found").body(body).button("Back"));
  if (res && !res.canceled) return menu(player);
}

/** Which way the nearest site you haven't found is (built or not yet). @param {Player} player */
async function nearestPage(player) {
  const d = pdata(player);
  const { x, z } = player.location;
  const [cx, cz] = cellOf(x, z);
  /** @type {{ d: number, dx: number, dz: number, rec?: Rec } | undefined} */
  let best;
  if (player.dimension.id === OVERWORLD)
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (const s of slotsOf(cx + dx, cz + dz)) {
          const rec = built.get(s.key);
          if (rec?.s === 0 || d.p.includes(s.key)) continue;
          const ax = rec ? rec.x : s.x;
          const az = rec ? rec.z : s.z;
          if (Math.hypot(ax - ox, az - oz) < Number(get("spawnDistance"))) continue;
          const dd = Math.hypot(ax - x, az - z);
          if (!best || dd < best.d) best = { d: dd, dx: ax - x, dz: az - z, rec };
        }
  const body = best
    ? `${best.rec?.s === 1 ? `A ${KIND_NAMES[kindOf(best.rec)]}` : "Something"} lies about ${Math.round(best.d / 10) * 10} blocks ${compass(best.dx, best.dz)} of you.\n\n§7Sites never stand near towns, claims or safe zones, and some spots turn out to be no good for one.`
    : "No site you haven't found lies within a region of here. Try further out.";
  const res = await show(player, new ActionFormData().title("The Nearest Site Ahead").body(body).button("Back"));
  if (res && !res.canceled) return menu(player);
}

/** @param {Player} player */
async function opSites(player) {
  const { x, z } = player.location;
  const list = [...built.values()]
    .filter((r) => r.s !== 0)
    .map((r) => ({ r, d: Math.hypot(r.x - x, r.z - z) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 20);
  const form = new ActionFormData().title("Sites Near Here").body(`${[...built.values()].filter((r) => r.s === 1).length} sites built in the realm, ${[...built.values()].filter((r) => r.s === 0).length} spots skipped. The nearest:`);
  for (const { r, d } of list) form.button(`${KIND_NAMES[kindOf(r)]}${r.s === 2 ? " (unfinished)" : ""}\n§8${r.x} ${r.y} ${r.z}, ${Math.round(d)} blocks`);
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  const pick = list[res.selection];
  if (!pick) return menu(player);
  if (!isOp(player)) return player.sendMessage("§cOnly operators can teleport to sites."); // de-opped while the form was open
  try {
    player.teleport({ x: pick.r.x + 0.5, y: pick.r.y + 2, z: pick.r.z + PREFABS[kindOf(pick.r)].r + 2.5 }, { dimension: world.getDimension(OVERWORLD) });
  } catch (e) {
    player.sendMessage(`§c[Atlas] Couldn't teleport: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Testing hook (operators and scripts): realm:atlas_debug { player, action, ... }
// ---------------------------------------------------------------------------

/** @param {any} msg */
function debug(msg) {
  const p = typeof msg.player === "string" ? online(msg.player) : undefined;
  if (msg.action === "state") {
    const near = p
      ? [...built.values()]
          .map((r) => ({ key: keyOf(r), kind: r.k >= 0 ? kindOf(r) : "", s: r.s, x: r.x, y: r.y, z: r.z, h: r.k >= 0 ? heartOf(r) : undefined, d: Math.hypot(r.x - p.location.x, r.z - p.location.z) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, 8)
          .map(({ d: _, ...rest }) => rest)
      : [];
    const d = p ? pdata(p) : undefined;
    send("realm:atlas_state", {
      player: p?.id,
      cells: cellOrder.length,
      built: [...built.values()].filter((r) => r.s === 1).length,
      skipped: [...built.values()].filter((r) => r.s === 0).length,
      busy: jobBusy,
      fights: [...fights.values()].map((f) => ({ kind: f.kind, key: f.key, spawned: f.spawned, killed: f.killed })),
      near,
      data: d ? { r: d.r.length, p: d.p.length, x: d.x.length, t: tabletCount(d), b: d.b, a: d.a, m: d.m, f: d.f, s: d.s } : undefined,
      cell: p ? cellOf(p.location.x, p.location.z) : undefined,
    });
    return;
  }
  // "slots" lists the spots of the player's region, or of any region (`cell: [cx, cz]`), so a test can prefer a
  // region's kinds (or place a safe zone) before anyone walks in and its first spots get built.
  const askedCell = Array.isArray(msg.cell) && msg.cell.length === 2 && msg.cell.every((/** @type {unknown} */ n) => Number.isInteger(n)) ? msg.cell : undefined;
  if (msg.action === "slots" && (p || askedCell)) {
    const [cx, cz] = askedCell ?? cellOf(/** @type {Player} */ (p).location.x, /** @type {Player} */ (p).location.z);
    send("realm:atlas_state", { player: p?.id, slots: slotsOf(cx, cz).map((sl) => ({ key: sl.key, x: sl.x, z: sl.z, pref: sl.pref, s: built.get(sl.key)?.s })), cell: [cx, cz], min: cellMin(cx, cz), size: S });
    return;
  }
  if (msg.action === "prefer" && typeof msg.key === "string" && KINDS.includes(msg.kind)) {
    forced.set(msg.key, msg.kind);
    return;
  }
  if (!p) return;
  if (msg.action === "tablets") {
    const d = pdata(p);
    for (let i = 0; i < Math.min(60, Number(msg.count) || 0); i++) addTablet(d, i);
    savePdata(p);
    return;
  }
  const rec = typeof msg.key === "string" ? built.get(msg.key) : undefined;
  if (!rec || rec.s !== 1) return;
  const h = heartOf(rec);
  if (msg.action === "use") onUse(p, h, kindOf(rec) === "camp" ? "minecraft:barrel" : kindOf(rec) === "wreck" ? "minecraft:chest" : "minecraft:stone");
  else if (msg.action === "break") {
    if (kindOf(rec) === "cairn") {
      try {
        world.getDimension(OVERWORLD).getBlock(h)?.setType("minecraft:air");
      } catch {
        // unloaded
      }
      breakCairn(p, rec);
    } else if (kindOf(rec) === "fossil") dig(p, rec);
  } else if (msg.action === "kill") {
    const f = fightAt(keyOf(rec));
    if (f) for (const e of world.getDimension(OVERWORLD).getEntities({ tags: [FIGHT_TAG + f.id] })) e.kill();
  }
}

// ---------------------------------------------------------------------------
// Script events
// ---------------------------------------------------------------------------

const EVENTS = new Set(["realm:saga_progress", "realm:place_ready", "realm:sky_event", "realm:calendar", "realm:claims_check_result", "realm:atlas_debug", "realm:atlas_ping"]);

onScriptEvent(
  ["realm:help_pong", ...EVENTS],
  ({ id, message, sourceEntity }) => {
    if (id === "realm:help_pong") {
      scanning?.add(message.trim());
      return;
    }
    if (!EVENTS.has(id)) return;
    /** @type {any} */
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    try {
      if (id === "realm:saga_progress") onProgress(msg);
      else if (id === "realm:atlas_ping") {
        for (const p of world.getAllPlayers()) if (!msg.player || msg.player === p.id) sendMapData(p);
      } else if (id === "realm:place_ready") {
        if (typeof msg.name !== "string" || typeof msg.dim !== "string" || !Number.isFinite(msg.x) || !Number.isFinite(msg.z)) return;
        if (msg.state === "removed") places.delete(msg.name);
        else if (places.size < 200) places.set(msg.name, { dim: msg.dim, x: msg.x, z: msg.z });
      } else if (id === "realm:sky_event") {
        if (msg.kind !== "meteor" || !Number.isFinite(msg.x) || !Number.isFinite(msg.z)) return;
        meteors = [...meteors, /** @type {[number, number]} */ ([Math.floor(msg.x), Math.floor(msg.z)])].slice(-24);
        world.setDynamicProperty(PROP_METEORS, JSON.stringify(meteors));
      } else if (id === "realm:calendar") {
        if (Number.isFinite(msg.day)) realmDay = Math.floor(msg.day);
      } else if (id === "realm:claims_check_result") {
        const fn = typeof msg.id === "string" ? claimAsks.get(msg.id) : undefined;
        if (fn) {
          claimAsks.delete(msg.id);
          fn(Array.isArray(msg.claims) ? msg.claims.length : 0);
        }
      } else if (id === "realm:atlas_debug") {
        if (!(sourceEntity instanceof Player) || isOp(sourceEntity)) debug(msg);
      }
    } catch (e) {
      console.warn(`[atlas] ${id}: ${e}`);
    }
  },
);

// ---------------------------------------------------------------------------
// Command, load and leave
// ---------------------------------------------------------------------------

/**
 * @param {import("@minecraft/server").CustomCommandOrigin} origin @param {(player: Player) => unknown} fn
 * @returns {import("@minecraft/server").CustomCommandResult}
 */
function withPlayer(origin, fn) {
  const p = origin.initiator ?? origin.sourceEntity;
  if (!(p instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
  system.run(() => {
    try {
      const r = fn(p);
      if (r instanceof Promise) r.catch((e) => console.warn(`[atlas] ${e}`));
    } catch (e) {
      console.warn(`[atlas] ${e}`);
    }
  });
  return { status: CustomCommandStatus.Success };
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    { name: "realm:atlas", description: "Atlas of the Realm: regions and sites you've found, Starwright tablets, Fenn's notes", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => withPlayer(origin, menu),
  );
});

world.afterEvents.worldLoad.subscribe(() => {
  S = Math.max(128, Math.min(2048, Math.floor(Number(get("cellSize")) || 512)));
  poiMin = Math.floor(Number(get("poiMin")));
  poiMax = Math.floor(Number(get("poiMax")));
  if (!Number.isFinite(poiMin)) poiMin = 2;
  if (!Number.isFinite(poiMax)) poiMax = 4;
  loadWorld();
  readyAt = Date.now() + 15000;
  system.runTimeout(() => {
    scanPacks();
    send("realm:place_ping", {});
    send("realm:saga_progress_ping", {});
  }, 60);
  // The wanderers keep anchors in memory: send them every built site again, a few a tick.
  system.runTimeout(() => {
    const list = [...built.values()].filter((r) => r.s === 1 && ANCHORS.has(kindOf(r))).slice(0, 380);
    let i = 0;
    const h = system.runInterval(() => {
      for (let k = 0; k < 10 && i < list.length; k++) sendPoi(list[i++]);
      if (i >= list.length) system.clearRun(h);
    }, 1);
  }, 120);
  for (const e of world.getDimension(OVERWORLD).getEntities({ tags: [MOB_TAG] })) sweepMob(e);
});
system.runInterval(scanPacks, 12000);

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn) send("realm:saga_progress_ping", {});
  if (initialSpawn) lastCell.delete(player.id);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  pcache.delete(playerId);
  lastCell.delete(playerId);
  lastBanner.delete(playerId);
  acts.delete(playerId);
  lastUse.delete(playerId);
  for (const f of [...fights.values()]) if (f.player === playerId) endFight(f, false);
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
onScriptEvent(
  "realm:help_ping",
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "atlas_bp");
  },
);
