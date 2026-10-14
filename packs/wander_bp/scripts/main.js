// Wanderers of the Wilds: people out past the town lamps. Once a minute each eligible player may meet
// someone (a Recurring Wanderer, a passing Stranger, or a hostile in disguise); this pack decides who appears
// where, owns their entities and draws their talk form. Story Questlines (saga_bp) runs every quest:
//   realm:npc_talk     { req, player, npc: "w_<wid>", roles: ["wanderer", "w_<wid>"], name }  -> every pack
//   realm:npc_offer    { req, pack, key, label, order? }                     <- answers within 4 ticks
//   realm:npc_choose   { player, npc, pack, key }                            -> the pack whose button was picked
//   realm:wander_spawn { player, wid, archetype, name, hostile?, dim, x, y, z } -> someone appeared
//   realm:wander_turn  { player, wid, kind, dim, x, y, z, accused? }         -> a disguise dropped
//   realm:wander_gone  { player, wid, why }                                  -> a wanderer left (timeout, far, accused, gone)
//   realm:wander_done  { player, wid, how }                                  <- accepted | left | turn | camp
//   realm:wander_state { player, ch, h, s, q }                               <- what each player may meet
//   realm:wander_hide  { wid, player, seconds }                              <- a camp's wanderer walks with you
//   realm:place_ready  { name, state, dim, x, y?, z, wid? }                  <- story places and camps
//   realm:poi          { kind, dim, x, z }                                   <- Atlas sites (anchors), when it comes
// See "Wanderers of the Wilds" in docs/PACKS.md.
import { CommandPermissionLevel, CustomCommandStatus, EquipmentSlot, GameMode, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { EPITHETS, EPITHETS_FOR, FIRST_NAMES, GREETINGS, HOSTILE_GREETINGS, LOOKS, NAMED, NAMED_GREETINGS, SAILOR_LOOK } from "./lines.js";
import { get, getFor } from "./settings.js";
import { allZones, pingZones } from "./zones.js";

/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("./lines.js").Archetype} Archetype */

const PACK = "wander_bp";
const PROP_LIVE = "wander:live"; // world: JSON Record<wid, Live>, wanderers on the road
const PROP_CAMPS = "wander:camps"; // world: JSON Record<wid, Camp>, where each camp's wanderer stands
const PROP_PLAYER = "wander:p"; // player: JSON PlayerData
const PROP_WEATHER = "wander:weather"; // world: overworld weather at the last change

const OWNER_TAG = "realm:npc_owner:wander_bp";
const NPC_TAG = "realm:npc";
const ID_TAG = "realm:npc_id:";
const ROAD_TAG = "wander:k:"; // + wid: on the road
const CAMP_TAG = "wander:c:"; // + wid: at their camp
const OVERWORLD = "minecraft:overworld";
const NETHER = "minecraft:nether";
const DIMENSIONS = [OVERWORLD, NETHER, "minecraft:the_end"];

const LOOP_TICKS = 20; // upkeep: timers, camps, sparkles, keep ghosts in place
const TETHER_TICKS = 10; // walkers: back home past TETHER_MAX, out of water, lava or a hole; protection re-applied
const TETHER_MAX = 12;
const HOLE_DROP = 3; // this far below home...
const HOLE_CHECKS = 6; // ...for this many checks in a row (3 s): stuck in a hole
const RESPAWNS = 5; // a wanderer on the road whose entity vanished nearby comes back this often at most
const LONG = 20000000;
const VILLAGER = "minecraft:villager_v2";
const TRADER = "minecraft:wandering_trader";
const GHOST = "minecraft:allay";
const OLD_NPC = "minecraft:npc"; // before wanderers walked: a leftover on the road is adopted and pinned like a ghost
const TYPES = [VILLAGER, TRADER, GHOST, OLD_NPC];
const WALKERS = new Set([VILLAGER, TRADER]);
const OFFER_TICKS = 4;
const MAX_OFFERS = 16;
const TAP_COOLDOWN = 10;
const MOVE_DISTANCE = 1.5;
const RIVAL_MS = 20 * 60000; // with nothing live to race: Rook comes after a bounty or a treasure map finished this recently
const RIVAL_NEAR = 300; // Rook comes within this many blocks of a live bounty target or the player's own last map leg
const TURN_MS = { spy: 20000, sailor: 10000, hermit: 10000 }; // a disguise drops this long after the first talk
const PLACE_MIN = 24, PLACE_MAX = 40, PLACE_TRIES = 12;
const RUIN_PLACES = new Set(["graveyard", "observatory", "watchtower"]);
const PILGRIM_PLACES = new Set(["old_chapel", "observatory", "starfall"]);

/**
 * A wanderer on the road.
 * @typedef {object} Live
 * @property {string} w encounter id (a Recurring Wanderer's own id, or "s" + base 36 for a Stranger)
 * @property {string} n name
 * @property {Archetype} ar
 * @property {string} [h] hostile kind
 * @property {string} o the player they came for (id)
 * @property {string} d dimension
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} b born (ms)
 * @property {number} [a] a job was accepted (ms)
 * @property {string} [e] entity id
 * @property {string} [t] entity type (none: saved before wanderers walked)
 * @property {number} [r] times the entity was spawned again after it vanished nearby
 * @property {number} [tt] first talk (ms)
 * @property {number} [ta] a disguise drops at (ms)
 * @property {number} [far] the player has been far since (ms)
 */
/** @typedef {{ d: string, x: number, y: number, z: number, e?: string }} Camp where a camp's wanderer stands */
/** @typedef {{ cd?: number, lh?: number, ac?: number, q?: number }} PlayerData cooldown until, last hostile, accused, last bounty/map */
/** @typedef {{ ch: Record<string, string>, h: string[], s: number, q: number }} WanderState */

const NAMED_BY_ID = new Map(NAMED.map((n) => [n.id, n]));

// ---------------------------------------------------------------------------
// Saved state
// ---------------------------------------------------------------------------

/** @type {Record<string, Live>} */
let live = {};
/** @type {Record<string, Camp>} */
let camps = {};
let ready = false;
let weather = "Clear";

/** @param {string} prop @returns {any} */
function readWorld(prop) {
  try {
    const raw = world.getDynamicProperty(prop);
    const v = typeof raw === "string" ? JSON.parse(raw) : undefined;
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    console.warn(`[wander] ${prop} is corrupt; starting over`);
    return {};
  }
}

function saveLive() {
  world.setDynamicProperty(PROP_LIVE, JSON.stringify(live));
}
function saveCamps() {
  world.setDynamicProperty(PROP_CAMPS, JSON.stringify(camps));
}

/** @type {Map<string, PlayerData>} */
const pcache = new Map();
/** @param {Player} p @returns {PlayerData} */
function pdata(p) {
  let d = pcache.get(p.id);
  if (d) return d;
  try {
    const raw = p.getDynamicProperty(PROP_PLAYER);
    d = typeof raw === "string" ? JSON.parse(raw) : {};
  } catch {
    d = {};
  }
  if (!d || typeof d !== "object") d = {};
  pcache.set(p.id, d);
  return d;
}
/** @param {Player} p */
function savePdata(p) {
  try {
    if (p.isValid) p.setDynamicProperty(PROP_PLAYER, JSON.stringify(pdata(p)));
  } catch (e) {
    console.warn(`[wander] save: ${e}`);
  }
}

/** What Story Questlines says each player may meet (realm:wander_state). @type {Map<string, WanderState>} */
const states = new Map();
/** Story places (and Atlas sites): anchors for ghosts, pilgrims and the site bonus. @type {Map<string, { dim: string, x: number, z: number }>} */
const sites = new Map();
/** Camps' wanderers hidden while a story copy walks with someone: wid -> until (ms). @type {Map<string, number>} */
const hidden = new Map();
/** Bounty Board's live champion targets (realm:bounty_targets): id -> spot. @type {Map<string, { dim: string, x: number, z: number }>} */
let bountyTargets = new Map();
/** realm:bounty_targets parts still coming in. @type {Map<string, { dim: string, x: number, z: number }> | undefined} */
let bountyIncoming;
/** Treasure Maps' last legs (realm:map_leg with `final`), per player: hunt id -> spot. @type {Map<string, Map<string, { dim: string, x: number, z: number }>>} */
const finalLegs = new Map();
/** Who has something waiting at which wanderer, from the last talk: "<entity id>|<player id>". @type {Map<string, boolean>} */
const hasOffer = new Map();
/** Camp wanderers with nobody near, since (ms). @type {Map<string, number>} */
const campIdle = new Map();

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** @param {string} id */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);
/** @param {Player} p */
const isOp = (p) => p.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
/** @param {{ x: number, z: number }} a @param {{ x: number, z: number }} b */
const across = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** @param {Vector3} a @param {Vector3} b */
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** @param {number} ticks */
const wait = (ticks) => new Promise((r) => system.runTimeout(() => r(undefined), Math.max(1, ticks)));
/** @template T @param {T[]} list @returns {T} */
const pick = (list) => list[Math.floor(Math.random() * list.length)];
/** @param {string} id @param {object} msg */
function send(id, msg) {
  try {
    system.sendScriptEvent(id, JSON.stringify(msg));
  } catch (e) {
    console.warn(`[wander] ${id}: ${e}`);
  }
}
/** @param {Dimension} dim @param {Vector3} at */
function blockAt(dim, at) {
  try {
    return dim.getBlock(at);
  } catch {
    return undefined;
  }
}
/** @param {string | undefined} id */
function entityById(id) {
  if (!id) return undefined;
  try {
    const e = world.getEntity(id);
    return e && e.isValid ? e : undefined;
  } catch {
    return undefined;
  }
}
const isNight = () => {
  const t = world.getTimeOfDay();
  return t >= 13000 && t < 23000;
};
/** Yaw (degrees) looking from a to b. @param {Vector3} a @param {Vector3} b */
const yawTo = (a, b) => (Math.atan2(-(b.x - a.x), b.z - a.z) * 180) / Math.PI;
/** @param {string} s */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}
/** @param {{ show(p: Player): Promise<any> }} form @param {Player} player @returns {Promise<any>} */
async function show(player, form) {
  for (let i = 0; i < 20; i++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await wait(20);
  }
  return undefined;
}
/** Removes one of our entities, dropping what a villager picked up (bread, carrots, seeds). @param {Entity} ent */
function removeEnt(ent) {
  try {
    const inv = ent.typeId === VILLAGER ? ent.getComponent("minecraft:inventory")?.container : undefined;
    if (inv && inv.emptySlotsCount < inv.size)
      for (let i = 0; i < inv.size; i++) {
        const item = inv.getItem(i);
        if (item) ent.dimension.spawnItem(item, ent.location);
      }
  } catch {
    // unloaded
  }
  try {
    ent.remove();
  } catch {
    // gone already
  }
}
/** @param {Entity} ent */
function poof(ent) {
  try {
    const l = ent.location;
    ent.dimension.spawnParticle("minecraft:knockback_roar_particle", { x: l.x, y: l.y + 1, z: l.z });
  } catch {
    // unloaded
  }
  removeEnt(ent);
}

/** World spawn x/z. */
function spawnXZ() {
  try {
    const s = world.getDefaultSpawnLocation();
    return { x: s.x, z: s.z };
  } catch {
    return { x: 0, z: 0 };
  }
}

/** Wanderer entities right now (on the road and at camps). */
const entityCount = () => Object.values(live).filter((l) => entityById(l.e)).length + Object.values(camps).filter((c) => entityById(c.e)).length;

// ---------------------------------------------------------------------------
// Who may meet someone, and where
// ---------------------------------------------------------------------------

/**
 * Can this player meet someone now? Survival or adventure, not AFK or in an expedition, in the Overworld or the
 * Nether, far enough from spawn, towns, claims, safe zones and other wanderers. @param {Player} player
 */
function eligible(player) {
  let mode;
  try {
    mode = player.getGameMode();
  } catch {
    return false;
  }
  if (mode !== GameMode.Survival && mode !== GameMode.Adventure) return false;
  if (player.hasTag("afk") || player.hasTag("realm_expedition")) return false;
  const dim = player.dimension.id;
  if (dim !== OVERWORLD && dim !== NETHER) return false;
  const p = player.location;
  const s = spawnXZ();
  const fromSpawn = dim === NETHER ? Math.hypot(p.x - s.x / 8, p.z - s.z / 8) * 8 : Math.hypot(p.x - s.x, p.z - s.z);
  if (fromSpawn < Number(get("spawnDistance"))) return false;
  if (nearZone(dim, p, Number(get("zoneDistance")))) return false;
  if (nearWanderer(dim, p, CONFIG.wandererDistance)) return false;
  return true;
}

/** Within `margin` blocks of a town, claim or safe zone (from its edge)? @param {string} dim @param {{ x: number, z: number }} p @param {number} margin */
function nearZone(dim, p, margin) {
  for (const z of allZones()) {
    if (z.dim !== dim) continue;
    const d = z.shape === "square" ? Math.max(Math.abs(p.x - z.x), Math.abs(p.z - z.z)) : Math.hypot(p.x - z.x, p.z - z.z);
    if (d - z.r < margin) return true;
  }
  return false;
}

/** @param {string} dim @param {{ x: number, z: number }} p @param {number} d */
function nearWanderer(dim, p, d) {
  return Object.values(live).some((l) => l.d === dim && across(l, p) < d) || Object.values(camps).some((c) => c.d === dim && across(c, p) < d);
}

/** @param {string} dim @param {{ x: number, z: number }} p @param {number} d @param {(name: string) => boolean} [which] */
function siteNear(dim, p, d, which) {
  for (const [name, s] of sites) if (s.dim === dim && (!which || which(name)) && across(s, p) <= d) return true;
  return false;
}

/** Old stones nearby: 6 or more mossy cobblestone or cracked stone bricks in a 9 x 9 x 5 sample. @param {Player} player */
function ruinsAround(player) {
  const dim = player.dimension;
  const p = player.location;
  let n = 0;
  for (let dx = -4; dx <= 4; dx++)
    for (let dz = -4; dz <= 4; dz++)
      for (let dy = -2; dy <= 2; dy++) {
        const b = blockAt(dim, { x: Math.floor(p.x) + dx, y: Math.floor(p.y) + dy, z: Math.floor(p.z) + dz });
        if (b && (b.typeId === "minecraft:mossy_cobblestone" || b.typeId === "minecraft:cracked_stone_bricks" || b.typeId === "minecraft:mossy_stone_bricks")) if (++n >= 6) return true;
      }
  return false;
}

/** Cold country (the stable API can't read biomes): snow, ice, podzol or spruce under and around the player. @param {Player} player */
function coldAround(player) {
  const dim = player.dimension;
  const p = player.location;
  for (const [dx, dz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]])
    for (const dy of [-1, 0, -2]) {
      const b = blockAt(dim, { x: Math.floor(p.x) + dx, y: Math.floor(p.y) + dy, z: Math.floor(p.z) + dz });
      if (b && /snow|ice$|podzol|spruce_log|spruce_leaves/.test(b.typeId)) return true;
    }
  return false;
}

/** Nothing over the player's head: the sky can see them. @param {Player} player */
function underSky(player) {
  try {
    const top = player.dimension.getTopmostBlock({ x: Math.floor(player.location.x), z: Math.floor(player.location.z) });
    return !top || top.location.y < player.location.y + 1;
  } catch {
    return true;
  }
}

/**
 * Who this player would meet here (first match wins): a deep miner below y 0 with no sky, a ghost at night near
 * ruins, a pilgrim near a holy place by day, Rook near a live bounty target or a last map leg, a hermit up high or in cold
 * country, a storm-chaser in thunder, an exile in the Nether, else a traveler.
 * @param {Player} player @returns {Archetype}
 */
function archetypeFor(player) {
  const dim = player.dimension.id;
  const p = player.location;
  if (dim === NETHER) return "exile";
  const night = isNight();
  if (p.y < 0 && !underSky(player)) return "miner";
  if (night && (siteNear(dim, p, 64, (n) => RUIN_PLACES.has(n) || n.startsWith("poi:")) || ruinsAround(player))) return "ghost";
  if (!night && siteNear(dim, p, 200, (n) => PILGRIM_PLACES.has(n))) return "pilgrim";
  if (rivalNear(player)) return "rival";
  if (p.y >= 100 || coldAround(player)) return "hermit";
  if (weather === "Thunder") return "storm";
  return "traveler";
}

/**
 * Rook is about: the player is within RIVAL_NEAR of a live bounty target or of their own treasure map's last leg. With
 * neither live anywhere (no Bounty Board or Treasure Maps, or nothing posted), he comes after a finished bounty or map.
 * @param {Player} player
 */
function rivalNear(player) {
  const dim = player.dimension.id;
  const p = player.location;
  for (const t of bountyTargets.values()) if (t.dim === dim && across(t, p) <= RIVAL_NEAR) return true;
  const legs = finalLegs.get(player.id);
  for (const l of legs?.values() ?? []) if (l.dim === dim && across(l, p) <= RIVAL_NEAR) return true;
  if (bountyTargets.size || legs?.size) return false;
  return Date.now() - (pdata(player).q ?? 0) < RIVAL_MS;
}

/** realm:bounty_targets { targets, part, parts }: the list, in parts. @param {any} msg */
function onTargets(msg) {
  if (!Array.isArray(msg.targets)) return;
  const part = Number(msg.part) || 1;
  const parts = Number(msg.parts) || 1;
  if (part === 1 || !bountyIncoming) bountyIncoming = new Map();
  for (const t of msg.targets.slice(0, 32))
    if (t && typeof t.id === "string" && typeof t.dim === "string" && Number.isFinite(t.x) && Number.isFinite(t.z)) bountyIncoming.set(t.id, { dim: t.dim, x: t.x, z: t.z });
  if (part >= parts) {
    bountyTargets = bountyIncoming;
    bountyIncoming = undefined;
  }
}

/** realm:map_leg { player, hunt, dim, x, z, final } or { player, hunt, gone }: only last legs are kept. @param {any} msg */
function onLeg(msg) {
  if (typeof msg.player !== "string" || typeof msg.hunt !== "string") return;
  let legs = finalLegs.get(msg.player);
  if (msg.gone || msg.final !== true || typeof msg.dim !== "string" || !Number.isFinite(msg.x) || !Number.isFinite(msg.z)) {
    legs?.delete(msg.hunt);
    if (legs && !legs.size) finalLegs.delete(msg.player);
    return;
  }
  if (!legs) finalLegs.set(msg.player, (legs = new Map()));
  if (legs.size < 16 || legs.has(msg.hunt)) legs.set(msg.hunt, { dim: msg.dim, x: msg.x, z: msg.z });
}

/** Water within 6 blocks of a spot (a lost sailor stands by it). @param {Dimension} dim @param {Vector3} at */
function waterNear(dim, at) {
  for (const [dx, dz] of [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4], [6, 6], [-6, 6], [6, -6], [-6, -6]])
    for (const dy of [-1, 0]) {
      const b = blockAt(dim, { x: Math.floor(at.x) + dx, y: Math.floor(at.y) + dy, z: Math.floor(at.z) + dz });
      if (b?.isLiquid && b.typeId.includes("water")) return true;
    }
  return false;
}

/**
 * A spot 24 to 40 blocks ahead along the player's view: solid ground, two blocks of air; under open sky above
 * ground (the stable API can't read light: the sky stands in for it), on a floor near the player's height
 * underground and in the Nether. 12 tries, else none. @param {Player} player @param {boolean} deep
 */
function findSpot(player, deep) {
  const dim = player.dimension;
  const p = player.location;
  let v;
  try {
    v = player.getViewDirection();
  } catch {
    v = { x: 0, y: 0, z: 1 };
  }
  const base = Math.atan2(v.z, v.x);
  for (let i = 0; i < PLACE_TRIES; i++) {
    const a = base + (Math.random() - 0.5) * (i < 6 ? 0.8 : 2.4);
    const d = PLACE_MIN + Math.random() * (PLACE_MAX - PLACE_MIN);
    const x = Math.floor(p.x + Math.cos(a) * d);
    const z = Math.floor(p.z + Math.sin(a) * d);
    let y;
    if (deep) {
      for (let dy = 0; dy <= 6 && y === undefined; dy++)
        for (const yy of dy ? [Math.floor(p.y) + dy, Math.floor(p.y) - dy] : [Math.floor(p.y)]) {
          const feet = blockAt(dim, { x, y: yy, z });
          const head = blockAt(dim, { x, y: yy + 1, z });
          const below = blockAt(dim, { x, y: yy - 1, z });
          if (feet?.isAir && head?.isAir && below && !below.isAir && !below.isLiquid) {
            y = yy;
            break;
          }
        }
    } else {
      try {
        // An unloaded column answers with a block that throws when read: skip it.
        const top = dim.getTopmostBlock({ x, z });
        if (!top || top.isLiquid || /leaves|lava|fire|magma|cactus/.test(top.typeId)) continue;
        const feet = blockAt(dim, { x, y: top.location.y + 1, z });
        const head = blockAt(dim, { x, y: top.location.y + 2, z });
        if (feet?.isAir && head?.isAir) y = top.location.y + 1;
      } catch {
        continue;
      }
    }
    if (y === undefined) continue;
    if (nearZone(dim.id, { x, z }, Number(get("zoneDistance")))) continue;
    return { x: x + 0.5, y, z: z + 0.5 };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Meeting someone
// ---------------------------------------------------------------------------

/** A Stranger's name, from the pools for their archetype. @param {Archetype} ar */
function strangerName(ar) {
  const ep = EPITHETS[pick(EPITHETS_FOR[ar] ?? EPITHETS_FOR.traveler)];
  return `${pick(FIRST_NAMES)} ${ep}`;
}

/** The hostile kinds that fit this archetype and spot. @param {Archetype} ar @param {string[]} allowed @param {Player} player */
function hostileKinds(ar, allowed, player) {
  const night = isNight();
  /** @type {string[]} */
  const out = [];
  if (allowed.includes("spy") && (ar === "pilgrim" || ar === "traveler")) out.push("spy");
  if (allowed.includes("toll") && ar === "traveler" && !night) out.push("toll");
  if (allowed.includes("sailor") && night && ar !== "miner" && ar !== "exile" && ar !== "ghost") out.push("sailor");
  if (allowed.includes("hermit") && ar === "hermit" && player.location.y >= 100) out.push("hermit");
  return out;
}

/** Below half health? @param {Player} player */
function hurt(player) {
  try {
    const h = player.getComponent("minecraft:health");
    return !!h && h.currentValue < h.effectiveMax / 2;
  } catch {
    return false;
  }
}

/**
 * The once-a-minute roll for one player: who they meet (if anyone), and where.
 * @param {Player} player @param {{ force?: boolean, sure?: boolean, stranger?: boolean, archetype?: Archetype, named?: string, hostile?: string }} [opts] debug and operators: `force` skips every rule, `sure` only the chance, `stranger` never a Recurring Wanderer
 * @returns {string | undefined} why nobody came (for operators), or undefined when someone did
 */
function roll(player, opts = {}) {
  const now = Date.now();
  const pd = pdata(player);
  if (!opts.force) {
    // Without Story Questlines (it sends realm:wander_state) nobody would have anything to say.
    if (!states.has(player.id)) return "no word from Story Questlines yet";
    if (getFor(player, "meet") !== true) return "they don't want to meet wanderers";
    if ((pd.cd ?? 0) > now) return "cooldown";
    if (!eligible(player)) return "not eligible here";
  }
  if (Object.values(live).some((l) => l.o === player.id)) return "already meeting someone";
  const onRoad = Object.values(live);
  if (onRoad.length >= Number(get("maxOnRoad"))) return "the roads are full";
  if (entityCount() >= CONFIG.maxEntities) return "too many wanderers";
  const st = states.get(player.id);
  const ar = opts.archetype ?? archetypeFor(player);
  const night = isNight();
  const hostileOk =
    !!st && !st.q && st.h.length > 0 && now - (pd.lh ?? 0) >= Number(get("hostileGapMinutes")) * 60000 && !hurt(player) && onRoad.filter((l) => l.h).length < CONFIG.maxHostile;
  if (!opts.force && !opts.sure) {
    let chance = Number(get("rollChance"));
    if (siteNear(player.dimension.id, player.location, 128)) chance *= CONFIG.siteBonus;
    if (night && (ar === "ghost" || hostileOk)) chance *= CONFIG.nightBonus;
    if (Math.random() >= chance) return "no luck this minute";
  }
  // Who: a hostile in disguise, a Recurring Wanderer whose chain this player can start (or has lost the camp of), or a Stranger.
  /** @type {string | undefined} */
  let hostile = opts.hostile;
  if (!hostile && !opts.named && hostileOk) {
    const kinds = hostileKinds(ar, st?.h ?? [], player);
    if (kinds.length && Math.random() < Math.max(0, Math.min(0.5, Number(get("hostileShare"))))) hostile = pick(kinds);
  }
  /** @type {import("./lines.js").Named | undefined} */
  let named = opts.named ? NAMED_BY_ID.get(opts.named) : undefined;
  if (!named && !hostile && !opts.hostile && !opts.stranger) {
    const cand = NAMED.find((n) => n.archetype === ar && !onRoad.some((l) => l.w === n.id) && (st?.ch[n.id] === "n" || ((st?.ch[n.id] === "a" || st?.ch[n.id] === "o") && !camps[n.id])));
    if (cand && (opts.archetype || st?.q || Math.random() < CONFIG.namedShare)) named = cand;
  }
  if (!named && !hostile && st?.q) return "busy with a stranger's job";
  const deep = player.dimension.id === NETHER || (ar === "miner" && player.location.y < 0);
  let spot = findSpot(player, deep);
  if (spot && hostile === "sailor" && !opts.force && !waterNear(player.dimension, spot)) {
    // A lost sailor stands by water: try again, else a plain traveler comes instead.
    spot = findSpot(player, deep);
    if (spot && !waterNear(player.dimension, spot)) hostile = undefined;
  }
  if (!spot) return "no spot to stand on ahead";
  const wid = named ? named.id : `s${(hash(`${player.id}|${now}|${Math.random()}`) % 2176782336).toString(36)}`;
  const name = named ? named.name : strangerName(ar);
  /** @type {Live} */
  const rec = { w: wid, n: name, ar: named ? named.archetype : ar, o: player.id, d: player.dimension.id, x: spot.x, y: spot.y, z: spot.z, b: now };
  if (hostile) rec.h = hostile;
  rec.t = typeFor(rec);
  const ent = spawnWanderer(player.dimension, rec, rec.t, false, lookFor(rec));
  if (!ent) return "couldn't spawn";
  live[wid] = rec;
  saveLive();
  send("realm:wander_spawn", { player: player.id, wid, archetype: rec.ar, name, ...(hostile ? { hostile } : {}), dim: rec.d, x: rec.x, y: rec.y, z: rec.z });
  hasOffer.set(`${ent.id}|${player.id}`, true);
  const dir = compass(spot.x - player.location.x, spot.z - player.location.z);
  player.sendMessage(`§e[Wanderers] Someone is on the road ahead (${dir}): ${named ? "§6" : "§f"}${name}§e.`);
  player.playSound("note.chime", { pitch: 0.8, volume: 0.6 });
  return undefined;
}

/** "NE" for a step of dx east, dz south. @param {number} dx @param {number} dz */
function compass(dx, dz) {
  const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360 + 22.5) % 360;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.floor(deg / 45) % 8];
}

/** What a wanderer is: a Recurring Wanderer's own entity; a ghost an allay; a traveler a wandering trader (a drowned sailor in disguise excepted); else a villager. @param {{ w: string, ar: Archetype, h?: string }} rec */
function typeFor(rec) {
  const n = NAMED_BY_ID.get(rec.w);
  if (n) return n.entity;
  if (rec.ar === "ghost" && !rec.h) return GHOST;
  if (rec.ar === "traveler" && rec.h !== "sailor") return TRADER;
  return VILLAGER;
}

/** The villager event that sets their profession look. @param {{ w: string, ar?: Archetype, h?: string }} rec */
function lookFor(rec) {
  if (rec.h === "sailor") return SAILOR_LOOK;
  const ar = NAMED_BY_ID.get(rec.w)?.archetype ?? rec.ar ?? "traveler";
  return LOOKS[ar] ?? "";
}

/** Can't be hurt (Resistance V stops every damage but /kill and the void), burn, drown or suffocate; re-applied when gone (a trader's milk at dawn clears it). @param {Entity} ent */
function protect(ent) {
  try {
    if (!ent.getEffect("resistance")) {
      ent.addEffect("resistance", LONG, { amplifier: 4, showParticles: false });
      ent.addEffect("fire_resistance", LONG, { amplifier: 0, showParticles: false });
      ent.addEffect("water_breathing", LONG, { amplifier: 0, showParticles: false });
    }
    const h = ent.getComponent("minecraft:health");
    if (h && h.currentValue < h.effectiveMax) h.resetToMaxValue();
  } catch {
    // unloaded
  }
}

/**
 * Spawns a wanderer's entity: a villager in their profession's look (a wandering trader for travelers, an allay for
 * ghosts), named, tagged, can't be hurt, never despawns (named; a trader that despawns anyway is spawned again).
 * @param {Dimension} dim @param {{ w: string, n: string, x: number, y: number, z: number, e?: string }} rec @param {string} type @param {boolean} camp @param {string} look
 */
function spawnWanderer(dim, rec, type, camp, look) {
  try {
    // A villager starts as a village's newcomer (no job yet, a random skin, the biome's clothes), then takes their look.
    const ent = dim.spawnEntity(/** @type {any} */ (type), { x: rec.x, y: rec.y, z: rec.z }, type === VILLAGER ? { spawnEvent: "minecraft:spawn_from_village" } : undefined);
    for (const tag of [OWNER_TAG, NPC_TAG, ID_TAG + `w_${rec.w}`, (camp ? CAMP_TAG : ROAD_TAG) + rec.w]) ent.addTag(tag);
    ent.nameTag = `${NAMED_BY_ID.has(rec.w) ? "§6" : "§e"}${rec.n}`;
    if (type === VILLAGER) {
      // Also grows up a baby (1 in 20 spawn as one). The event applies a tick later; `tether` checks it took.
      dress(ent, look || "minecraft:become_unskilled");
      dressing.set(ent.id, look || "minecraft:become_unskilled");
    }
    if (type !== OLD_NPC) protect(ent);
    if (camp) camps[rec.w].e = ent.id;
    else rec.e = ent.id;
    return ent;
  } catch (e) {
    console.warn(`[wander] spawn ${type}: ${e}`);
    return undefined;
  }
}

/**
 * A wanderer leaves the road: their entity goes (with a puff), the player's cooldown starts (shorter when they took
 * a job), and Story Questlines hears why (unless it asked). @param {string} wid @param {string} why @param {boolean} [tell]
 */
function leave(wid, why, tell = true) {
  const rec = live[wid];
  if (!rec) return;
  delete live[wid];
  saveLive();
  const ent = entityById(rec.e);
  if (ent) poof(ent);
  if (rec.e) for (const k of [...hasOffer.keys()]) if (k.startsWith(`${rec.e}|`)) hasOffer.delete(k);
  const p = online(rec.o);
  if (p) {
    const pd = pdata(p);
    const took = !!rec.a || why === "turn" || why === "done";
    pd.cd = Date.now() + Number(get(took ? "cooldownMinutes" : "declineCooldownMinutes")) * 60000;
    savePdata(p);
  }
  if (tell) send("realm:wander_gone", { player: rec.o, wid, why });
}

/** A disguise drops: the entity goes, and Story Questlines starts the fight there. @param {Live} rec @param {boolean} accused */
function turn(rec, accused) {
  const p = online(rec.o);
  const ent = entityById(rec.e);
  const at = ent ? ent.location : rec;
  delete live[rec.w];
  saveLive();
  if (ent) poof(ent);
  if (!p) return;
  const pd = pdata(p);
  pd.lh = Date.now();
  pd.cd = Date.now() + Number(get("cooldownMinutes")) * 60000;
  savePdata(p);
  send("realm:wander_turn", { player: rec.o, wid: rec.w, kind: rec.h, dim: rec.d, x: at.x, y: at.y, z: at.z, ...(accused ? { accused: true } : {}) });
}

// ---------------------------------------------------------------------------
// Upkeep, every second
// ---------------------------------------------------------------------------

/** Keeps a ghost (or a leftover NPC) on its spot, turned toward someone near. @param {Entity} ent @param {{ x: number, y: number, z: number }} at @param {Player | undefined} face */
function keep(ent, at, face) {
  try {
    const l = ent.location;
    const off = dist3(l, at) > MOVE_DISTANCE;
    if (!off && !face) return;
    const rotation = face ? { x: 0, y: yawTo(l, face.location) } : undefined;
    if (off || (face && Math.abs(((rotation?.y ?? 0) - ent.getRotation().y + 540) % 360 - 180) > 10)) ent.teleport(off ? at : l, rotation ? { rotation } : undefined);
  } catch {
    // unloaded
  }
}

/** Sparkles over a wanderer who has something for this player (only they see them). @param {Player} p @param {Entity} ent */
function sparkle(p, ent) {
  if (get("sparkles") !== true) return;
  try {
    const l = ent.location;
    p.spawnParticle("minecraft:villager_happy", { x: l.x, y: l.y + 2.3, z: l.z });
    p.spawnParticle("minecraft:villager_happy", { x: l.x + 0.25, y: l.y + 2.5, z: l.z - 0.2 });
  } catch {
    // unloaded
  }
}

/**
 * A wanderer on the road whose entity vanished (a wandering trader's own despawn timer, a lightning strike that made
 * a witch of them): spawned again on their spot while their player is near and the spot is loaded, at most
 * RESPAWNS times. A copy that was only unloaded is removed when it loads again (`audit`). @param {Live} rec
 */
function again(rec) {
  if ((rec.r ?? 0) >= RESPAWNS) return undefined;
  const p = online(rec.o);
  if (!p || p.dimension.id !== rec.d || across(p.location, rec) > CONFIG.leaveDistance) return undefined;
  const dim = world.getDimension(rec.d);
  if (!blockAt(dim, rec) || entityCount() >= CONFIG.maxEntities) return undefined;
  rec.r = (rec.r ?? 0) + 1;
  const old = rec.e;
  const ent = spawnWanderer(dim, rec, rec.t ?? typeFor(rec), false, lookFor(rec));
  saveLive();
  if (ent && old) for (const [k, v] of [...hasOffer]) if (k.startsWith(`${old}|`)) hasOffer.set(`${ent.id}${k.slice(old.length)}`, v);
  return ent;
}

/** Villagers whose look isn't confirmed yet: entity id -> the vanilla event. @type {Map<string, string>} */
const dressing = new Map();
/** @param {Entity} ent @param {string} look */
function dress(ent, look) {
  try {
    ent.triggerEvent(look);
  } catch (e) {
    console.warn(`[wander] look ${look}: ${e}`);
  }
}
/** Dressed as they should be? The event's job is a type family ("become_sheperd" sets "shepherd"). @param {Entity} ent @param {string} look */
const dressed = (ent, look) => ent.matches({ families: [look.replace("minecraft:become_", "").replace("sheperd", "shepherd")] });

/** Checks in a row each walker has been down a hole. @type {Map<string, number>} */
const lowFor = new Map();

/** Walkers (villagers, traders) stroll with the vanilla AI; past TETHER_MAX from home, in water or lava or stuck down a hole, they're put back. @param {Entity} ent @param {{ x: number, y: number, z: number }} home */
function tether(ent, home) {
  try {
    const look = dressing.get(ent.id);
    if (look) {
      if (dressed(ent, look)) dressing.delete(ent.id);
      else dress(ent, look);
    }
    const l = ent.location;
    let back = dist3(l, home) > TETHER_MAX || ent.isInWater;
    if (!back) back = !!blockAt(ent.dimension, l)?.typeId.includes("lava");
    if (!back && l.y < home.y - HOLE_DROP) {
      const n = (lowFor.get(ent.id) ?? 0) + 1;
      lowFor.set(ent.id, n);
      back = n >= HOLE_CHECKS;
    } else lowFor.delete(ent.id);
    if (back) {
      lowFor.delete(ent.id);
      ent.teleport(home);
      ent.clearVelocity();
    }
    protect(ent);
  } catch {
    // unloaded
  }
}

function tetherAll() {
  if (!ready) return;
  for (const rec of Object.values(live)) {
    const ent = entityById(rec.e);
    if (ent && WALKERS.has(ent.typeId)) tether(ent, rec);
    else if (ent && ent.typeId === GHOST) protect(ent);
  }
  for (const c of Object.values(camps)) {
    const ent = entityById(c.e);
    if (ent && WALKERS.has(ent.typeId)) tether(ent, c);
    else if (ent && ent.typeId === GHOST) protect(ent);
  }
}

function upkeep() {
  if (!ready) return;
  const now = Date.now();
  const enabled = get("enabled") === true;
  // On the road
  for (const rec of Object.values(live)) {
    let ent = entityById(rec.e);
    if (!ent && enabled) ent = again(rec);
    if (!ent) {
      leave(rec.w, "gone"); // unloaded, or removed far from their player: never brought back
      continue;
    }
    const p = online(rec.o);
    const life = (rec.a ? Number(CONFIG.acceptedLifeMinutes) : Number(CONFIG.lifeMinutes)) * 60000;
    if (!enabled || now - (rec.a ?? rec.b) > life) {
      if (p && enabled) p.sendMessage(`§7[Wanderers] ${rec.n} goes on their way.`);
      leave(rec.w, "timeout");
      continue;
    }
    const far = !p || p.dimension.id !== rec.d || across(p.location, rec) > CONFIG.leaveDistance;
    if (far) {
      rec.far ??= now;
      if (now - rec.far > CONFIG.leaveSeconds * 1000) {
        leave(rec.w, "far");
        continue;
      }
    } else delete rec.far;
    if (rec.h && rec.ta && now >= rec.ta) {
      turn(rec, false);
      continue;
    }
    if (!WALKERS.has(ent.typeId)) keep(ent, rec, p && !far && across(p.location, rec) <= 8 ? p : undefined);
    if (p && !far && hasOffer.get(`${ent.id}|${p.id}`) && across(p.location, rec) <= 32) sparkle(p, ent);
  }
  // At camps: there while someone on that chain is near, gone otherwise (and while an escort's copy walks).
  const players = world.getAllPlayers();
  for (const [wid, c] of Object.entries(camps)) {
    const ent = entityById(c.e);
    const needers = enabled ? players.filter((p) => p.dimension.id === c.d && across(p.location, c) <= CONFIG.campRange && ["a", "o"].includes(states.get(p.id)?.ch[wid] ?? "")) : [];
    const hide = (hidden.get(wid) ?? 0) > now;
    if (ent) {
      if (hide || !needers.length) {
        const since = campIdle.get(wid) ?? now;
        campIdle.set(wid, since);
        if (hide || now - since > 30000) {
          delete c.e;
          saveCamps();
          removeEnt(ent);
        }
        continue;
      }
      campIdle.delete(wid);
      const [near] = needers.sort((a, b) => across(a.location, c) - across(b.location, c));
      if (!WALKERS.has(ent.typeId)) keep(ent, c, across(near.location, c) <= 8 ? near : undefined);
      for (const p of needers) if (states.get(p.id)?.ch[wid] === "o" || hasOffer.get(`${ent.id}|${p.id}`)) sparkle(p, ent);
      continue;
    }
    if (!needers.length || hide) continue;
    const dim = world.getDimension(c.d);
    if (!blockAt(dim, c)) continue;
    if (entityCount() >= CONFIG.maxEntities) continue;
    // One may be standing there already (a chunk that loaded before its entity was seen): adopt it.
    const found = dim.getEntities({ tags: [CAMP_TAG + wid], location: c, maxDistance: TETHER_MAX + 4 });
    if (found.length) {
      c.e = found[0].id;
      for (const extra of found.slice(1)) removeEnt(extra);
      saveCamps();
      continue;
    }
    const n = NAMED_BY_ID.get(wid);
    if (!n) continue;
    spawnWanderer(dim, { w: wid, n: n.name, x: c.x, y: c.y, z: c.z }, n.entity, true, lookFor({ w: wid }));
    saveCamps();
  }
}

// ---------------------------------------------------------------------------
// Talking
// ---------------------------------------------------------------------------

let requests = 0;
/** @type {Map<string, { pack: string, key: string, label: string, order: number }[]>} */
const rounds = new Map();
/** @type {Set<string>} */
const busy = new Set();
/** @type {Map<string, number>} */
const lastTap = new Map();

/** The wanderer an entity is: on the road (`live`) or at a camp. @param {Entity} ent */
function whoIs(ent) {
  for (const tag of ent.getTags()) {
    if (tag.startsWith(ROAD_TAG)) {
      const rec = live[tag.slice(ROAD_TAG.length)];
      if (rec) return { wid: rec.w, rec, name: rec.n };
    }
    if (tag.startsWith(CAMP_TAG)) {
      const wid = tag.slice(CAMP_TAG.length);
      const n = NAMED_BY_ID.get(wid);
      if (n && camps[wid]) return { wid, rec: undefined, name: n.name };
    }
  }
  return undefined;
}

/** May this player use "Something's off..."? Reyes a Friend or more, `g:iron` 3+ (both from the story), or the Gray Choir Mask on. @param {Player} p */
function suspicious(p) {
  if (states.get(p.id)?.s) return true;
  try {
    const head = p.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Head);
    return !!head?.nameTag && head.nameTag.includes("Gray Choir Mask");
  } catch {
    return false;
  }
}

/** What they say when you walk up. @param {string} wid @param {Live | undefined} rec */
function greeting(wid, rec) {
  if (rec?.h) return pick(HOSTILE_GREETINGS[rec.h] ?? GREETINGS.traveler);
  if (NAMED_GREETINGS[wid]) return pick(NAMED_GREETINGS[wid]);
  return pick(GREETINGS[rec?.ar ?? "traveler"] ?? GREETINGS.traveler);
}

/** A tap on a wanderer: the offer round, then their form. @param {Player} player @param {Entity} ent */
async function tapped(player, ent) {
  const now = system.currentTick;
  if (busy.has(player.id) || now - (lastTap.get(player.id) ?? -TAP_COOLDOWN) < TAP_COOLDOWN) return;
  lastTap.set(player.id, now);
  const who = whoIs(ent);
  if (!who) return;
  const { wid, rec, name } = who;
  busy.add(player.id);
  // A walker stands still while you talk (30 s at most).
  const walker = WALKERS.has(ent.typeId);
  try {
    if (walker) ent.addEffect("slowness", 600, { amplifier: 255, showParticles: false });
  } catch {
    // unloaded
  }
  try {
    const mine = !rec || rec.o === player.id;
    // A disguise's clock starts at the first talk with the player it came for.
    if (rec?.h && mine && !rec.tt) {
      rec.tt = Date.now();
      const ms = /** @type {Record<string, number>} */ (TURN_MS)[rec.h];
      if (ms) rec.ta = rec.tt + ms;
      saveLive();
    }
    try {
      ent.teleport(ent.location, { rotation: { x: 0, y: yawTo(ent.location, player.location) } });
    } catch {
      // unloaded
    }
    const npc = `w_${wid}`;
    const req = `wander:${wid}:${player.id}:${now}:${++requests}`;
    rounds.set(req, []);
    send("realm:npc_talk", { req, player: player.id, npc, roles: ["wanderer", npc], name });
    await wait(OFFER_TICKS);
    const offers = rounds.get(req) ?? [];
    rounds.delete(req);
    if (!player.isValid) return;
    hasOffer.set(`${ent.id}|${player.id}`, offers.length > 0);
    offers.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
    const lines = [`§e${name}:§r "${greeting(wid, rec)}"`];
    if (!mine) lines.push("", `§7${name} is waiting for someone else.`);
    else if (!offers.length) lines.push("", "§7They have nothing for you right now.");
    const accuse = !!rec && mine && suspicious(player);
    const form = new ActionFormData().title(name).body(lines.join("\n"));
    for (const o of offers) form.button(o.label);
    if (accuse) form.button("Something's off...\n§8Accuse them");
    form.button("Goodbye");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
    const offer = offers[res.selection];
    if (offer) {
      send("realm:npc_choose", { player: player.id, npc, pack: offer.pack, key: offer.key });
      return;
    }
    if (accuse && res.selection === offers.length) {
      busy.delete(player.id);
      await accuseForm(player, wid);
    }
  } finally {
    busy.delete(player.id);
    try {
      if (walker && ent.isValid) ent.removeEffect("slowness");
    } catch {
      // unloaded
    }
  }
}

/** "Something's off...": accuse them? A hostile drops its disguise (slowed); a friend walks away hurt. @param {Player} player @param {string} wid */
async function accuseForm(player, wid) {
  const rec = live[wid];
  if (!rec) return;
  const res = await show(
    player,
    new ActionFormData()
      .title("Something's off...")
      .body(`Say it to ${rec.n}'s face: they're not what they seem?\n\n§7If you're right, it's a fight (and it starts badly for them). If you're wrong, they leave, and that's that.`)
      .button("Accuse them")
      .button("Never mind"),
  );
  if (!res || res.canceled || res.selection !== 0 || !player.isValid) return;
  const now = live[wid];
  if (!now) return;
  if (now.h) {
    turn(now, true);
    return;
  }
  const pd = pdata(player);
  pd.ac = (pd.ac ?? 0) + 1;
  savePdata(player);
  player.sendMessage(`§7[Wanderers] ${now.n} stares at you, hurt, and walks away without a word.`);
  leave(wid, "accused");
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  const { player, target } = ev;
  try {
    if (!target.hasTag(OWNER_TAG)) return;
    ev.cancel = true; // no trading, no allay taking your items, no name tag or lead, no NPC editor
    system.run(() => {
      if (player.isValid && target.isValid) tapped(player, target).catch((e) => console.warn(`[wander] ${e}`));
    });
  } catch (e) {
    console.warn(`[wander] ${e}`);
  }
});

/**
 * One of our entities is gone (removed, unloaded, or, for a villager, killed somehow: `entityDie` fires for them,
 * never for NPCs). A camp's wanderer comes back when someone on the chain is near; one on the road is spawned again
 * by the next upkeep if their player is near, else they've left (`again`). @param {string} id
 */
function lost(id) {
  lowFor.delete(id);
  dressing.delete(id);
  for (const c of Object.values(camps)) if (c.e === id) delete c.e;
}

world.afterEvents.entityRemove.subscribe(
  ({ removedEntityId }) => {
    try {
      lost(removedEntityId);
    } catch (e) {
      console.warn(`[wander] ${e}`);
    }
  },
  { entityTypes: TYPES },
);

world.afterEvents.entityDie.subscribe(
  ({ deadEntity }) => {
    try {
      lost(deadEntity.id);
    } catch (e) {
      console.warn(`[wander] ${e}`);
    }
  },
  { entityTypes: [VILLAGER, TRADER, GHOST] },
);

/** Our names as name tags ("§6Pell the Pilgrim"), for what a wanderer turned into (it keeps the name, not the tags). */
function ourNames() {
  const out = new Set(NAMED.map((n) => `§6${n.name}`));
  for (const rec of Object.values(live)) out.add(`${NAMED_BY_ID.has(rec.w) ? "§6" : "§e"}${rec.n}`);
  return out;
}

// A trader's two llamas, and a wanderer struck by lightning (a witch) or by a zombie (a zombie villager, which the
// protection should prevent): removed; the wanderer is spawned again (`again`) or comes back to their camp.
world.afterEvents.entitySpawn.subscribe(({ entity, cause }) => {
  try {
    if (cause === "Event" && entity.typeId === "minecraft:trader_llama") {
      system.run(() => {
        try {
          if (entity.isValid && entity.getComponent("minecraft:leashable")?.leashHolder?.hasTag(OWNER_TAG)) entity.remove();
        } catch {
          // gone
        }
      });
    } else if (cause === "Transformed" && /witch|zombie_villager/.test(entity.typeId) && entity.nameTag && ourNames().has(entity.nameTag)) {
      system.run(() => {
        if (entity.isValid) poof(entity);
      });
    }
  } catch (e) {
    console.warn(`[wander] ${e}`);
  }
});

/** Removes an entity of ours that belongs to no wanderer on the road and no camp (after a restart, a lost save). @param {Entity} ent */
function audit(ent) {
  if (!ready || !ent.isValid || !ent.hasTag(OWNER_TAG)) return;
  for (const tag of ent.getTags()) {
    if (tag.startsWith(ROAD_TAG)) {
      const rec = live[tag.slice(ROAD_TAG.length)];
      if (rec && (!rec.e || rec.e === ent.id || !entityById(rec.e))) {
        rec.e = ent.id;
        return;
      }
    }
    if (tag.startsWith(CAMP_TAG)) {
      const c = camps[tag.slice(CAMP_TAG.length)];
      if (c && (!c.e || c.e === ent.id || !entityById(c.e))) {
        c.e = ent.id;
        return;
      }
    }
  }
  removeEnt(ent);
}

world.afterEvents.entityLoad.subscribe(({ entity }) => {
  try {
    if (TYPES.includes(entity.typeId)) audit(entity);
  } catch (e) {
    console.warn(`[wander] ${e}`);
  }
});

function sweep() {
  for (const id of DIMENSIONS) {
    try {
      for (const ent of world.getDimension(id).getEntities({ tags: [OWNER_TAG] })) audit(ent);
    } catch (e) {
      console.warn(`[wander] sweep: ${e}`);
    }
  }
}

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather }) => {
  if (dimension !== OVERWORLD && dimension !== "overworld") return;
  weather = String(newWeather);
  try {
    world.setDynamicProperty(PROP_WEATHER, weather);
  } catch {
    // too early
  }
});

/** @param {any} msg */
function onState(msg) {
  if (typeof msg.player !== "string" || !msg.ch || typeof msg.ch !== "object") return;
  /** @type {Record<string, string>} */
  const ch = {};
  for (const [k, v] of Object.entries(msg.ch)) if (NAMED_BY_ID.has(k) && typeof v === "string") ch[k] = v;
  states.set(msg.player, { ch, h: Array.isArray(msg.h) ? msg.h.filter((/** @type {unknown} */ x) => typeof x === "string") : [], s: msg.s ? 1 : 0, q: msg.q ? 1 : 0 });
}

/** @param {any} msg */
function onDone(msg) {
  if (typeof msg.wid !== "string") return;
  const rec = live[msg.wid];
  if (!rec || (typeof msg.player === "string" && rec.o !== msg.player && msg.how !== "camp")) return;
  if (msg.how === "accepted") {
    rec.a = Date.now();
    saveLive();
  } else if (msg.how === "left" || msg.how === "camp") leave(msg.wid, "done", false);
  else if (msg.how === "turn") {
    const ent = entityById(rec.e);
    delete live[msg.wid];
    saveLive();
    if (ent) poof(ent);
    const p = online(rec.o);
    if (p) {
      const pd = pdata(p);
      pd.lh = Date.now();
      pd.cd = Date.now() + Number(get("cooldownMinutes")) * 60000;
      savePdata(p);
    }
  }
}

/** realm:place_ready: story places (anchors) and camps (where their wanderer stands). @param {any} msg */
function onPlace(msg) {
  if (typeof msg.name !== "string") return;
  const removed = msg.state === "removed" || typeof msg.dim !== "string" || !Number.isFinite(msg.x) || !Number.isFinite(msg.z);
  if (typeof msg.wid === "string" && NAMED_BY_ID.has(msg.wid)) {
    const old = camps[msg.wid];
    if (removed || msg.state === "picked" || !Number.isFinite(msg.y)) {
      if (old) {
        const ent = entityById(old.e);
        delete camps[msg.wid];
        saveCamps();
        if (ent) removeEnt(ent);
      }
      return;
    }
    const c = { d: msg.dim, x: Math.floor(msg.x) + 0.5, y: Math.floor(msg.y), z: Math.floor(msg.z) + 0.5 };
    if (old && old.d === c.d && dist3(old, c) < 1) return;
    const ent = entityById(old?.e);
    if (ent) removeEnt(ent);
    camps[msg.wid] = c;
    saveCamps();
    return;
  }
  if (removed) sites.delete(msg.name);
  else sites.set(msg.name, { dim: msg.dim, x: msg.x, z: msg.z });
}

/** realm:poi (Atlas of the Realm, later): a site is an anchor like a story place. @param {any} msg */
function onPoi(msg) {
  if (typeof msg.dim !== "string" || !Number.isFinite(msg.x) || !Number.isFinite(msg.z)) return;
  const key = `poi:${typeof msg.kind === "string" ? msg.kind.slice(0, 24) : "site"}:${Math.floor(msg.x)},${Math.floor(msg.z)}`;
  if (sites.size > 400) return;
  sites.set(key, { dim: msg.dim, x: msg.x, z: msg.z });
}

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message, sourceEntity }) => {
    if (
      id !== "realm:npc_offer" &&
      id !== "realm:wander_state" &&
      id !== "realm:wander_done" &&
      id !== "realm:wander_hide" &&
      id !== "realm:place_ready" &&
      id !== "realm:poi" &&
      id !== "realm:quest_done" &&
      id !== "realm:bounty_targets" &&
      id !== "realm:map_leg" &&
      id !== "realm:wander_debug"
    )
      return;
    /** @type {any} */
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    try {
      if (id === "realm:npc_offer") {
        const offers = typeof msg.req === "string" ? rounds.get(msg.req) : undefined;
        if (!offers || typeof msg.pack !== "string" || typeof msg.key !== "string" || typeof msg.label !== "string" || !msg.label.trim() || msg.pack === PACK) return;
        if (offers.length >= MAX_OFFERS || offers.some((x) => x.pack === msg.pack && x.key === msg.key)) return;
        offers.push({ pack: msg.pack.slice(0, 64), key: msg.key.slice(0, 64), label: msg.label.slice(0, 80), order: typeof msg.order === "number" && Number.isFinite(msg.order) ? msg.order : 50 });
      } else if (id === "realm:wander_state") onState(msg);
      else if (id === "realm:wander_done") onDone(msg);
      else if (id === "realm:wander_hide") {
        if (typeof msg.wid === "string" && NAMED_BY_ID.has(msg.wid)) hidden.set(msg.wid, Date.now() + Math.max(1, Math.min(60, Number(msg.seconds) || 10)) * 1000);
      } else if (id === "realm:place_ready") onPlace(msg);
      else if (id === "realm:poi") onPoi(msg);
      else if (id === "realm:bounty_targets") onTargets(msg);
      else if (id === "realm:map_leg") onLeg(msg);
      else if (id === "realm:quest_done") {
        // Rook follows bounty hunters and treasure seekers.
        if ((msg.pack === "bounty_bp" || msg.pack === "maps_bp") && typeof msg.player === "string") {
          const p = online(msg.player);
          if (p) {
            pdata(p).q = Date.now();
            savePdata(p);
          }
        }
      } else if (id === "realm:wander_debug") {
        if (!(sourceEntity instanceof Player) || isOp(sourceEntity)) debug(msg);
      }
    } catch (e) {
      console.warn(`[wander] ${id}: ${e}`);
    }
  },
  { namespaces: ["realm"] },
);

/**
 * realm:wander_debug (operators and test scenarios; /scriptevent needs operator rights):
 * `{ player, action: "spawn", archetype?, named?, hostile?, stranger? }` someone appears for the player now (no roll,
 * no distance rules; `stranger: true` never a Recurring Wanderer); `{ player, action: "roll" }` the minute's roll for them, with every rule but the chance;
 * `{ player, action: "tap", wid }` a tap on that wanderer (simulated players' taps fire no events);
 * `{ player, action: "accuse", wid }`; `{ action: "state" }` prints what's on the road to the content log.
 * @param {any} msg
 */
function debug(msg) {
  const player = typeof msg.player === "string" ? world.getAllPlayers().find((p) => p.id === msg.player || p.name === msg.player) : undefined;
  if (msg.action === "state") {
    console.warn(`[wander] live ${JSON.stringify(live)} camps ${JSON.stringify(camps)} states ${JSON.stringify([...states])}`);
    return;
  }
  if (!player) return;
  if (msg.action === "spawn") {
    const why = roll(player, { force: true, stranger: msg.stranger === true, archetype: typeof msg.archetype === "string" ? msg.archetype : undefined, named: msg.named, hostile: msg.hostile });
    if (why) console.warn(`[wander] debug spawn for ${player.name}: ${why}`);
  } else if (msg.action === "roll") {
    const why = roll(player, { sure: true });
    console.warn(`[wander] debug roll for ${player.name}: ${why ?? "someone came"}`);
  } else if (msg.action === "tap" || msg.action === "accuse") {
    const wid = typeof msg.wid === "string" ? msg.wid : Object.values(live).find((l) => l.o === player.id)?.w;
    if (!wid) return;
    if (msg.action === "accuse") {
      const rec = live[wid];
      if (!rec) return;
      if (rec.h) turn(rec, true);
      else leave(wid, "accused");
      return;
    }
    const ent = entityById(live[wid]?.e ?? camps[wid]?.e);
    if (ent) tapped(player, ent).catch((e) => console.warn(`[wander] ${e}`));
  }
}


// ---------------------------------------------------------------------------
// The menu
// ---------------------------------------------------------------------------

/** @param {Player} player */
async function menu(player) {
  const st = states.get(player.id);
  const mineNow = Object.values(live).find((l) => l.o === player.id);
  const lines = [];
  if (get("enabled") !== true) lines.push("§cWanderers are paused by an operator.§r", "");
  lines.push("Out past the town lamps (300 blocks from spawn, 160 from any town, claim or safe zone) you'll meet people on the road. Walk up and tap them.");
  if (getFor(player, "meet") !== true) lines.push("", "§7You've chosen not to meet wanderers (Meet wanderers in /realm:prefs).");
  if (mineNow) lines.push("", `§fOn the road for you now: §e${mineNow.n}§r (${Math.floor(mineNow.x)}, ${Math.floor(mineNow.z)})`);
  const known = NAMED.filter((n) => st?.ch[n.id] && st.ch[n.id] !== "n");
  if (known.length) {
    lines.push("", "§lWanderers you know§r");
    for (const n of known) {
      const c = camps[n.id];
      const state = st?.ch[n.id] === "d" ? "§aa friend" : c ? `§fcamp at ${Math.floor(c.x)}, ${Math.floor(c.z)}${st?.ch[n.id] === "o" ? " §6(something waits)" : ""}` : "§7on the road somewhere";
      lines.push(`§e${n.name}§r: ${state}§r`);
    }
  }
  const pd = pdata(player);
  const left = Math.max(0, (pd.cd ?? 0) - Date.now());
  if (left > 0) lines.push("", `§7Nobody new for about ${Math.ceil(left / 60000)} min.`);
  const form = new ActionFormData().title("Wanderers of the Wilds").body(lines.join("\n"));
  /** @type {[string, () => Promise<unknown> | unknown][]} */
  const acts = [];
  if (isOp(player)) {
    acts.push(["On the road now\n§8Operators", () => opList(player)]);
    acts.push(["Someone appears here\n§8Operators", () => opSpawn(player)]);
  }
  for (const [label] of acts) form.button(label);
  form.button("Close");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || res.selection >= acts.length) return;
  await acts[res.selection][1]();
}

/** @param {Player} player */
async function opList(player) {
  const list = Object.values(live);
  const lines = list.length ? list.map((l) => `§e${l.n}§r${l.h ? ` §c(${l.h})` : ""} for ${online(l.o)?.name ?? "someone gone"} at ${Math.floor(l.x)} ${Math.floor(l.y)} ${Math.floor(l.z)}`) : ["Nobody is on the road."];
  lines.push("", `Camps: ${Object.keys(camps).length ? Object.entries(camps).map(([w, c]) => `${NAMED_BY_ID.get(w)?.name ?? w} (${Math.floor(c.x)}, ${Math.floor(c.z)})`).join(", ") : "none"}`);
  const res = await show(player, new ActionFormData().title("On the road now").body(lines.join("\n")).button("Send everyone on the road away").button("Back"));
  if (!res || res.canceled || res.selection !== 0) return;
  clearRoad();
  player.sendMessage(`§a[Wanderers] Sent ${list.length} wanderer(s) away.`);
}

/** Every wanderer on the road leaves. */
function clearRoad() {
  for (const w of Object.keys(live)) leave(w, "timeout");
}

const ARCHETYPES = /** @type {Archetype[]} */ (["traveler", "pilgrim", "ghost", "miner", "hermit", "storm", "exile", "rival"]);
const KINDS = ["", "spy", "toll", "sailor", "hermit"];

/** @param {Player} player */
async function opSpawn(player) {
  const res = await show(
    player,
    new ModalFormData()
      .title("Someone appears here")
      .dropdown("Who", ["A Stranger", ...NAMED.map((n) => n.name)])
      .dropdown("A Stranger's kind", ARCHETYPES.map((a) => a.charAt(0).toUpperCase() + a.slice(1)))
      .dropdown("Hostile (a Stranger only)", ["No", "Choir Spy", "Toll Man", "Drowned Sailor", "Hollow-touched Hermit"])
      .submitButton("Appear"),
  );
  if (!res || res.canceled || !player.isValid) return;
  const v = (res.formValues ?? []).filter((/** @type {unknown} */ x) => x !== undefined);
  const who = Number(v[0] ?? 0);
  const named = who > 0 ? NAMED[who - 1]?.id : undefined;
  const why = roll(player, { force: true, stranger: !named, named, archetype: named ? NAMED[who - 1]?.archetype : ARCHETYPES[Number(v[1] ?? 0)], hostile: named ? undefined : KINDS[Number(v[2] ?? 0)] || undefined });
  player.sendMessage(why ? `§c[Wanderers] Nobody came: ${why}.` : "§a[Wanderers] Someone is on the road ahead of you.");
}

// ---------------------------------------------------------------------------
// Commands, loops, load
// ---------------------------------------------------------------------------

/** @param {import("@minecraft/server").CustomCommandOrigin} origin @param {(p: Player) => unknown} fn */
function withPlayer(origin, fn) {
  const p = origin.initiator ?? origin.sourceEntity;
  if (!(p instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
  system.run(() => {
    try {
      const r = fn(p);
      if (r instanceof Promise) r.catch((e) => console.warn(`[wander] ${e}`));
    } catch (e) {
      console.warn(`[wander] ${e}`);
    }
  });
  return { status: CustomCommandStatus.Success };
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    { name: "realm:wander", description: "Wanderers of the Wilds: who's on the road, the wanderers you know and their camps", permissionLevel: CommandPermissionLevel.Any, cheatsRequired: false },
    (origin) => withPlayer(origin, menu),
  );
  customCommandRegistry.registerCommand(
    { name: "realm:wander_clear", description: "Wanderers of the Wilds (operators): send every wanderer on the road away", permissionLevel: CommandPermissionLevel.GameDirectors, cheatsRequired: false },
    (origin) =>
      withPlayer(origin, (p) => {
        const n = Object.keys(live).length;
        clearRoad();
        p.sendMessage(`§a[Wanderers] Sent ${n} wanderer(s) away.`);
      }),
  );
});

world.afterEvents.worldLoad.subscribe(() => {
  live = readWorld(PROP_LIVE);
  camps = readWorld(PROP_CAMPS);
  try {
    const w = world.getDynamicProperty(PROP_WEATHER);
    if (typeof w === "string") weather = w;
  } catch {
    // none yet
  }
  ready = true;
  sweep();
  pingZones();
  system.runTimeout(() => {
    send("realm:place_ping", {});
    send("realm:wander_ping", {});
    send("realm:bounty_targets_ping", {});
    send("realm:map_leg_ping", {});
  }, 100);
});

system.runInterval(() => {
  try {
    upkeep();
  } catch (e) {
    console.warn(`[wander] ${e}`);
  }
}, LOOP_TICKS);

system.runInterval(() => {
  try {
    tetherAll();
  } catch (e) {
    console.warn(`[wander] ${e}`);
  }
}, TETHER_TICKS);

system.runInterval(() => {
  if (!ready || get("enabled") !== true) return;
  for (const p of world.getAllPlayers()) {
    try {
      roll(p);
    } catch (e) {
      console.warn(`[wander] ${e}`);
    }
  }
}, Math.max(200, Math.floor(Number(CONFIG.scheduleTicks)) || 1200));

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  pcache.delete(playerId);
  states.delete(playerId);
  finalLegs.delete(playerId);
  busy.delete(playerId);
  lastTap.delete(playerId);
  for (const k of [...hasOffer.keys()]) if (k.endsWith(`|${playerId}`)) hasOffer.delete(k);
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "wander_bp");
  },
  { namespaces: ["realm"] },
);
