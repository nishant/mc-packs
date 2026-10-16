import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Entity,
  GameMode,
  Player,
  ItemStack,
  WeatherType,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { CALENDAR, FESTIVAL_LINES, GOSSIP, HEARTH, LEVEL_NAMES, REACTIONS } from "./hearth.js";
import { get } from "./settings.js";

// Townsfolk are vanilla minecraft:npc entities (invulnerable, they don't wander, and operators can pick one of
// the game's skins in its NPC editor). Where each one belongs is saved in the world, so an NPC that goes
// missing is found again or spawned again, and taps run the offer round other packs answer (see the spec in
// docs/PACKS.md, "Townsfolk"):
//   realm:npc_talk  { req, player, npc, roles, name }   -> every pack
//   realm:npc_offer { req, pack, key, label, order? }   <- packs with something for this NPC, within 4 ticks
//   realm:npc_choose { player, npc, pack, key }         -> the pack whose button the player picked
// Hearth & Hearsay (affinity, gifts, gossip, schedules, the Realm day counter) is further down; its protocol:
//   realm:affinity { player, npc, level, pts, off } on a level change, { player, all, off } on join  -> consumers
//   realm:gossip   { kind, player, name?, place?, n? }                                              <- producers
//   realm:npc_flags { player, flags }                                                               <- saga_bp
//   realm:calendar { day, season, festival?, ends?, doy, year, from }   at dawn, on join, on realm:calendar_ping
//   realm:mail_send { to, from, subject, body }                                                     -> mail_bp
// For the Minimap: realm:npc_places { part, parts, folk: [{ id, n, dim, x, z }] } on a change and on realm:npc_places_ping.

const PROP_LIST = "npc:list"; // world: JSON Placed[], where each townsfolk lives
const PROP_WEATHER = "npc:weather"; // world: overworld weather from the last change; scripts can't read the current weather

const NPC_TYPE = "minecraft:npc";
const OWNER_TAG = "realm:npc_owner:npc_bp";
const NPC_TAG = "realm:npc";
const ID_TAG = "realm:npc_id:";
const ROLE_TAG = "realm:npc_role:";
const OVERWORLD = "minecraft:overworld";
const DIMENSIONS = [OVERWORLD, "minecraft:nether", "minecraft:the_end"];

const LOOP_TICKS = 10; // facing, idle lines and the routine
const MISSING_EVERY = 4; // loops between checks for a missing NPC (2 s)
const MISSING_CHECKS = 3; // checks in a row before a missing NPC is spawned again (6 s): its chunk may still be loading
const AUDIT_TICKS = 200; // every 10 s, look for duplicates, leftovers and changed names
const OFFER_TICKS = 4; // how long other packs have to answer realm:npc_talk
const MAX_OFFERS = 16;
const TAP_COOLDOWN = 10;
const MOVE_DISTANCE = 1.5; // farther than this from where it belongs, an NPC is teleported back
const SPOT_CLEAR = 0.9; // someone within this of an NPC's spot: it isn't put back there until they move off
const TURN_STEP = 45; // degrees an NPC turns per loop at most, so it turns rather than snaps
const TURN_MIN = 4; // smaller differences aren't worth a teleport

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {typeof CONFIG.townsfolk[number]} Townsfolk */
/** @typedef {keyof Townsfolk["greetings"]} Situation */
/**
 * Where one townsfolk lives. `eid` is the id of its entity (ids stay the same across loads), so any other
 * entity with its tags is a duplicate or a leftover.
 * @typedef {{ id: string, dim: string, x: number, y: number, z: number, yaw: number, eid?: string, home?: Vector3, posts?: { noon?: Vector3, evening?: Vector3 } }} Placed
 */
/** @typedef {"work" | "lunch" | "evening" | "night"} Slot */
/** @typedef {{ missing: number, nextIdle: number, speech: number, yaw?: number, slot?: Slot, viewers?: Set<string>, renameAt?: number, renames?: number }} State */
/** @typedef {{ pack: string, key: string, label: string, order: number }} Offer */

const folk = new Map(CONFIG.townsfolk.map((t) => [t.id, t]));

/** @type {Placed[]} */
let list = [];
let ready = false;
let loadFailed = false; // a corrupt list: leave the NPCs alone rather than remove them all
/** @type {WeatherType} */
let weather = WeatherType.Clear;
/** @type {Map<string, State>} townsfolk id -> runtime state */
const states = new Map();

/** @param {Townsfolk} t "§eMara §7the Cartographer": the name above its head */
const displayName = (t) => `§e${t.name}${t.title ? ` §7${t.title}` : ""}`;
/** Its name, or the same name with a trailing §r (looks the same: the form a name resend switches to). @param {string} tag @param {Townsfolk} t */
const isName = (tag, t) => tag === displayName(t) || tag === `${displayName(t)}§r`;
/** @param {Townsfolk} t "Mara the Cartographer" */
const plainName = (t) => (t.title ? `${t.name} ${t.title}` : t.name);

/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

/** @param {number} ticks */
const wait = (ticks) => new Promise((r) => system.runTimeout(() => r(undefined), ticks));

/** @template T @param {T[]} arr @returns {T | undefined} */
const pick = (arr) => (arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined);

/** @param {string} id */
function stateOf(id) {
  let st = states.get(id);
  if (!st) states.set(id, (st = { missing: 0, nextIdle: system.currentTick + idleDelay(), speech: 0 }));
  return st;
}

/** Ticks until an NPC's next idle line. */
function idleDelay() {
  const a = Math.max(5, Number(get("idleMinSeconds")) || 30);
  const b = Math.max(a, Number(get("idleMaxSeconds")) || 60);
  return Math.round((a + Math.random() * (b - a)) * 20);
}

// ---------------------------------------------------------------------------
// Saved list
// ---------------------------------------------------------------------------

/** @param {unknown} v */
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** A saved { x, y, z }, or undefined. @param {any} v @returns {Vector3 | undefined} */
const spotOrNot = (v) => (v && isNum(v.x) && isNum(v.y) && isNum(v.z) ? { x: v.x, y: v.y, z: v.z } : undefined);

function load() {
  try {
    const raw = world.getDynamicProperty(PROP_LIST);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : [];
    /** @type {Placed[]} */
    const out = [];
    for (const r of Array.isArray(parsed) ? parsed : []) {
      if (!r || typeof r.id !== "string" || typeof r.dim !== "string" || !isNum(r.x) || !isNum(r.y) || !isNum(r.z)) continue;
      if (out.some((o) => o.id === r.id)) continue;
      if (!folk.has(r.id)) console.warn(`[npc] "${r.id}" is no longer in config.js: its NPC is removed when its chunk loads`);
      const home = spotOrNot(r.home);
      const noon = spotOrNot(r.posts?.noon);
      const evening = spotOrNot(r.posts?.evening);
      const posts = noon || evening ? { ...(noon ? { noon } : {}), ...(evening ? { evening } : {}) } : undefined;
      out.push({ id: r.id, dim: r.dim, x: r.x, y: r.y, z: r.z, yaw: isNum(r.yaw) ? r.yaw : 0, eid: typeof r.eid === "string" ? r.eid : undefined, home, posts });
    }
    list = out.filter((r) => folk.has(r.id));
  } catch (e) {
    console.warn(`[npc] ${PROP_LIST} is corrupt: ${e}`);
    list = [];
    loadFailed = true;
  }
}

function save() {
  try {
    world.setDynamicProperty(PROP_LIST, list.length ? JSON.stringify(list) : undefined);
  } catch (e) {
    console.warn(`[npc] save: ${e}`);
  }
  placesSoon();
}

// Where each townsfolk is placed, for the Minimap (map_bp): realm:npc_places { part, parts, folk: [{ id, n, dim, x, z }] },
// sent when the list changes (a tick later, once) and on realm:npc_places_ping. Parts stay under 2048 characters.
let placesQueued = false;
function placesSoon() {
  if (placesQueued) return;
  placesQueued = true;
  system.runTimeout(() => {
    placesQueued = false;
    sendPlaces();
  }, 1);
}
let lastPlaces = "";
/** @param {boolean} [always] send even if nothing changed */
function sendPlaces(always = false) {
  const items = list.filter((r) => folk.has(r.id)).map((r) => ({ id: r.id, n: /** @type {Townsfolk} */ (folk.get(r.id)).name.slice(0, 32), dim: r.dim, x: Math.floor(r.x), z: Math.floor(r.z) }));
  const key = JSON.stringify(items);
  if (!always && key === lastPlaces) return;
  lastPlaces = key;
  /** @type {object[][]} */
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
  if (!parts.length) return system.sendScriptEvent("realm:npc_places", JSON.stringify({ part: 1, parts: 0, folk: [] }));
  parts.forEach((p, i) => system.sendScriptEvent("realm:npc_places", JSON.stringify({ part: i + 1, parts: parts.length, folk: p })));
}

/** @param {string} id */
const placedOf = (id) => list.find((r) => r.id === id);

/** The townsfolk id in an entity's tags. @param {Entity} entity */
function idOf(entity) {
  try {
    const tag = entity.getTags().find((t) => t.startsWith(ID_TAG));
    return tag ? tag.slice(ID_TAG.length) : undefined;
  } catch {
    return undefined;
  }
}

/** The townsfolk's entity, if it is loaded. @param {Placed} rec */
function entityOf(rec) {
  if (!rec.eid) return undefined;
  try {
    const e = world.getEntity(rec.eid);
    return e && e.isValid ? e : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Time, weather and where an NPC belongs right now
// ---------------------------------------------------------------------------

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather }) => {
  if (dimension !== OVERWORLD && dimension !== "overworld") return;
  weather = newWeather;
  try {
    world.setDynamicProperty(PROP_WEATHER, newWeather);
  } catch (e) {
    console.warn(`[npc] ${e}`);
  }
});

function isNight() {
  const t = world.getTimeOfDay();
  const a = CONFIG.nightStart;
  const b = CONFIG.nightEnd;
  return a <= b ? t >= a && t < b : t >= a || t < b;
}

/** Which greetings fit now, for an NPC in this dimension. @param {string} dim @returns {Situation} */
function situation(dim) {
  if (dim === OVERWORLD && weather === WeatherType.Thunder) return "thunder";
  if (dim === OVERWORLD && weather === WeatherType.Rain) return "rain";
  const t = world.getTimeOfDay();
  if (t >= 23000 || t < 3000) return "morning";
  if (t < 11000) return "day";
  if (t < 13000) return "evening";
  return "night";
}

/** Home at night (with the routine on), else the spot of its schedule slot (lunch, evening), else its post. @param {Placed} rec @returns {Vector3} */
function anchorOf(rec) {
  if (rec.home && get("enabled") === true && get("nightRoutine") === true && isNight()) return rec.home;
  const slot = stateOf(rec.id).slot ?? "work";
  return spotOf(rec, slot === "night" ? "work" : slot); // home is handled above; a night slot by day is a few seconds after dawn
}

/** Where a slot puts this townsfolk (a slot without a spot is its post). @param {Placed} rec @param {Slot} slot @returns {Vector3} */
function spotOf(rec, slot) {
  const on = get("enabled") === true;
  if (slot === "night" && rec.home && on && get("nightRoutine") === true) return rec.home;
  if (on && get("schedules") === true) {
    if (slot === "lunch" && rec.posts?.noon) return rec.posts.noon;
    if (slot === "evening" && rec.posts?.evening) return rec.posts.evening;
  }
  return { x: rec.x, y: rec.y, z: rec.z };
}

/** The slot the time of day asks for. @returns {Slot} */
function slotNow() {
  if (isNight()) return "night";
  const t = world.getTimeOfDay();
  if (t >= CONFIG.eveningStart && t < CONFIG.nightStart) return "evening";
  if (t >= CONFIG.lunchStart && t < CONFIG.eveningStart) return "lunch";
  return "work";
}

/**
 * Every 10 s (the audit): townsfolk whose slot changed move to its spot, but only while no player is within
 * `scheduleRange` blocks of where they are and where they go (nobody sees them vanish). Going home at night and
 * back at dawn stays instant, as before. A restart puts everyone straight into the slot of the time.
 */
function scheduleTick() {
  const want = slotNow();
  const range = Math.max(0, Number(CONFIG.scheduleRange) || 0);
  for (const rec of list) {
    const st = stateOf(rec.id);
    if (st.slot === undefined || st.slot === want) {
      st.slot = want;
      continue;
    }
    const from = spotOf(rec, st.slot);
    const to = spotOf(rec, want);
    // Same spot, or to or from home at night (the old routine, instant): just change the slot.
    const homeMove = !!rec.home && get("nightRoutine") === true && (want === "night" || st.slot === "night");
    if (dist(from, to) < 0.5 || homeMove) {
      st.slot = want;
      continue;
    }
    try {
      const dim = world.getDimension(rec.dim);
      const seen = range > 0 && (dim.getPlayers({ location: from, maxDistance: range }).length > 0 || dim.getPlayers({ location: to, maxDistance: range }).length > 0);
      if (!seen) st.slot = want;
    } catch (e) {
      console.warn(`[npc] schedule ${rec.id}: ${e}`);
    }
  }
}

/** @param {Vector3} a @param {Vector3} b */
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Is the block at `at` loaded? @param {Dimension} dim @param {Vector3} at */
function loaded(dim, at) {
  try {
    return !!dim.getBlock({ x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z) });
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Standing on the floor: an NPC whose feet are inside a block (a path laid or raised under a placed NPC, a spot
// saved a block low) stands sunk in it, and inside a slab or a path block it falls through to the block below.
// ---------------------------------------------------------------------------

/** Blocks an NPC stands in, not on (plants, torches, signs, carpets, rails, doors...). */
const PASSABLE =
  /(^|:|_)(air|short_grass|tall_grass|fern|large_fern|dead_bush|bush|seagrass|kelp|vine|vines|sapling|propagule|flower|tulip|poppy|dandelion|orchid|allium|bluet|daisy|cornflower|lily_of_the_valley|rose|lilac|peony|sunflower|petals|leaf_litter|torchflower|pitcher_plant|crimson_roots|warped_roots|hanging_roots|sprouts|fungus|mushroom|wheat|carrots|potatoes|beetroot|sweet_berry_bush|torch|candle|sign|banner|carpet|rail|button|lever|pressure_plate|tripwire|tripwire_hook|redstone_wire|string|ladder|cobweb|door|trapdoor|fence_gate|coral_fan|coral|glow_lichen|deadbush|fire|light_block(_\d+)?|structure_void|scaffolding|snow_layer)$/;

/** Height of a block's top above its base (1 for a full block; slabs, paths, beds... less). @param {import("@minecraft/server").Block} b */
function heightOf(b) {
  const id = b.typeId;
  if (/_slab$/.test(id) && !/double_slab$/.test(id)) {
    const half = b.permutation.getState("minecraft:vertical_half");
    return half === "top" ? 1 : 0.5;
  }
  if (/_stairs$/.test(id)) return b.permutation.getState("upside_down_bit") === true ? 1 : 0.5;
  if (/grass_path|dirt_path|farmland/.test(id)) return 0.9375;
  if (/(^|:|_)bed$/.test(id)) return 0.5625;
  if (/chest$|soul_sand|(^|:)mud$/.test(id)) return 0.875;
  return 1;
}

/** Does block `b` keep feet at height `feet` out (a block the feet are inside of)? @param {import("@minecraft/server").Block} b @param {number} feet */
function blocks(b, feet) {
  if (b.isAir || b.isLiquid || PASSABLE.test(b.typeId)) return false;
  return b.location.y + heightOf(b) > feet + 0.01;
}

/** Is the block at `at` loaded and keeping feet out? undefined when not loaded. @param {Dimension} dim @param {Vector3} at @param {number} [dy] */
function solidAt(dim, at, dy = 0) {
  const b = dim.getBlock({ x: Math.floor(at.x), y: Math.floor(at.y) + dy, z: Math.floor(at.z) });
  if (!b) return undefined;
  return blocks(b, at.y + dy);
}

/** Spots already reported as sunk too deep to lift (logged once). @type {Set<string>} */
const stuckLogged = new Set();

/**
 * `at`, or `at` lifted onto the top of the block its feet are inside (a slab, a path block, a full block laid
 * there): one step, at most 1 block, and only when the feet and head have room there. Only the feet block decides:
 * a block at head height (a lantern, a top slab) never lifts anyone, and the lift never passes through a ceiling.
 * A spot that isn't loaded, or can't be lifted, is kept.
 * @param {Dimension} dim @param {Vector3} at @returns {Vector3}
 */
function standUp(dim, at) {
  try {
    const x = Math.floor(at.x);
    const z = Math.floor(at.z);
    const feet = dim.getBlock({ x, y: Math.floor(at.y), z });
    if (!feet || !blocks(feet, at.y)) return at;
    const top = feet.location.y + heightOf(feet);
    const up = { x: at.x, y: top, z: at.z };
    if (top - at.y <= 1.001 && solidAt(dim, up) === false && solidAt(dim, up, 1) === false) return up;
    const key = `${dim.id} ${x} ${at.y} ${z}`;
    if (!stuckLogged.has(key)) {
      stuckLogged.add(key);
      console.warn(`[npc] the spot ${x}, ${at.y}, ${z} is inside ${feet.typeId} with no room on top: left as it is (place the townsfolk again)`);
    }
  } catch {
    // not loaded: keep the spot
  }
  return at;
}

/**
 * Lifts every saved spot of a townsfolk (post, home, lunch, evening) that is loaded and sunk into the floor, so
 * spots saved in older worlds or with a path laid on them later are repaired. Returns true when one changed.
 * @param {Placed} rec
 */
function liftSaved(rec) {
  let changed = false;
  let dim;
  try {
    dim = world.getDimension(rec.dim);
  } catch {
    return false;
  }
  for (const spot of [rec, rec.home, rec.posts?.noon, rec.posts?.evening]) {
    if (!spot) continue;
    const up = standUp(dim, spot);
    if (up.y !== spot.y) {
      console.warn(`[npc] ${rec.id}: a spot at ${Math.floor(spot.x)}, ${spot.y}, ${Math.floor(spot.z)} was inside a block: lifted to y ${up.y}`);
      spot.y = up.y;
      changed = true;
    }
  }
  if (changed) save();
  return changed;
}

/** Yaw that looks from `from` toward `to` (0 = south, 90 = west). @param {Vector3} from @param {Vector3} to */
const yawTo = (from, to) => (Math.atan2(-(to.x - from.x), to.z - from.z) * 180) / Math.PI;
/** @param {number} a degrees, to -180..180 */
const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

/** "N", "NE", ... from a step of dx, dz. @param {number} dx @param {number} dz */
function compass(dx, dz) {
  const a = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(a / 45) % 8];
}

/** @param {string} dim */
const dimName = (dim) => (dim === "minecraft:nether" ? "the Nether" : dim === "minecraft:the_end" ? "the End" : "the Overworld");

// ---------------------------------------------------------------------------
// Entities: dress, spawn, find again, clean up
// ---------------------------------------------------------------------------

/** Tags and name as config.js has them now. @param {Entity} entity @param {Townsfolk} t */
function dress(entity, t) {
  const want = new Set([NPC_TAG, OWNER_TAG, ID_TAG + t.id, ...t.roles.map((r) => ROLE_TAG + r)]);
  for (const tag of entity.getTags()) {
    if ((tag.startsWith(ROLE_TAG) || tag.startsWith(ID_TAG)) && !want.has(tag)) entity.removeTag(tag);
  }
  for (const tag of want) if (!entity.hasTag(tag)) entity.addTag(tag);
  const st = stateOf(t.id);
  if (system.currentTick >= st.speech && !isName(entity.nameTag, t)) entity.nameTag = displayName(t);
}

// The name above an NPC's head: a player's game can show a minecraft:npc as "NPC" (its default name) although its
// name was set, until the name changes again while they watch. So when a player comes near (or the NPC loads or
// spawns), the name is sent again a moment later, switching between two forms that look the same.
const NAME_RANGE = 64; // players this close count as watching
const RENAME_TICKS = [20, 60]; // resends after a player comes near: 1 s, then 3 s more

/** Sends the name again (when no idle line is showing). @param {Entity} entity @param {Townsfolk} t */
function resendName(entity, t) {
  if (system.currentTick < stateOf(t.id).speech) return; // a line is up: its end puts the name back, a change too
  const name = displayName(t);
  entity.nameTag = entity.nameTag === name ? `${name}§r` : name;
}

/** Every loop: a player new within NAME_RANGE gets the name sent again. @param {Entity} entity @param {Townsfolk} t */
function watchName(entity, t) {
  const st = stateOf(t.id);
  const ids = new Set(entity.dimension.getPlayers({ location: entity.location, maxDistance: NAME_RANGE }).map((p) => p.id));
  const seen = st.viewers;
  if (!seen || [...ids].some((id) => !seen.has(id))) {
    st.renameAt = system.currentTick + RENAME_TICKS[0];
    st.renames = 0;
  }
  st.viewers = ids;
  if (st.renameAt !== undefined && system.currentTick >= st.renameAt) {
    resendName(entity, t);
    const n = (st.renames ?? 0) + 1;
    st.renames = n;
    st.renameAt = n < RENAME_TICKS.length ? system.currentTick + RENAME_TICKS[n] : undefined;
  }
}

/** @param {Placed} rec @param {Townsfolk} t @param {Vector3} at */
function spawn(rec, t, at) {
  const dim = world.getDimension(rec.dim);
  if (liftSaved(rec)) at = anchorOf(rec);
  const entity = dim.spawnEntity(NPC_TYPE, at);
  dress(entity, t);
  entity.teleport(at, { rotation: { x: 0, y: rec.yaw } });
  rec.eid = entity.id;
  const st = stateOf(t.id);
  st.yaw = rec.yaw;
  st.viewers = undefined; // everyone near counts as new: the name is sent again in a moment
  save();
  return entity;
}

/**
 * Checks one of our NPC entities: a townsfolk no longer placed (or no longer in config.js) is removed, a second
 * one of the same townsfolk is removed, and an NPC found while its saved entity isn't loaded becomes the one.
 * @param {Entity} entity
 */
function audit(entity) {
  if (!ready || !entity.isValid || entity.typeId !== NPC_TYPE || !entity.hasTag(OWNER_TAG)) return;
  const id = idOf(entity);
  const rec = id ? placedOf(id) : undefined;
  const t = id ? folk.get(id) : undefined;
  if (!rec || !t) {
    if (!loadFailed) entity.remove();
    return;
  }
  if (rec.eid !== entity.id) {
    const current = entityOf(rec);
    if (current && current.id !== entity.id) {
      entity.remove(); // a duplicate: the saved one is here
      return;
    }
    rec.eid = entity.id; // the saved one isn't loaded: this one takes over, and the other goes when it loads
    save();
  }
  dress(entity, t);
  // A spot inside a block (sunk into a path laid later, or saved a block low): lifted and the NPC put on top.
  if (liftSaved(rec)) {
    const at = anchorOf(rec);
    const st = stateOf(rec.id);
    if (entity.dimension.id === rec.dim && loaded(entity.dimension, at)) entity.teleport(at, { rotation: { x: 0, y: st.yaw ?? rec.yaw } });
  }
}

world.afterEvents.entityLoad.subscribe(({ entity }) => {
  try {
    if (entity.typeId !== NPC_TYPE) return;
    audit(entity);
    const id = entity.isValid ? idOf(entity) : undefined;
    if (id && placedOf(id)?.eid === entity.id) stateOf(id).viewers = undefined; // loaded again: send the name again soon
  } catch (e) {
    console.warn(`[npc] ${e}`);
  }
});

function auditAll() {
  for (const id of DIMENSIONS) {
    try {
      for (const e of world.getDimension(id).getEntities({ type: NPC_TYPE, tags: [OWNER_TAG] })) audit(e);
    } catch (e) {
      console.warn(`[npc] audit: ${e}`);
    }
  }
}

// An NPC that dies anyway (/kill) is spawned again at the next missing check, if anyone is around. (BDS 1.26 never
// sends entityDie for minecraft:npc, so there the ordinary missing check, about 6 seconds, brings it back.)
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  try {
    if (deadEntity.typeId !== NPC_TYPE) return;
    const rec = list.find((r) => r.eid === deadEntity.id);
    if (rec) stateOf(rec.id).missing = MISSING_CHECKS;
  } catch (e) {
    console.warn(`[npc] ${e}`);
  }
});

/**
 * Called every 2 s for a townsfolk whose entity isn't loaded. If a player has been near the spot it belongs at
 * for a few checks and that spot is loaded, it's found by its tags or spawned again there.
 * @param {Placed} rec @param {Townsfolk} t
 */
function checkMissing(rec, t) {
  const st = stateOf(rec.id);
  const dim = world.getDimension(rec.dim);
  const at = anchorOf(rec);
  if (!loaded(dim, at) || !dim.getPlayers({ location: at, maxDistance: CONFIG.respawnRange }).length) {
    st.missing = 0;
    return;
  }
  if (++st.missing < MISSING_CHECKS) return;
  st.missing = 0;
  const found = dim.getEntities({ type: NPC_TYPE, tags: [OWNER_TAG, ID_TAG + rec.id] }).filter((e) => e.isValid);
  if (found.length) {
    found.sort((a, b) => dist(a.location, at) - dist(b.location, at));
    rec.eid = found[0].id;
    save();
    for (const e of found.slice(1)) e.remove();
    dress(found[0], t);
    return;
  }
  spawn(rec, t, at);
}

// ---------------------------------------------------------------------------
// Behavior: turning, idle lines, the routine
// ---------------------------------------------------------------------------

/**
 * Is someone else standing on an NPC's spot (a player, another townsfolk, a mob)? Putting the NPC back there would
 * push them apart and pop it up, again and again, so it waits beside the spot until they move off.
 * @param {Entity} entity @param {Vector3} at
 */
function occupied(entity, at) {
  try {
    return entity.dimension
      .getEntities({ location: at, maxDistance: SPOT_CLEAR })
      .some((e) => e.id !== entity.id && Math.abs(e.location.y - at.y) < 2 && e.hasComponent("minecraft:health"));
  } catch {
    return false;
  }
}

/** Turns (a step) toward `yaw`, staying where it belongs. @param {Entity} entity @param {State} st @param {Vector3} at @param {number} yaw @param {boolean} snap */
function turn(entity, st, at, yaw, snap) {
  const current = st.yaw ?? entity.getRotation().y;
  const diff = wrap(yaw - current);
  if (Math.abs(diff) < TURN_MIN) return;
  const next = snap ? yaw : wrap(current + Math.max(-TURN_STEP, Math.min(TURN_STEP, diff)));
  const loc = entity.location;
  // Nudged a little: back onto its spot while turning. Far from it (home not loaded yet): turn in place, never
  // teleport into a spot that may not be loaded.
  const d = dist(loc, at);
  entity.teleport(d > 0.3 && d <= MOVE_DISTANCE && !occupied(entity, at) ? at : loc, { rotation: { x: 0, y: next } });
  st.yaw = next;
}

/** Shows a line above the NPC for a few seconds, in place of its name. @param {Entity} entity @param {Townsfolk} t @param {string} line */
function say(entity, t, line) {
  const st = stateOf(t.id);
  const ticks = Math.max(1, Math.round(CONFIG.speechSeconds * 20));
  st.speech = system.currentTick + ticks;
  entity.nameTag = `§f${line}`;
  system.runTimeout(() => {
    try {
      if (entity.isValid && system.currentTick >= st.speech) entity.nameTag = displayName(t);
    } catch {
      // unloaded meanwhile: the audit puts the name back
    }
  }, ticks);
}

/** @param {string} line @param {string} name */
const fill = (line, name) => line.split("{player}").join(name);

/**
 * Keeps an NPC at its spot (always), and with `lively` turns it toward players and has it say idle lines.
 * @param {Placed} rec @param {Townsfolk} t @param {Entity} entity @param {boolean} lively
 */
function behave(rec, t, entity, lively) {
  const st = stateOf(rec.id);
  const dim = world.getDimension(rec.dim);
  const at = anchorOf(rec);
  if (entity.dimension.id !== rec.dim || dist(entity.location, at) > MOVE_DISTANCE) {
    // Pushed, moved by someone, or time to go home or back to its post. Only into a loaded spot nobody stands on.
    if (loaded(dim, at) && !occupied(entity, at)) {
      const up = liftSaved(rec) ? anchorOf(rec) : at;
      entity.teleport(up, { dimension: dim, rotation: { x: 0, y: rec.yaw } });
      st.yaw = rec.yaw;
    }
    return;
  }
  if (!lively) return;
  const range = Number(get("faceRange")) || 0;
  const loc = entity.location;
  const [near] = range > 0 ? dim.getPlayers({ location: loc, maxDistance: range, closest: 1, excludeGameModes: [GameMode.Spectator] }) : [];
  turn(entity, st, at, near ? yawTo(loc, near.location) : rec.yaw, false);

  if (system.currentTick >= st.nextIdle) {
    st.nextIdle = system.currentTick + idleDelay();
    const [listener] = dim.getPlayers({ location: loc, maxDistance: CONFIG.idleRange, closest: 1, excludeGameModes: [GameMode.Spectator] });
    if (!listener) return;
    // Mostly idle chatter, sometimes a remark that fits the time and weather.
    // Acquaintances (and up) of the nearest listener hear more of its chatter.
    const idle = get("affinity") === true && levelWith(listener, t.id) >= 1 ? [...t.idle, ...(HEARTH[t.id]?.idle ?? [])] : t.idle;
    const line = Math.random() < 0.7 ? pick(idle) : pick(t.greetings[situation(rec.dim)] ?? []);
    if (line) say(entity, t, fill(line, listener.name));
  }
}

let loops = 0;
function loop() {
  loops++;
  if (loops % 2 === 0) {
    try {
      dayTick();
    } catch (e) {
      console.warn(`[npc] day: ${e}`);
    }
  }
  const lively = get("enabled") === true;
  for (const rec of list) {
    const t = folk.get(rec.id);
    if (!t) continue;
    try {
      const entity = entityOf(rec);
      if (!entity) {
        if (loops % MISSING_EVERY === 0) checkMissing(rec, t);
        continue;
      }
      stateOf(rec.id).missing = 0;
      behave(rec, t, entity, lively);
      watchName(entity, t);
    } catch (e) {
      console.warn(`[npc] ${rec.id}: ${e}`); // usually an unloaded chunk
    }
  }
}

world.afterEvents.worldLoad.subscribe(() => {
  try {
    const saved = world.getDynamicProperty(PROP_WEATHER);
    if (saved === WeatherType.Rain || saved === WeatherType.Thunder) weather = saved;
  } catch {
    // keep Clear
  }
  load();
  loadGossip();
  loadDay();
  ready = true;
  scheduleTick();
  // A line left above an NPC by a restart mid-speech is put back by the audit.
  auditAll();
  system.runInterval(loop, LOOP_TICKS);
  system.runInterval(() => {
    try {
      scheduleTick();
    } catch (e) {
      console.warn(`[npc] schedule: ${e}`);
    }
    auditAll();
  }, AUDIT_TICKS);
  // Other packs are loaded by now: the calendar, and each online player's affinity (after a /reload).
  system.runTimeout(() => {
    broadcastCalendar();
    for (const p of world.getAllPlayers()) sendAffinity(p);
    system.sendScriptEvent("realm:npc_flags_ping", "{}"); // Story Questlines sends every online player's flags again
  }, 100);
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  system.runTimeout(() => {
    try {
      if (!player.isValid) return;
      sendAffinity(player);
      broadcastCalendar();
    } catch (e) {
      console.warn(`[npc] join: ${e}`);
    }
  }, 60);
});

// ---------------------------------------------------------------------------
// Taps: the offer round
// ---------------------------------------------------------------------------

/** @type {Map<string, Offer[]>} request id -> offers so far */
const rounds = new Map();
/** @type {Set<string>} players with an NPC menu open */
const busy = new Set();
/** @type {Map<string, number>} player id -> tick of the last tap */
const lastTap = new Map();
let requests = 0;

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  busy.delete(playerId);
  lastTap.delete(playerId);
  affCache.delete(playerId);
  flagCache.delete(playerId);
  heardCache.delete(playerId);
});

world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  const { player, target } = ev;
  try {
    if (target.typeId !== NPC_TYPE || !target.hasTag(OWNER_TAG)) return;
    let creative = false;
    try {
      creative = player.getGameMode() === GameMode.Creative;
    } catch {
      creative = false;
    }
    if (player.isSneaking && creative && isOp(player)) return; // the game's NPC editor, to pick a skin
    ev.cancel = true;
    const id = idOf(target);
    const gift = player.isSneaking; // sneak-tap: give the item in hand
    system.run(() => {
      if (!id || !player.isValid) return;
      tapped(player, target, id, gift).catch((e) => console.warn(`[npc] ${e}`));
    });
  } catch (e) {
    console.warn(`[npc] ${e}`);
  }
});

/**
 * Shows a form, retrying while the player still has chat or another screen open.
 * @template {{ show(p: Player): Promise<any> }} F
 * @param {Player} player @param {F} form @returns {Promise<Awaited<ReturnType<F["show"]>> | undefined>}
 */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await wait(20);
  }
  return undefined;
}

/** @param {Player} player @param {Entity} entity @param {string} id @param {boolean} [gift] a sneak-tap: give what's in hand */
async function tapped(player, entity, id, gift = false) {
  const now = system.currentTick;
  if (busy.has(player.id) || now - (lastTap.get(player.id) ?? -TAP_COOLDOWN) < TAP_COOLDOWN) return;
  lastTap.set(player.id, now);
  const t = folk.get(id);
  if (!t) return;
  busy.add(player.id);
  try {
    // Look at whoever is talking.
    if (get("enabled") === true && entity.isValid) {
      const rec = placedOf(id);
      if (rec) turn(entity, stateOf(id), anchorOf(rec), yawTo(entity.location, player.location), true);
    }
    // A sneak-tap holding something is a gift; with an empty hand it's an ordinary tap.
    if (gift && get("affinity") === true && giftInHand(player)) {
      giveGift(player, t, entity);
      return;
    }
    const req = `npc:${id}:${player.id}:${now}:${++requests}`;
    rounds.set(req, []);
    system.sendScriptEvent("realm:npc_talk", JSON.stringify({ req, player: player.id, npc: id, roles: t.roles, name: plainName(t) }));
    talkedTo(player, t);
    keepsake(player, t);
    await wait(OFFER_TICKS);
    const offers = rounds.get(req) ?? [];
    rounds.delete(req);
    const hearth = get("affinity") === true;
    const held = hearth ? giftInHand(player) : undefined;
    if (held && !held.keep) offers.push({ pack: "npc_bp", key: "give", label: `Give ${itemName(held.item.typeId)}\n§8a gift, takes 1`, order: 0 });
    if (hearth && levelWith(player, id) >= 1 && HEARTH[id]?.topics.length) offers.push({ pack: "npc_bp", key: "ask", label: "Ask about...", order: 90 });
    offers.push({ pack: "npc_bp", key: "who", label: "Who lives here?", order: 95 });
    offers.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
    if (!player.isValid) return;

    const lines = [`§e${t.name}:§r "${greetingFor(player, t, entity)}"`];
    if (hearth) {
      const pts = affOf(player)[id]?.[0] ?? 0;
      lines.push("", `§7You and ${t.name}: §d${levelText(pts)}`);
      if (birthday(id)) lines.push(`§6It's ${t.name}'s birthday today: gifts count double.`);
      else if (longNight()) lines.push("§dStarwright's Long Night: gifts count double.");
    }
    const form = new ActionFormData().title(plainName(t)).body(lines.join("\n"));
    for (const o of offers) form.button(o.label);
    form.button("Goodbye");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
    const offer = offers[res.selection];
    if (!offer) return; // Goodbye
    if (offer.pack === "npc_bp") {
      busy.delete(player.id);
      if (offer.key === "give") giveGift(player, t, entity);
      else if (offer.key === "ask") await askAbout(player, t);
      else await whoLivesHere(player, t);
      return;
    }
    system.sendScriptEvent("realm:npc_choose", JSON.stringify({ player: player.id, npc: id, pack: offer.pack, key: offer.key }));
  } finally {
    busy.delete(player.id);
  }
}

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:npc_offer") return;
    try {
      const o = JSON.parse(message);
      if (!o || typeof o.req !== "string" || typeof o.pack !== "string" || typeof o.key !== "string" || typeof o.label !== "string") return;
      if (o.pack === "npc_bp" || !o.label.trim()) return; // our own button is added below; an empty label makes a blank button
      const offers = rounds.get(o.req);
      if (!offers || offers.length >= MAX_OFFERS || offers.some((x) => x.pack === o.pack && x.key === o.key)) return;
      const order = typeof o.order === "number" && Number.isFinite(o.order) ? o.order : 50;
      offers.push({ pack: o.pack.slice(0, 64), key: o.key.slice(0, 64), label: o.label.slice(0, 80), order });
    } catch {
      // not ours to fix: ignore malformed offers
    }
  },
  { namespaces: ["realm"] },
);

// ---------------------------------------------------------------------------
// Hearth & Hearsay: affinity, gifts, flag reactions, gossip, the Realm day counter
// ---------------------------------------------------------------------------

const PROP_AFF = "npc:aff"; // player: JSON { <npc>: [pts, talkDay, giftDay, bits, keepsakeDay] }
const PROP_FLAGS = "npc:flags"; // player: JSON, the story flags Story Questlines last sent (realm:npc_flags)
const PROP_HEARD = "npc:heard"; // player: JSON number[], ids of the gossip this player has heard
const PROP_GOSSIP = "npc:gossip"; // world: JSON { n: next id, e: Gossip[] }
const PROP_DAY = "npc:day"; // world: JSON { d: Realm day, n: 1 once the night was seen (the next dawn counts) }
const MAX_POINTS = 1000;
const BIT_CLOSE = 1; // the Close letter and notice were sent
const BIT_CONFIDANT = 2; // the Confidant title and trail were sent
const PRIVATE_RANGE = 16; // a Confidant's warm words to a Hollow-Crowned player only when nobody else is this close
const FLAG_LIMIT = 64; // most flags kept from realm:npc_flags
const GOSSIP_KIND = /^[a-z][a-z0-9_]{0,23}$/;
const GOSSIP_REPEAT_MS = 30 * 60000; // the same news about the same player within 30 minutes replaces the older one

/** @typedef {[number, number, number, number, number]} Aff points, last talk day, last gift day, bits, last keepsake day (UTC days) */
/** @typedef {{ i: number, k: string, p: string, n: string, pl?: string, x?: number, t: number, c?: number }} Gossip */
/** @typedef {"loved" | "liked" | "neutral" | "disliked"} Tier */

/** Today's real (UTC) day number: talks and gifts count once per real day, so sleeping can't farm them. */
const utcDay = () => Math.floor(Date.now() / 86400000);

/** @type {Map<string, Record<string, Aff>>} player id -> affinity */
const affCache = new Map();
/** @type {Map<string, Record<string, string>>} player id -> story flags */
const flagCache = new Map();
/** @type {Map<string, number[]>} player id -> gossip heard */
const heardCache = new Map();

/** @param {unknown} v @returns {Aff | undefined} */
function affEntry(v) {
  if (!Array.isArray(v)) return undefined;
  const n = (/** @type {number} */ i) => (isNum(v[i]) ? Math.floor(v[i]) : 0);
  return [Math.max(0, Math.min(MAX_POINTS, n(0))), n(1), n(2), n(3), n(4)];
}

/** @param {Player} player @returns {Record<string, Aff>} */
function affOf(player) {
  let aff = affCache.get(player.id);
  if (aff) return aff;
  aff = {};
  try {
    const raw = player.getDynamicProperty(PROP_AFF);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : {};
    for (const [id, v] of Object.entries(parsed && typeof parsed === "object" ? parsed : {})) {
      const e = affEntry(v);
      if (e && folk.has(id)) aff[id] = e;
    }
  } catch {
    console.warn(`[npc] ${PROP_AFF} of ${player.name} is corrupt; starting over`);
  }
  affCache.set(player.id, aff);
  return aff;
}

/** @param {Player} player */
function saveAff(player) {
  try {
    if (player.isValid) player.setDynamicProperty(PROP_AFF, JSON.stringify(affOf(player)));
  } catch (e) {
    console.warn(`[npc] save affinity: ${e}`);
  }
}

/** @param {Player} player @param {string} id @returns {Aff} */
const affFor = (player, id) => (affOf(player)[id] ??= [0, 0, 0, 0, 0]);

/** 0 Stranger, 1 Acquaintance, 2 Friend, 3 Close, 4 Confidant. @param {number} pts */
function levelOf(pts) {
  let lv = 0;
  CONFIG.levels.forEach((need, i) => {
    if (pts >= need) lv = i + 1;
  });
  return lv;
}

/** @param {Player} player @param {string} id */
const levelWith = (player, id) => levelOf(affOf(player)[id]?.[0] ?? 0);

/** @param {Player} player @returns {Record<string, string>} */
function flagsOf(player) {
  let f = flagCache.get(player.id);
  if (f) return f;
  f = {};
  try {
    const raw = player.getDynamicProperty(PROP_FLAGS);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") for (const [k, v] of Object.entries(parsed)) if (typeof v === "string") f[k] = v;
  } catch {
    // start without flags: Story Questlines sends them again within seconds
  }
  flagCache.set(player.id, f);
  return f;
}

/** Took the Hollow Crown (the dark ending of Lantern Night). @param {Player} player */
const crowned = (player) => flagsOf(player)["g:ending"] === "crown";

/** Is this townsfolk cold to the player? Not Hollis when he was saved: forgiving is his arc. @param {Player} player @param {string} id */
const coldTo = (player, id) => crowned(player) && !(id === "hollis" && flagsOf(player)["g:hollis"] === "saved");

/** Percent off (or extra paid, Tobin) at this townsfolk's shop. @param {Player} player @param {string} id */
function offFor(player, id) {
  let off = levelWith(player, id) >= 2 ? Math.max(0, Number(CONFIG.friendDiscount) || 0) : 0;
  if (id === "quill" && crowned(player)) off += Math.max(0, Number(CONFIG.crownedQuillBonus) || 0);
  return off;
}

/** realm:affinity for one townsfolk (a level change) or, without `id`, all of them (on join). @param {Player} player @param {string} [id] */
function sendAffinity(player, id) {
  try {
    if (id) {
      const pts = affOf(player)[id]?.[0] ?? 0;
      system.sendScriptEvent("realm:affinity", JSON.stringify({ player: player.id, npc: id, level: levelOf(pts), pts, off: offFor(player, id) }));
      return;
    }
    /** @type {Record<string, number>} */
    const all = {};
    /** @type {Record<string, number>} */
    const off = {};
    for (const t of CONFIG.townsfolk) {
      all[t.id] = levelWith(player, t.id);
      const o = offFor(player, t.id);
      if (o) off[t.id] = o;
    }
    system.sendScriptEvent("realm:affinity", JSON.stringify({ player: player.id, all, off }));
  } catch (e) {
    console.warn(`[npc] affinity event: ${e}`);
  }
}

/** A chat line from a townsfolk. @param {Player} player @param {Townsfolk} t @param {string} line @param {string} [after] */
function chatFrom(player, t, line, after = "") {
  player.sendMessage(`§e${t.name}:§r "${fill(line, player.name)}"${after ? ` ${after}` : ""}`);
}

/** "Friend (260/500)". @param {number} pts */
function levelText(pts) {
  const lv = levelOf(pts);
  const next = CONFIG.levels[lv];
  return `${LEVEL_NAMES[lv]} (${pts}${next !== undefined ? `/${next}` : ""})`;
}

/**
 * Adds (or takes) affinity points. Returns the points actually added.
 * @param {Player} player @param {string} id @param {number} amount @param {string} [why] shown after the change in chat
 */
function gain(player, id, amount, why) {
  if (get("affinity") !== true || !player.isValid) return 0;
  const t = folk.get(id);
  if (!t || !amount) return 0;
  const a = affFor(player, id);
  const before = levelOf(a[0]);
  let n = Math.round(amount);
  // The town is cold to the Hollow-Crowned: slower to warm up below Friend. Quill likes them more.
  if (n > 0 && before < 2 && coldTo(player, id) && id !== "quill") n = Math.max(1, Math.round(n * (Number(CONFIG.crownedGain) || 1)));
  a[0] = Math.max(0, Math.min(MAX_POINTS, a[0] + n));
  saveAff(player);
  const after = levelOf(a[0]);
  if (why && n) player.sendMessage(`§d${n > 0 ? "+" : ""}${n} with ${t.name} §7(${why}; ${levelText(a[0])})`);
  if (after !== before) levelChanged(player, t, before, after);
  return n;
}

/** @param {Player} player @param {Townsfolk} t @param {number} before @param {number} after */
function levelChanged(player, t, before, after) {
  sendAffinity(player, t.id);
  if (after < before) {
    player.sendMessage(`§7You and ${t.name} are ${LEVEL_NAMES[after]}s again.`);
    return;
  }
  const h = HEARTH[t.id];
  const line = h?.levelUp[after - 1];
  if (line) chatFrom(player, t, line);
  player.sendMessage(`§dYou and ${plainName(t)} are now ${after === 4 ? "Confidants" : `${LEVEL_NAMES[after]}s`}.${UNLOCK_TEXT[after] ? ` §7${UNLOCK_TEXT[after]}` : ""}`);
  player.playSound("random.levelup", { pitch: 1.4, volume: 0.6 });
  const a = affFor(player, t.id);
  if (after >= 3 && !(a[3] & BIT_CLOSE)) {
    a[3] |= BIT_CLOSE;
    saveAff(player);
    if (get("letters") === true && h?.letter) {
      system.sendScriptEvent("realm:mail_send", JSON.stringify({ to: player.id, from: t.name, subject: h.letter.subject.slice(0, 40), body: fill(h.letter.body, player.name).slice(0, 600) }));
    }
  }
  if (after >= 4 && !(a[3] & BIT_CONFIDANT)) {
    a[3] |= BIT_CONFIDANT;
    saveAff(player);
    system.sendScriptEvent("realm:title_unlock", JSON.stringify({ player: player.id, title: `${t.name}'s Confidant`, from: "npc_bp" }));
    system.sendScriptEvent("realm:trail_unlock", JSON.stringify({ player: player.id, trail: "hearts", from: "npc_bp" }));
  }
}

/** What each level opens, for the chat line. */
const UNLOCK_TEXT = [
  "",
  "They have more to say now: tap them and pick Ask about...",
  `Friends get ${CONFIG.friendDiscount}% off where they sell (Tobin pays you ${CONFIG.friendDiscount}% more).`,
  "They have a heart story for you (Story Questlines): see their menu.",
  "A title, a trail and now and then a keepsake.",
];

/** First talk of the real day. @param {Player} player @param {Townsfolk} t */
function talkedTo(player, t) {
  if (get("affinity") !== true) return;
  const a = affFor(player, t.id);
  const day = utcDay();
  if (a[1] === day) return;
  a[1] = day;
  gain(player, t.id, CONFIG.talkPoints);
  saveAff(player);
}

/** A Confidant's keepsake, once every `keepsakeDays` real days, on a talk. @param {Player} player @param {Townsfolk} t */
function keepsake(player, t) {
  const k = HEARTH[t.id]?.keepsake;
  if (get("affinity") !== true || !k || levelWith(player, t.id) < 4) return;
  const a = affFor(player, t.id);
  const day = utcDay();
  if (a[4] && day - a[4] < Math.max(1, CONFIG.keepsakeDays)) return;
  try {
    const item = new ItemStack(k.item, k.amount);
    item.nameTag = `§r§d${k.name}`;
    item.setLore(k.lore.map((l) => `§r§7${l}`));
    const left = player.getComponent("minecraft:inventory")?.container?.addItem(item);
    if (left) player.dimension.spawnItem(left, player.location);
  } catch (e) {
    console.warn(`[npc] keepsake ${t.id}: ${e}`);
    return;
  }
  a[4] = day;
  saveAff(player);
  chatFrom(player, t, k.line, `§7(${k.name})`);
}

/** "minecraft:cooked_salmon" -> "Cooked Salmon". @param {string} id */
const itemName = (id) =>
  id
    .replace(/^minecraft:/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** The item in the player's hand, if it can be a gift (not a named or lore item: relics and quest items stay). @param {Player} player */
function giftInHand(player) {
  try {
    const inv = player.getComponent("minecraft:inventory")?.container;
    const slot = player.selectedSlotIndex;
    const item = inv?.getItem(slot);
    if (!inv || !item) return undefined;
    return { inv, slot, item, keep: !!item.nameTag || item.getLore().length > 0 };
  } catch {
    return undefined;
  }
}

/** @param {string} id @param {string} typeId @returns {Tier} */
function tierOf(id, typeId) {
  const g = HEARTH[id]?.gifts;
  if (g?.loved.includes(typeId)) return "loved";
  if (g?.liked.includes(typeId)) return "liked";
  if (g?.disliked.includes(typeId)) return "disliked";
  return "neutral";
}

/** Is today this townsfolk's birthday (a day of the Realm Year)? @param {string} id */
const birthday = (id) => HEARTH[id]?.birthday === calendarNow().doy;
/** Starwright's Long Night (Realm Calendar): every gift counts double. */
const longNight = () => calendarNow().festival === "long_night";

/** Gives the held item (1 of it). @param {Player} player @param {Townsfolk} t @param {Entity | undefined} entity */
function giveGift(player, t, entity) {
  if (get("affinity") !== true) return;
  const held = giftInHand(player);
  if (!held) return player.sendMessage(`§7Hold the item you want to give ${t.name}.`);
  if (held.keep) return chatFrom(player, t, "That one has a name. Keep it, it's yours.");
  const a = affFor(player, t.id);
  const day = utcDay();
  if (a[2] === day) return chatFrom(player, t, "You already gave me something today. Come back tomorrow.");
  const tier = tierOf(t.id, held.item.typeId);
  let pts = Number(CONFIG.giftPoints[tier]) || 0;
  const bday = birthday(t.id);
  const lnight = !bday && longNight();
  if ((bday || lnight) && pts > 0) pts *= 2;
  const left = held.item.amount - 1;
  if (left > 0) {
    held.item.amount = left;
    held.inv.setItem(held.slot, held.item);
  } else held.inv.setItem(held.slot, undefined);
  a[2] = day;
  const lines = HEARTH[t.id]?.giftLines[tier] ?? [];
  const line = pick(lines) ?? "Thank you.";
  const got = gain(player, t.id, pts);
  saveAff(player);
  const a2 = affFor(player, t.id);
  chatFrom(player, t, line, `§7(${itemName(held.item.typeId)}: ${got >= 0 ? "+" : ""}${got}${bday ? ", birthday x2" : lnight ? ", Long Night x2" : ""}; ${levelText(a2[0])})`);
  // Realm Calendar's Gift Round (the Long Night) counts gifts to different townsfolk.
  system.sendScriptEvent("realm:npc_gift", JSON.stringify({ player: player.id, npc: t.id, tier }));
  if (entity?.isValid) say(entity, t, fill(line, player.name));
  player.playSound(tier === "disliked" ? "note.bass" : "random.pop", { pitch: tier === "loved" ? 1.4 : 1, volume: 0.7 });
}

/** @param {Player} player */
function heardOf(player) {
  let h = heardCache.get(player.id);
  if (h) return h;
  h = [];
  try {
    const raw = player.getDynamicProperty(PROP_HEARD);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) h = parsed.filter(isNum);
  } catch {
    // start fresh
  }
  heardCache.set(player.id, h);
  return h;
}

/** @type {Gossip[]} */
let gossip = [];
let gossipNext = 1;

function loadGossip() {
  try {
    const raw = world.getDynamicProperty(PROP_GOSSIP);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : undefined;
    gossipNext = isNum(parsed?.n) ? parsed.n : 1;
    gossip = (Array.isArray(parsed?.e) ? parsed.e : []).filter(
      (/** @type {any} */ g) => g && isNum(g.i) && typeof g.k === "string" && typeof g.p === "string" && typeof g.n === "string" && isNum(g.t),
    );
  } catch {
    gossip = [];
  }
}

function saveGossip() {
  try {
    world.setDynamicProperty(PROP_GOSSIP, JSON.stringify({ n: gossipNext, e: gossip }));
  } catch (e) {
    console.warn(`[npc] save gossip: ${e}`);
  }
}

const gossipAlive = () => {
  const cutoff = Date.now() - Math.max(1, Number(CONFIG.gossipHours) || 48) * 3600000;
  return gossip.filter((g) => g.t >= cutoff);
};

/** realm:gossip from another pack: one piece of news about a player. @param {any} msg */
function hearGossip(msg) {
  if (!msg || typeof msg.kind !== "string" || !GOSSIP_KIND.test(msg.kind) || typeof msg.player !== "string" || !msg.player) return;
  const subject = world.getAllPlayers().find((p) => p.id === msg.player || p.name === msg.player);
  const name = typeof msg.name === "string" && msg.name.trim() ? msg.name.trim().slice(0, 32) : subject?.name;
  if (!name) return;
  const pid = subject?.id ?? msg.player;
  const now = Date.now();
  /** @type {Gossip} */
  const g = { i: gossipNext++, k: msg.kind, p: pid.slice(0, 40), n: name, t: now };
  if (typeof msg.place === "string" && msg.place.trim()) g.pl = msg.place.trim().replace(/§./g, "").slice(0, 48);
  if (isNum(msg.n)) g.x = Math.round(msg.n);
  if (subject && crowned(subject)) g.c = 1;
  gossip = gossipAlive().filter((o) => !(o.k === g.k && o.p === g.p && now - o.t < GOSSIP_REPEAT_MS));
  gossip.push(g);
  gossip = gossip.slice(-Math.max(1, Number(CONFIG.gossipMax) || 24));
  saveGossip();
}

/** Fills a gossip template. @param {string} text @param {Gossip} g @param {string} listener */
function fillGossip(text, g, listener) {
  const name = g.c ? "the Crowned" : g.n;
  const out = text
    .split("{name}")
    .join(name)
    .split("{place}")
    .join(g.pl ?? "out there")
    .split("{n}")
    .join(String(g.x ?? ""))
    .split("{player}")
    .join(listener);
  return out.replace(/(^|[.!?]\s+)the Crowned/g, "$1The Crowned");
}

/**
 * Sometimes (`gossipChance`) a tap's greeting is the newest news this player hasn't heard: about someone else,
 * or praise for themselves. @param {Player} player @param {Townsfolk} t @returns {string | undefined}
 */
function gossipLine(player, t) {
  const chance = Math.max(0, Math.min(100, Number(get("gossipChance")) || 0));
  if (get("affinity") !== true || Math.random() * 100 >= chance) return undefined;
  const alive = gossipAlive();
  const heard = heardOf(player);
  const g = alive.filter((x) => !heard.includes(x.i)).sort((a, b) => b.i - a.i)[0];
  if (!g) return undefined;
  const self = g.p === player.id;
  const pool = [...(HEARTH[t.id]?.gossip?.[g.k] ?? []), ...(GOSSIP[g.k] ?? GOSSIP.other)];
  const pair = pick(pool);
  if (!pair) return undefined;
  const kept = heard.filter((i) => alive.some((x) => x.i === i));
  kept.push(g.i);
  heardCache.set(player.id, kept);
  try {
    player.setDynamicProperty(PROP_HEARD, JSON.stringify(kept));
  } catch {
    // heard again later, no harm
  }
  return fillGossip(self ? pair[1] : pair[0], g, player.name);
}

/** A line keyed by the player's story flags, if one fits this townsfolk. @param {Player} player @param {string} id */
function reactionLine(player, id) {
  const f = flagsOf(player);
  const fits = REACTIONS.filter((r) => r.lines[id] && Object.entries(r.when).every(([k, v]) => flagHolds(f[k], v))).map((r) => /** @type {string} */ (r.lines[id]));
  return pick(fits);
}

/** `!x` not x, `>=n` / `<=n` numbers, else exact (as in Story Questlines). @param {string | undefined} actual @param {string} want */
function flagHolds(actual, want) {
  if (want.startsWith(">=")) return Number(actual ?? 0) >= Number(want.slice(2));
  if (want.startsWith("<=")) return Number(actual ?? 0) <= Number(want.slice(2));
  if (want.startsWith("!")) return actual !== want.slice(1);
  return actual === want;
}

/**
 * The menu's greeting: for the Hollow-Crowned a cold one (a Confidant's warm one when nobody else is near), else
 * sometimes gossip, sometimes a line about what the player did in the stories, else the time and the weather.
 * @param {Player} player @param {Townsfolk} t @param {Entity} entity
 */
function greetingFor(player, t, entity) {
  const dimId = entity.isValid ? entity.dimension.id : player.dimension.id;
  const h = HEARTH[t.id];
  if (get("affinity") === true && h && coldTo(player, t.id)) {
    let alone = true;
    try {
      alone = !entity.dimension.getPlayers({ location: entity.location, maxDistance: PRIVATE_RANGE }).some((p) => p.id !== player.id);
    } catch {
      alone = false;
    }
    const set = levelWith(player, t.id) >= 4 && alone ? h.warm : h.cold;
    const line = pick(set);
    if (line) return fill(line, player.name);
  }
  const news = gossipLine(player, t);
  if (news) return news;
  const fest = calendarNow().festival;
  /** @type {Record<string, string[]>} */
  const festLines = FESTIVAL_LINES;
  if (fest && festLines[fest] && Math.random() < 0.3) return fill(pick(festLines[fest]) ?? "Hello, {player}.", player.name);
  if (get("affinity") === true && Math.random() < 0.35) {
    const r = reactionLine(player, t.id);
    if (r) return fill(r, player.name);
  }
  return fill(pick(t.greetings[situation(dimId)] ?? []) ?? "Hello, {player}.", player.name);
}

/** "Ask about..." (Acquaintance and up). @param {Player} player @param {Townsfolk} t */
async function askAbout(player, t) {
  const topics = HEARTH[t.id]?.topics ?? [];
  while (player.isValid) {
    const form = new ActionFormData().title(`Ask ${t.name} about...`).body(`§e${t.name}:§r "What do you want to know?"`);
    for (const tp of topics) form.button(tp.label);
    form.button("Never mind");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || res.selection >= topics.length) return;
    const tp = topics[res.selection];
    const back = await show(player, new ActionFormData().title(tp.label).body(`§e${t.name}:§r ${fill(tp.text, player.name)}`).button("Ask something else").button("Goodbye"));
    if (!back || back.canceled || back.selection !== 0) return;
  }
}

// ---------------------------------------------------------------------------
// The Realm day counter and the calendar (Realm Calendar takes this over later)
// ---------------------------------------------------------------------------

let calDay = 1;
let nightSeen = false;
/** Another pack (Realm Calendar) broadcasts the calendar: npc_bp listens instead. @type {{ from: string, day: number, festival?: string, until: number } | undefined} */
let calOwner;
const OWNER_TIMEOUT_MS = 2 * 3600000;

function loadDay() {
  try {
    const raw = world.getDynamicProperty(PROP_DAY);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : undefined;
    if (isNum(parsed?.d) && parsed.d >= 1) calDay = Math.floor(parsed.d);
    nightSeen = parsed?.n === 1;
  } catch {
    // day 1
  }
}

function saveDay() {
  try {
    world.setDynamicProperty(PROP_DAY, JSON.stringify({ d: calDay, n: nightSeen ? 1 : 0 }));
  } catch (e) {
    console.warn(`[npc] save day: ${e}`);
  }
}

/** The calendar on a Realm day: day of the year (1-96), year, season and festival. @param {number} day */
function calendarOf(day) {
  const len = CALENDAR.seasons.length * CALENDAR.seasonDays;
  const doy = ((day - 1) % len) + 1;
  const year = Math.floor((day - 1) / len) + 1;
  const s = CALENDAR.seasons[Math.min(CALENDAR.seasons.length - 1, Math.floor((doy - 1) / CALENDAR.seasonDays))];
  const f = doy >= s.festival[0] && doy <= s.festival[1] ? s : undefined;
  return { day, doy, year, season: s.id, festival: f ? f.festivalId : undefined, ends: f ? day + (f.festival[1] - doy) : undefined };
}

/** Today's calendar (Realm Calendar's day while it broadcasts). */
function calendarNow() {
  if (calOwner && Date.now() < calOwner.until) return { ...calendarOf(calOwner.day), festival: calOwner.festival };
  return calendarOf(calDay);
}

/** realm:calendar for every pack (unless Realm Calendar owns it, or `own`: its handoff asks for this count). */
function broadcastCalendar(own = false) {
  if (!own && calOwner && Date.now() < calOwner.until) return;
  const c = calendarOf(calDay);
  try {
    system.sendScriptEvent("realm:calendar", JSON.stringify({ ...c, from: "npc_bp" }));
  } catch (e) {
    console.warn(`[npc] calendar: ${e}`);
  }
}

/**
 * Twice a second (the loop): +1 at each dawn seen. The night must have been seen first (time of day 12000 or
 * later), so `/time set` back to the morning never counts and the counter never goes back; sleeping through
 * the night, or setting the time from night to morning, counts as a dawn.
 */
function dayTick() {
  const t = world.getTimeOfDay();
  if (t >= 12000) {
    if (!nightSeen) {
      nightSeen = true;
      saveDay();
    }
  } else if (nightSeen && t < 6000) {
    nightSeen = false;
    calDay++;
    saveDay();
    broadcastCalendar();
  }
}

// ---------------------------------------------------------------------------
// Where everyone is
// ---------------------------------------------------------------------------

/** One line per placed townsfolk: distance and direction from the player. @param {Player} player */
function whereabouts(player) {
  const here = player.location;
  return list
    .filter((r) => folk.has(r.id))
    .map((r) => {
      const t = /** @type {Townsfolk} */ (folk.get(r.id));
      const entity = entityOf(r);
      const at = entity && entity.dimension.id === r.dim ? entity.location : anchorOf(r);
      const roles = t.roles.length ? ` §8(${t.roles.join(", ")})` : "";
      // Where they are in their day, and how well you know them.
      const anchor = anchorOf(r);
      const same = (/** @type {Vector3 | undefined} */ v) => !!v && dist(v, anchor) < 0.5;
      const doing = r.home && same(r.home) && isNight() ? " §7at home" : same(r.posts?.noon) ? " §7at lunch" : same(r.posts?.evening) ? " §7at their evening spot" : "";
      const heart = get("affinity") === true ? ` §d${LEVEL_NAMES[levelWith(player, t.id)]}` : "";
      if (r.dim !== player.dimension.id) return { d: Infinity, text: `${displayName(t)}§f - in ${dimName(r.dim)}${doing}${heart}${roles}` };
      const d = Math.round(Math.hypot(at.x - here.x, at.z - here.z));
      const where = d < 4 ? "right here" : `${d}m ${compass(at.x - here.x, at.z - here.z)}`;
      return { d, text: `${displayName(t)}§f - ${where}${doing}${heart}${roles}` };
    })
    .sort((a, b) => a.d - b.d)
    .map((x) => x.text);
}

/** @param {Player} player @param {Townsfolk} t */
async function whoLivesHere(player, t) {
  const lines = whereabouts(player);
  const form = new ActionFormData()
    .title(plainName(t))
    .body(`§e${t.name}:§r "Folk around here? Let me think."\n\n${lines.join("\n")}`)
    .button("Thanks");
  await show(player, form);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {import("@minecraft/server").CustomCommandOrigin} origin */
const playerOf = (origin) => {
  const p = origin.initiator ?? origin.sourceEntity;
  return p instanceof Player ? p : undefined;
};

/** @param {Vector3} loc block-centered x/z, feet height */
const centered = (loc) => ({ x: Math.floor(loc.x) + 0.5, y: Math.round(loc.y * 100) / 100, z: Math.floor(loc.z) + 0.5 });
/**
 * Where the player stands, or the ground under them when they're in the air (flying, jumping): an NPC placed in
 * the air falls and is put back every half second, bobbing forever. @param {Player} player
 */
function standingSpot(player) {
  const at = centered(player.location);
  const dim = player.dimension;
  if (player.isOnGround) return standUp(dim, at);
  try {
    // The first block under the feet that isn't a plant, torch or carpet; its top, not its base + 1 (a slab or a
    // path block is lower than a full block).
    const x = Math.floor(at.x);
    const z = Math.floor(at.z);
    const bottom = Math.max(Math.floor(at.y) - 64, dim.heightRange.min);
    for (let y = Math.floor(at.y); y >= bottom; y--) {
      const b = dim.getBlock({ x, y, z });
      if (!b || b.isLiquid) break; // over water or lava: keep the spot rather than put the NPC on the sea floor
      if (b.isAir || PASSABLE.test(b.typeId)) continue;
      const top = y + heightOf(b);
      return top <= at.y + 0.01 ? { x: at.x, y: top, z: at.z } : standUp(dim, at);
    }
  } catch {
    // below the world or not loaded: keep the spot
  }
  return at;
}
/** @param {Vector3} p */
const coords = (p) => `${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}`;

/** Places (or moves) a townsfolk where the player stands, facing them. Returns an error, or undefined. @param {Player} player @param {string} id */
function addNpc(player, id) {
  const t = folk.get(id);
  if (!t) {
    player.sendMessage(`§cNo townsfolk "${id}" in config.js.`);
    return `no townsfolk "${id}"`;
  }
  const at = standingSpot(player);
  const yaw = wrap(player.getRotation().y + 180); // facing the operator who placed it
  const dim = player.dimension;
  let rec = placedOf(id);
  let note = "";
  if (rec) {
    if ((rec.home || rec.posts) && rec.dim !== dim.id) {
      rec.home = undefined;
      rec.posts = undefined;
      note = " §7Their home and lunch or evening spots were in another dimension, so they were cleared.";
    }
    Object.assign(rec, { dim: dim.id, x: at.x, y: at.y, z: at.z, yaw });
  } else {
    rec = { id, dim: dim.id, x: at.x, y: at.y, z: at.z, yaw };
    list.push(rec);
  }
  save();
  const st = stateOf(id);
  st.missing = 0;
  const entity = entityOf(rec);
  let moved = false;
  if (entity) {
    try {
      entity.teleport(at, { dimension: dim, rotation: { x: 0, y: yaw } });
      dress(entity, t);
      st.yaw = yaw;
      moved = true;
    } catch (e) {
      console.warn(`[npc] move ${id}: ${e}`);
      try {
        entity.remove();
      } catch {
        // gone already: the audit removes any leftover
      }
    }
  }
  // Not loaded (or couldn't move): a new one here; the old one is removed when its chunk loads.
  if (!moved) spawn(rec, t, at);
  player.sendMessage(`§aPlaced ${plainName(t)} at ${coords(at)}.§7 Sneak and tap them in creative mode to pick a skin.${note}`);
  return undefined;
}

/** Removes the nearest townsfolk, after a confirmation (its skin can't be put back). @param {Player} player */
async function removeNpc(player) {
  const [entity] = player.dimension.getEntities({ type: NPC_TYPE, tags: [OWNER_TAG], location: player.location, maxDistance: CONFIG.removeRange, closest: 1 });
  if (!entity) return player.sendMessage(`§cNo townsfolk within ${CONFIG.removeRange} blocks.`);
  const id = idOf(entity);
  const t = id ? folk.get(id) : undefined;
  const who = t ? plainName(t) : "that NPC";
  const res = await show(
    player,
    new ActionFormData()
      .title("Remove townsfolk?")
      .body(`Remove ${who}, ${Math.round(dist(entity.location, player.location))} blocks from you? Their post, home and lunch and evening spots are forgotten, and the skin picked for them is lost: /realm:npc_add ${id ?? "<id>"} places them again with the default skin.`)
      .button("Remove")
      .button("Cancel"),
  );
  if (!res || res.canceled || res.selection !== 0 || !player.isValid) return;
  if (!entity.isValid) return player.sendMessage(`§c${who} isn't loaded any more: nothing was removed.`);
  const before = list.length;
  list = list.filter((r) => r.id !== id);
  if (list.length !== before) save();
  if (id) states.delete(id);
  entity.remove();
  player.sendMessage(`§aRemoved ${t ? plainName(t) : "that NPC"}. §7Place them again with /realm:npc_add ${id ?? "<id>"}.`);
}

/** @param {Player} player @param {string} id */
function setHome(player, id) {
  const t = folk.get(id);
  const rec = placedOf(id);
  if (!t || !rec) return player.sendMessage(`§c${t ? plainName(t) : id} isn't placed yet: /realm:npc_add ${id} first.`);
  if (player.dimension.id !== rec.dim) return player.sendMessage(`§cA home must be in the same dimension as their post (${dimName(rec.dim)}).`);
  const at = standingSpot(player);
  if (dist(at, rec) <= 2) {
    rec.home = undefined;
    save();
    return player.sendMessage(`§a${plainName(t)} no longer has a home: they stay at their post day and night.`);
  }
  rec.home = { x: at.x, y: at.y, z: at.z };
  save();
  const far = dist(at, rec) > 96 ? " §eTip: a home close to the post (under 96 blocks) loads together with it, so they never miss the walk." : "";
  const off = get("nightRoutine") === true ? "" : " §7(Go home at night is disabled in /realm:config.)";
  player.sendMessage(`§a${plainName(t)} now goes home to ${coords(at)} at night.${off}${far}`);
}

/** A lunch (`noon`) or evening spot where the operator stands; at the post it clears it. @param {Player} player @param {string} id @param {string} slot */
function setPost(player, id, slot) {
  const t = folk.get(id);
  const rec = placedOf(id);
  if (slot !== "noon" && slot !== "evening") return player.sendMessage("§cPick noon or evening.");
  if (!t || !rec) return player.sendMessage(`§c${t ? plainName(t) : id} isn't placed yet: /realm:npc_add ${id} first.`);
  if (player.dimension.id !== rec.dim) return player.sendMessage(`§cThat spot must be in the same dimension as their post (${dimName(rec.dim)}).`);
  const what = slot === "noon" ? "lunch" : "evening";
  const when = slot === "noon" ? `${CONFIG.lunchStart} to ${CONFIG.eveningStart}` : `${CONFIG.eveningStart} to ${CONFIG.nightStart}`;
  const at = standingSpot(player);
  const posts = { ...(rec.posts ?? {}) };
  if (dist(at, rec) <= 2) {
    delete posts[slot];
    rec.posts = posts.noon || posts.evening ? posts : undefined;
    save();
    return player.sendMessage(`§a${plainName(t)} no longer has a ${what} spot: they stay at their post then.`);
  }
  posts[slot] = { x: at.x, y: at.y, z: at.z };
  rec.posts = posts;
  save();
  const far = dist(at, rec) > 96 ? " §eTip: a spot close to the post (under 96 blocks) loads together with it, so they keep their skin when they move." : "";
  const off = get("schedules") === true ? "" : " §7(Daily schedule is disabled in /realm:config.)";
  player.sendMessage(`§a${plainName(t)} now spends ${what} (time ${when}) at ${coords(at)}, moving when nobody is within ${CONFIG.scheduleRange} blocks.${off}${far}`);
}

/** @param {Player} player */
function listForOps(player) {
  const lines = list.map((r) => {
    const t = folk.get(r.id);
    const home = `${r.home ? ` §7home ${coords(r.home)}` : ""}${r.posts?.noon ? ` §7lunch ${coords(r.posts.noon)}` : ""}${r.posts?.evening ? ` §7evening ${coords(r.posts.evening)}` : ""}`;
    const state = entityOf(r) ? "§a(loaded)" : "§8(not loaded)";
    return `§e${r.id}§f ${t ? plainName(t) : ""}: ${coords(r)} in ${dimName(r.dim)}${home} ${state}`;
  });
  const missing = CONFIG.townsfolk.filter((t) => !placedOf(t.id)).map((t) => t.id);
  player.sendMessage(
    [
      `§6Townsfolk placed: ${list.length}`,
      ...lines,
      missing.length ? `§7Not placed: ${missing.join(", ")} §8(/realm:npc_add <id>)` : "§7Every townsfolk is placed.",
    ].join("\n"),
  );
}

/** @param {Player} player */
function listForPlayers(player) {
  const lines = whereabouts(player);
  if (!lines.length) return player.sendMessage("§7No townsfolk live on this realm yet. Operators place them with /realm:npc_add.");
  player.sendMessage([`§6Townsfolk on the realm §7(tap one to talk):`, ...lines].join("\n"));
}

/** The /realm:npc menu: who lives here, and for operators every townsfolk tool. @param {Player} player */
async function menu(player) {
  const op = isOp(player);
  /** @type {[string, () => unknown][]} */
  const actions = [["Who lives here?", () => whoMenu(player)]];
  if (op) {
    actions.push(["Add or move a townsfolk here\n§8Operators", () => pickAndRun(player, "Add or move here", "They stand where you are, facing you.", (id) => addNpc(player, id))]);
    actions.push(["Set a home here\n§8Operators", () => pickAndRun(player, "Set home", "They come here at night. Pick one standing at its post to clear its home.", (id) => setHome(player, id), true)]);
    actions.push(["Set a lunch spot here\n§8Operators", () => pickAndRun(player, "Set lunch spot", "They come here at lunch. Pick one standing at its post to clear it.", (id) => setPost(player, id, "noon"), true)]);
    actions.push(["Set an evening spot here\n§8Operators", () => pickAndRun(player, "Set evening spot", "They come here in the evening. Pick one standing at its post to clear it.", (id) => setPost(player, id, "evening"), true)]);
    actions.push(["Remove the nearest townsfolk\n§8Operators", () => removeNpc(player)]);
    actions.push(["List with coordinates\n§8Operators", () => listForOps(player)]);
  }
  const form = new ActionFormData().title("Townsfolk").body(op ? "Who lives on the realm, and the townsfolk tools." : "Who lives on the realm. Tap a townsfolk to talk.");
  for (const [label] of actions) form.button(label);
  form.button("Close");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || res.selection >= actions.length || !player.isValid) return;
  // Everything after "Who lives here?" is for operators: checked again, as the player may have been de-opped meanwhile.
  if (res.selection > 0 && !isOp(player)) return player.sendMessage("§cOnly operators can do that.");
  await actions[res.selection][1]();
}

/** Where everyone is, in a form. @param {Player} player */
async function whoMenu(player) {
  const lines = whereabouts(player);
  await show(player, new ActionFormData().title("Who lives here?").body(lines.length ? lines.join("\n") : "No townsfolk live on this realm yet.").button("OK"));
}

/** A townsfolk picker, then `fn` with the id. @param {Player} player @param {string} title @param {string} help @param {(id: string) => unknown} fn @param {boolean} [placedOnly] */
async function pickAndRun(player, title, help, fn, placedOnly = false) {
  const ids = CONFIG.townsfolk.filter((t) => !placedOnly || placedOf(t.id)).map((t) => t.id);
  if (!ids.length) return player.sendMessage("§cNobody is placed yet.");
  const names = ids.map((id) => {
    const t = /** @type {Townsfolk} */ (folk.get(id));
    return `${plainName(t)}${placedOf(id) ? "" : " (not placed)"}`;
  });
  const res = await show(player, new ModalFormData().title(title).dropdown(help, names).submitButton("OK"));
  if (!res || res.canceled || !player.isValid) return;
  if (!isOp(player)) return player.sendMessage("§cOnly operators can do that."); // de-opped while the form was open
  const id = ids[Number(res.formValues?.[0] ?? 0)];
  if (id) fn(id);
}

/**
 * Runs `fn` with the player who ran the command, outside the read-only command context.
 * @param {import("@minecraft/server").CustomCommandOrigin} origin @param {(player: Player) => void} fn
 * @returns {import("@minecraft/server").CustomCommandResult}
 */
function withPlayer(origin, fn) {
  const player = playerOf(origin);
  if (!player) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
  system.run(() => {
    try {
      if (!ready) return player.sendMessage("§cThe world is still loading. Try again in a moment.");
      if (player.isValid) {
        const r = /** @type {unknown} */ (fn(player));
        if (r instanceof Promise) r.catch((e) => console.warn(`[npc] ${e}`));
      }
    } catch (e) {
      console.warn(`[npc] ${e}`);
      if (player.isValid) player.sendMessage(`§cThat didn't work: ${e}`);
    }
  });
  return { status: CustomCommandStatus.Success };
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerEnum("realm:npc_id", CONFIG.townsfolk.map((t) => t.id));
  customCommandRegistry.registerEnum("realm:npc_slot", ["noon", "evening"]);
  const idParam = [{ name: "realm:npc_id", type: CustomCommandParamType.Enum }];

  customCommandRegistry.registerCommand(
    { name: "realm:npc", description: "Townsfolk: menu (who lives here; operators: add, move, home, remove)", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => withPlayer(origin, menu),
  );
  customCommandRegistry.registerCommand(
    { name: "realm:npc_who", description: "Townsfolk: who lives on the realm and where they are", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => withPlayer(origin, listForPlayers),
  );
  customCommandRegistry.registerCommand(
    { name: "realm:npc_list", description: "Townsfolk: every placed NPC with its coordinates and home", permissionLevel: CommandPermissionLevel.GameDirectors, cheatsRequired: false },
    (origin) => withPlayer(origin, listForOps),
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:npc_add",
      description: "Townsfolk: place an NPC here, facing you (moves it if it is already placed)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: idParam,
    },
    (origin, /** @type {string} */ id) => withPlayer(origin, (p) => addNpc(p, id)),
  );
  customCommandRegistry.registerCommand(
    { name: "realm:npc_remove", description: "Townsfolk: remove the nearest townsfolk NPC within 5 blocks", permissionLevel: CommandPermissionLevel.GameDirectors, cheatsRequired: false },
    (origin) => withPlayer(origin, removeNpc),
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:npc_home",
      description: "Townsfolk: the NPC goes here at night (run it at their post to clear)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: idParam,
    },
    (origin, /** @type {string} */ id) => withPlayer(origin, (p) => setHome(p, id)),
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:npc_post",
      description: "Townsfolk: the NPC spends lunch (noon) or the evening here (run it at their post to clear)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [...idParam, { name: "realm:npc_slot", type: CustomCommandParamType.Enum }],
    },
    (origin, /** @type {string} */ id, /** @type {string} */ slot) => withPlayer(origin, (p) => setPost(p, id, slot)),
  );
});

// Hearth & Hearsay events from other packs.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id === "realm:npc_places_ping") {
      if (ready) sendPlaces(true);
      return;
    }
    if (id !== "realm:gossip" && id !== "realm:npc_flags" && id !== "realm:quest_done" && id !== "realm:calendar" && id !== "realm:calendar_ping") return;
    if (id === "realm:calendar_ping") {
      // { own: true }: Realm Calendar taking over (or back) asks for this pack's own count, even while it listens.
      if (ready) broadcastCalendar(message.includes('"own":true'));
      return;
    }
    /** @type {any} */
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    try {
      if (id === "realm:gossip") {
        if (ready && get("affinity") === true) hearGossip(msg);
      } else if (id === "realm:npc_flags") storyFlags(msg);
      else if (id === "realm:quest_done") questDone(msg);
      else if (id === "realm:calendar" && msg.from !== "npc_bp" && isNum(msg.day) && msg.day >= 1) {
        // Realm Calendar (or another pack) owns the calendar now: listen, and stop broadcasting while it does.
        calOwner = { from: String(msg.from ?? "?").slice(0, 40), day: Math.floor(msg.day), festival: typeof msg.festival === "string" && msg.festival ? msg.festival.slice(0, 32) : undefined, until: Date.now() + OWNER_TIMEOUT_MS };
      }
    } catch (e) {
      console.warn(`[npc] ${id}: ${e}`);
    }
  },
  { namespaces: ["realm"] },
);

/** realm:npc_flags { player, flags } from Story Questlines: the story flags the townsfolk react to. @param {any} msg */
function storyFlags(msg) {
  if (typeof msg.player !== "string" || !msg.flags || typeof msg.flags !== "object") return;
  const player = world.getAllPlayers().find((p) => p.id === msg.player);
  if (!player) return;
  /** @type {Record<string, string>} */
  const f = {};
  for (const [k, v] of Object.entries(msg.flags).slice(0, FLAG_LIMIT)) if (typeof v === "string" || typeof v === "number") f[k.slice(0, 60)] = String(v).slice(0, 40);
  const wasCrowned = crowned(player);
  flagCache.set(player.id, f);
  try {
    player.setDynamicProperty(PROP_FLAGS, JSON.stringify(f));
  } catch (e) {
    console.warn(`[npc] save flags: ${e}`);
  }
  if (crowned(player) !== wasCrowned) sendAffinity(player); // Quill's price changes
}

/** realm:quest_done: a daily favor (+favorPoints with its townsfolk) or a story chapter (+chapterPoints with who gave and ended it). @param {any} msg */
function questDone(msg) {
  if (msg.pack !== "saga_bp" || typeof msg.player !== "string") return;
  const player = world.getAllPlayers().find((p) => p.id === msg.player);
  if (!player) return;
  if (msg.kind === "favor" && typeof msg.npc === "string" && folk.has(msg.npc)) gain(player, msg.npc, CONFIG.favorPoints, "daily favor");
  else if (msg.kind === "story" && Array.isArray(msg.npcs)) {
    for (const npc of new Set(msg.npcs.filter((/** @type {unknown} */ n) => typeof n === "string" && folk.has(n)))) gain(player, npc, CONFIG.chapterPoints, "story chapter");
  }
}

// realm:npc_debug { player, action: "tap", npc, sneak? } (operators and test scenarios; /scriptevent needs operator
// rights): a tap on that townsfolk by that player (id or name), as if they tapped it (sneak: a gift). Simulated
// players' taps fire no interact events, so the test scenarios tap this way.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message, sourceEntity }) => {
    if (id !== "realm:npc_debug" || !ready) return;
    if (sourceEntity instanceof Player && sourceEntity.commandPermissionLevel < CommandPermissionLevel.GameDirectors) return;
    try {
      const m = JSON.parse(message);
      if (!m || m.action !== "tap" || typeof m.npc !== "string" || typeof m.player !== "string") return;
      const player = world.getAllPlayers().find((p) => p.id === m.player || p.name === m.player);
      const rec = placedOf(m.npc);
      const entity = rec ? entityOf(rec) : undefined;
      if (!player || !entity) return;
      tapped(player, entity, m.npc, m.sneak === true).catch((e) => console.warn(`[npc] ${e}`));
    } catch (e) {
      console.warn(`[npc] debug: ${e}`);
    }
  },
  { namespaces: ["realm"] },
);

// realm:npc_summon { id, player }: another pack (Relics' relicsmith) places a townsfolk at an operator,
// exactly like /realm:npc_add run by that player. Answers realm:npc_summoned { id, player, ok, error? }.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:npc_summon") return;
    /** @type {any} */
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (!msg || typeof msg.id !== "string" || typeof msg.player !== "string") return;
    /** @param {boolean} ok @param {string} [error] */
    const reply = (ok, error) => system.sendScriptEvent("realm:npc_summoned", JSON.stringify({ id: msg.id, player: msg.player, ok, ...(error ? { error } : {}) }));
    try {
      const player = world.getAllPlayers().find((p) => p.id === msg.player);
      if (!player) return reply(false, "player not online");
      if (player.commandPermissionLevel < CommandPermissionLevel.GameDirectors) return reply(false, "not an operator");
      if (!ready) return reply(false, "world still loading");
      if (!folk.has(msg.id)) return reply(false, `no townsfolk "${msg.id}"`);
      const err = addNpc(player, msg.id);
      reply(!err, err);
    } catch (e) {
      console.warn(`[npc] summon: ${e}`);
      reply(false, String(e));
    }
  },
  { namespaces: ["realm"] },
);

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "npc_bp");
  },
  { namespaces: ["realm"] },
);
