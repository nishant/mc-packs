import { BlockVolume, EntityDamageCause, EquipmentSlot, ItemStack, Player, WeatherType, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, MessageFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";
import { onScriptEvent } from "./script-events.js";

// Callings (docs/RPG_DESIGN.md section 5): at a total skill level of `callings.unlockTotal` a player picks one of
// six Callings. Each has an active ability on the Calling Sigil and a talent tree of 3 tiers x 3 talents. Everything
// about a player's Calling is one player property, `skills:calling`. Other packs hear about it through
// `realm:calling { player, name, calling, label, talents, bonus, ready, from }` and keep it in memory.

/** @typedef {"mining" | "woodcutting" | "farming" | "fishing" | "combat" | "exploration"} Skill */
/** @typedef {typeof CONFIG.callings.list[number]} Calling */
/** @typedef {Calling["talents"][number]} Talent */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("@minecraft/server").Entity} Entity */
/**
 * c: the Calling id ("" none); t: talent id -> rank; n: switches made (the first choice isn't one); d: the Realm day of
 * the last choice (-1 unknown); w: the game day then; cd: Date.now() when the Sigil is ready again.
 * @typedef {{ c: string, t: Record<string, number>, n: number, d: number, w: number, cd: number }} State
 */
/** @typedef {{ levelFor: (p: Player, s: Skill) => number, active: (p: Player) => boolean, names: Record<Skill, string>, skills: Skill[] }} Api */

const PROP = "skills:calling";
const PROP_WEATHER = "skills:weather";
const SIGIL_ITEM = "minecraft:music_disc_ward";
const SIGIL_PROP = "skills:sigil";
const SIGIL_NAME = "§r§6Calling Sigil";
const PARTY_TAG = "realm_party:";
const CHAMPION_TAG = "realm:champion";
const OVERWORLD = "minecraft:overworld";
const ROMAN = ["I", "II", "III", "IV", "V"];
const GUILD_NAMES = /** @type {Record<string, string>} */ ({ miners: "Miners", growers: "Growers", wardens: "Wardens", wayfarers: "Wayfarers" });
const MAX_GUARD = 60; // percent: talents never take more than this off one hit
const MAX_CD = 60; // percent: cooldown talents never take more off than this
const LOW_HP = 0.3;
const HOLD = { duration: 210, refreshBelow: 30 };
const NIGHT_VISION = { duration: 400, refreshBelow: 240 };
const GLOW_PARTICLE = "minecraft:villager_happy";
const GLOW_MAX = 48; // ore spots shown at once
const LOGS_TO_SAPLINGS = /** @type {Record<string, string>} */ ({
  "minecraft:oak_log": "minecraft:oak_sapling",
  "minecraft:spruce_log": "minecraft:spruce_sapling",
  "minecraft:birch_log": "minecraft:birch_sapling",
  "minecraft:jungle_log": "minecraft:jungle_sapling",
  "minecraft:acacia_log": "minecraft:acacia_sapling",
  "minecraft:dark_oak_log": "minecraft:dark_oak_sapling",
  "minecraft:mangrove_log": "minecraft:mangrove_propagule",
  "minecraft:cherry_log": "minecraft:cherry_sapling",
  "minecraft:pale_oak_log": "minecraft:pale_oak_sapling",
  "minecraft:crimson_stem": "minecraft:crimson_fungus",
  "minecraft:warped_stem": "minecraft:warped_fungus",
});
const FIRE = new Set([EntityDamageCause.fire, EntityDamageCause.fireTick, EntityDamageCause.lava, EntityDamageCause.campfire, EntityDamageCause.soulCampfire, EntityDamageCause.magma]);
const PROJECTILE = new Set([EntityDamageCause.projectile]);
const EXPLOSION = new Set([EntityDamageCause.blockExplosion, EntityDamageCause.entityExplosion]);

/** @type {Api} */
let api;

/** Called once by main.js. @param {Api} a */
export function init(a) {
  api = a;
}

const C = () => CONFIG.callings;
const on = () => get("callings.enabled") === true;
/** @type {Map<string, Calling>} */
const byId = new Map(CONFIG.callings.list.map((c) => [c.id, c]));
/** @type {Map<string, { talent: Talent, calling: Calling }>} */
const talentById = new Map();
for (const c of CONFIG.callings.list) for (const t of c.talents) talentById.set(t.id, { talent: t, calling: c });

/** @param {string} id */
const playerById = (id) => world.getAllPlayers().find((p) => p.id === id);

// ---------------------------------------------------------------------------
// Saved state
// ---------------------------------------------------------------------------

/** @type {Map<string, State>} */
const states = new Map();

/** @param {Player} player @returns {State} */
function stateOf(player) {
  let st = states.get(player.id);
  if (st) return st;
  st = { c: "", t: {}, n: 0, d: -1, w: -1, cd: 0 };
  try {
    const raw = player.getDynamicProperty(PROP);
    const p = typeof raw === "string" ? JSON.parse(raw) : undefined;
    if (p && typeof p === "object") {
      st.c = typeof p.c === "string" && byId.has(p.c) ? p.c : "";
      st.n = Math.max(0, Math.floor(Number(p.n) || 0));
      st.d = Number.isFinite(p.d) ? Math.floor(p.d) : -1;
      st.w = Number.isFinite(p.w) ? Math.floor(p.w) : -1;
      st.cd = Number.isFinite(p.cd) ? p.cd : 0;
      const calling = byId.get(st.c);
      if (calling && p.t && typeof p.t === "object") {
        for (const t of calling.talents) {
          const r = Math.floor(Number(p.t[t.id]) || 0);
          if (r > 0) st.t[t.id] = Math.min(r, t.v.length);
        }
      }
    }
  } catch {
    // corrupt: start over
  }
  states.set(player.id, st);
  return st;
}

/** @param {Player} player @param {State} st */
function save(player, st) {
  try {
    player.setDynamicProperty(PROP, JSON.stringify(st));
  } catch (e) {
    console.warn(`[skills] calling: ${e}`);
  }
}

/** The player's Calling while Callings are on (and the player isn't in creative or spectator), else undefined. @param {Player} player */
function callingOf(player) {
  if (!on()) return undefined;
  return byId.get(stateOf(player).c);
}

/** Each talent the player has with its rank, while it works. @param {Player} player @returns {[Talent, number][]} */
function talentsOf(player) {
  const calling = callingOf(player);
  if (!calling || !api.active(player)) return [];
  const st = stateOf(player);
  /** @type {[Talent, number][]} */
  const out = [];
  for (const t of calling.talents) if ((st.t[t.id] ?? 0) > 0) out.push([t, st.t[t.id]]);
  return out;
}

/** The value of a talent at a rank. @param {Talent} t @param {number} rank */
const valueOf = (t, rank) => Number(t.v[Math.max(0, Math.min(t.v.length, rank) - 1)]) || 0;

/** The sum of the values of the player's talents of a kind that pass `ok`. @param {Player} player @param {string} kind @param {(t: Talent) => boolean} [ok] */
function sum(player, kind, ok) {
  let n = 0;
  for (const [t, r] of talentsOf(player)) if (t.kind === kind && (!ok || ok(t))) n += valueOf(t, r);
  return n;
}

/** @param {Player} player */
export function totalLevel(player) {
  return api.skills.reduce((n, s) => n + api.levelFor(player, s), 0);
}

/** Can the player have a Calling (total skill level)? @param {Player} player */
const isReady = (player) => totalLevel(player) >= get("callings.unlockTotal");

/** Talent points for a Calling. @param {Player} player @param {Calling} calling */
function pointsFor(player, calling) {
  const combined = calling.skills.reduce((n, s) => n + api.levelFor(player, /** @type {Skill} */ (s)), 0);
  const every = Math.max(1, Math.floor(C().pointsEvery));
  const extra = Math.floor(Math.max(0, combined - C().pointsFrom) / every);
  return Math.max(0, Math.min(C().maxPoints, C().pointsBase + extra));
}

/** Points spent, in all and in tiers up to `tier`. @param {State} st @param {number} [tier] */
function spent(st, tier = 3) {
  let n = 0;
  for (const [id, r] of Object.entries(st.t)) {
    const t = talentById.get(id)?.talent;
    if (t && t.tier <= tier) n += r;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Realm day (switching gap) and weather (rain talents)
// ---------------------------------------------------------------------------

/** The Realm day from the last `realm:calendar`, or -1. */
let realmDay = -1;
/** @type {WeatherType} */
let weather = WeatherType.Clear;
let weatherSeen = false;

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather }) => {
  if (dimension !== OVERWORLD && dimension !== "overworld") return;
  weather = newWeather;
  weatherSeen = true;
  try {
    world.setDynamicProperty(PROP_WEATHER, newWeather);
  } catch {
    // not loaded yet
  }
});

world.afterEvents.worldLoad.subscribe(() => {
  if (!weatherSeen) {
    try {
      const saved = world.getDynamicProperty(PROP_WEATHER);
      if (saved === WeatherType.Rain || saved === WeatherType.Thunder || saved === WeatherType.Clear) weather = saved;
    } catch {
      // as clear
    }
  }
  // Who is here: the Townsfolk pack (Hollis and Moss) changes where Callings can be chosen. The Realm Calendar's day.
  system.runTimeout(() => {
    system.sendScriptEvent("realm:help_ping", "");
    system.sendScriptEvent("realm:calendar_ping", "{}");
    system.sendScriptEvent("realm:npc_flags_ping", "{}");
  }, 120);
});

/** Nothing over the player's head (open sky). @param {Player} player */
function openSky(player) {
  try {
    const l = player.location;
    const top = player.dimension.getTopmostBlock({ x: Math.floor(l.x), z: Math.floor(l.z) });
    return !top || top.location.y < Math.floor(l.y) + 1;
  } catch {
    return false;
  }
}

/** Underground: below y 40 with blocks overhead. @param {Player} player */
function underground(player) {
  try {
    const l = player.location;
    if (l.y >= 40) return false;
    const top = player.dimension.getTopmostBlock({ x: Math.floor(l.x), z: Math.floor(l.z) });
    return !!top && top.location.y > Math.floor(l.y) + 2;
  } catch {
    return false;
  }
}

/** In the rain (or a thunderstorm), under open sky in the Overworld. @param {Player} player */
const inRain = (player) => player.dimension.id === OVERWORLD && weather !== WeatherType.Clear && openSky(player);
/** @param {Player} player */
const inThunder = (player) => player.dimension.id === OVERWORLD && weather === WeatherType.Thunder && openSky(player);

/** Realm days since the last choice (Infinity when there was none). @param {State} st */
function daysSince(st) {
  if (st.d < 0 && st.w < 0) return Infinity;
  if (realmDay >= 0 && st.d >= 0) return realmDay - st.d;
  return st.w >= 0 ? world.getDay() - st.w : Infinity;
}

// ---------------------------------------------------------------------------
// Crowns (the shared `crowns` scoreboard)
// ---------------------------------------------------------------------------

function crownsObjective() {
  try {
    return world.scoreboard.getObjective("crowns") ?? world.scoreboard.addObjective("crowns", "Crowns");
  } catch {
    return world.scoreboard.getObjective("crowns");
  }
}

/** @param {Player} player */
function crownsOf(player) {
  try {
    return crownsObjective()?.getScore(player) ?? 0;
  } catch {
    return 0; // no score anywhere yet
  }
}

/** Takes Crowns if the player has them. @param {Player} player @param {number} n */
function pay(player, n) {
  if (n <= 0) return true;
  if (crownsOf(player) < n) return false;
  try {
    crownsObjective()?.addScore(player, -n);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Telling other packs: realm:calling
// ---------------------------------------------------------------------------

/** What each player was last sent. @type {Map<string, string>} */
const sent = new Map();

/** The numbers other packs read (`bonus`): Waystones, Treasure Maps, Kitchen, Fishing 2.0, Easy Building, Storm Chasing. @param {Player} player */
function bonusOf(player) {
  /** @type {Record<string, number>} */
  const out = {};
  const calling = callingOf(player);
  if (!calling) return out;
  const st = stateOf(player);
  for (const t of calling.talents) {
    const r = st.t[t.id] ?? 0;
    if (t.kind === "ext" && t.key && r > 0) out[t.key] = Math.max(out[t.key] ?? 0, valueOf(t, r));
  }
  return out;
}

/** Sends `realm:calling` when it changed (or always with `force`). @param {Player} player @param {boolean} [force] */
export function sendCalling(player, force = false) {
  if (!player.isValid) return;
  const st = stateOf(player);
  const calling = callingOf(player);
  /** @type {Record<string, number>} */
  const talents = {};
  if (calling) for (const [id, r] of Object.entries(st.t)) if (r > 0) talents[id] = r;
  const msg = { player: player.id, name: player.name, calling: calling?.id ?? "", label: calling?.name ?? "", talents, bonus: bonusOf(player), ready: on() && isReady(player), from: "skills_bp" };
  const json = JSON.stringify(msg);
  if (!force && sent.get(player.id) === json) return;
  sent.set(player.id, json);
  system.sendScriptEvent("realm:calling", json);
}

// ---------------------------------------------------------------------------
// Effects: the higher one wins, nothing stacks
// ---------------------------------------------------------------------------

/**
 * Adds an effect unless the entity already has it stronger, or as strong and longer (a guild perk, a potion).
 * @param {Entity} e @param {string} type @param {number} ticks @param {number} amp @param {boolean} [particles]
 */
export function boost(e, type, ticks, amp, particles = false) {
  try {
    const cur = e.getEffect(type);
    if (cur && (cur.amplifier > amp || (cur.amplifier === amp && cur.duration >= ticks))) return false;
    e.addEffect(type, Math.max(1, Math.round(ticks)), { amplifier: amp, showParticles: particles });
    return true;
  } catch {
    return false;
  }
}

// Held talents (Tunnel Rat, Fleet, Deep Lungs...): checked every second, kept while their condition holds.
/** Effects this module keeps on each player: type -> amplifier. @type {Map<string, Map<string, number>>} */
const kept = new Map();

/** @param {Player} player @param {string} cond */
function holds(player, cond) {
  switch (cond) {
    case "under":
      return underground(player);
    case "water":
      return player.isInWater;
    case "sprint":
      return player.isSprinting;
    case "rain":
      return inRain(player);
    case "thunder":
      return inThunder(player);
  }
  return false;
}

/** @param {Player} player */
function holdTick(player) {
  /** @type {Map<string, number>} */
  const want = new Map();
  for (const [t, r] of talentsOf(player)) {
    if (t.kind !== "hold" || !t.cond || !holds(player, t.cond)) continue;
    const amp = t.amp ? Math.max(0, valueOf(t, r) - 1) : 0;
    for (const type of t.effects ?? []) want.set(type, Math.max(want.get(type) ?? 0, amp));
  }
  let mine = kept.get(player.id);
  for (const [type, amp] of want) {
    const timing = type === "night_vision" ? NIGHT_VISION : HOLD;
    const cur = player.getEffect(type);
    if (!cur || cur.amplifier < amp || (cur.amplifier === amp && cur.duration < timing.refreshBelow)) {
      if (boost(player, type, timing.duration, amp)) {
        if (!mine) kept.set(player.id, (mine = new Map()));
        mine.set(type, amp);
      }
    }
  }
  if (!mine) return;
  for (const [type, amp] of [...mine]) {
    if (want.has(type)) continue;
    mine.delete(type);
    const cur = player.getEffect(type);
    const timing = type === "night_vision" ? NIGHT_VISION : HOLD;
    // Only ours: the same level and no longer than we give. A potion's or a guild perk's longer effect stays.
    if (cur && cur.amplifier === amp && cur.duration <= timing.duration) player.removeEffect(type);
  }
}

// ---------------------------------------------------------------------------
// Ore glow (Echo Sense, Ore Hound): per-player particles
// ---------------------------------------------------------------------------

/** @type {Map<string, { dim: string, spots: Vector3[], until: number }>} */
const glows = new Map();
/** Ore Hound: tick of each player's last reading. @type {Map<string, number>} */
const houndAt = new Map();

/** Ore block ids from config.js (blocks with a `drop`, and ancient debris). */
const ORE_IDS = CONFIG.mining.blocks.filter((b) => b.drop || b.blocks.includes("minecraft:ancient_debris")).flatMap((b) => b.blocks);

/** Ore spots of these types within `r` blocks, nearest first. @param {Player} player @param {Vector3} at @param {number} r @param {string[]} types */
function oresNear(player, at, r, types) {
  const c = { x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z) };
  const minY = Math.max(c.y - r, player.dimension.heightRange.min);
  const maxY = Math.min(c.y + r, player.dimension.heightRange.max - 1);
  if (minY > maxY) return [];
  /** @type {Vector3[]} */
  const spots = [];
  try {
    const list = player.dimension.getBlocks(new BlockVolume({ x: c.x - r, y: minY, z: c.z - r }, { x: c.x + r, y: maxY, z: c.z + r }), { includeTypes: types }, false);
    for (const l of list.getBlockLocationIterator()) {
      spots.push({ x: l.x + 0.5, y: l.y + 0.5, z: l.z + 0.5 });
      if (spots.length >= 400) break;
    }
  } catch {
    return []; // partly unloaded
  }
  const d = (/** @type {Vector3} */ s) => (s.x - at.x) ** 2 + (s.y - at.y) ** 2 + (s.z - at.z) ** 2;
  return spots.sort((a, b) => d(a) - d(b)).slice(0, GLOW_MAX);
}

/** @param {Player} player @param {Vector3[]} spots @param {number} ticks */
function glow(player, spots, ticks) {
  if (!spots.length) return;
  glows.set(player.id, { dim: player.dimension.id, spots, until: system.currentTick + ticks });
}

system.runInterval(() => {
  if (!glows.size) return;
  const now = system.currentTick;
  for (const [id, g] of glows) {
    const p = playerById(id);
    if (!p || now > g.until || p.dimension.id !== g.dim) {
      glows.delete(id);
      continue;
    }
    for (const s of g.spots) {
      try {
        p.spawnParticle(GLOW_PARTICLE, s);
      } catch {
        // unloaded
      }
    }
  }
}, 10);

// ---------------------------------------------------------------------------
// Hooks from main.js: XP, perk chances, logs, ores, kills
// ---------------------------------------------------------------------------

/** Percent more XP in a skill from talents. @param {Player} player @param {Skill} skill */
export const xpPct = (player, skill) => sum(player, "xp", (t) => t.skill === skill);

/** Extra chance (0-1) for a skill perk (doubleOre, extraLog, apple, extraCrop, seeds, secondCatch). @param {Player} player @param {string} perk */
export const chanceFor = (player, perk) => sum(player, "chance", (t) => !!t.perks?.includes(perk)) / 100;

/** A log gave Woodcutting XP: Sapling Return. @param {Player} player @param {import("@minecraft/server").Dimension} dim @param {Vector3} at @param {string} log @param {(d: any, at: Vector3, item: string) => void} drop */
export function onLog(player, dim, at, log, drop) {
  const chance = sum(player, "sapling") / 100;
  const sapling = LOGS_TO_SAPLINGS[log];
  if (sapling && chance > 0 && Math.random() < chance) drop(dim, at, sapling);
}

/** An ore gave Mining XP: Ore Hound shows the same ore nearby (at most every 3 seconds). @param {Player} player @param {Vector3} at @param {string} ore */
export function onOre(player, at, ore) {
  const r = Math.min(10, sum(player, "orehound"));
  if (r <= 0 || system.currentTick - (houndAt.get(player.id) ?? -1000) < 60) return;
  houndAt.set(player.id, system.currentTick);
  const base = ore.replace("deepslate_", "").replace("lit_", "");
  const types = ORE_IDS.filter((id) => id.replace("deepslate_", "").replace("lit_", "") === base);
  glow(player, oresNear(player, at, r, types.length ? types : [ore]), 80);
}

/** The player killed a mob that gave Combat XP: Battle Rhythm. @param {Player} player */
export function onKill(player) {
  for (const [t, r] of talentsOf(player)) {
    if (t.kind !== "kill" || !t.effect || Math.random() >= valueOf(t, r) / 100) continue;
    boost(player, t.effect, (t.seconds ?? 5) * 20, 0);
  }
}

/** A level went up (by `gained` levels): tell the player once when they can choose a Calling. @param {Player} player @param {number} gained */
export function onLevelUp(player, gained) {
  if (!on() || stateOf(player).c) {
    sendCalling(player);
    return;
  }
  const total = totalLevel(player);
  const need = get("callings.unlockTotal");
  if (total >= need && total - gained < need) {
    player.sendMessage(`§6Your skills reach a total level of ${need}: you can choose a Calling. §7Brother Hollis at the chapel knows the old ways (or see /realm:skills_calling).`);
    player.playSound("random.levelup", { pitch: 0.8, volume: 0.8 });
  }
  sendCalling(player);
}

// ---------------------------------------------------------------------------
// Damage: talents that guard and talents that hit harder
// ---------------------------------------------------------------------------

/** Mobs being hit by this module's own applyDamage (a finishing bonus): their next entityHurt is ours, not a new hit. @type {Set<string>} */
const ownHits = new Set();
/** Second Wind: Date.now() when it's ready again. @type {Map<string, number>} */
const windReady = new Map();
/** Static: Date.now() until which the player's hits slow foes. @type {Map<string, number>} */
const staticUntil = new Map();

/** @param {Player} player @param {Talent} t @param {EntityDamageCause} cause @param {Entity | undefined} attacker */
function guards(player, t, cause, attacker) {
  switch (t.from) {
    case "any":
      return true;
    case "fall":
      return cause === EntityDamageCause.fall;
    case "fire":
      return FIRE.has(cause);
    case "projectile":
      return PROJECTILE.has(cause);
    case "explosion":
      return EXPLOSION.has(cause);
    case "lightning":
      return cause === EntityDamageCause.lightning;
    case "monster":
      try {
        return !!attacker?.isValid && !(attacker instanceof Player) && attacker.matches({ families: ["monster"] });
      } catch {
        return false;
      }
    case "under":
      return underground(player);
    case "rain":
      return inRain(player);
  }
  return false;
}

/** @param {Player} attacker @param {Talent} t @param {Entity} target */
function hitsHarder(attacker, t, target) {
  switch (t.vs) {
    case "champion":
      return target.hasTag(CHAMPION_TAG);
    case "monster":
      return target.matches({ families: ["monster"] });
    case "under":
      return underground(attacker);
    case "rain":
      return inRain(attacker);
  }
  return false;
}

world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource, damage }) => {
  try {
    if (!on() || !hurtEntity.isValid) return;
    if (ownHits.delete(hurtEntity.id)) return; // our own finishing bonus: never a new hit (no recursion)
    const cause = damageSource.cause;
    const attacker = damageSource.damagingEntity;
    if (hurtEntity instanceof Player) {
      const talents = talentsOf(hurtEntity);
      if (!talents.length) return;
      const health = hurtEntity.getComponent("minecraft:health");
      if (!health || health.currentValue <= 0) return;
      let pct = 0;
      for (const [t, r] of talents) if (t.kind === "guard" && guards(hurtEntity, t, cause, attacker)) pct += valueOf(t, r);
      // The stable API can't cancel damage: give back the guarded part right after the hit.
      if (pct > 0 && damage > 0) health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + (damage * Math.min(MAX_GUARD, pct)) / 100));
      const wind = talents.find(([t]) => t.kind === "lowhp");
      if (wind && health.currentValue <= health.effectiveMax * LOW_HP && Date.now() >= (windReady.get(hurtEntity.id) ?? 0)) {
        const [t, r] = wind;
        windReady.set(hurtEntity.id, Date.now() + (t.cooldown ?? 120) * 1000);
        boost(hurtEntity, "regeneration", valueOf(t, r) * 20, 1, true);
        hurtEntity.sendMessage(`§a${t.name}! §7Regeneration II for ${valueOf(t, r)}s.`);
      }
      return;
    }
    if (!(attacker instanceof Player) || (cause !== EntityDamageCause.entityAttack && cause !== EntityDamageCause.projectile)) return;
    const talents = talentsOf(attacker);
    if (!talents.length && !staticUntil.has(attacker.id)) return;
    // Static: hits in the rain slow foes.
    if ((staticUntil.get(attacker.id) ?? 0) > Date.now() && inRain(attacker)) boost(hurtEntity, "slowness", 60, 1, true);
    let pct = 0;
    for (const [t, r] of talents) if (t.kind === "dmg" && hitsHarder(attacker, t, hurtEntity)) pct += valueOf(t, r);
    if (pct <= 0 || damage <= 0) return;
    const extra = (damage * pct) / 100;
    const health = hurtEntity.getComponent("minecraft:health");
    if (!health || health.currentValue <= 0) return;
    if (health.currentValue - extra >= 1) {
      // Straight off the health: no new hit, so no recursion and no invulnerability frames in the way.
      health.setCurrentValue(health.currentValue - extra);
    } else {
      // The bonus finishes it: a real hit, so the kill counts for the player, once the hit's invulnerability is over
      // (a weaker hit inside it does nothing). Down to 1 health now; the rest is ours, marked so it isn't a new hit.
      const rest = extra - (health.currentValue - 1);
      health.setCurrentValue(1);
      system.runTimeout(() => {
        try {
          if (!hurtEntity.isValid || !attacker.isValid) return;
          const h = hurtEntity.getComponent("minecraft:health");
          if (!h || h.currentValue <= 0) return;
          ownHits.add(hurtEntity.id);
          system.runTimeout(() => ownHits.delete(hurtEntity.id), 2);
          hurtEntity.applyDamage(Math.max(1, rest), { cause: EntityDamageCause.entityAttack, damagingEntity: attacker });
        } catch {
          // gone
        }
      }, 11);
    }
  } catch (e) {
    console.warn(`[skills] calling hit: ${e}`);
  }
});

// ---------------------------------------------------------------------------
// The Calling Sigil and its active ability
// ---------------------------------------------------------------------------

/** @param {ItemStack | undefined} stack */
const isSigil = (stack) => {
  if (!stack || stack.typeId !== SIGIL_ITEM) return false;
  try {
    return stack.getDynamicProperty(SIGIL_PROP) === 1;
  } catch {
    return false;
  }
};

/** The Sigil's last lore line: where it works. */
const SIGIL_WHERE = "§7Hold it in your hand and use it";

/** @param {Calling | undefined} calling */
function sigilLore(calling) {
  if (!calling) return ["§7A Calling Sigil, waiting for a Calling.", SIGIL_WHERE];
  return [`§e${calling.name}: ${calling.active.name}`, `§7${activeText(calling)}`.slice(0, 60), "§8Menu: /realm:skills_calling", SIGIL_WHERE];
}

function makeSigil(/** @type {Calling | undefined} */ calling) {
  const stack = new ItemStack(SIGIL_ITEM, 1);
  stack.nameTag = SIGIL_NAME;
  stack.setLore(sigilLore(calling));
  stack.setDynamicProperty(SIGIL_PROP, 1);
  stack.keepOnDeath = true;
  return stack;
}

/** Does the player carry a Sigil (inventory, off hand)? @param {Player} player */
function hasSigil(player) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (inv) for (let i = 0; i < inv.size; i++) if (isSigil(inv.getItem(i))) return true;
  try {
    return isSigil(player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Offhand));
  } catch {
    return false;
  }
}

/** @param {Player} player */
function giveSigil(player) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  const rest = inv ? inv.addItem(makeSigil(callingOf(player))) : makeSigil(callingOf(player));
  if (rest) player.dimension.spawnItem(rest, player.location);
}

/** The active's text with its numbers. @param {Calling} calling @param {Player} [player] */
function activeText(calling, player) {
  const a = calling.active;
  const secs = Math.round(a.seconds * (1 + (player ? sum(player, "dur") : 0) / 100));
  return a.text.split("{seconds}").join(String(secs)).split("{radius}").join(String(a.radius ?? 8));
}

/** Seconds the player's Sigil cooldown is after talents. @param {Player} player @param {Calling} calling */
const cooldownOf = (player, calling) => Math.max(1, Math.round(calling.active.cooldown * (1 - Math.min(MAX_CD, sum(player, "cd")) / 100)));

/** Party mates near the player, and the player. @param {Player} player */
function party(player) {
  const tag = player.getTags().find((t) => t.startsWith(PARTY_TAG));
  if (!tag) return [player];
  const range = Math.max(1, C().partyRange);
  return player.dimension.getPlayers({ location: player.location, maxDistance: range }).filter((p) => p.id === player.id || p.hasTag(tag));
}

/** Tick of each player's last Sigil use, so one tap does one thing. @type {Map<string, number>} */
const lastUse = new Map();

/** @param {Player} player @param {string} text */
function bar(player, text) {
  system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: player.id, ticks: 40, from: "skills_bp" }));
  player.onScreenDisplay.setActionBar(text);
}

/** Uses the Sigil. @param {Player} player @param {ItemStack | undefined} stack the Sigil used, its lore brought up to date @param {number} [slot] */
function useSigil(player, stack, slot) {
  const now = system.currentTick;
  if (now - (lastUse.get(player.id) ?? -100) < 4) return;
  lastUse.set(player.id, now);
  const calling = callingOf(player);
  if (!calling) {
    bar(player, on() ? "§7The Sigil is quiet: you have no Calling. /realm:skills_calling" : "§7Callings are paused on this realm.");
    return;
  }
  // An old Sigil from another Calling: its lore follows the player's Calling.
  if (stack && slot !== undefined) {
    try {
      const want = sigilLore(calling);
      const inv = player.getComponent("minecraft:inventory")?.container;
      // Only over a Sigil: the slot may hold something else by now.
      if (stack.getLore().join("\n") !== want.join("\n") && isSigil(inv?.getItem(slot))) {
        stack.setLore(want);
        inv?.setItem(slot, stack);
      }
    } catch {
      // moved
    }
  }
  if (!api.active(player)) {
    bar(player, "§7The Sigil doesn't answer in this game mode.");
    return;
  }
  const st = stateOf(player);
  const wait = Math.ceil((st.cd - Date.now()) / 1000);
  if (wait > 0) {
    bar(player, `§7${calling.active.name}: ready in ${wait}s`);
    return;
  }
  const a = calling.active;
  const secs = a.seconds * (1 + sum(player, "dur") / 100);
  const ticks = Math.round(secs * 20);
  /** @type {string} */
  let said;
  switch (a.kind) {
    case "echo": {
      const spots = oresNear(player, player.location, Math.max(1, Math.min(12, a.radius ?? 8)), ORE_IDS);
      glow(player, spots, ticks);
      said = spots.length ? `${spots.length} ore${spots.length === 1 ? "" : "s"} glow around you` : "no ore within reach";
      break;
    }
    case "rally":
    case "song": {
      const effect = a.kind === "rally" ? "strength" : "regeneration";
      const mates = party(player);
      for (const p of mates) {
        boost(p, effect, ticks, 0, true);
        if (p.id !== player.id) p.sendMessage(`§a${player.name}'s ${a.name}: ${a.kind === "rally" ? "Strength" : "Regeneration"} I for ${Math.round(secs)}s.`);
      }
      said = mates.length > 1 ? `you and ${mates.length - 1} party mate${mates.length === 2 ? "" : "s"}` : "you";
      break;
    }
    case "trail":
      boost(player, "speed", ticks, 1, true);
      said = `Speed II for ${Math.round(secs)}s`;
      break;
    case "timber":
      boost(player, "haste", ticks, 1, true);
      said = `Haste II for ${Math.round(secs)}s`;
      break;
    case "static":
      if (!inRain(player)) {
        bar(player, `§7${a.name}: it needs rain over your head.`);
        return; // no cooldown spent
      }
      staticUntil.set(player.id, Date.now() + secs * 1000);
      said = `your hits in the rain slow foes for ${Math.round(secs)}s`;
      break;
    default:
      return;
  }
  const cd = cooldownOf(player, calling);
  st.cd = Date.now() + cd * 1000;
  save(player, st);
  bar(player, `§6${a.name}: §f${said}. §7Ready again in ${cd}s`);
  player.playSound("beacon.power", { pitch: 1.4, volume: 0.6 });
}

world.beforeEvents.itemUse.subscribe((ev) => {
  if (ev.cancel) return; // another pack already stopped it
  try {
    if (!isSigil(ev.itemStack)) return;
    ev.cancel = true;
    const player = ev.source;
    const slot = player.selectedSlotIndex;
    const stack = ev.itemStack;
    system.run(() => player.isValid && useSigil(player, stack, slot));
  } catch {
    // not ours
  }
});

world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  if (ev.cancel) return; // another pack already stopped it
  try {
    if (!isSigil(ev.itemStack)) return;
    ev.cancel = true; // never into a jukebox, never placed against anything
    if (!ev.isFirstEvent) return;
    const player = ev.player;
    const slot = player.selectedSlotIndex;
    const stack = ev.itemStack;
    system.run(() => player.isValid && useSigil(player, stack, slot));
  } catch {
    // not ours
  }
});

// ---------------------------------------------------------------------------
// Choosing, spending, resetting, switching
// ---------------------------------------------------------------------------

/** Is the Townsfolk pack here (it answered a realm:help_ping)? Without it Callings are chosen from the menu anywhere. */
let townsfolk = false;
/** Players whose Brother Hollis is lost to the story (Story Questlines' `g:hollis`): Moss stands in. @type {Set<string>} */
const hollisLost = new Set();

/** Can the player choose or switch here? @param {boolean} atShrine opened from Hollis or Moss */
const canChooseHere = (atShrine) => atShrine || get("callings.chooseAnywhere") === true || !townsfolk;

/** The Crowns the next switch costs. @param {State} st */
function switchCost(st) {
  const costs = C().switchCosts;
  if (!costs.length) return 0;
  return Math.max(0, Math.floor(costs[Math.min(st.n, costs.length - 1)] ?? 0));
}

/** Days until the player may choose again (0 = now). @param {State} st */
function daysLeft(st) {
  const gap = Math.max(0, Math.floor(get("callings.switchDays")));
  const since = daysSince(st);
  return since === Infinity ? 0 : Math.max(0, gap - since);
}

/** Who to see about a Calling. @param {Player} player */
const whoToSee = (player) => (hollisLost.has(player.id) ? "Moss at the graveyard" : "Brother Hollis at the chapel");

// Town news: at most one piece per in-game hour from this pack, each calling once. Dropped, not queued.
// The seen list is process memory (cleared on script restart). The quest completion stays outside this gate.
const NEWS_GAP = 1000; // ticks, an in-game hour
let newsAt = -NEWS_GAP;
/** @type {Set<string>} */
const newsSeen = new Set();

/** @param {string} key @param {object} msg @returns {boolean} */
function gossip(key, msg) {
  const now = system.currentTick;
  if (newsSeen.has(key) || now - newsAt < NEWS_GAP) return false;
  newsAt = now;
  newsSeen.add(key);
  if (newsSeen.size > 64) newsSeen.delete(/** @type {string} */ (newsSeen.values().next().value));
  system.sendScriptEvent("realm:gossip", JSON.stringify(msg));
  return true;
}

/** @param {Player} player @param {Calling} calling @returns {string | undefined} why not */
function choose(player, calling) {
  if (!on()) return "Callings are paused on this realm.";
  if (!isReady(player)) return `You need a total skill level of ${get("callings.unlockTotal")} (you have ${totalLevel(player)}).`;
  const st = stateOf(player);
  if (st.c === calling.id) return `You are already a ${calling.name}.`;
  const first = !st.c;
  const left = daysLeft(st);
  if (!first && left > 0) return `You chose a Calling lately: wait ${left} more Realm day${left === 1 ? "" : "s"}.`;
  const cost = first ? 0 : switchCost(st);
  if (!pay(player, cost)) return `Switching costs ${cost} Crowns. You have ${crownsOf(player)}.`;
  const old = byId.get(st.c);
  st.c = calling.id;
  st.t = {};
  if (!first) st.n++;
  st.d = realmDay;
  st.w = world.getDay();
  st.cd = 0;
  save(player, st);
  if (!hasSigil(player)) giveSigil(player);
  player.sendMessage(
    first
      ? `§6You are a ${calling.name} now. §fYour Calling Sigil holds ${calling.active.name}: ${activeText(calling)}. §7Spend your ${pointsFor(player, calling)} talent point${pointsFor(player, calling) === 1 ? "" : "s"} in /realm:skills_calling.`
      : `§6You leave the ${old?.name ?? "old"} way and become a ${calling.name}${cost ? ` (${cost} Crowns)` : ""}. §7Your talent points are free to spend again.`,
  );
  player.playSound("random.levelup", { pitch: 0.7, volume: 0.9 });
  sendCalling(player);
  system.sendScriptEvent("realm:quest_done", JSON.stringify({ player: player.id, pack: "skills_bp", id: `skills:calling:${calling.id}`, label: `Became a ${calling.name}`, kind: "calling", guild: calling.guild }));
  gossip(`calling:${player.id}:${calling.id}`, { kind: "calling", player: player.id, name: player.name, place: calling.name });
  return undefined;
}

/** Why a talent can't take a point now, or undefined. @param {Player} player @param {Calling} calling @param {Talent} t */
function cantSpend(player, calling, t) {
  const st = stateOf(player);
  const rank = st.t[t.id] ?? 0;
  if (rank >= t.v.length) return "maxed";
  if (spent(st) >= pointsFor(player, calling)) return "no points left";
  if (t.tier === 2 && spent(st, 1) < C().tier2Points) return `needs ${C().tier2Points} points in tier 1`;
  if (t.tier === 3) {
    if (spent(st, 2) < C().tier3Points) return `needs ${C().tier3Points} points in tiers 1 and 2`;
    if (calling.talents.some((o) => o.tier === 3 && o.id !== t.id && (st.t[o.id] ?? 0) > 0)) return "one capstone only";
  }
  return undefined;
}

/** A talent's text for a rank. @param {Talent} t @param {number} rank */
function talentText(t, rank) {
  const v = valueOf(t, Math.max(1, rank));
  return t.text.split("{v}").join(String(v)).split("{lvl}").join(ROMAN[Math.max(0, v - 1)] ?? String(v));
}

// ---------------------------------------------------------------------------
// The menu: /realm:skills_calling, the Skills menu and Hollis / Moss
// ---------------------------------------------------------------------------

/** Shows a form, retrying while the player has another screen open. @template {{ show(p: Player): Promise<any> }} F @param {Player} player @param {F} form @returns {Promise<Awaited<ReturnType<F["show"]>> | undefined>} */
async function show(player, form) {
  for (let i = 0; i < 20; i++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await new Promise((r) => system.runTimeout(() => r(undefined), 20));
  }
  return undefined;
}

/** @param {Player} player @param {string} title @param {string} body @param {string} yes */
async function confirm(player, title, body, yes) {
  const res = await show(player, new MessageFormData().title(title).body(body).button1(yes).button2("Cancel"));
  return !!res && !res.canceled && res.selection === 0;
}

/** One Calling's page (before choosing, or to switch). @param {Player} player @param {Calling} calling @param {boolean} atShrine */
async function showOffer(player, calling, atShrine) {
  const st = stateOf(player);
  const lines = [
    `§l${calling.name}§r: ${calling.blurb}`,
    `§7Skills: ${calling.skills.map((s) => api.names[/** @type {Skill} */ (s)]).join(" + ")} (talent points). Guild: ${GUILD_NAMES[calling.guild] ?? calling.guild}.`,
    `§eCalling Sigil: ${calling.active.name}§r. ${activeText(calling)}. Cooldown ${calling.active.cooldown}s.`,
    "",
    "§eTalents§r (tier 1 and 2: two ranks; tier 3: one capstone of three):",
  ];
  for (const tier of [1, 2, 3]) {
    lines.push(`§6Tier ${tier}`);
    for (const t of calling.talents.filter((x) => x.tier === tier)) lines.push(`§f${t.name}§7: ${t.v.map((_, i) => talentText(t, i + 1)).join(" / ")}`);
  }
  const first = !st.c;
  const cost = first ? 0 : switchCost(st);
  const left = first ? 0 : daysLeft(st);
  const can = canChooseHere(atShrine) && st.c !== calling.id && isReady(player) && on();
  const form = new ActionFormData().title(`§l${calling.name}`).body(lines.join("\n"));
  if (can) form.button(first ? `Become a ${calling.name}\n§8Your first Calling is free` : left > 0 ? `Switch in ${left} Realm day${left === 1 ? "" : "s"}\n§8You chose lately` : `Switch to ${calling.name}\n§8${cost} Crowns; talents start over`);
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || !player.isValid) return;
  if (can && res.selection === 0) {
    if (!first && left > 0) return showMenu(player, atShrine);
    const sure = first || (await confirm(player, "§lSwitch Calling", `Leave your ${byId.get(st.c)?.name ?? ""} Calling and become a ${calling.name}?\n\nIt costs ${cost} Crowns (you have ${crownsOf(player)}). Your talent points start over, and you can choose again in ${get("callings.switchDays")} Realm days.`, "Switch"));
    if (!sure || !player.isValid) return;
    const why = choose(player, calling);
    if (why) player.sendMessage(`§c${why}`);
    return showMenu(player, atShrine);
  }
  return showMenu(player, atShrine);
}

/** The talent tree. @param {Player} player @param {boolean} atShrine */
async function showTalents(player, atShrine) {
  const calling = callingOf(player);
  if (!calling) return showMenu(player, atShrine);
  const st = stateOf(player);
  const points = pointsFor(player, calling);
  const used = spent(st);
  const body = [
    `Points: §e${used} of ${points}§r spent. ${points < C().maxPoints ? `§7One more for every ${C().pointsEvery} combined levels of ${calling.skills.map((s) => api.names[/** @type {Skill} */ (s)]).join(" and ")} above ${C().pointsFrom} (up to ${C().maxPoints}).` : ""}`,
    `§7Tier 2 needs ${C().tier2Points} points in tier 1; the tier 3 capstone (one of three) needs ${C().tier3Points}. Tap a talent to spend a point.`,
  ].join("\n");
  const form = new ActionFormData().title(`§l${calling.name} talents`).body(body);
  const list = [...calling.talents].sort((a, b) => a.tier - b.tier);
  for (const t of list) {
    const rank = st.t[t.id] ?? 0;
    const why = cantSpend(player, calling, t);
    const color = rank > 0 ? "§2" : why ? "§8" : "";
    form.button(`${color}T${t.tier} ${t.name} ${rank}/${t.v.length}\n§8${talentText(t, Math.min(t.v.length, rank + (why ? 0 : 1)) || 1)}${why && why !== "maxed" ? ` (${why})` : ""}`);
  }
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  const t = list[res.selection];
  if (!t) return showMenu(player, atShrine);
  const why = cantSpend(player, calling, t);
  if (why) {
    player.sendMessage(`§7${t.name}: ${why === "maxed" ? "already at its top rank" : why}.`);
    return showTalents(player, atShrine);
  }
  const rank = st.t[t.id] ?? 0;
  const ok = await confirm(player, `§l${t.name}`, `Spend a talent point on ${t.name} (rank ${rank + 1} of ${t.v.length})?\n\n${talentText(t, rank + 1)}\n\n§7Taking points back later costs ${C().respecCost} Crowns.`, "Spend");
  if (ok && player.isValid && !cantSpend(player, calling, t) && stateOf(player).c === calling.id) {
    st.t[t.id] = rank + 1;
    save(player, st);
    sendCalling(player);
    player.playSound("random.orb", { pitch: 1.2 });
  }
  return showTalents(player, atShrine);
}

/** Takes back every talent point for `respecCost` Crowns. @param {Player} player @param {boolean} atShrine */
async function respec(player, atShrine) {
  const st = stateOf(player);
  const cost = Math.max(0, Math.floor(C().respecCost));
  if (!spent(st)) return showMenu(player, atShrine);
  const ok = await confirm(player, "§lReset talents", `Take back all ${spent(st)} talent points to spend them again? It costs ${cost} Crowns (you have ${crownsOf(player)}).`, "Reset");
  if (!ok || !player.isValid) return showMenu(player, atShrine);
  if (!pay(player, cost)) player.sendMessage(`§cResetting talents costs ${cost} Crowns. You have ${crownsOf(player)}.`);
  else {
    st.t = {};
    save(player, st);
    sendCalling(player);
    player.sendMessage(`§aYour talent points are free to spend again${cost ? ` (${cost} Crowns)` : ""}.`);
  }
  return showMenu(player, atShrine);
}

/**
 * The Calling menu. @param {Player} player @param {boolean} [atShrine] opened at Brother Hollis or Moss: choosing
 * and switching work there (or anywhere with `chooseAnywhere`, or without the Townsfolk pack)
 */
export async function showMenu(player, atShrine = false) {
  if (!player.isValid) return;
  const st = stateOf(player);
  const calling = byId.get(st.c);
  const total = totalLevel(player);
  const need = get("callings.unlockTotal");
  /** @type {string[]} */
  const body = [];
  /** @type {{ label: string, run: () => Promise<unknown> | unknown }[]} */
  const actions = [];
  if (!on()) body.push("§cCallings are paused on this realm.");
  if (!calling) {
    if (total < need) {
      body.push(`A Calling is a path for a seasoned adventurer: an ability on a Calling Sigil and a tree of talents.`, `§eReach a total skill level of ${need}§r (all six skills added up). You have §e${total}§r.`);
    } else {
      body.push(`Your skills add up to ${total}: choose your Calling. Each gives the Calling Sigil (an active ability) and talent points for its tree. Your first choice is free.`);
      if (!canChooseHere(atShrine)) body.push(`§7Choose it with ${whoToSee(player)}: tap them and pick Choose a Calling. You can look at each one here.`);
    }
    for (const c of CONFIG.callings.list) actions.push({ label: `${c.name}\n§8${c.skills.map((s) => api.names[/** @type {Skill} */ (s)]).join(" + ")}: ${c.active.name}`, run: () => showOffer(player, c, atShrine) });
  } else {
    const points = pointsFor(player, calling);
    const wait = Math.ceil((st.cd - Date.now()) / 1000);
    body.push(
      `You are a §6${calling.name}§r. ${calling.blurb}`,
      `§eCalling Sigil: ${calling.active.name}§r. ${activeText(calling, player)}. Cooldown ${cooldownOf(player, calling)}s${wait > 0 ? ` (ready in ${wait}s)` : " (ready)"}.`,
      `Talent points: §e${spent(st)} of ${points}§r spent.`,
    );
    const mine = calling.talents.filter((t) => (st.t[t.id] ?? 0) > 0);
    if (mine.length) body.push(mine.map((t) => `§a${t.name} ${st.t[t.id]}/${t.v.length}§7: ${talentText(t, st.t[t.id])}`).join("\n"));
    if (!api.active(player)) body.push("§7Talents and the Sigil don't work in creative or spectator mode.");
    actions.push({ label: `Talents\n§8${points - spent(st) > 0 ? `${points - spent(st)} point${points - spent(st) === 1 ? "" : "s"} to spend` : "Your tree"}`, run: () => showTalents(player, atShrine) });
    if (!hasSigil(player)) actions.push({ label: "Get a Calling Sigil\n§8You don't carry one", run: () => (giveSigil(player), showMenu(player, atShrine)) });
    if (spent(st) > 0) actions.push({ label: `Reset talents\n§8${C().respecCost} Crowns`, run: () => respec(player, atShrine) });
    const left = daysLeft(st);
    if (canChooseHere(atShrine)) {
      for (const c of CONFIG.callings.list) {
        if (c.id === calling.id) continue;
        actions.push({ label: `Switch to ${c.name}\n§8${left > 0 ? `in ${left} Realm day${left === 1 ? "" : "s"}` : `${switchCost(st)} Crowns`}`, run: () => showOffer(player, c, atShrine) });
      }
    } else body.push(`§7To switch Callings (${switchCost(st)} Crowns, at least ${get("callings.switchDays")} Realm days apart), see ${whoToSee(player)}.`);
  }
  const form = new ActionFormData().title("§lCalling").body(body.join("\n\n"));
  for (const a of actions) form.button(a.label);
  form.button("Close");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  await actions[res.selection]?.run();
}

/** Short status for the Skills menu. @param {Player} player */
export function menuLabel(player) {
  const calling = byId.get(stateOf(player).c);
  if (calling) return `Calling: ${calling.name}\n§8${calling.active.name}, talents`;
  const need = get("callings.unlockTotal");
  return totalLevel(player) >= need ? "Calling\n§8Ready to choose" : `Calling\n§8Total level ${need} unlocks it`;
}

// ---------------------------------------------------------------------------
// Script events and players coming and going
// ---------------------------------------------------------------------------

onScriptEvent(
  [
    "realm:help_pong",
    "realm:calendar",
    "realm:calling_ping",
    "realm:npc_flags",
    "realm:npc_talk",
    "realm:npc_choose",
  ],
  ({ id, message }) => {
    if (id === "realm:help_pong") {
      if (message === "npc_bp") townsfolk = true;
      return;
    }
    if (id !== "realm:calendar" && id !== "realm:calling_ping" && id !== "realm:npc_flags" && id !== "realm:npc_talk" && id !== "realm:npc_choose") return;
    try {
      if (id === "realm:calling_ping") {
        // Several packs ask at load: one answer per second is enough.
        if (system.currentTick - lastPing < 20) return;
        lastPing = system.currentTick;
        for (const p of world.getAllPlayers()) sendCalling(p, true);
        return;
      }
      const msg = JSON.parse(message);
      if (!msg || typeof msg !== "object") return;
      if (id === "realm:calendar") {
        if (typeof msg.day === "number" && Number.isFinite(msg.day)) realmDay = Math.floor(msg.day);
        return;
      }
      if (typeof msg.player !== "string") return;
      if (id === "realm:npc_flags") {
        if (msg.flags && typeof msg.flags === "object" && msg.flags["g:hollis"] === "lost") hollisLost.add(msg.player);
        else hollisLost.delete(msg.player);
        return;
      }
      const player = playerById(msg.player);
      if (!player) return;
      if (id === "realm:npc_talk") {
        townsfolk = true;
        if (!on() || typeof msg.req !== "string" || !Array.isArray(msg.roles)) return;
        const here = hollisLost.has(player.id) ? msg.roles.includes("gravedigger") : msg.roles.includes("priest");
        if (!here || (!stateOf(player).c && !isReady(player))) return;
        system.sendScriptEvent("realm:npc_offer", JSON.stringify({ req: msg.req, pack: "skills_bp", key: "calling", label: stateOf(player).c ? "Your Calling" : "Choose a Calling", order: 35 }));
        return;
      }
      if (msg.pack === "skills_bp" && msg.key === "calling") showMenu(player, true).catch((e) => console.warn(`[skills] ${e}`));
    } catch {
      // not ours
    }
  },
);

let lastPing = -100;
let ticks = 0;
system.runInterval(() => {
  ticks++;
  for (const player of world.getAllPlayers()) {
    try {
      if (!player.isValid) continue;
      if (on() && stateOf(player).c) holdTick(player);
      else if (kept.has(player.id)) holdTick(player); // releases what Callings kept, after a switch-off
      if (ticks % 30 === 0) sendCalling(player); // only when changed: a level that crossed a point, a setting
    } catch (e) {
      console.warn(`[skills] calling: ${e}`);
    }
  }
}, 20);

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  system.runTimeout(() => {
    try {
      if (player.isValid) sendCalling(player, true);
    } catch (e) {
      console.warn(`[skills] calling: ${e}`);
    }
  }, 60);
});

/** @param {string} playerId */
export function forget(playerId) {
  states.delete(playerId);
  sent.delete(playerId);
  kept.delete(playerId);
  glows.delete(playerId);
  houndAt.delete(playerId);
  windReady.delete(playerId);
  staticUntil.delete(playerId);
  lastUse.delete(playerId);
}
