import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  EntityInitializationCause,
  GameMode,
  ItemStack,
  Player,
  WeatherType,
  system,
  world,
} from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get, getFor } from "./settings.js";

/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {"stormcaller" | "frostbound" | "vampiric" | "splitting" | "shielded"} Trait */

// Champions are vanilla mobs with tags (the contract other packs read):
//   realm:champion, realm:champion_trait:<trait>, and an optional tag a pack asked for (realm:bounty:<id>).
// Their plain name (without color) is the entity property "elite:name"; Shielded counts hits in "elite:hits".
const CHAMP = "realm:champion";
const TRAIT_TAG = "realm:champion_trait:";
const SPLIT = "elite:split"; // copies a Splitting champion leaves: never champions themselves
const PROP_NAME = "elite:name";
const PROP_HITS = "elite:hits";
const PROP_KILLS = "elite:kills"; // player: champions this player has defeated
const PROP_WEATHER = "elite:weather"; // world: overworld weather from the last change; scripts can't read it
const PROP_MOON = "elite:moon"; // world: the last realm:moon state ("blood", "harvest" or "normal")
const FOREVER = 20000000; // the longest effect the API allows (ticks, about 11 days): champions keep their buffs
const DIMS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

/** @type {Trait[]} */
const TRAITS = ["stormcaller", "frostbound", "vampiric", "splitting", "shielded"];
/** @type {Record<Trait, string>} */
const TRAIT_NAMES = { stormcaller: "Stormcaller", frostbound: "Frostbound", vampiric: "Vampiric", splitting: "Splitting", shielded: "Shielded" };
/** Mobs that don't hit (they explode), so traits that work through hits make no sense on them. */
const NO_HIT = new Set(["minecraft:creeper"]);
/** Mobs whose copies are babies (a spawn event the zombie family has). */
const HAS_BABY = new Set(["minecraft:zombie", "minecraft:husk", "minecraft:drowned", "minecraft:zombie_villager_v2"]);
const mobSet = new Set(CONFIG.mobs);

let thunder = false;
let bloodMoon = false;
let loaded = 0; // champions loaded in all dimensions, recounted every 5 seconds
/** Natural champions lately, for `areaSpacing`. @type {{ dim: string, x: number, z: number, at: number }[]} */
let recent = [];
/** Players who hurt each champion, and when (ms). @type {Map<string, Map<string, number>>} */
const hitters = new Map();
/** Tick of each Stormcaller's next strike. @type {Map<string, number>} */
const nextStrike = new Map();
/** What we know of each loaded champion, for a death we can no longer read. @type {Map<string, { name: string, trait: Trait, mob: string, tag?: string, dim: string, at: Vector3 }>} */
const known = new Map();

const rand = (/** @type {number} */ a, /** @type {number} */ b) => a + Math.random() * (b - a);
const randInt = (/** @type {number} */ a, /** @type {number} */ b) => Math.floor(rand(a, b + 1));
/** @template T @param {T[]} list @returns {T} */
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/**
 * A mob for a champion made on request: any from `mobs` that suits the trait, but not drowned (they
 * belong in water, and a request is usually on land).
 * @param {Trait} [trait]
 */
function mobFor(trait) {
  const land = CONFIG.mobs.filter((m) => m !== "minecraft:drowned" && (!trait || traitsFor(m).includes(trait)));
  return land.length ? pick(land) : pick(CONFIG.mobs);
}

/** @param {string} id @returns {id is Trait} */
const isTrait = (id) => /** @type {string[]} */ (TRAITS).includes(id);

/** @param {string} mob @returns {Trait[]} */
const traitsFor = (mob) => TRAITS.filter((t) => !(NO_HIT.has(mob) && (t === "frostbound" || t === "vampiric")));

/** @param {Entity} e @returns {Trait | undefined} */
function traitOf(e) {
  for (const t of e.getTags()) if (t.startsWith(TRAIT_TAG)) {
    const id = t.slice(TRAIT_TAG.length);
    if (isTrait(id)) return id;
  }
  return undefined;
}

/** The plain name, e.g. "Gerald the Stormcaller". @param {Entity} e */
function nameOf(e) {
  const saved = e.getDynamicProperty(PROP_NAME);
  if (typeof saved === "string" && saved) return saved;
  return e.nameTag.replace(/§./g, "") || "A champion";
}

/** The extra tag another pack gave it (realm:bounty:<id>), if any. @param {Entity} e */
const extraTagOf = (e) => e.getTags().find((t) => t !== CHAMP && !t.startsWith(TRAIT_TAG) && t.startsWith("realm:"));

/** "N", "NE", ... from `from` towards `to` (north is -z). @param {Vector3} from @param {Vector3} to */
function direction(from, to) {
  const deg = (Math.atan2(to.x - from.x, -(to.z - from.z)) * 180) / Math.PI;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((deg + 360) % 360) / 45) % 8];
}

/** Can this player be a target (not in creative or spectator)? @param {Player} p */
function targetable(p) {
  try {
    const mode = p.getGameMode();
    return mode !== GameMode.Creative && mode !== GameMode.Spectator;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Weather and moon (scripts can't read either, so we remember the last change)
// ---------------------------------------------------------------------------

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather }) => {
  if (dimension !== "minecraft:overworld") return;
  thunder = newWeather === WeatherType.Thunder;
  try {
    world.setDynamicProperty(PROP_WEATHER, newWeather);
  } catch (e) {
    console.warn(`[elite] ${e}`);
  }
});

world.afterEvents.worldLoad.subscribe(() => {
  try {
    thunder = world.getDynamicProperty(PROP_WEATHER) === WeatherType.Thunder;
    bloodMoon = world.getDynamicProperty(PROP_MOON) === "blood";
  } catch (e) {
    console.warn(`[elite] ${e}`);
  }
  refresh();
});

// ---------------------------------------------------------------------------
// Making a champion
// ---------------------------------------------------------------------------

/**
 * Gives a champion its effects. `fresh` (just made): also fills its health up to the boosted
 * maximum. Effects last "forever" and are saved with the mob; after a load we only add missing ones.
 * @param {Entity} e @param {Trait} trait @param {boolean} fresh
 */
function applyEffects(e, trait, fresh) {
  const shieldUp = trait === "shielded" && Number(e.getDynamicProperty(PROP_HITS) ?? 0) < CONFIG.traits.shielded.hits;
  const res = shieldUp ? 3 : CONFIG.resistanceLevel - 1;
  const opts = (/** @type {number} */ amplifier) => ({ amplifier, showParticles: false });
  if (res >= 0) {
    const have = e.getEffect("resistance");
    if (!have || have.amplifier !== res) {
      if (have) e.removeEffect("resistance");
      e.addEffect("resistance", FOREVER, opts(res));
    }
  }
  if (CONFIG.fireResistance && !e.getEffect("fire_resistance")) e.addEffect("fire_resistance", FOREVER, opts(0));
  if (CONFIG.speedTraits.includes(trait) && !e.getEffect("speed")) e.addEffect("speed", FOREVER, opts(0));
  const boost = CONFIG.healthBoostLevel;
  if (boost > 0 && !e.getEffect("health_boost") && !e.getEffect("absorption")) {
    e.addEffect("health_boost", FOREVER, opts(boost - 1));
    if (!fresh) return;
    // Health Boost raises the maximum; fill up to it a tick later. A mob whose maximum didn't move
    // ignores the effect: Absorption (extra hearts on top) instead.
    system.runTimeout(() => {
      try {
        if (!e.isValid) return;
        const health = e.getComponent("minecraft:health");
        if (!health) return;
        if (health.effectiveMax > health.defaultValue) health.setCurrentValue(health.effectiveMax);
        else {
          e.removeEffect("health_boost");
          e.addEffect("absorption", FOREVER, opts(boost - 1));
        }
      } catch (err) {
        console.warn(`[elite] health: ${err}`);
      }
    }, 1);
  }
}

/** Tells players near `e` that a champion appeared. @param {Entity} e @param {string} name */
function announce(e, name) {
  const radius = get("announceRadius");
  if (radius <= 0) return;
  for (const p of e.dimension.getPlayers({ location: e.location, maxDistance: radius })) {
    if (getFor(p, "alerts") !== true) continue;
    p.sendMessage(`§cA champion stirs nearby: ${name}`);
  }
}

/**
 * Turns a mob into a champion.
 * @param {Entity} e @param {{ trait?: Trait, name?: string, tag?: string }} [opts]
 * @returns {string} its name
 */
function makeChampion(e, opts = {}) {
  const trait = opts.trait ?? pick(traitsFor(e.typeId));
  const name = opts.name || `${pick(CONFIG.names)} the ${TRAIT_NAMES[trait]}`;
  e.addTag(CHAMP);
  e.addTag(TRAIT_TAG + trait);
  if (opts.tag) e.addTag(opts.tag);
  e.setDynamicProperty(PROP_NAME, name);
  e.setDynamicProperty(PROP_HITS, 0);
  // A named mob doesn't despawn, so champions stay until someone deals with them.
  e.nameTag = `§c${name}`;
  applyEffects(e, trait, true);
  known.set(e.id, { name, trait, mob: e.typeId, tag: opts.tag, dim: e.dimension.id, at: e.location });
  loaded++;
  announce(e, name);
  return name;
}

/** Is it night in the overworld (when monsters spawn)? */
function night() {
  const t = world.getTimeOfDay();
  return t >= 13000 && t <= 23000;
}

world.afterEvents.entitySpawn.subscribe(({ entity, cause }) => {
  try {
    if (cause !== EntityInitializationCause.Spawned || !mobSet.has(entity.typeId)) return;
    if (entity.dimension.id !== "minecraft:overworld" || get("enabled") !== true) return;
    const chance = get("chance") * (bloodMoon ? get("bloodMoonMultiplier") : 1);
    if (Math.random() >= chance) return;
    // A tick later: our own spawns (champion requests, Splitting copies) have their tags by then.
    system.runTimeout(() => {
      try {
        convert(entity);
      } catch (e) {
        console.warn(`[elite] ${e}`);
      }
    }, 1);
  } catch (e) {
    console.warn(`[elite] ${e}`);
  }
});

/** Makes a natural spawn a champion if every rule allows it. @param {Entity} e */
function convert(e) {
  if (!e.isValid || e.hasTag(CHAMP) || e.hasTag(SPLIT)) return;
  if (loaded >= get("maxAlive")) return;
  if (get("nightOnly") === true && !night()) return;
  const at = e.location;
  const dim = e.dimension;
  if (get("surfaceOnly") === true) {
    const top = dim.getTopmostBlock({ x: Math.floor(at.x), z: Math.floor(at.z) });
    if (top && top.y > Math.floor(at.y) + 1) return; // a roof or a cave ceiling above it
  }
  const now = Date.now();
  const spacing = CONFIG.areaSpacing;
  recent = recent.filter((r) => now - r.at < CONFIG.areaCooldownMinutes * 60000);
  if (recent.some((r) => r.dim === dim.id && Math.hypot(r.x - at.x, r.z - at.z) < spacing)) return;
  recent.push({ dim: dim.id, x: at.x, z: at.z, at: now });
  makeChampion(e);
}

// ---------------------------------------------------------------------------
// Fighting
// ---------------------------------------------------------------------------

world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource, damage }) => {
  try {
    const attacker = damageSource.damagingEntity;
    if (hurtEntity.isValid && hurtEntity.hasTag(CHAMP)) championHurt(hurtEntity, attacker);
    if (attacker && attacker !== hurtEntity && attacker.isValid && attacker.hasTag(CHAMP)) championHit(attacker, hurtEntity, damage);
  } catch (e) {
    console.warn(`[elite] hurt: ${e}`);
  }
});

/** @param {Entity} champ @param {Entity | undefined} attacker */
function championHurt(champ, attacker) {
  if (!attacker) return; // fire, falls and the like don't count as hits
  if (attacker instanceof Player) {
    let m = hitters.get(champ.id);
    if (!m) hitters.set(champ.id, (m = new Map()));
    m.set(attacker.id, Date.now());
  }
  if (traitOf(champ) !== "shielded") return;
  const hits = Number(champ.getDynamicProperty(PROP_HITS) ?? 0) + 1;
  champ.setDynamicProperty(PROP_HITS, hits);
  if (hits !== CONFIG.traits.shielded.hits) return;
  // The shield breaks: back to the ordinary champion Resistance.
  champ.removeEffect("resistance");
  if (CONFIG.resistanceLevel > 0) champ.addEffect("resistance", FOREVER, { amplifier: CONFIG.resistanceLevel - 1, showParticles: false });
  try {
    champ.dimension.playSound("random.glass", champ.location, { volume: 1.5, pitch: 0.7 });
  } catch {
    // a sound that doesn't play is fine
  }
  const name = nameOf(champ);
  for (const p of champ.dimension.getPlayers({ location: champ.location, maxDistance: 24 })) p.sendMessage(`§bThe shield of ${name} breaks!`);
}

/** The champion dealt damage. @param {Entity} champ @param {Entity} victim @param {number} damage */
function championHit(champ, victim, damage) {
  const trait = traitOf(champ);
  if (trait === "frostbound" && victim.isValid) {
    victim.addEffect("slowness", Math.round(CONFIG.traits.frostbound.slownessSeconds * 20), { amplifier: 1 });
  } else if (trait === "vampiric" && damage > 0) {
    const health = champ.getComponent("minecraft:health");
    if (health) health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + damage * CONFIG.traits.vampiric.healShare));
  }
}

// ---------------------------------------------------------------------------
// Stormcaller lightning
// ---------------------------------------------------------------------------

/** Blocks players make and nature doesn't (terracotta only when glazed: plain terracotta is natural in badlands). */
const BUILT =
  /planks|glass|chest|barrel|sign|bed$|torch|lantern|door|fence|wool|carpet|concrete|glazed|crafting_table|furnace|smoker|bookshelf|lectern|anvil|hopper|_rail|^minecraft:rail|banner|campfire|loom|smithing|cartography|fletching|grindstone|stonecutter|enchanting|beacon|bell|composter|cauldron|brewing|jukebox|note_block|scaffolding|ladder|stairs|slab|brick|polished|item_frame|flower_pot|candle|shulker|dispenser|dropper|piston|observer|repeater|comparator|redstone_lamp|lever|button|pressure_plate/;

/**
 * Is there anything player-made in the 9 x 9 columns around (x, z), from the surface down 4?
 * Unloaded columns count as built (we can't tell). About 400 block reads: only for a lightning strike.
 * @param {Dimension} dim @param {number} x @param {number} z
 */
function nearBuilt(dim, x, z) {
  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -4; dz <= 4; dz++) {
      const top = dim.getTopmostBlock({ x: x + dx, z: z + dz });
      if (!top) return true;
      for (let y = top.y; y >= top.y - 4; y--) {
        const b = dim.getBlock({ x: x + dx, y, z: z + dz });
        if (!b) return true;
        if (BUILT.test(b.typeId)) return true;
      }
    }
  }
  return false;
}

/** Puts out the fire a strike started (never anything else) around a spot. @param {Dimension} dim @param {Vector3} at */
function putOutFire(dim, at) {
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++)
      for (let dy = -1; dy <= 2; dy++) {
        try {
          const b = dim.getBlock({ x: at.x + dx, y: at.y + dy, z: at.z + dz });
          if (b?.typeId === "minecraft:fire") b.setType("minecraft:air");
        } catch {
          // unloaded
        }
      }
}

/** One Stormcaller's turn: a strike near the closest player in range. @param {Entity} champ */
function storm(champ) {
  const due = nextStrike.get(champ.id);
  const now = system.currentTick;
  const s = CONFIG.traits.stormcaller;
  if (due === undefined) {
    nextStrike.set(champ.id, now + Math.round(rand(s.minSeconds, s.maxSeconds) * 20));
    return;
  }
  if (now < due) return;
  nextStrike.set(champ.id, now + Math.round(rand(s.minSeconds, s.maxSeconds) * 20));
  const dim = champ.dimension;
  const target = dim.getPlayers({ location: champ.location, maxDistance: s.range }).filter(targetable)[0];
  if (!target) return;
  const angle = Math.random() * Math.PI * 2;
  const r = rand(1.5, 3);
  const x = Math.floor(target.location.x + Math.cos(angle) * r);
  const z = Math.floor(target.location.z + Math.sin(angle) * r);
  const top = dim.getTopmostBlock({ x, z });
  if (!top) return;
  const at = { x: x + 0.5, y: top.y + 1, z: z + 0.5 };
  const spawn = world.getDefaultSpawnLocation();
  const nearSpawn = Math.hypot(x - spawn.x, z - spawn.z) < CONFIG.avoidSpawn;
  if (nearSpawn || nearBuilt(dim, x, z)) {
    // Near builds (or the spawn area) it only crackles: lightning would set them on fire.
    dim.playSound("ambient.weather.thunder", at, { volume: 0.6, pitch: 1.4 });
    return;
  }
  dim.spawnEntity("minecraft:lightning_bolt", at);
  const fireAt = { x, y: top.y + 1, z };
  system.runTimeout(() => putOutFire(dim, fireAt), 2);
  system.runTimeout(() => putOutFire(dim, fireAt), 20);
}

system.runInterval(() => {
  if (!thunder) return;
  try {
    const ow = world.getDimension("minecraft:overworld");
    for (const champ of ow.getEntities({ tags: [TRAIT_TAG + "stormcaller"] })) {
      try {
        storm(champ);
      } catch (e) {
        console.warn(`[elite] storm: ${e}`);
      }
    }
  } catch (e) {
    console.warn(`[elite] ${e}`);
  }
}, 20);

// ---------------------------------------------------------------------------
// Death
// ---------------------------------------------------------------------------

/** A Relic Shard stack (the shared item: identified by its first lore line). @param {number} n */
function shards(n) {
  const s = new ItemStack("minecraft:amethyst_shard", n);
  s.nameTag = "§r§dRelic Shard";
  s.setLore(["§7Bring 8 to a relicsmith"]);
  return s;
}

/** Copies a Splitting champion leaves behind. @param {Dimension} dim @param {Vector3} at @param {string} mob */
function split(dim, at, mob) {
  for (let i = 0; i < CONFIG.traits.splitting.copies; i++) {
    try {
      const loc = { x: at.x + rand(-1, 1), y: at.y + 0.2, z: at.z + rand(-1, 1) };
      const copy = HAS_BABY.has(mob) ? dim.spawnEntity(mob, loc, { spawnEvent: "minecraft:as_baby" }) : dim.spawnEntity(mob, loc);
      copy.addTag(SPLIT);
      if (!HAS_BABY.has(mob)) {
        const health = copy.getComponent("minecraft:health");
        if (health) health.setCurrentValue(Math.max(1, Math.ceil(health.effectiveMax / 2)));
      }
    } catch (e) {
      console.warn(`[elite] split: ${e}`);
    }
  }
}

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  let id;
  try {
    id = deadEntity.id;
  } catch {
    return;
  }
  /** @type {{ name: string, trait: Trait, mob: string, tag?: string, dim: string, at: Vector3 } | undefined} */
  let info;
  try {
    if (!deadEntity.isValid) info = known.get(id);
    else if (deadEntity.hasTag(CHAMP)) {
      info = {
        name: nameOf(deadEntity),
        trait: traitOf(deadEntity) ?? "shielded",
        mob: deadEntity.typeId,
        tag: extraTagOf(deadEntity),
        dim: deadEntity.dimension.id,
        at: deadEntity.location,
      };
    }
  } catch {
    info = known.get(id);
  }
  if (!info) return;
  try {
    slain(info, damageSource.damagingEntity, hitters.get(id));
  } catch (e) {
    console.warn(`[elite] death: ${e}`);
  }
  hitters.delete(id);
  nextStrike.delete(id);
  known.delete(id);
  loaded = Math.max(0, loaded - 1);
});

/**
 * @param {{ name: string, trait: Trait, mob: string, tag?: string, dim: string, at: Vector3 }} info
 * @param {Entity | undefined} killerEntity @param {Map<string, number> | undefined} hits
 */
function slain(info, killerEntity, hits) {
  const now = Date.now();
  const window = CONFIG.helperSeconds * 1000;
  // Players who hurt it lately, most recent first.
  const recentHitters = [...(hits ?? new Map()).entries()].filter(([, t]) => now - t <= window).sort((a, b) => b[1] - a[1]).map(([pid]) => pid);
  const killerId = killerEntity instanceof Player ? killerEntity.id : recentHitters[0];
  const helpers = recentHitters.filter((pid) => pid !== killerId);
  const dim = world.getDimension(info.dim);
  const at = info.at;

  if (killerId) {
    // Shards and XP only when a player had a hand in it, so sunlight, lava or a farm can't earn them.
    try {
      const n = randInt(CONFIG.shards.min, CONFIG.shards.max);
      if (n > 0) dim.spawnItem(shards(n), at);
      for (let i = 0; i < CONFIG.xpOrbs; i++) dim.spawnEntity("minecraft:xp_orb", { x: at.x + rand(-0.5, 0.5), y: at.y + 0.5, z: at.z + rand(-0.5, 0.5) });
    } catch (e) {
      console.warn(`[elite] drops: ${e}`);
    }
  }
  if (info.trait === "splitting") split(dim, at, info.mob);

  const players = world.getAllPlayers();
  const killer = players.find((p) => p.id === killerId);
  if (killer) {
    const kills = Number(killer.getDynamicProperty(PROP_KILLS) ?? 0) + 1;
    killer.setDynamicProperty(PROP_KILLS, kills);
    killer.sendMessage(`§6You defeated ${info.name}! §7(Champions defeated: ${kills})`);
    killer.playSound("random.levelup", { pitch: 0.8, volume: 0.8 });
    system.sendScriptEvent(
      "realm:journal",
      JSON.stringify({ player: killer.id, page: "mobs", entry: `champion_${info.trait}`, label: `Champion: the ${TRAIT_NAMES[info.trait]}` }),
    );
  }
  for (const p of players) if (helpers.includes(p.id)) p.sendMessage(`§6${info.name} is defeated. §7You helped.`);

  /** @type {Record<string, unknown>} */
  const msg = {
    helpers,
    name: info.name,
    trait: info.trait,
    mob: info.mob,
    dim: info.dim,
    x: Math.floor(at.x),
    y: Math.floor(at.y),
    z: Math.floor(at.z),
  };
  if (killerId) msg.player = killerId;
  if (info.tag) msg.tag = info.tag;
  system.sendScriptEvent("realm:champion_slain", JSON.stringify(msg));
}

// ---------------------------------------------------------------------------
// Upkeep: count, re-buff after a load, forget old data
// ---------------------------------------------------------------------------

/** Checks one loaded champion: name and buffs back if a reload lost them. @param {Entity} e */
function upkeep(e) {
  const trait = traitOf(e);
  if (!trait) return;
  const name = nameOf(e);
  if (!e.nameTag) e.nameTag = `§c${name}`;
  applyEffects(e, trait, false);
  known.set(e.id, { name, trait, mob: e.typeId, tag: extraTagOf(e), dim: e.dimension.id, at: e.location });
}

function refresh() {
  let n = 0;
  const seen = new Set();
  for (const id of DIMS) {
    try {
      for (const e of world.getDimension(id).getEntities({ tags: [CHAMP] })) {
        n++;
        seen.add(e.id);
        try {
          upkeep(e);
        } catch (err) {
          console.warn(`[elite] upkeep: ${err}`);
        }
      }
    } catch (e) {
      console.warn(`[elite] ${e}`);
    }
  }
  loaded = n;
  // Forget champions that unloaded (they come back through entityLoad / the next refresh).
  for (const id of known.keys()) if (!seen.has(id)) known.delete(id);
  for (const id of nextStrike.keys()) if (!seen.has(id)) nextStrike.delete(id);
  const now = Date.now();
  for (const [id, m] of hitters) {
    for (const [pid, t] of m) if (now - t > CONFIG.helperSeconds * 1000) m.delete(pid);
    if (!m.size) hitters.delete(id);
  }
}

system.runInterval(refresh, 100);

world.afterEvents.entityLoad.subscribe(({ entity }) => {
  try {
    if (entity.isValid && entity.hasTag(CHAMP)) upkeep(entity);
  } catch (e) {
    console.warn(`[elite] load: ${e}`);
  }
});

// ---------------------------------------------------------------------------
// Other packs: the moon, and champions on request
// ---------------------------------------------------------------------------

/** Text from another pack, made safe for a name tag. @param {unknown} s */
const cleanName = (s) => (typeof s === "string" ? s.replace(/§./g, "").replace(/[^\x20-\x7e]/g, "").trim().slice(0, 40) : "");

/**
 * Spawns a champion where another pack asks (the Bounty Board's targets). Doesn't count against
 * `maxAlive`, and works with `enabled` off. The chunk must be loaded.
 * @param {any} req
 */
function spawnRequested(req) {
  if (!req || typeof req !== "object") return;
  const dimId = typeof req.dim === "string" ? req.dim : "minecraft:overworld";
  if (!DIMS.includes(dimId)) return;
  const { x, y, z } = req;
  if (![x, y, z].every((v) => typeof v === "number" && Number.isFinite(v))) return;
  const trait = typeof req.trait === "string" && isTrait(req.trait) ? req.trait : undefined;
  const mob = typeof req.mob === "string" && mobSet.has(req.mob) ? req.mob : mobFor(trait);
  const tag = typeof req.tag === "string" && /^realm:[\w:.-]{1,60}$/.test(req.tag) ? req.tag : undefined;
  try {
    const e = world.getDimension(dimId).spawnEntity(mob, { x, y, z });
    makeChampion(e, { trait, name: cleanName(req.name) || undefined, tag });
  } catch (e) {
    console.warn(`[elite] champion_spawn at ${x}, ${y}, ${z}: ${e}`);
  }
}

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:moon" && id !== "realm:champion_spawn") return;
    let req;
    try {
      req = JSON.parse(message);
    } catch {
      return;
    }
    try {
      if (id === "realm:moon") {
        if (!req || typeof req.state !== "string") return;
        bloodMoon = req.state === "blood";
        world.setDynamicProperty(PROP_MOON, req.state);
      } else spawnRequested(req);
    } catch (e) {
      console.warn(`[elite] ${id}: ${e}`);
    }
  },
  { namespaces: ["realm"] },
);

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {Player} player */
function listNear(player) {
  const at = player.location;
  const near = player.dimension
    .getEntities({ tags: [CHAMP], location: at, maxDistance: 64 })
    .map((e) => ({ name: nameOf(e), dist: Math.round(Math.hypot(e.location.x - at.x, e.location.z - at.z)), dir: direction(at, e.location) }))
    .sort((a, b) => a.dist - b.dist);
  const kills = Number(player.getDynamicProperty(PROP_KILLS) ?? 0);
  const lines = [near.length ? `§c${near.length} champion${near.length === 1 ? "" : "s"} within 64 blocks:` : "§7No champions within 64 blocks."];
  for (const c of near.slice(0, 8)) lines.push(`§f- ${c.name} §7${c.dir}, ${c.dist}m`);
  if (near.length > 8) lines.push(`§7...and ${near.length - 8} more.`);
  lines.push(`§7Champions you have defeated: §f${kills}`);
  if (bloodMoon && get("enabled") === true) lines.push("§4Blood Moon: champions are more common tonight.");
  player.sendMessage(lines.join("\n"));
}

/** @param {Player} player @param {string | undefined} trait */
function spawnAt(player, trait) {
  const t = trait && isTrait(trait) ? trait : undefined;
  const mob = mobFor(t);
  const view = player.getViewDirection();
  const len = Math.hypot(view.x, view.z) || 1;
  const at = { x: player.location.x + (view.x / len) * 3, y: player.location.y, z: player.location.z + (view.z / len) * 3 };
  // Three blocks ahead if there's room, else where the player stands.
  let loc = player.location;
  try {
    const feet = player.dimension.getBlock(at);
    const head = player.dimension.getBlock({ x: at.x, y: at.y + 1, z: at.z });
    if (feet?.isAir && head?.isAir) loc = at;
  } catch {
    // unloaded: use the player's spot
  }
  const e = player.dimension.spawnEntity(mob, loc);
  const name = makeChampion(e, { trait: t });
  player.sendMessage(`§7Spawned §c${name}§7.`);
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerEnum("realm:champion_trait", [...TRAITS]);

  customCommandRegistry.registerCommand(
    {
      name: "realm:champions",
      description: "Champions: the champions within 64 blocks of you, which way they are, and how many you have defeated",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => {
        try {
          listNear(player);
        } catch (e) {
          console.warn(`[elite] ${e}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    },
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:champions_spawn",
      description: "Spawn a champion next to you, with a trait of your choice or a random one",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      optionalParameters: [{ name: "realm:champion_trait", type: CustomCommandParamType.Enum }],
    },
    (origin, /** @type {string | undefined} */ trait) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => {
        try {
          spawnAt(player, trait);
        } catch (e) {
          player.sendMessage(`§cCouldn't spawn a champion here: ${e}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "elite_bp");
  },
  { namespaces: ["realm"] },
);
