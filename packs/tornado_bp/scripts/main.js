import { CommandPermissionLevel, CustomCommandStatus, Dimension, GameMode, ItemStack, MolangVariableMap, Player, WeatherType, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";
import { allZones, isProtected, protectedBox, zonesAt } from "./zones.js";

const PROP_WEATHER = "tornado:weather"; // world: overworld weather from the last change; scripts can't read the current weather

const OVERWORLD = "minecraft:overworld";
const RING = "realm:sky_tornado"; // particles come from the Realm Skies resource pack
const DEBRIS = "realm:sky_debris";
const SPARK = "realm:sky_spark";
const FRAME_TICKS = 2; // the funnel is redrawn and players are spun every 2 ticks
const FRAMES_PER_SECOND = 20 / FRAME_TICKS;
const NEAR = 64; // beyond this, players get half the rings
const REDRAW_FRAMES = 5; // each ring lives ~1.05-1.55s and every ring is redrawn every 5 frames (0.5s), so there are no gaps
const WIND_RANGE = 48;
const RUMBLE_RANGE = 100;
const WIND_EVERY = 5; // seconds
const RUMBLE_EVERY = 6;
const CAPTURE_RADIUS = 5.5; // once pulled within this distance of the funnel axis, the player spins up inside the vortex
const SPIN_TICKS = 56; // ticks (~2.8 s) spent spiraling up the funnel before shooting out the top into the sky
const LAUNCH_COOLDOWN = 110; // ticks (~5.5 s) after being shot out the top before the funnel can grab the same player again
const PATH_POINTS = 20; // the last positions, one a second: Storm Glass drops along them
const FORM_TRIES = 16; // candidate spots per attempt to form
const RETRY_TICKS = 200; // a failed attempt to form tries again 10 s later...
const MAX_ATTEMPTS = 12; // ...this many times
const CLEAR_FADE_TICKS = 200; // a natural tornado dies down within 10 s once the thunderstorm ends
// Open ground a tornado can form on: grass, dirt and sand, the plains-and-savanna kind of surface.
const OPEN_GROUND = new Set(["minecraft:grass_block", "minecraft:dirt", "minecraft:coarse_dirt", "minecraft:podzol", "minecraft:sand", "minecraft:red_sand"]);
// Low plants on top of the ground: look at the block under them.
const PLANT = /short_grass|tall_grass|fern|flower|dandelion|poppy|tulip|orchid|allium|bluet|daisy|lily_of_the_valley|bush|petals|sapling|leaf_litter|dry_grass|snow_layer|_roots$/;
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {{ startTick: number, angle: number }} SpinState */
/**
 * @typedef {{ x: number, y: number, z: number, groundY: number, heading: number, speed: number, lean: number,
 *   endsAt: number, natural: boolean, frame: number, path: Vector3[], viewers: { player: Player, dist: number }[],
 *   warned: Set<string>, seen: Set<string>, spinning: Map<string, SpinState>, thrown: Map<string, number>,
 *   hornIn: number, windIn: number, rumbleIn: number }} Tornado
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

// Safe zones (scripts/zones.js): "pass" goes through them as anywhere else (a tornado never breaks blocks),
// "calm" moves nothing inside them, "avoid" never forms in one and turns away from them.
const zoneMode = () => String(get("zoneMode"));
/** Is x, z in a safe zone where the tornado leaves things alone? @param {number} x @param {number} z */
const calmAt = (x, z) => zoneMode() !== "pass" && isProtected(OVERWORLD, x, z);
/** Does a safe zone reach within `margin` blocks of x, z? @param {number} x @param {number} z @param {number} margin */
const zoneNear = (x, z, margin) => protectedBox(OVERWORLD, { x: x - margin, z: z - margin }, { x: x + margin, z: z + margin });

const WATERY = /water|kelp|seagrass|bubble_column/;

/**
 * The ground in a column: the topmost block, or the block under a low plant on it. Over a lake or the sea, the
 * water's surface block: getTopmostBlock skips water (it answers the bed under it), so this climbs through it.
 * @param {Dimension} dim @param {number} x @param {number} z
 */
function groundAt(dim, x, z) {
  try {
    let top = dim.getTopmostBlock({ x: Math.floor(x), z: Math.floor(z) });
    if (top && PLANT.test(top.typeId)) top = top.below();
    for (let i = 0; top && i < 64; i++) {
      const up = top.above();
      if (!up || !(up.isLiquid || WATERY.test(up.typeId))) break;
      top = up;
    }
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
  if (dimension !== OVERWORLD && dimension !== "overworld") return; // the event names it "overworld" on BDS 1.26
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
  const players = dim.getPlayers();
  if (!players.length) return false;
  for (let i = 0; i < FORM_TRIES; i++) {
    const p = players[Math.floor(Math.random() * players.length)];
    // Half the tries at the full distance, then closer: the far chunks may not be loaded.
    const scale = i < FORM_TRIES / 2 ? 1 : 0.5;
    const angle = Math.random() * Math.PI * 2;
    const d = rand(CONFIG.formDistance.min, CONFIG.formDistance.max) * scale;
    const x = p.location.x + Math.cos(angle) * d, z = p.location.z + Math.sin(angle) * d;
    if (fromSpawn(x, z) < get("avoidSpawn")) continue;
    if (zoneMode() === "avoid" && zoneNear(x, z, get("pullRadius") + 16)) continue;
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
    spinning: new Map(),
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
  if (!quiet) {
    try {
      dropStormGlass(t);
    } catch (e) {
      console.warn(`[tornado] Storm Glass: ${e}`);
    }
  }
  // Everyone who was warned gets the all-clear, also when an operator ends it: the horn just stops otherwise.
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
    pull(t, dim);
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
  if (zoneMode() === "avoid" && zoneNear(nx, nz, get("pullRadius"))) {
    // Heading into a safe zone: turn away from the nearest one (unless it's already inside and leaving).
    const zone = zonesAt(OVERWORLD, nx, nz)[0] ?? nearestZone(nx, nz);
    if (zone && Math.hypot(nx - zone.x, nz - zone.z) < Math.hypot(t.x - zone.x, t.z - zone.z)) {
      t.heading = Math.atan2(t.z - zone.z, t.x - zone.x) + rand(-0.4, 0.4);
      return;
    }
  }
  t.x = nx;
  t.z = nz;
  t.y += (t.groundY - t.y) * 0.2; // follow the ground smoothly over hills
}

/** The safe zone whose center is nearest x, z, in the Overworld. @param {number} x @param {number} z */
function nearestZone(x, z) {
  let best, bestD = Infinity;
  for (const zone of allZones()) {
    if (zone.dim !== OVERWORLD) continue;
    const d = Math.hypot(x - zone.x, z - zone.z) - zone.r;
    if (d < bestD) [best, bestD] = [zone, d];
  }
  return best;
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

/**
 * Funnel radius at normalized height `f` (0 at ground, 1 at top):
 * a flared ground dust skirt at the foot, a sleek curving trumpet trunk, and a broad dark storm collar at the top.
 * @param {number} f
 */
function funnelRadius(f) {
  const trunk = 1.35 + 4.8 * f ** 1.55;
  const skirt = f < 0.09 ? (1 - f / 0.09) ** 1.4 * 2.1 : 0;
  const collar = f > 0.76 ? ((f - 0.76) / 0.24) ** 1.5 * 5.2 : 0;
  return trunk + skirt + collar;
}

/**
 * Funnel centerline at normalized height `f` (0..1), including 3D rope sway.
 * @param {Tornado} t @param {number} f @param {number} top
 */
function funnelAxis(t, f, top) {
  const time = t.frame / FRAMES_PER_SECOND;
  const swayA = Math.sin(time * 0.65 + f * 3.2) * f * 3.6;
  const swayB = Math.cos(time * 0.45 + f * 2.4) * f * (1 - f) * 2.2;
  const perp = t.lean + Math.PI / 2;
  return {
    x: t.x + Math.cos(t.lean) * swayA + Math.cos(perp) * swayB,
    y: t.y + f * top,
    z: t.z + Math.sin(t.lean) * swayA + Math.sin(perp) * swayB,
  };
}

/** The funnel, for each player near it (Player.spawnParticle: each player gets only their own). @param {Tornado} t */
function draw(t) {
  const density = get("density");
  const top = Math.max(12, Math.min(CONFIG.height, 318 - t.y));
  for (const { player, dist } of t.viewers) {
    if (!player.isValid) continue;
    const rings = Math.max(5, Math.round(get("rings") * density * (dist > NEAR ? 0.5 : 1)));
    const slice = Math.ceil(rings / REDRAW_FRAMES);
    try {
      for (let k = 0; k < slice; k++) {
        const i = (t.frame * slice + k) % rings;
        const f = (i + Math.random() * 0.7) / rings; // 0 at the ground, 1 at the top
        const axis = funnelAxis(t, f, top);
        molang().setFloat("variable.radius", funnelRadius(f));
        molang().setFloat("variable.spin", 8.0 - 4.5 * f);
        molang().setFloat("variable.height", f);
        player.spawnParticle(RING, axis, molang());
      }
      // Keep the ground contact dust whirl and upper storm collar anchored without excess emitters
      if (t.frame % 2 === 0) {
        molang().setFloat("variable.radius", 3.2);
        molang().setFloat("variable.spin", 8.8);
        molang().setFloat("variable.height", 0.02);
        player.spawnParticle(RING, { x: t.x, y: t.y + 0.35, z: t.z }, molang());
      } else {
        const topAxis = funnelAxis(t, 0.94, top);
        molang().setFloat("variable.radius", funnelRadius(0.94));
        molang().setFloat("variable.spin", 3.5);
        molang().setFloat("variable.height", 0.94);
        player.spawnParticle(RING, topAxis, molang());
      }
      if (dist <= NEAR && t.frame % 2 === 0) {
        molang().setFloat("variable.radius", rand(1.8, 3.8));
        player.spawnParticle(DEBRIS, { x: t.x + rand(-1.2, 1.2), y: t.y + rand(0.2, 2.0), z: t.z + rand(-1.2, 1.2) }, molang());
      }
      if (dist <= NEAR && t.frame % 4 === 0) {
        const collarAxis = funnelAxis(t, rand(0.78, 0.96), top);
        const ang = Math.random() * Math.PI * 2;
        const r = rand(1.5, 5.0);
        player.spawnParticle(SPARK, { x: collarAxis.x + Math.cos(ang) * r, y: collarAxis.y, z: collarAxis.z + Math.sin(ang) * r });
      }
    } catch {
      // An unloaded chunk or the edge of the world: skip this player for this frame.
    }
  }
}

// ---------------------------------------------------------------------------
// Sucking up players, spinning them around the funnel, and shooting them out the top
// ---------------------------------------------------------------------------

/**
 * Only affects actual players (in ANY gamemode); never touches mobs, NPCs, items or blocks.
 * @param {Tornado} t @param {Dimension} dim
 */
function pull(t, dim) {
  if (!get("throwPlayers")) {
    t.spinning.clear();
    return;
  }
  const radius = get("pullRadius");
  const top = Math.max(12, Math.min(CONFIG.height, 318 - t.y));
  const center = { x: t.x, y: t.y + top * 0.4, z: t.z };
  const reach = Math.max(radius + 12, top);
  const now = system.currentTick;
  const seenIds = new Set();

  let players;
  try {
    players = dim.getPlayers({ location: center, maxDistance: reach });
  } catch {
    return;
  }

  for (const p of players) {
    if (!p.isValid) continue;
    seenIds.add(p.id);
    try {
      const l = p.location;
      if (calmAt(l.x, l.z)) {
        t.spinning.delete(p.id);
        continue;
      }
      const lastLaunched = t.thrown.get(p.id) ?? -Infinity;
      if (now - lastLaunched < LAUNCH_COOLDOWN) {
        t.spinning.delete(p.id);
        continue;
      }

      let state = t.spinning.get(p.id);
      const relY = Math.max(0, Math.min(1, (l.y - t.y) / top));
      const axis = funnelAxis(t, relY, top);
      const dx = l.x - axis.x;
      const dz = l.z - axis.z;
      const d = Math.max(0.05, Math.hypot(dx, dz));

      if (!state) {
        if (d > radius || l.y < t.y - 4 || l.y > t.y + top + 6) continue;
        const captureR = Math.min(radius * 0.55, CAPTURE_RADIUS);
        if (d <= captureR) {
          state = { startTick: now, angle: Math.atan2(dz, dx) };
          t.spinning.set(p.id, state);
          p.playSound("mob.breeze.wind_burst", { location: l, volume: 0.75, pitch: 0.85 });
        } else {
          // Outer suction zone: pull the player inward toward the funnel with a counterclockwise swirl
          if (t.frame % 2 === 0) {
            const inX = -dx / d;
            const inZ = -dz / d;
            const tanX = -inZ;
            const tanZ = inX;
            const pullStrength = 0.75 + 0.65 * (1 - d / radius);
            const vx = (inX * 0.78 + tanX * 0.42) * pullStrength;
            const vz = (inZ * 0.78 + tanZ * 0.42) * pullStrength;
            const vy = l.y < t.y + 1.2 ? 0.28 : 0.12;
            p.applyKnockback({ x: vx, z: vz }, vy);
            const mode = p.getGameMode();
            const vel = p.getVelocity();
            if (mode === GameMode.Spectator || (mode === GameMode.Creative && !p.isOnGround && Math.abs(vel.y) < 0.002 && Math.hypot(vel.x, vel.z) < 0.005)) {
              p.teleport({ x: l.x + vx * 0.7, y: Math.max(t.y, l.y + 0.15), z: l.z + vz * 0.7 }, { keepVelocity: false });
            }
          }
          continue;
        }
      }

      // Inside the vortex funnel: spin the player around as they climb to the top
      const elapsed = now - state.startTick;
      if (elapsed >= SPIN_TICKS) {
        t.spinning.delete(p.id);
        t.thrown.set(p.id, now);
        launchOutTop(p, state.angle, t, top);
        continue;
      }

      const progress = Math.min(1, elapsed / SPIN_TICKS);
      state.angle += 0.62; // ~5 full revolutions up the funnel over SPIN_TICKS
      const targetAxis = funnelAxis(t, progress * 0.88, top);
      const orbitR = Math.min(4.2, funnelRadius(progress * 0.8) * 0.72);
      const targetX = targetAxis.x + Math.cos(state.angle) * orbitR;
      const targetZ = targetAxis.z + Math.sin(state.angle) * orbitR;
      const targetY = t.y + 1.5 + progress * (top * 0.86);

      const tanX = -Math.sin(state.angle);
      const tanZ = Math.cos(state.angle);
      const stepX = targetX - l.x;
      const stepZ = targetZ - l.z;
      const stepY = targetY - l.y;

      const vx = Math.max(-1.8, Math.min(1.8, stepX * 0.58 + tanX * 0.88));
      const vz = Math.max(-1.8, Math.min(1.8, stepZ * 0.58 + tanZ * 0.88));
      const vy = Math.max(0.38, Math.min(1.15, stepY * 0.36 + 0.52));

      p.applyKnockback({ x: vx, z: vz }, vy);
      const mode = p.getGameMode();
      const vel = p.getVelocity();
      if (
        t.frame % 2 === 0 &&
        (mode === GameMode.Spectator || (mode === GameMode.Creative && !p.isOnGround && Math.abs(vel.y) < 0.002 && Math.hypot(vel.x, vel.z) < 0.005))
      ) {
        p.teleport({ x: targetX, y: targetY, z: targetZ }, { keepVelocity: false });
      }
    } catch (e) {
      console.warn(`[tornado] ${e}`);
    }
  }

  for (const id of t.spinning.keys()) {
    if (!seenIds.has(id)) t.spinning.delete(id);
  }
}

/**
 * Shoots a player high into the sky out the top of the tornado after spinning them up the funnel,
 * then grants Slow Falling near the apex so they float down safely.
 * @param {Player} p @param {number} angle @param {Tornado} t @param {number} top
 */
function launchOutTop(p, angle, t, top) {
  const outX = Math.cos(angle);
  const outZ = Math.sin(angle);
  const boostScale = Math.max(1, CONFIG.liftHeight / 12);
  const horiz = 1.35 * boostScale;
  const vert = Math.min(3.8, 2.8 * boostScale);

  p.applyKnockback({ x: outX * horiz, z: outZ * horiz }, vert);
  p.playSound("mob.breeze.shoot", { location: p.location, volume: 1.2, pitch: 0.75 });
  try {
    molang().setFloat("variable.radius", 4.5);
    p.spawnParticle(DEBRIS, p.location, molang());
  } catch {
    // ignore particle error
  }

  // Multi-stage vertical boost pulses over the first 8 ticks so the player rockets high into the sky in every gamemode
  const apexY = t.y + top + Math.max(18, CONFIG.liftHeight * 1.6);
  for (const delay of [2, 4, 6, 8]) {
    system.runTimeout(() => {
      try {
        if (!p.isValid) return;
        const l = p.location;
        p.applyKnockback({ x: outX * 0.95, z: outZ * 0.95 }, 2.2);
        // Fallback if Creative flight prevents knockback from lifting the player out the top
        if (p.getVelocity().y < 0.15 && l.y < apexY) {
          const stepUp = Math.min(apexY, l.y + 4.5);
          p.teleport({ x: l.x + outX * 1.1, y: stepUp, z: l.z + outZ * 1.1 }, { keepVelocity: false });
        }
      } catch {
        // ignore if player left
      }
    }, delay);
  }

  const seconds = CONFIG.slowFallingSeconds;
  system.runTimeout(() => {
    try {
      if (p.isValid && seconds > 0) p.addEffect("slow_falling", seconds * 20, { showParticles: false });
    } catch (e) {
      console.warn(`[tornado] ${e}`);
    }
  }, 28);
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

/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

/** A tornado 40 blocks in front of the player. @param {Player} player @returns {string | undefined} why it can't */
function spawnInFront(player) {
  if (player.dimension.id !== OVERWORLD) return "Tornadoes only form in the Overworld.";
  if (tornado) return `There's already a tornado: ${describe(player)}`;
  const view = player.getViewDirection();
  const n = Math.hypot(view.x, view.z) || 1;
  const x = player.location.x + (view.x / n) * 40, z = player.location.z + (view.z / n) * 40;
  const ground = groundAt(player.dimension, x, z);
  start({ x, y: ground ? ground.location.y + 1 : player.location.y, z }, false);
  return undefined;
}

/**
 * Shows a form, retrying while the player still has chat or another screen open.
 * @param {Player} player @param {ActionFormData} form
 */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await new Promise((r) => system.runTimeout(() => r(undefined), 20));
  }
  return undefined;
}

/** /realm:tornado @param {Player} player */
async function mainMenu(player) {
  const mode = zoneMode();
  const zones = mode === "avoid" ? "Tornadoes steer around safe zones." : mode === "calm" ? "In a safe zone a tornado moves nothing." : "A tornado never breaks blocks, safe zone or not.";
  const body = `${describe(player)}\n\n${get("enabled") === true ? "Thunderstorms can bring a tornado." : "Tornadoes don't form on their own on this realm."} ${zones}`;
  /** @type {{ text: string, run: () => void }[]} */
  const actions = [{ text: "Where is the tornado?\n§8Distance and heading", run: () => player.sendMessage(describe(player)) }];
  if (isOp(player)) {
    actions.push({
      text: "§4Spawn one (operator)\n§840 blocks in front of you",
      run: () => {
        const why = spawnInFront(player);
        player.sendMessage(why ? `§c${why}` : "A tornado forms 40 blocks in front of you.");
      },
    });
    if (tornado) {
      actions.push({
        text: "§4End the tornado (operator)\n§8It dies down now, no Storm Glass",
        run: () => {
          if (tornado) end(tornado, true);
          player.sendMessage("§7The tornado is gone.");
        },
      });
    }
  }
  const form = new ActionFormData().title("§lTornadoes").body(body);
  for (const a of actions) form.button(a.text);
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  // Every button after the first is an operator's: checked again, as the player may have been de-opped meanwhile.
  if (res.selection > 0 && !isOp(player)) return player.sendMessage("§cOnly operators can do that.");
  actions[res.selection]?.run();
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:tornado",
      description: "Tornadoes: the menu (where the tornado is; for operators: spawn or end one)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Success, message: tornado ? `A tornado is at ${Math.round(tornado.x)}, ${Math.round(tornado.z)}.` : "No tornado right now." };
      system.run(() => mainMenu(player).catch((e) => console.warn(`[tornado] ${e}`)));
      return { status: CustomCommandStatus.Success };
    }
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:tornado_info",
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
          if (!tornado && player.isValid) spawnInFront(player);
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
