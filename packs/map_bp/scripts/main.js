// Minimap: a compass strip at the top of the screen, an optional radar, destinations and Mara's Field Map.
// Scripts can't draw on the HUD or on map items, so the picture is made of glyphs (glyphs.js, drawn by the
// glyph page in Side HUD, hud_rp) sent in the Side HUD title (side.js: the strip in slot "top", the radar in
// slot "radar" as the part "map/radar"). The land itself is Bedrock's own locator map, held in the offhand.
//
// Every intervalTicks per player who has the strip or the radar on (the pass): one entity search for monsters
// within their mob radius (the nearest maxMobs), one for realm:npc within npcRange; everything else is arithmetic
// on what other packs broadcast. In between, every tick, the strip and radar are drawn again from the pass's
// markers for players who turned or moved (at most TURN_BUDGET titles a tick), so the compass follows the view.
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
import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { G } from "./glyphs.js";
import { get, getFor, onChange, setFor } from "./settings.js";
import { sideBoxes } from "./side.js";

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

const side = sideBoxes("map");
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
}
/** @param {Player} player @returns {Spot[]} */
function marksOf(player) {
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
    if (s) s.key = "";
    views.delete(player.id); // drawn again from scratch at the next pass
  } else {
    for (const s of lastSent.values()) s.key = "";
    views.clear();
  }
});

/** What was last sent to each player: the text and when. @type {Map<string, { key: string, at: number, compass: boolean, radar: boolean }>} */
const lastSent = new Map();
/** The last strip, its second line and the radar per player (realm:map_debug). @type {Map<string, { strip: string, line2: string, radar: string, dest?: string }>} */
const lastText = new Map();
let costMs = 0;
/** Of costMs, the time spent sending the title (side.js: two realm:side events and setTitle). */
let drawMs = 0;
let costPasses = 0;
let costPlayers = 0;

/** A live player's position, if they're online. @param {string} id @param {Player[]} all */
const onlineById = (id, all) => all.find((p) => p.id === id);

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
    else if (others) add("other", s.x, s.z, true);
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

/** @typedef {{ kind: string, y: number, depth: number, g: string, tick: number }} TerrainCell */
/** Cached 4x4 terrain surface data by numeric key. @type {Map<number, TerrainCell>} */
const terrainCache = new Map();
/** Per-player terrain version, bumped only when a player's full grid finishes scanning or a block changes. @type {Map<string, number>} */
const playerTerrainVer = new Map();
let globalTerrainVer = 0;
const terrainVerOf = (/** @type {string} */ id) => (playerTerrainVer.get(id) ?? 0) + globalTerrainVer;
/** Per-player memoized 441-cell terrain base array so stationary/slow players do 0 trig or Map lookups in radarOf. @type {Map<string, { key: string, base: string[] }>} */
const terrainBaseMemo = new Map();

/** @param {string} dimId */
const dimIndex = (dimId) => (dimId === OVERWORLD ? 0 : dimId === "minecraft:nether" ? 1 : 2);
/** @param {string} dimId @param {number} wx @param {number} wz */
const terrainKey = (dimId, wx, wz) => {
  const qx = (Math.floor(wx / 4) + 0x4000) & 0x7fff;
  const qz = (Math.floor(wz / 4) + 0x4000) & 0x7fff;
  return dimIndex(dimId) * 0x40000000 + ((qx << 15) | qz);
};

/** @param {string} id */
const isWaterBlock = (id) => id.includes("water") || id.includes("kelp") || id.includes("seagrass") || id.includes("bubble_column");

/**
 * Classifies a surface block into terrain kind, surface height, and water depth.
 * @param {import("@minecraft/server").Block | undefined} block @param {number} playerY @param {import("@minecraft/server").Dimension} [dim]
 * @param {number} [wx] @param {number} [wz] @param {number} [step] @param {boolean} [isRoofed] the player is under a roof (or in the Nether), so high ground may be cave
 * @returns {{ kind: string, y: number, depth: number }}
 */
function classifyTerrainKind(block, playerY, dim, wx = 0, wz = 0, step = 0, isRoofed = false) {
  if (!block && dim?.id !== "minecraft:nether") return { kind: "empty", y: Math.floor(playerY), depth: 0 };
  const y = block ? Math.floor(block.location.y) : Math.floor(playerY + 16);
  if (((isRoofed && playerY < y - 8) || dim?.id === "minecraft:nether") && dim) {
    try {
      const bx = Math.floor(wx ?? block?.location.x ?? 0);
      const bz = Math.floor(wz ?? block?.location.z ?? 0);
      const here = dim.getBlock({ x: bx, y: Math.floor(playerY + 1), z: bz });
      const floor = dim.getBlock({ x: bx, y: Math.floor(playerY - 1), z: bz });
      if (here && !here.isAir && !isWaterBlock(here.typeId.toLowerCase()) && !here.typeId.includes("lava")) {
        return { kind: "cave_wall", y: Math.floor(playerY), depth: 0 };
      }
      if (floor) {
        const fid = floor.typeId.toLowerCase();
        if (fid.includes("lava") || fid.includes("magma")) return { kind: "lava", y: Math.floor(playerY - 1), depth: 0 };
        if (isWaterBlock(fid)) return { kind: "water", y: Math.floor(playerY - 1), depth: 1 };
      }
      return { kind: "cave_floor", y: Math.floor(playerY - 1), depth: 0 };
    } catch {
      return { kind: "cave", y: Math.floor(playerY), depth: 0 };
    }
  }
  if (!block) return { kind: "empty", y: Math.floor(playerY), depth: 0 };
  const id = block.typeId.toLowerCase();
  if (isWaterBlock(id)) {
    let depth = 2;
    try {
      const b1 = block.below(1);
      if (b1 && !isWaterBlock(b1.typeId.toLowerCase())) {
        depth = 1;
      } else {
        const b3 = block.below(3);
        if (b3 && isWaterBlock(b3.typeId.toLowerCase())) depth = 3;
      }
    } catch {
      // unloaded or out of bounds
    }
    return { kind: "water", y, depth };
  }
  if (/lava|magma/.test(id)) return { kind: "lava", y, depth: 0 };
  if (/cherry_leaves|pink_petals|cherry_/.test(id)) return { kind: "cherry", y, depth: 0 };
  if (/birch_leaves|azalea/.test(id)) return { kind: "birch", y, depth: 0 };
  if (/spruce_leaves|podzol/.test(id)) return { kind: "spruce", y, depth: 0 };
  if (/mangrove|mud|swamp|lily_pad/.test(id)) return { kind: "swamp", y, depth: 0 };
  if (/acacia|hay_block|dry_grass|dead_bush/.test(id)) return { kind: "savanna", y, depth: 0 };
  if (/warped_/.test(id)) return { kind: "warped", y, depth: 0 };
  if (/netherrack|nylium|nyllium|wart_block|crimson|soul_/.test(id)) return { kind: "nether", y, depth: 0 };
  if (/end_stone|purpur|chorus/.test(id)) return { kind: "end", y, depth: 0 };
  if (/packed_ice|blue_ice|frosted_ice/.test(id)) return { kind: "ice", y, depth: 0 };
  if (/deepslate|obsidian|basalt|blackstone|bedrock|tuff/.test(id)) return { kind: "deepslate", y, depth: 0 };
  if (/brick|copper|shingle|tile/.test(id)) return { kind: "brick", y, depth: 0 };
  if (/terracotta|red_sand/.test(id)) return { kind: "mesa", y, depth: 0 };
  if (/snow|ice/.test(id)) return { kind: "snow", y, depth: 0 };
  if (/sand|gravel|sandstone/.test(id)) return { kind: "sand", y, depth: 0 };
  if (/leaves|_log|bamboo|vine/.test(id)) return { kind: "forest", y, depth: 0 };
  if (/path|planks|cobble|stairs|slab|wool|concrete|lantern|glass|fence|door|trapdoor|iron_block|gold_block/.test(id)) return { kind: "path", y, depth: 0 };
  if (/stone|andesite|diorite|granite|calcite|dripstone|ore/.test(id)) return { kind: "stone", y, depth: 0 };
  if (step < 1 && /short_grass|tall_grass|fern|flower|dandelion|poppy|tulip|orchid|allium|bluet|daisy|cornflower|lily|rose|peony|lilac|bush/.test(id)) {
    try {
      const below = block.below(1);
      if (below) return classifyTerrainKind(below, playerY, dim, wx, wz, step + 1, isRoofed);
    } catch {
      // unloaded chunk
    }
  }
  return { kind: "grass", y, depth: 0 };
}

/**
 * Bakes the 3D relief-shaded radar glyph for a cached terrain cell.
 * @param {string} dimId @param {number} wx @param {number} wz @param {{ kind: string, y: number, depth: number }} cur
 */
function bakeTerrainGlyph(dimId, wx, wz, cur) {
  if (!cur || cur.kind === "empty") return G.Q_EMPTY;
  if (cur.kind === "water") return cur.depth <= 1 ? G.Q_WATER_SHALLOW : cur.depth >= 3 ? G.Q_WATER_DEEP : G.Q_WATER;
  if (cur.kind === "lava") return G.Q_LAVA;
  if (cur.kind === "cave") return G.Q_CAVE;
  if (cur.kind === "cave_floor") return G.Q_CAVE_FLOOR;
  if (cur.kind === "cave_wall") return G.Q_CAVE_WALL;
  if (cur.kind === "cherry") return G.Q_CHERRY;
  if (cur.kind === "birch") return G.Q_BIRCH;
  if (cur.kind === "spruce") return G.Q_SPRUCE;
  if (cur.kind === "savanna") return G.Q_SAVANNA;
  if (cur.kind === "swamp") return G.Q_SWAMP;
  if (cur.kind === "deepslate") return G.Q_DEEPSLATE;
  if (cur.kind === "brick") return G.Q_BRICK;
  if (cur.kind === "warped") return G.Q_WARPED;
  if (cur.kind === "ice") return G.Q_ICE;
  if (cur.kind === "nether") return G.Q_NETHER;
  if (cur.kind === "end") return G.Q_END;
  const north = terrainCache.get(terrainKey(dimId, wx, wz - 4));
  const west = terrainCache.get(terrainKey(dimId, wx - 4, wz));
  const dh = (cur.y - (north?.y ?? cur.y)) + (cur.y - (west?.y ?? cur.y));
  switch (cur.kind) {
    case "mesa":
      return dh >= 2 ? G.Q_MESA_HI : dh <= -2 ? G.Q_MESA_LO : G.Q_MESA;
    case "forest":
      return dh >= 2 ? G.Q_FOREST_HI : dh <= -2 ? G.Q_FOREST_LO : G.Q_FOREST;
    case "sand":
      return dh >= 2 ? G.Q_SAND_HI : dh <= -2 ? G.Q_SAND_LO : G.Q_SAND;
    case "stone":
      return dh >= 2 ? G.Q_STONE_HI : dh <= -2 ? G.Q_STONE_LO : G.Q_STONE;
    case "snow":
      return dh >= 2 ? G.Q_SNOW_HI : dh <= -2 ? G.Q_SNOW_LO : G.Q_SNOW;
    case "path":
      return dh >= 2 ? G.Q_PATH_HI : dh <= -2 ? G.Q_PATH_LO : G.Q_PATH;
    case "grass":
    default:
      return dh >= 2 ? G.Q_GRASS_HI : dh <= -2 ? G.Q_GRASS_LO : G.Q_GRASS;
  }
}

world.afterEvents.playerPlaceBlock.subscribe(({ block }) => {
  try {
    if (terrainCache.delete(terrainKey(block.dimension.id, block.location.x, block.location.z))) globalTerrainVer++;
  } catch {
    // ignore
  }
});
world.afterEvents.playerBreakBlock.subscribe(({ block }) => {
  try {
    if (terrainCache.delete(terrainKey(block.dimension.id, block.location.x, block.location.z))) globalTerrainVer++;
  } catch {
    // ignore
  }
});

// Terrain scanner, every tick like the compass: each player's uncached 4x4 columns around them, nearest the
// player (and where they are heading) first. The cache is world data keyed by dimension and block position, so
// what one player scans is already there for everyone else. A player's terrain version bumps as soon as any
// column was added, so a fast flier sees the ground fill in without lag.
system.runInterval(() => {
  if (get("enabled") !== true) return;
  const now = system.currentTick;
  for (const player of world.getAllPlayers()) scanTerrain(player, now);
}, 1);

/** @param {Player} player @param {number} now */
function scanTerrain(player, now) {
  try {
    if (!player || !player.isValid) return;
    const pr = prefsOf(player);
    if (!pr.radar || !pr.terrain) return;
    const dim = player.dimension;
    const dimId = dim.id;
    const at = player.location;
    const step = Math.max(2, Math.round(pr.radius / R));
    /** @type {{ wx: number, wz: number, key: number, d: number }[]} */
    const todo = [];
    /** @type {Set<number>} */
    const seenKeys = new Set();
    const vel = player.getVelocity?.() ?? { x: 0, z: 0 };
    const leadX = Math.max(-28, Math.min(28, vel.x * 8));
    const leadZ = Math.max(-28, Math.min(28, vel.z * 8));
    const cx = at.x + leadX;
    const cz = at.z + leadZ;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const wx = at.x + dx * step;
        const wz = at.z + dz * step;
        const key = terrainKey(dimId, wx, wz);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        const entry = terrainCache.get(key);
        if (entry && now - entry.tick <= 2400) continue;
        todo.push({ wx, wz, key, d: (wx - cx) * (wx - cx) + (wz - cz) * (wz - cz) });
      }
    }
    if (Math.hypot(leadX, leadZ) >= 4) {
      for (let dz = -R; dz <= R; dz += 2) {
        for (let dx = -R; dx <= R; dx += 2) {
          const wx = cx + dx * step;
          const wz = cz + dz * step;
          const key = terrainKey(dimId, wx, wz);
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          const entry = terrainCache.get(key);
          if (entry && now - entry.tick <= 2400) continue;
          todo.push({ wx, wz, key, d: (wx - cx) * (wx - cx) + (wz - cz) * (wz - cz) });
        }
      }
    }
    if (!todo.length) return;
    const topAtPlayer = dim.getTopmostBlock({ x: Math.floor(at.x), z: Math.floor(at.z) });
    const isRoofed = dimId === "minecraft:nether" || (!!topAtPlayer && topAtPlayer.location.y > at.y + 6);
    todo.sort((a, b) => a.d - b.d);
    let changed = false;
    for (const { wx, wz, key } of todo.slice(0, 48)) {
      const block = dim.getTopmostBlock({ x: Math.floor(wx), z: Math.floor(wz) });
      if (terrainCache.size > 6000) terrainCache.delete(/** @type {number} */ (terrainCache.keys().next().value));
      const info = classifyTerrainKind(block, at.y, dim, wx, wz, 0, isRoofed);
      const g = bakeTerrainGlyph(dimId, wx, wz, info);
      terrainCache.set(key, { ...info, g, tick: now });
      changed = true;
    }
    if (changed) playerTerrainVer.set(player.id, (playerTerrainVer.get(player.id) ?? 0) + 1);
  } catch {
    // unloaded chunk or player left
  }
}

const RADAR_SIZE = 2 * R + 1;
const RADAR_CELLS = RADAR_SIZE * RADAR_SIZE;
const EMPTY_BASE = /** @type {string[]} */ (Array(RADAR_CELLS).fill(G.Q_EMPTY));
const gridBuf = /** @type {string[]} */ (Array(RADAR_CELLS));
const prioBuf = new Float64Array(RADAR_CELLS);
const rowStrs = /** @type {string[]} */ (Array(RADAR_SIZE));

/**
 * The cached glyph at a place; if that 4x4 isn't scanned yet (a fast flier outruns the scanner), a neighbor's, then
 * the dimension's ground, so the radar never shows holes.
 * @param {string} dimId @param {number} wx @param {number} wz
 */
function terrainGlyphAt(dimId, wx, wz) {
  const hit = terrainCache.get(terrainKey(dimId, wx, wz))?.g;
  if (hit) return hit;
  for (const [ox, oz] of [[4, 0], [-4, 0], [0, 4], [0, -4], [4, 4], [-4, -4], [4, -4], [-4, 4]]) {
    const near = terrainCache.get(terrainKey(dimId, wx + ox, wz + oz))?.g;
    if (near) return near;
  }
  return dimId === OVERWORLD ? G.Q_GRASS : dimId === "minecraft:nether" ? G.Q_NETHER : G.Q_END;
}

/**
 * The radar: 21 x 21 cells, the player in the middle, `radius` blocks to the edge; north up or turned so ahead is up.
 * The destination, party mates and online friends beyond the edge sit on it as directional arrows.
 * @param {number} heading @param {Marker[]} markers @param {number} radius @param {boolean} north @param {{ x: number, z: number }} at the player
 * @param {string} [dimId] @param {boolean} [useTerrain] @param {string} [playerId]
 */
function radarOf(heading, markers, radius, north, at, dimId = OVERWORLD, useTerrain = false, playerId = "") {
  const h = (heading * Math.PI) / 180;
  const cos = Math.cos(h);
  const sin = Math.sin(h);
  const cell = radius / R;
  if (!useTerrain || !terrainCache.size) {
    for (let i = 0; i < RADAR_CELLS; i++) gridBuf[i] = G.Q_EMPTY;
  } else {
    const pVer = (playerTerrainVer.get(playerId) ?? 0) + globalTerrainVer;
    const memoKey = `${dimId}|${Math.round(at.x)}|${Math.round(at.z)}|${north ? 0 : Math.round(heading)}|${radius}|${pVer}`;
    const hit = playerId ? terrainBaseMemo.get(playerId) : undefined;
    if (hit && hit.key === memoKey) {
      const b = hit.base;
      for (let i = 0; i < RADAR_CELLS; i++) gridBuf[i] = b[i];
    } else {
      const base = /** @type {string[]} */ (Array(RADAR_CELLS));
      let idx = 0;
      for (let row = -R; row <= R; row++) {
        const sy = row * cell;
        for (let col = -R; col <= R; col++) {
          const sx = col * cell;
          const dx = north ? sx : sx * cos - sy * sin;
          const dz = north ? sy : sx * sin + sy * cos;
          base[idx] = terrainGlyphAt(dimId, at.x + dx, at.z + dz);
          gridBuf[idx] = base[idx];
          idx++;
        }
      }
      if (playerId) terrainBaseMemo.set(playerId, { key: memoKey, base });
    }
  }
  prioBuf.fill(0);
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
    const idx = (r + R) * RADAR_SIZE + (c + R);
    if (p <= prioBuf[idx]) return;
    gridBuf[idx] = glyph;
    prioBuf[idx] = p;
  };
  // The four compass points sit on the edge and turn with the view (fixed up/right/down/left when north is up).
  for (const [dx, dz, g] of /** @type {[number, number, string][]} */ ([
    [0, -radius * 2, G.Q_NORTH],
    [radius * 2, 0, G.Q_EAST],
    [0, radius * 2, G.Q_SOUTH],
    [-radius * 2, 0, G.Q_WEST],
  ])) {
    const [sx, sy] = screen(dx, dz);
    place(sx, sy, g, 25, true);
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
  gridBuf[R * RADAR_SIZE + R] = north ? YOU[Math.round(heading / 45) % 8] : YOU[0];
  for (let r = 0; r < RADAR_SIZE; r++) {
    let s = "";
    const rowOff = r * RADAR_SIZE;
    for (let c = 0; c < RADAR_SIZE; c++) s += gridBuf[rowOff + c];
    rowStrs[r] = s;
  }
  return rowStrs.join("\n");
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
 * @typedef {{ player: Player, markers: Marker[], second: string, compass: boolean, radar: boolean, radius: number, north: boolean, terrain: boolean, dest?: string, dim: string, px: number, pz: number, heading: number, x: number, z: number, tv?: number }} View
 */
/** @type {Map<string, View>} */
const views = new Map();

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
  const view = { player, markers, second: showCompass ? line2(region, destText) : "", compass: showCompass, radar: showRadar, radius: pr.radius, north: pr.north, terrain: pr.terrain, dest: dest?.spot?.n, dim: player.dimension.id, px: player.location.x, pz: player.location.z, heading: 0, x: 0, z: 0 };
  views.set(player.id, view);
  render(player, view, now, true);
  costMs += Date.now() - t0;
  costPlayers++;
}

/**
 * Draws the strip and radar for where the player faces and stands now, from the last pass's markers. Sent when
 * the text changed; with `refresh` (the pass) also when it's REFRESH ticks old, so it never fades.
 * @param {Player} player @param {View} v @param {number} now @param {boolean} refresh
 */
function render(player, v, now, refresh) {
  const heading = headingOf(player);
  const at = player.location;
  v.heading = heading;
  v.x = at.x;
  v.z = at.z;
  v.tv = terrainVerOf(player.id);
  const strip = v.compass ? stripOf(heading, v.markers, at) : "";
  const radar = v.radar ? radarOf(heading, v.markers, v.radius, v.north, at, v.dim, v.terrain, player.id) : "";
  lastText.set(player.id, { strip, line2: v.second, radar, dest: v.dest });
  const compassText = v.second ? `${strip}${SPACER}\n${v.second}` : `${strip}${SPACER}`;
  const key = `${compassText}|${radar}`;
  const sent = lastSent.get(player.id);
  if (side.held(player) || (sent && sent.key === key && (!refresh || now - sent.at < REFRESH))) return false;
  const t1 = Date.now();
  if (v.compass) side.show(player, "top", compassText, HOLD, "", false);
  else if (sent?.compass) side.clear(player, "", false);
  if (v.radar) side.show(player, "radar", radar, HOLD, "radar", false);
  else if (sent?.radar) side.clear(player, "radar", false);
  side.redraw(player);
  lastSent.set(player.id, { key, at: now, compass: v.compass, radar: v.radar });
  drawMs += Date.now() - t1;
  return true;
}

/** Turning by less than this (degrees) or moving less than this (blocks) between ticks doesn't redraw. */
const TURN_MIN = 0.5;
const MOVE_MIN = 0.25;
/** Moved farther than this (blocks) since the pass: a teleport, so the markers wait for the next pass. */
const FAR_MOVE = 256;
/**
 * Titles sent per tick at most by the per-tick redraw. Each one is also a realm:side message that every other pack
 * with side boxes reads (about 0.06 ms each, measured), so with many players turning at once the ones drawn longest
 * ago go first and the rest follow a tick later.
 */
const TURN_BUDGET = 8;
let turnMs = 0;
let turnTicks = 0;
let turnDraws = 0;
let turnSends = 0;

// Every tick between passes: the strip and radar turn with the player (the pass, every intervalTicks, finds what's
// around). Only players who turned or moved are drawn again, and only a changed text is sent.
system.runInterval(() => {
  if (!views.size) return;
  const t0 = Date.now();
  const now = system.currentTick;
  /** @type {{ p: Player, v: View, at: number }[]} */
  const due = [];
  for (const v of views.values()) {
    const p = v.player;
    try {
      if (!p.isValid) continue;
      // Another dimension (a portal) or far from where the pass looked (a teleport): wait for the next pass.
      if (p.dimension.id !== v.dim) {
        views.delete(p.id);
        continue;
      }
      const at = p.location;
      if (Math.abs(at.x - v.px) + Math.abs(at.z - v.pz) > FAR_MOVE) continue;
      if (Math.abs(wrap(headingOf(p) - v.heading)) < TURN_MIN && Math.abs(at.x - v.x) + Math.abs(at.z - v.z) < MOVE_MIN && v.tv === terrainVerOf(p.id)) continue;
      due.push({ p, v, at: lastSent.get(p.id)?.at ?? 0 });
    } catch (e) {
      console.warn(`[map] turn: ${e}`);
    }
  }
  if (due.length > TURN_BUDGET) due.sort((a, b) => a.at - b.at);
  let sends = 0;
  for (const { p, v } of due) {
    if (sends >= TURN_BUDGET) break;
    try {
      turnDraws++;
      if (render(p, v, now, false)) sends++;
    } catch (e) {
      console.warn(`[map] turn: ${e}`);
    }
  }
  turnSends += sends;
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

system.runInterval(() => {
  const now = system.currentTick;
  const all = world.getAllPlayers();
  /** Every player's place and party once a pass, for the others' markers. @type {Seen[]} */
  const seen = [];
  for (const p of all) {
    try {
      const l = p.location;
      seen.push({ id: p.id, dim: p.dimension.id, x: l.x, z: l.z, party: partyTag(p) });
    } catch {
      // left meanwhile
    }
  }
  for (const p of all) {
    try {
      if (p.isValid) pass(p, all, seen, now);
    } catch (e) {
      console.warn(`[map] ${e}`);
    }
  }
  if (all.length) costPasses++;
}, Math.max(10, Math.round(Number(CONFIG.intervalTicks) || 10)));

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  for (const m of [wpCache, marksCache, arrived, prefCache, lastSent, lastText, npcCache, regions, sites, waystones, tracks, deaths, views, terrainBaseMemo, playerTerrainVer]) m.delete(playerId);
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
  for (let i = 0; i < inv.size; i++) {
    const it = inv.getItem(i);
    if (!it || it.typeId !== "minecraft:empty_map" || it.nameTag || before.has(i)) continue;
    it.nameTag = "§eMara's Field Map";
    it.setLore(["§7Hold it in your other hand", "§7(offhand) and use it once:", "§7the land and your arrow show", "§7in the corner of your view."]);
    inv.setItem(i, it);
    break;
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
  await actions[res.selection][1]();
}

/** @param {Player} player */
async function markMenu(player) {
  const form = new ModalFormData().title("Mark this spot").textField("Name", "e.g. Iron cave", { defaultValue: `Spot ${marksOf(player).length + 1}` });
  const res = await show(player, form);
  if (!res || res.canceled || !player.isValid) return;
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
    const groups = choices(player);
    const form = new ActionFormData().title("Pick a destination").body("§7The gold star on your compass strip and radar points there. A destination clears when you arrive.");
    for (const [name, list] of groups) form.button(`${name}\n§8${list.length ? `${list.length} to pick from` : "None yet"}`);
    form.button("Back");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
    if (res.selection >= groups.length) return menu(player);
    const [name, list] = groups[res.selection];
    if (!list.length) {
      player.sendMessage(`§7[Map] ${name}: none yet.`);
      continue;
    }
    if (await listMenu(player, name, list)) return;
  }
}

/** @param {Player} player @param {string} title @param {Waypoint[]} list @returns {Promise<boolean>} whether one was picked (or the menu closed) */
async function listMenu(player, title, list) {
  const sorted = [...list].sort((a, b) => distTo(player, a) - distTo(player, b)).slice(0, MENU_MAX);
  const marks = sorted[0]?.k === "mark";
  const form = new ActionFormData().title(title);
  for (const w of sorted) form.button(`${w.n}\n§8${where(player, w)}`);
  if (marks) form.button("Forget a spot\n§8Remove one from the list");
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return true;
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
  const list = marksOf(player);
  const form = new ActionFormData().title("Forget a spot");
  for (const m of list) form.button(`${m.n}\n§8${where(player, m)}`);
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || res.selection >= list.length || !player.isValid) return;
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
      send("realm:map_state", {
        player: player?.id,
        strip: t?.strip,
        line2: t?.line2,
        radar: t?.radar,
        dest: t?.dest,
        wp: player ? waypointOf(player) ?? null : null,
        cost: { ms: costMs, drawMs, passes: costPasses, players: costPlayers, turnMs, turnTicks, turnDraws, turnSends },
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
      }
      return;
    }
  }
}

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message, sourceEntity }) => {
    if (!EVENTS.has(id)) return;
    try {
      const m = JSON.parse(message);
      if (m && typeof m === "object") onEvent(id, m, sourceEntity);
    } catch {
      // not ours
    }
  },
  { namespaces: ["realm"] }
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
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "map_bp");
  },
  { namespaces: ["realm"] }
);
