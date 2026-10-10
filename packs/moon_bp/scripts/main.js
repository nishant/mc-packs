import {
  BlockTypes,
  BlockVolume,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Difficulty,
  Dimension,
  Entity,
  GameMode,
  Player,
  system,
  world,
} from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

// Tonight is one world property, "moon:night" -> JSON { d: day number, s: state, a: 1 while the night is on,
// alive: [player ids still in the running for the Blood Moon reward] }.
const PROP_NIGHT = "moon:night";
const PROP_PENDING = "moon:pending"; // world: the state an operator chose for tonight, during the day
const PROP_TICK = "moon:tick"; // world: JSON { was, set }: randomTickSpeed before a Harvest Moon raised it
const PROP_SEEN = "moon:seen"; // player: moons already sent to the Journal, "blood,harvest"
const PROP_SURVIVOR = "moon:survivor"; // player: true once they unlocked the survivor title

const OVERWORLD = "minecraft:overworld";
const FOG_ID = "moon_sky"; // our /fog entry's name, so only ours is ever removed
const MOB_TAG = "realm:moon_mob"; // the Blood Moon's extra monsters: removed at dawn
const CAP_RADIUS = 48; // monsters within this many blocks count toward a player's maxExtraPerPlayer
const MOTES_EVERY = 3; // seconds between motes around each player
const SPOT_TRIES = 4; // places tried per monster
const CLEAR_RADIUS = 12; // no monster appears this close to any player

/** @typedef {"blood" | "harvest" | "normal"} State */
/** @typedef {{ d: number, s: State, a: number, alive: string[] }} Night */

/** @type {State[]} */
const STATES = ["blood", "harvest", "normal"];
/** @type {Record<State, string>} */
const NAME = { blood: "Blood Moon", harvest: "Harvest Moon", normal: "an ordinary moon" };
// Phases by world.getMoonPhase(): Minecraft goes full -> waning -> new -> waxing. (The API's enum calls 2 and 6
// FirstQuarter and LastQuarter; in the sky after a full moon the half moon is the last quarter, so it's named that way.)
const PHASES = ["Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent", "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous"];

/** @type {Night | undefined} */
let night;
/** @type {number | undefined} time of day at the last check, to tell a natural dawn from a skipped night */
let lastTime;
let seconds = 0;
/** Fog id we pushed per player ("" or absent = none). @type {Map<string, string>} */
const fogs = new Map();
/** Players already counted as having seen tonight's moon. @type {Set<string>} */
const seenTonight = new Set();

/** @param {unknown} s @returns {s is State} */
const isState = (s) => typeof s === "string" && STATES.includes(/** @type {State} */ (s));
const overworld = () => world.getDimension(OVERWORLD);

// ---------------------------------------------------------------------------
// Saved state
// ---------------------------------------------------------------------------

function loadNight() {
  try {
    const raw = world.getDynamicProperty(PROP_NIGHT);
    const p = typeof raw === "string" ? JSON.parse(raw) : undefined;
    if (p && Number.isFinite(p.d) && isState(p.s)) night = { d: p.d, s: p.s, a: p.a ? 1 : 0, alive: Array.isArray(p.alive) ? p.alive.filter((/** @type {unknown} */ x) => typeof x === "string") : [] };
  } catch {
    console.warn("[moon] moon:night is corrupt; starting over");
    night = undefined;
  }
}

function saveNight() {
  try {
    world.setDynamicProperty(PROP_NIGHT, night ? JSON.stringify(night) : undefined);
  } catch (e) {
    console.warn(`[moon] ${e}`);
  }
}

/** @param {number} t time of day */
const isNight = (t) => {
  const dusk = Number(CONFIG.duskTime), dawn = Number(CONFIG.dawnTime);
  return dusk <= dawn ? t >= dusk && t < dawn : t >= dusk || t < dawn;
};

// ---------------------------------------------------------------------------
// Dusk and dawn
// ---------------------------------------------------------------------------

/** Tonight's moon: an operator's choice, else a roll on a full moon. @returns {State} */
function decide() {
  const pending = world.getDynamicProperty(PROP_PENDING);
  if (isState(pending)) {
    world.setDynamicProperty(PROP_PENDING, undefined);
    return pending;
  }
  if (get("enabled") !== true || world.getMoonPhase() !== 0) return "normal";
  if (Math.random() < Number(get("bloodChance"))) return "blood";
  if (Math.random() < Number(get("harvestChance"))) return "harvest";
  return "normal";
}

/** @param {number} day @param {State} state */
function startNight(day, state) {
  if (night?.a) stopEffects(night.s);
  seenTonight.clear();
  const players = world.getAllPlayers();
  night = { d: day, s: state, a: 1, alive: state === "blood" ? players.map((p) => p.id) : [] };
  saveNight();
  system.sendScriptEvent("realm:moon", JSON.stringify({ state }));
  if (state === "normal") return;
  if (state === "harvest") raiseTicks();
  const blood = state === "blood";
  const reward = rewardText();
  system.sendScriptEvent("realm:sky_event", JSON.stringify({ kind: blood ? "blood_moon" : "harvest_moon", dim: OVERWORLD, text: blood ? "A Blood Moon rises" : "A Harvest Moon rises" }));
  for (const p of players) {
    try {
      p.sendMessage(blood ? `§4A Blood Moon rises. §7More monsters roam tonight.${reward ? ` Survive until dawn without dying: ${reward}.` : ""}` : "§6A Harvest Moon rises. §7Crops grow faster until dawn.");
      if (p.dimension.id !== OVERWORLD) continue;
      p.onScreenDisplay.setTitle(blood ? "§4Blood Moon" : "§6Harvest Moon", {
        subtitle: blood ? "§cSurvive until dawn" : "§eCrops grow faster tonight",
        fadeInDuration: 20,
        stayDuration: 80,
        fadeOutDuration: 30,
      });
      p.playSound(blood ? "mob.wither.spawn" : "random.levelup", { volume: blood ? 0.4 : 0.6, pitch: blood ? 0.6 : 0.7 });
    } catch (e) {
      console.warn(`[moon] ${e}`);
    }
  }
}

/** Takes off what a moon put on: fogs, extra monsters, the faster growth. @param {State} state */
function stopEffects(state) {
  for (const p of world.getAllPlayers()) setFog(p, "");
  if (state === "blood") removeMobs();
  if (state === "harvest") restoreTicks();
}

/** @param {boolean} natural the night ran out (not skipped by sleeping, /time or a restart) */
function endNight(natural) {
  if (!night) return;
  const state = night.s;
  const alive = night.alive;
  night.a = 0;
  night.alive = [];
  saveNight();
  stopEffects(state);
  system.sendScriptEvent("realm:moon", JSON.stringify({ state: "normal" }));
  if (state === "normal") return;
  for (const p of world.getAllPlayers()) {
    try {
      p.sendMessage(state === "blood" ? "§7The Blood Moon sets." : "§7The Harvest Moon sets.");
    } catch {
      // leaving
    }
  }
  if (state === "blood" && natural) rewardSurvivors(alive);
}

const rewardText = () => {
  const levels = Math.max(0, Math.floor(Number(get("blood.rewardLevels")) || 0));
  const crowns = Math.max(0, Math.floor(Number(get("blood.rewardCrowns")) || 0));
  return [levels ? `${levels} level${levels === 1 ? "" : "s"}` : "", crowns ? `${crowns} Crowns` : ""].filter(Boolean).join(" and ");
};

/** @param {string[]} alive */
function rewardSurvivors(alive) {
  const levels = Math.max(0, Math.floor(Number(get("blood.rewardLevels")) || 0));
  const crowns = Math.max(0, Math.floor(Number(get("blood.rewardCrowns")) || 0));
  const title = String(CONFIG.blood.title || "");
  for (const p of world.getAllPlayers()) {
    if (!alive.includes(p.id)) continue;
    try {
      p.sendMessage(`§aYou survived the Blood Moon!${levels ? ` §7+${levels} level${levels === 1 ? "" : "s"}` : ""}`);
      if (levels) p.addLevels(levels);
      if (crowns && addCrowns(p, crowns)) p.sendMessage(`§6+${crowns} Crowns §7(Blood Moon survived)`);
      p.playSound("random.levelup", { volume: 0.8 });
      if (title && p.getDynamicProperty(PROP_SURVIVOR) !== true) {
        p.setDynamicProperty(PROP_SURVIVOR, true);
        system.sendScriptEvent("realm:title_unlock", JSON.stringify({ player: p.id, title, from: "moon_bp" }));
      }
    } catch (e) {
      console.warn(`[moon] reward: ${e}`);
    }
  }
}

function crownsObjective() {
  try {
    return world.scoreboard.getObjective("crowns") ?? world.scoreboard.addObjective("crowns", "Crowns");
  } catch {
    return world.scoreboard.getObjective("crowns"); // another pack added it in the same tick
  }
}

/** @param {Player} p @param {number} n @returns {boolean} paid */
function addCrowns(p, n) {
  try {
    const obj = crownsObjective();
    if (!obj) return false;
    obj.addScore(p, Math.floor(n));
    return true;
  } catch (e) {
    console.warn(`[moon] crowns: ${e}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Harvest Moon: faster growth
// ---------------------------------------------------------------------------

function raiseTicks() {
  try {
    const target = Math.max(1, Math.floor(Number(get("harvest.tickSpeed")) || 1));
    const cur = world.gameRules.randomTickSpeed;
    if (cur >= target) return;
    // Keep the first value we saw, if an earlier Harvest Moon never got to put it back.
    if (world.getDynamicProperty(PROP_TICK) === undefined) world.setDynamicProperty(PROP_TICK, JSON.stringify({ was: cur, set: target }));
    world.gameRules.randomTickSpeed = target;
  } catch (e) {
    console.warn(`[moon] randomTickSpeed: ${e}`);
  }
}

function restoreTicks() {
  try {
    const raw = world.getDynamicProperty(PROP_TICK);
    if (typeof raw !== "string") return;
    world.setDynamicProperty(PROP_TICK, undefined);
    const saved = JSON.parse(raw);
    // An operator who changed the gamerule during the night keeps their value.
    if (Number.isFinite(saved?.was) && world.gameRules.randomTickSpeed === saved.set) world.gameRules.randomTickSpeed = saved.was;
  } catch (e) {
    console.warn(`[moon] randomTickSpeed: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

world.afterEvents.worldLoad.subscribe(() => {
  try {
    loadNight();
    // Fogs may have survived a script reload: clear them, the loop puts back what tonight calls for.
    for (const p of world.getAllPlayers()) removeFog(p);
    const t = world.getTimeOfDay();
    const day = world.getDay();
    const going = night?.a && night.d === day && isNight(t) && get("enabled") === true;
    if (night?.a && !going) endNight(false); // the realm was closed over dawn: no rewards
    if (!(night?.a && night.s === "harvest")) restoreTicks(); // a Harvest Moon cut short
    if (!(night?.a && night.s === "blood")) removeMobs();
    lastTime = t;
  } catch (e) {
    console.warn(`[moon] ${e}`);
  }
});

system.runInterval(() => {
  try {
    seconds++;
    const t = world.getTimeOfDay();
    const day = world.getDay();
    if (get("enabled") !== true) {
      if (night?.a) endNight(false);
    } else if (isNight(t)) {
      if (!night || night.d !== day) startNight(day, decide());
      else if (night.a) during(night);
    } else if (night?.a) {
      // A natural dawn: a second ago it was just before dawn. Sleeping, /time or a long pause jump past it.
      const dawn = Number(CONFIG.dawnTime);
      const natural = lastTime !== undefined && lastTime < dawn && dawn - lastTime <= 200;
      endNight(natural);
    }
    lastTime = t;
  } catch (e) {
    console.warn(`[moon] ${e}`);
  }
}, 20);

/** Once a second during the night. @param {Night} n */
function during(n) {
  if (n.s === "normal") return;
  const blood = n.s === "blood";
  const fogId = blood ? "realm:sky_blood_moon" : "realm:sky_harvest_moon";
  const wave = blood && seconds % Math.max(5, Math.floor(Number(get("blood.spawnSeconds")) || 20)) === 0 && canSpawn();
  for (const p of world.getAllPlayers()) {
    try {
      if (p.dimension.id !== OVERWORLD) {
        setFog(p, "");
        continue;
      }
      if (!seenTonight.has(p.id)) {
        seenTonight.add(p.id);
        journal(p, n.s);
      }
      const out = outdoors(p);
      setFog(p, out ? fogId : "");
      if (out && (seconds + p.id.length) % MOTES_EVERY === 0) motes(p, blood ? "realm:sky_blood" : "realm:sky_harvest");
      if (wave) spawnWave(p);
    } catch (e) {
      console.warn(`[moon] ${e}`); // usually an unloaded chunk
    }
  }
}

/** Nothing 2+ blocks over the player's head (leaves count as outdoors). @param {Player} p */
function outdoors(p) {
  try {
    const feet = p.location;
    const top = p.dimension.getTopmostBlock({ x: Math.floor(feet.x), z: Math.floor(feet.z) });
    if (!top) return true;
    return top.location.y - Math.floor(feet.y) < 2 || top.typeId.includes("leaves");
  } catch {
    return false;
  }
}

/** A few motes near the player, only for them. @param {Player} p @param {string} id */
function motes(p, id) {
  const feet = p.location;
  for (let i = 0; i < 2; i++) {
    try {
      p.spawnParticle(id, { x: feet.x + (Math.random() * 2 - 1) * 6, y: feet.y + 0.5 + Math.random() * 2.5, z: feet.z + (Math.random() * 2 - 1) * 6 });
    } catch {
      // unloaded, or Realm Skies isn't installed
    }
  }
}

/** @param {Player} p @param {State} state */
function journal(p, state) {
  try {
    const raw = p.getDynamicProperty(PROP_SEEN);
    const seen = typeof raw === "string" && raw ? raw.split(",") : [];
    if (seen.includes(state)) return;
    seen.push(state);
    p.setDynamicProperty(PROP_SEEN, seen.join(","));
    const entry = state === "blood" ? "blood_moon" : "harvest_moon";
    system.sendScriptEvent("realm:journal", JSON.stringify({ player: p.id, page: "weather", entry, label: NAME[state] }));
  } catch (e) {
    console.warn(`[moon] ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Fog
// ---------------------------------------------------------------------------

/** @param {Player} p */
function removeFog(p) {
  try {
    p.runCommand(`fog @s remove ${FOG_ID}`);
  } catch (e) {
    console.warn(`[moon] /fog: ${e}`);
  }
}

/** @param {Player} p @param {string} fog "" = none */
function setFog(p, fog) {
  const had = fogs.get(p.id) ?? "";
  if (had === fog) return;
  if (had) removeFog(p);
  if (fog) {
    try {
      p.runCommand(`fog @s push ${fog} ${FOG_ID}`);
    } catch (e) {
      console.warn(`[moon] /fog: ${e}`);
    }
  }
  fogs.set(p.id, fog); // even after an error, so a broken /fog isn't retried every second
}

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  removeFog(player); // a fog can survive a relog; the loop puts back what tonight calls for
  fogs.delete(player.id);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  fogs.delete(playerId);
  if (night?.a && night.alive.includes(playerId)) {
    night.alive = night.alive.filter((id) => id !== playerId);
    saveNight();
  }
});

// ---------------------------------------------------------------------------
// Blood Moon: extra monsters
// ---------------------------------------------------------------------------

function canSpawn() {
  try {
    return world.getDifficulty() !== Difficulty.Peaceful && world.gameRules.doMobSpawning;
  } catch {
    return false;
  }
}

/** @type {string[] | undefined} */
let playerMade;
/**
 * Blocks that mean someone built here (validated against this game version's block list, since an unknown
 * id makes the filter throw). Natural colored terracotta is left out: badlands are made of it.
 */
function playerMadeBlocks() {
  if (playerMade) return playerMade;
  const pattern =
    /planks|glass|chest|barrel|sign|_bed$|^minecraft:bed$|torch(?!flower)|lantern|door|fence|wool|carpet|concrete|glazed|crafting_table|furnace|smoker|bookshelf|bricks|ladder|rail|lever|button|pressure_plate|hopper|anvil|enchanting_table|loom|cartography|fletching|smithing|stonecutter|grindstone|composter|cauldron|campfire|jukebox|noteblock|banner|bell|lectern|scaffolding|piston|redstone_lamp|dispenser|dropper|observer|shulker_box|beacon|flower_pot|candle|stripped|hay_block|smooth_stone|polished|sea_lantern|glowstone|shroomlight|froglight|end_rod/;
  try {
    playerMade = BlockTypes.getAll()
      .map((t) => t.id)
      .filter((id) => pattern.test(id));
  } catch (e) {
    console.warn(`[moon] block list: ${e}`);
    playerMade = [];
  }
  return playerMade;
}

/** Anything player-made in the 9 x 9 columns around the spot, 4 blocks above and below it? @param {Dimension} dim @param {{ x: number, y: number, z: number }} at */
function built(dim, at) {
  const types = playerMadeBlocks();
  if (!types.length) return true; // can't tell: don't spawn
  try {
    return dim.containsBlock(new BlockVolume({ x: at.x - 4, y: at.y - 4, z: at.z - 4 }, { x: at.x + 4, y: at.y + 4, z: at.z + 4 }), { includeTypes: types }, true);
  } catch {
    return true;
  }
}

/** Ground monsters can't stand on, or shouldn't. */
const BAD_GROUND = /leaves|glass|slab|stairs|fence|wall|carpet|lava|magma|cactus|campfire|ice|water|bamboo|vine|web|powder_snow|fire|sweet_berry/;

/** @param {Player} p @returns {{ x: number, y: number, z: number } | undefined} */
function spot(p) {
  const dim = p.dimension;
  const minD = Math.max(8, Number(CONFIG.blood.minDistance) || 16);
  const maxD = Math.max(minD, Number(CONFIG.blood.maxDistance) || 32);
  const spawn = world.getDefaultSpawnLocation();
  const avoid = Math.max(0, Number(get("avoidSpawn")) || 0);
  const feet = p.location;
  for (let i = 0; i < SPOT_TRIES; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = minD + Math.random() * (maxD - minD);
    const x = Math.floor(feet.x + Math.cos(a) * d);
    const z = Math.floor(feet.z + Math.sin(a) * d);
    if (Math.hypot(x - spawn.x, z - spawn.z) < avoid) continue;
    let top;
    try {
      top = dim.getTopmostBlock({ x, z });
    } catch {
      continue; // unloaded
    }
    if (!top || top.isAir || top.isLiquid || BAD_GROUND.test(top.typeId)) continue;
    const y = top.location.y;
    if (Math.abs(y - feet.y) > 16) continue; // cliffs and caves: the surface there is too far from the player
    const at = { x, y: y + 1, z };
    if (dim.getPlayers({ location: { x: x + 0.5, y: y + 1, z: z + 0.5 }, maxDistance: CLEAR_RADIUS }).length) continue;
    if (built(dim, { x, y, z })) continue;
    return at;
  }
  return undefined;
}

/** @returns {string | undefined} a monster id by weight */
function pickMob() {
  const list = CONFIG.blood.mobs.filter((m) => typeof m.id === "string" && m.weight > 0);
  const total = list.reduce((s, m) => s + m.weight, 0);
  let r = Math.random() * total;
  for (const m of list) if ((r -= m.weight) < 0) return m.id;
  return list.at(-1)?.id;
}

/** One wave around one player. @param {Player} p */
function spawnWave(p) {
  const mode = p.getGameMode();
  if (mode === GameMode.Creative || mode === GameMode.Spectator) return;
  const max = Math.max(0, Math.floor(Number(get("blood.maxExtraPerPlayer")) || 0));
  if (!max) return;
  const near = p.dimension.getEntities({ tags: [MOB_TAG], location: p.location, maxDistance: CAP_RADIUS }).length;
  const lo = Math.max(0, Math.floor(CONFIG.blood.spawnMin)), hi = Math.max(lo, Math.floor(CONFIG.blood.spawnMax));
  const n = Math.min(max - near, lo + Math.floor(Math.random() * (hi - lo + 1)));
  for (let i = 0; i < n; i++) {
    const at = spot(p);
    const id = pickMob();
    if (!at || !id) continue;
    try {
      const mob = p.dimension.spawnEntity(id, { x: at.x + 0.5, y: at.y, z: at.z + 0.5 });
      mob.addTag(MOB_TAG);
    } catch (e) {
      console.warn(`[moon] spawn ${id}: ${e}`);
    }
  }
}

/** Removes every Blood Moon monster in loaded chunks; ones in unloaded chunks go when they load. */
function removeMobs() {
  try {
    for (const e of overworld().getEntities({ tags: [MOB_TAG] })) {
      try {
        e.remove();
      } catch {
        // already gone
      }
    }
  } catch (e) {
    console.warn(`[moon] ${e}`);
  }
}

world.afterEvents.entityLoad.subscribe(({ entity }) => {
  try {
    if (!(night?.a && night.s === "blood") && entity.hasTag(MOB_TAG)) entity.remove();
  } catch {
    // gone
  }
});

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  try {
    if (deadEntity instanceof Player) {
      // Dying ends a player's run at the survivor reward.
      if (night?.a && night.s === "blood" && night.alive.includes(deadEntity.id)) {
        night.alive = night.alive.filter((id) => id !== deadEntity.id);
        saveNight();
        deadEntity.sendMessage("§7You died during the Blood Moon: no survivor reward this time.");
      }
      return;
    }
    if (!deadEntity.hasTag(MOB_TAG) || !(damageSource.damagingEntity instanceof Player)) return;
    dropXp(deadEntity, damageSource.damagingEntity);
  } catch (e) {
    console.warn(`[moon] ${e}`);
  }
});

/** Bonus experience orbs where a Blood Moon monster fell. @param {Entity} mob @param {Player} killer */
function dropXp(mob, killer) {
  const n = Math.max(0, Math.floor(Number(CONFIG.blood.bonusXpOrbs) || 0));
  if (!n) return;
  let at;
  try {
    at = mob.location;
  } catch {
    at = killer.location;
  }
  const dim = killer.dimension;
  for (let i = 0; i < n; i++) {
    try {
      dim.spawnEntity("minecraft:xp_orb", { x: at.x + (Math.random() - 0.5), y: at.y + 0.5, z: at.z + (Math.random() - 0.5) });
    } catch {
      killer.addExperience(3); // no orb: the experience goes straight to the killer
    }
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** The moon report for /realm:moon. */
function report() {
  const t = world.getTimeOfDay();
  const phase = world.getMoonPhase();
  const nightNow = isNight(t);
  const dawn = Number(CONFIG.dawnTime);
  /** @type {string} */
  let tonight;
  if (get("enabled") !== true) tonight = "§7Blood Moons and Harvest Moons are disabled on this realm.";
  else if (nightNow && night?.a && night.d === world.getDay()) {
    tonight = night.s === "blood" ? "§4Tonight is a Blood Moon: §7more monsters roam. Survive until dawn without dying for a reward." : night.s === "harvest" ? "§6Tonight is a Harvest Moon: §7crops grow faster until dawn." : "§7Tonight is an ordinary night.";
  } else {
    const pending = world.getDynamicProperty(PROP_PENDING);
    const upcoming = !nightNow && t < dawn;
    if (isState(pending)) tonight = `§eAn operator set tonight's moon: ${NAME[pending]}.`;
    else if (upcoming && phase === 0) tonight = "§eTonight is a full moon: it may rise as a Blood Moon or a Harvest Moon.";
    else tonight = "§7Tonight's moon is an ordinary one.";
  }
  let days = (8 - phase) % 8;
  // The day count goes up at time 0, an hour after sunrise: between dawn and then, today's full moon has already set.
  if (days === 0 && !nightNow && t >= dawn) days = 8;
  const next = days === 0 ? (nightNow ? "it's up now" : "tonight") : `in ${days} day${days === 1 ? "" : "s"}`;
  return `${tonight}\n§7Moon phase: §f${PHASES[phase] ?? "unknown"}§7. Next full moon: §f${next}§7.`;
}

/** @param {State} state @returns {string} what happened */
function setMoon(state) {
  if (get("enabled") !== true) return "Blood Moons and Harvest Moons are disabled: enable them in /realm:config first.";
  const t = world.getTimeOfDay();
  const day = world.getDay();
  if (isNight(t)) {
    if (night?.a && night.d === day && night.s === state) return `Tonight is already ${NAME[state]}.`;
    startNight(day, state);
    return `Tonight is now ${NAME[state]}.`;
  }
  world.setDynamicProperty(PROP_PENDING, state === "normal" && world.getMoonPhase() !== 0 ? undefined : state);
  return `Tonight will be ${NAME[state]}.`;
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerEnum("realm:moon_state", ["blood", "harvest", "normal"]);

  customCommandRegistry.registerCommand(
    {
      name: "realm:moon",
      description: "Blood Moon & Harvest Moon: tonight's moon, the moon phase and the next full moon",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => {
        try {
          player.sendMessage(report());
        } catch (e) {
          console.warn(`[moon] ${e}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:moon_set",
      description: "Blood Moon & Harvest Moon: make tonight a blood, harvest or normal moon (now, if it's night)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "realm:moon_state", type: CustomCommandParamType.Enum }],
    },
    (origin, /** @type {unknown} */ stateArg) => {
      const state = String(stateArg);
      if (!isState(state)) return { status: CustomCommandStatus.Failure, message: "Choose blood, harvest or normal." };
      const player = origin.initiator ?? origin.sourceEntity;
      system.run(() => {
        try {
          const said = setMoon(state);
          if (player instanceof Player && player.isValid) player.sendMessage(`§7${said}`);
          else console.warn(`[moon] ${said}`);
        } catch (e) {
          console.warn(`[moon] ${e}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "moon_bp");
  },
  { namespaces: ["realm"] }
);
