import { CommandPermissionLevel, CustomCommandStatus, Dimension, Entity, GameMode, ItemStack, MolangVariableMap, Player, WeatherType, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

const PROP_WEATHER = "tornado:weather"; // world: overworld weather from the last change; scripts can't read the current weather

const OVERWORLD = "minecraft:overworld";
const RING = "realm:sky_tornado"; // particles come from the Realm Skies resource pack
const DEBRIS = "realm:sky_debris";
const FRAME_TICKS = 2; // the funnel is redrawn every 2 ticks
const FRAMES_PER_SECOND = 20 / FRAME_TICKS;
const NEAR = 64; // beyond this, players get half the rings
const REDRAW_FRAMES = 5; // each ring is redrawn every 5 frames (half a second)
const WIND_RANGE = 48;
const RUMBLE_RANGE = 100;
const WIND_EVERY = 5; // seconds
const RUMBLE_EVERY = 6;
const MAX_PULLED = 40; // entities moved per run, so a mob farm next to it can't make it expensive
const THROW_COOLDOWN = 80; // ticks between throws of one player
const PULL_EVERY = 6; // frames (12 ticks) between the gentle tugs on players at the edge
const PATH_POINTS = 20; // the last positions, one a second: Storm Glass drops along them
const FORM_TRIES = 16; // candidate spots per attempt to form
const RETRY_TICKS = 200; // a failed attempt to form tries again 10 s later...
const MAX_ATTEMPTS = 12; // ...this many times
const CLEAR_FADE_TICKS = 200; // a natural tornado dies down within 10 s once the thunderstorm ends
// Open ground a tornado can form on: grass, dirt and sand, the plains-and-savanna kind of surface.
const OPEN_GROUND = new Set(["minecraft:grass_block", "minecraft:dirt", "minecraft:coarse_dirt", "minecraft:podzol", "minecraft:sand", "minecraft:red_sand"]);
// Low plants on top of the ground: look at the block under them.
const PLANT = /short_grass|tall_grass|fern|flower|dandelion|poppy|tulip|orchid|allium|bluet|daisy|lily_of_the_valley|bush|petals|sapling|leaf_litter|dry_grass|snow_layer|_roots$/;
// Entities a tornado leaves alone: townsfolk, decorations and vehicles (minecarts and boats are "inanimate").
const LEAVE_ALONE = ["minecraft:npc", "minecraft:armor_stand", "minecraft:painting", "minecraft:leash_knot", "minecraft:ender_crystal", "minecraft:fishing_hook"];
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/**
 * @typedef {{ x: number, y: number, z: number, groundY: number, heading: number, speed: number, lean: number,
 *   endsAt: number, natural: boolean, frame: number, path: Vector3[], viewers: { player: Player, dist: number }[],
 *   warned: Set<string>, seen: Set<string>, thrown: Map<string, number>, hornIn: number, windIn: number, rumbleIn: number }} Tornado
 */

/** @type {WeatherType} */
let weather = WeatherType.Clear;
/** @type {{ at: number, attempts: number } | undefined} the tornado this thunderstorm will bring */
let pending;
/** @type {Tornado | undefined} */
let tornado;
/** @type {number | undefined} */
let loop;
/** One map, made on first use: the stable API may refuse native objects while the world is still loading. @type {MolangVariableMap | undefined} */
let varsMap;
const molang = () => (varsMap ??= new MolangVariableMap()); // reused: spawnParticle copies the values

const rand = (/** @type {number} */ min, /** @type {number} */ max) => min + Math.random() * (max - min);
const randInt = (/** @type {number} */ min, /** @type {number} */ max) => Math.floor(rand(min, max + 1));

/** "NE" for a direction given as x and z steps (north is -z). @param {number} dx @param {number} dz */
function compass(dx, dz) {
  const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8];
}

/** Horizontal distance from the world spawn. @param {number} x @param {number} z */
function fromSpawn(x, z) {
  const s = world.getDefaultSpawnLocation();
  return Math.hypot(x - s.x, z - s.z);
}

/** @returns {Dimension} */
const overworld = () => world.getDimension(OVERWORLD);

/**
 * The ground in a column: the topmost block, or the block under a low plant on it.
 * @param {Dimension} dim @param {number} x @param {number} z
 */
function groundAt(dim, x, z) {
  try {
    let top = dim.getTopmostBlock({ x: Math.floor(x), z: Math.floor(z) });
    if (top && PLANT.test(top.typeId)) top = top.below();
    return top;
  } catch {
    return undefined; // unloaded chunk
  }
}

/** @param {Player} player */
function sendJournal(player) {
  system.sendScriptEvent("realm:journal", JSON.stringify({ player: player.id, page: "weather", entry: "tornado", label: "Tornado" }));
}

// ---------------------------------------------------------------------------
// Weather: a thunderstorm may bring one tornado
// ---------------------------------------------------------------------------

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather, previousWeather }) => {
  if (dimension !== OVERWORLD) return;
  weather = newWeather;
  try {
    world.setDynamicProperty(PROP_WEATHER, newWeather);
  } catch (e) {
    console.warn(`[tornado] ${e}`);
  }
  if (newWeather === WeatherType.Thunder) {
    if (previousWeather !== WeatherType.Thunder && get("enabled") && Math.random() < get("chance")) {
      pending = { at: system.currentTick + Math.round(rand(CONFIG.formAfter.min, CONFIG.formAfter.max) * 20), attempts: 0 };
    }
    return;
  }
  pending = undefined;
  if (tornado?.natural) tornado.endsAt = Math.min(tornado.endsAt, system.currentTick + CLEAR_FADE_TICKS);
});

world.afterEvents.worldLoad.subscribe(() => {
  const saved = world.getDynamicProperty(PROP_WEATHER);
  if (saved === WeatherType.Rain || saved === WeatherType.Thunder) weather = saved;
});

// Every 5 s: is it time for this thunderstorm's tornado?
system.runInterval(() => {
  const plan = pending;
  if (!plan || system.currentTick < plan.at) return;
  if (weather !== WeatherType.Thunder || !get("enabled") || tornado) {
    pending = undefined;
    return;
  }
  try {
    if (formNatural()) {
      pending = undefined;
      return;
    }
  } catch (e) {
    console.warn(`[tornado] ${e}`);
  }
  // No open ground near anyone (or no one in the Overworld): try again a little later.
  plan.attempts++;
  plan.at = system.currentTick + RETRY_TICKS;
  if (plan.attempts >= MAX_ATTEMPTS) pending = undefined;
}, 100);

/** Looks for open ground near a random player in the Overworld and starts a tornado there. @returns {boolean} */
function formNatural() {
  const dim = overworld();
  const players = dim.getPlayers().filter((p) => p.getGameMode() !== GameMode.Spectator);
  if (!players.length) return false;
  for (let i = 0; i < FORM_TRIES; i++) {
    const p = players[Math.floor(Math.random() * players.length)];
    // Half the tries at the full distance, then closer: the far chunks may not be loaded.
    const scale = i < FORM_TRIES / 2 ? 1 : 0.5;
    const angle = Math.random() * Math.PI * 2;
    const d = rand(CONFIG.formDistance.min, CONFIG.formDistance.max) * scale;
    const x = p.location.x + Math.cos(angle) * d, z = p.location.z + Math.sin(angle) * d;
    if (fromSpawn(x, z) < get("avoidSpawn")) continue;
    const ground = groundAt(dim, x, z);
    if (!ground || !OPEN_GROUND.has(ground.typeId)) continue; // water, leaves, stone, builds, unloaded
    start({ x: Math.floor(x) + 0.5, y: ground.location.y + 1, z: Math.floor(z) + 0.5 }, true);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The tornado
// ---------------------------------------------------------------------------

/** @param {Vector3} at the ground under the funnel @param {boolean} natural formed by a thunderstorm (not /realm:tornado_spawn) */
function start(at, natural) {
  tornado = {
    x: at.x,
    y: at.y,
    z: at.z,
    groundY: at.y,
    heading: Math.random() * Math.PI * 2,
    speed: rand(CONFIG.speed.min, CONFIG.speed.max),
    lean: Math.random() * Math.PI * 2,
    endsAt: system.currentTick + Math.round(rand(CONFIG.lifetime.min, CONFIG.lifetime.max) * 20),
    natural,
    frame: 0,
    path: [{ ...at }],
    viewers: [],
    warned: new Set(),
    seen: new Set(),
    thrown: new Map(),
    hornIn: 0,
    windIn: 0,
    rumbleIn: 0,
  };
  system.sendScriptEvent("realm:sky_event", JSON.stringify({ kind: "tornado", dim: OVERWORLD, x: Math.round(at.x), z: Math.round(at.z), text: "A tornado touched down" }));
  everySecond(tornado, overworld());
  if (loop === undefined) loop = system.runInterval(frame, FRAME_TICKS);
}

/** @param {Tornado} t @param {boolean} quiet ended by a command or an error: no Storm Glass */
function end(t, quiet) {
  if (tornado === t) tornado = undefined;
  if (loop !== undefined) {
    system.clearRun(loop);
    loop = undefined;
  }
  if (quiet) return;
  try {
    dropStormGlass(t);
  } catch (e) {
    console.warn(`[tornado] Storm Glass: ${e}`);
  }
  for (const p of world.getAllPlayers()) if (t.warned.has(p.id)) p.sendMessage("§7The tornado has died down.");
}

function frame() {
  const t = tornado;
  if (!t) {
    if (loop !== undefined) system.clearRun(loop);
    loop = undefined;
    return;
  }
  try {
    if (system.currentTick >= t.endsAt) {
      end(t, false);
      return;
    }
    const dim = overworld();
    t.frame++;
    move(t);
    if (t.frame % FRAMES_PER_SECOND === 0) everySecond(t, dim);
    draw(t);
    if (t.frame % 2 === 0) pull(t, dim);
  } catch (e) {
    console.warn(`[tornado] ${e}`);
  }
}

/** Drifts along its heading, turning away from the spawn area. @param {Tornado} t */
function move(t) {
  const step = (t.speed * FRAME_TICKS) / 20;
  const nx = t.x + Math.cos(t.heading) * step, nz = t.z + Math.sin(t.heading) * step;
  const next = fromSpawn(nx, nz);
  if (next < get("avoidSpawn") && next < fromSpawn(t.x, t.z)) {
    // Heading into the spawn area: turn to head straight away from spawn and wait for the next frame.
    const s = world.getDefaultSpawnLocation();
    t.heading = Math.atan2(t.z - s.z, t.x - s.x) + rand(-0.4, 0.4);
    return;
  }
  t.x = nx;
  t.z = nz;
  t.y += (t.groundY - t.y) * 0.2; // follow the ground smoothly over hills
}

/** Once a second: wander, find the ground, see who's near, warn, sounds. @param {Tornado} t @param {Dimension} dim */
function everySecond(t, dim) {
  t.heading += rand(-0.35, 0.35);
  const ground = groundAt(dim, t.x, t.z);
  // Over water or trees the funnel stands on the surface; in an unloaded chunk it keeps its height.
  if (ground) t.groundY = ground.location.y + 1;
  t.path.push({ x: t.x, y: t.groundY, z: t.z });
  if (t.path.length > PATH_POINTS) t.path.shift();

  const view = get("viewDistance");
  const warn = CONFIG.warnDistance;
  const heading = compass(Math.cos(t.heading), Math.sin(t.heading));
  t.viewers = [];
  t.hornIn--;
  t.windIn--;
  t.rumbleIn--;
  const horn = CONFIG.hornEvery > 0 && t.hornIn <= 0;
  const wind = t.windIn <= 0;
  const rumble = t.rumbleIn <= 0;
  for (const player of dim.getPlayers()) {
    const l = player.location;
    const dist = Math.hypot(l.x - t.x, l.z - t.z);
    if (dist <= view && Math.abs(l.y - t.y) < 100) {
      t.viewers.push({ player, dist });
      if (!t.seen.has(player.id)) {
        t.seen.add(player.id);
        sendJournal(player);
      }
    }
    if (dist > warn) continue;
    try {
      if (!t.warned.has(player.id)) {
        t.warned.add(player.id);
        const m = Math.max(10, Math.round(dist / 10) * 10);
        player.sendMessage(`§cTornado! ${m}m to the ${compass(t.x - l.x, t.z - l.z)}, moving ${heading}.`);
      }
      if (horn) soundToward(player, t, dist, CONFIG.sounds.horn, 0.45, 1, warn);
      if (wind && dist <= WIND_RANGE) {
        player.runCommand(`stopsound @s ${CONFIG.sounds.wind}`); // the clips overlap otherwise
        soundToward(player, t, dist, CONFIG.sounds.wind, 1, 0.7, WIND_RANGE);
      }
      if (rumble && dist <= RUMBLE_RANGE) soundToward(player, t, dist, CONFIG.sounds.rumble, 0.8, 0.5, RUMBLE_RANGE);
    } catch (e) {
      console.warn(`[tornado] ${e}`);
    }
  }
  if (horn) t.hornIn = CONFIG.hornEvery;
  if (wind) t.windIn = WIND_EVERY;
  if (rumble) t.rumbleIn = RUMBLE_EVERY;
}

/**
 * Plays a sound to one player from the tornado's direction, a few blocks away, louder when it's close.
 * @param {Player} player @param {Tornado} t @param {number} dist @param {string} id @param {number} volume @param {number} pitch @param {number} range
 */
function soundToward(player, t, dist, id, volume, pitch, range) {
  const l = player.location;
  const k = dist > 0.1 ? Math.min(dist, 6) / dist : 0;
  const location = { x: l.x + (t.x - l.x) * k, y: l.y + 1, z: l.z + (t.z - l.z) * k };
  player.playSound(id, { location, volume: Math.max(0.15, volume * (1 - dist / range)), pitch });
}

/** The funnel, for each player near it (Player.spawnParticle: each player gets only their own). @param {Tornado} t */
function draw(t) {
  const density = get("density");
  const time = t.frame / FRAMES_PER_SECOND;
  const top = Math.min(CONFIG.height, 318 - t.y);
  for (const { player, dist } of t.viewers) {
    if (!player.isValid) continue;
    // Each ring lives about 1.2 s, so each frame redraws a slice of the funnel: every ring once in REDRAW_FRAMES.
    const rings = Math.max(4, Math.round(get("rings") * density * (dist > NEAR ? 0.5 : 1)));
    const slice = Math.ceil(rings / REDRAW_FRAMES);
    try {
      for (let k = 0; k < slice; k++) {
        const i = (t.frame * slice + k) % rings;
        const f = (i + Math.random()) / rings; // 0 at the ground, 1 at the top
        const sway = Math.sin(time * 0.6 + f * 3) * f * 4; // the funnel bends and sways
        molang().setFloat("variable.radius", 1 + 10 * f ** 1.7);
        molang().setFloat("variable.spin", 5 - 3 * f);
        player.spawnParticle(RING, { x: t.x + Math.cos(t.lean) * sway, y: t.y + f * top, z: t.z + Math.sin(t.lean) * sway }, molang());
      }
      if (dist <= NEAR && t.frame % 2 === 0) {
        const bits = Math.max(1, Math.round(density));
        for (let i = 0; i < bits; i++) {
          molang().setFloat("variable.radius", rand(2, 5));
          player.spawnParticle(DEBRIS, { x: t.x + rand(-3, 3), y: t.y + rand(0.3, 2), z: t.z + rand(-3, 3) }, molang());
        }
      }
    } catch {
      // An unloaded chunk or the edge of the world: skip this player for this frame.
    }
  }
}

// ---------------------------------------------------------------------------
// Pulling mobs, items and players
// ---------------------------------------------------------------------------

/** @param {Tornado} t @param {Dimension} dim */
function pull(t, dim) {
  const radius = get("pullRadius");
  const lift = CONFIG.liftHeight;
  const center = { x: t.x, y: t.y + 4, z: t.z };
  const reach = radius + 8;
  /** @type {Map<string, Entity>} */
  const found = new Map();
  try {
    for (const e of dim.getEntities({ location: center, maxDistance: reach, excludeFamilies: ["player", "inanimate"], excludeTypes: LEAVE_ALONE, excludeTags: ["realm:npc"] })) found.set(e.id, e);
    for (const e of dim.getEntities({ location: center, maxDistance: reach, type: "minecraft:item" })) found.set(e.id, e);
  } catch {
    return; // unloaded around the funnel
  }
  let moved = 0;
  for (const e of found.values()) {
    if (moved >= MAX_PULLED) break;
    if (!e.isValid || !e.typeId.startsWith("minecraft:")) continue; // other packs' helper entities (seats...)
    const l = e.location;
    const dx = l.x - t.x, dz = l.z - t.z;
    const d = Math.hypot(dx, dz);
    const above = l.y - t.y;
    if (d > radius || above < -3 || above > lift + 4) continue;
    moved++;
    try {
      spin(e, dx, dz, d, radius, above < lift);
    } catch {
      // some entities can't be pushed
    }
  }
  if (!get("throwPlayers")) return;
  const now = system.currentTick;
  for (const p of dim.getPlayers({ location: center, maxDistance: reach })) {
    try {
      const mode = p.getGameMode();
      if (mode === GameMode.Creative || mode === GameMode.Spectator) continue;
      const l = p.location;
      const dx = l.x - t.x, dz = l.z - t.z;
      const d = Math.max(0.1, Math.hypot(dx, dz));
      if (d > radius || l.y < t.y - 3 || l.y > t.y + CONFIG.height) continue;
      const last = t.thrown.get(p.id) ?? -Infinity;
      if (now - last < THROW_COOLDOWN) continue;
      if (d <= radius / 2) throwPlayer(p, dx / d, dz / d, t);
      else if (t.frame % PULL_EVERY === 0) p.applyKnockback({ x: (-dx / d) * 0.5, z: (-dz / d) * 0.5 }, 0.1); // a tug toward the funnel
    } catch (e) {
      console.warn(`[tornado] ${e}`);
    }
  }
}

/**
 * Circles an entity around the funnel, a little inward, and lifts it up to liftHeight. Speeds are
 * capped (blocks per tick), and mobs get Slow Falling so nothing dies from the drop.
 * @param {Entity} e @param {number} dx @param {number} dz @param {number} d @param {number} radius @param {boolean} rise
 */
function spin(e, dx, dz, d, radius, rise) {
  const inX = d > 0.3 ? -dx / d : 0, inZ = d > 0.3 ? -dz / d : 0;
  const tanX = -inZ, tanZ = inX; // counterclockwise seen from above
  const inward = 0.1 * (0.3 + d / radius);
  const want = { x: inX * inward + tanX * 0.3, y: rise ? 0.2 : 0.02, z: inZ * inward + tanZ * 0.3 };
  const v = e.getVelocity();
  const clamp = (/** @type {number} */ n) => Math.max(-0.25, Math.min(0.25, n));
  const imp = { x: clamp((want.x - v.x) * 0.4), y: clamp((want.y - v.y) * 0.4), z: clamp((want.z - v.z) * 0.4) };
  // Never faster than 0.6 blocks per tick sideways or 0.35 upward.
  const nx = v.x + imp.x, nz = v.z + imp.z;
  const h = Math.hypot(nx, nz);
  if (h > 0.6) {
    imp.x = (nx * 0.6) / h - v.x;
    imp.z = (nz * 0.6) / h - v.z;
  }
  if (v.y + imp.y > 0.35) imp.y = 0.35 - v.y;
  e.applyImpulse(imp);
  if (e.typeId !== "minecraft:item" && !e.getEffect("slow_falling")) e.addEffect("slow_falling", 120, { showParticles: false });
}

/**
 * Flings a player a few blocks up and out, then gives Slow Falling near the top of the throw (giving it
 * at once would carry them far higher).
 * @param {Player} p @param {number} outX @param {number} outZ unit vector from the funnel to the player @param {Tornado} t
 */
function throwPlayer(p, outX, outZ, t) {
  const tanX = -outZ, tanZ = outX;
  let x = tanX * 0.8 + outX * 0.6, z = tanZ * 0.8 + outZ * 0.6;
  const n = Math.hypot(x, z) || 1;
  x /= n;
  z /= n;
  p.applyKnockback({ x: x * 2.4, z: z * 2.4 }, 1.0);
  t.thrown.set(p.id, system.currentTick);
  const seconds = CONFIG.slowFallingSeconds;
  system.runTimeout(() => {
    try {
      if (p.isValid && seconds > 0) p.addEffect("slow_falling", seconds * 20, { showParticles: false });
    } catch (e) {
      console.warn(`[tornado] ${e}`);
    }
  }, 10);
}

// ---------------------------------------------------------------------------
// Storm Glass where it dies down
// ---------------------------------------------------------------------------

/** @param {number} amount */
function stormGlass(amount) {
  const item = new ItemStack("minecraft:prismarine_crystals", amount);
  item.nameTag = "§r§bStorm Glass";
  item.setLore(["§7Charged by a lightning strike"]);
  return item;
}

/** One Storm Glass at each of the last few points of its path (an unloaded point passes its drop on to the next). @param {Tornado} t */
function dropStormGlass(t) {
  const dim = overworld();
  let count = randInt(CONFIG.stormGlass.min, CONFIG.stormGlass.max);
  for (let i = t.path.length - 1; i >= 0 && count > 0; i -= 2) {
    const p = t.path[i];
    try {
      dim.spawnItem(stormGlass(1), { x: p.x + rand(-1, 1), y: p.y + 0.5, z: p.z + rand(-1, 1) });
      count--;
    } catch {
      // unloaded: no one is near this part of the path
    }
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {Player} player */
function describe(player) {
  const t = tornado;
  if (!t) return "No tornado right now.";
  if (player.dimension.id !== OVERWORLD) return "There's a tornado in the Overworld.";
  const l = player.location;
  const dist = Math.hypot(t.x - l.x, t.z - l.z);
  const m = Math.max(10, Math.round(dist / 10) * 10);
  return `§cTornado! ${m}m to the ${compass(t.x - l.x, t.z - l.z)}, moving ${compass(Math.cos(t.heading), Math.sin(t.heading))}.`;
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:tornado",
      description: "Tornadoes: where the tornado is and where it's heading",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Success, message: tornado ? `A tornado is at ${Math.round(tornado.x)}, ${Math.round(tornado.z)}.` : "No tornado right now." };
      return { status: CustomCommandStatus.Success, message: describe(player) };
    }
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:tornado_spawn",
      description: "Tornadoes (operators): a tornado forms 40 blocks in front of you, in any weather",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      if (player.dimension.id !== OVERWORLD) return { status: CustomCommandStatus.Failure, message: "Tornadoes only form in the Overworld." };
      if (tornado) return { status: CustomCommandStatus.Failure, message: `There's already a tornado: ${describe(player)}` };
      system.run(() => {
        try {
          if (tornado || !player.isValid) return;
          const view = player.getViewDirection();
          const n = Math.hypot(view.x, view.z) || 1;
          const x = player.location.x + (view.x / n) * 40, z = player.location.z + (view.z / n) * 40;
          const ground = groundAt(player.dimension, x, z);
          start({ x, y: ground ? ground.location.y + 1 : player.location.y, z }, false);
        } catch (e) {
          console.warn(`[tornado] ${e}`);
        }
      });
      return { status: CustomCommandStatus.Success, message: "A tornado forms 40 blocks in front of you." };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "tornado_bp");
  },
  { namespaces: ["realm"] }
);
