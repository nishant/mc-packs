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
import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { Budget, oldestDue } from "./budget.js";
import { CONFIG } from "./config.js";
import { G } from "./glyphs.js";
import { get, getFor, onChange, setFor } from "./settings.js";
import { sideBoxes } from "./side.js";
import { aheadPicks, colKey, COL, glyphAt, KEY_BIAS, KEY_SPAN, MISS_RETRY, readColumn, sampleCoord, spendBudget, TerrainWorld } from "./terrain.js";
import { onScriptEvent } from "./script-events.js";
import { confirmed, generationOf, needsReset, nextGeneration, PLAYER_GEN, resetPlayer, staleForm, WORLD_GEN } from "./reset.js";

/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** A place on the map. @typedef {{ n: string, dim: string, x: number, z: number }} Spot */
/** The destination a player picked: what kind, which one, and where it was when picked. @typedef {Spot & { k: string, id?: string }} Waypoint */
/** A player's place and party tag this pass. @typedef {{ id: string, dim: string, x: number, z: number, party?: string }} Seen */
/** A marker this pass: kind, where it is (x, z); `clamp` ones show at the edge when out of sight. @typedef {{ kind: string, x: number, z: number, clamp: boolean }} Marker */

const PACK = "map_bp";
const PROP_WP = "map:wp"; // player: JSON Waypoint
const PROP_MARKS = "map:marks"; // player: JSON Spot[]
const NPC_TAG = "realm:npc";
const ID_TAG = "realm:npc_id:";
const WANDER_OWNER = "realm:npc_owner:wander_bp";
const CAMP_TAG = "wander:c:";
const PARTY_TAG = "realm_party:";
const OVERWORLD = "minecraft:overworld";
const DIM_NAMES = /** @type {Record<string, string>} */ ({ "minecraft:overworld": "the Overworld", "minecraft:nether": "the Nether", "minecraft:the_end": "the End" });
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

const CELLS = 25; // the strip: 25 cells of 5 degrees, 60 degrees each side of where you face
const MID = 12;
const DEG = 5;
const R = 10; // the radar: 21 x 21 cells (441 pixels), you in the middle
const HOLD = 40; // a readout stays this long without an update (ticks)
const REFRESH = 30; // an unchanged readout is sent again after this many ticks (before HOLD runs out)
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
    resetPlayer(player, gen);
    wpCache.set(player.id, null);
    marksCache.set(player.id, []);
    lastSent.delete(player.id);
    views.delete(player.id);
    passAt.delete(player.id);
    player.sendMessage("§7[Map] An operator reset everyone's destination and marked spots.");
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

/** What each player's preferences are (cached until /realm:prefs or /realm:config changes them). @type {Map<string, { compass: boolean, radar: boolean, north: boolean, terrain: boolean, mobs: boolean, radius: number, town: boolean, home: boolean }>} */
const prefCache = new Map();
/** @param {Player} player */
function prefsOf(player) {
  const hit = prefCache.get(player.id);
  if (hit) return hit;
  const cap = Math.max(8, Number(get("mobRadiusMax")) || 32);
  const p = {
    compass: getFor(player, "compass") === true,
    radar: getFor(player, "radar") === true,
    north: getFor(player, "radarNorthUp") === true,
    terrain: getFor(player, "terrain") === true,
    mobs: getFor(player, "showMobs") === true,
    radius: Math.min(cap, Math.max(8, Number(getFor(player, "mobRadius")) || 24)),
    town: getFor(player, "showTown") === true,
    home: getFor(player, "showHome") === true,
  };
  prefCache.set(player.id, p);
  return p;
}
onChange((_key, player) => {
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

/** @param {Player} player */
function npcsNear(player) {
  const at = player.location;
  const dim = player.dimension;
  const hit = npcCache.get(player.id);
  if (hit && hit.dim === dim.id && system.currentTick - hit.tick < 20 && Math.abs(hit.x - at.x) + Math.abs(hit.z - at.z) < 8) return hit.list;
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
  npcCache.set(player.id, { tick: system.currentTick, dim: dim.id, x: at.x, z: at.z, list });
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
    for (const e of dim.getEntities({ location: at, maxDistance: pr.radius, families: ["monster"], excludeTags: [NPC_TAG], closest: max })) {
      try {
        const l = e.location;
        add("mob", l.x, l.z, true);
      } catch {
        // gone meanwhile
      }
    }
  }
  const tag = seen.find((s) => s.id === player.id)?.party;
  const others = get("showOthers") === true;
  for (const s of seen) {
    if (s.id === player.id || s.dim !== dim.id) continue;
    if (tag && s.party === tag) add("party", s.x, s.z, true);
    else if (others && Math.hypot(s.x - at.x, s.z - at.z) <= OTHERS_RANGE) add("other", s.x, s.z, true);
  }
  const range = Number(get("placeRange")) || 256;
  for (const c of camps.values()) if (c.dim === dim.id && Math.abs(c.x - at.x) <= range && Math.abs(c.z - at.z) <= range) add("camp", c.x + 0.5, c.z + 0.5, false);
  if (dim.id === OVERWORLD) for (const s of sites.get(player.id) ?? []) if (Math.abs(s.x - at.x) <= range && Math.abs(s.z - at.z) <= range) add("site", s.x + 0.5, s.z + 0.5, false);
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
  const cells = Array(CELLS).fill(G.S_BLANK);
  const prio = Array(CELLS).fill(0);
  cells[MID] = G.S_CENTER;
  prio[MID] = 1;
  for (let a = 0; a < 360; a += 15) {
    const i = MID + Math.round(wrap(a - heading) / DEG);
    if (i < 0 || i >= CELLS) continue;
    const p = a % 45 === 0 ? 2 : 1;
    if (p < prio[i] || (p === prio[i] && i === MID)) continue;
    cells[i] = a % 45 === 0 ? LETTERS[a / 45] : G.S_TICK;
    prio[i] = p;
  }
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
    // Nearer wins among equals.
    const p = 10 + k.p - Math.min(Math.hypot(dx, dz), 999) / 1000;
    if (p <= prio[i]) continue;
    cells[i] = g;
    prio[i] = p;
  }
  return cells.join("");
}

// The terrain is world data kept by terrain.js: one surface store per dimension, shared by everyone, and one
// store per underground layer (the height a roofed player stands at), shared by those at that height.
const terrain = new TerrainWorld(6000, 24);
/**
 * Per player: the radar's terrain (`base`, in the pieces layout) for one pose and terrain version, and the text being
 * drawn from it (`rows`: the base plus this draw's markers, which `touched` lists, so the next draw puts back only
 * those). A player who doesn't move or turn far enough for the terrain to change costs no terrain lookups.
 * `need` is what the scanner should read for it (missing columns nearest first, then stale ones), made at `needAt`.
 * @type {Map<string, { key: string, base: string[], rows: string[], touched: number[], need: import("./terrain.js").Pick[], needAt: number, needStore?: import("./terrain.js").Store }>}
 */
const terrainBaseMemo = new Map();
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
  return `${s.id}#${terrain.viewVer(s, at.x, at.z, radius * 1.5 + 8)}`;
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
  pendingTerrain.clear();
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
const scanBudget = new Budget(1, 30, 4);
/** What one read took lately (ms), to fit the reads to the time left. */
let readCost = 0.06;
let readMsSum = 0;
let readOpsSum = 0;
const SCAN_MAX_AGE = 2400;
const PLAN_EACH_TICK = 2;
const PLAN_EVERY = 20;
/** Viewers to check first: their radar was just built (a new list of what it misses) or they move fast. @type {Set<string>} */
const planNow = new Set();
/** Viewers whose reads failed (unloaded chunks), and when to check them again. @type {Map<string, number>} */
const retryAt = new Map();
/** Where each viewer was at their last check (their speed when the game reports none, as for a teleporting flier). @type {Map<string, { x: number, z: number, tick: number }>} */
const lastPose = new Map();
const PLAN_MIN_AGE = 4;
/** Columns kept per store at least, and per viewer of it (40 viewers spread out need more than the minimum). */
const STORE_MIN = 6000;
const STORE_PER_VIEWER = 300;
/** @typedef {{ id: string, store: import("./terrain.js").Store, picks: import("./terrain.js").Pick[], dim: import("@minecraft/server").Dimension, py: number, roof: boolean, at: number, pos: number, missed: number, missRun: number, x: number, z: number }} ScanPlan */
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

let playersTick = -1;
/** @type {Player[]} */
let playersList = [];
/** The online players, read from the game once a tick and shared by the scanner and the passes (callers don't change the list). */
function playersNow() {
  const tick = system.currentTick;
  if (tick !== playersTick) {
    playersList = world.getAllPlayers();
    playersTick = tick;
  }
  return playersList;
}

system.runInterval(() => {
  if (get("enabled") !== true) return;
  const t0 = Date.now();
  const now = system.currentTick;
  scanBudget.tick();
  const all = playersNow();
  planTurn.left = PLAN_EACH_TICK;
  // Each viewer is checked (moved, turned, a new list from their radar, the roof) every PLAN_EVERY ticks, a share of
  // them each tick, taking turns; the plans in between are read from where they stopped.
  const n = all.length;
  const checks = Math.min(n, Math.max(1, Math.ceil(n / PLAN_EVERY)));
  for (const [id, at] of retryAt) {
    if (at > now) continue;
    retryAt.delete(id);
    planNow.add(id);
  }
  for (const id of planNow) {
    if (!scanBudget.ok) break;
    planNow.delete(id);
    const player = all.find((p) => p.id === id);
    if (!player) continue;
    const t = Date.now();
    try {
      planFor(player, now);
    } catch {
      // unloaded chunk or player left
    }
    scanBudget.spend(Date.now() - t);
  }
  let checked = 0;
  for (; checked < checks && scanBudget.ok; checked++) {
    const t = Date.now();
    try {
      planFor(all[(checked + scanFirst) % n], now);
    } catch {
      // unloaded chunk or player left
    }
    scanBudget.spend(Date.now() - t);
  }
  if (n) scanFirst = (scanFirst + checked) % n;
  /** @type {ScanPlan[]} */
  const plans = [];
  for (const plan of scanPlans.values()) if (plan.pos < plan.picks.length) plans.push(plan);
  terrain.maxCols = Math.max(STORE_MIN, scanPlans.size * STORE_PER_VIEWER);
  scanPlanMs += Date.now() - t0;
  const total = Math.min(SCAN_TOTAL, Math.floor(scanBudget.room / readCost));
  if (plans.length && total > 0) {
    const tRead = Date.now();
    const readsBefore = scanReads;
    const spent = spendBudget(plans, total, SCAN_EACH, now % plans.length, now, (plan, pick) => {
      const store = pick.store ?? plan.store;
      const key = `${store.id}|${pick.key}`;
      try {
        scanReads++;
        let job = pendingTerrain.get(key);
        if (!job) {
          const reader = readColumn(plan.dim, pick.wx, pick.wz, store.id.includes("|surface") ? undefined : plan.py);
          job = { reader, next: reader.next(), tick: now };
          pendingTerrain.set(key, job);
        }
        const next = job.reader.next(job.next.value());
        job.tick = now;
        if (!next.done) {
          job.next = next;
          return false;
        }
        terrain.put(store, pick.wx, pick.wz, next.value, now, pick.resolution);
        pendingTerrain.delete(key);
        plan.missRun = 0;
      } catch {
        // unloaded chunk: keep what was known, ask again in a few ticks
        pendingTerrain.delete(key);
        terrain.miss(store, pick.wx, pick.wz, now, pick.resolution);
        plan.missed++;
        // Several in a row: the area isn't loaded (a teleport, a join). Stop here and try the whole plan again in
        // MISS_RETRY ticks, instead of spending the budget on reads that fail.
        if (++plan.missRun >= 4) {
          plan.pos = plan.picks.length;
          plan.missRun = 0;
        }
      }
    });
    let sum = 0;
    for (const v of spent.values()) {
      sum += v;
      if (v > scanEachPeak) scanEachPeak = v;
    }
    if (sum > scanPeak) scanPeak = sum;
    for (const p of plans) {
      if (p.pos < p.picks.length) continue;
      if (p.missed && !retryAt.has(p.id)) retryAt.set(p.id, now + MISS_RETRY);
    }
    const took = Date.now() - tRead;
    scanBudget.spend(took);
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
  for (const [key, job] of pendingTerrain) if (now - job.tick > 20) pendingTerrain.delete(key);
  scanMs += Date.now() - t0;
  scanTicks++;
}, 1);

/** @param {Player} player @param {number} now @returns {ScanPlan | undefined} */
function planFor(player, now) {
  if (!player.isValid) return undefined;
  const pr = prefsOf(player);
  if (!pr.radar || !pr.terrain) {
    playerStore.delete(player.id);
    scanPlans.delete(player.id);
    return undefined;
  }
  const dim = player.dimension;
  const at = player.location;
  const surface = terrain.store(dim.id, undefined);
  const top = terrain.get(surface, at.x, at.z, 1, true);
  const roof = dim.id === "minecraft:nether" || (!!top && top.kind !== "water" && top.y > at.y + 6);
  const py = Math.floor(at.y);
  const store = terrain.store(dim.id, roof ? py : undefined);
  playerStore.set(player.id, store);
  // Where the radar draws its terrain from (radarOf: whole blocks).
  const pose = { x: Math.round(at.x), z: Math.round(at.z) };
  // How fast they move: the game's velocity, or what they covered since the last check (a teleporting flier or a
  // minecart has little velocity of its own).
  const got = player.getVelocity?.() ?? { x: 0, z: 0 };
  const prev = lastPose.get(player.id);
  const dt = prev ? now - prev.tick : 0;
  const moved = prev && dt > 0 && dt <= 40 ? { x: (at.x - prev.x) / dt, z: (at.z - prev.z) / dt } : { x: 0, z: 0 };
  if (prev) {
    prev.x = at.x;
    prev.z = at.z;
    prev.tick = now;
  } else lastPose.set(player.id, { x: at.x, z: at.z, tick: now });
  const vel = Math.abs(moved.x) + Math.abs(moved.z) > Math.abs(got.x) + Math.abs(got.z) && Math.abs(moved.x) + Math.abs(moved.z) < 16 ? moved : got;
  const lead = { x: Math.max(-28, Math.min(28, vel.x * 8)), z: Math.max(-28, Math.min(28, vel.z * 8)) };
  // Roof detection uses an exact surface sample from this same budget, never an extra per-viewer native read.
  const origin = colKey(at.x, at.z, 1);
  const missed = surface.miss.get(origin);
  const probe = (!top || now - top.tick > 100) && (missed === undefined || now - missed >= MISS_RETRY);
  /** @type {import("./terrain.js").Pick} */
  const probePick = { wx: Math.floor(at.x), wz: Math.floor(at.z), key: origin, resolution: 1, store: surface, since: now };
  const old = scanPlans.get(player.id);
  const same = !!old && old.store === store;
  const fast = Math.abs(lead.x) + Math.abs(lead.z) >= 4;
  // Walking or standing: the radar lists what its own picture is missing whenever it is built (radarOf), so planning
  // costs nothing extra. Flying or riding fast: plan the ground ahead too (aheadPicks, PLAN_EACH_TICK viewers a tick).
  const drawn = terrainBaseMemo.get(player.id);
  /** @type {import("./terrain.js").Pick[] | undefined} */
  let picks;
  if (!fast) {
    // Walking, exact block columns near the player (the near field) are left for when they stop: each step needs a
    // dozen new ones, which with many players walking would take most of the reading budget. Until then the near
    // field shows the coarse samples, as it does before they are read.
    const walking = Math.abs(vel.x) + Math.abs(vel.z) > 0.1;
    if (drawn && drawn.needStore === store && drawn.needAt > (same ? old.at : -1)) picks = walking ? drawn.need.filter((p) => p.resolution !== 1) : drawn.need.slice();
    // Reads that failed (an unloaded chunk) are asked again MISS_RETRY ticks later.
    else if (same && old.missed > 0 && old.pos >= old.picks.length && now - old.at >= MISS_RETRY) {
      picks = old.picks.filter((p) => !(p.store ?? store).cols.has(p.key));
    }
  } else {
    // Moving fast: what the radar listed (the view now) and, alternating with it, the ground ahead (the radar's whole
    // reach around the point `lead` blocks ahead), planned again every PLAN_MIN_AGE ticks.
    const left = same && old.pos < old.picks.length;
    if ((!left || now - old.at >= PLAN_MIN_AGE) && planTurn.left > 0) {
      planTurn.left--;
      const listed = drawn && drawn.needStore === store ? drawn.need.filter((p) => p.resolution !== 1 && !p.stale) : [];
      const ahead = aheadPicks(store, pose.x + lead.x, pose.z + lead.z, pr.radius * 1.5, now, SCAN_MAX_AGE, 96);
      picks = [];
      for (let i = 0; i < listed.length || i < ahead.length; i++) {
        if (i < listed.length) picks.push(listed[i]);
        if (i < ahead.length) picks.push(ahead[i]);
      }
    }
  }
  if (!picks) {
    if (!old || !same) {
      if (!probe) return undefined;
      picks = [];
    } else {
      // Keep reading the current plan; the roof probe goes first.
      if (probe && old.picks[old.pos]?.key !== origin) old.picks.splice(old.pos, 0, probePick);
      old.dim = dim;
      old.py = py;
      old.roof = roof;
      return old.pos < old.picks.length ? old : undefined;
    }
  }
  if (probe) picks.unshift(probePick);
  /** @type {ScanPlan} */
  const plan = { id: player.id, store, picks, dim, py, roof, missRun: 0, at: fast || !drawn || drawn.needAt <= (same ? old.at : -1) ? now : drawn.needAt, pos: 0, missed: 0, x: at.x, z: at.z };
  scanPlans.set(player.id, plan);
  planTurn.made++;
  return plan;
}

const RADAR_SIZE = 2 * R + 1;
/** The radar text is kept as its pieces, row by row: each row's 21 glyphs, then "\n" (none after the last row). */
const ROW = RADAR_SIZE + 1;
const RADAR_PIECES = RADAR_SIZE * ROW - 1;
const EMPTY_ROWS = /** @type {string[]} */ (Array(RADAR_PIECES).fill("\n"));
for (let r = 0; r < RADAR_SIZE; r++) for (let c = 0; c < RADAR_SIZE; c++) EMPTY_ROWS[r * ROW + c] = G.Q_EMPTY;
/** Marker priorities by piece, all 0 between calls (each call puts back the ones it set). */
const prioBuf = new Float64Array(RADAR_PIECES);
/** Terrain pictures built so far (each costs about 0.8 ms; the redraw spends REBUILDS_PER_TICK of them a tick). */
let radarRebuilds = 0;
/** Whether the last radarOf drew on an out-of-date terrain picture (no time to build it again). */
let radarStale = false;
/** The radar is built again this often anyway, so columns that went stale are found (and read again). */
const STALE_EVERY = 200;
/** The terrain grid turns in steps of this many degrees and moves in whole blocks (an edge cell moves under a block). */
const TERRAIN_TURN = 2;

/**
 * The radar: 21 x 21 cells, the player in the middle, `radius` blocks to the edge; north up or turned so ahead is up.
 * The destination, party mates and online friends beyond the edge sit on it as directional arrows.
 * @param {number} heading @param {Marker[]} markers @param {number} radius @param {boolean} north @param {{ x: number, z: number }} at the player
 * @param {string} [dimId] @param {boolean} [useTerrain] @param {string} [playerId]
 * @param {boolean} [rebuild] false: if the terrain would have to be built again, draw on the last one (no time left; radarStale)
 * @param {number} [now] the tick (stale columns, failed reads)
 */
function radarOf(heading, markers, radius, north, at, dimId = OVERWORLD, useTerrain = false, playerId = "", rebuild = true, now = 0) {
  const h = (heading * Math.PI) / 180;
  const cos = Math.cos(h);
  const sin = Math.sin(h);
  const cell = radius / R;
  const store = useTerrain ? storeFor(playerId, dimId) : undefined;
  let memo = playerId ? terrainBaseMemo.get(playerId) : undefined;
  if (!memo) {
    memo = { key: "", base: EMPTY_ROWS.slice(), rows: EMPTY_ROWS.slice(), touched: [], need: [], needAt: -1 };
    if (playerId) terrainBaseMemo.set(playerId, memo);
  }
  const { base, rows, touched } = memo;
  const tx = Math.round(at.x);
  const tz = Math.round(at.z);
  const th = north ? 0 : Math.round(heading / TERRAIN_TURN) * TERRAIN_TURN;
  // Built again when the pose (whole blocks, TERRAIN_TURN degrees) or the land near the player changed, and every
  // STALE_EVERY ticks so columns older than SCAN_MAX_AGE are found and read again.
  const key = !store ? "empty" : `${terrainVerOf(playerId, dimId, at, radius)}|${tx}|${tz}|${th}|${radius}|${Math.floor(now / STALE_EVERY)}`;
  radarStale = false;
  if (memo.key !== key && !rebuild && memo.key && key !== "empty") {
    // No time to build the terrain again: this tick's markers go on the last picture (radarStale tells the caller).
    radarStale = true;
    for (const i of touched) rows[i] = base[i];
  } else if (memo.key !== key) {
    if (!store) {
      for (let i = 0; i < RADAR_PIECES; i++) base[i] = EMPTY_ROWS[i];
    } else {
      radarRebuilds++;
      const cols = store.cols;
      const miss = store.miss;
      /** What the scanner should read for this picture (planFor): missing columns, then stale ones. @type {(import("./terrain.js").Pick & { d: number, stale: boolean })[]} */
      const need = [];
      /** @type {Set<number>} */
      const listed = new Set();
      /** @param {number} k @param {number} wx @param {number} wz @param {number} resolution @param {number} d @param {boolean} stale */
      const want = (k, wx, wz, resolution, d, stale) => {
        if (listed.has(k)) return;
        const m = miss.get(k);
        if (m !== undefined && now - m < MISS_RETRY) return;
        listed.add(k);
        need.push({ wx: sampleCoord(wx, resolution), wz: sampleCoord(wz, resolution), key: k, resolution, d: d + (resolution === 1 ? 1e6 : 0), stale });
      };
      const tcos = Math.cos((th * Math.PI) / 180);
      const tsin = Math.sin((th * Math.PI) / 180);
      // cellWorld, sampleResolution and the coarse colKey and glyphAt, inline: this runs for every cell of every
      // rebuilt radar. Neighboring cells often sample the same 4 x 4 column: the last one is kept.
      let lastKey = -1;
      let lastGlyph = G.Q_EMPTY;
      for (let row = -R; row <= R; row++) {
        const sy = row * cell;
        let idx = (row + R) * ROW;
        for (let col = -R; col <= R; col++) {
          const sx = col * cell;
          const d = sx * sx + sy * sy;
          const wx = north ? tx + sx : tx + sx * tcos - sy * tsin;
          const wz = north ? tz + sy : tz + sx * tsin + sy * tcos;
          const k = (Math.floor(wx / COL) + KEY_BIAS) * KEY_SPAN + Math.floor(wz / COL) + KEY_BIAS;
          if (k !== lastKey) {
            const c = cols.get(k);
            if (!c) want(k, wx, wz, COL, d, false);
            else if (now - c.tick > SCAN_MAX_AGE) want(k, wx, wz, COL, d, true);
            lastGlyph = !c || c.kind === "empty" ? G.Q_EMPTY : c.glyph ?? glyphAt(terrain, store, wx, wz, COL);
            lastKey = k;
          }
          if (d <= 36) {
            // The near field: exact block columns (thin roofs), over the coarse base until they are read.
            const kf = colKey(wx, wz, 1);
            const f = kf < 0 ? undefined : cols.get(kf);
            if (!f) {
              if (kf >= 0) want(kf, wx, wz, 1, d, false);
              base[idx++] = lastGlyph;
            } else {
              if (now - f.tick > SCAN_MAX_AGE) want(kf, wx, wz, 1, d, true);
              base[idx++] = glyphAt(terrain, store, wx, wz, 1);
            }
            continue;
          }
          base[idx++] = lastGlyph;
        }
      }
      need.sort((a, b) => Number(a.stale) - Number(b.stale) || a.d - b.d);
      memo.need = need;
      memo.needAt = now;
      memo.needStore = store;
    }
    for (let i = 0; i < RADAR_PIECES; i++) rows[i] = base[i];
    memo.key = key;
  } else {
    for (const i of touched) rows[i] = base[i];
  }
  touched.length = 0;
  /** Screen offset (right, down) of a world offset. @param {number} dx @param {number} dz */
  const screen = (dx, dz) => (north ? [dx, dz] : [dx * cos + dz * sin, -dx * sin + dz * cos]);
  /** @param {number} sx @param {number} sy @param {string} g @param {number} p @param {boolean} clamp @param {string} [kind] */
  const place = (sx, sy, g, p, clamp, kind) => {
    let c = Math.round(sx / cell);
    let r = Math.round(sy / cell);
    let glyph = g;
    if (Math.max(Math.abs(c), Math.abs(r)) > R) {
      if (!clamp) return;
      const m = Math.max(Math.abs(sx), Math.abs(sy));
      c = Math.round((sx * R) / m);
      r = Math.round((sy * R) / m);
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
      const neighbors = Math.abs(c) === R ? [[c, r - 1], [c, r + 1]] : [[c - 1, r], [c + 1, r]];
      const free = neighbors.find(([nc, nr]) => Math.abs(nc) <= R && Math.abs(nr) <= R &&
        p > prioBuf[(nr + R) * ROW + (nc + R)]);
      if (!free) return;
      idx = (free[1] + R) * ROW + (free[0] + R);
    }
    rows[idx] = glyph;
    if (!prioBuf[idx]) touched.push(idx);
    prioBuf[idx] = p;
  };
  // Protect all four directions from markers (fixed up/right/down/left when north is up).
  for (const [dx, dz, g] of /** @type {[number, number, string][]} */ ([
    [0, -radius * 2, G.Q_NORTH],
    [radius * 2, 0, G.Q_EAST],
    [0, radius * 2, G.Q_SOUTH],
    [-radius * 2, 0, G.Q_WEST],
  ])) {
    const [sx, sy] = screen(dx, dz);
    place(sx, sy, g, 100, true);
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
    place(sx, sy, k.q, 10 + k.p - Math.min(Math.hypot(dx, dz), 999) / 1000, m.kind === "star" || m.kind === "party" || m.kind === "other" || m.kind === "rainbow", m.kind);
  }
  rows[R * ROW + R] = north ? YOU[Math.round(heading / 45) % 8] : YOU[0];
  touched.push(R * ROW + R);
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
 * @typedef {{ player: Player, markers: Marker[], second: string, compass: boolean, radar: boolean, radius: number, north: boolean, terrain: boolean, dest?: string, target?: Spot, dim: string, px: number, pz: number, heading: number, x: number, y: number, z: number, tv?: string, drawn?: number, lag?: boolean, fresh?: number, dirty?: boolean, shown?: Marker[], shownSecond?: string }} View
 */
/** @type {Map<string, View>} */
const views = new Map();

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

/** @param {Player} player @param {Player[]} all @param {Seen[]} seen @param {number} now */
function pass(player, all, seen, now) {
  const pr = prefsOf(player);
  const on = get("enabled") === true;
  const showCompass = on && pr.compass;
  const showRadar = on && pr.radar;
  const sent = lastSent.get(player.id);
  if (!showCompass && !showRadar) {
    views.delete(player.id);
    lastText.delete(player.id);
    if (sent) {
      side.clear(player, "", false);
      side.clear(player, "radar", false);
      side.redraw(player);
      lastSent.delete(player.id);
    }
    if (on) arrival(player, destination(player, all, new Map()));
    return;
  }
  const t0 = Date.now();
  const { markers, liveFolk } = gather(player, seen, pr);
  const dest = destination(player, all, liveFolk);
  const reached = arrival(player, dest);
  let destText = "";
  const done = arrived.get(player.id);
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
  const region = dimId === OVERWORLD ? regions.get(player.id) ?? "" : `In ${DIM_NAMES[dimId] ?? "another dimension"}`;
  /** @type {View} */
  const view = { player, markers, second: showCompass ? line2(region, destText) : "", compass: showCompass, radar: showRadar, radius: pr.radius, north: pr.north, terrain: pr.terrain, dest: dest?.spot?.n, target: dest?.spot, dim: player.dimension.id, px: player.location.x, pz: player.location.z, heading: 0, x: 0, y: 0, z: 0 };
  const old = views.get(player.id);
  const same = !!old && old.dim === view.dim;
  if (same) Object.assign(view, { heading: old.heading, x: old.x, y: old.y, z: old.z, tv: old.tv, drawn: old.drawn, fresh: old.fresh, shown: old.shown, shownSecond: old.shownSecond });
  // Drawn by the per-tick redraw, within its budget (next tick unless many players are waiting), unless the pass found
  // what is already on screen: then only turning, moving, new land or the refresh draws it (a still player's pass
  // costs no strip and radar).
  view.dirty = !same || !!old.dirty || !lastSent.has(player.id) || old.compass !== view.compass || old.radar !== view.radar || old.radius !== view.radius || old.north !== view.north || old.terrain !== view.terrain || view.shownSecond !== view.second || !sameMarkers(view.shown, view.markers);
  views.set(player.id, view);
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
  const radar = v.radar ? radarOf(heading, v.markers, v.radius, v.north, at, v.dim, v.terrain, player.id, rebuildBudget.ok, now) : "";
  const tookRadar = Date.now() - tr;
  if (radarRebuilds > before) {
    planNow.add(player.id); // a new list of what the radar misses
    rebuildBudget.spend(tookRadar);
    drawBudget.spend(-tookRadar); // render() charges its whole time to drawBudget; the rebuild was charged here
  }
  radarMs += tookRadar;
  v.lag = v.radar && radarStale;
  if (!v.lag) {
    v.fresh = now;
    v.tv = terrainVerOf(player.id, v.dim, at, v.radius);
  }
  // What realm:map_debug reports (kept as references; the pose object is made only when asked).
  let shot = lastText.get(player.id);
  if (!shot) lastText.set(player.id, (shot = { strip, line2: v.second, radar, dest: v.dest, target: v.target, at, dim: v.dim, heading, radius: v.radius, north: v.north }));
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
  const compassText = v.second ? `${strip}${SPACER}\n${v.second}` : `${strip}${SPACER}`;
  if (side.held(player)) return false;
  // On screen from now (or already): a pass that finds the same markers and line doesn't draw again.
  v.shown = v.markers;
  v.shownSecond = v.second;
  const sent = lastSent.get(player.id);
  let showC = v.compass && (!sent || !sent.compass || sent.ctext !== compassText || (refresh && now - sent.cat >= REFRESH));
  let showR = v.radar && (!sent || !sent.radar || sent.rtext !== radar || (refresh && now - sent.rat >= REFRESH));
  // A part sent anyway takes the other along once that one is half-way to its refresh, so the two stay in step and
  // a still player's refresh is one title, not one per part.
  if (sent && showC && !showR && v.radar && sent.radar && now - sent.rat >= REFRESH / 2) showR = true;
  if (sent && showR && !showC && v.compass && sent.compass && now - sent.cat >= REFRESH / 2) showC = true;
  const offC = !v.compass && !!sent?.compass;
  const offR = !v.radar && !!sent?.radar;
  if (!showC && !showR && !offC && !offR) return false;
  const t1 = Date.now();
  if (showC) side.show(player, "top", compassText, HOLD, "", false);
  else if (offC) side.clear(player, "", false);
  if (showR) side.show(player, "radar", radar, HOLD, "radar", false);
  else if (offR) side.clear(player, "radar", false);
  side.redraw(player);
  lastSent.set(player.id, {
    ctext: v.compass ? compassText : "", cat: showC ? now : sent?.cat ?? now,
    rtext: v.radar ? radar : "", rat: showR ? now : sent?.rat ?? now,
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
  const sent = lastSent.get(player.id);
  if (!sent || side.held(player)) return false;
  const t1 = Date.now();
  // None of its parts is up any more (they ran out): build and send them again.
  if (!side.keep(player, HOLD)) return render(player, v, now, true);
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
/** Players whose turning and moving is checked a tick (all of them up to this many, else taking turns). */
const TURN_CHECKS = 12;
let turnFirst = 0;
/**
 * The redraw's time: building strips and radars and sending them (drawBudget), and building a radar's terrain
 * picture again (rebuildBudget, ~1 ms each). With many players moving at once a player's strip comes a few ticks
 * later and their terrain picture lags (it is drawn with the markers of the same moment), instead of the server.
 */
const drawBudget = new Budget(1, 8, 3);
const rebuildBudget = new Budget(0.4, 6, 2);
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
  let k = -1;
  for (const v of views.values()) {
    k++;
    const p = v.player;
    // A new pass or a radar waiting for its terrain is always due; the others are looked at in turns.
    if (!v.dirty && !v.lag && (k - turnFirst + n) % n >= checks) continue;
    try {
      if (!p.isValid) continue;
      // Another dimension (a portal) or far from where the pass looked (a teleport): wait for the next pass.
      if (p.dimension.id !== v.dim) {
        views.delete(p.id);
        continue;
      }
      const at = p.location;
      if (Math.abs(at.x - v.px) + Math.abs(at.z - v.pz) > FAR_MOVE) continue;
      const sent = lastSent.get(p.id);
      const refresh = !!sent && now - Math.min(sent.compass ? sent.cat : Infinity, sent.radar ? sent.rat : Infinity) >= REFRESH;
      /** @type {number | undefined} read only when a new pass didn't already settle it; render() reads it otherwise, inside the draw budget */
      let heading;
      const changed = !!v.dirty || Math.abs(wrap((heading = headingOf(p)) - v.heading)) >= TURN_MIN || Math.abs(at.x - v.x) + Math.abs(at.y - v.y) + Math.abs(at.z - v.z) >= MOVE_MIN || (v.radar && v.terrain && v.tv !== terrainVerOf(p.id, v.dim, at, v.radius));
      const moved = refresh || changed;
      if (!moved && !v.lag) continue;
      // Moving fast (flying, riding): the scanner plans ahead for them often.
      if (Math.abs(at.x - v.x) + Math.abs(at.z - v.z) > 0.6 * Math.max(1, now - (v.drawn ?? now))) planNow.add(p.id);
      due.push({ p, v, refresh, moved, keep: refresh && !changed && !v.lag, heading, at });
    } catch (e) {
      console.warn(`[map] turn: ${e}`);
    }
  }
  if (n) turnFirst = (turnFirst + checks) % n;
  turnCheckMs += Date.now() - t0;
  // The longest-waiting first: a lagging radar waits since it was last up to date.
  const waited = (/** @type {View} */ v) => (v.lag ? v.fresh ?? 0 : v.drawn ?? 0);
  if (due.length > 1) due.sort((a, b) => waited(a.v) - waited(b.v));
  let sends = 0;
  let built = 0;
  const refreshBefore = refreshSends;
  for (const { p, v, refresh, moved, keep, heading, at } of due) {
    if (sends >= TURN_BUDGET || built >= RENDER_BUDGET || !drawBudget.ok) break;
    // A radar waiting for its terrain, with nothing else new, waits for a rebuild in the budget.
    if (!moved && !rebuildBudget.ok) continue;
    const tr = Date.now();
    try {
      if (keep) {
        // Nothing they see changed: the same title again, so it doesn't fade (no strip or radar is built).
        if (keepAlive(p, v, now)) {
          sends++;
          refreshSends++;
          keepSends++;
        }
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
const passBudget = new Budget(0.5, 6, 2);
/** Player id -> tick of their last pass. @type {Map<string, number>} */
const passAt = new Map();

/**
 * budgetLevel: each budget's share of its normal size (perTick, max and tickMax alike), in the order drawing, terrain
 * pictures, passes, scanner. "low" keeps the drawing budget: with many players it is what keeps every strip and radar
 * from fading (one refresh per player every REFRESH ticks fills about 1 ms a tick at 100 players); the terrain pictures,
 * passes and scanner give: the radar's land and mob markers lag more, about 2.0 ms a tick in all instead of 2.9.
 */
const BUDGET_LEVELS = { low: [1, 0.5, 0.6, 0.5], normal: [1, 1, 1, 1], high: [1.5, 1.5, 1.5, 1.5] };
/** @type {[Budget, number, number, number][]} each budget with its normal perTick, max and tickMax */
const BUDGETS = [drawBudget, rebuildBudget, passBudget, scanBudget].map((b) => [b, b.perTick, b.max, b.tickMax]);
let budgetLevel = "";
/** Sets the budgets to budgetLevel's share (at load and when an operator changes it). */
function applyBudgetLevel() {
  const level = String(get("budgetLevel"));
  if (level === budgetLevel) return;
  budgetLevel = level;
  const ks = BUDGET_LEVELS[/** @type {keyof typeof BUDGET_LEVELS} */ (level)] ?? BUDGET_LEVELS.normal;
  for (const [i, [b, perTick, max, tickMax]] of BUDGETS.entries()) {
    const k = ks[i];
    b.perTick = perTick * k;
    b.max = max * k;
    b.tickMax = tickMax * k;
    b.left = Math.min(b.left, b.max);
  }
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
        seen.push({ id: p.id, dim: p.dimension.id, x: l.x, z: l.z, party: partyTag(p) });
      } catch {
        // left meanwhile
      }
    }
    costPasses++;
  }
  const each = Math.min(PASS_EACH, Math.max(1, Math.ceil(all.length / INTERVAL)));
  const due = oldestDue(all, passAt, now, INTERVAL, each);
  if (!due.length) return;
  for (const p of due) {
    if (!passBudget.ok) break;
    // The shared list can hold a player who left earlier this tick: no entry for them (playerLeave already ran).
    if (!p.isValid) continue;
    passAt.set(p.id, now);
    const t = Date.now();
    try {
      pass(p, all, seen, now);
    } catch (e) {
      console.warn(`[map] ${e}`);
    }
    passBudget.spend(Date.now() - t);
  }
}, 1);

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  for (const m of [wpCache, marksCache, arrived, prefCache, lastSent, lastText, npcCache, regions, sites, waystones, tracks, deaths, views, terrainBaseMemo, playerStore, scanPlans, passAt, retryAt, lastPose]) m.delete(playerId);
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
      const t = player ? lastText.get(player.id) : undefined;
      const surface = player ? terrain.store(player.dimension.id, undefined) : undefined;
      send("realm:map_state", {
        player: player?.id,
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
            x: s.x, z: s.z, resolution: s.resolution === 1 ? 1 : 4,
            data: terrain.get(storeFor(player.id, player.dimension.id), s.x, s.z, s.resolution === 1 ? 1 : 4) ?? null,
          })) : [],
        } : undefined,
        cost: { ms: costMs, drawMs, passes: costPasses, players: costPlayers, turnMs, turnTicks, turnDraws, turnSends, scanReads, scanTicks, scanMs, scanPeak, scanEachPeak, scanPlanMs, plansMade: planTurn.made, refreshSends, keepSends, rebuilds: radarRebuilds, turnCheckMs, radarMs, readCost },
        budgets: { draw: drawBudget.left, rebuild: rebuildBudget.left, pass: passBudget.left, scan: scanBudget.left },
        budgetLevel,
        perTick: BUDGETS.reduce((n, [b]) => n + b.perTick, 0),
        known: { folk: folk.size, camps: camps.size, towns: towns.size, pot: pot ?? null, waystones: player ? waystones.get(player.id)?.length ?? 0 : 0, sites: player ? sites.get(player.id)?.length ?? 0 : 0, region: player ? regions.get(player.id) ?? "" : "", death: player ? !!deaths.get(player.id) : false, track: player ? tracks.get(player.id)?.n ?? "" : "", deathAt: player ? deaths.get(player.id) ?? null : null },
      });
      if (m.action === "cost") {
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
        radarRebuilds = 0;
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
  system.runTimeout(() => ping(), 60);
});
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  resetChecked.delete(player.id);
  applyReset(player);
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
  customCommandRegistry.registerCommand(
    { name: "realm:minimap", description: "Toggle your minimap radar on or off", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => {
      const player = playerOf(origin);
      if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => {
        if (player.isValid) toggleMinimap(player);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
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
