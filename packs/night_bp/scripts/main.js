import "./diag.js";
import { ButtonState, CommandPermissionLevel, CustomCommandStatus, Dimension, InputButton, MolangVariableMap, Player, WeatherType, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get, getFor, setFor } from "./settings.js";
import { onScriptEvent } from "./script-events.js";

const PROP_WEATHER = "night:weather"; // world: overworld weather from the last change; scripts can't read the current weather
const PROP_AURORA = "night:aurora"; // world: JSON { n: day number, on: boolean }, tonight's aurora roll
const PROP_WISH = "night:wish"; // player: the day number of the night they last made a wish
// Player preference "sky" (in "night:pref", see settings.js): the show on or off, set by /realm:night and /realm:prefs.

const OVERWORLD = "minecraft:overworld";
const AURORA = "realm:sky_aurora"; // particles come from the Realm Skies resource pack
const STAR = "realm:sky_star";
const NIGHT_START = 13000;
const NIGHT_END = 23000;
const SNOW_EVERY = 200; // ticks between snowy-ground checks for a player
const SNOWY = /snow|ice/; // snow, snow layers, powder snow, ice, packed and blue ice on top
const AURORA_NORTH = 100; // the curtain hangs this far north of the player...
const AURORA_WIDTH = 180; // ...this wide...
const AURORA_LOW = 60; // ...from this high above them (up to 30 more)
const MAX_Y = 300;

/** @typedef {{ nextStar: number, lastStar: number, auroraIn: number, snowAt: number, snowy: boolean }} State */

/** @type {WeatherType} */
let weather = WeatherType.Clear;
let weatherLoaded = false;
let weatherSeen = false; // a weatherChange came in since the scripts started: newer than the saved weather and any plan
/** @type {Map<string, State>} */
const players = new Map();
/** @type {Set<string>} players sent the journal page this session, as "<entry>:<player id>" */
const journaled = new Set();
let announcedAurora = -1; // the night the aurora was announced
/** One map, made on first use: the stable API may refuse native objects while the world is still loading. @type {MolangVariableMap | undefined} */
let varsMap;
const molang = () => (varsMap ??= new MolangVariableMap()); // reused: spawnParticle copies the values

const rand = (/** @type {number} */ min, /** @type {number} */ max) => min + Math.random() * (max - min);

/** @param {Player} player @returns {State} */
function stateOf(player) {
  let st = players.get(player.id);
  if (!st) players.set(player.id, (st = { nextStar: system.currentTick + Math.round(rand(5, CONFIG.stars.every.min) * 20), lastStar: -Infinity, auroraIn: 0, snowAt: -Infinity, snowy: false }));
  return st;
}

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  players.delete(playerId);
  for (const key of journaled) if (key.endsWith(`:${playerId}`)) journaled.delete(key);
});

// ---------------------------------------------------------------------------
// Weather and night
// ---------------------------------------------------------------------------

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather }) => {
  if (dimension !== OVERWORLD && dimension !== "overworld") return; // the event names it "overworld" on BDS 1.26
  weather = newWeather;
  weatherLoaded = true;
  weatherSeen = true;
  try {
    world.setDynamicProperty(PROP_WEATHER, newWeather);
  } catch (e) {
    console.warn(`[night] ${e}`);
  }
});

/** The overworld weather a realm:weather_plan names right now, or undefined (the Almanac is off, another dimension, garbage). @param {string} message */
function planNow(message) {
  try {
    const m = JSON.parse(message);
    if (!m || m.off === true) return undefined;
    const dim = m.dim ?? m.dimension;
    if (typeof dim === "string" && dim.replace(/^minecraft:/, "") !== "overworld") return undefined;
    return m.now === WeatherType.Clear || m.now === WeatherType.Rain || m.now === WeatherType.Thunder ? /** @type {WeatherType} */ (m.now) : undefined;
  } catch {
    return undefined;
  }
}

// The Weather Almanac (if it's installed) knows the weather now: it sends its plan when it changes and answers
// realm:weather_ask. Until a real weatherChange has come in, a pack added in the middle of a storm takes it from there.
onScriptEvent("realm:weather_plan", ({ message }) => {
  if (weatherSeen) return; // the game's own report is newer
  const now = planNow(message);
  if (!now || now === weather) return;
  weather = now;
  weatherLoaded = true; // what the plan says is newer than the saved weather
  try {
    world.setDynamicProperty(PROP_WEATHER, now);
  } catch (e) {
    console.warn(`[night] ${e}`);
  }
});

// Ask the Weather Almanac (if it's installed) for its plan a little later: every weather pack asks, and it answers once.
world.afterEvents.worldLoad.subscribe(() => system.runTimeout(() => system.sendScriptEvent("realm:weather_ask", "{}"), 100));

function loadWeather() {
  if (weatherLoaded) return;
  const saved = world.getDynamicProperty(PROP_WEATHER);
  if (saved === WeatherType.Rain || saved === WeatherType.Thunder) weather = saved;
  weatherLoaded = true;
}

/** Tonight's number (the day count), or undefined in the daytime. */
function tonight() {
  const tod = world.getTimeOfDay();
  return tod >= NIGHT_START && tod < NIGHT_END ? world.getDay() : undefined;
}

/** Is tonight an aurora night? Rolled once a night and saved, so a restart keeps it. @param {number} night */
function auroraNight(night) {
  try {
    const raw = world.getDynamicProperty(PROP_AURORA);
    const saved = typeof raw === "string" ? JSON.parse(raw) : undefined;
    if (saved && saved.n === night) return saved.on === true;
  } catch {
    // corrupt: roll again
  }
  const on = Math.random() < get("aurora.chance");
  world.setDynamicProperty(PROP_AURORA, JSON.stringify({ n: night, on }));
  return on;
}

// ---------------------------------------------------------------------------
// The show, once a second for each player outdoors in the Overworld
// ---------------------------------------------------------------------------

system.runInterval(() => {
  try {
    if (!get("enabled")) return;
    loadWeather();
    if (weather !== WeatherType.Clear) return;
    const night = tonight();
    if (night === undefined) return;
    const aurora = get("aurora.enabled") && auroraNight(night);
    const dim = world.getDimension(OVERWORLD);
    for (const player of dim.getPlayers()) {
      try {
        if (getFor(player, "sky") !== true) continue;
        show(player, dim, night, aurora);
      } catch (e) {
        console.warn(`[night] ${e}`);
      }
    }
  } catch (e) {
    console.warn(`[night] ${e}`);
  }
}, 20);

/** @param {Player} player @param {Dimension} dim @param {number} night @param {boolean} aurora */
function show(player, dim, night, aurora) {
  const st = stateOf(player);
  const l = player.location;
  let top;
  try {
    top = dim.getTopmostBlock({ x: Math.floor(l.x), z: Math.floor(l.z) });
  } catch {
    return;
  }
  // Outdoors: nothing (not even leaves) over the player's head.
  if (top && top.location.y > Math.floor(l.y) + 1) return;
  const now = system.currentTick;
  if (get("stars.enabled") && now >= st.nextStar) {
    st.nextStar = now + Math.round(rand(CONFIG.stars.every.min, CONFIG.stars.every.max) * 20);
    if (star(player)) {
      st.lastStar = now;
      journal(player, "shooting_star", "Shooting star");
    }
  }
  if (!aurora) return;
  if (now - st.snowAt >= SNOW_EVERY) {
    st.snowAt = now;
    st.snowy = snowyAround(dim, l.x, l.z);
  }
  if (!st.snowy) return;
  st.auroraIn--;
  if (st.auroraIn > 0) return;
  st.auroraIn = CONFIG.aurora.refreshSeconds;
  if (curtain(player, now / 20)) {
    journal(player, "aurora", "Aurora");
    if (announcedAurora !== night) {
      announcedAurora = night;
      system.sendScriptEvent("realm:sky_event", JSON.stringify({ kind: "aurora", dim: OVERWORLD, text: "Northern lights over the snow tonight" }));
    }
  }
}

/** Snow or ice on top under the player or at 4 points snowRadius away. @param {Dimension} dim @param {number} x @param {number} z */
function snowyAround(dim, x, z) {
  const r = CONFIG.aurora.snowRadius;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    try {
      const top = dim.getTopmostBlock({ x: Math.floor(x + dx), z: Math.floor(z + dz) });
      if (top && SNOWY.test(top.typeId)) return true;
    } catch {
      // unloaded
    }
  }
  return false;
}

/** @param {Player} player @param {string} entry @param {string} label */
function journal(player, entry, label) {
  const key = `${entry}:${player.id}`;
  if (journaled.has(key)) return;
  journaled.add(key);
  system.sendScriptEvent("realm:journal", JSON.stringify({ player: player.id, page: "weather", entry, label }));
}

/**
 * A shooting star high in the sky 60-100 blocks away, mostly in front of the player, crossing in a
 * random direction. @param {Player} player @returns {boolean} whether it was shown
 */
function star(player) {
  const l = player.location;
  const view = player.getViewDirection();
  const facing = Math.atan2(view.z, view.x);
  const angle = Math.random() < 0.7 ? facing + rand(-1, 1) : Math.random() * Math.PI * 2;
  const heading = Math.random() * Math.PI * 2;
  const speed = rand(35, 55);
  const life = rand(0.8, 1.3);
  molang().setFloat("variable.dx", Math.cos(heading) * speed);
  molang().setFloat("variable.dy", -rand(5, 15));
  molang().setFloat("variable.dz", Math.sin(heading) * speed);
  molang().setFloat("variable.life", life);
  const d = rand(60, 100);
  for (const k of [1, 0.6, 0.4]) {
    try {
      const at = { x: l.x + Math.cos(angle) * d * k, y: Math.min(MAX_Y, l.y + rand(50, 80) * k), z: l.z + Math.sin(angle) * d * k };
      player.spawnParticle(STAR, at, molang());
      return true;
    } catch {
      // not loaded there: try closer
    }
  }
  return false;
}

/**
 * The aurora: a row of ribbon segments across the northern sky (north is -z), waving north and south
 * and up and down, the hue drifting from green to purple along it and over time.
 * @param {Player} player @param {number} time seconds @returns {boolean} whether it was shown
 */
function curtain(player, time) {
  const l = player.location;
  const n = Math.max(1, CONFIG.aurora.segments);
  const life = CONFIG.aurora.refreshSeconds + 2;
  let shown = false;
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : i / (n - 1);
    const x = (f - 0.5) * AURORA_WIDTH;
    const wave = Math.sin(f * 5 + time * 0.15);
    const size = 34 + 8 * Math.sin(f * 7 + time * 0.2);
    molang().setFloat("variable.life", life);
    molang().setFloat("variable.hue", Math.max(0, Math.min(1, 0.3 + 0.3 * Math.sin(time * 0.05) + 0.25 * Math.sin(f * 4 + time * 0.1))));
    // Each segment on its own: one that isn't loaded that far out is drawn closer (and smaller, so it looks the same),
    // and the others are never drawn twice.
    for (const k of [1, 0.6, 0.4]) {
      molang().setFloat("variable.size", size * k);
      const at = {
        x: l.x + x * k,
        y: Math.min(MAX_Y, l.y + (AURORA_LOW + 15 + 15 * Math.sin(f * 3 + time * 0.1)) * k),
        z: l.z - (AURORA_NORTH + 15 * wave) * k,
      };
      try {
        player.spawnParticle(AURORA, at, molang());
        shown = true;
        break;
      } catch {
        // not loaded that far: try closer
      }
    }
  }
  return shown;
}

// ---------------------------------------------------------------------------
// Wishes: sneak just after a shooting star
// ---------------------------------------------------------------------------

world.afterEvents.playerButtonInput.subscribe(
  ({ player }) => {
    try {
      if (!get("wish.enabled")) return;
      const st = players.get(player.id);
      if (!st || system.currentTick - st.lastStar > get("wish.windowSeconds") * 20) return;
      const night = tonight();
      if (night === undefined || player.getDynamicProperty(PROP_WISH) === night) return;
      player.setDynamicProperty(PROP_WISH, night);
      st.lastStar = -Infinity;
      player.addEffect(CONFIG.wish.effect, CONFIG.wish.minutes * 1200, { amplifier: 0, showParticles: false });
      player.sendMessage("§bYou made a wish.");
      player.playSound("random.orb", { pitch: 1.5 });
    } catch (e) {
      console.warn(`[night] ${e}`);
    }
  },
  { buttons: [InputButton.Sneak], state: ButtonState.Pressed }
);

// ---------------------------------------------------------------------------
// /realm:night
// ---------------------------------------------------------------------------

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:night",
      description: "Aurora & Shooting Stars: enable or disable the night sky show for yourself",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      const on = getFor(player, "sky") !== true;
      system.run(() => {
        try {
          setFor(player, "sky", on);
        } catch (e) {
          console.warn(`[night] ${e}`);
        }
      });
      return {
        status: CustomCommandStatus.Success,
        message: on
          ? "Night sky (aurora and shooting stars): Enabled. Run /realm:night again to disable it."
          : "Night sky (aurora and shooting stars): Disabled. Run /realm:night again to enable it.",
      };
    }
  );
});

// ---------------------------------------------------------------------------
// Story requests: realm:sky_request { kind: "shooting_star", player, from, dim?, reason? }
// ---------------------------------------------------------------------------

const STORY_COOLDOWN = 60 * 20; // ticks: one story shooting star per player a minute
const STORY_NEAR = 64; // other Overworld players this close see it too
/** Tick of the last story shooting star, by the requested player's id. @type {Map<string, number>} */
const storyStars = new Map();
world.afterEvents.playerLeave.subscribe(({ playerId }) => storyStars.delete(playerId));

/** @param {unknown} v @param {number} max */
const optText = (v, max) => v === undefined || (typeof v === "string" && v.length <= max);

/**
 * One shooting star for that player and every other Overworld player within 64 blocks who has the show
 * enabled, with a chat line (and the usual wish window). Only at night under a clear sky. Ignored silently
 * when the show, shooting stars or the Story events setting is disabled, the player isn't in the Overworld
 * or turned the show off, their last story star was under a minute ago, or the message is malformed.
 * @param {string} message
 */
function skyRequest(message) {
  let req;
  try {
    req = JSON.parse(message);
  } catch {
    return;
  }
  if (!req || typeof req !== "object" || Array.isArray(req) || req.kind !== "shooting_star") return;
  if (typeof req.player !== "string" || !req.player || req.player.length > 64 || !optText(req.from, 64) || !optText(req.reason, 200)) return;
  if (req.dim !== undefined && req.dim !== OVERWORLD) return;
  if (!get("enabled") || !get("stars.enabled") || get("storyEvents") !== true) return;
  loadWeather();
  const night = tonight();
  if (night === undefined || weather !== WeatherType.Clear) return;
  const now = system.currentTick;
  const last = storyStars.get(req.player);
  if (last !== undefined && now - last < STORY_COOLDOWN) return;
  const dim = world.getDimension(OVERWORLD);
  const all = dim.getPlayers();
  const target = all.find((p) => p.id === req.player);
  if (!target || getFor(target, "sky") !== true) return;
  storyStars.set(req.player, now);
  const at = target.location;
  for (const p of all) {
    try {
      if (p !== target && (getFor(p, "sky") !== true || Math.hypot(p.location.x - at.x, p.location.z - at.z) > STORY_NEAR)) continue;
      if (!star(p)) continue;
      stateOf(p).lastStar = now;
      journal(p, "shooting_star", "Shooting star");
      const wish = get("wish.enabled") && p.getDynamicProperty(PROP_WISH) !== night;
      p.sendMessage(wish ? "§bA shooting star crosses the sky! Sneak now to make a wish." : "§bA shooting star crosses the sky!");
    } catch (e) {
      console.warn(`[night] ${e}`);
    }
  }
}

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
onScriptEvent(
  ["realm:help_ping", "realm:sky_request"],
  ({ id, message }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "night_bp");
    else if (id === "realm:sky_request") {
      try {
        skyRequest(message);
      } catch (e) {
        console.warn(`[night] ${e}`);
      }
    }
  },
);
