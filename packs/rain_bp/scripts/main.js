import { CommandPermissionLevel, CustomCommandStatus, Dimension, Player, WeatherType, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get, getFor, onChange, setFor } from "./settings.js";

const PROP_WEATHER = "rain:weather"; // world: overworld weather from the last change ("Clear", "Rain" or "Thunder"); scripts can't read the current weather
// Player property "rain:off" (true = extras off, false = on, only stored when it differs from defaultOff)
// is the "off" preference in settings.js, which /realm:prefs changes too.

const OVERWORLD = "minecraft:overworld";
const MIST = "realm:rain_mist"; // particles, fogs and sounds come from the Realistic Rain resource pack
const DRIP = "realm:rain_drip";
const FOG_ID = "rain_storm"; // ids of our /fog entries, so only ours are ever removed
const HAZE_ID = "rain_gloom";
const STORM_FOGS = ["realm:rain_storm_1", "realm:rain_storm_2", "realm:rain_storm"]; // lightest → densest
// Vibrant Visuals haze: only volumetric fog, which Fancy ignores, so it layers under the storm fogs unchanged.
const HAZE_FOGS = ["realm:rain_gloom_1", "realm:rain_gloom"];
const WIND = "realm.storm.wind";
const WIND_INSIDE = "realm.storm.wind_inside";
const ROOF = "realm.rain.roof";
const BED = "realm.storm.bed";
const BED_INSIDE = "realm.storm.bed_inside";
const RAIN = "ambient.weather.rain"; // the game's own rain sound (Realistic Rain's clips)
const RAIN_INSIDE = "realm.rain.inside";
const WIND_EVERY = 8; // seconds between wind plays: the clips are 10 s with 2 s crossfades
const ROOF_EVERY = 3; // the roof clips are 3.6 s
const BED_EVERY = 18; // the thunderstorm clips are 20 s with 2 s crossfades
const INSIDE_EVERY = 18; // the muffled rain clips are 20 s with 2 s crossfades

// Performance: the loop only exists while there's something to do, runs 4 times a second and handles a
// quarter of the players each time, so every player costs about one update per second.
const RUN_TICKS = 5;
const GROUPS = 4;
const UPDATE_SECONDS = (RUN_TICKS * GROUPS) / 20; // how often each player is updated
const MAX_SPOTS = 8; // drip spots remembered per player
const RESCAN_DISTANCE = 4; // forget a player's drip spots once they move this far (blocks)
const MAX_HEADROOM = 24; // deeper underground than this, there's no rain to see
const DRY_GROUND = /sand|terracotta|snow|ice/; // deserts and badlands get no rain; snowy places get snow
const SIDES = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {"out" | "in" | "none"} Place where the player hears the weather from: outdoors (or under a tree), indoors, or out of its reach */
/**
 * @typedef {{ group: number, fog: number, haze: number, spots: Vector3[], scannedAt?: Vector3, dripDebt: number, mistDebt: number,
 *   windIn: number, roofIn: number, bedIn: number, insideIn: number, place: Place, muffle: boolean }} State muffle: stop the game's rain for this player
 */
/** @typedef {{ level: number, stepIn: number }} Roll a fog that rolls in or out in steps */

/** @type {WeatherType} */
let weather = WeatherType.Clear;
/** @type {Roll} 0 = no storm fog, 1–3 = step in STORM_FOGS */
const storm = { level: 0, stepIn: 0 };
/** @type {Roll} 0 = no haze, 1–2 = step in HAZE_FOGS */
const haze = { level: 0, stepIn: 0 };
let dripSeconds = 0; // seconds of after-rain drips left
/** @type {number | undefined} */
let loop;
let run = 0;
let nextGroup = 0;
/** @type {Map<string, State>} player id → state */
const players = new Map();

/** @param {Player} player */
function extrasOff(player) {
  return getFor(player, "off") === true;
}

/** @param {Player} player @returns {State} */
function stateOf(player) {
  let st = players.get(player.id);
  if (!st) players.set(player.id, (st = { group: nextGroup++ % GROUPS, fog: 0, haze: 0, spots: [], dripDebt: 0, mistDebt: 0, windIn: 0, roofIn: 0, bedIn: 0, insideIn: 0, place: "none", muffle: false }));
  return st;
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather }) => {
  if (dimension !== OVERWORLD) return;
  if (newWeather === WeatherType.Clear && weather !== WeatherType.Clear) dripSeconds = CONFIG.drips.afterRainSeconds;
  weather = newWeather;
  try {
    world.setDynamicProperty(PROP_WEATHER, newWeather);
  } catch (e) {
    console.warn(`[rain] ${e}`);
  }
  wake();
});

world.afterEvents.worldLoad.subscribe(() => {
  const saved = world.getDynamicProperty(PROP_WEATHER);
  if (saved === WeatherType.Rain || saved === WeatherType.Thunder) weather = saved;
  // After a script reload our fogs may still be on players we no longer track: clear them, the loop re-adds them.
  for (const player of world.getAllPlayers()) clearFogs(player);
  wake();
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  // Our fogs can survive a relog: clear them, and the loop puts back whatever the weather calls for.
  clearFogs(player);
  const st = stateOf(player);
  st.fog = 0;
  st.haze = 0;
  wake();
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => players.delete(playerId));

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

function needsLoop() {
  if (weather !== WeatherType.Clear || dripSeconds > 0 || storm.level > 0 || haze.level > 0) return true;
  for (const st of players.values()) if (st.fog > 0 || st.haze > 0) return true;
  return false;
}

function wake() {
  if (loop === undefined && needsLoop()) loop = system.runInterval(tick, RUN_TICKS);
}

function tick() {
  const dt = RUN_TICKS / 20;
  if (weather === WeatherType.Clear) dripSeconds = Math.max(0, dripSeconds - dt);
  const raining = weather !== WeatherType.Clear;
  step(storm, get("stormFog.enabled") && weather === WeatherType.Thunder ? STORM_FOGS.length : 0, STORM_FOGS.length, CONFIG.stormFog.fadeSeconds, dt);
  step(haze, get("haze.enabled") && raining ? HAZE_FOGS.length : 0, HAZE_FOGS.length, CONFIG.haze.fadeSeconds, dt);
  const group = run++ % GROUPS;
  for (const player of world.getAllPlayers()) {
    const st = stateOf(player);
    if (st.group === group) {
      try {
        update(player, st);
      } catch (e) {
        console.warn(`[rain] ${e}`); // usually an unloaded chunk at the edge of the world
      }
    }
    // Muffled rain indoors: the game starts a rain clip every 2-4 ticks, wherever you are. Stopping them every run
    // (4 times a second) leaves only clips under 0.25 s old, still in Realistic Rain's 0.8 s fade-in, so nearly silent.
    if (st.muffle && raining) stopSound(player, RAIN);
  }
  if (!needsLoop() && loop !== undefined) {
    system.clearRun(loop);
    loop = undefined;
  }
}

/** Steps a fog toward `target`: the first step at once, the last after fadeSeconds. @param {Roll} roll */
function step(roll, /** @type {number} */ target, /** @type {number} */ steps, /** @type {number} */ fadeSeconds, /** @type {number} */ dt) {
  if (roll.level === target) {
    roll.stepIn = 0;
    return;
  }
  roll.stepIn -= dt;
  if (roll.stepIn > 0) return;
  roll.level += Math.sign(target - roll.level);
  roll.stepIn = fadeSeconds / Math.max(1, steps - 1);
}

/** One player's second: fogs, then mist, drips and sounds around them. @param {Player} player @param {State} st */
function update(player, st) {
  st.muffle = false;
  const off = extrasOff(player);
  const fog = off ? 0 : storm.level;
  if (st.fog !== fog) setFog(player, st, fog);
  if (off || player.dimension.id !== OVERWORLD) {
    leave(player, st); // no haze in the Nether or the End: it would replace their own volumetric fog
    return;
  }

  const raining = weather !== WeatherType.Clear;
  if (!raining && dripSeconds <= 0 && haze.level === 0 && st.haze === 0) return;
  const budget = { lookups: CONFIG.drips.lookupsPerSecond };
  const feet = player.location;
  const here = topmost(player.dimension, feet.x, feet.z, budget);
  if (here && raining && here.location.y - feet.y > MAX_HEADROOM && !DRY_GROUND.test(here.typeId)) st.muffle = get("roof.muffleRain"); // deep underground: no rain to hear
  if (!here || DRY_GROUND.test(here.typeId) || here.location.y - feet.y > MAX_HEADROOM) {
    leave(player, st); // deserts, badlands and snow get no rain; caves get none of the haze
    return;
  }
  if (st.haze !== haze.level) setHaze(player, st, haze.level);

  const above = here.location.y - Math.floor(feet.y); // 0 or 1: grass or a fence at your side; 2+: over your head
  const outdoors = above < 2;
  const underTree = !outdoors && here.typeId.includes("leaves");
  const nearGround = feet.y - here.location.y < 6;
  if (get("mist.enabled") && weather === WeatherType.Thunder && outdoors && nearGround) mist(player, st, feet, budget);
  if (get("drips.enabled")) drips(player, st, feet, raining, budget);
  if (!raining) return;
  const place = outdoors || underTree ? "out" : "in";
  st.muffle = place === "in" && get("roof.muffleRain");
  sounds(player, st, place, !outdoors && !underTree && above <= CONFIG.roof.maxHeadroom);
}

/** Out of the rain's reach (another dimension, underground, a desert, extras off): no haze, no weather sounds. @param {Player} player @param {State} st */
function leave(player, st) {
  if (st.haze) setHaze(player, st, 0);
  if (st.place !== "none") stopSounds(player, st);
}

/** Highest block in a column, or undefined when out of budget or unloaded. @param {Dimension} dimension @param {{ lookups: number }} budget */
function topmost(dimension, /** @type {number} */ x, /** @type {number} */ z, budget) {
  if (budget.lookups <= 0) return undefined;
  budget.lookups--;
  try {
    return dimension.getTopmostBlock({ x: Math.floor(x), z: Math.floor(z) });
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Storm fog
// ---------------------------------------------------------------------------

/** @param {Player} player */
/** @param {Player} player @param {string} id */
function removeFog(player, id) {
  try {
    player.runCommand(`fog @s remove ${id}`);
  } catch (e) {
    console.warn(`[rain] /fog: ${e}`);
  }
}

/** @param {Player} player */
function clearFogs(player) {
  removeFog(player, FOG_ID);
  removeFog(player, HAZE_ID);
}

/** @param {Player} player @param {string} fogId @param {string} id */
function pushFog(player, fogId, id) {
  try {
    player.runCommand(`fog @s push ${fogId} ${id}`);
  } catch (e) {
    console.warn(`[rain] /fog: ${e}`);
  }
}

/** @param {Player} player @param {State} st @param {number} level 0 = none */
function setFog(player, st, level) {
  removeFog(player, FOG_ID);
  if (level > 0) pushFog(player, STORM_FOGS[level - 1], FOG_ID);
  st.fog = level; // even after an error, so a broken /fog isn't retried every second
}

/** @param {Player} player @param {State} st @param {number} level 0 = none */
function setHaze(player, st, level) {
  removeFog(player, HAZE_ID);
  if (level > 0) pushFog(player, HAZE_FOGS[level - 1], HAZE_ID);
  st.haze = level;
}

// ---------------------------------------------------------------------------
// Wind and rain on the roof (Player.playSound: only that player hears them)
// ---------------------------------------------------------------------------

/** @param {Player} player @param {State} st @param {Place} place @param {boolean} roofNear a roof low enough to hear the rain on it */
function sounds(player, st, place, roofNear) {
  if (place !== st.place) {
    // Walking in or out: cut the wind and storm sound you were hearing and start the other ones now.
    if (st.place !== "none") stopSounds(player, st);
    st.place = place;
    st.windIn = 0;
    st.roofIn = 0;
    st.bedIn = 0;
    st.insideIn = 0;
  }
  st.windIn -= UPDATE_SECONDS;
  st.roofIn -= UPDATE_SECONDS;
  st.bedIn -= UPDATE_SECONDS;
  st.insideIn -= UPDATE_SECONDS;
  if (st.muffle && st.insideIn <= 0) {
    const volume = get("roof.volume");
    if (volume > 0) player.playSound(RAIN_INSIDE, { volume });
    st.insideIn = INSIDE_EVERY;
  }
  if (weather === WeatherType.Thunder && get("stormSound.enabled") && st.bedIn <= 0) {
    const volume = get("stormSound.volume");
    if (volume > 0) player.playSound(place === "out" ? BED : BED_INSIDE, { volume });
    st.bedIn = BED_EVERY;
  }
  if (get("wind.enabled") && st.windIn <= 0) {
    const volume = weather === WeatherType.Thunder ? get("wind.inThunder") : get("wind.inRain");
    if (volume > 0) player.playSound(place === "out" ? WIND : WIND_INSIDE, { volume });
    st.windIn = WIND_EVERY;
  }
  if (roofNear && get("roof.enabled") && st.roofIn <= 0) {
    const volume = get("roof.volume");
    if (volume > 0) player.playSound(ROOF, { volume });
    st.roofIn = ROOF_EVERY;
  }
}

/** @param {Player} player @param {State} st */
function stopSounds(player, st) {
  for (const id of [WIND, WIND_INSIDE, BED, BED_INSIDE, RAIN_INSIDE]) stopSound(player, id);
  st.place = "none";
}

/** @param {Player} player @param {string} id */
function stopSound(player, id) {
  try {
    player.runCommand(`stopsound @s ${id}`);
  } catch (e) {
    console.warn(`[rain] /stopsound: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Mist and drips (spawned with Player.spawnParticle: only that player sees them)
// ---------------------------------------------------------------------------

/** A few puffs of mist on the ground 5–9 blocks away, in front of the player. @param {Player} player @param {State} st @param {Vector3} feet @param {{ lookups: number }} budget */
function mist(player, st, feet, budget) {
  st.mistDebt += CONFIG.mist.puffsPerSecond;
  const view = player.getViewDirection();
  const facing = Math.atan2(view.z, view.x);
  for (; st.mistDebt >= 1; st.mistDebt--) {
    const angle = facing + (Math.random() - 0.5) * 2.4; // within about 70° of where they look
    const d = 5 + Math.random() * 4;
    const x = feet.x + Math.cos(angle) * d, z = feet.z + Math.sin(angle) * d;
    const ground = topmost(player.dimension, x, z, budget);
    if (!ground) continue;
    const y = ground.location.y + 1.25;
    if (Math.abs(y - feet.y) > 4) continue; // treetops, cliffs and pits
    player.spawnParticle(MIST, { x, y, z });
  }
}

/** @param {Player} player @param {State} st @param {Vector3} feet @param {boolean} raining @param {{ lookups: number }} budget */
function drips(player, st, feet, raining, budget) {
  const scanned = st.scannedAt;
  if (!scanned || (scanned.x - feet.x) ** 2 + (scanned.z - feet.z) ** 2 > RESCAN_DISTANCE ** 2) {
    st.spots = [];
    st.scannedAt = { ...feet };
  }
  // Look for new spots only while it rains; after the rain, known spots finish dripping.
  const r = CONFIG.drips.radius;
  while (raining && budget.lookups > 0 && st.spots.length < MAX_SPOTS) {
    const spot = probe(player.dimension, Math.floor(feet.x + (Math.random() * 2 - 1) * r), Math.floor(feet.z + (Math.random() * 2 - 1) * r), feet.y, budget);
    if (spot) st.spots.push(spot);
  }
  if (!st.spots.length) {
    st.dripDebt = 0;
    return;
  }
  const after = CONFIG.drips.afterRainSeconds > 0 ? dripSeconds / CONFIG.drips.afterRainSeconds : 0;
  st.dripDebt = Math.min(st.dripDebt + CONFIG.drips.perSecond * (raining ? 1 : after), CONFIG.drips.perSecond);
  for (; st.dripDebt >= 1; st.dripDebt--) {
    const spot = st.spots[Math.floor(Math.random() * st.spots.length)];
    player.spawnParticle(DRIP, spot); // each drop hangs 0.2–1.2 s before it falls, so they don't fall together
  }
}

/**
 * Where water would drip in this column: under the lowest leaves of a canopy, or just off a roof edge.
 * @param {Dimension} dimension @param {number} x @param {number} z @param {number} feetY @param {{ lookups: number }} budget
 * @returns {Vector3 | undefined}
 */
function probe(dimension, x, z, feetY, budget) {
  const top = topmost(dimension, x, z, budget);
  if (!top) return undefined;
  const y = top.location.y;
  if (y < feetY + 1 || y > feetY + 12) return undefined; // only overhead, within sight
  if (top.typeId.includes("leaves")) {
    // Walk down through the canopy (at most 3 blocks) to the leaves with air below.
    let low = top;
    for (let i = 0; i < 3 && budget.lookups > 0; i++) {
      budget.lookups--;
      const below = low.below();
      if (!below) return undefined;
      if (below.isAir) return { x: x + 0.15 + Math.random() * 0.7, y: low.location.y - 0.02, z: z + 0.15 + Math.random() * 0.7 };
      if (!below.typeId.includes("leaves")) return undefined; // trunk or wall underneath
      low = below;
    }
    return undefined;
  }
  if (top.isAir || top.isLiquid) return undefined;
  // A roof or overhang drips off an edge where the next column is at least 2 blocks lower.
  const side = SIDES[Math.floor(Math.random() * SIDES.length)];
  const next = topmost(dimension, x + side.x, z + side.z, budget);
  if (!next || next.location.y >= y - 1) return undefined;
  return { x: x + 0.5 + side.x * 0.56, y: y - 0.02, z: z + 0.5 + side.z * 0.56 };
}

// ---------------------------------------------------------------------------
// /realm:rain, and changes from Realm Settings
// ---------------------------------------------------------------------------

/** Applies a player's on/off right away: their fogs and sounds follow, their drip spots are dropped. @param {Player} player */
function applyChoice(player) {
  const off = extrasOff(player);
  const st = stateOf(player);
  if (off) {
    st.spots = [];
    leave(player, st);
  }
  const fog = off ? 0 : storm.level;
  if (st.fog !== fog) setFog(player, st, fog);
  wake();
}

// A player's own switch (/realm:rain, /realm:prefs), or the realm's defaultOff for everyone who never chose.
onChange((key, player) => {
  if (player && key === "off") applyChoice(player);
  else if (!player && (key === "defaultOff" || key === "*")) for (const p of world.getAllPlayers()) applyChoice(p);
});

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  try {
    customCommandRegistry.registerCommand(
      {
        name: "realm:rain",
        description: "Enable or disable the rain extras (fog, haze, mist, drips and sounds) for yourself",
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false,
      },
      (origin) => {
        const player = origin.initiator ?? origin.sourceEntity;
        if (!(player instanceof Player)) {
          return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
        }
        const nowOff = !extrasOff(player);
        system.run(() => setFor(player, "off", nowOff));
        return {
          status: CustomCommandStatus.Success,
          message: nowOff
            ? "Rain extras (fog, haze, mist, drips and sounds): Disabled. Run /realm:rain again to enable them."
            : "Rain extras (fog, haze, mist, drips and sounds): Enabled. Run /realm:rain again to disable them.",
        };
      }
    );
  } catch (e) {
    // The extras keep working without the command, with defaultOff for everyone.
    console.warn(`[rain] /realm:rain not registered: ${e}`);
  }
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "rain_bp");
  },
  { namespaces: ["realm"] }
);
