import { BlockVolume, CommandPermissionLevel, CustomCommandStatus, Dimension, EquipmentSlot, MolangVariableMap, Player, WeatherType, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get, getFor, onChange, setFor } from "./settings.js";

const PROP_WEATHER = "climate:weather"; // world: overworld weather at the last change; scripts can't read the current weather
const PROP_DRY = "climate:dry"; // world: when the last rain ended (ms), for fog banks
const PROP_SEEN = "climate:seen"; // player: conditions already sent to the Journal, "sandstorm,blizzard"

const OVERWORLD = "minecraft:overworld";
const FOG_ID = "climate_sky"; // our /fog entry's name, so only ours is ever removed
const RUN_TICKS = 10;
const GROUPS = 2; // each player is updated every RUN_TICKS * GROUPS = 20 ticks, once a second
const SLOW_TICKS = 40; // Slowness we give lasts 2 s and is refreshed every second
const CAMPFIRE_EVERY = 60; // ticks between campfire scans for a player in a blizzard
const WATER_EVERY = 100; // ticks between water scans for a player who might be in a fog bank
const NOTICE_EVERY = 2400; // ticks: the note above the hotbar at most once in 2 minutes per condition
const SAND = /sand|terracotta|cactus|dead_bush/; // deserts and badlands (glazed terracotta is player-made: excluded below)
const SNOW = /snow|ice/; // snow layers, snow blocks, powder snow, ice: snowy places
const CAMPFIRES = ["minecraft:campfire", "minecraft:soul_campfire"];
const WATER = ["minecraft:water", "minecraft:flowing_water"];

/** @typedef {"" | "sandstorm" | "blizzard" | "fogbank"} Cond */
/** @type {Record<Exclude<Cond, "">, { fog: string, particle: string, label: string, note: string }>} */
const KINDS = {
  sandstorm: { fog: "realm:sky_sandstorm", particle: "realm:sky_sand", label: "Sandstorm", note: "§6Sandstorm! §7A helmet keeps the sand out of your eyes." },
  blizzard: { fog: "realm:sky_blizzard", particle: "realm:sky_snow", label: "Blizzard", note: "§fBlizzard! §7Get under a roof or near a lit campfire." },
  fogbank: { fog: "realm:sky_fogbank", particle: "realm:sky_fogbank", label: "Fog bank", note: "§7A fog bank rolls in off the water." },
};

/**
 * @typedef {{ group: number, cond: Cond, until: number, fog: string, debt: number,
 *   fireAt: number, fire: boolean, waterAt: number, water: boolean, noted: Record<string, number> }} State
 * cond: the condition the player is in; until: tick it lingers to after it was last seen;
 * fog: the fog id we pushed for them ("" = none); fire / water: cached scans and when they ran.
 */

/** @type {WeatherType} */
let weather = WeatherType.Clear;
let dryAt = 0;
let windAngle = Math.random() * Math.PI * 2;
/** @type {number | undefined} */
let loop;
let run = 0;
let nextGroup = 0;
/** @type {Map<string, State>} */
const players = new Map();

/** @param {Player} player @returns {State} */
function stateOf(player) {
  let st = players.get(player.id);
  if (!st) {
    st = { group: nextGroup++ % GROUPS, cond: "", until: 0, fog: "", debt: 0, fireAt: -1e9, fire: false, waterAt: -1e9, water: false, noted: {} };
    players.set(player.id, st);
  }
  return st;
}

// ---------------------------------------------------------------------------
// Weather tracking
// ---------------------------------------------------------------------------

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather, previousWeather }) => {
  if (dimension !== OVERWORLD) return;
  const wasWet = weather !== WeatherType.Clear || previousWeather !== WeatherType.Clear;
  weather = newWeather;
  try {
    world.setDynamicProperty(PROP_WEATHER, newWeather);
    if (newWeather === WeatherType.Clear && wasWet) {
      dryAt = Date.now();
      world.setDynamicProperty(PROP_DRY, dryAt);
    }
  } catch (e) {
    console.warn(`[climate] ${e}`);
  }
  wake();
});

world.afterEvents.worldLoad.subscribe(() => {
  try {
    const saved = world.getDynamicProperty(PROP_WEATHER);
    if (saved === WeatherType.Rain || saved === WeatherType.Thunder) weather = saved;
    const dry = world.getDynamicProperty(PROP_DRY);
    if (typeof dry === "number") dryAt = dry;
  } catch (e) {
    console.warn(`[climate] ${e}`);
  }
  // After a script reload our fog may still be on players we no longer track: clear it, the loop puts it back.
  for (const player of world.getAllPlayers()) removeFog(player);
  wake();
});

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  removeFog(player); // a fog can survive a relog
  const st = stateOf(player);
  st.fog = "";
  st.cond = "";
  wake();
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => players.delete(playerId));

// ---------------------------------------------------------------------------
// The loop: only while it rains, during the fog bank window after rain, or while someone still has our fog
// ---------------------------------------------------------------------------

const wet = () => weather !== WeatherType.Clear;
const fogWindowOpen = () => dryAt > 0 && Date.now() - dryAt < Math.max(0, Number(get("fogbank.minutesAfterRain")) || 0) * 60000;

function needsLoop() {
  if (get("enabled") === true && (wet() || (get("fogbank.enabled") === true && fogWindowOpen()))) return true;
  for (const st of players.values()) if (st.fog || st.cond) return true;
  return false;
}

function wake() {
  if (loop === undefined && needsLoop()) loop = system.runInterval(tick, RUN_TICKS);
}

function tick() {
  windAngle += (((Number(CONFIG.wind.turnDegrees) || 0) * Math.PI) / 180) * (RUN_TICKS / 20);
  const group = run++ % GROUPS;
  for (const player of world.getAllPlayers()) {
    const st = stateOf(player);
    if (st.group !== group) continue;
    try {
      update(player, st);
    } catch (e) {
      console.warn(`[climate] ${e}`); // usually an unloaded chunk at the edge of the world
    }
  }
  if (!needsLoop() && loop !== undefined) {
    system.clearRun(loop);
    loop = undefined;
  }
}

/** Is time of day `t` in [from, to], wrapping past midnight? @param {number} t @param {number} from @param {number} to */
const inWindow = (t, from, to) => (from <= to ? t >= from && t <= to : t >= from || t <= to);

/** @param {Dimension} dimension @param {number} x @param {number} z */
function topmost(dimension, x, z) {
  try {
    return dimension.getTopmostBlock({ x: Math.floor(x), z: Math.floor(z) });
  } catch {
    return undefined;
  }
}

/** One player's second. @param {Player} player @param {State} st */
function update(player, st) {
  const now = system.currentTick;
  const found = detect(player, st);
  if (found) {
    st.until = now + Math.max(0, Number(CONFIG.lingerSeconds) || 0) * 20;
    if (found !== st.cond) enter(player, st, found);
  } else if (st.cond && (now >= st.until || get("enabled") !== true || player.dimension.id !== OVERWORLD)) {
    st.cond = "";
  }

  const cond = st.cond;
  const visuals = getFor(player, "visuals") !== false;
  const fog = cond && visuals ? KINDS[cond].fog : "";
  if (fog !== st.fog) setFog(player, st, fog);
  if (!cond) return;
  if (visuals) particles(player, st, cond);
  if (get("slowness") === true && (cond === "blizzard" || (cond === "sandstorm" && !(get("sandstorm.helmetProtects") === true && helmet(player))))) slow(player);
}

/** The condition where the player stands now, before lingering. @param {Player} player @param {State} st @returns {Cond} */
function detect(player, st) {
  if (get("enabled") !== true || player.dimension.id !== OVERWORLD) return "";
  const raining = wet();
  const fb = !raining && get("fogbank.enabled") === true && fogWindowOpen() && inWindow(world.getTimeOfDay(), CONFIG.fogbank.fromTime, CONFIG.fogbank.toTime);
  if (!raining && !fb) return "";
  const feet = player.location;
  const top = topmost(player.dimension, feet.x, feet.z);
  if (!top) return "";
  const outdoors = top.location.y - Math.floor(feet.y) < 2; // nothing 2+ blocks over your head
  if (!outdoors) return "";
  if (raining) {
    // The ground under you, or a column nearby, so a single odd block doesn't decide it.
    const near = topmost(player.dimension, feet.x + (Math.random() * 2 - 1) * 4, feet.z + (Math.random() * 2 - 1) * 4);
    const ids = [top.typeId, near?.typeId ?? ""];
    if (get("sandstorm.enabled") === true && ids.some((id) => SAND.test(id) && !id.includes("glazed"))) return "sandstorm";
    if (get("blizzard.enabled") === true && ids.some((id) => SNOW.test(id)) && !nearCampfire(player, st)) return "blizzard";
    return "";
  }
  if (feet.y >= CONFIG.fogbank.maxY) return "";
  return nearWater(player, st) ? "fogbank" : "";
}

/** A lit campfire within blizzard.campfireRadius (scanned every 3 s). @param {Player} player @param {State} st */
function nearCampfire(player, st) {
  const now = system.currentTick;
  if (now - st.fireAt < CAMPFIRE_EVERY) return st.fire;
  st.fireAt = now;
  st.fire = false;
  const r = Math.max(1, Math.min(8, Math.floor(Number(get("blizzard.campfireRadius")) || 4)));
  const x = Math.floor(player.location.x), y = Math.floor(player.location.y), z = Math.floor(player.location.z);
  const dim = player.dimension;
  try {
    const found = dim.getBlocks(new BlockVolume({ x: x - r, y: y - r, z: z - r }, { x: x + r, y: y + r, z: z + r }), { includeTypes: CAMPFIRES }, true);
    for (const loc of found.getBlockLocationIterator()) {
      const block = dim.getBlock(loc);
      if (block && block.permutation.getState("extinguished") !== true) {
        st.fire = true;
        break;
      }
    }
  } catch (e) {
    console.warn(`[climate] campfire scan: ${e}`);
  }
  return st.fire;
}

/** Water beside you and no more than fogbank.waterBelow under your feet (scanned every 5 s). @param {Player} player @param {State} st */
function nearWater(player, st) {
  const now = system.currentTick;
  if (now - st.waterAt < WATER_EVERY) return st.water;
  st.waterAt = now;
  const r = Math.max(1, Math.min(12, Math.floor(CONFIG.fogbank.waterRadius)));
  const below = Math.max(0, Math.min(8, Math.floor(CONFIG.fogbank.waterBelow)));
  const x = Math.floor(player.location.x), y = Math.floor(player.location.y), z = Math.floor(player.location.z);
  try {
    st.water = player.dimension.containsBlock(new BlockVolume({ x: x - r, y: y - below, z: z - r }, { x: x + r, y, z: z + r }), { includeTypes: WATER }, true);
  } catch (e) {
    st.water = false;
    console.warn(`[climate] water scan: ${e}`);
  }
  return st.water;
}

/** @param {Player} player */
function helmet(player) {
  try {
    return !!player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Head);
  } catch {
    return false;
  }
}

/** Slowness I for 2 s, unless a stronger or longer Slowness (a potion, another pack) is already on. @param {Player} player */
function slow(player) {
  try {
    const have = player.getEffect("slowness");
    if (have && (have.amplifier > 0 || have.duration > SLOW_TICKS)) return;
    player.addEffect("slowness", SLOW_TICKS, { amplifier: 0, showParticles: false });
  } catch (e) {
    console.warn(`[climate] ${e}`);
  }
}

/** Walking into a condition: a note above the hotbar now and then, and the Journal entry the first time. @param {Player} player @param {State} st @param {Exclude<Cond, "">} cond */
function enter(player, st, cond) {
  st.cond = cond;
  const kind = KINDS[cond];
  const now = system.currentTick;
  if (now - (st.noted[cond] ?? -NOTICE_EVERY) >= NOTICE_EVERY) {
    st.noted[cond] = now;
    try {
      system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: player.id, ticks: 60 }));
      player.onScreenDisplay.setActionBar(kind.note);
    } catch (e) {
      console.warn(`[climate] ${e}`);
    }
  }
  try {
    const raw = player.getDynamicProperty(PROP_SEEN);
    const seen = typeof raw === "string" && raw ? raw.split(",") : [];
    if (seen.includes(cond)) return;
    seen.push(cond);
    player.setDynamicProperty(PROP_SEEN, seen.join(","));
    system.sendScriptEvent("realm:journal", JSON.stringify({ player: player.id, page: "weather", entry: cond, label: kind.label }));
  } catch (e) {
    console.warn(`[climate] ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Fog and particles (only for the player they're for)
// ---------------------------------------------------------------------------

/** @param {Player} player */
function removeFog(player) {
  try {
    player.runCommand(`fog @s remove ${FOG_ID}`);
  } catch (e) {
    console.warn(`[climate] /fog: ${e}`);
  }
}

/** @param {Player} player @param {State} st @param {string} fog "" = none */
function setFog(player, st, fog) {
  if (st.fog) removeFog(player);
  if (fog) {
    try {
      player.runCommand(`fog @s push ${fog} ${FOG_ID}`);
    } catch (e) {
      console.warn(`[climate] /fog: ${e}`);
    }
  }
  st.fog = fog; // even after an error, so a broken /fog isn't retried every second
}

/** Sand or snow blowing past from upwind, or fog puffs on the ground nearby. @param {Player} player @param {State} st @param {Exclude<Cond, "">} cond */
function particles(player, st, cond) {
  const perSecond = Math.max(0, Number(get("particlesPerSecond")) || 0);
  st.debt = Math.min(st.debt + (cond === "fogbank" ? perSecond / 2 : perSecond), Math.max(1, perSecond));
  if (st.debt < 1) return;
  const feet = player.location;
  const speed = Number(CONFIG.wind.speed) || 0;
  const wx = Math.cos(windAngle), wz = Math.sin(windAngle);
  const vars = new MolangVariableMap();
  if (cond !== "fogbank") {
    vars.setFloat("variable.wx", wx * speed);
    vars.setFloat("variable.wz", wz * speed);
  }
  for (; st.debt >= 1; st.debt--) {
    /** @type {{ x: number, y: number, z: number }} */
    let at;
    if (cond === "fogbank") {
      const a = Math.random() * Math.PI * 2, d = 5 + Math.random() * 8;
      at = { x: feet.x + Math.cos(a) * d, y: feet.y + 0.3, z: feet.z + Math.sin(a) * d };
    } else {
      // Upwind of the player, so the burst blows across them.
      at = { x: feet.x - wx * 4 + (Math.random() * 2 - 1) * 4, y: feet.y + 0.5 + Math.random() * 2, z: feet.z - wz * 4 + (Math.random() * 2 - 1) * 4 };
    }
    try {
      player.spawnParticle(KINDS[cond].particle, at, cond === "fogbank" ? undefined : vars);
    } catch {
      // unloaded, or Realm Skies isn't installed: nothing to see
    }
  }
}

// ---------------------------------------------------------------------------
// /realm:climate, and changes from Realm Settings
// ---------------------------------------------------------------------------

onChange((key, player) => {
  // Visuals off take effect at the player's next update; a world switch wakes or winds down the loop.
  if (!player) wake();
});

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:climate",
      description: "Enable or disable the sandstorm, blizzard and fog bank visuals (fog and particles) for yourself",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      const nowOn = getFor(player, "visuals") === false;
      system.run(() => {
        try {
          setFor(player, "visuals", nowOn);
        } catch (e) {
          console.warn(`[climate] ${e}`);
        }
      });
      return {
        status: CustomCommandStatus.Success,
        message: nowOn
          ? "Regional weather visuals (fog and particles): Enabled. Run /realm:climate again to disable them."
          : "Regional weather visuals (fog and particles): Disabled. Run /realm:climate again to enable them. Slowness still applies.",
      };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "climate_bp");
  },
  { namespaces: ["realm"] }
);
