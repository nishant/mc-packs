// Minimap terrain: movement/circle preview and native-palette radar, tuned by the build profile in map-profile.js.
// Requires its companion modules (terrain-work.js, preview-persistence.js and the others imported below).
 // Minimap: a compass strip at the top of the screen, an optional radar, destinations and Mara's Field Map.
// Scripts can't draw on the HUD or on map items, so the picture is made of glyphs (glyphs.js, drawn by the
// glyph page in Side HUD, hud_rp) sent in the Side HUD title (side.js: the strip in slot "top", the radar in
// slot "radar" as the part "map/radar"). The Minimap is the side boxes' compositor: it draws the title of the players
// it shows something to, with every other pack's box in it, and never broadcasts its own parts (side.js, the
// compositor claim). The land itself is Bedrock's own locator map, held in the offhand.
//
// Every intervalTicks per player who has the strip or the radar on (the pass, spread over the ticks between): one
// entity search for monsters within their mob radius (the nearest maxMobs), one for realm:npc within npcRange;
// everything else is arithmetic on what other packs broadcast. In between, every tick, the strip and radar are drawn
// again from the pass's markers for players who turned or moved, so the compass follows the view; only a part whose
// text changed is sent. The terrain under the radar is read by a scanner and drawn from what it stored.
// The cost is capped, not the player count: each kind of work (drawing, building a radar's terrain picture, passes,
// the scanner) has a time budget a tick (budget.js; about 3 ms a tick in all at budgetLevel "normal", saved up when
// there's little to do).
// With many players moving at once each one's strip and radar come a few ticks later, the longest-waiting first.
// The broadcasts (each message under 2048 characters, long lists in parts):
//   realm:npc_places      { part, parts, folk: [{ id, n, dim, x, z }] }            <- Townsfolk; realm:npc_places_ping {}
//   realm:waystones_known { player, part, parts, list: [{ i, n, dim, x, z }] }     <- Waystones; realm:waystones_known_ping { player? }
//   realm:atlas_region    { player, name }                                         <- Atlas, on entering a region
//   realm:atlas_sites     { player, part, parts, sites: [[label, x, z, region]] }  <- Atlas, every site the player found
//   realm:atlas_site      { player, site: [label, x, z, region] }                  <- Atlas, one more; realm:atlas_ping { player? }
//   realm:death_point     { player, dim?, x?, z? }                                 <- Death Point; realm:death_point_ping { player? }
//   realm:track           { player, label?, dim?, x?, z? }                         <- Story Questlines' tracker target; realm:track_ping { player? }
//   realm:place_ready     { name, state, dim, x, z, wid?, label? }                 <- story places; only camps (wid) are used; realm:place_ping
//   realm:wander_spawn / realm:wander_turn / realm:wander_gone                     <- which wanderers on the road are friendly
//   realm:town_list       { part, parts, towns: [{ id, n, dim, x, z }] }            <- Town Projects; realm:town_list_ping {}
//   realm:rainbow_pot     { dim?, x?, z? }                                         <- Rainbows: the unfound pot of gold, or {}; realm:rainbow_ping {}
//   realm:siege_marks     { dim?, town?: { n, x, z }, circles?: [{ x, z }] }       <- Realm Calendar: a Choir siege, or {}; realm:siege_ping {}
//   realm:map_debug       { player, action: "state" | "cost" } (operators, tests)  -> realm:map_state
// Party mates are the online players with the same `realm_party:<code>` tag (Parties).
// See "Minimap" in docs/PACKS.md.
import "./diag.js";
import { DetailPersistence, isDetailStore } from "./detail-persistence.js";
import { ResidentTrace } from "./resident-trace.js";
import { createStatePacketizer } from "./map-debug-state.js";
const residentTrace = new ResidentTrace();
import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { Budget, oldestDue } from "./budget.js";
import { CONFIG } from "./config.js";
import { G, overlayGlyph, SELF_ARROWS } from "./glyphs.js";
import { get, getFor, onChange, setFor } from "./settings.js";
import { sideBoxes } from "./side.js";
import { aheadPicks, colKey, COL, glyphAt, hydratePreview, MISS_RETRY, PREVIEW, previewGlyph, radarGeometry, northUpRadarGeometry, readColumn, retainVisible, sampleCoord, scanQueueCounters, spendBudget, TerrainWorld, TerrainUnavailableError } from "./terrain.js";
import { PreviewPersistence } from "./preview-persistence.js";
import { onScriptEvent } from "./script-events.js";
import { confirmed, generationOf, needsReset, nextGeneration, PLAYER_GEN, resetPlayer, staleForm, WORLD_GEN } from "./reset.js";

/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** A place on the map. @typedef {{ n: string, dim: string, x: number, z: number }} Spot */
/** The destination a player picked: what kind, which one, and where it was when picked. @typedef {Spot & { k: string, id?: string }} Waypoint */
/** A player's place and party tag this pass. @typedef {{ id: string, dim: string, x: number, z: number, party?: string }} Seen */
/** A marker this pass: kind, where it is (x, z); `clamp` ones show at the edge when out of sight. @typedef {{ kind: string, x: number, z: number, clamp: boolean }} Marker */

import { MAP_PROFILE as EXP } from "./map-profile.js";
import { MANUAL_SCAN_MAX_RADIUS, circleCandidates, circleAnchors, insideRadar, circularMarker, radarBadgeCells, circularMarkerNeighbors, orderLatticeWork } from "./terrain-work.js";
import { ManualScanner } from "./manual-scanner.js";
import { rollTerrainDemand } from "./rolling-demand.js";
import { reconstructRaster } from "./terrain-estimate.js";
import { RADAR_PIXELS, snapshotCoverage, rasterCadenceReady } from "./raster-work.js";
import { selectNetherLayer } from "./nether-layer.js";
import { estimatedPaletteGlyph } from "./glyphs.js";
import { registerMinimapCommand } from "./minimap-command.js";
// BEGIN VISUAL LAB CORE -- shared by all eight experiments, no new Minecraft APIs.
// Per-tick admission targets, not preemption, and no CPU-release claim: the instrumentation below counts work for QA only.
class LabBudget {
  /** @param {number} perTick @param {number} max @param {number} tickMax */
  constructor(perTick, max, tickMax) { this.perTick = perTick; this.max = max; this.tickMax = tickMax; this.left = 0; }
  tick() { this.left = Math.min(this.perTick, this.tickMax); }
  get room() { return Math.max(0, Math.min(this.left, this.tickMax)); }
  get ok() { return this.room > 0; }
  /** @param {number} ms */
  spend(ms) { this.left -= ms; }
}
class LabEnvelope {
  constructor() { this.at = -1; this.used = 0; this.last = 0; this.peak = 0; }
  /** @param {number} tick */
  begin(tick) {
    if (this.at !== tick) { this.last = this.used; this.used = 0; this.at = tick; }
    return Date.now();
  }
  /** @param {number} start */
  end(start) { this.used += Math.max(0, Date.now() - start); this.peak = Math.max(this.peak, this.used); }
  get room() { return Math.max(0, EXP.featureMs - this.used); }
}
// Disabled means no terrain persistence IO, including the legacy preview provider.
// Player preferences / waypoints still use their existing storage.
class LabDisabledPersistence {
  constructor() { this.profile = "native"; this.ready = false; this.needsLoad = false; this.dirtyCount = 0; this.readVersion = 0; }
  /** @param {boolean} _ready */
  setReady(_ready) {}
  /** @param {string} profile */
  setProfile(profile) { const changed = this.profile !== profile; this.profile = profile; return changed; }
  /** @returns {import("./detail-persistence.js").Lookup} */
  lookup() { return { state: "unknown", provenance:"persisted" }; }
  request() {}
  note() { return false; }
  invalidate() { return true; }
  loadOne() { return undefined; }
  flushOne() { return false; }
  stats() { return { disabled: true, ready: true, pending: 0, reads: 0, dirty: 0 }; }
}
function experimentNative() { return EXP.palette === "native"; }
/** @typedef {import("./terrain.js").Pick & {d:number,stale:boolean,queuedAt:number,visible?:boolean}} LabPick */
/** @type {Map<string,{key:string,geometry:ReturnType<typeof northUpRadarGeometry>,x:number,z:number,version:string,storeVersion?:number,demandVersion?:number,reorderAt?:number,freshUntil?:number,retryDeadline?:number,readRadius?:number,footprintKey?:string,anchors?:import("./terrain-work.js").Anchor[]}>} */
const labPlans = new Map();
/** @type {Map<string,{storeId:string,x:number,z:number,sample:import("./detail-persistence.js").Raw,wall:number}>} */
const labPendingWrites = new Map();
const labStats = { saveErrors: 0, deferredSaves: 0, estimatedBuilds:0,estimatedCells:0,estimateVisited:0,planned: 0, rolled:0,rollTail:0,rollEntered:0,rollRawChecks:0,rasterBuilds: 0, coveragePasses: 0 };
const LAB_SAVE_LIMIT = 2048;

/** Sorts fresh work without losing its original request age. Native4 can only seed one genuine2 anchor. */
/** @param {LabPick[]} picks @param {number} now */
function labOrder(picks, now) { return orderLatticeWork(picks,now,EXP.preview); }

/** @param {import("./terrain.js").Store} store @param {number} x @param {number} z @param {import("./detail-persistence.js").Raw} sample @param {number} wall */
function labSaveSample(store, x, z, sample, wall) {
  if (!EXP.persistence || !isDetailStore(store.id)) return;
  const key = store.id + "|" + colKey(x, z, COL);
  try { if (detailPersistence.note(store.id, x, z, sample, wall)) { labPendingWrites.delete(key); return; } }
  catch { labStats.saveErrors++; }
  // Dispatch reserves one queue slot per possible native completion before issuing work.
  labPendingWrites.set(key, { storeId: store.id, x, z, sample: { ...sample }, wall });
  detailCost.noteBackpressure++; labStats.deferredSaves++;
}
function labRetrySaves() {
  let count = 0;
  for (const [key, record] of labPendingWrites) {
    if (++count > 8) break;
    try {
      if (!detailPersistence.note(record.storeId, record.x, record.z, record.sample, record.wall)) break;
      labPendingWrites.delete(key);
    } catch { labStats.saveErrors++; break; }
  }
}

/** Metadata comes from the exact pixel snapshot used to construct base, never from newer mutable records. */
/** @param {ReturnType<typeof radarGeometry>} geometry @param {Uint8Array} flags @param {Float64Array} ticks @param {{x:number,z:number}} at @param {number} radius @param {number} now @param {number} maxAge @returns {NonNullable<TerrainMemo["coverage"]>} */
function labCoverage(geometry, flags, ticks, at, radius, now, maxAge) { return snapshotCoverage(geometry,flags,ticks,at,radius,now,maxAge); }

// END VISUAL LAB CORE

const PACK = "map_bp";
const PROP_WP = "map:wp"; // player: JSON Waypoint
const PROP_MARKS = "map:marks"; // player: JSON Spot[]
const NPC_TAG = "realm:npc";
const ID_TAG = "realm:npc_id:";
const WANDER_OWNER = "realm:npc_owner:wander_bp";
const CAMP_TAG = "wander:c:";
const PARTY_TAG = "realm_party:";
const CHAMP_TAG = "realm:champion"; // Champions
const SINGER_TAG = "realm:siege_singer"; // Realm Calendar: a Choir siege's Singer
/** Champions and Choir Singers show this far (blocks), at the edge of the strip and the radar when out of sight. */
const CHAMP_RANGE = 128;
/** How often (ticks) each dimension's champions are looked up again, for everyone at once. */
const CHAMP_EVERY = 10;
const OVERWORLD = "minecraft:overworld";
const DIM_NAMES = /** @type {Record<string, string>} */ ({ "minecraft:overworld": "the Overworld", "minecraft:nether": "the Nether", "minecraft:the_end": "the End" });
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

const CELLS = 25; // the strip: 25 cells of 5 degrees, 60 degrees each side of where you face
const MID = 12;
const DEG = 5;
const R = 16; // Fixed 33 x 33 quality raster.
// A readout stays this long without an update (ticks), and an unchanged one is sent again after REFRESH (before HOLD
// runs out). Long, because the refresh of everyone's title was most of the drawing with many players on; a strip only
// lingers this long if the Minimap stops (a changed one is sent at once, and turning it off clears it).
const HOLD = 100;
const REFRESH = 80;
/** Players outside your party show within this many blocks (party mates anywhere in your dimension). */
const OTHERS_RANGE = 128;
const ARRIVED_TICKS = 60;
const NAME_MAX = 24;
// The strip's icons are about 16 units tall but a text line is about 10, so a line right under the strip is drawn
// over its baseline: a spacer line (one space) goes between them, and under a strip on its own so the box covers it.
const SPACER = "\n ";
const LINE2_BYTES = 159 - CELLS * 3 - SPACER.length - 1; // what the strip's second line may take of the slot
const MENU_MAX = 40;

/** Strip glyphs and drawing order (higher wins a cell) by marker kind. */
const KINDS = /** @type {Record<string, { s: string, l: string, r: string, q: string, p: number }>} */ ({
  star: { s: G.S_STAR, l: G.L_STAR, r: G.R_STAR, q: G.Q_STAR, p: 9 },
  party: { s: G.S_PARTY, l: G.L_PARTY, r: G.R_PARTY, q: G.Q_PARTY, p: 8 },
  champ: { s: G.S_CHAMP, l: G.L_CHAMP, r: G.R_CHAMP, q: G.Q_CHAMP, p: 8 },
  mob: { s: G.S_MOB, l: G.L_MOB, r: G.R_MOB, q: G.Q_MOB, p: 7 },
  folk: { s: G.S_FOLK, l: G.L_FOLK, r: G.R_FOLK, q: G.Q_FOLK, p: 6 },
  wander: { s: G.S_WANDER, l: G.L_WANDER, r: G.R_WANDER, q: G.Q_WANDER, p: 6 },
  other: { s: G.S_OTHER, l: G.L_OTHER, r: G.R_OTHER, q: G.Q_OTHER, p: 5 },
  camp: { s: G.S_CAMP, l: G.L_CAMP, r: G.R_CAMP, q: G.Q_CAMP, p: 4 },
  site: { s: G.S_SITE, l: G.L_SITE, r: G.R_SITE, q: G.Q_SITE, p: 4 },
  rainbow: { s: G.S_RAINBOW, l: G.L_RAINBOW, r: G.R_RAINBOW, q: G.Q_RAINBOW, p: 8 },
  town: { s: G.S_TOWN, l: G.S_TOWN, r: G.S_TOWN, q: G.Q_TOWN, p: 3 },
  home: { s: G.S_HOME, l: G.S_HOME, r: G.S_HOME, q: G.Q_HOME, p: 3 },
});
/** The nearest town and your respawn point don't show this close (you're there). */
const PLACE_NEAR = { town: 24, home: 4 };
const LETTERS = [G.S_N, G.S_NE, G.S_E, G.S_SE, G.S_S, G.S_SW, G.S_W, G.S_NW];
const YOU = [G.Q_YOU_0, G.Q_YOU_1, G.Q_YOU_2, G.Q_YOU_3, G.Q_YOU_4, G.Q_YOU_5, G.Q_YOU_6, G.Q_YOU_7];
const FRIEND_ARR = [G.Q_FRIEND_0, G.Q_FRIEND_1, G.Q_FRIEND_2, G.Q_FRIEND_3, G.Q_FRIEND_4, G.Q_FRIEND_5, G.Q_FRIEND_6, G.Q_FRIEND_7];
const PARTY_ARR = [G.Q_PARTY_0, G.Q_PARTY_1, G.Q_PARTY_2, G.Q_PARTY_3, G.Q_PARTY_4, G.Q_PARTY_5, G.Q_PARTY_6, G.Q_PARTY_7];
const STAR_ARR = [G.Q_STAR_0, G.Q_STAR_1, G.Q_STAR_2, G.Q_STAR_3, G.Q_STAR_4, G.Q_STAR_5, G.Q_STAR_6, G.Q_STAR_7];

const side = sideBoxes("map", { compositor: true });
const isOp = (/** @type {Player} */ p) => p.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
/** @param {string} id @param {unknown} msg */
const send = (id, msg) => {
  try {
    system.sendScriptEvent(id, JSON.stringify(msg));
  } catch (e) {
    console.warn(`[map] ${id}: ${e}`);
  }
};
const statePackets = createStatePacketizer();
/** Operator debug state: one legacy message when it fits, else bounded packets; a state too large for them sends the metrics with the reason. @param {string} json @param {unknown} player @param {object} metrics */
const sendDebugState = (json, player, metrics) => {
  try {
    for (const text of statePackets(json, player)) system.sendScriptEvent("realm:map_state", text);
  } catch (e) {
    console.warn(`[map] realm:map_state: ${e}`);
    send("realm:map_state", { ...metrics, chunkError: String(e instanceof Error ? e.message : e).slice(0, 160) });
  }
};
/** @param {unknown} v @returns {v is number} */
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
/** Plain ASCII text of at most `max` characters (names from other packs and players go into the HUD and menus). @param {unknown} v @param {number} [max] */
const plain = (v, max = NAME_MAX) =>
  String(v ?? "")
    .replace(/§./g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/~/g, "-")
    .trim()
    .slice(0, max);
/** A spot from a message, or undefined. @param {any} m @param {string} [name] */
function spotOf(m, name) {
  if (!m || typeof m.dim !== "string" || !isNum(m.x) || !isNum(m.z)) return undefined;
  return { n: plain(name ?? m.n ?? m.label ?? m.name), dim: m.dim, x: Math.floor(m.x), z: Math.floor(m.z) };
}
/** Degrees in (-180, 180]. @param {number} a */
const wrap = (a) => {
  const w = ((a % 360) + 360) % 360;
  return w > 180 ? w - 360 : w;
};
/** Compass bearing from an offset: 0 = north (-z), 90 = east (+x). @param {number} dx @param {number} dz */
const bearingOf = (dx, dz) => (Math.atan2(dx, -dz) * 180) / Math.PI;
/** "NE 240m" or "in the Nether" from a player to a spot. @param {Player} player @param {Spot} s */
function where(player, s) {
  if (player.dimension.id !== s.dim) return `in ${DIM_NAMES[s.dim] ?? s.dim}`;
  const p = player.location;
  const dx = s.x + 0.5 - p.x;
  const dz = s.z + 0.5 - p.z;
  const d = Math.hypot(dx, dz);
  return d < 2 ? "here" : `${COMPASS[Math.round(((bearingOf(dx, dz) + 360) % 360) / 45) % 8]} ${Math.round(d)}m`;
}
/** @param {Player} player @param {Spot} s */
const distTo = (player, s) => (player.dimension.id === s.dim ? Math.hypot(s.x + 0.5 - player.location.x, s.z + 0.5 - player.location.z) : Infinity);
/** UTF-8 bytes. @param {string} s */
const bytes = (s) => {
  let n = 0;
  for (const ch of s) {
    const c = /** @type {number} */ (ch.codePointAt(0));
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
};
/** The longest start of `s` within `max` UTF-8 bytes (no dangling §). @param {string} s @param {number} max */
function fit(s, max) {
  let out = "";
  let n = 0;
  for (const ch of s) {
    const b = bytes(ch);
    if (n + b > max) break;
    out += ch;
    n += b;
  }
  while (out.endsWith("§")) out = out.slice(0, -1);
  return out;
}

// ---------------------------------------------------------------------------
// What other packs told us
// ---------------------------------------------------------------------------

/** Townsfolk id -> where they are placed. @type {Map<string, Spot>} */
const folk = new Map();
/** Wanderer id -> their camp (built). @type {Map<string, Spot>} */
const camps = new Map();
/** Player id -> the waystones they know. @type {Map<string, (Spot & { i: number })[]>} */
const waystones = new Map();
/** Player id -> the Atlas sites they found (Overworld). @type {Map<string, (Spot & { r: string })[]>} */
const sites = new Map();
/** Player id -> the Atlas region they are in. @type {Map<string, string>} */
const regions = new Map();
/** Player id -> their last death point. @type {Map<string, Spot>} */
const deaths = new Map();
/** Player id -> the story tracker's target: a spot, a townsfolk (by id), or both. @type {Map<string, { n: string, spot?: Spot, npc?: string }>} */
const tracks = new Map();
/** Town id -> where it is (Town Projects). @type {Map<string, Spot>} */
const towns = new Map();
/** The rainbow's pot of gold while nobody has found it (Rainbows & the Pot of Gold). @type {Spot | undefined} */
let pot;
/** A Choir siege (Realm Calendar): the town and the circles still singing (none during the warning). @type {{ town: Spot, circles: Spot[] } | undefined} */
let siege;
/** Wanderer id -> friendly (true) or a hostile in disguise (false). Road wanderers we never heard about stay hidden. @type {Map<string, boolean>} */
const wanderers = new Map();
/** Lists arriving in parts: key -> what came so far. @type {Map<string, unknown[]>} */
const partial = new Map();

/**
 * Collects a list sent in parts; returns the whole list when the last part arrives.
 * @param {string} key @param {any} m @param {unknown[]} items @returns {unknown[] | undefined}
 */
function collect(key, m, items) {
  const part = isNum(m.part) ? m.part : 1;
  const parts = isNum(m.parts) ? m.parts : 1;
  if (parts <= 0) {
    partial.delete(key);
    return [];
  }
  if (part === 1) partial.set(key, []);
  const got = partial.get(key);
  if (!got) return undefined; // a middle part without its start
  got.push(...items);
  if (part < parts) return undefined;
  partial.delete(key);
  return got;
}

// ---------------------------------------------------------------------------
// Each player's destination and marked spots (cached; this pack is the only writer)
// ---------------------------------------------------------------------------

/** @type {Map<string, Waypoint | null>} */
const wpCache = new Map();
/** @type {Map<string, Spot[]>} */
const marksCache = new Map();
/** Player id -> [name, tick until]: "Arrived" on the strip. @type {Map<string, [string, number]>} */
const arrived = new Map();

/** @param {Player} player @returns {Waypoint | undefined} */
function waypointOf(player) {
  checkReset(player);
  if (wpCache.has(player.id)) return wpCache.get(player.id) ?? undefined;
  /** @type {Waypoint | null} */
  let wp = null;
  try {
    const v = JSON.parse(String(player.getDynamicProperty(PROP_WP) ?? "null"));
    const s = spotOf(v);
    if (s && typeof v.k === "string") wp = { ...s, k: v.k, ...(typeof v.id === "string" ? { id: v.id } : {}) };
  } catch {
    wp = null;
  }
  wpCache.set(player.id, wp);
  return wp ?? undefined;
}
/** @param {Player} player @param {Waypoint | undefined} wp */
function setWaypoint(player, wp) {
  wpCache.set(player.id, wp ?? null);
  try {
    player.setDynamicProperty(PROP_WP, wp ? JSON.stringify(wp) : undefined);
  } catch (e) {
    console.warn(`[map] save: ${e}`);
  }
  lastSent.delete(player.id);
  views.delete(player.id);
  passAt.delete(player.id); // drawn again from a new pass next tick
}
/** @param {Player} player @returns {Spot[]} */
function marksOf(player) {
  checkReset(player);
  const hit = marksCache.get(player.id);
  if (hit) return hit;
  /** @type {Spot[]} */
  const out = [];
  try {
    const v = JSON.parse(String(player.getDynamicProperty(PROP_MARKS) ?? "[]"));
    for (const m of Array.isArray(v) ? v : []) {
      const s = spotOf(m);
      if (s && s.n) out.push(s);
    }
  } catch {
    // none
  }
  marksCache.set(player.id, out);
  return out;
}
/** @param {Player} player @param {Spot[]} list */
function saveMarks(player, list) {
  marksCache.set(player.id, list);
  try {
    player.setDynamicProperty(PROP_MARKS, list.length ? JSON.stringify(list) : undefined);
  } catch (e) {
    console.warn(`[map] save: ${e}`);
  }
}

// /realm:map_reset: see reset.js. The world's generation is read once and kept; each player is checked once per visit.
/** @type {number | undefined} */
let worldGen;
/** @type {Set<string>} */
const resetChecked = new Set();
function currentGen() {
  if (worldGen === undefined) {
    try {
      worldGen = generationOf(world.getDynamicProperty(WORLD_GEN));
    } catch {
      return 0; // the world isn't loaded yet: read again next time
    }
  }
  return worldGen;
}
/** Clears this player's marks and destination once if a reset ran since they were last here. @param {Player} player */
function applyReset(player) {
  resetChecked.add(player.id);
  try {
    const gen = currentGen();
    if (!needsReset(gen, player.getDynamicProperty(PLAYER_GEN))) return;
    const cleared = resetPlayer(player, gen);
    wpCache.set(player.id, null);
    marksCache.set(player.id, []);
    lastSent.delete(player.id);
    hidePlayerHud(player);
    terrainBaseMemo.delete(player.id);
    passAt.delete(player.id);
    passAt.delete(player.id);
    // Only someone who lost a destination or spots is told; a brand-new player is just stamped with the generation.
    if (cleared) player.sendMessage("§7[Map] An operator reset everyone's destination and marked spots.");
  } catch (e) {
    console.warn(`[map] reset: ${e}`);
  }
}
/** @param {Player} player */
function checkReset(player) {
  if (!resetChecked.has(player.id)) applyReset(player);
}
/** True (and says so) when an operator reset the map after `gen` was read, so a menu opened before it must not save what it shows. @param {number} gen @param {Player} player */
function resetSince(gen, player) {
  if (!staleForm(gen, currentGen())) return false;
  if (player.isValid) player.sendMessage("§e[Map] An operator reset the map while this menu was open. Open it again.");
  return true;
}

/**
 * Marks where the player stands. At the limit the oldest spot goes.
 * @param {Player} player @param {string} [name] @returns {string} what to tell them
 */
function markHere(player, name) {
  const list = [...marksOf(player)];
  const max = Math.max(1, Number(get("maxMarks")) || 5);
  const n = plain(name) || `Spot ${list.length + 1}`;
  const p = player.location;
  /** @type {Spot} */
  const s = { n, dim: player.dimension.id, x: Math.floor(p.x), z: Math.floor(p.z) };
  const same = list.findIndex((m) => m.n.toLowerCase() === n.toLowerCase());
  let dropped = "";
  if (same >= 0) list.splice(same, 1);
  while (list.length >= max) dropped = /** @type {Spot} */ (list.shift()).n;
  list.push(s);
  saveMarks(player, list);
  return `§a[Map] Marked "${n}" at ${s.x}, ${s.z}.${dropped ? ` §7(${max} at most: forgot "${dropped}")` : ""} §7Pick it in /realm:map.`;
}

// ---------------------------------------------------------------------------
// One pass for one player
// ---------------------------------------------------------------------------

/** Player handle -> id: `player.id` is a native read, and the per-tick paths ask for it hundreds of times a tick at 40 players. @type {WeakMap<Player, string>} */
const ids = new WeakMap();
/** @param {Player} player */
function idOf(player) {
  let id = ids.get(player);
  if (id === undefined) ids.set(player, (id = player.id));
  return id;
}
/** Independent compass/radar flags and fixed quality choices. */
const prefCache = new Map();
const RADAR_OFF_RESET="map:radarOffReset20261022";
/** Owner-requested ONE-TIME preference reset. Never resets compass or later opt-in choices. @param {Player} player */
function resetRadarOffOnce(player){
  if(player.getDynamicProperty(RADAR_OFF_RESET)===true)return false;
  const error=setFor(player,"radar",false);if(error)throw new Error(error);
  player.setDynamicProperty(RADAR_OFF_RESET,true);return true;
}
/** @param {Player} player */
function prefsOf(player) {
  const hit = prefCache.get(idOf(player));
  if (hit) return hit;
  const cap = Math.max(8, Number(get("mobRadiusMax")) || 32);
  const p = {
    compass: getFor(player, "compass") === true,
    radar: getFor(player, "radar") === true,
    north: true, // Oak radar is always north-up; legacy orientation preferences are intentionally ignored.
    terrain: getFor(player, "terrain") === true,
    mobs: getFor(player, "showMobs") === true,
    radius: Math.min(cap, Math.max(8, Number(getFor(player, "mobRadius")) || 24)),
    // Fixed terrain circle, independent of the player's mob radius.
    radarRadius: 36,
    revealRadius: 36,
    town: getFor(player, "showTown") === true,
    home: getFor(player, "showHome") === true,
  };
  prefCache.set(idOf(player), p);
  return p;
}
onChange((_key, player) => {
  if (!player && (_key === "nativeTerrain" || _key === "*")) {
    previewPersistence.setProfile(experimentNative() ? "native" : "material");
    if (detailPersistence.setProfile(experimentNative() ? "native" : "material")) detailHydrationBlocked = false;
    terrain.stores.clear(); playerStore.clear(); scanPlans.clear(); terrainBaseMemo.clear(); pendingTerrain.clear();
  }
  if (player) prefCache.delete(player.id);
  else prefCache.clear();
  if (player) {
    const s = lastSent.get(player.id);
    if (s) s.ctext = s.rtext = "";
    views.delete(player.id); // drawn again from scratch at the next pass (next tick)
    passAt.delete(player.id);
  } else {
    for (const s of lastSent.values()) s.ctext = s.rtext = "";
    views.clear();
    passAt.clear();
  }
});

/** What was last sent to each player, each part on its own: the strip's text and when, the radar's text and when. @type {Map<string, { ctext: string, cat: number, rtext: string, rat: number, compass: boolean, radar: boolean }>} */
const lastSent = new Map();
/** One shared render snapshot drives both compass and radar (realm:map_debug). @type {Map<string, { strip: string, line2: string, radar: string, dest?: string, target?: Spot, at: Vector3, dim: string, heading: number, radius: number, north: boolean }>} */
const lastText = new Map();
let costMs = 0;
/** Of costMs, the time spent sending the title (side.js: setTitle; the compositor sends no realm:side). */
let drawMs = 0;
let costPasses = 0;
let costPlayers = 0;

/** A live player's position, if they're online. @param {string} id @param {Player[]} all */
const onlineById = (id, all) => all.find((p) => p.isValid && p.id === id);

/** The siege spot for a player: the nearest circle still singing, else the town (the warning). @param {Player} player */
function siegeSpot(player) {
  if (!siege || player.dimension.id !== siege.town.dim) return undefined;
  if (!siege.circles.length) return siege.town;
  return siege.circles.reduce((a, b) => (distTo(player, a) <= distTo(player, b) ? a : b));
}

/**
 * Where the destination is now: the picked waypoint (followed live for townsfolk, camps, the death point and
 * party mates), else a Choir siege in the player's dimension, else the story tracker's target. `off` says why
 * there's nothing to point at.
 * @param {Player} player @param {Player[]} all @param {Map<string, Vector3>} liveFolk
 * @returns {{ spot?: Spot, picked: boolean, off?: string } | undefined}
 */
function destination(player, all, liveFolk) {
  const wp = waypointOf(player);
  if (wp) {
    if (wp.k === "npc" && wp.id) {
      const at = liveFolk.get(wp.id);
      if (at) return { spot: { ...wp, dim: player.dimension.id, x: Math.floor(at.x), z: Math.floor(at.z) }, picked: true };
      const f = folk.get(wp.id);
      return { spot: f ? { ...f, n: wp.n } : wp, picked: true };
    }
    if (wp.k === "camp" && wp.id) return { spot: camps.get(wp.id) ? { ...(/** @type {Spot} */ (camps.get(wp.id))), n: wp.n } : wp, picked: true };
    if (wp.k === "death") return { spot: deaths.get(player.id) ? { ...(/** @type {Spot} */ (deaths.get(player.id))), n: wp.n } : wp, picked: true };
    if ((wp.k === "party" || wp.k === "friend") && wp.id) {
      const mate = onlineById(wp.id, all);
      if (!mate) return { picked: true, off: `${wp.n} is offline` };
      const l = mate.location;
      return { spot: { n: wp.n, dim: mate.dimension.id, x: Math.floor(l.x), z: Math.floor(l.z) }, picked: true };
    }
    return { spot: wp, picked: true };
  }
  const sg = siegeSpot(player);
  if (sg) return { spot: sg, picked: false };
  const t = tracks.get(player.id);
  if (!t) return undefined;
  const live = t.npc ? liveFolk.get(t.npc) : undefined;
  if (live) return { spot: { n: t.n, dim: player.dimension.id, x: Math.floor(live.x), z: Math.floor(live.z) }, picked: false };
  if (t.spot) return { spot: t.spot, picked: false };
  const f = t.npc ? folk.get(t.npc) : undefined;
  return f ? { spot: { ...f, n: t.n }, picked: false } : { picked: false, off: t.n };
}

/** @param {Player} player */
function partyTag(player) {
  try {
    return player.getTags().find((t) => t.startsWith(PARTY_TAG));
  } catch {
    return undefined;
  }
}

/** Townsfolk and wanderers near each player, searched every other pass (they hardly move). @type {Map<string, { tick: number, dim: string, x: number, z: number, list: { kind: string, x: number, y: number, z: number, id?: string }[] }>} */
const npcCache = new Map();

/**
 * The last townsfolk searches, any player's: a player near where one was made a moment ago uses its result instead of
 * searching again (players often go about together). At most SHARED_KEPT are kept.
 * @type {{ tick: number, dim: string, x: number, z: number, list: { kind: string, x: number, y: number, z: number, id?: string }[] }[]}
 */
const npcShared = [];
const SHARED_KEPT = 24;

/** @param {Player} player */
function npcsNear(player) {
  const at = player.location;
  const dim = player.dimension;
  const now = system.currentTick;
  const hit = npcCache.get(idOf(player));
  if (hit && hit.dim === dim.id && now - hit.tick < 20 && Math.abs(hit.x - at.x) + Math.abs(hit.z - at.z) < 8) return hit.list;
  for (const sh of npcShared) {
    if (sh.dim === dim.id && now - sh.tick < 20 && Math.abs(sh.x - at.x) + Math.abs(sh.z - at.z) < 8) {
      npcCache.set(idOf(player), sh);
      return sh.list;
    }
  }
  /** @type {{ kind: string, x: number, y: number, z: number, id?: string }[]} */
  const list = [];
  for (const e of dim.getEntities({ location: at, maxDistance: Number(get("npcRange")) || 64, tags: [NPC_TAG] })) {
    try {
      const tags = e.getTags();
      const idTag = tags.find((t) => t.startsWith(ID_TAG));
      const { x, y, z } = e.location;
      if (tags.includes(WANDER_OWNER)) {
        // A wanderer: at their camp they are always friendly; on the road only when we heard they are (a hostile
        // in disguise, or one spawned before this pack loaded, stays hidden).
        const wid = idTag?.slice(ID_TAG.length + 2) ?? "";
        if (tags.some((t) => t.startsWith(CAMP_TAG)) || wanderers.get(wid) === true) list.push({ kind: "wander", x, y, z });
        continue;
      }
      list.push({ kind: "folk", x, y, z, ...(idTag ? { id: idTag.slice(ID_TAG.length) } : {}) });
    } catch {
      // gone meanwhile
    }
  }
  const made = { tick: now, dim: dim.id, x: at.x, z: at.z, list };
  npcCache.set(idOf(player), made);
  npcShared.unshift(made);
  if (npcShared.length > SHARED_KEPT) npcShared.pop();
  return list;
}

/** Per dimension: where its champions (and a siege's Choir Singers) were at the last look. @type {Map<string, { tick: number, list: { x: number, z: number }[] }>} */
const champCache = new Map();
/**
 * The champions in a dimension: one tag search for everyone, at most every CHAMP_EVERY ticks (plus one for the Choir
 * Singers while a siege is on there), so their markers cost the same at 1 player or 40.
 * @param {import("@minecraft/server").Dimension} dim
 */
function champsIn(dim) {
  const now = system.currentTick;
  const hit = champCache.get(dim.id);
  if (hit && now - hit.tick < CHAMP_EVERY) return hit.list;
  /** @type {{ x: number, z: number }[]} */
  const list = [];
  const tags = siege?.town.dim === dim.id ? [CHAMP_TAG, SINGER_TAG] : [CHAMP_TAG];
  for (const tag of tags) {
    try {
      for (const e of dim.getEntities({ tags: [tag] })) {
        try {
          const l = e.location;
          list.push({ x: l.x, z: l.z });
        } catch {
          // gone meanwhile
        }
      }
    } catch {
      // the dimension can't be searched now: none this time
    }
  }
  champCache.set(dim.id, { tick: now, list });
  return list;
}

/**
 * Markers around the player: two entity searches (townsfolk and wanderers; mobs), the rest from broadcasts.
 * @param {Player} player @param {Seen[]} seen @param {{ mobs: boolean, radius: number, town: boolean, home: boolean }} pr
 */
function gather(player, seen, pr) {
  const dim = player.dimension;
  const at = player.location;
  /** @type {Marker[]} */
  const out = [];
  /** @param {string} kind @param {number} x @param {number} z @param {boolean} clamp */
  const add = (kind, x, z, clamp) => {
    out.push({ kind, x, z, clamp });
  };
  /** Townsfolk loaded near the player, by id (a picked townsfolk is followed live). @type {Map<string, Vector3>} */
  const liveFolk = new Map();
  for (const n of npcsNear(player)) {
    if (n.id) liveFolk.set(n.id, n);
    add(n.kind, n.x, n.z, false);
  }
  if (pr.mobs) {
    const max = Math.max(1, Number(get("maxMobs")) || 8);
    // Each player's own search: one reaching farther for others to share made every pass about 20% dearer and saved
    // nothing measurable with players in groups (October 2026).
    // Champions and Choir Singers come from champsIn, farther and with their own marker, so not twice.
    for (const e of dim.getEntities({ location: at, maxDistance: pr.radius, families: ["monster"], excludeTags: [NPC_TAG, CHAMP_TAG, SINGER_TAG], closest: max })) {
      try {
        const l = e.location;
        add("mob", l.x, l.z, true);
      } catch {
        // gone meanwhile
      }
    }
    for (const c of champsIn(dim)) if (Math.hypot(c.x - at.x, c.z - at.z) <= CHAMP_RANGE) add("champ", c.x, c.z, true);
  }
  const tag = seen.find((s) => s.id === idOf(player))?.party;
  const others = get("showOthers") === true;
  for (const s of seen) {
    if (s.id === idOf(player) || s.dim !== dim.id) continue;
    if (tag && s.party === tag) add("party", s.x, s.z, true);
    else if (others && Math.hypot(s.x - at.x, s.z - at.z) <= OTHERS_RANGE) add("other", s.x, s.z, true);
  }
  const range = Number(get("placeRange")) || 256;
  for (const c of camps.values()) if (c.dim === dim.id && Math.abs(c.x - at.x) <= range && Math.abs(c.z - at.z) <= range) add("camp", c.x + 0.5, c.z + 0.5, false);
  if (dim.id === OVERWORLD) for (const s of sites.get(idOf(player)) ?? []) if (Math.abs(s.x - at.x) <= range && Math.abs(s.z - at.z) <= range) add("site", s.x + 0.5, s.z + 0.5, false);
  if (pr.town) {
    /** @type {Spot | undefined} */
    let best;
    let bestD = Infinity;
    for (const t of towns.values()) {
      if (t.dim !== dim.id) continue;
      const d = Math.hypot(t.x + 0.5 - at.x, t.z + 0.5 - at.z);
      if (d < bestD) [best, bestD] = [t, d];
    }
    if (best && bestD > PLACE_NEAR.town) add("town", best.x + 0.5, best.z + 0.5, false);
  }
  if (pr.home) {
    try {
      const sp = player.getSpawnPoint();
      if (sp && sp.dimension.id === dim.id && Math.hypot(sp.x + 0.5 - at.x, sp.z + 0.5 - at.z) > PLACE_NEAR.home) add("home", sp.x + 0.5, sp.z + 0.5, false);
    } catch {
      // no respawn point
    }
  }
  if (pot && pot.dim === dim.id) add("rainbow", pot.x + 0.5, pot.z + 0.5, true);
  return { markers: out, liveFolk };
}

/**
 * The strip: 25 cells, 5 degrees each, centered on where the player faces, with N/E/S/W, ticks every 15 degrees
 * and markers by bearing; out of sight, clamped markers become arrows at the edges.
 * @param {number} heading 0 = north, clockwise @param {Marker[]} markers @param {{ x: number, z: number }} at the player
 */
function stripOf(heading, markers, at) {
  const base = stripBase(heading);
  const cells = base.cells.slice();
  const prio = base.prio.slice();
  for (const m of markers) {
    if (m.kind === "folk" || m.kind === "wander") continue;
    const k = KINDS[m.kind];
    if (!k) continue;
    const dx = m.x - at.x;
    const dz = m.z - at.z;
    const rel = wrap(bearingOf(dx, dz) - heading);
    let i = MID + Math.round(rel / DEG);
    let g = k.s;
    if (i < 0 || i >= CELLS) {
      if (!m.clamp) continue;
      i = rel < 0 ? 0 : CELLS - 1;
      g = rel < 0 ? k.l : k.r;
    }
    // Nearer wins among equals (by the squared distance: the same order, no square root).
    const p = 10 + k.p - Math.min(dx * dx + dz * dz, 998001) / 998002;
    if (p <= prio[i]) continue;
    cells[i] = g;
    prio[i] = p;
  }
  return cells.join("");
}

/** The strip's center, ticks and letters by facing: a tick 15 degrees off lands on the same cell for every facing that
 * rounds to the same cell (a multiple of 5 degrees plus the facing, rounded), so there are 72 of them, each built once. */
const stripBases = new Map();
/** @param {number} heading @returns {{ cells: string[], prio: number[] }} */
function stripBase(heading) {
  const q = ((Math.round(-heading / DEG) % 72) + 72) % 72;
  let base = stripBases.get(q);
  if (base) return base;
  const h = -q * DEG;
  const cells = Array(CELLS).fill(G.S_BLANK);
  const prio = Array(CELLS).fill(0);
  cells[MID] = G.S_CENTER;
  prio[MID] = 1;
  for (let a = 0; a < 360; a += 15) {
    const i = MID + Math.round(wrap(a - h) / DEG);
    if (i < 0 || i >= CELLS) continue;
    const p = a % 45 === 0 ? 2 : 1;
    if (p < prio[i] || (p === prio[i] && i === MID)) continue;
    cells[i] = a % 45 === 0 ? LETTERS[a / 45] : G.S_TICK;
    prio[i] = p;
  }
  stripBases.set(q, (base = { cells, prio }));
  return base;
}

// The terrain is world data kept by terrain.js: one surface store per dimension, shared by everyone, and one
// store per underground layer (the height a roofed player stands at), shared by those at that height.
const NETHER_BAND = 8;
/** Last selected Nether center;2-block hysteresis prevents step/jump boundary flicker. @type {Map<string,number>} */
const netherLayers=new Map();
/** @param {string} id @param {number} y */
function netherLayerFor(id,y){const layer=selectNetherLayer(y,netherLayers.get(id),NETHER_BAND,2);if(layer===undefined)throw new RangeError("Invalid Nether altitude");netherLayers.set(id,layer);return layer;}
/** Display identities only: unknown is never promoted to lava, ground or confirmed empty. @param {string} dim */
const unknownTerrainGlyph=dim=>dim==="minecraft:nether"?G.Q_NETHER_UNKNOWN:dim==="minecraft:the_end"?G.Q_END_UNKNOWN:G.Q_EMPTY;
/** @param {string} dim */
const emptyTerrainGlyph=dim=>dim==="minecraft:the_end"?G.Q_VOID:dim==="minecraft:nether"?G.Q_NETHER_EMPTY:G.Q_EMPTY;
const terrain = new TerrainWorld(6000, 24);
// Constructor, request and note are memory-only. Native property IO lives in the bounded host below.
const previewPersistence = EXP.persistence && EXP.preview ? new PreviewPersistence({ get: (k) => world.getDynamicProperty(k), set: (k, v) => world.setDynamicProperty(k, v) }, { resolution: PREVIEW, maxResidentPages: 32 }) : new LabDisabledPersistence();
const detailPersistence = EXP.persistence ? new DetailPersistence({ get: (k) => world.getDynamicProperty(k), set: (k, v) => world.setDynamicProperty(k, v) }, { ready: false, profile: "native", maxResidentPages: 16, maxSavedPages: 128 }) : new LabDisabledPersistence();
let detailHydrationTick = -1, detailHydrationUsed = 0;
/** Bounded raw-page replay shares one64-sample allowance across render and scanner.
 * @param {import("./terrain.js").Store} store @param {number} x @param {number} z
 * @param {import("./detail-persistence.js").Sample} sample @param {number} now
 */
function restoreCachedDetail(store, x, z, sample, now) {
  if (detailHydrationTick !== now) { detailHydrationTick = now; detailHydrationUsed = 0; }
  if (detailHydrationUsed >= EXP.replayLimit) return false;
  if (!terrain.restoreDetail(store, x, z, sample, now, Date.now())) return false;
  pendingTerrain.delete(store.id + "|" + colKey(x, z, COL));
  detailHydrationUsed++; detailCost.hydrated++; return true;
}
let detailHydrationBlocked = false;
/** @type {Map<string,{storeId:string,x:number,z:number,at:number}>} */
const pendingTombstones = new Map();
let tombstoneOverflow = false;
/** Existing scan demand is the bounded replay worklist; rendering never requests or restores a record. */
const replayCursor = new WeakMap();
let replayFirst = 0, replayVisitTick=-1, replayVisits=0;
/** @param {number} now */
function replayVisibleDetail(now) {
  if(replayVisitTick!==now){replayVisitTick=now;replayVisits=0;}
  if (detailHydrationBlocked || !detailPersistence.ready || !scanPlans.size) return;
  const plans = [...scanPlans.values()];
  const started = Date.now();
  let visited = 0;
  for (let n = 0; n < plans.length && visited < 128 && replayVisits < 128; n++) {
    const plan = plans[(n + replayFirst) % plans.length];
    let i = Math.max(plan.pos, replayCursor.get(plan) ?? plan.pos);
    for (; i < plan.picks.length && visited < 128 && replayVisits < 128; i++) {
      if (detailHydrationTick === now && detailHydrationUsed >= EXP.replayLimit) break;
      if (Date.now() - started >= featureEnvelope.room) break;
      const pick = plan.picks[i], store = pick.store ?? plan.store; visited++;replayVisits++;
      if (pick.resolution !== COL || pick.stale || store.cols.has(pick.key) || !terrainPickInRange({x:plan.x,z:plan.z,radius:36},pick)) continue;
      const hit = detailPersistence.lookup(store.id, pick.wx, pick.wz, Date.now());
      if (hit.state === "pending") break;
      if (hit.state === "known") restoreCachedDetail(store, pick.wx, pick.wz, hit.sample, now);
    }
    replayCursor.set(plan, i);
  }
  replayFirst = (replayFirst + 1) % plans.length;
}
const detailCost = { nativeCompleted: 0, hydrated: 0, persistedHits: 0, pending: 0, invalid: 0, noteBackpressure: 0, invalidationBackpressure: 0 };
let previewWorldLoaded = false;
const previewCost = { queries: 0, nativeReads: 0, nativeFills: 0, hits: 0, diskLoads: 0, hydrated: 0, rejects: 0, loadCalls: 0, flushCalls: 0, loadMs: 0, flushMs: 0 };
world.afterEvents.worldLoad.subscribe(() => {
  previewPersistence.setProfile(experimentNative() ? "native" : "material");
  detailPersistence.setProfile(experimentNative() ? "native" : "material");
  detailPersistence.setReady(true);
  previewWorldLoaded = true;
  console.warn("[map] Oak terrain with marked display estimates; budgetLevel controls remain active");
});
// At most one manifest/page read per tick while queued, before the scanner; never from render or before worldLoad.
system.runInterval(() => {
  const featureStarted = featureEnvelope.begin(system.currentTick);
  try {
  if (!EXP.persistence || !previewWorldLoaded || get("enabled") !== true) return;
  labRetrySaves();
  const active = playersNow().some((player) => {
    try { const pr = prefsOf(player); return pr.radar && pr.terrain; } catch { return false; }
  });
  if (!active) return;
  replayVisibleDetail(system.currentTick);
  let retriedTombstones = 0;
  for (const [key, tomb] of pendingTombstones) {
    if (retriedTombstones++ >= 4) break;
    if (!detailPersistence.invalidate(tomb.storeId, tomb.x, tomb.z, Date.now())) break;
    pendingTombstones.delete(key);
  }
  detailHydrationBlocked = tombstoneOverflow || pendingTombstones.size > 0;
  const detailReadVersion = detailPersistence.readVersion ?? 0;
  if (detailPersistence.needsLoad && detailPersistence.loadOne(Date.now())) {
    if ((detailPersistence.readVersion ?? 0) === detailReadVersion) return;
    // A disk read is not a terrain mutation. Raw restoration bumps only its affected store/regions.
    // Never invalidate all viewers here: that turns page IO into an unbounded raster rebuild storm.
    return; // One host read attempt TOTAL, including failed reads.
  }
  const queued = previewPersistence.stats();
  if (queued.ready && !queued.pending) return;
  const started = Date.now();
  const readsBefore = queued.reads;
  previewCost.loadCalls++;
  try {
    const data = previewPersistence.loadOne(started);
    if (!data) return;
    // Never recreate an evicted Nether band or alias a persisted ID to a viewer's current dimension.
    const store = terrain.stores.get(data.storeId);
    if (!store) { previewCost.rejects += data.entries.length; return; }
    for (const entry of data.entries) if (hydratePreview(store, entry.wx, entry.wz, entry.glyph, system.currentTick)) previewCost.hydrated++;
  } finally {
    // Includes a manifest-only read; resident replay and hydration are not native property reads.
    previewCost.diskLoads += Math.max(0, (previewPersistence.stats().reads ?? 0) - (readsBefore ?? 0));
    previewCost.loadMs += Date.now() - started;
  }

  } finally { featureEnvelope.end(featureStarted); }
}, 1);
// Existing dirty pages may finish flushing while HUDs are off. One world-property write at most per call.
let lastPersistenceFlushTick = -Infinity;
system.runInterval(() => {
  const featureStarted = featureEnvelope.begin(system.currentTick);
  try {
  if (!EXP.persistence || !previewWorldLoaded) return;
  labRetrySaves();
  const flushTick = system.currentTick;
  if (flushTick - lastPersistenceFlushTick < EXP.flushTicks && !detailHydrationBlocked && detailPersistence.dirtyCount < 8) return;
  lastPersistenceFlushTick = flushTick;
  const started = Date.now();
  previewCost.flushCalls++;
  try { if (!detailPersistence.flushOne(started)) previewPersistence.flushOne(started); } finally { previewCost.flushMs += Date.now() - started; }

  } finally { featureEnvelope.end(featureStarted); }
}, 2);


/** Terrain base and its released per-player stale slot; geometry/coverage belong to this viewer.
 * @typedef {{labFlags?:Uint8Array,labTicks?:Float64Array,labHeights?:Float32Array,coverageSignature?:string,labBuilt?:number,estimateScratch?:import("./terrain-estimate.js").EstimateScratch,key:string,base:string[],rows:string[],touched:number[],need:import("./terrain.js").Pick[],needAt:number,needStore?:import("./terrain.js").Store,slot:number,bucket?:number,geometry?:ReturnType<typeof radarGeometry>,coverage?:{firstTick:number,firstKnownTick?:number,firstCoveredTick?:number,detailCells:number,previewCells:number,unknownCells:number,eligibleCells:number,eligibleKnownCells:number,eligibleDetailCells:number,totalCells:number,sampled2?:number,live2?:number,persisted2?:number,validEmpty2?:number,invalidated2?:number,estimatedCells?:number,eligibleEstimatedCells?:number,nextExpiry?:number,frameKey?:string,builtTick?:number}}} TerrainMemo
 */
/** @type {Map<string,TerrainMemo>} */
const terrainBaseMemo = new Map();
/** Current plus at most four other exact rendered poses; image reuse only, not another terrain provider. */
// Exact-pose history removed: a single terrain base per viewer is retained.
/** The store each player's radar reads, set by the scan every tick (roofed players read their layer). @type {Map<string, import("./terrain.js").Store>} */
const playerStore = new Map();
/** @param {string} id @param {string} dimId */
const storeFor = (id, dimId) => {
  const s = playerStore.get(id);
  return s && s.id.startsWith(`${dimId}|`) ? s : terrain.store(dimId, undefined);
};
/**
 * What a viewer's picture depends on: their store and the versions of the regions their radar reaches, so a read
 * near them redraws it and another viewer's reads far away don't.
 * @param {string} id @param {string} dimId @param {{ x: number, z: number }} at @param {number} radius
 */
const terrainVerOf = (id, dimId, at, radius) => {
  const s = storeFor(id, dimId);
  return `${s.id}#${terrain.viewVer(s, at.x, at.z, radius + PREVIEW + 1)}`;
};

/** In-progress readers are shared by store/key just like completed samples. */
const pendingTerrain = new Map();

/**
 * A block changed: forget its column in every store of the dimension. Its region's version goes up, so the radars
 * near it are built again and list it for the scanner.
 * @param {import("@minecraft/server").Block} block
 */
function blockChanged(block) {
  terrain.invalidate(block.dimension.id, block.location.x, block.location.z);
  const dim = block.dimension.id, x = block.location.x, z = block.location.z;
  for (const [key, pending] of labPendingWrites) if (pending.storeId.startsWith(dim + "|") && colKey(pending.x, pending.z, COL) === colKey(x, z, COL)) labPendingWrites.delete(key);
  const ids = new Set([...terrain.stores.keys()].filter(id => id.startsWith(dim + "|")));
  if (dim !== "minecraft:nether") ids.add(dim + "|surface");
  else { const band = Math.floor(block.location.y / NETHER_BAND) * NETHER_BAND + NETHER_BAND / 2; for (let y = band; y <= band + 24; y += NETHER_BAND) ids.add(dim + "|layer" + y); }
  for (const storeId of ids) {
    if (isDetailStore(storeId) && !detailPersistence.invalidate(storeId, x, z, Date.now())) {
      detailHydrationBlocked = true; detailCost.invalidationBackpressure++;
      const key = storeId + "|" + colKey(x, z, COL);
      if (pendingTombstones.has(key) || pendingTombstones.size < 256) pendingTombstones.set(key, { storeId, x, z, at: Date.now() });
      else tombstoneOverflow = true; // Explicit fail-closed overflow: never claim drained/durable.
    }
    for (const resolution of [1, COL, PREVIEW]) pendingTerrain.delete(storeId + "|" + colKey(x, z, resolution));
  }
}
world.afterEvents.playerPlaceBlock.subscribe(({ block }) => {
  try {
    blockChanged(block);
  } catch {
    // ignore
  }
});
world.afterEvents.playerBreakBlock.subscribe(({ block }) => {
  try {
    blockChanged(block);
  } catch {
    // ignore
  }
});

// Terrain scanner, every tick like the compass. Each viewer's missing columns are read from a reading budget the
// viewers share evenly (at most SCAN_TOTAL a tick and SCAN_EACH for one, within scanBudget's time). A column read for
// one is stored for all viewers of that store, and the version of its region bumps, so every viewer near it redraws.
// Which columns a viewer needs (the plan, kept and resumed tick after tick): walking or standing, the list their
// radar made of what its picture misses when it was last built (radarOf: nothing extra to work out; exact near-field
// columns only once they stop); moving fast, that list alternating with the ground ahead (aheadPicks: the radar's
// whole reach around the point `lead` blocks ahead; at most PLAN_EACH_TICK viewers a tick, not sooner than
// PLAN_MIN_AGE ticks after their last plan). A viewer is
// checked right after their radar was built or when they move fast (planNow), else every PLAN_EVERY ticks
// (the roof probe, reads that failed).
const SCAN_TOTAL = 48;
const SCAN_EACH = 24;
/** The scanner's time: planning checks and reads (a read is one native block query or ray, ~0.1 ms). */
const scanBudget = new LabBudget(EXP.scanMs,EXP.scanMs,EXP.scanMs);
// Bounded per-tick experiment admission replaces the episode controller.
const featureEnvelope = new LabEnvelope();
/** What one read took lately (ms), to fit the reads to the time left. */
let readCost = 0.06;
let readMsSum = 0;
let readOpsSum = 0;
const SCAN_MAX_AGE = 2400;
const PLAN_EACH_TICK = 2;
const PLAN_EVERY = EXP.checkEvery;
/** Viewers to check first: their radar was just built (a new list of what it misses) or they move fast. @type {Set<string>} */
const planNow = new Set();
/** Viewers whose reads failed (unloaded chunks), and when to check them again. @type {Map<string, number>} */
const retryAt = new Map();
/** Where each viewer was at their last check (their speed when the game reports none, as for a teleporting flier). @type {Map<string, { x: number, z: number, tick: number }>} */
const lastPose = new Map();
const PLAN_MIN_AGE = 4;
/** Columns kept per store at least, and per viewer of it (40 viewers spread out need more than the minimum). */
const STORE_MIN = 6000;
const STORE_PER_VIEWER = 1200;
/** @typedef {{x:number,z:number,radius:number}} TerrainViewerSnapshot */
/** @typedef {{ id: string, player: Player, store: import("./terrain.js").Store, picks: import("./terrain.js").Pick[], dim: import("@minecraft/server").Dimension, py: number, at: number, pos: number, missed: number, missRun: number, viewer?: TerrainViewerSnapshot, manualOwner?: string, rangeDeleted?: Set<import("./terrain.js").Pick>, failed?: Map<string, import("./terrain.js").Pick>, x: number, z: number }} ScanPlan */
/** Per player: the plan being read, resumed every tick. @type {Map<string, ScanPlan>} */
const scanPlans = new Map();
/** How many viewers may still be planned again this tick (set by the scanner each tick). */
const planTurn = { left: PLAN_EACH_TICK, made: 0 };
let scanReads = 0;
let scanTicks = 0;
let scanMs = 0;
let scanFirst = 0;
let scanPeak = 0;
let scanEachPeak = 0;
/** Of scanMs, the time spent planning (which columns each viewer still needs). */
let scanPlanMs = 0;
const scanQueueCost = scanQueueCounters();

/** The online players by id: kept by playerSpawn and playerLeave, and read from the game again every ROSTER_TICKS (a missed event lasts that long at most). Reading every player each tick cost ~0.04 ms at 40 players (October 2026). @type {Map<string, Player>} */
const roster = new Map();
const ROSTER_TICKS = 100;
let rosterAt = -Infinity;
/** @type {Player[]} */
let playersList = [];
/** The online players, shared by the scanner and the passes (callers don't change the list). */
function playersNow() {
  const tick = system.currentTick;
  if (tick - rosterAt >= ROSTER_TICKS || tick < rosterAt) {
    rosterAt = tick;
    roster.clear();
    for (const p of world.getAllPlayers()) roster.set(idOf(p), p);
    playersList = [...roster.values()];
  }
  return playersList;
}
world.afterEvents.playerSpawn.subscribe(({ player }) => {
  if (roster.get(idOf(player)) === player) return;
  roster.set(idOf(player), player);
  playersList = [...roster.values()];
});

/** @param {ScanPlan} plan @param {boolean} [trustedRoster] @returns {TerrainViewerSnapshot | undefined} */
function terrainViewerOf(plan,trustedRoster=false) {
  try {
    const player = plan.player;
    if(!trustedRoster&&!player.isValid)return undefined;
    const dim = player.dimension;
    if (dim.id !== plan.dim.id) return undefined;
    const pref = prefsOf(player);
    if (!pref.radar || !pref.terrain) return undefined;
    const at = player.location;
    if (plan.store.id.includes("|layer") && netherLayerFor(plan.id,at.y) !== plan.py) return undefined;
    return { x: at.x, z: at.z, radius: pref.revealRadius };
  } catch {
    return undefined;
  }
}

/** @param {TerrainViewerSnapshot | undefined} viewer @param {import("./terrain.js").Pick} pick */
function terrainPickInRange(viewer, pick) {
  if (!viewer) return false;
  const dx = pick.wx - viewer.x;
  const dz = pick.wz - viewer.z;
  return dx * dx + dz * dz <= viewer.radius * viewer.radius;
}

/** A shared miss is not a successful completion: preserve this consumer ticket age and exact retry.
 * @param {ScanPlan} plan @param {import("./terrain.js").Pick} pick @param {number} missedAt */
function observeCoolingSkip(plan,pick,missedAt){
 if(plan.manualOwner)return;const store=pick.store??plan.store,key=store.id+"|"+pick.key,history=plan.failed??=new Map(),prior=history.get(key);
 if(!prior&&history.size>=4096){const first=history.keys().next().value;if(first!==undefined)history.delete(first);scanQueueCost.historyRetired++;}
 history.set(key,{...pick,queuedAt:Math.min(prior?.queuedAt??Infinity,pick.queuedAt??plan.at)});scanQueueCost.failedPeak=Math.max(scanQueueCost.failedPeak,history.size);
 const deadline=missedAt+MISS_RETRY,state=labPlans.get(plan.id);if(state)state.retryDeadline=Math.min(state.retryDeadline??Infinity,deadline);const previous=retryAt.get(plan.id);if(previous===undefined||deadline<previous)retryAt.set(plan.id,deadline);
}

/** A single charged operation on the globally shared reader map. Auto and manual call this same function.
 * @param {ScanPlan} plan @param {import("./terrain.js").Pick} pick @param {number} now @returns {import("./manual-scanner.js").StepResult} */
function dispatchTerrainRead(plan,pick,now){
      if (!terrainPickInRange(plan.viewer, pick)) return "canceled";
      const store = pick.store ?? plan.store;
      const key = `${store.id}|${pick.key}`;
      try {
        scanReads++;
        scanQueueCost.nativeAttempt++;
        if (pick.resolution === PREVIEW) previewCost.nativeReads++;
        let job = pendingTerrain.get(key);
        if (!job) {
          const reader = readColumn(plan.dim, pick.wx, pick.wz, store.id.includes("|surface") ? undefined : plan.py, experimentNative());
          job = { reader, next: reader.next(), tick: now, manualOwner:plan.manualOwner, automatic:!plan.manualOwner };
          pendingTerrain.set(key, job);
        }
        if(!plan.manualOwner)job.automatic=true;
        const next = job.reader.next(job.next.value());
        job.tick = now;
        if (!next.done) {
          scanQueueCost.nativeContinuation++;
          job.next = next;
          return "continued";
        }
        if (pendingTerrain.get(key) !== job || terrain.stores.get(store.id) !== store) { if (pendingTerrain.get(key) === job) pendingTerrain.delete(key); return "canceled"; } // A targeted mutation or profile transition canceled this exact reader.
        if(plan.manualOwner&&manualScans.contexts.get(plan.manualOwner)?.plan!==plan&&!job.automatic){if(pendingTerrain.get(key)===job)pendingTerrain.delete(key);return "canceled";}
        terrain.put(store, pick.wx, pick.wz, next.value, now, pick.resolution);
        const committed=(pick.resolution===PREVIEW?store.preview:store.cols).get(pick.key);
        if(!committed||committed.tick!==now){pendingTerrain.delete(key);return "capacity";}
        scanQueueCost.nativePuts++;
        if (pick.resolution === COL || pick.resolution === PREVIEW) {
          const x = sampleCoord(pick.wx, pick.resolution), z = sampleCoord(pick.wz, pick.resolution);
          const actual = store.cols.get(colKey(x, z, COL));
          if (actual?.tick === now) {
            actual.acquiredAtMs = Date.now();
            detailCost.nativeCompleted++;
            labSaveSample(store, x, z, next.value, actual.acquiredAtMs);
          }
        }
        if (pick.resolution === PREVIEW) {
          previewCost.nativeFills++;
          // Only a completed actual native preview sample may dirty a saved page. Hydration never comes here.
          const actual = store.preview.get(pick.key);
          if (actual?.tick === now && actual.glyph === previewGlyph(next.value)) {
            // Legacy preview pages are read-only in v2; completed genuine2 is persisted above.
          }
        }
        pendingTerrain.delete(key);
        plan.failed?.delete(key);
        scanQueueCost.nativeSuccess++;
        plan.missRun = 0;
      } catch (error) {
        // unloaded chunk: keep what was known, ask again in a few ticks
        pendingTerrain.delete(key);
        const history = plan.failed ??= new Map();
        if (!history.has(key) && history.size >= 4096) {
          const oldest = history.keys().next().value;
          if (oldest !== undefined) history.delete(oldest);
          scanQueueCost.historyRetired++;
        }
        history.set(key, pick);
        scanQueueCost.failedPeak = Math.max(scanQueueCost.failedPeak, history.size);
        terrain.miss(store, pick.wx, pick.wz, now, pick.resolution);
        scanQueueCost.nativeMiss++;
        plan.missed++;
        // Several in a row: the area isn't loaded (a teleport, a join). Stop here and try the whole plan again in
        // MISS_RETRY ticks, instead of spending the budget on reads that fail.
        // Preview anchors can straddle unloaded chunks; their misses must not discard queued 2-block detail.
        if(!plan.manualOwner){const deadline=now+MISS_RETRY,state=labPlans.get(plan.id);if(state)state.retryDeadline=Math.min(state.retryDeadline??Infinity,deadline);const pending=retryAt.get(plan.id);if(pending===undefined||deadline<pending)retryAt.set(plan.id,deadline);}
        plan.missRun++; // Each unloaded anchor cools independently; retain the loaded remainder.
        const name=error&&typeof error==="object"&&"name" in error?String(error.name):"";
        return error instanceof TerrainUnavailableError||name==="LocationInUnloadedChunkError"?"unavailable":"failed";
      }

      return "mapped";
}
const manualScans=new ManualScanner({
 terrain,profile:()=>experimentNative()?"native":"material",maxRadius:()=>MANUAL_SCAN_MAX_RADIUS,players:playersNow,
 visible:p=>get("enabled")===true&&prefsOf(p).radar&&prefsOf(p).terrain,
 snapshot:p=>{const at=p.location,dim=p.dimension,py=dim.id==="minecraft:nether"?netherLayerFor(p.id,at.y):Math.floor(at.y);return{dim,py,store:terrain.store(dim.id,dim.id==="minecraft:nether"?py:undefined)};},
 pending:pendingTerrain,step:dispatchTerrainRead
});
function scanFrame() {
  const t0 = Date.now();
  let scanDeadline=t0+Math.max(0,Math.min(EXP.scanMs,featureEnvelope.room-EXP.renderReserve));
  let scanExpired=false;
  const scanTimeLeft=()=>{if(scanExpired)return false;if(Date.now()<scanDeadline)return true;scanExpired=true;return false;};
  const enabled=get("enabled")===true;
  if (!enabled&&!manualScans.contexts.size) return;
  const readsAtEntry=scanReads;
  const now = system.currentTick;
  scanBudget.tick();
  scanDeadline=Math.min(scanDeadline,t0+scanBudget.room);
  const all = playersNow();
  const candidates = all.filter((player) => {
    const pref = prefsOf(player);
    return enabled && pref.radar && pref.terrain;
  });
  const candidateIds = new Set(candidates.map((player) => idOf(player)));
  for (const [id] of scanPlans) {
    if (candidateIds.has(id)) continue;
    scanPlans.delete(id);
    playerStore.delete(id);
    retryAt.delete(id);
    lastPose.delete(id);
    planNow.delete(id);
  }
  planTurn.left = PLAN_EACH_TICK;
  // Each viewer is checked (moved, turned, or a new list from their radar) every PLAN_EVERY ticks, a share of
  // them each tick, taking turns; the plans in between are read from where they stopped.
  const n = candidates.length;
  const checks = Math.min(n, Math.max(1, Math.ceil(n / PLAN_EVERY)));
  for (const [id, at] of retryAt) {
    if (!candidateIds.has(id)) {
      retryAt.delete(id);
      continue;
    }
    if (at > now) continue;
    retryAt.delete(id);
    planNow.add(id);
  }
  const tPlans = Date.now();
  scanQueueCost.candidateRetryMs += tPlans - t0;
  const indexPlanNow = planNow.size > 1;
  /** @type {Map<string, Player> | undefined} */
  let playersById;
  for (const id of planNow) {
    if(!scanBudget.ok||!scanTimeLeft())break;
    planNow.delete(id);
    if (!candidateIds.has(id)) continue;
    let player;
    if (indexPlanNow) {
      if (!playersById) {
        playersById = new Map();
        for (const online of candidates) playersById.set(idOf(online), online);
      }
      player = playersById.get(id);
    } else player = candidates.find((p) => idOf(p) === id);
    if (!player) continue;
    const t = Date.now();
    try {
      planFor(player, now,true);
    } catch {
      // unloaded chunk or player left
    }
    const charged = Date.now() - t;
    scanBudget.spend(charged);
    scanQueueCost.chargedMs += charged;
  }
  let checked = 0;
  for (; checked < checks && scanBudget.ok && scanTimeLeft(); checked++) {
    const t = Date.now();
    try {
      const p = candidates[(checked + scanFirst) % n];
      if (!planIdle(idOf(p), now)) planFor(p, now,true);
    } catch {
      // unloaded chunk or player left
    }
    const charged = Date.now() - t;
    scanBudget.spend(charged);
    scanQueueCost.chargedMs += charged;
  }
  if (n) scanFirst = (scanFirst + checked) % n;
  const tViewer = Date.now();
  scanQueueCost.planForMs += tViewer - tPlans;
  /** @type {ScanPlan[]} */
  const plans = [];
  const operationLimit = EXP.ops;
  const allowance = Math.max(0, Math.min(scanBudget.room, scanDeadline-Date.now()));
  // Count actual dispatch operations and check real elapsed time between them.
  // Reserve retry-buffer space before a completion can be produced.
  const total = allowance > 0 ? Math.min(operationLimit, EXP.persistence ? Math.max(0, LAB_SAVE_LIMIT - labPendingWrites.size) : operationLimit) : 0;
  /** Eligibility values never survive this scanner invocation, even when called twice in one tick. @type {Set<ScanPlan>} */
  const checkedViewers = new Set();
  /** @type {(plan: ScanPlan, pick: import("./terrain.js").Pick) => boolean} */
  const admit = (plan, pick) => {
    if (!checkedViewers.has(plan)) {
      checkedViewers.add(plan);
      scanQueueCost.viewerChecks++;
      plan.viewer = terrainViewerOf(plan,true);
      if (!plan.viewer) {
        // Invalid/off/dimension/layer plans lose only their unattempted tail, in O(1).
        scanQueueCost.invalidPlans++;
        plan.picks.length = plan.pos;
        return false;
      }
    }
    scanQueueCost.admissionVisited++;
    if (terrainPickInRange(plan.viewer, pick)) return true;
    // A lazy range deletion is NOT a native miss. Keep it out of future failed-history merges.
    (plan.rangeDeleted ??= new Set()).add(pick);
    scanQueueCost.rangeSkips++;
    return false;
  };
  let remaining = 0,pruneInspections=0;
  for (const plan of scanPlans.values()) {
    if (plan.pos >= plan.picks.length) continue;
    remaining += plan.picks.length - plan.pos;
    if(total<=0||!scanTimeLeft()){scanQueueCost.deferredPlans++;continue;}
    // Peek only the first eligible frontier, not the whole moving tail. Empty frontiers must be excluded BEFORE
    // now % plans.length so Queue's exact viewer rotation/order is retained. Later picks are admitted lazily.
    while (plan.pos < plan.picks.length && ((pruneInspections++%16)!==0||scanTimeLeft()) && !admit(plan, plan.picks[plan.pos])) {
      if (plan.pos < plan.picks.length) plan.pos++;
    }
    if (plan.pos < plan.picks.length&&scanTimeLeft()) plans.push(plan);
  }
  scanQueueCost.remainingPeak = Math.max(scanQueueCost.remainingPeak, remaining);
  manualScans.synchronize(all,now,true);
  let tCleanup = Date.now();
  scanQueueCost.viewerPruneMs += tCleanup - tViewer;
  scanPlanMs += Date.now() - t0;
  if (plans.length && total > 0) {
    const tRead = Date.now();
    const readsBefore = scanReads;
    const eachLimit = operationLimit; // One shared round-robin ledger: unused viewer shares remain available globally.
    const spent = spendBudget(plans, total, eachLimit, now % plans.length, now, (plan,pick)=>dispatchTerrainRead(plan,pick,now)!=="continued", scanQueueCost, admit, scanTimeLeft, (plan, pick) => {
      const store = pick.store ?? plan.store;
      if(!terrain.makeRoom(store,pick.wx,pick.wz,pick.resolution===PREVIEW?COL:(pick.resolution??COL),now))return "defer";
      if(pick.resolution!==COL)return undefined;
      const current=store.cols.get(pick.key);
      if(current&&current.valid!==false&&now-current.tick<=SCAN_MAX_AGE&&(!pick.stale||current.tick>=(pick.since??now)))return "known";
      if(pick.stale)return undefined;
      if (detailHydrationBlocked || !detailPersistence.ready) return undefined;
      const cached = detailPersistence.lookup(store.id, pick.wx, pick.wz, Date.now());
      if (cached.state === "known") {
        return "defer"; // Replay quota exhausted; known disk data must not turn into duplicate Native work.
      }
      if (cached.state === "pending" && now - (pick.queuedAt ?? plan.at) < 10) return "defer";
      return undefined;
    },observeCoolingSkip);
    const tDispatched = Date.now();
    scanQueueCost.dispatchMs += tDispatched - tCleanup;
    tCleanup = tDispatched;
    let sum = 0;
    for (const v of spent.values()) {
      sum += v;
      if (v > scanEachPeak) scanEachPeak = v;
    }
    if (sum > scanPeak) scanPeak = sum;
    for (const p of plans) {
      if(!scanTimeLeft())break;
      // Native credits may end on the last eligible pick while an out-of-circle tail remains. Drain only
      // consecutive rejected entries with this invocation's cached viewer, before deciding completion/retry.
      while (p.pos < p.picks.length && ((pruneInspections++%16)!==0||scanTimeLeft()) && !admit(p, p.picks[p.pos])) {
        if (p.pos < p.picks.length) p.pos++;
      }
      if (p.pos < p.picks.length) continue;
      if (p.missed && !retryAt.has(p.id)) retryAt.set(p.id, now + MISS_RETRY);
    }
    const took = Date.now() - tRead;
    scanBudget.spend(took);
    scanQueueCost.chargedMs += took;
    // Learn what a read costs from ticks with many of them (a tick's fixed work would inflate a few).
    const ops = scanReads - readsBefore;
    if (ops >= 8) {
      readMsSum += took;
      readOpsSum += ops;
      if (readOpsSum >= 200) {
        readCost = Math.min(0.5, Math.max(0.02, readMsSum / readOpsSum));
        readMsSum /= 2;
        readOpsSum /= 2;
      }
    }
  }
  const manualStarted=Date.now();
  manualScans.tick(now,Math.max(0,EXP.ops-(scanReads-readsAtEntry)),()=>scanBudget.room>0&&scanTimeLeft(),plans.some(p=>p.pos<p.picks.length));
  scanBudget.spend(Date.now()-manualStarted);
  for (const [key, job] of pendingTerrain) if (now - job.tick > 20) pendingTerrain.delete(key);
  const tEnd = Date.now();
  scanQueueCost.cleanupMs += tEnd - tCleanup;
  scanQueueCost.envelopeMs += tEnd - t0;
  scanQueueCost.ticks++;
  scanMs += tEnd - t0;
  scanTicks++;
}
system.runInterval(() => { const started = featureEnvelope.begin(system.currentTick); try { scanFrame(); } finally { featureEnvelope.end(started); } }, 1);
/** Blocks a viewer moves before the rotating check plans them again (their own radar asks sooner when it needs land). */
const IDLE_MOVE = 16;
/**
 * Can the rotating check skip this viewer (no game reads)? They haven't moved IDLE_MOVE blocks (a chunk), changed height
 * or dimension since their plan was made (their last draw says where they are), their radar listed nothing newer and
 * their roof probe isn't due. A plan still being read goes on being read as it is; one whose reads failed is asked again
 * by retryAt, a radar's new list by planNow, a fast mover by the turn check (planNow).
 * @param {string} id @param {import("./terrain.js").Store} store @param {{x:number,z:number}} at @param {number} radius
 */
function requestDetailFootprint(id, store, at, radius) {
  if (!EXP.persistence) return;
  const x0 = Math.floor((at.x - radius) / 64), x1 = Math.floor((at.x + radius) / 64);
  const z0 = Math.floor((at.z - radius) / 64), z1 = Math.floor((at.z + radius) / 64);
  const key = store.id + "|" + detailPersistence.profile + "|" + x0 + "|" + x1 + "|" + z0 + "|" + z1;
  if (detailFootprints.get(id) === key) return;
  detailFootprints.set(id, key);
  for (let px = x0; px <= x1; px++) for (let pz = z0; pz <= z1; pz++) {
    detailPersistence.lookup(store.id, px * 64 + 1, pz * 64 + 1, Date.now());
    previewPersistence.request(store.id, px * 64 + 3, pz * 64 + 3);
  }
}
const detailFootprints = new Map();

/** Independent of raster construction: scanning can begin before the first HUD frame. */
/** @param {string} _id @param {number} _now */
function planIdle(_id, _now) { return false; }

/** @param {Player} player @param {number} now @param {boolean} [trustedRoster] */
function planFor(player, now,trustedRoster=false) {
  if(!trustedRoster&&!player.isValid)return undefined;
  const pr = prefsOf(player);
  if (!pr.radar || !pr.terrain) { labPlans.delete(idOf(player)); scanPlans.delete(idOf(player)); playerStore.delete(idOf(player)); return undefined; }
  const at = player.location, dim = player.dimension;
  const py = dim.id === "minecraft:nether" ? netherLayerFor(idOf(player),at.y) : Math.floor(at.y);
  const store = terrain.store(dim.id, dim.id === "minecraft:nether" ? py : undefined);
  playerStore.set(idOf(player), store);
  requestDetailFootprint(idOf(player), store, at, pr.revealRadius);
  const old = scanPlans.get(idOf(player)), state = labPlans.get(idOf(player));
  const same = !!old && old.store === store;
  const geometryKey = store.id + "|" + Math.round(at.x) + "|" + Math.round(at.z) + "|" + pr.radarRadius;
  let version="";
  const sameFootprint = state && state.key === geometryKey && state.x === at.x && state.z === at.z;
  if(same&&state&&!sameFootprint&&EXP.rolling===true&&!EXP.preview&&state.readRadius===pr.revealRadius&&state.geometry.radius===pr.radarRadius&&state.demandVersion===store.demandVer&&now<(state.freshUntil??0)&&(state.retryDeadline===undefined||now<state.retryDeadline)&&!EXP.persistence&&Number.isFinite(state.freshUntil)&&(at.x-state.x)**2+(at.z-state.z)**2<=(pr.revealRadius*.75)**2){
    const geometry=northUpRadarGeometry(store.id,Math.round(at.x),Math.round(at.z),pr.radarRadius,R,state.geometry);
    const rerank=now>=(state.reorderAt??Infinity);
    const rolled=rollTerrainDemand({store,picks:old.picks,pos:old.pos,at:old.at,previous:{x:state.x,z:state.z},current:at,radius:pr.revealRadius,geometry,now,maxAge:SCAN_MAX_AGE,missRetry:MISS_RETRY,failed:old.failed,rerank});
    if(rolled){old.picks=rolled.picks;old.pos=0;old.x=at.x;old.z=at.z;old.dim=dim;old.py=py;old.viewer=undefined;old.rangeDeleted=undefined;
      state.key=geometryKey;state.geometry=geometry;state.x=at.x;state.z=at.z;state.version=terrainVerOf(idOf(player),dim.id,at,pr.radarRadius);state.storeVersion=store.ver;state.freshUntil=Math.min(state.freshUntil??Infinity,rolled.nextFresh);
      if(rerank)state.reorderAt=now+80;if(rolled.nextRetry<Infinity){state.retryDeadline=Math.min(state.retryDeadline??Infinity,rolled.nextRetry);retryAt.set(idOf(player),Math.min(retryAt.get(idOf(player))??Infinity,rolled.nextRetry));}
      labStats.rolled++;labStats.rollTail+=rolled.stats.tailVisited;labStats.rollEntered+=rolled.stats.entered;labStats.rollRawChecks+=rolled.stats.rawChecks;planTurn.made++;return old;
    }
  }
  if(same&&sameFootprint&&(state.retryDeadline===undefined||now<state.retryDeadline)){
    const complete=old.pos>=old.picks.length;
    if(!complete&&now<(state.freshUntil??0)&&state.demandVersion===store.demandVer&&(!EXP.persistence||state.storeVersion===store.ver)){
      if(now>=(state.reorderAt??Infinity)){old.picks=labOrder(old.picks.slice(old.pos).map(p=>({...p,d:(p.wx-at.x)**2+(p.wz-at.z)**2,stale:p.stale===true,queuedAt:p.queuedAt??old.at,visible:"visible" in p?p.visible!==false:undefined})),now);old.pos=0;state.reorderAt=now+80;}
      return old;
    }
    // Any drained nonempty queue must be verified once: same-color renewals do not bump visual versions.
    if(complete&&old.picks.length===0&&now<(state.freshUntil??0)){
      if(state.storeVersion===store.ver)return old;
      version=terrainVerOf(idOf(player),dim.id,at,pr.radarRadius);
      if(state.version===version){state.storeVersion=store.ver;return old;}
    }
  }
  version ||= terrainVerOf(idOf(player),dim.id,at,pr.radarRadius);
  const geometry = state?.key === geometryKey ? state.geometry : northUpRadarGeometry(store.id, Math.round(at.x), Math.round(at.z), pr.radarRadius, R,state?.geometry);
  const footprintKey=[store.id,pr.revealRadius,sampleCoord(at.x-pr.revealRadius,COL),sampleCoord(at.x+pr.revealRadius,COL),sampleCoord(at.z-pr.revealRadius,COL),sampleCoord(at.z+pr.revealRadius,COL)].join("|");
  const anchors=state?.footprintKey===footprintKey&&state.anchors?state.anchors:circleCandidates(at,pr.revealRadius,sampleCoord,colKey).anchors;
  const ages = new Map();
  if (same) for (let i = old.pos; i < old.picks.length; i++) ages.set(old.picks[i].key, old.picks[i].queuedAt ?? old.at);
  if(same)for(const pick of old.failed?.values()??[]){const identity=pick.key;ages.set(identity,Math.min(ages.get(identity)??Infinity,pick.queuedAt??old.at));}
  /** @type {LabPick[]} */ const picks=[];
  const seenKeys=new Set();
  let nextRetry = Infinity,nextRefresh=Infinity;
  const add = (/** @type {number} */ key, /** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ resolution, visible=false) => {
    const identity = key; // colKey already encodes a disjoint resolution domain; never coerce to32bit.
    if (key < 0 || seenKeys.has(identity)) return;
    const d = (x - at.x) ** 2 + (z - at.z) ** 2;
    if (d > pr.revealRadius * pr.revealRadius) return;
    seenKeys.add(identity);
    const sample = (resolution === PREVIEW ? store.preview : store.cols).get(key);
    const valid = !!sample && (!("valid" in sample) || sample.valid !== false);
    if(valid&&now-sample.tick<=SCAN_MAX_AGE){nextRefresh=Math.min(nextRefresh,sample.tick+SCAN_MAX_AGE+1);return;}
    const miss = (resolution === PREVIEW ? store.previewMiss : store.miss).get(key);
    if (miss !== undefined && now - miss < MISS_RETRY) { nextRetry = Math.min(nextRetry, miss + MISS_RETRY); return; }
    const stale = valid;
    picks.push({ wx: x, wz: z, key, resolution, d, stale, visible, queuedAt: ages.get(identity) ?? now, since: stale ? now : now - SCAN_MAX_AGE });
  };
  for (const {index:i} of RADAR_PIXELS) {
    add(geometry.coarseKey[i], geometry.coarseX[i], geometry.coarseZ[i], COL,true);
    if (!EXP.preview) continue;
    const c = store.cols.get(geometry.coarseKey[i]);
    // Never cover a tombstone with a preview; only missing detail admits new preview work.
    if (c) continue;
    const x = sampleCoord(geometry.x[i], PREVIEW), z = sampleCoord(geometry.z[i], PREVIEW);
    add(colKey(x, z, PREVIEW), x, z, PREVIEW);
  }
  for(const anchor of anchors)add(anchor.key,anchor.x,anchor.z,COL,false);
  const plan = { id: idOf(player), player, store, picks: labOrder(picks, now), dim, py, x: at.x, z: at.z,
    at: now, pos: 0, missed: 0, missRun: 0, failed: same ? old.failed : undefined };
  scanPlans.set(idOf(player), plan);
  labPlans.set(idOf(player), { key: geometryKey, geometry, x: at.x, z: at.z, version,storeVersion:store.ver,demandVersion:store.demandVer,reorderAt:now+80,freshUntil:Math.min(nextRefresh,now+SCAN_MAX_AGE+1),readRadius:pr.revealRadius,footprintKey,anchors,retryDeadline:nextRetry<Infinity?nextRetry:undefined });
  if (nextRetry < Infinity) retryAt.set(idOf(player), nextRetry);
  planTurn.made++; labStats.planned++;
  return plan;
}

const RADAR_SIZE = 2 * R + 1;
/** The radar text is kept as its pieces, row by row: each row's 21 glyphs, then "\n" (none after the last row). */
const ROW = RADAR_SIZE + 1;
const RADAR_PIECES = RADAR_SIZE * ROW - 1;
const EMPTY_ROWS = /** @type {string[]} */ (Array(RADAR_PIECES).fill("\n"));
for (let r = 0; r < RADAR_SIZE; r++) for (let c = 0; c < RADAR_SIZE; c++) EMPTY_ROWS[r * ROW + c] = insideRadar(c-R,r-R,R)?G.Q_EMPTY:G.Q_OUTSIDE;
/** Marker priorities by piece, all 0 between calls (each call puts back the ones it set). */
const prioBuf = new Float64Array(RADAR_PIECES);
const RADAR_BADGE_CELLS=radarBadgeCells(R);
/** Terrain pictures built so far (each costs about 0.8 ms; the redraw spends REBUILDS_PER_TICK of them a tick). */
let radarRebuilds = 0;
/** Radars drawn from the last one's text (radarSig unchanged), and radars built (radarOf). */
let radarReuses = 0;
let radarBuilds = 0;
/** Whether the last radarOf drew on an out-of-date terrain picture (no time to build it again). */
let radarStale = false;
/** The radar is built again this often anyway, so columns that went stale are found (and read again). */
const STALE_EVERY = 200;
/**
 * Each player's turn within STALE_EVERY (a hash, FNV-1a, of their id), so these rebuilds are spread over the ticks
 * instead of every still player's at once (a wave of 0.8 ms rebuilds every 200 ticks, O10).
 * @param {string} id
 */
function staleSlot(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return h % STALE_EVERY;
}
/**
 * Is this player's STALE_EVERY rebuild due (their turn came since their radar's terrain was last built)? A still
 * player's refresh then builds the radar instead of only drawing the same title again, so stale columns are listed
 * for the scanner and read again. @param {string} id @param {number} now
 */
function staleDue(id, now) {
  const memo = terrainBaseMemo.get(id);
  return !!memo && memo.bucket !== undefined && Math.floor((now + memo.slot) / STALE_EVERY) !== memo.bucket;
}
/** The terrain grid turns in steps of this many degrees and moves in whole blocks (an edge cell moves under a block). */
const TERRAIN_TURN = 2;

/**
 * What a radar built now would depend on, as a string: radarOf's terrain key, the facing to a tenth of a degree and
 * each marker's cell (a marker beyond the edge, by its cell before clamping). The same signature gives the same text.
 * A destination star (its route dots move with every step) gives none: always built.
 * @param {number} heading @param {Marker[]} markers @param {number} radius @param {boolean} north @param {{ x: number, z: number }} at
 * @param {string} dimId @param {boolean} useTerrain @param {string} playerId @param {number} now @returns {string | undefined}
 */
function radarSig(heading, markers, radius, north, at, dimId, useTerrain, playerId, now) {
  const store = useTerrain ? storeFor(playerId, dimId) : undefined;
  const memo = terrainBaseMemo.get(playerId);
  if (!memo) return undefined;
  const th = north ? 0 : Math.round(heading / TERRAIN_TURN) * TERRAIN_TURN;
  let sig = !store ? "empty" : terrainVerOf(playerId, dimId, at, radius) + "|" + Math.round(at.x) + "|" + Math.round(at.z) + "|" + th + "|" + radius + "|" + Math.floor((now + memo.slot) / STALE_EVERY);
  sig += north ? "|north" : "|turn|" + heading;
  sig += "|exact|" + at.x + "|" + at.z+"|profile="+EXP.id+"|estimate="+(EXP.estimateRadiusBlocks??0);
  if (markers.length) sig += "|origin|" + at.x + "|" + at.z;
  // Exact ordered marker inputs preserve collision priorities, route dots and off-map directions.
  for (const m of markers) sig += "|" + m.kind + ":" + m.x + "," + m.z;
  return sig;
}

/**
 * The radar: 21 x 21 cells, the player in the middle, `radius` blocks to the edge; north up or turned so ahead is up.
 * The destination, party mates and online friends beyond the edge sit on it as directional arrows.
 * @param {number} heading @param {Marker[]} markers @param {number} radius @param {boolean} north @param {{ x: number, z: number }} at the player
 * @param {string} [dimId] @param {boolean} [useTerrain] @param {string} [playerId]
 * @param {boolean} [rebuild] false: if the terrain would have to be built again, draw on the last one (no time left; radarStale)
 * @param {number} [now] the tick (stale columns, failed reads)
 * @param {string} [terrainVersion] optional version for this pose
 */
function radarOf(heading, markers, radius, north, at, dimId = OVERWORLD, useTerrain = false, playerId = "", rebuild = true, now = 0, terrainVersion) {
  const h = heading * Math.PI / 180, cos = Math.cos(h), sin = Math.sin(h), cell = radius / R;
  const store = useTerrain ? storeFor(playerId, dimId) : undefined;
  let memo = terrainBaseMemo.get(playerId);
  if (!memo) {
    memo = { key: "", base: EMPTY_ROWS.slice(), rows: EMPTY_ROWS.slice(), touched: [], need: [], needAt: -1, slot: staleSlot(playerId) };
    terrainBaseMemo.set(playerId, memo);
  }
  const { base, rows, touched } = memo;
  const estimateRadius=EXP.estimateRadiusBlocks??0;
  const tx = Math.round(at.x), tz = Math.round(at.z), th = north ? 0 : Math.round(heading / TERRAIN_TURN) * TERRAIN_TURN;
  const bucket = Math.floor((now + memo.slot) / STALE_EVERY);
  // Fractional position affects coverage and markers, not the rounded terrain raster itself.
  const key = !store ? "empty|"+dimId : `${terrainVersion ?? terrainVerOf(playerId, dimId, at, radius)}|${tx}|${tz}|${th}|${radius}|${bucket}|${north ? 1 : 0}|${experimentNative() ? "native" : "material"}` + "|profile=" + EXP.id + "|estimate=" + (EXP.estimateRadiusBlocks??0);
  radarStale = !!store && memo.key !== key && !rebuild;
  if (memo.key !== key && !radarStale) {
    if (!store) {
      for(let i=0;i<RADAR_PIECES;i++)base[i]=EMPTY_ROWS[i];
      for(const{piece}of RADAR_PIXELS)base[piece]=unknownTerrainGlyph(dimId);
      memo.coverage = undefined; memo.needStore = undefined;
    } else {
      radarRebuilds++; labStats.rasterBuilds++;
      const geometryKey = `${store.id}|${tx}|${tz}|${th}|${north ? 1 : 0}|${radius}|${R}`;
      let geometry = memo.geometry;
      if (!geometry || geometry.key !== geometryKey) geometry = north ? northUpRadarGeometry(store.id, tx, tz, radius, R, geometry) : radarGeometry(store.id, tx, tz, th, false, radius, R);
      memo.geometry = geometry;
      const count=RADAR_SIZE*RADAR_SIZE;
      const flags=memo.labFlags?.length===count?memo.labFlags:new Uint8Array(count);
      const ticks=memo.labTicks?.length===count?memo.labTicks:new Float64Array(count);
      const heights=memo.labHeights?.length===count?memo.labHeights:new Float32Array(count);
      flags.fill(32);ticks.fill(0);let estimateNeeded=false,estimateSources=0;
      for(const{index:j,piece}of RADAR_PIXELS){
        flags[j]=0;heights[j]=NaN;
        const raw=store.cols.get(geometry.coarseKey[j]),valid=!!raw&&raw.valid!==false;let glyph=unknownTerrainGlyph(dimId);
        if(valid){flags[j]=1|(raw.source==="persisted"?2:0)|(raw.kind==="empty"?4:0);ticks[j]=raw.tick;heights[j]=raw.y;glyph=raw.kind==="empty"?emptyTerrainGlyph(dimId):raw.glyph??glyphAt(terrain,store,geometry.x[j],geometry.z[j],COL);raw.visible=true;if(raw.kind!=="empty"&&now-raw.tick<=SCAN_MAX_AGE)estimateSources++;}
        else if(raw)flags[j]=16;
        else if(EXP.preview&&!detailHydrationBlocked){const pk=colKey(geometry.x[j],geometry.z[j],PREVIEW),preview=store.preview.get(pk);previewCost.queries++;if(preview){flags[j]=8;glyph=preview.glyph;previewCost.hits++;preview.visible=true;}}
        base[piece]=glyph;
        if(estimateRadius>0&&flags[j]===0&&(geometry.coarseX[j]-at.x)**2+(geometry.coarseZ[j]-at.z)**2<=radius*radius)estimateNeeded=true;
      }
      if(estimateNeeded&&estimateSources>=2){const estimate=reconstructRaster({width:RADAR_SIZE,height:RADAR_SIZE,stride:ROW,flags,ticks,heights,base,worldX:geometry.coarseX,worldZ:geometry.coarseZ,origin:at,readRadius:radius,worldRadius:estimateRadius,step:cell,now,maxAge:SCAN_MAX_AGE},estimatedPaletteGlyph,memo.estimateScratch);memo.estimateScratch=estimate.scratch;labStats.estimatedBuilds++;labStats.estimatedCells+=estimate.estimated;labStats.estimateVisited+=estimate.visited;}
      memo.labFlags=flags;memo.labTicks=ticks;memo.labHeights=heights;memo.labBuilt=now;
      memo.needStore = store; memo.bucket = bucket;
    }
    for (let i = 0; i < RADAR_PIECES; i++) rows[i] = base[i];
    memo.key = key;
  } else for (const i of touched) rows[i] = base[i];
  if (store && !radarStale && memo.labFlags && memo.labTicks && memo.geometry) {
    const previous = memo.coverage;
    const signature=memo.key+"|raster="+memo.labBuilt+"|exact="+at.x+"|"+at.z+"|r="+radius;
    const reusable=!!previous&&memo.coverageSignature===signature&&now<(previous.nextExpiry??Infinity);
    const coverage=reusable?previous:labCoverage(memo.geometry,memo.labFlags,memo.labTicks,at,radius,now,SCAN_MAX_AGE);
    if(!reusable)labStats.coveragePasses++;memo.coverageSignature=signature;
    coverage.firstTick = previous?.firstTick ?? now;
    coverage.firstKnownTick = previous?.firstKnownTick ?? (coverage.eligibleKnownCells ? now : undefined);
    coverage.firstCoveredTick = previous?.firstCoveredTick ?? (coverage.eligibleKnownCells === coverage.eligibleCells ? now : undefined);
    coverage.builtTick = memo.labBuilt;
    coverage.frameKey = store.id + "|" + tx + "|" + tz + "|" + th + "|" + radius + "|" + (experimentNative() ? "native" : "material") + "|" + at.x + "|" + at.z + "|circle" + "|profile=" + EXP.id + "|estimate=" + (EXP.estimateRadiusBlocks??0);
    memo.coverage = coverage;
  }
  touched.length = 0;
  if(north)for(const p of RADAR_BADGE_CELLS){const i=(p.z+R)*ROW+p.x+R;prioBuf[i]=100;touched.push(i);}
  /** Screen offset (right, down) of a world offset. @param {number} dx @param {number} dz */
  const screen = (dx, dz) => (north ? [dx, dz] : [dx * cos + dz * sin, -dx * sin + dz * cos]);
  /** @param {number} sx @param {number} sy @param {string} g @param {number} p @param {boolean} clamp @param {string} [kind] */
  const place = (sx, sy, g, p, clamp, kind) => {
    let c = Math.round(sx / cell);
    let r = Math.round(sy / cell);
    let glyph = g;
    if (!insideRadar(c,r,R)) {
      if (!clamp) return;
      const clipped=circularMarker(sx/cell,sy/cell,R);c=clipped.x;r=clipped.z;
      const dirIdx = ((Math.round((Math.atan2(sx, -sy) * 180) / Math.PI / 45) % 8) + 8) % 8;
      if (kind === "star") glyph = STAR_ARR[dirIdx] ?? g;
      else if (kind === "party") glyph = PARTY_ARR[dirIdx] ?? g;
      else if (kind === "other") glyph = FRIEND_ARR[dirIdx] ?? g;
    }
    if (c === 0 && r === 0) return; // the player's own cell
    let idx = (r + R) * ROW + (c + R);
    if (p <= prioBuf[idx]) {
      if (prioBuf[idx] !== 100 || p >= 100) return;
      // A protected direction badge keeps its cell; an edge marker uses the next cell along the same edge.
      const free=circularMarkerNeighbors(c,r,R).find(q=>p>prioBuf[(q.z+R)*ROW+q.x+R]);
      if(!free)return;idx=(free.z+R)*ROW+free.x+R;
    }
    rows[idx] = overlayGlyph(glyph, base[idx]);
    if (!prioBuf[idx]) touched.push(idx);
    prioBuf[idx] = p;
  };
  // Legacy turned-map helper calls retain their in-grid compass; live preferences are always north-up and use fixed UI overlays.
  if (!north) {
    for (const [dx, dz, g] of /** @type {[number, number, string][]} */ ([
      [0, -radius * 2, G.Q_NORTH],
      [radius * 2, 0, G.Q_EAST],
      [0, radius * 2, G.Q_SOUTH],
      [-radius * 2, 0, G.Q_WEST],
    ])) {
      const [sx, sy] = screen(dx, dz);
      place(sx, sy, g, 100, true);
    }
  }
  const star = markers.find((m) => m.kind === "star");
  if (star) {
    const [sx, sy] = screen(star.x - at.x, star.z - at.z);
    const d = Math.hypot(sx, sy);
    if (d > 0) {
      for (const step of [2, 4, 6, 8]) {
        if (step * cell >= d - cell * 0.5) break;
        place((sx / d) * step * cell, (sy / d) * step * cell, G.Q_ROUTE, 2, false);
      }
    }
  }
  for (const m of markers) {
    const k = KINDS[m.kind];
    if (!k) continue;
    const dx = m.x - at.x;
    const dz = m.z - at.z;
    const [sx, sy] = screen(dx, dz);
    place(sx, sy, k.q, 10 + k.p - Math.min(dx * dx + dz * dz, 998001) / 998002, m.kind === "star" || m.kind === "party" || m.kind === "other" || m.kind === "rainbow" || m.kind === "champ", m.kind);
  }
  if (!north) {
    rows[R * ROW + R] = overlayGlyph(YOU[0], base[R * ROW + R]);
    touched.push(R * ROW + R);
  }
  for (const i of touched) prioBuf[i] = 0;
  return rows.join("");
}

/** The last second lines built, by their parts (they rarely change). @type {Map<string, string>} */
const line2Memo = new Map();
/** The strip's second line: the destination (or Arrived), then the region. @param {string} region @param {string} dest */
function line2(region, dest) {
  const k = `${region}|${dest}`;
  const hit = line2Memo.get(k);
  if (hit !== undefined) return hit;
  if (line2Memo.size > 200) line2Memo.clear();
  const out = line2Of(region, dest);
  line2Memo.set(k, out);
  return out;
}
/** Plain text of at most `max` characters, cut at a word with "..." (never mid-name). @param {string} text @param {number} max */
function cutWords(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 3);
  const at = cut.lastIndexOf(" ");
  return `${(at > max / 2 ? cut.slice(0, at) : cut).replace(/[\s,:;-]+$/, "")}...`;
}
/** @param {string} region @param {string} dest */
function line2Of(region, dest) {
  const gap = dest && region ? "  " : "";
  const room = LINE2_BYTES - bytes(dest) - bytes(gap) - 2;
  return fit(`${dest}${gap}${region ? `§7${fit(region, Math.max(0, room))}` : ""}`, LINE2_BYTES);
}

/**
 * What the last pass found for a player, so the strip and radar can turn with them every tick in between: the
 * markers, the second line, which parts show, and the heading and place they were last drawn for.
 * `shown` and `shownSecond`: the markers and second line it was last drawn with (a pass that finds the same draws nothing).
 * @typedef {{ player: Player, markers: Marker[], second: string, compass: boolean, radar: boolean, radius: number, north: boolean, terrain: boolean, dest?: string, target?: Spot, dim: string, px: number, pz: number, heading: number, x: number, y: number, z: number, tv?: string, drawn?: number, lag?: boolean, fresh?: number, dirty?: boolean, shown?: Marker[], shownSecond?: string, checked?: number,observedX?:number,observedZ?:number, rsig?: string }} View
 */
/** @type {Map<string, View>} */
const views = new Map();
/** @typedef {{tag:string,viewKey:string,tick:number,eligible:number,sampled2:number,live2:number,persisted2:number,validEmpty2:number,estimated2?:number,radarWire:string,x:number,z:number,built?:number}} DetailFrame */
/** @type {Map<string,DetailFrame>} */ const preparedDetailFrames = new Map();
/** @type {Map<string,DetailFrame>} */ const publishedDetailFrames = new Map();
let detailFrameSequence = 0;
/** @param {Player} player @param {DetailFrame | undefined} frame */
function acceptDetailFrame(player, frame) {
  const receipt = side.delivery(player);
  if (residentTrace.active(player.id)) residentTrace.note(player.id,system.currentTick,"publication",!frame?"no_frame":!receipt?"no_receipt":receipt.tag!==frame.tag?"tag_mismatch":"accepted",{tag:frame?.tag??"",receipt:receipt?.tag??"",view:frame?.viewKey??"",...residentTrace.older(system.currentTick,residentTrace.current.x,residentTrace.current.z)});
  if (frame && receipt?.tag === frame.tag) publishedDetailFrames.set(player.id, { ...frame, tick: receipt.tick });
}


/** Markers closer than this (blocks) to where they were drawn count as unmoved: a strip cell is 5 degrees and a radar cell 2.4 blocks or more. */
const MARKER_SLACK = 0.25;
/**
 * Would these markers draw the same as the ones last drawn (same kinds in the same order, none moved MARKER_SLACK)?
 * @param {Marker[] | undefined} a @param {Marker[]} b
 */
function sameMarkers(a, b) {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const m = a[i];
    const n = b[i];
    if (m.kind !== n.kind || m.clamp !== n.clamp || Math.abs(m.x - n.x) >= MARKER_SLACK || Math.abs(m.z - n.z) >= MARKER_SLACK) return false;
  }
  return true;
}

/** 0 = north, clockwise. @param {Player} player */
const headingOf = (player) => (((player.getRotation().y + 180) % 360) + 360) % 360;

/** @param {Player} player */
function hidePlayerHud(player) {
  const id = player.id;
  labPlans.delete(id); detailFootprints.delete(id);
  views.delete(id);
  preparedDetailFrames.delete(id); publishedDetailFrames.delete(id);
  lastText.delete(id);
  planNow.delete(id);
  scanPlans.delete(id);
  retryAt.delete(id);
  playerStore.delete(id);
  lastPose.delete(id);
  if (lastSent.has(id)) {
    side.clear(player, "", false);
    side.clear(player, "radar", false);
    side.redraw(player);
    lastSent.delete(id);
  }
}

/** @param {Player} player @param {Player[]} all @param {Seen[]} seen @param {number} now */
function pass(player, all, seen, now) {
  const pr = prefsOf(player);
  const on = get("enabled") === true;
  const showCompass = on && pr.compass;
  const showRadar = on && pr.radar;
  if (!showCompass && !showRadar) {
    hidePlayerHud(player);
    if (on) arrival(player, destination(player, all, new Map()));
    return;
  }
  const t0 = Date.now();
  const { markers, liveFolk } = gather(player, seen, pr);
  const dest = destination(player, all, liveFolk);
  const reached = arrival(player, dest);
  let destText = "";
  const done = arrived.get(idOf(player));
  if (reached || (done && done[1] > now)) destText = `${G.I_CHECK}§a Arrived: ${(reached ?? /** @type {[string, number]} */ (done))[0]}`;
  else if (dest?.off) destText = `§7${dest.off}`;
  else if (dest?.spot) {
    const s = dest.spot;
    // Names are plain ASCII already (spotOf, plain): cut at a word, with "...", when too long for the line.
    const label = cutWords(s.n || "Destination", 40);
    if (s.dim !== player.dimension.id) destText = `${G.I_STAR}§f ${label} §7(in ${DIM_NAMES[s.dim] ?? "another dimension"})`;
    else {
      const x = s.x + 0.5;
      const z = s.z + 0.5;
      markers.push({ kind: "star", x, z, clamp: true });
      destText = `${G.I_STAR}§f ${label} §7${Math.round(Math.hypot(x - player.location.x, z - player.location.z))}m`;
    }
  }
  const dimId = player.dimension.id;
  const region = dimId === OVERWORLD ? regions.get(idOf(player)) ?? "" : `In ${DIM_NAMES[dimId] ?? "another dimension"}`;
  /** @type {View} */
  const view = { player, markers, second: showCompass ? line2(region, destText) : "", compass: showCompass, radar: showRadar, radius: pr.radarRadius, north: pr.north, terrain: pr.terrain, dest: dest?.spot?.n, target: dest?.spot, dim: player.dimension.id, px: player.location.x, pz: player.location.z, heading: 0, x: 0, y: 0, z: 0 };
  const old = views.get(idOf(player));
  const same = !!old && old.dim === view.dim;
  if (same) Object.assign(view, { heading: old.heading, x: old.x, y: old.y, z: old.z, tv: old.tv, drawn: old.drawn, fresh: old.fresh, shown: old.shown, shownSecond: old.shownSecond, rsig: old.rsig, lag: old.lag, checked: old.checked,observedX:old.observedX,observedZ:old.observedZ });
  // Drawn by the per-tick redraw, within its budget (next tick unless many players are waiting), unless the pass found
  // what is already on screen: then only turning, moving, new land or the refresh draws it (a still player's pass
  // costs no strip and radar).
  view.dirty = !same || !!old.dirty || !lastSent.has(idOf(player)) || old.compass !== view.compass || old.radar !== view.radar || old.radius !== view.radius || old.north !== view.north || old.terrain !== view.terrain || view.shownSecond !== view.second || !sameMarkers(view.shown, view.markers);
  views.set(idOf(player), view);
  costMs += Date.now() - t0;
  costPlayers++;
}

/**
 * Draws the strip and radar for where the player faces and stands now, from the last pass's markers. Each part is
 * sent only when its text changed, or with `refresh` when it is REFRESH ticks old (so it never fades); the title
 * is drawn once for both.
 * @param {Player} player @param {View} v @param {number} now @param {boolean} refresh
 * @param {number} [heading] the facing the redraw's check already read (else read here, inside the draw budget) @param {{ x: number, y: number, z: number }} [at] the position it read
 * @returns {boolean} whether anything was sent
 */
function render(player, v, now, refresh, heading = headingOf(player), at = player.location) {
  const id = idOf(player);
  if(residentTrace.active(id))residentTrace.note(id,now,"render","entered",{x:at.x,z:at.z,...residentTrace.older(now,at.x,at.z)});
  if (side.held(player)) { if(residentTrace.active(id))residentTrace.note(id,now,"render","held_entry");v.dirty = true; return false; }
  v.heading = heading;
  v.x = at.x;
  v.y = at.y;
  v.z = at.z;
  v.drawn = now;
  v.dirty = false;
  const strip = v.compass ? stripOf(heading, v.markers, at) : "";
  // The terrain picture is the costly part: built again only while the tick's budget lasts. Without budget the radar
  // keeps its last text (terrain and markers from the same moment) and is due again next tick (`lag`).
  const before = radarRebuilds;
  const tr = Date.now();
  // Nothing on the radar can differ from the last one built (the same terrain picture, facing and marker cells): its
  // text is reused, so walking without anything new in view costs no radar build.
  const sig = v.radar && !refresh && !v.lag ? radarSig(heading, v.markers, v.radius, v.north, at, v.dim, v.terrain, id, now) : undefined;
  const reuse = sig !== undefined && sig === v.rsig ? lastText.get(id)?.radar : undefined;
  if (reuse !== undefined) radarReuses++;
  else if (v.radar) radarBuilds++;
  const terrainMemo=terrainBaseMemo.get(id);
  const wantedGeometry=v.radar&&v.terrain?storeFor(id,v.dim).id+"|"+Math.round(at.x)+"|"+Math.round(at.z)+"|"+(v.north?0:Math.round(heading/TERRAIN_TURN)*TERRAIN_TURN)+"|"+(v.north?1:0)+"|"+v.radius+"|"+R:"empty";
  const allowTerrain=rebuildBudget.ok&&featureEnvelope.room>0&&rasterCadenceReady(terrainMemo?.geometry?.key,wantedGeometry,terrainMemo?.labBuilt,now,EXP.renderTicks);
  if(residentTrace.active(id))residentTrace.note(id,now,"terrain_admission",reuse!==undefined?"body_reuse":!v.radar?"radar_off":!rebuildBudget.ok?"rebuild_budget":!allowTerrain?"four_tick_cadence":"admitted",{x:at.x,z:at.z,budget:rebuildBudget.left,previousBuilt:terrainBaseMemo.get(id)?.coverage?.builtTick??null});
  const radar = reuse ?? (v.radar ? radarOf(heading, v.markers, v.radius, v.north, at, v.dim, v.terrain, id, allowTerrain, now) : "");
  if (reuse === undefined) v.rsig = sig ?? (v.radar && !radarStale ? radarSig(heading, v.markers, v.radius, v.north, at, v.dim, v.terrain, id, now) : undefined);
  const radarWire = v.radar ? `${radar}${SELF_ARROWS[Math.round(heading / 45) % 8]}1` : "";
  const tookRadar = Date.now() - tr;
  if (radarRebuilds > before) {
    if(residentTrace.active(id))residentTrace.note(id,now,"terrain","built",{view:terrainBaseMemo.get(id)?.coverage?.frameKey??"",built:now,x:at.x,z:at.z});
    // Planning is independent of raster arrivals; normal rotation observes movement.
    rebuildBudget.spend(tookRadar);
    drawBudget.spend(-tookRadar); // render() charges its whole time to drawBudget; the rebuild was charged here
  }
  radarMs += tookRadar;
  v.lag = v.radar && reuse === undefined && radarStale;
  if (!v.lag) {
    v.fresh = now;
    // Only a radar showing terrain is drawn again for new land (the redraw's check compares this).
    v.tv = v.radar && v.terrain ? terrainVerOf(id, v.dim, at, v.radius) : undefined;
  }
  // What realm:map_debug reports (kept as references; the pose object is made only when asked).
  let shot = lastText.get(id);
  if (!shot) lastText.set(id, (shot = { strip, line2: v.second, radar, dest: v.dest, target: v.target, at, dim: v.dim, heading, radius: v.radius, north: v.north }));
  else {
    shot.strip = strip;
    shot.line2 = v.second;
    shot.radar = radar;
    shot.dest = v.dest;
    shot.target = v.target;
    shot.at = at;
    shot.dim = v.dim;
    shot.heading = heading;
    shot.radius = v.radius;
    shot.north = v.north;
  }
  const coverage = terrainBaseMemo.get(id)?.coverage;
  const currentViewKey = !v.radar ? "" : storeFor(id, v.dim).id + "|" + Math.round(at.x) + "|" + Math.round(at.z) + "|0|" + v.radius + "|" + (experimentNative() ? "native" : "material") + "|" + at.x + "|" + at.z + "|circle" + "|profile=" + EXP.id + "|estimate=" + (EXP.estimateRadiusBlocks??0);
  /** @type {DetailFrame | undefined} */
  const frame = v.radar && !v.lag && coverage?.frameKey === currentViewKey ? { tag: "d" + now + "_" + (++detailFrameSequence), viewKey: currentViewKey, tick: now, eligible: coverage.eligibleCells, sampled2: coverage.sampled2 ?? 0, live2: coverage.live2 ?? 0, persisted2: coverage.persisted2 ?? 0, validEmpty2: coverage.validEmpty2 ?? 0,estimated2:coverage.eligibleEstimatedCells??0, radarWire, x:at.x,z:at.z,built:coverage.builtTick } : undefined;
  if (frame) preparedDetailFrames.set(id, frame);
  if(residentTrace.active(id)){
    if(frame)residentTrace.frame(frame.tag,{view:frame.viewKey,x:frame.x,z:frame.z,built:frame.built});
    residentTrace.note(id,now,"frame",frame?"prepared":v.lag?"stale_terrain":"frame_key_mismatch",{view:currentViewKey,terrainView:coverage?.frameKey??"",tag:frame?.tag??"",x:at.x,z:at.z,built:coverage?.builtTick??null,...residentTrace.older(now,at.x,at.z)});
  }
  const compassText = v.second ? `${strip}${SPACER}\n${v.second}` : `${strip}${SPACER}`;
  if (side.held(player)) { if(residentTrace.active(id))residentTrace.note(id,now,"render","held_pre_stage");v.dirty = true; return false; }
  // On screen from now (or already): a pass that finds the same markers and line doesn't draw again.
  v.shown = v.markers;
  v.shownSecond = v.second;
  const sent = lastSent.get(id);
  let showC = v.compass && (!sent || !sent.compass || sent.ctext !== compassText || (refresh && now - sent.cat >= REFRESH));
  let showR = v.radar && (!sent || !sent.radar || sent.rtext !== radarWire || (refresh && now - sent.rat >= REFRESH));
  // A part sent anyway takes the other along once that one is half-way to its refresh, so the two stay in step and
  // a still player's refresh is one title, not one per part.
  if (sent && showC && !showR && v.radar && sent.radar && now - sent.rat >= REFRESH / 2) showR = true;
  if (sent && showR && !showC && v.compass && sent.compass && now - sent.cat >= REFRESH / 2) showC = true;
  if (frame && publishedDetailFrames.get(id)?.viewKey !== frame.viewKey) showR = true;
  const offC = !v.compass && !!sent?.compass;
  const offR = !v.radar && !!sent?.radar;
  if (!showC && !showR && !offC && !offR) {
    if(residentTrace.active(id))residentTrace.note(id,now,"submit","no_content_change",{tag:frame?.tag??"",view:currentViewKey});
    const accepted = publishedDetailFrames.get(id);
    // Same accepted frame/store/pose and identical body may acknowledge provenance without another title send.
    if (frame && accepted?.viewKey === frame.viewKey && accepted.radarWire === frame.radarWire) {publishedDetailFrames.set(id, { ...frame, tick: accepted.tick });if(residentTrace.active(id))residentTrace.note(id,now,"publication","identical_body_provenance",{tag:frame.tag,receipt:accepted.tag,view:frame.viewKey});}
    return false;
  }
  const t1 = Date.now();
  if (offC) side.clear(player, "", false);
  if (offR) side.clear(player, "radar", false);
  if(residentTrace.active(id))residentTrace.note(id,now,"submit","stage_show_redraw",{tag:frame?.tag??"",view:currentViewKey,showC,showR});
  if (frame) side.stage(player, frame.tag);
  if (showC) side.show(player, "top", compassText, HOLD, "", false);

  if (showR) side.show(player, "radar", radarWire, HOLD, "radar", false);

  side.redraw(player);
  acceptDetailFrame(player, frame);
  lastSent.set(id, {
    ctext: v.compass ? compassText : "", cat: showC ? now : sent?.cat ?? now,
    rtext: v.radar ? radarWire : "", rat: showR ? now : sent?.rat ?? now,
    compass: v.compass, radar: v.radar,
  });
  drawMs += Date.now() - t1;
  return true;
}

/**
 * The refresh of a player who hasn't turned, moved or got new markers or land since their last draw: their strip and
 * radar would come out the same, so the title they have is drawn again for HOLD more ticks (side.js keep: the
 * compositor reuses the subtitle it made and sends no message).
 * @param {Player} player @param {View} v @param {number} now @returns {boolean} whether it was drawn
 */
function keepAlive(player, v, now) {
  const sent = lastSent.get(idOf(player));
  if (!sent || side.held(player)) return false;
  const t1 = Date.now();
  // One of its parts isn't up any more (it ran out, e.g. during a real title or a late refresh): build and send both
  // again. Keeping only the part still up would stamp the other as sent while it stays off for good.
  /** @type {string[]} */
  const parts = [];
  if (sent.compass) parts.push("");
  if (sent.radar) parts.push("radar");
  if (!side.keep(player, HOLD, parts)) {
    sent.ctext = sent.rtext = "";
    return render(player, v, now, true);
  }
  if (sent.compass) sent.cat = now;
  if (sent.radar) sent.rat = now;
  v.drawn = now;
  drawMs += Date.now() - t1;
  return true;
}

/**
 * Turning by less than this (degrees) or moving less than this (blocks) since the last draw doesn't redraw: a strip
 * cell is 5 degrees and a radar cell 2.4 blocks or more (a marker 20 blocks away moves a cell every ~6 degrees), so
 * smaller steps hardly ever change the text, and building it is the cost.
 */
const TURN_MIN = 2;
const MOVE_MIN = 0.5;
/** Moved farther than this (blocks) since the pass: a teleport, so the markers wait for the next pass. */
const FAR_MOVE = 256;
/**
 * Titles sent per tick at most by the per-tick redraw (the compositor sends no realm:side for them), so with many
 * players turning at once the ones drawn longest ago go first and the rest follow a tick later.
 */
const TURN_BUDGET = 8;
/** Strips and radars built per tick at most (building one whose text didn't change is the cost without the send). */
const RENDER_BUDGET = 10;
/**
 * Players whose turning and moving is checked a tick (all of them up to this many, else taking turns), by budgetLevel
 * (TURN_CHECKS_BY): no more than the drawing budget can draw for, since each check reads the game.
 */
let TURN_CHECKS = 4;
const TURN_CHECKS_BY = /** @type {Record<string, number>} */ ({ low: 3, normal: 4, high: 12 });
/**
 * With more than DRAW_MIN_FROM players drawn, a player's strip and radar are drawn at most every DRAW_MIN ticks for
 * turning or moving (10 a second); with fewer, every tick (the drawing budget has room for them).
 */
const DRAW_MIN = 2;
const DRAW_MIN_FROM = 16;
/** Radars waiting for a terrain picture looked at a tick, besides their turn (LAG_CHECKS). */
const LAG_CHECKS = 2;
let turnFirst = 0;
/**
 * The redraw's time: building strips and radars and sending them (drawBudget), and building a radar's terrain
 * picture again (rebuildBudget, ~1 ms each). With many players moving at once a player's strip comes a few ticks
 * later and their terrain picture lags (it is drawn with the markers of the same moment), instead of the server.
 */
const drawBudget = new LabBudget(EXP.drawMs,EXP.drawMs,EXP.drawMs);
const rebuildBudget = new LabBudget(EXP.rebuildMs,EXP.rebuildMs,EXP.rebuildMs);
let turnMs = 0;
let turnTicks = 0;
let turnDraws = 0;
let turnSends = 0;
/** Sends by the per-tick redraw that refreshed an unchanged part before it faded (not counted in turnSends). */
let refreshSends = 0;
/** Of refreshSends, those that drew the same title again without building the strip and radar (keepAlive). */
let keepSends = 0;
/** Of turnMs, the time spent finding who is due. */
let turnCheckMs = 0;
let radarMs = 0;

// Every tick between passes: the strip and radar turn with the player (the pass, every intervalTicks, finds what's
// around). Only players who turned or moved, or whose land nearby was read, are drawn again, and only a changed
// part is sent; a part REFRESH ticks old is sent again so it never fades.
system.runInterval(() => {
  const featureStarted = featureEnvelope.begin(system.currentTick);
  try {
  drawBudget.tick();
  rebuildBudget.tick();
  if (!views.size) return;
  const t0 = Date.now();
  const now = system.currentTick;
  /**
   * `moved`: turned, moved, a pass, a refresh or new land near them; else only a radar waiting for its terrain. `keep`:
   * only the refresh is due (nothing they see changed), so the title is drawn again as it is (keepAlive). `heading` and
   * `at` are what the check read, so render() doesn't read them again.
   * @type {{ p: Player, v: View, refresh: boolean, moved: boolean, keep: boolean, heading: number | undefined, at: Vector3 }[]}
   */
  const due = [];
  const n = views.size;
  const checks = Math.min(n, TURN_CHECKS);
  const busy = n > DRAW_MIN_FROM;
  let lagChecks = 0;
  let k = -1;
  for (const v of views.values()) {
    k++;
    const p = v.player;
    const id = idOf(p);
    const sent = lastSent.get(id);
    const refresh = !!sent && now - Math.min(sent.compass ? sent.cat : Infinity, sent.radar ? sent.rat : Infinity) >= REFRESH;
    // A new pass, a radar waiting for its terrain or a title about to fade (the refresh: with many players their turn
    // could come after HOLD ran out, O5) is always due; the others are looked at in turns.
    // A radar waiting for its terrain picture is due again only while there is time to build one, and only LAG_CHECKS
    // of them a tick (about one picture fits in a tick's rebuild time): the others wait their turn.
    const lagDue = v.lag && rebuildBudget.ok && lagChecks < LAG_CHECKS;
    if (lagDue) lagChecks++;
    if (!v.dirty && !lagDue && !refresh && (k - turnFirst + n) % n >= checks) {if(residentTrace.active(id))residentTrace.note(id,now,"scheduler","check_rotation");continue;}
    // A player drawn a moment ago waits DRAW_MIN ticks, unless the pass found something new or the title is due.
    if (busy && !v.dirty && !refresh && (now - (v.drawn ?? -Infinity) < DRAW_MIN || now - (v.checked ?? -Infinity) < DRAW_MIN)) {if(residentTrace.active(id))residentTrace.note(id,now,"scheduler","busy_min_age");continue;}
    v.checked = now;
    try {
      // No isValid first: on a handle kept from an earlier tick it makes every read after it several times dearer
      // (BDS 1.26). A player who left is dropped from views by playerLeave; one leaving this tick throws here.
      // Far from where the pass looked (a teleport): wait for the next pass. Another dimension (a portal) drops the view
      // (playerDimensionChange), so the check needn't read it.
      const at = p.location;
      if(residentTrace.active(id))residentTrace.note(id,now,"eligible","pose_observed",{x:at.x,z:at.z,dirty:v.dirty,lag:v.lag,...residentTrace.older(now,at.x,at.z)});
      if (Math.abs(at.x - v.px) + Math.abs(at.z - v.pz) > FAR_MOVE) {if(residentTrace.active(id))residentTrace.note(id,now,"scheduler","far_move");continue;}
      /** @type {number | undefined} read only when a new pass didn't already settle it; render() reads it otherwise, inside the draw budget */
      let heading;
      // A stopped sub-MOVE_MIN drift still needs one exact-pose certificate; do not redraw every moving micron.
      const settledPose=v.observedX===at.x&&v.observedZ===at.z&&(at.x!==v.x||at.z!==v.z);v.observedX=at.x;v.observedZ=at.z;
      const changed = !!v.dirty || settledPose || Math.abs(wrap((heading = headingOf(p)) - v.heading)) >= TURN_MIN || Math.abs(at.x - v.x) + Math.abs(at.y - v.y) + Math.abs(at.z - v.z) >= MOVE_MIN || (v.radar && v.terrain && (v.tv !== terrainVerOf(id, v.dim, at, v.radius) || (refresh && staleDue(id, now))));
      const moved = refresh || changed;
      if (!moved && !v.lag) {if(residentTrace.active(id))residentTrace.note(id,now,"scheduler","unchanged");continue;}
      // Moving fast (flying, riding): the scanner plans ahead for them often.
      if (Math.abs(at.x - v.x) + Math.abs(at.z - v.z) > 0.6 * Math.max(1, now - (v.drawn ?? now))) planNow.add(id);
      due.push({ p, v, refresh, moved, keep: refresh && !changed && !v.lag, heading, at });
    } catch (e) {
      if (p.isValid) console.warn(`[map] turn: ${e}`);
    }
  }
  if (n) turnFirst = (turnFirst + checks) % n;
  turnCheckMs += Date.now() - t0;
  // Titles about to fade first (O5), then the longest-waiting: a lagging radar waits since it was last up to date.
  const waited = (/** @type {View} */ v) => (v.lag ? v.fresh ?? 0 : v.drawn ?? 0);
  if (due.length > 1) due.sort((a, b) => Number(b.refresh) - Number(a.refresh) || waited(a.v) - waited(b.v));
  let sends = 0;
  let built = 0;
  const refreshBefore = refreshSends;
  for (const { p, v, refresh, moved, keep, heading, at } of due) {
    // Out of budget, a title about to fade is still drawn again as it is (cheap: no strip or radar is built), so with
    // many players moving a strip can lag but never goes off; the refreshes come first, so the rest wait.
    const over = sends >= TURN_BUDGET || built >= RENDER_BUDGET || !drawBudget.ok;
    if (over && !refresh) {if(residentTrace.active(idOf(p)))residentTrace.note(idOf(p),now,"scheduler",sends>=TURN_BUDGET?"send_budget":built>=RENDER_BUDGET?"render_budget":"draw_budget",{x:at.x,z:at.z,left:drawBudget.left});break;}
    // A radar waiting for its terrain, with nothing else new, waits for a rebuild in the budget.
    if (!moved && !rebuildBudget.ok) {if(residentTrace.active(idOf(p)))residentTrace.note(idOf(p),now,"scheduler","rebuild_budget",{x:at.x,z:at.z,left:rebuildBudget.left});continue;}
    const tr = Date.now();
    try {
      if(residentTrace.active(idOf(p)))residentTrace.note(idOf(p),now,"scheduler",keep||over?"keep":"render",{x:at.x,z:at.z,left:drawBudget.left,rebuild:rebuildBudget.left});
      if (keep || over) {
        // Nothing they see changed (or no time to build it): the same title again, so it doesn't fade.
        const drawn = v.drawn;
        if (keepAlive(p, v, now)) {
          sends++;
          refreshSends++;
          keepSends++;
        }
        if (!keep) v.drawn = drawn; // still due to be built: it keeps its place in the queue
        drawBudget.spend(Date.now() - tr);
        continue;
      }
      turnDraws++;
      built++;
      if (render(p, v, now, refresh, heading, at)) {
        sends++;
        if (refresh) refreshSends++;
      }
    } catch (e) {
      console.warn(`[map] turn: ${e}`);
    }
    drawBudget.spend(Date.now() - tr);
  }
  turnSends += sends - refreshSends + refreshBefore;
  turnMs += Date.now() - t0;
  turnTicks++;

  } finally { featureEnvelope.end(featureStarted); }
}, 1);

/**
 * A picked destination this close is reached: it clears with a note. The story target never clears here.
 * @param {Player} player @param {ReturnType<typeof destination>} dest
 * @returns {[string, number] | undefined} the "Arrived" note when it happened now
 */
function arrival(player, dest) {
  if (!dest?.picked || !dest.spot) return undefined;
  const reach = Math.max(2, Number(get("arriveDistance")) || 8);
  if (distTo(player, dest.spot) > reach) return undefined;
  const note = /** @type {[string, number]} */ ([plain(dest.spot.n) || "your destination", system.currentTick + ARRIVED_TICKS]);
  arrived.set(player.id, note);
  setWaypoint(player, undefined);
  try {
    player.sendMessage(`§a[Map] Arrived at ${note[0]}. §7Destination cleared.`);
    player.playSound("random.orb", { pitch: 1.2, volume: 0.5 });
  } catch {
    // left
  }
  return note;
}

// The passes: every player gets one every INTERVAL ticks, spread over the ticks in between (at most PASS_EACH a
// tick, the longest-waiting first, so with many players a pass comes a little less often instead of all at once).
// Everyone's place and party (for the others' markers) is looked up once per INTERVAL.
const INTERVAL = Math.max(10, Math.round(Number(CONFIG.intervalTicks) || 10));
const PASS_EACH = 2;
/** The passes' time (two entity searches each, ~0.3-0.4 ms): with more than ~15 players a pass comes less often. */
const passBudget = new Budget(0.2, 4, 2);
/** Player id -> tick of their last pass. @type {Map<string, number>} */
const passAt = new Map();

/**
 * budgetLevel: each budget's [perTick, max, tickMax] (ms), in the order drawing, terrain pictures, passes, scanner.
 * "normal" is about 1 ms a tick in all (the owner's budget for the Minimap): with many players moving, strips and
 * radars come a little later, mob dots and land a few seconds later. "high" is the earlier normal (about 2.9 ms a
 * tick), for a server with time to spare; "low" about 0.7 ms. A title about to fade is drawn again whatever the level.
 */
const BUDGET_LEVELS = /** @type {Record<string, [number, number, number][]>} */ ({
  low: [[0.3, 5, 2], [0.1, 3, 2], [0.14, 3, 2], [0.17, 10, 3]],
  normal: [[0.4, 6, 2], [0.15, 4, 2], [0.2, 4, 2], [0.25, 15, 3]],
  high: [[1, 8, 3], [0.4, 6, 2], [0.5, 6, 2], [1, 30, 4]],
});
const BUDGETS = [drawBudget, rebuildBudget, passBudget, scanBudget];
let budgetLevel = "";
/** Sets the budgets to budgetLevel's share (at load and when an operator changes it). */
function applyBudgetLevel() {
  const level=String(get("budgetLevel"));if(level===budgetLevel)return;budgetLevel=level;
  // Our tested normal profile is authoritative; existing server-size controls still reduce/raise admitted work.
  const factor=level==="low"?0.5:level==="high"?1.25:1;
  for(const[b,ms]of /** @type {[LabBudget,number][]} */ ([[drawBudget,EXP.drawMs],[rebuildBudget,EXP.rebuildMs],[scanBudget,EXP.scanMs]])){
    b.perTick=ms*factor;b.max=ms*factor;b.tickMax=ms*factor;b.left=Math.min(b.left,b.max);
  }
  passBudget.perTick=0.2*factor;passBudget.max=4*factor;passBudget.tickMax=2;passBudget.left=Math.min(passBudget.left,passBudget.max);
  TURN_CHECKS=TURN_CHECKS_BY[level]??EXP.checks;
}

applyBudgetLevel();
world.afterEvents.worldLoad.subscribe(() => applyBudgetLevel()); // a saved level can't be read before the world loads
onChange((key) => {
  if (key === "budgetLevel" || key === "*") applyBudgetLevel();
});
/** @type {Seen[]} */
let seen = [];
let seenAt = -Infinity;
system.runInterval(() => {
  const featureStarted = featureEnvelope.begin(system.currentTick);
  try {
  const now = system.currentTick;
  passBudget.tick();
  const all = playersNow();
  if (!all.length) return;
  if (now - seenAt >= INTERVAL) {
    seenAt = now;
    seen = [];
    for (const p of all) {
      try {
        const l = p.location;
        seen.push({ id: idOf(p), dim: p.dimension.id, x: l.x, z: l.z, party: partyTag(p) });
      } catch {
        // left meanwhile
      }
    }
    costPasses++;
  }
  // Out of time (with many players most ticks are, until the budget fills again): nobody to pick.
  if (!passBudget.ok) return;
  const each = Math.min(PASS_EACH, Math.max(1, Math.ceil(all.length / INTERVAL)));
  const due = oldestDue(all, passAt, now, INTERVAL, each, idOf);
  if (!due.length) return;
  for (const p of due) {
    if (!passBudget.ok) break;
    // The shared list can hold a player who left earlier this tick: no entry for them (playerLeave already ran).
    if (!p.isValid) continue;
    passAt.set(idOf(p), now);
    const t = Date.now();
    try {
      pass(p, all, seen, now);
    } catch (e) {
      console.warn(`[map] ${e}`);
    }
    passBudget.spend(Date.now() - t);
  }

  } finally { featureEnvelope.end(featureStarted); }
}, 1);

// A portal: the view goes until the next pass (it holds the other dimension's markers).
world.afterEvents.playerDimensionChange.subscribe(({ player }) => {
  netherLayers.delete(player.id);
  manualScans.cancel(player.id,"Dimension changed");
  hidePlayerHud(player);
  terrainBaseMemo.delete(player.id);
  detailFootprints.delete(player.id);
  passAt.delete(player.id);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  if (roster.delete(playerId)) playersList = [...roster.values()];
  manualScans.cancel(playerId,"Player left",false);
  labPlans.delete(playerId); detailFootprints.delete(playerId);
  for (const m of [netherLayers, detailFootprints, preparedDetailFrames, publishedDetailFrames, wpCache, marksCache, arrived, prefCache, lastSent, lastText, npcCache, regions, sites, waystones, tracks, deaths, views, terrainBaseMemo, playerStore, scanPlans, passAt, retryAt, lastPose]) m.delete(playerId);
  planNow.delete(playerId);
});

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

/** Shows a form, retrying while the player has chat or another screen open. @param {Player} player @param {ActionFormData | ModalFormData} form @returns {Promise<any>} */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await new Promise((r) => system.runTimeout(() => r(undefined), 20));
  }
  return undefined;
}

/** Gives Mara's Field Map: an empty locator map, named. @param {Player} player */
function giveMap(player) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv || inv.emptySlotsCount === 0) {
    player.sendMessage("§c[Map] Your inventory is full. Make room and run /realm:map again.");
    return;
  }
  /** Slots that hold an unnamed empty map already, so the new one is the one named. */
  const before = new Set();
  for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.typeId === "minecraft:empty_map") before.add(i);
  try {
    player.runCommand("give @s minecraft:empty_map 1 2");
  } catch (e) {
    console.warn(`[map] give: ${e}`);
    player.sendMessage("§c[Map] The map couldn't be given. Try again.");
    return;
  }
  let named = false;
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (!it || it.typeId !== "minecraft:empty_map" || it.nameTag || before.has(i)) continue;
    it.nameTag = "§eMara's Field Map";
    it.setLore(["§7Hold it in your other hand", "§7(offhand) and use it once:", "§7the land and your arrow show", "§7in the corner of your view."]);
    inv.setItem(i, it);
    named = true;
    break;
  }
  if (!named) {
    // It stacked onto empty maps the player already had, so no slot holds it alone to name.
    player.sendMessage("§e[Map] The map was added to your empty maps. §7It works the same: use one once, then hold it in your offhand. For the named Field Map, put your empty maps away and run /realm:map again.");
    return;
  }
  player.sendMessage("§a[Map] Mara's Field Map is in your inventory. §7Use it once to draw the land around you, then hold it in your offhand to keep it in view.");
}

/** Report real accepted-frame provenance separately from scan progress and visual reconstruction. @param {Player} player */
function minimapStatus(player){
 manualScans.status(player);const frame=publishedDetailFrames.get(player.id),estimate=EXP.estimateRadiusBlocks??0;
 const mode=estimate>0?"Marked color estimates up to "+estimate+" world blocks, never stored as actual terrain.":"Sharp: actual sampled terrain only.";
 if(frame&&!side.held(player)&&side.delivery(player))manualScans.send(player,"Last accepted radar: "+frame.sampled2+"/"+frame.eligible+" actual 2-block samples; "+(frame.estimated2??0)+" marked estimates; receipt age "+Math.max(0,system.currentTick-frame.tick)+" ticks. Shared native cache "+terrain.totalCols+"/"+terrain.maxTotalCols+" records. "+mode);
 else manualScans.send(player,"No currently available accepted radar frame (radar may be off/held/not drawn). Shared native cache "+terrain.totalCols+"/"+terrain.maxTotalCols+" records. "+mode);
}

/** Toggles the player's minimap radar on or off. @param {Player} player */
function toggleMinimap(player) {
  const nowOn = getFor(player, "radar") === true;
  setFor(player, "radar", !nowOn);
  player.sendMessage(!nowOn ? "§a[Map] Minimap: Enabled." : "§7[Map] Minimap: Disabled. Run /realm:minimap again to enable it.");
}

/** Toggles the player's top compass strip on or off. @param {Player} player */
function toggleCompass(player) {
  const nowOn = getFor(player, "compass") === true;
  setFor(player, "compass", !nowOn);
  player.sendMessage(!nowOn ? "§a[Map] Compass strip: Enabled." : "§7[Map] Compass strip: Disabled. Run /realm:compass again to enable it.");
}

/** @param {Player} player */
async function menu(player) {
  const gen = currentGen();
  const all = world.getAllPlayers();
  const dest = destination(player, all, new Map());
  const wp = waypointOf(player);
  const lines = [];
  if (wp && dest?.spot) lines.push(`§fDestination: §e${dest.spot.n}§r §7(${where(player, dest.spot)})`);
  else if (wp && dest?.off) lines.push(`§fDestination: §e${wp.n}§r §7(${dest.off})`);
  else if (dest?.spot && dest.spot === siegeSpot(player)) lines.push(`§fFollowing the Choir siege: §c${dest.spot.n}§r §7(${where(player, dest.spot)})`);
  else if (dest?.spot) lines.push(`§fFollowing your story: §b${dest.spot.n}§r §7(${where(player, dest.spot)})`);
  else lines.push("§7No destination. Pick one, or start a story and the strip points to it.");
  lines.push("", "§7Mara's Field Map: hold it in your other hand (offhand) to see the land around you.");
  if (get("enabled") !== true) lines.push("§cThe compass strip and radar are disabled on this realm.");
  else lines.push("§7Compass strip and radar: /realm:prefs -> Minimap.");
  const max = Math.max(1, Number(get("maxMarks")) || 5);
  /** @type {[string, () => unknown][]} */
  const actions = [
    ["Get Mara's Field Map\n§8A locator map", () => giveMap(player)],
    ["Pick a destination\n§8Townsfolk, waystones, camps...", () => pickMenu(player)],
    [`Mark this spot\n§8${marksOf(player).length} of ${max} kept`, () => markMenu(player)],
  ];
  if (wp) actions.push([`Clear destination\n§8${wp.n}`, () => (setWaypoint(player, undefined), player.sendMessage("§7[Map] Destination cleared."))]);
  actions.push(
    [`Minimap: ${prefsOf(player).radar ? "On" : "Off"}\n§8Tap to switch`, () => toggleMinimap(player)],
    [`Compass strip: ${prefsOf(player).compass ? "On" : "Off"}\n§8Tap to switch`, () => toggleCompass(player)]
  );
  const form = new ActionFormData().title("§lMinimap").body(lines.join("\n"));
  for (const [label] of actions) form.button(label);
  form.button("Close");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || res.selection >= actions.length || !player.isValid) return;
  if (resetSince(gen, player)) return;
  await actions[res.selection][1]();
}

/** @param {Player} player */
async function markMenu(player) {
  const gen = currentGen();
  const form = new ModalFormData().title("Mark this spot").textField("Name", "e.g. Iron cave", { defaultValue: `Spot ${marksOf(player).length + 1}` });
  const res = await show(player, form);
  if (!res || res.canceled || !player.isValid || resetSince(gen, player)) return;
  const vals = /** @type {unknown[]} */ (res.formValues ?? []).filter((v) => v !== undefined);
  player.sendMessage(markHere(player, String(vals[0] ?? "")));
}

/** Everything a player can pick, by group. @param {Player} player */
function choices(player) {
  const all = world.getAllPlayers();
  const tag = partyTag(player);
  /** @type {[string, Waypoint[]][]} */
  const groups = [
    ["Townsfolk", [...folk].map(([id, s]) => ({ ...s, k: "npc", id }))],
    ["Waystones I know", (waystones.get(player.id) ?? []).map((w) => ({ n: w.n, dim: w.dim, x: w.x, z: w.z, k: "waystone", id: String(w.i) }))],
    ["Towns", [...towns].map(([id, s]) => ({ ...s, k: "town", id }))],
    ["Wanderer camps", [...camps].map(([wid, s]) => ({ ...s, k: "camp", id: wid }))],
    ["Atlas sites I found", (sites.get(player.id) ?? []).map((s) => ({ n: s.r ? fit(`${s.n} (${s.r})`, 40) : s.n, dim: s.dim, x: s.x, z: s.z, k: "site" }))],
    ["Where I died", deaths.get(player.id) ? [{ ...(/** @type {Spot} */ (deaths.get(player.id))), n: "Where I died", k: "death" }] : []],
    [
      "Party mates",
      all
        .filter((p) => p.id !== player.id && (tag ? p.hasTag(tag) : true))
        .map((p) => ({ n: plain(p.name), dim: p.dimension.id, x: Math.floor(p.location.x), z: Math.floor(p.location.z), k: "party", id: p.id })),
    ],
    [
      "Online friends",
      all
        .filter((p) => p.id !== player.id)
        .map((p) => ({ n: plain(p.name), dim: p.dimension.id, x: Math.floor(p.location.x), z: Math.floor(p.location.z), k: "party", id: p.id })),
    ],
    ["My marked spots", marksOf(player).map((m) => ({ ...m, k: "mark" }))],
  ];
  return groups;
}

/** @param {Player} player */
async function pickMenu(player) {
  while (player.isValid) {
    const gen = currentGen();
    const groups = choices(player);
    const form = new ActionFormData().title("Pick a destination").body("§7The gold star on your compass strip and radar points there. A destination clears when you arrive.");
    for (const [name, list] of groups) form.button(`${name}\n§8${list.length ? `${list.length} to pick from` : "None yet"}`);
    form.button("Back");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || !player.isValid || resetSince(gen, player)) return;
    if (res.selection >= groups.length) return menu(player);
    const [name, list] = groups[res.selection];
    if (!list.length) {
      player.sendMessage(`§7[Map] ${name}: none yet.`);
      continue;
    }
    if (await listMenu(player, name, list, gen)) return;
  }
}

/** @param {Player} player @param {string} title @param {Waypoint[]} list @param {number} gen the reset generation `list` was read at @returns {Promise<boolean>} whether one was picked (or the menu closed) */
async function listMenu(player, title, list, gen) {
  const sorted = [...list].sort((a, b) => distTo(player, a) - distTo(player, b)).slice(0, MENU_MAX);
  const marks = sorted[0]?.k === "mark";
  const form = new ActionFormData().title(title);
  for (const w of sorted) form.button(`${w.n}\n§8${where(player, w)}`);
  if (marks) form.button("Forget a spot\n§8Remove one from the list");
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return true;
  if (resetSince(gen, player)) return true;
  if (marks && res.selection === sorted.length) {
    await forgetMenu(player);
    return false;
  }
  const w = sorted[res.selection];
  if (!w) return false;
  setWaypoint(player, w);
  player.sendMessage(`§a[Map] Destination: ${w.n} §7(${where(player, w)}). The gold star points there.`);
  return true;
}

/** @param {Player} player */
async function forgetMenu(player) {
  const gen = currentGen();
  const list = marksOf(player);
  const form = new ActionFormData().title("Forget a spot");
  for (const m of list) form.button(`${m.n}\n§8${where(player, m)}`);
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || res.selection >= list.length || !player.isValid || resetSince(gen, player)) return;
  const gone = list[res.selection];
  saveMarks(
    player,
    list.filter((_, i) => i !== res.selection)
  );
  const wp = waypointOf(player);
  if (wp?.k === "mark" && wp.n === gone.n) setWaypoint(player, undefined);
  player.sendMessage(`§7[Map] Forgot "${gone.n}".`);
}

// ---------------------------------------------------------------------------
// Broadcasts from other packs
// ---------------------------------------------------------------------------

const EVENTS = new Set([
  "realm:npc_places",
  "realm:waystones_known",
  "realm:atlas_region",
  "realm:atlas_sites",
  "realm:atlas_site",
  "realm:death_point",
  "realm:track",
  "realm:place_ready",
  "realm:wander_spawn",
  "realm:wander_turn",
  "realm:wander_gone",
  "realm:town_list",
  "realm:rainbow_pot",
  "realm:siege_marks",
  "realm:map_debug",
]);

/** @param {string} id @param {any} m @param {Entity | undefined} source */
function onEvent(id, m, source) {
  const pid = typeof m.player === "string" ? m.player : "";
  switch (id) {
    case "realm:npc_places": {
      const list = collect(id, m, Array.isArray(m.folk) ? m.folk : []);
      if (!list) return;
      folk.clear();
      for (const f of /** @type {any[]} */ (list)) {
        const s = spotOf(f);
        if (s && typeof f.id === "string" && s.n) folk.set(f.id, s);
      }
      return;
    }
    case "realm:waystones_known": {
      if (!pid) return;
      const list = collect(`${id}|${pid}`, m, Array.isArray(m.list) ? m.list : []);
      if (!list) return;
      /** @type {(Spot & { i: number })[]} */
      const out = [];
      for (const w of /** @type {any[]} */ (list)) {
        const s = spotOf(w);
        if (s && isNum(w.i) && s.n) out.push({ ...s, i: w.i });
      }
      waystones.set(pid, out);
      return;
    }
    case "realm:atlas_region":
      if (pid) regions.set(pid, plain(m.name, 40));
      return;
    case "realm:atlas_sites":
    case "realm:atlas_site": {
      if (!pid) return;
      const items = id === "realm:atlas_site" ? [m.site] : Array.isArray(m.sites) ? m.sites : [];
      const list = id === "realm:atlas_site" ? [...(sites.get(pid) ?? []), ...items] : collect(`${id}|${pid}`, m, items);
      if (!list) return;
      /** @type {(Spot & { r: string })[]} */
      const out = [];
      for (const s of /** @type {any[]} */ (list)) {
        if (Array.isArray(s) && isNum(s[1]) && isNum(s[2])) out.push({ n: plain(s[0]) || "Site", dim: OVERWORLD, x: Math.floor(s[1]), z: Math.floor(s[2]), r: plain(s[3], 40) });
        else if (s && isNum(s.x) && isNum(s.z) && typeof s.n === "string") out.push(s);
      }
      // A found site is never lost: keep the list bounded anyway.
      sites.set(pid, out.slice(-1000));
      return;
    }
    case "realm:death_point": {
      if (!pid) return;
      const s = spotOf(m, "Where I died");
      if (s) deaths.set(pid, s);
      else deaths.delete(pid);
      return;
    }
    case "realm:track": {
      if (!pid) return;
      const n = plain(m.label, 60);
      const s = spotOf(m, n);
      const npc = typeof m.npc === "string" ? m.npc : undefined;
      if (n && (s || npc)) tracks.set(pid, { n, ...(s ? { spot: s } : {}), ...(npc ? { npc } : {}) });
      else tracks.delete(pid);
      return;
    }
    case "realm:place_ready": {
      if (typeof m.wid !== "string") return; // story places stay the story's business
      const s = spotOf(m, m.label ?? "A Wanderer's Camp");
      if (!s || m.state === "removed" || m.state === "picked") camps.delete(m.wid);
      else camps.set(m.wid, s);
      return;
    }
    case "realm:wander_spawn":
      if (typeof m.wid === "string") wanderers.set(m.wid, !m.hostile);
      if (wanderers.size > 500) wanderers.delete(/** @type {string} */ (wanderers.keys().next().value));
      return;
    case "realm:wander_turn":
      if (typeof m.wid === "string") wanderers.set(m.wid, false);
      return;
    case "realm:wander_gone":
      if (typeof m.wid === "string") wanderers.delete(m.wid);
      return;
    case "realm:town_list": {
      const list = collect(id, m, Array.isArray(m.towns) ? m.towns : []);
      if (!list) return;
      towns.clear();
      for (const t of /** @type {any[]} */ (list)) {
        const s = spotOf(t);
        if (s && typeof t.id === "string") towns.set(t.id, { ...s, n: s.n || "Town" });
      }
      return;
    }
    case "realm:rainbow_pot":
      pot = spotOf(m, "Pot of gold");
      return;
    case "realm:siege_marks": {
      const t = m.town && typeof m.town === "object" ? spotOf({ ...m.town, dim: m.dim }) : undefined;
      if (!t) {
        siege = undefined;
        return;
      }
      const left = Array.isArray(m.circles) ? m.circles.slice(0, 8) : [];
      const circles = /** @type {Spot[]} */ (left.map((/** @type {any} */ c) => spotOf({ ...c, dim: t.dim }, `Choir circle (${left.length} left)`)).filter(Boolean));
      siege = { town: { ...t, n: `Siege: ${t.n}` }, circles };
      return;
    }
    case "realm:map_debug": {
      if (source instanceof Player && !isOp(source)) return;
      const player = world.getAllPlayers().find((p) => p.id === pid || p.name === pid);
      if (m.action === "lab") {
        send("realm:map_state", { experiment: EXP, tick: system.currentTick, counters: labStats,
          pendingSaves: labPendingWrites.size, hydrated: detailCost.hydrated, nativeOps: scanReads,
          completed2: detailCost.nativeCompleted, rasterBuilds: radarRebuilds, scanMs, radarMs, turnMs,
          elapsedTargetMs: EXP.featureMs, observedPeakMs: featureEnvelope.peak,
          manual:{...manualScans.stats,active:manualScans.contexts.size},cache:{native:terrain.totalCols,limit:terrain.maxTotalCols,retainedFootprints:terrain.retained.size} });
        return;
      }
      if(player && m.action==="resident_trace") {
        if(m.op==="start"){
          residentTrace.start(player.id,system.currentTick);
          const prior=publishedDetailFrames.get(player.id);
          if(prior){residentTrace.frame(prior.tag,{view:prior.viewKey,x:prior.x,z:prior.z,built:prior.built});residentTrace.visible={view:prior.viewKey,x:prior.x,z:prior.z,built:side.delivery(player)?.tag===prior.tag?prior.built:undefined,tag:prior.tag,submitted:prior.tick};}
          side.traceDelivery(player,(e)=>residentTrace.note(player.id,e.tick,"side",e.reason,e));
        } else if(m.op==="stop"){residentTrace.stop();side.traceDelivery(player,undefined);}
        const trace={...residentTrace.page(isNum(m.offset)?m.offset:0),costSnapshot:{turnMs,radarMs,drawMs,scanMs,flushMs:previewCost.flushMs,passMs:costMs,terrainRebuilds:radarRebuilds}};
        while(trace.events.length && JSON.stringify({player:player.id,tick:system.currentTick,trace}).length>=1900){trace.events.pop();trace.next=trace.offset+trace.events.length;}
        send("realm:map_state",{player:player.id,tick:system.currentTick,trace});return;
      }
      const t = player ? lastText.get(player.id) : undefined;
      if (m.action === "detail_raw" && player) {
        const store = storeFor(player.id, player.dimension.id);
        const points = Array.isArray(m.points) ? m.points.slice(0, 4) : [];
        const samples = points.map((/** @type {unknown} */ point) => {
          if (!Array.isArray(point) || !isNum(point[0]) || !isNum(point[1]) || Math.abs(point[0]) > 30000000 || Math.abs(point[1]) > 30000000) return null;
          const x = sampleCoord(point[0], COL), z = sampleCoord(point[1], COL), c = store.cols.get(colKey(x, z, COL));
          return c ? { x, z, kind: c.kind, y: c.y, depth: c.depth, palette: c.palette, valid: c.valid !== false, source: c.source, acquiredAtMs: c.acquiredAtMs } : { x, z, valid: false };
        });
        send("realm:map_state", { player: player.id, tick: system.currentTick, store: store.id, profile: experimentNative() ? "native" : "material", samples });
        return;
      }
      if (m.action === "detail" && player) {
        const now = system.currentTick, at = player.location, pr = prefsOf(player), store = storeFor(player.id, player.dimension.id);
        const tx = Math.round(at.x), tz = Math.round(at.z);
        const geometry = northUpRadarGeometry(store.id, tx, tz, pr.radarRadius, R);
        let eligible = 0, sampled = 0, live = 0, restored = 0, empty = 0, invalid = 0;
        const displayCells=797,maskOutside=RADAR_SIZE*RADAR_SIZE-displayCells;let fullCircleTotal=0,fullCircleSampled=0;
        for(const a of circleAnchors(at,pr.revealRadius,sampleCoord,colKey)){fullCircleTotal++;const c=store.cols.get(a.key);if(c&&c.valid!==false)fullCircleSampled++;}
        for (let i = 0; i < geometry.coarseKey.length; i++) {
          if(!insideRadar(i%RADAR_SIZE-R,Math.floor(i/RADAR_SIZE)-R,R))continue;
          if ((geometry.coarseX[i] - at.x) ** 2 + (geometry.coarseZ[i] - at.z) ** 2 > pr.revealRadius ** 2) continue;
          eligible++; const c = store.cols.get(geometry.coarseKey[i]);
          if (!c) continue; if (c.valid === false) { invalid++; continue; }
          sampled++; if (c.kind === "empty") empty++;
          if (c.source === "persisted") restored++; else if (now - c.tick <= SCAN_MAX_AGE) live++;
        }
        const viewKey = store.id + "|" + tx + "|" + tz + "|0|" + pr.radarRadius + "|" + (experimentNative() ? "native" : "material") + "|" + at.x + "|" + at.z + "|circle" + "|profile=" + EXP.id + "|estimate=" + (EXP.estimateRadiusBlocks??0);
        acceptDetailFrame(player, preparedDetailFrames.get(player.id));
        const accepted = publishedDetailFrames.get(player.id);
        const matches = !side.held(player) && accepted?.viewKey === viewKey && !!side.delivery(player);
        if(residentTrace.active(player.id))residentTrace.note(player.id,now,"metric",side.held(player)?"held":!accepted?"no_accepted_frame":accepted.viewKey!==viewKey?"wrong_view":!side.delivery(player)?"no_live_delivery":"accepted",{view:viewKey,acceptedView:accepted?.viewKey??"",tag:accepted?.tag??"",...residentTrace.older(now,at.x,at.z)});
        let oldest = 0, queued2 = 0, queued4 = 0;
        for (const plan of scanPlans.values()) for (let i = plan.pos; i < plan.picks.length; i++) { const pick = plan.picks[i]; oldest = Math.max(oldest, now - (pick.queuedAt ?? plan.at)); if (pick.resolution === COL) queued2++; else if (pick.resolution === PREVIEW) queued4++; }
        send("realm:map_state", { player: player.id, tick: now, detail: { viewKey, raster: RADAR_SIZE * RADAR_SIZE, rasterShape:"circle",displayCells,maskOutside,anchorOutside:displayCells-eligible,fullCircleTotal,fullCircleSampled,eligible, policyOutside: RADAR_SIZE * RADAR_SIZE - eligible, sampled2: sampled, live2: live, persisted2: restored, validEmpty2: empty, invalidated2: invalid, unknown2: eligible - sampled, published2: matches ? accepted.sampled2 : 0,estimatedDisplay:matches?(accepted.estimated2??0):0,estimateRadiusBlocks:EXP.estimateRadiusBlocks??0, publicationTick: matches ? accepted.tick : null, nativeOps: scanReads, completed2: detailCost.nativeCompleted, hydrated2: detailCost.hydrated, queued2, queued4, oldestAge: oldest, featureUsedMs: featureEnvelope.used, featurePeakMs: featureEnvelope.peak }, persistence: { ...detailPersistence.stats(), pendingTombstones: pendingTombstones.size, tombstoneOverflow } });
        return;
      }
      if (m.action === "queue") { send("realm:map_state", { player: player?.id, tick: system.currentTick, queue: { ...scanQueueCost } }); return; }
      if (m.action === "preview") {
        const coverage = player ? terrainBaseMemo.get(player.id)?.coverage : undefined;
        send("realm:map_state", { player: player?.id, tick: system.currentTick, preview: {
          detailCells: coverage?.detailCells ?? 0, previewCells: coverage?.previewCells ?? 0,estimatedCells:coverage?.estimatedCells??0,
          unknownCells: coverage?.unknownCells ?? 797,
          eligibleCells: coverage?.eligibleCells ?? 0, eligibleKnownCells: coverage?.eligibleKnownCells ?? 0, eligibleDetailCells: coverage?.eligibleDetailCells ?? 0, totalCells: coverage?.totalCells ?? 797,rasterCells:RADAR_SIZE*RADAR_SIZE,maskOutside:292,rasterShape:"circle",
          nativePeak: scanPeak, perViewerPeak: scanEachPeak,
          reads: scanReads, previewReads: previewCost.nativeReads, previewPuts: previewCost.nativeFills,
          previewHits: previewCost.hits, hydrated: previewCost.hydrated, diskLoads: previewCost.diskLoads,
        }, persistence: previewPersistence.stats() });
        return;
      }
      const preview = { ...previewCost, persistence: previewPersistence.stats(), coverage: player ? terrainBaseMemo.get(player.id)?.coverage : undefined };
      const surface = player ? terrain.store(player.dimension.id, undefined) : undefined;
      const state = {
        player: player?.id,
        quality: { cells: RADAR_SIZE, preview: PREVIEW, detail: COL, nativeTerrain: experimentNative() },
        preview,
        strip: t?.strip,
        line2: t?.line2,
        radar: t?.radar,
        dest: t?.dest,
        pose: t ? { ...t.at, dim: t.dim, heading: t.heading, radius: t.radius, north: t.north } : undefined,
        target: t?.target,
        wp: player ? waypointOf(player) ?? null : null,
        marks: player ? marksOf(player) : [],
        resetGen: currentGen(),
        terrain: player ? {
          store: storeFor(player.id, player.dimension.id).id,
          surface: surface ? { columns: surface.cols.size, fine: surface.fine.size } : undefined,
          misses: storeFor(player.id, player.dimension.id).miss.size,
          samples: Array.isArray(m.samples) ? m.samples.slice(0, 4).filter((/** @type {any} */ s) => isNum(s?.x) && isNum(s?.z)).map((/** @type {any} */ s) => ({
            x: s.x, z: s.z, resolution: s.resolution === PREVIEW ? PREVIEW : s.resolution === 1 ? 1 : COL,
            data: terrain.get(storeFor(player.id, player.dimension.id), s.x, s.z, s.resolution === PREVIEW ? PREVIEW : s.resolution === 1 ? 1 : COL) ?? null,
          })) : [],
        } : undefined,
        cost: { ms: costMs, drawMs, passes: costPasses, players: costPlayers, turnMs, turnTicks, turnDraws, turnSends, scanReads, scanTicks, scanMs, scanPeak, scanEachPeak, scanPlanMs, plansMade: planTurn.made, refreshSends, keepSends, rebuilds: radarRebuilds, reuses: radarReuses, builds: radarBuilds, turnCheckMs, radarMs, readCost },
        budgets: { draw: drawBudget.left, rebuild: rebuildBudget.left, pass: passBudget.left, scan: scanBudget.left },
        budgetLevel,
        perTick: BUDGETS.reduce((n, b) => n + b.perTick, 0),
        known: { folk: folk.size, camps: camps.size, towns: towns.size, pot: pot ?? null, waystones: player ? waystones.get(player.id)?.length ?? 0 : 0, sites: player ? sites.get(player.id)?.length ?? 0 : 0, region: player ? regions.get(player.id) ?? "" : "", death: player ? !!deaths.get(player.id) : false, track: player ? tracks.get(player.id)?.n ?? "" : "", deathAt: player ? deaths.get(player.id) ?? null : null },
      };
      const metrics = { player: state.player, quality: state.quality, pose: state.pose, cost: state.cost, preview, budgets: state.budgets, budgetLevel: state.budgetLevel, perTick: state.perTick, renderTextOmitted: true };
      if (m.action === "cost") send("realm:map_state", metrics);
      else sendDebugState(JSON.stringify(state), state.player, metrics);
      if (m.action === "cost") {
        Object.assign(scanQueueCost, scanQueueCounters());
        costMs = 0;
        drawMs = 0;
        costPasses = 0;
        costPlayers = 0;
        turnMs = 0;
        turnTicks = 0;
        turnDraws = 0;
        turnSends = 0;
        scanReads = 0;
        scanTicks = 0;
        scanMs = 0;
        scanPeak = 0;
        scanEachPeak = 0;
        scanPlanMs = 0;
        planTurn.made = 0;
        refreshSends = 0;
        keepSends = 0;
        radarRebuilds = 0; radarReuses = 0; radarBuilds = 0;
        turnCheckMs = 0;
        radarMs = 0;
      }
      return;
    }
  }
}

onScriptEvent(
  [...EVENTS],
  ({ id, message, sourceEntity }) => {
    if (!EVENTS.has(id)) return;
    try {
      const m = JSON.parse(message);
      if (m && typeof m === "object") onEvent(id, m, sourceEntity);
    } catch {
      // not ours
    }
  },
);

/** Asks the packs that own the data to send it (for one player, or everyone). @param {string} [player] */
function ping(player) {
  const who = player ? { player } : {};
  send("realm:waystones_known_ping", who);
  send("realm:atlas_ping", who);
  send("realm:death_point_ping", who);
  send("realm:track_ping", who);
  if (!player) {
    send("realm:npc_places_ping", {});
    send("realm:place_ping", {});
    send("realm:town_list_ping", {});
    send("realm:rainbow_ping", {});
    send("realm:siege_ping", {});
  }
}

world.afterEvents.worldLoad.subscribe(() => {
  for(const player of world.getAllPlayers())resetRadarOffOnce(player);
  system.runTimeout(() => ping(), 60);
});
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  resetChecked.delete(player.id);
  applyReset(player);
  resetRadarOffOnce(player);
  const id = player.id;
  system.runTimeout(() => ping(id), 40);
});

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {import("@minecraft/server").CustomCommandOrigin} origin */
const playerOf = (origin) => {
  const p = origin.initiator ?? origin.sourceEntity;
  return p instanceof Player ? p : undefined;
};

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    { name: "realm:map", description: "Minimap: get Mara's Field Map, pick a destination for your compass strip, mark spots", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => {
      const player = playerOf(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => menu(player).catch((e) => console.warn(`[map] ${e}`)));
      return { status: CustomCommandStatus.Success };
    }
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:map_mark",
      description: "Mark the spot where you stand, to pick it as a destination later",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
      optionalParameters: [{ name: "name", type: CustomCommandParamType.String }],
    },
    (origin, name) => {
      const player = playerOf(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => {
        if (player.isValid) player.sendMessage(markHere(player, typeof name === "string" ? name : ""));
      });
      return { status: CustomCommandStatus.Success };
    }
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:map_reset",
      description: "Operators: clear every player's map destination and marked spots (offline players on their next join). Run it with confirm",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      optionalParameters: [{ name: "confirm", type: CustomCommandParamType.String }],
    },
    (origin, confirm) => {
      const who = origin.initiator ?? origin.sourceEntity;
      if (who instanceof Player && !isOp(who)) return { status: CustomCommandStatus.Failure, message: "Only operators can reset the map." };
      if (!confirmed(confirm)) {
        return { status: CustomCommandStatus.Success, message: "This clears every player's map destination and marked spots, and offline players' on their next join. Run /realm:map_reset confirm to do it." };
      }
      system.run(() => {
        try {
          const gen = nextGeneration(world.getDynamicProperty(WORLD_GEN));
          world.setDynamicProperty(WORLD_GEN, gen);
          worldGen = gen;
          for (const p of world.getAllPlayers()) applyReset(p);
          console.warn(`[map] reset ${gen}: destinations and marked spots cleared for ${world.getAllPlayers().length} online players; offline players on their next join`);
          if (who instanceof Player && who.isValid) who.sendMessage("§a[Map] Reset done: online players now, everyone else when they next join.");
        } catch (e) {
          console.warn(`[map] reset: ${e}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
  customCommandRegistry.registerCommand(
    { name: "realm:map_clear", description: "Clear your destination (the strip follows your story again)", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => {
      const player = playerOf(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => {
        if (!player.isValid) return;
        const had = waypointOf(player);
        setWaypoint(player, undefined);
        player.sendMessage(had ? `§7[Map] Destination cleared (${had.n}).` : "§7[Map] You had no destination.");
      });
      return { status: CustomCommandStatus.Success };
    }
  );
  registerMinimapCommand(customCommandRegistry,{toggle:toggleMinimap,start:(p,r)=>manualScans.start(p,r,system.currentTick),status:minimapStatus,cancel:p=>{if(manualScans.contexts.has(p.id))manualScans.cancel(p.id);else manualScans.send(p,"No scan is active. Use scan [world-block radius], default 64; status and cancel are top-level actions.");}});
  customCommandRegistry.registerCommand(
    { name: "realm:compass", description: "Toggle your top compass strip on or off", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => {
      const player = playerOf(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => {
        if (player.isValid) toggleCompass(player);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
onScriptEvent(
  "realm:help_ping",
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "map_bp");
  },
);
