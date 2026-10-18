import "./diag.js";
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
import { ActionFormData, FormCancelationReason, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, getFor } from "./settings.js";
import { isProtected } from "./zones.js";

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
const PROP_GEAR = "elite:gear"; // entity: the helmet this pack put on the champion (removed again when it dies)
const FOREVER = 20000000; // the longest effect the API allows (ticks, about 11 days): champions keep their buffs
const DIMS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];

/** @type {Trait[]} */
const TRAITS = ["stormcaller", "frostbound", "vampiric", "splitting", "shielded"];
/** @type {Record<Trait, string>} */
const TRAIT_NAMES = { stormcaller: "Stormcaller", frostbound: "Frostbound", vampiric: "Vampiric", splitting: "Splitting", shielded: "Shielded" };
/**
 * How each trait looks: the name tag's badge and color, the helmet (on mobs that show armor) and the
 * aura particle. Plain vanilla particles and items, so nothing needs a resource pack.
 * @type {Record<Trait, { color: string, badge: string, helmet: string, particle: string, helmetName: string, auraName: string }>}
 */
const LOOKS = {
  stormcaller: { color: "§e", badge: "[/]", helmet: "minecraft:golden_helmet", particle: "minecraft:electric_spark_particle", helmetName: "gold helmet", auraName: "electric sparks" },
  frostbound: { color: "§b", badge: "[*]", helmet: "minecraft:diamond_helmet", particle: "minecraft:snowflake_particle", helmetName: "diamond helmet", auraName: "snowflakes" },
  vampiric: { color: "§4", badge: "[v]", helmet: "minecraft:netherite_helmet", particle: "minecraft:redstone_ore_dust_particle", helmetName: "netherite helmet", auraName: "red dust" },
  splitting: { color: "§a", badge: "[%]", helmet: "minecraft:turtle_helmet", particle: "minecraft:villager_happy", helmetName: "turtle shell", auraName: "green sparkles" },
  shielded: { color: "§9", badge: "[#]", helmet: "minecraft:iron_helmet", particle: "minecraft:endrod", helmetName: "iron helmet", auraName: "white glints" },
};
/** A Shielded champion whose shield broke: gray badge, crit sparks. */
const BROKEN = { color: "§8", badge: "[x]", particle: "minecraft:basic_crit_particle" };
/** Mobs that draw a helmet on their head. Others (spiders, creepers, witches) get the badge and aura only. */
const GEAR_MOBS = new Set([
  "minecraft:zombie", "minecraft:husk", "minecraft:drowned", "minecraft:zombie_villager", "minecraft:zombie_villager_v2",
  "minecraft:skeleton", "minecraft:stray", "minecraft:bogged", "minecraft:wither_skeleton",
  "minecraft:zombie_pigman", "minecraft:piglin", "minecraft:piglin_brute",
]);
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
/** @typedef {{ name: string, trait: Trait, mob: string, tag?: string, dim: string, at: Vector3, gear?: string }} Info */
/** What we know of each loaded champion, for a death we can no longer read. @type {Map<string, Info>} */
const known = new Map();
/** Every loaded champion, for the aura (rebuilt every 5 seconds). @type {Map<string, Entity>} */
const live = new Map();

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
  return e.nameTag.replace(/§./g, "").replace(/^\[.\] /, "") || "A champion";
}

/** The extra tag another pack gave it (realm:bounty:<id>), if any. @param {Entity} e */
const extraTagOf = (e) => e.getTags().find((t) => t !== CHAMP && !t.startsWith(TRAIT_TAG) && t.startsWith("realm:"));

/** "N", "NE", ... from `from` towards `to` (north is -z). @param {Vector3} from @param {Vector3} to */
function direction(from, to) {
  const deg = (Math.atan2(to.x - from.x, -(to.z - from.z)) * 180) / Math.PI;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((deg + 360) % 360) / 45) % 8];
}

/**
 * The player behind some damage: the player themselves (arrows and tridents already name the
 * shooter), or the owner of a pet that still has `minecraft:tameable` (a tamed wolf loses it, so its
 * hits name nobody: verified on BDS 1.26).
 * @param {Entity | undefined} e @returns {string | undefined} the player's id
 */
function playerBehind(e) {
  if (!e) return undefined;
  if (e instanceof Player) return e.id;
  try {
    if (!e.isValid) return undefined;
    return e.getComponent("minecraft:tameable")?.tamedToPlayerId || undefined;
  } catch {
    return undefined;
  }
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
  if (dimension !== "minecraft:overworld" && dimension !== "overworld") return; // weatherChange names it "overworld"
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

// ---------------------------------------------------------------------------
// Looks: badge, helmet, aura
// ---------------------------------------------------------------------------

/** Is a Shielded champion's shield still up? @param {Entity} e */
const shieldUp = (e) => Number(e.getDynamicProperty(PROP_HITS) ?? 0) < CONFIG.traits.shielded.hits;

/** The name tag: the trait's badge in its color, then the name in red. @param {Entity} e @param {Trait} trait @param {string} name */
function tagFor(e, trait, name) {
  const look = trait === "shielded" && !shieldUp(e) ? BROKEN : LOOKS[trait];
  return `${look.color}${look.badge} §c${name}`;
}

/**
 * Puts the trait's helmet on (or takes ours off when `looks.gear` is off). Only once: a champion
 * that loses the helmet later keeps going without it. `/replaceitem` because scripts can't reach a
 * mob's equipment in this API version.
 * @param {Entity} e @param {Trait} trait
 */
function dress(e, trait) {
  const want = get("looks.gear") === true && GEAR_MOBS.has(e.typeId);
  const have = e.getDynamicProperty(PROP_GEAR);
  if (want && typeof have !== "string") {
    const helmet = LOOKS[trait].helmet;
    if (e.runCommand(`replaceitem entity @s slot.armor.head 0 ${helmet}`).successCount) e.setDynamicProperty(PROP_GEAR, helmet);
  } else if (!want && typeof have === "string") {
    if (e.runCommand(`testfor @s[hasitem={item=${have},location=slot.armor.head}]`).successCount) e.runCommand("replaceitem entity @s slot.armor.head 0 air");
    e.setDynamicProperty(PROP_GEAR, undefined);
  }
}

/** The helmets champions wear. */
const HELMETS = new Set(Object.values(LOOKS).map((l) => l.helmet));
/** Helmet items that just appeared: item entity id -> tick. Only these can be a champion's drop. @type {Map<string, number>} */
const newHelmets = new Map();
/** How long (ticks) a helmet item counts as just dropped. */
const FRESH_TICKS = 10;

/** Remembers a helmet item that just appeared (a champion's drop shows up the tick it dies). @param {Entity} item */
function noteItem(item) {
  const stack = item.getComponent("minecraft:item")?.itemStack;
  if (!stack || !HELMETS.has(stack.typeId)) return;
  const now = system.currentTick;
  for (const [id, tick] of newHelmets) if (now - tick > FRESH_TICKS) newHelmets.delete(id);
  newHelmets.set(item.id, now);
}

/**
 * Removes the helmet a champion dropped when it died, so champion gear can't be farmed: one item of
 * that type, without a custom name, within `radius` blocks, that appeared as it died (never a
 * helmet a player dropped there earlier), now and over the next ticks.
 * @param {string} dimId @param {Vector3} at @param {string} helmet @param {number} radius
 */
function purgeGear(dimId, at, helmet, radius) {
  let done = false;
  const died = system.currentTick;
  const sweep = () => {
    if (done) return;
    try {
      for (const item of world.getDimension(dimId).getEntities({ type: "minecraft:item", location: at, maxDistance: radius })) {
        const appeared = newHelmets.get(item.id);
        if (appeared === undefined || appeared < died - 2) continue;
        const stack = item.getComponent("minecraft:item")?.itemStack;
        if (stack?.typeId !== helmet || stack.nameTag) continue;
        newHelmets.delete(item.id);
        item.remove();
        done = true;
        return;
      }
    } catch {
      // unloaded: nothing to pick up there
    }
  };
  sweep();
  system.run(sweep);
  system.runTimeout(sweep, 2);
  system.runTimeout(sweep, 5);
}

/** A few particles around a mob's body. @param {Entity} e @param {string} particle @param {number} n */
function puff(e, particle, n) {
  const at = e.location;
  const height = Math.max(0.5, e.getHeadLocation().y - at.y);
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = rand(0.35, 0.7);
    e.dimension.spawnParticle(particle, { x: at.x + Math.cos(angle) * r, y: at.y + rand(0.2, height + 0.2), z: at.z + Math.sin(angle) * r });
  }
}

const AURA_RANGE_SQ = 64 * 64;
/** Time spent in the aura, shown to operators in the menu: [total ms, runs, champion puffs]. */
const auraCost = [0, 0, 0];

/** One aura puff for every loaded champion with a player within 64 blocks. */
function aura() {
  const started = Date.now();
  const players = world.getAllPlayers().map((p) => ({ dim: p.dimension.id, at: p.location }));
  if (!players.length) return;
  let n = 0;
  for (const [id, e] of live) {
    try {
      if (!e.isValid) {
        live.delete(id);
        continue;
      }
      const at = e.location;
      const dim = e.dimension.id;
      if (!players.some((p) => p.dim === dim && (p.at.x - at.x) ** 2 + (p.at.y - at.y) ** 2 + (p.at.z - at.z) ** 2 < AURA_RANGE_SQ)) continue;
      const trait = known.get(id)?.trait ?? traitOf(e);
      if (!trait) continue;
      puff(e, trait === "shielded" && !shieldUp(e) ? BROKEN.particle : LOOKS[trait].particle, 2);
      n++;
    } catch {
      // unloaded this tick: skip it
    }
  }
  auraCost[0] += Date.now() - started;
  auraCost[1]++;
  auraCost[2] += n;
}

function auraLoop() {
  let wait = CONFIG.looks.auraTicks;
  try {
    wait = Math.max(2, Math.round(Number(get("looks.auraTicks")) || CONFIG.looks.auraTicks));
    if (get("looks.aura") === true && live.size) aura();
  } catch (e) {
    console.warn(`[elite] aura: ${e}`);
  }
  system.runTimeout(auraLoop, wait);
}
system.runTimeout(auraLoop, 40);

/** The arrival: a spell sound and a burst of the aura. @param {Entity} e @param {Trait} trait */
function arrival(e, trait) {
  if (get("looks.spawnEffect") !== true) return;
  try {
    e.dimension.playSound("mob.evocation_illager.prepare_summon", e.location, { volume: 1, pitch: 0.8 });
    puff(e, LOOKS[trait].particle, 14);
  } catch {
    // a sound or particle that doesn't play is fine
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
  // The name doesn't make it persistent (BDS 1.26): far from every player it can still despawn.
  e.nameTag = tagFor(e, trait, name);
  applyEffects(e, trait, true);
  try {
    dress(e, trait);
  } catch (err) {
    console.warn(`[elite] gear: ${err}`);
  }
  const gear = e.getDynamicProperty(PROP_GEAR);
  known.set(e.id, { name, trait, mob: e.typeId, tag: opts.tag, dim: e.dimension.id, at: e.location, gear: typeof gear === "string" ? gear : undefined });
  live.set(e.id, e);
  loaded++;
  arrival(e, trait);
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
    if (cause !== EntityInitializationCause.Spawned) return;
    if (entity.typeId === "minecraft:item") {
      noteItem(entity);
      return;
    }
    if (!mobSet.has(entity.typeId)) return;
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
  // Next to a build (a base, a village, a mob farm's platform): no champion there.
  if (CONFIG.avoidBuilds && builtAround(dim, at)) return;
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
  const pid = playerBehind(attacker);
  if (pid) {
    let m = hitters.get(champ.id);
    if (!m) hitters.set(champ.id, (m = new Map()));
    m.set(pid, Date.now());
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
  champ.nameTag = tagFor(champ, "shielded", name); // the badge turns gray
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
  try {
    return scanBuilt(dim, x, z);
  } catch {
    return true; // unloaded
  }
}

/** @param {Dimension} dim @param {number} x @param {number} z */
function scanBuilt(dim, x, z) {
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

/**
 * Is there anything player-made in the 5 x 5 blocks around a spawn spot, from the block under its
 * feet to the one at its head (75 block reads)? Unloaded blocks count as built.
 * @param {Dimension} dim @param {Vector3} at
 */
function builtAround(dim, at) {
  const x = Math.floor(at.x);
  const y = Math.floor(at.y);
  const z = Math.floor(at.z);
  try {
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++)
        for (let dy = -1; dy <= 1; dy++) {
          const b = dim.getBlock({ x: x + dx, y: y + dy, z: z + dz });
          if (!b || BUILT.test(b.typeId)) return true;
        }
  } catch {
    return true;
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
  // getTopmostBlock skips water (it answers a lake or sea bed): over water, strike the water's surface.
  let surf = top;
  try {
    for (let i = 0; i < 64; i++) {
      const up = surf.above();
      if (!up || !(up.isLiquid || /water|kelp|seagrass|bubble_column/.test(up.typeId))) break;
      surf = up;
    }
  } catch {
    // unloaded above
  }
  const at = { x: x + 0.5, y: surf.y + 1, z: z + 0.5 };
  const spawn = world.getDefaultSpawnLocation();
  const nearSpawn = Math.hypot(x - spawn.x, z - spawn.z) < CONFIG.avoidSpawn;
  // Safe zones, land claims and towns are protected: lightning there would start fires and turn villagers into
  // witches and pigs into piglins.
  if (nearSpawn || isProtected(dim.id, x + 0.5, z + 0.5) || nearBuilt(dim, x, z)) {
    // Near builds (or the spawn area, or in a safe zone) it only crackles: lightning would set them on fire.
    dim.playSound("ambient.weather.thunder", at, { volume: 0.6, pitch: 1.4 });
    return;
  }
  dim.spawnEntity("minecraft:lightning_bolt", at);
  const fireAt = { x, y: surf.y + 1, z };
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
// The approach: champions slowly come to the nearest player
// ---------------------------------------------------------------------------

const STEP_TICKS = 5;
/** Blocks a mob walks through (air aside): plants, snow layers, carpets, torches, rails, buttons... */
const WALK_THROUGH =
  /^minecraft:(short_grass|tall_grass|fern|large_fern|deadbush|dead_bush|bush|firefly_bush|short_dry_grass|tall_dry_grass|leaf_litter|snow_layer|.*_carpet|.*sapling|.*flower|poppy|dandelion|.*tulip|blue_orchid|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|wither_rose|pink_petals|rose_bush|lilac|peony|sunflower|vine|glow_lichen|.*torch|.*rail|redstone_wire|.*_button|.*pressure_plate|lever|tripwire)$/;
/** Ground it never steps onto: what mobs can't climb over, what burns or pricks, and fluids. */
const NO_STEP_ON = /fence|wall|_gate|magma|campfire|fire|cactus|sweet_berry|powder_snow|lava|water|scaffolding|pointed_dripstone/;

/** Can a mob stand in this block (feet or head)? @param {import("@minecraft/server").Block | undefined} b */
const open = (b) => !!b && !b.isLiquid && (b.isAir || WALK_THROUGH.test(b.typeId));
/** Can a mob stand on this block? @param {import("@minecraft/server").Block | undefined} b */
const ground = (b) => !!b && !b.isAir && !b.isLiquid && !WALK_THROUGH.test(b.typeId) && !NO_STEP_ON.test(b.typeId);

/**
 * Where a mob standing at `from` lands after a step to (x, z): the same height, one block up, or up to
 * three down, wherever its feet and head fit and the ground holds. Undefined when it can't go there.
 * Nothing it would pass through may be solid: for a step down, the whole target column from head height
 * down to its new feet; for a step up, the room above its own head; for a diagonal step, at least one of
 * the two columns beside it (no slipping between two blocks that touch at a corner).
 * @param {Dimension} dim @param {Vector3} from @param {number} x @param {number} z
 */
function stepTo(dim, from, x, z) {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  const fx = Math.floor(from.x);
  const fz = Math.floor(from.z);
  const fy = Math.floor(from.y + 0.01);
  /** Are blocks y1..y2 of column (cx, cz) all open? @param {number} cx @param {number} cz @param {number} y1 @param {number} y2 */
  const clear = (cx, cz, y1, y2) => {
    for (let y = y1; y <= y2; y++) if (!open(dim.getBlock({ x: cx, y, z: cz }))) return false;
    return true;
  };
  for (const dy of [0, 1, -1, -2, -3]) {
    const y = fy + dy;
    if (y - from.y > 1.01) continue; // no higher than a jump
    const top = Math.max(y, fy) + 1; // the highest block it passes through: its head, at the higher of the two heights
    if (!clear(bx, bz, y, top)) continue; // a step down needs the whole column clear, a wall in front stops it
    const below = dim.getBlock({ x: bx, y: y - 1, z: bz });
    if (!ground(below)) {
      // Air below: only fine further down (the drop is checked by the next dy).
      if (below && (below.isAir || WALK_THROUGH.test(below.typeId))) continue;
      return undefined;
    }
    // A step up also needs room above its own head.
    if (dy > 0 && !open(dim.getBlock({ x: fx, y: fy + 2, z: fz }))) return undefined;
    if (bx !== fx && bz !== fz && !clear(bx, fz, Math.max(y, fy), top) && !clear(fx, bz, Math.max(y, fy), top)) return undefined;
    return { x, y, z };
  }
  return undefined;
}

/** Is this champion one the approach leaves alone (an Expedition's)? @param {Entity} e */
const ownedElsewhere = (e) => e.getTags().some((t) => t.startsWith("realm:exp"));

/** How far ahead of its center a step looks: the mob's body reaches past its center, and a wall or a
 * step that only its body touches stopped it for good (the game pushed it back out every step). */
const BODY = 0.4;
/** Its body's half width across the way it goes (the leading edge's two corners are looked at too). */
const SIDE = 0.28;
/** Steps a detour round something may take before the champion gives up for a while (60 s). */
const DETOUR_STEPS = 240;
/** Steps it rests after a detour that led nowhere (20 s), before it tries the other way round. */
const REST_STEPS = 80;
/**
 * How far from the player a detour may take it (blocks): `LEASH`, or up to `LEASH_GRACE` further than
 * where it met the obstacle (to get out of a dead end) but never past `LEASH_MAX`. A champion more than
 * about 32 blocks from every player may despawn (a name tag given by a script doesn't keep it) and one
 * about 44 away goes at once, so a detour that led away would lose it.
 */
const LEASH = 32;
const LEASH_GRACE = 8;
const LEASH_MAX = 40;

/**
 * A detour in progress for each champion going round something: the side it keeps the obstacle on
 * (`side`: 1 or -1, the obstacle on its -side), its heading, how far from the player it was when it
 * met the obstacle, and the steps so far; or a rest after a detour that led nowhere.
 * @type {Map<string, { side: number, heading?: number, hit?: number, steps: number, rest?: number }>}
 */
const detours = new Map();

/**
 * Where a step of `step` blocks at angle `a` lands, if the mob's whole body fits: its center's column
 * and the columns its leading edge reaches (straight ahead and both corners) must all take it (a corner
 * its body already presses against is left out). A step up that only the body reaches lifts it (it
 * stands on the edge); otherwise it keeps the center's height.
 * @param {Dimension} dim @param {Vector3} at @param {number} a @param {number} step
 */
function bodyStep(dim, at, a, step) {
  const cx = Math.cos(a);
  const cz = Math.sin(a);
  const x = at.x + cx * step;
  const z = at.z + cz * step;
  const center = stepTo(dim, at, x, z);
  if (!center) return undefined;
  let y = center.y;
  const lead = step + BODY;
  for (const off of [0, SIDE, -SIDE]) {
    // A side its body already presses into (the game let it overlap a wall a little) can't stop it going along.
    if (off && !stepTo(dim, at, at.x - cz * off, at.z + cx * off)) continue;
    const probe = stepTo(dim, at, at.x + cx * lead - cz * off, at.z + cz * lead + cx * off);
    if (!probe) return undefined;
    y = Math.max(y, probe.y);
  }
  return { x, y, z };
}

/**
 * Where a champion stands for a step: its location, or, in a small hop (a mob pressing on toward its
 * target keeps jumping at a wall, and a step waited for it to land, so it could stand there for good),
 * the ground under it. Undefined while it falls, flies or is knocked back: it lands first.
 * @param {Entity} e
 */
function feet(e) {
  const at = e.location;
  if (e.isOnGround) return at;
  const v = e.getVelocity();
  if (v.y < -0.5 || Math.hypot(v.x, v.z) > 0.4) return undefined;
  for (let y = Math.floor(at.y + 0.01); y >= Math.floor(at.y) - 2; y--) {
    const b = e.dimension.getBlock({ x: Math.floor(at.x), y: y - 1, z: Math.floor(at.z) });
    if (!b || b.isLiquid) return undefined;
    if (ground(b)) return at.y - y <= 1.3 ? { x: at.x, y, z: at.z } : undefined;
    if (!open(b)) return undefined;
  }
  return undefined;
}

/** One champion's step toward the nearest player in range, if any. @param {Entity} e @param {number} step */
function approachStep(e, step) {
  if (!e.isValid || ownedElsewhere(e)) return;
  if (e.isInWater) return;
  const dim = e.dimension;
  const at = feet(e);
  if (!at) return;
  const range = Number(get("approach.range")) || CONFIG.approach.range;
  const stop = CONFIG.approach.stopDistance;
  // Players in a safe zone, land claim or town are left alone (no crowd of champions at its edge).
  const target = dim
    .getPlayers({ location: at, maxDistance: range, excludeGameModes: [GameMode.Creative, GameMode.Spectator], excludeTags: ["afk"] })
    .filter((p) => !isProtected(dim.id, p.location.x, p.location.z))
    .sort((a, b) => dist(a.location, at) - dist(b.location, at))[0];
  let d = detours.get(e.id);
  if (!target) {
    if (d && d.rest === undefined) detours.delete(e.id);
    return;
  }
  const dx = target.location.x - at.x;
  const dz = target.location.z - at.z;
  const flat = Math.hypot(dx, dz);
  if (flat <= stop) {
    detours.delete(e.id);
    return;
  }
  if (d && d.rest !== undefined) {
    if (--d.rest > 0) return;
    d = { side: -d.side, steps: 0 }; // rested: the other way round this time
    detours.set(e.id, d);
  }
  const base = Math.atan2(dz, dx);
  const inZone = isProtected(dim.id, at.x, at.z);
  const reach = Math.min(LEASH_MAX, Math.max(LEASH, (d?.hit ?? flat) + LEASH_GRACE));
  /** Step at angle a if it can: true when it moved. @param {number} a */
  const go = (a) => {
    if (!inZone && isProtected(dim.id, at.x + Math.cos(a) * (step + BODY), at.z + Math.sin(a) * (step + BODY))) return false; // safe zones and claims: not by our hand
    const to = bodyStep(dim, at, a, step);
    if (!to) return false;
    const after = Math.hypot(target.location.x - to.x, target.location.z - to.z);
    if (after > reach && after > flat) return false;
    const y = to.y === Math.floor(at.y + 0.01) ? at.y : to.y; // same height: keep a slab's half
    e.teleport({ x: to.x, y, z: to.z }, { facingLocation: { x: target.location.x, y: y + 1.5, z: target.location.z }, keepVelocity: false });
    return true;
  };
  if (!d || d.heading === undefined || d.hit === undefined) {
    // Straight on; blocked, it starts going round, on the side it went last time if it rested.
    if (go(base)) {
      if (d) detours.delete(e.id);
      return;
    }
    const first = d?.side ?? 1;
    for (const turn of [Math.PI / 4, Math.PI / 2]) {
      for (const side of [first, -first]) {
        if (!go(base + side * turn)) continue;
        detours.set(e.id, { side, heading: base + side * turn, hit: flat, steps: 1 });
        return;
      }
    }
    return; // boxed in this step: tried again next step
  }
  // Going round: once closer than where it met the obstacle and free straight on, the detour is over.
  if (flat < d.hit - 0.5 && go(base)) {
    detours.delete(e.id);
    return;
  }
  if (++d.steps > DETOUR_STEPS) {
    detours.set(e.id, { side: d.side, steps: 0, rest: REST_STEPS }); // a river or a cliff: rest, then the other way
    return;
  }
  // Keep the obstacle on one side: turn toward it where it ends, along it where it goes on, away where it blocks.
  const q = Math.PI / 4;
  for (const k of [-2, -1, 0, 1, 2, 3, 4]) {
    const a = d.heading + d.side * k * q;
    if (go(a)) {
      d.heading = a;
      return;
    }
  }
}

/** @param {Vector3} a @param {Vector3} b */
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

system.runInterval(() => {
  if (get("approach.enabled") !== true || !live.size) return;
  const step = (Math.max(0, Number(get("approach.speed")) || 0) * STEP_TICKS) / 20;
  if (step <= 0) return;
  for (const e of live.values()) {
    try {
      approachStep(e, Math.min(step, 0.9));
    } catch (err) {
      // an unloaded column or a champion that just died: try again next step
      if (!String(err).includes("LocationInUnloadedChunk") && !String(err).includes("InvalidEntity")) console.warn(`[elite] approach: ${err}`);
    }
  }
}, STEP_TICKS);

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

/**
 * Spawns a mob and checks what came back: a world whose entity ids repeat (an old level.dat put back) can hand back
 * an entity that already exists (a dropped item), and tagging that one would make a champion that isn't there.
 * Spawns again (the next id is usually free); throws if it never gets the mob.
 * @param {Dimension} dim @param {string} type @param {Vector3} loc @param {any} [opts]
 */
function spawnFresh(dim, type, loc, opts) {
  for (let k = 0; k < 8; k++) {
    const e = opts ? dim.spawnEntity(/** @type {any} */ (type), loc, opts) : dim.spawnEntity(/** @type {any} */ (type), loc);
    if (e.typeId === type) return e;
  }
  throw new Error(`spawnEntity(${type}) kept returning another entity`);
}

/** Copies a Splitting champion leaves behind. @param {Dimension} dim @param {Vector3} at @param {string} mob */
function split(dim, at, mob) {
  for (let i = 0; i < CONFIG.traits.splitting.copies; i++) {
    try {
      const loc = { x: at.x + rand(-1, 1), y: at.y + 0.2, z: at.z + rand(-1, 1) };
      const copy = spawnFresh(dim, mob, loc, HAS_BABY.has(mob) ? { spawnEvent: "minecraft:as_baby" } : undefined);
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
  /** @type {Info | undefined} */
  let info;
  let fresh = false; // read from the entity now (its spot is exact), not from the last upkeep
  try {
    if (!deadEntity.isValid) info = known.get(id);
    else if (deadEntity.hasTag(CHAMP)) {
      const gear = deadEntity.getDynamicProperty(PROP_GEAR);
      fresh = true;
      info = {
        gear: typeof gear === "string" ? gear : undefined,
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
  if (info.gear) purgeGear(info.dim, info.at, info.gear, fresh ? 2.5 : 6);
  try {
    slain(info, damageSource.damagingEntity, hitters.get(id));
  } catch (e) {
    console.warn(`[elite] death: ${e}`);
  }
  hitters.delete(id);
  nextStrike.delete(id);
  known.delete(id);
  live.delete(id);
  detours.delete(id);
  loaded = Math.max(0, loaded - 1);
});

/**
 * @param {Info} info
 * @param {Entity | undefined} killerEntity @param {Map<string, number> | undefined} hits
 */
function slain(info, killerEntity, hits) {
  const now = Date.now();
  const window = CONFIG.helperSeconds * 1000;
  // Players who hurt it lately, most recent first.
  const recentHitters = [...(hits ?? new Map()).entries()].filter(([, t]) => now - t <= window).sort((a, b) => b[1] - a[1]).map(([pid]) => pid);
  const killerId = playerBehind(killerEntity) ?? recentHitters[0];
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
  // Townsfolk gossip (Hearth & Hearsay): the town talks about who brought it down.
  if (killerId) system.sendScriptEvent("realm:gossip", JSON.stringify({ kind: "champion", player: killerId, place: String(info.name).replace(/§./g, "") }));
}

// ---------------------------------------------------------------------------
// Upkeep: count, re-buff after a load, forget old data
// ---------------------------------------------------------------------------

/**
 * Checks one loaded champion: name tag, buffs and helmet back if a reload (or a name tag item, or an
 * older version of this pack) changed them.
 * @param {Entity} e
 */
function upkeep(e) {
  const trait = traitOf(e);
  if (!trait) return;
  const name = nameOf(e);
  const tag = tagFor(e, trait, name);
  if (e.nameTag !== tag) e.nameTag = tag;
  applyEffects(e, trait, false);
  try {
    dress(e, trait);
  } catch (err) {
    console.warn(`[elite] gear: ${err}`);
  }
  const gear = e.getDynamicProperty(PROP_GEAR);
  known.set(e.id, { name, trait, mob: e.typeId, tag: extraTagOf(e), dim: e.dimension.id, at: e.location, gear: typeof gear === "string" ? gear : undefined });
  live.set(e.id, e);
}

/** Takes the champion tags and name off an entity that isn't a mob. @param {import("@minecraft/server").Entity} e */
function unChampion(e) {
  try {
    for (const t of e.getTags()) if (t === CHAMP || t.startsWith(TRAIT_TAG) || t.startsWith("realm:")) e.removeTag(t);
    e.nameTag = "";
    e.setDynamicProperty(PROP_NAME, undefined);
  } catch {
    // gone
  }
}

function refresh() {
  let n = 0;
  const seen = new Set();
  for (const id of DIMS) {
    try {
      for (const e of world.getDimension(id).getEntities({ tags: [CHAMP] })) {
        // Not a mob (an item tagged by mistake when the game handed back the wrong entity): no champion, and it
        // doesn't take a place under maxAlive.
        if (!e.getComponent("minecraft:health")) {
          unChampion(e);
          continue;
        }
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
  for (const id of live.keys()) if (!seen.has(id)) live.delete(id);
  for (const id of detours.keys()) if (!seen.has(id)) detours.delete(id);
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
    if (entity.isValid && entity.hasTag(CHAMP)) {
      if (entity.getComponent("minecraft:health")) upkeep(entity);
      else unChampion(entity);
    }
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
    const e = spawnFresh(world.getDimension(dimId), mob, { x, y, z });
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

/** The champions within 64 blocks of a player, nearest first, as text lines. @param {Player} player */
function nearLines(player) {
  const at = player.location;
  const near = player.dimension
    .getEntities({ tags: [CHAMP], location: at, maxDistance: 64 })
    .map((e) => {
      const trait = traitOf(e);
      const badge = trait ? `${trait === "shielded" && !shieldUp(e) ? BROKEN.color + BROKEN.badge : LOOKS[trait].color + LOOKS[trait].badge} ` : "";
      return { name: nameOf(e), badge, dist: Math.round(Math.hypot(e.location.x - at.x, e.location.z - at.z)), dir: direction(at, e.location) };
    })
    .sort((a, b) => a.dist - b.dist);
  const kills = Number(player.getDynamicProperty(PROP_KILLS) ?? 0);
  const lines = [near.length ? `§c${near.length} champion${near.length === 1 ? "" : "s"} within 64 blocks:` : "§7No champions within 64 blocks."];
  for (const c of near.slice(0, 8)) lines.push(`§f- ${c.badge}§f${c.name} §7${c.dir}, ${c.dist}m`);
  if (near.length > 8) lines.push(`§7...and ${near.length - 8} more.`);
  lines.push(`§7Champions you have defeated: §f${kills}`);
  if (bloodMoon && get("enabled") === true) lines.push("§4Blood Moon: champions are more common tonight.");
  return lines;
}

/** @param {Player} player */
const listNear = (player) => player.sendMessage(nearLines(player).join("\n"));

/** What each trait looks like and does, for the menu. */
function guideText() {
  const what = {
    stormcaller: "Calls lightning near players in thunderstorms.",
    frostbound: "Its hits slow you down.",
    vampiric: "Heals from the damage it deals. Fast.",
    splitting: "Leaves copies behind when it dies. Fast.",
    shielded: `Shrugs off most damage until it has been hit ${CONFIG.traits.shielded.hits} times. Then its badge turns ${BROKEN.color}${BROKEN.badge}§r and it gives off crit sparks.`,
  };
  const lines = [
    "Champions are ordinary monsters made tougher, with a red name. The badge before the name, the helmet and the aura show the trait:",
    "",
  ];
  for (const t of TRAITS) {
    const look = LOOKS[t];
    lines.push(`${look.color}${look.badge} ${TRAIT_NAMES[t]}§r: ${look.helmetName}, ${look.auraName}. §7${what[t]}§r`);
  }
  lines.push("", "§7Spiders, creepers and witches can't show a helmet: look for the badge and the aura. Champion helmets never drop.");
  return lines.join("\n");
}

/**
 * Shows a form, waiting while the player still has chat open.
 * @template {{ canceled: boolean, cancelationReason?: string }} R
 * @param {Player} player @param {{ show(p: Player): Promise<R> }} form @returns {Promise<R | undefined>}
 */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (res.canceled && res.cancelationReason === FormCancelationReason.UserBusy) {
      await new Promise((r) => system.runTimeout(() => r(undefined), 20));
      continue;
    }
    return res;
  }
  return undefined;
}

/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

/** `/realm:champions`: the menu. @param {Player} player */
async function menu(player) {
  const op = isOp(player);
  const kills = Number(player.getDynamicProperty(PROP_KILLS) ?? 0);
  const form = new ActionFormData()
    .title("Champions")
    .body(`Champions you have defeated: ${kills}${bloodMoon && get("enabled") === true ? "\n§4Blood Moon: champions are more common tonight." : ""}`)
    .button("Champions near you")
    .button("What champions look like");
  /** @type {(() => Promise<void>)[]} */
  const actions = [() => near(player), () => guide(player)];
  if (op) {
    form.button("§4Spawn a champion\n§8Operators");
    actions.push(() => spawnForm(player));
    form.button("§4Remove champions near you\n§8Operators");
    actions.push(() => removeForm(player));
    form.button("Aura cost");
    actions.push(() => costForm(player));
  }
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  if (res.selection > 1 && !isOp(player)) return player.sendMessage(NOT_OP); // the buttons after the first two are an operator's
  await actions[res.selection]?.();
}

const NOT_OP = "§cOnly operators can do that.";

/** A page with a Back button to the menu. @param {Player} player @param {string} title @param {string} body */
async function page(player, title, body) {
  const res = await show(player, new ActionFormData().title(title).body(body).button("Back"));
  if (res && !res.canceled && res.selection === 0) await menu(player);
}

/** @param {Player} player */
const near = (player) => page(player, "Champions near you", nearLines(player).join("\n"));
/** @param {Player} player */
const guide = (player) => page(player, "What champions look like", guideText());

/** @param {Player} player */
function costForm(player) {
  const [ms, runs, puffs] = auraCost;
  const body = [
    `Champions loaded: ${loaded} (${live.size} tracked for the aura)`,
    `Aura: ${get("looks.aura") === true ? "Enabled" : "Disabled"}, a puff every ${get("looks.auraTicks")} ticks`,
    runs ? `Since the world started: ${runs} aura runs, ${puffs} champion puffs, ${ms} ms in all (${(ms / runs).toFixed(3)} ms a run)` : "No aura runs yet (they only run while a champion has a player within 64 blocks).",
  ].join("\n");
  return page(player, "Aura cost", body);
}

/** @param {Player} player */
async function spawnForm(player) {
  const mobs = CONFIG.mobs.filter((m) => m !== "minecraft:drowned");
  const res = await show(
    player,
    new ModalFormData()
      .title("Spawn a champion")
      .dropdown("Trait", ["Random", ...TRAITS.map((t) => TRAIT_NAMES[t])], { defaultValueIndex: 0 })
      .dropdown("Mob", ["Random (one that suits the trait)", ...mobs.map((m) => m.replace(/^minecraft:/, "").replace(/_v2$/, "").replace(/_/g, " "))], { defaultValueIndex: 0 }),
  );
  if (!res || res.canceled || !res.formValues || !player.isValid) return;
  if (!isOp(player)) return player.sendMessage(NOT_OP); // de-opped while the form was open
  const [ti, mi] = /** @type {number[]} */ (res.formValues);
  const trait = ti > 0 ? TRAITS[ti - 1] : undefined;
  let mob = mi > 0 ? mobs[mi - 1] : undefined;
  if (mob && trait && !traitsFor(mob).includes(trait)) {
    player.sendMessage(`§7A ${mob.replace(/^minecraft:/, "")} can't be ${TRAIT_NAMES[trait]}: picked a mob that can.`);
    mob = undefined;
  }
  try {
    spawnAt(player, trait, mob);
  } catch (e) {
    player.sendMessage(`§cCouldn't spawn a champion here: ${e}`);
  }
}

/** @param {Player} player */
async function removeForm(player) {
  const list = player.dimension.getEntities({ tags: [CHAMP], location: player.location, maxDistance: 64 });
  if (!list.length) return page(player, "Remove champions", "No champions within 64 blocks.");
  const res = await show(
    player,
    new MessageFormData()
      .title("Remove champions")
      .body(`Remove the ${list.length} champion${list.length === 1 ? "" : "s"} within 64 blocks? They vanish without drops, and bounties for them stay open.`)
      .button1("Remove")
      .button2("Cancel"),
  );
  if (!res || res.canceled || res.selection !== 0 || !player.isValid) return;
  if (!isOp(player)) return player.sendMessage(NOT_OP); // de-opped while the form was open
  let n = 0;
  for (const e of list) {
    try {
      if (!e.isValid) continue;
      const id = e.id;
      e.remove();
      known.delete(id);
      live.delete(id);
      hitters.delete(id);
      nextStrike.delete(id);
      n++;
    } catch {
      // already gone
    }
  }
  loaded = Math.max(0, loaded - n);
  player.sendMessage(`§7Removed ${n} champion${n === 1 ? "" : "s"}.`);
}

/** @param {Player} player @param {string | undefined} trait @param {string} [mobId] */
function spawnAt(player, trait, mobId) {
  const t = trait && isTrait(trait) ? trait : undefined;
  const mob = mobId ?? mobFor(t);
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
  const e = spawnFresh(player.dimension, mob, loc);
  const name = makeChampion(e, { trait: t });
  player.sendMessage(`§7Spawned §c${name}§7.`);
}

/**
 * Runs `fn` for the player who ran a command, after the command (forms and world changes can't run inside it).
 * @param {import("@minecraft/server").CustomCommandOrigin} origin @param {(p: Player) => unknown} fn
 * @returns {import("@minecraft/server").CustomCommandResult}
 */
function forPlayer(origin, fn) {
  const player = origin.initiator ?? origin.sourceEntity;
  if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
  system.run(async () => {
    try {
      await fn(player);
    } catch (e) {
      console.warn(`[elite] ${e}`);
    }
  });
  return { status: CustomCommandStatus.Success };
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerEnum("realm:champion_trait", [...TRAITS]);

  customCommandRegistry.registerCommand(
    {
      name: "realm:champions",
      description: "Champions: a menu with the champions near you, what each trait looks like, and (operators) spawning and removing them",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => forPlayer(origin, menu),
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:champions_near",
      description: "Champions: the champions within 64 blocks of you, which way they are, and how many you have defeated, in chat",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => forPlayer(origin, listNear),
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:champions_spawn",
      description: "Spawn a champion next to you, with a trait of your choice or a random one",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      optionalParameters: [{ name: "realm:champion_trait", type: CustomCommandParamType.Enum }],
    },
    (origin, /** @type {string | undefined} */ trait) =>
      forPlayer(origin, (player) => {
        try {
          spawnAt(player, trait);
        } catch (e) {
          player.sendMessage(`§cCouldn't spawn a champion here: ${e}`);
        }
      }),
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "elite_bp");
  },
  { namespaces: ["realm"] },
);
