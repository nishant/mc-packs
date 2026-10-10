import { CommandPermissionLevel, CustomCommandStatus, Dimension, GameMode, MolangVariableMap, Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

// World properties:
//   "meteor:night"   JSON { n: day number, at: time of day of tonight's warning, or -1 for none }
//   "meteor:impacts" JSON [{ id, x, z, y?, state, found?, lands? }], the last 5 meteors, newest last.
//                    state: "falling" (warned, not landed), "pending" (landed, crater not made yet: no one
//                    was near), "made" (crater made), "none" (no safe spot for a crater near it)
const PROP_NIGHT = "meteor:night";
const PROP_IMPACTS = "meteor:impacts";
const OVERWORLD = "minecraft:overworld";
const METEOR = "realm:sky_meteor"; // particles come from the Realm Skies resource pack
const SMOKE = "realm:sky_meteor_smoke";
const MAX_IMPACTS = 5;
const NIGHT_START = 13000;
const NIGHT_END = 23000;
const STREAK_SECONDS = 3; // the streak shows for the last 3 s before impact
const FALL_SPEED = { side: 30, down: 45 }; // blocks per second
const PROXY_DISTANCE = 110; // players farther than this see the streak drawn at this distance, toward the impact
const TARGET_TRIES = 12;
const ALTERNATES = 8; // other spots tried, within ALTERNATE_RADIUS, when the impact spot isn't safe for a crater
const ALTERNATE_RADIUS = 24;
const SCAN = 4; // the build scan covers 9 x 9 columns (4 each way), from the surface - 4 to + 4
const MAX_Y = 316;

// Blocks a crater may remove or replace: natural ground, stone, ores, leaves and plants.
const NATURAL = new Set(
  [
    "grass_block", "dirt", "coarse_dirt", "podzol", "mycelium", "rooted_dirt", "dirt_with_roots", "mud", "clay", "gravel",
    "sand", "red_sand", "sandstone", "red_sandstone", "stone", "granite", "diorite", "andesite", "deepslate", "tuff",
    "calcite", "dripstone_block", "moss_block", "snow", "ice", "packed_ice", "blue_ice", "powder_snow", "terracotta",
    "white_terracotta", "orange_terracotta", "yellow_terracotta", "brown_terracotta", "red_terracotta", "light_gray_terracotta",
  ].map((id) => `minecraft:${id}`)
);
const ORE = /_ore$/;
const PLANT =
  /^minecraft:(short_grass|tall_grass|fern|large_fern|dead_bush|bush|firefly_bush|sweet_berry_bush|dandelion|poppy|blue_orchid|allium|azure_bluet|(red|orange|white|pink)_tulip|oxeye_daisy|cornflower|lily_of_the_valley|wither_rose|sunflower|lilac|rose_bush|peony|pink_petals|wildflowers|leaf_litter|short_dry_grass|tall_dry_grass|torchflower|closed_eyeblossom|open_eyeblossom|cactus_flower|vine|glow_lichen|moss_carpet|brown_mushroom|red_mushroom|cactus|sugar_cane|[a-z_]*sapling|[a-z_]*leaves|snow_layer)$/;
// Player-made blocks: a crater never goes where the scan finds one of these.
const BUILT =
  /planks|glass|chest|barrel|sign|_bed$|^minecraft:bed$|torch|lantern|door|fence|wool|carpet|concrete|glazed|crafting_table|furnace|smoker|brick|stairs|slab|_wall$|bookshelf|ladder|rail|hopper|anvil|lectern|loom|composter|_table$|grindstone|stonecutter|brewing_stand|beacon|button|lever|pressure_plate|redstone|repeater|comparator|piston|observer|dispenser|dropper|flower_pot|candle|scaffolding|iron_bars|chain|stripped_|polished_|smooth_|cut_|chiseled_|frame|jukebox|noteblock|shulker_box|campfire|bell|banner|farmland|hay_block|cobblestone|_path$|copper|waxed_|quartz|purpur|terracotta|_block$|bars|tinted|lamp|cauldron|crafter|target|bee_nest|beehive|_head$|_skull$|pot$/;

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {{ id: number, x: number, z: number, y?: number, state: "falling" | "pending" | "made" | "none", found?: string, lands?: number }} Impact */
/** @typedef {{ impact: Impact, landsAt: number, streaked: boolean, vel: Vector3, y: number }} Fall */

/** @type {Fall | undefined} the meteor on its way down */
let falling;
/** @type {Set<number>} impacts whose crater is being made right now */
const busy = new Set();
/** @type {Set<string>} "<impact id>:<player id>": who already reached which crater (journal sent) */
const reached = new Set();

const rand = (/** @type {number} */ min, /** @type {number} */ max) => min + Math.random() * (max - min);
const randInt = (/** @type {number} */ min, /** @type {number} */ max) => Math.floor(rand(min, max + 1));
/** @returns {Dimension} */
const overworld = () => world.getDimension(OVERWORLD);

/** Horizontal distance from the world spawn. @param {number} x @param {number} z */
function fromSpawn(x, z) {
  const s = world.getDefaultSpawnLocation();
  return Math.hypot(x - s.x, z - s.z);
}

/** @param {string} id */
const isNatural = (id) => NATURAL.has(id) || ORE.test(id) || PLANT.test(id);
/** @param {string} id */
const isBuilt = (id) => !isNatural(id) && BUILT.test(id);

// ---------------------------------------------------------------------------
// Saved impacts
// ---------------------------------------------------------------------------

/** @type {Impact[] | undefined} */
let impactsCache;

/** @returns {Impact[]} */
function impacts() {
  if (impactsCache) return impactsCache;
  let raw;
  try {
    raw = world.getDynamicProperty(PROP_IMPACTS);
  } catch {
    return []; // the world isn't up yet: read it next time
  }
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : [];
    impactsCache = Array.isArray(parsed) ? parsed.filter((i) => i && typeof i.x === "number" && typeof i.z === "number") : [];
  } catch {
    console.warn(`[meteor] ${PROP_IMPACTS} is corrupt; starting over`);
    impactsCache = [];
  }
  // Read once per script start, when nothing is falling yet: a meteor still falling when the world (or
  // the scripts) stopped has landed by now.
  for (const i of /** @type {Impact[]} */ (impactsCache)) if (i.state === "falling") i.state = "pending";
  return /** @type {Impact[]} */ (impactsCache);
}

function saveImpacts() {
  const list = impacts();
  while (list.length > MAX_IMPACTS) list.shift();
  try {
    world.setDynamicProperty(PROP_IMPACTS, JSON.stringify(list));
  } catch (e) {
    console.warn(`[meteor] ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Tonight's meteor
// ---------------------------------------------------------------------------

/** @returns {{ n: number, at: number }} */
function nightPlan() {
  try {
    const raw = world.getDynamicProperty(PROP_NIGHT);
    const plan = typeof raw === "string" ? JSON.parse(raw) : undefined;
    if (plan && typeof plan.n === "number" && typeof plan.at === "number") return plan;
  } catch {
    // corrupt: roll again
  }
  return { n: -1, at: -1 };
}

/** @param {{ n: number, at: number }} plan */
function savePlan(plan) {
  world.setDynamicProperty(PROP_NIGHT, JSON.stringify(plan));
}

// Every 5 s: roll the night's meteor once, and launch it when its time comes.
system.runInterval(() => {
  try {
    if (!get("enabled")) return;
    const tod = world.getTimeOfDay();
    if (tod < NIGHT_START || tod >= NIGHT_END) return;
    let plan = nightPlan();
    const day = world.getDay();
    if (plan.n !== day) {
      // The warning comes at a random time, early enough that the meteor lands before dawn.
      const earliest = Math.max(tod, NIGHT_START) + 100;
      const latest = NIGHT_END - get("warningSeconds") * 20 - 400;
      plan = { n: day, at: latest > earliest && Math.random() < get("chance") ? randInt(earliest, latest) : -1 };
      savePlan(plan);
    }
    if (plan.at < 0 || tod < plan.at || falling) return;
    const players = overworld().getPlayers().filter((p) => p.getGameMode() !== GameMode.Spectator);
    if (!players.length) return; // wait (until dawn) for someone in the Overworld
    plan.at = -1;
    savePlan(plan);
    const target = pickTarget(players[Math.floor(Math.random() * players.length)]);
    if (target) launch(target);
  } catch (e) {
    console.warn(`[meteor] ${e}`);
  }
}, 100);

/** @param {Player} player @returns {{ x: number, z: number } | undefined} */
function pickTarget(player) {
  const dim = overworld();
  for (let i = 0; i < TARGET_TRIES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const d = rand(CONFIG.distance.min, CONFIG.distance.max);
    const x = Math.floor(player.location.x + Math.cos(angle) * d), z = Math.floor(player.location.z + Math.sin(angle) * d);
    if (fromSpawn(x, z) < get("avoidSpawn")) continue;
    // Usually too far to be loaded; when it is, skip water right away. The full check comes with the crater.
    const top = topAt(dim, x, z);
    if (top && top.isLiquid) continue;
    return { x, z };
  }
  return undefined;
}

/** @param {Dimension} dim @param {number} x @param {number} z */
function topAt(dim, x, z) {
  try {
    return dim.getTopmostBlock({ x: Math.floor(x), z: Math.floor(z) });
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// The fall
// ---------------------------------------------------------------------------

/** Warns everyone, then brings the meteor down at `target` after warningSeconds. @param {{ x: number, z: number }} target */
function launch(target) {
  const seconds = get("warningSeconds");
  /** @type {Impact} */
  const impact = { id: Date.now(), x: target.x, z: target.z, state: "falling", lands: Date.now() + seconds * 1000 };
  impacts().push(impact);
  saveImpacts();
  const angle = Math.random() * Math.PI * 2;
  const top = topAt(overworld(), target.x, target.z);
  falling = {
    impact,
    landsAt: system.currentTick + seconds * 20,
    streaked: false,
    vel: { x: Math.cos(angle) * FALL_SPEED.side, y: -FALL_SPEED.down, z: Math.sin(angle) * FALL_SPEED.side },
    y: top ? top.location.y + 1 : 64, // refined at impact when the chunk is loaded
  };
  world.sendMessage(`§6A meteor is falling! It will land near ${target.x}, ${target.z} in ${seconds} seconds.`);
  system.sendScriptEvent("realm:sky_event", JSON.stringify({ kind: "meteor", dim: OVERWORLD, x: target.x, z: target.z, text: "A meteor is falling" }));
}

// Every half second: the streak, then the impact.
system.runInterval(() => {
  const f = falling;
  if (!f) return;
  try {
    const now = system.currentTick;
    if (!f.streaked && now >= f.landsAt - STREAK_SECONDS * 20) {
      f.streaked = true;
      streak(f);
    }
    if (now >= f.landsAt) {
      falling = undefined;
      land(f);
    }
  } catch (e) {
    falling = undefined;
    console.warn(`[meteor] ${e}`);
  }
}, 10);

/** The streak for every player in the Overworld: the real one when close, one drawn toward the impact when far. @param {Fall} f */
function streak(f) {
  const vars = new MolangVariableMap();
  const top = topAt(overworld(), f.impact.x, f.impact.z);
  if (top) f.y = top.location.y + 1;
  for (const player of overworld().getPlayers()) {
    const l = player.location;
    const dx = f.impact.x + 0.5 - l.x, dz = f.impact.z + 0.5 - l.z;
    const dist = Math.hypot(dx, dz);
    /** @type {Vector3} */
    let end;
    let scale = 1;
    const tries = dist <= PROXY_DISTANCE ? [dist] : [PROXY_DISTANCE, 70, 45];
    for (const d of tries) {
      if (dist <= PROXY_DISTANCE) end = { x: f.impact.x + 0.5, y: f.y, z: f.impact.z + 0.5 };
      else {
        scale = d / PROXY_DISTANCE; // closer stand-ins are drawn smaller, so it looks the same size
        end = { x: l.x + (dx / dist) * d, y: l.y + 8, z: l.z + (dz / dist) * d };
      }
      const life = Math.max(0.5, Math.min(STREAK_SECONDS, (MAX_Y - end.y) / (FALL_SPEED.down * scale)));
      const v = { x: f.vel.x * scale, y: f.vel.y * scale, z: f.vel.z * scale };
      vars.setFloat("variable.dx", v.x);
      vars.setFloat("variable.dy", v.y);
      vars.setFloat("variable.dz", v.z);
      vars.setFloat("variable.life", life);
      try {
        player.spawnParticle(METEOR, { x: end.x - v.x * life, y: end.y - v.y * life, z: end.z - v.z * life }, vars);
        break;
      } catch {
        // that spot isn't loaded for this player: try closer
      }
    }
  }
}

/** The boom: sound and camera shake by distance, then the crater if anyone is near. @param {Fall} f */
function land(f) {
  const { impact } = f;
  impact.state = "pending";
  delete impact.lands;
  saveImpacts();
  const shake = CONFIG.shakeDistance;
  for (const player of overworld().getPlayers()) {
    try {
      const l = player.location;
      const dx = impact.x + 0.5 - l.x, dz = impact.z + 0.5 - l.z;
      const dist = Math.hypot(dx, dz);
      const k = dist > 0.1 ? Math.min(dist, 8) / dist : 0;
      const location = { x: l.x + dx * k, y: l.y + 1, z: l.z + dz * k }; // from the impact's direction
      if (dist <= shake) {
        const near = 1 - dist / shake;
        player.playSound("random.explode", { location, volume: 0.4 + near * 0.6, pitch: 0.6 });
        player.playSound("ambient.weather.thunder", { location, volume: 0.5 + near * 0.5, pitch: 0.7 });
        player.runCommand(`camerashake add @s ${(0.1 + near * 0.4).toFixed(2)} 2 positional`);
      } else if (dist <= shake * 5) {
        player.playSound("ambient.weather.thunder", { location, volume: 0.35, pitch: 0.5 }); // a far-off rumble
      }
    } catch (e) {
      console.warn(`[meteor] ${e}`);
    }
  }
  checkPending();
}

// ---------------------------------------------------------------------------
// Craters (made where the chunk is loaded: when a player is near)
// ---------------------------------------------------------------------------

// Every 2 s: make waiting craters near players, and see who reached a crater.
system.runInterval(() => {
  try {
    checkPending();
    checkFound();
  } catch (e) {
    console.warn(`[meteor] ${e}`);
  }
}, 40);

function checkPending() {
  const list = impacts().filter((i) => i.state === "pending" && !busy.has(i.id));
  if (!list.length) return;
  const players = overworld().getPlayers();
  const reach = CONFIG.craterDistance;
  for (const impact of list) {
    if (!players.some((p) => Math.hypot(p.location.x - impact.x, p.location.z - impact.z) <= reach)) continue;
    busy.add(impact.id);
    system.runJob(makeCrater(impact));
  }
}

function checkFound() {
  const list = impacts().filter((i) => i.state === "made" && typeof i.y === "number");
  if (!list.length) return;
  const reach = CONFIG.foundDistance;
  for (const player of overworld().getPlayers()) {
    const l = player.location;
    for (const impact of list) {
      const key = `${impact.id}:${player.id}`;
      if (reached.has(key) || Math.hypot(l.x - impact.x, l.z - impact.z) > reach || Math.abs(l.y - (impact.y ?? l.y)) > 24) continue;
      reached.add(key);
      system.sendScriptEvent("realm:journal", JSON.stringify({ player: player.id, page: "weather", entry: "meteor", label: "Meteor crater" }));
      if (!impact.found) {
        impact.found = player.name;
        saveImpacts();
        world.sendMessage(`§6${player.name} found the meteor crater!`);
      }
    }
  }
}

/**
 * The ground in a column: walks down from the topmost block through air, leaves, plants and logs.
 * Undefined in an unloaded chunk, or when the ground there is water or lava.
 * @param {Dimension} dim @param {number} x @param {number} z
 */
function groundAt(dim, x, z) {
  let b = topAt(dim, x, z);
  for (let i = 0; b && i < 32; i++) {
    if (b.isLiquid) return undefined;
    if (!b.isAir && !PLANT.test(b.typeId) && !/_log$|_wood$|_stem$/.test(b.typeId)) return b;
    b = b.below();
  }
  return undefined;
}

/**
 * Is a crater safe here? Natural ground, not near spawn, and no player-made block in the 9 x 9 columns
 * around it (surface - 4 to + 4, and each column's topmost block, for roofs). Yields once per column.
 * @param {Dimension} dim @param {number} x @param {number} z @param {{ ok: boolean, y: number }} out
 * @returns {Generator<void, void, void>}
 */
function* checkSpot(dim, x, z, out) {
  out.ok = false;
  if (fromSpawn(x, z) < get("avoidSpawn")) return;
  const ground = groundAt(dim, x, z);
  if (!ground || !isNatural(ground.typeId)) return;
  const sy = ground.location.y;
  let wet = 0;
  for (let dx = -SCAN; dx <= SCAN; dx++) {
    for (let dz = -SCAN; dz <= SCAN; dz++) {
      const top = topAt(dim, x + dx, z + dz);
      if (!top) return; // unloaded
      if (isBuilt(top.typeId)) return;
      if (top.isLiquid && ++wet > 12) return; // a lake or the sea
      for (let y = sy - SCAN; y <= sy + SCAN; y++) {
        let b;
        try {
          b = dim.getBlock({ x: x + dx, y, z: z + dz });
        } catch {
          b = undefined;
        }
        if (!b) return;
        if (isBuilt(b.typeId)) return;
      }
      yield;
    }
  }
  out.ok = true;
  out.y = sy;
}

/** Finds a safe spot at or near the impact and carves the crater there. @param {Impact} impact @returns {Generator<void, void, void>} */
function* makeCrater(impact) {
  try {
    const dim = overworld();
    if (!get("craters")) {
      const g = groundAt(dim, impact.x, impact.z);
      impact.y = g ? g.location.y : undefined;
      impact.state = g ? "made" : "none";
      if (g) smoke(dim, { x: impact.x + 0.5, y: g.location.y + 1, z: impact.z + 0.5 });
      return;
    }
    const out = { ok: false, y: 0 };
    let x = impact.x, z = impact.z;
    yield* checkSpot(dim, x, z, out);
    for (let i = 0; i < ALTERNATES && !out.ok; i++) {
      const angle = Math.random() * Math.PI * 2;
      const d = rand(6, ALTERNATE_RADIUS);
      x = Math.floor(impact.x + Math.cos(angle) * d);
      z = Math.floor(impact.z + Math.sin(angle) * d);
      yield* checkSpot(dim, x, z, out);
    }
    if (!out.ok) {
      impact.state = "none";
      for (const p of dim.getPlayers()) {
        if (Math.hypot(p.location.x - impact.x, p.location.z - impact.z) <= CONFIG.craterDistance * 2) p.sendMessage("§7The meteor burned up before it reached the ground.");
      }
      return;
    }
    yield* carve(dim, x, out.y, z);
    impact.x = x;
    impact.z = z;
    impact.y = out.y;
    impact.state = "made";
    smoke(dim, { x: x + 0.5, y: out.y, z: z + 0.5 });
    for (const p of dim.getPlayers()) {
      const d = Math.hypot(p.location.x - x, p.location.z - z);
      if (d <= CONFIG.craterDistance * 2) p.playSound("random.fizz", { location: { x: x + 0.5, y: out.y + 1, z: z + 0.5 }, volume: 1, pitch: 0.8 });
    }
  } catch (e) {
    console.warn(`[meteor] crater: ${e}`);
    impact.state = "none";
  } finally {
    busy.delete(impact.id);
    saveImpacts();
  }
}

/**
 * Carves a bowl into natural blocks only (other blocks are left as they are), lines it with blackstone,
 * magma and obsidian bits, and sets the meteorite core (ancient debris in magma) in the middle.
 * @param {Dimension} dim @param {number} cx @param {number} sy the ground block's y at the center @param {number} cz
 * @returns {Generator<void, void, void>}
 */
function* carve(dim, cx, sy, cz) {
  const r = randInt(CONFIG.craterRadius.min, CONFIG.craterRadius.max);
  /** @param {number} x @param {number} y @param {number} z @param {string} type @param {boolean} [airToo] */
  const replace = (x, y, z, type, airToo = false) => {
    try {
      const b = dim.getBlock({ x, y, z });
      if (!b || b.isLiquid) return;
      if (b.isAir ? !airToo || type === "minecraft:air" : !isNatural(b.typeId) && !isOurs(b.typeId)) return;
      if (b.typeId !== type) b.setType(type);
    } catch {
      // unloaded or out of the world
    }
  };
  let floorCenter = sy - 1;
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      const d = Math.hypot(dx, dz);
      if (d > r + 0.3) continue;
      const depth = Math.max(0, Math.round((1 - (d / (r + 0.5)) ** 2) * r * 0.75));
      const x = cx + dx, z = cz + dz;
      const floor = sy - depth; // the new floor block of this column
      for (let y = sy + SCAN; y > floor; y--) replace(x, y, z, "minecraft:air");
      const roll = Math.random();
      const lining = depth === 0 ? (roll < 0.4 ? "minecraft:blackstone" : undefined) : roll < 0.5 ? "minecraft:blackstone" : roll < 0.7 ? "minecraft:magma" : roll < 0.8 ? "minecraft:obsidian" : undefined;
      if (lining) replace(x, floor, z, lining);
      if (dx === 0 && dz === 0) floorCenter = floor;
      yield;
    }
  }
  // The core: ancient debris at the bottom, magma around it.
  const spots = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }].sort((a, b) => Math.abs(a.x) + Math.abs(a.z) - (Math.abs(b.x) + Math.abs(b.z)) || Math.random() - 0.5);
  const debris = randInt(CONFIG.ancientDebris.min, CONFIG.ancientDebris.max);
  spots.forEach((s, i) => replace(cx + s.x, floorCenter, cz + s.z, i < debris ? "minecraft:ancient_debris" : "minecraft:magma"));
  replace(cx, floorCenter - 1, cz, "minecraft:magma");
}

/** The blocks a crater itself puts down (so the core can replace the lining). @param {string} id */
const isOurs = (id) => id === "minecraft:blackstone" || id === "minecraft:magma" || id === "minecraft:obsidian";

/** Smoke puffs over the crater for smokeSeconds (dimension particles: everyone near sees them). @param {Dimension} dim @param {Vector3} at */
function smoke(dim, at) {
  let left = CONFIG.smokeSeconds;
  const run = system.runInterval(() => {
    if (--left < 0) {
      system.clearRun(run);
      return;
    }
    try {
      for (let i = 0; i < 2; i++) dim.spawnParticle(SMOKE, { x: at.x + rand(-2, 2), y: at.y + 0.5, z: at.z + rand(-2, 2) });
    } catch {
      // unloaded now: try again next second
    }
  }, 20);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @returns {string} */
function describe() {
  const f = falling;
  if (f) {
    const s = Math.max(1, Math.ceil((f.landsAt - system.currentTick) / 20));
    return `§6A meteor is falling! It will land near ${f.impact.x}, ${f.impact.z} in ${s} seconds.`;
  }
  const last = impacts().at(-1);
  if (!last) return "No meteor has fallen yet.";
  const where = `${last.x}, ${last.z}`;
  if (last.state === "none") return `The last meteor came down near ${where}, but burned up before it reached the ground.`;
  if (last.state !== "made") return `The last meteor fell near ${where}. No one has been close enough to see its crater yet.`;
  return last.found ? `The last meteor fell at ${where}, y ${last.y}. Its crater was found by ${last.found}.` : `The last meteor fell at ${where}, y ${last.y}. No one has found its crater yet.`;
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:meteor",
      description: "Meteor Strikes: where the last meteor fell and whether its crater has been found",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    () => ({ status: CustomCommandStatus.Success, message: describe() })
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:meteor_now",
      description: "Meteor Strikes (operators): a meteor falls in front of you, after the usual warning",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      if (player.dimension.id !== OVERWORLD) return { status: CustomCommandStatus.Failure, message: "Meteors only fall in the Overworld." };
      if (falling) return { status: CustomCommandStatus.Failure, message: "A meteor is already falling." };
      system.run(() => {
        try {
          if (falling || !player.isValid) return;
          const view = player.getViewDirection();
          const n = Math.hypot(view.x, view.z) || 1;
          let x = player.location.x + (view.x / n) * CONFIG.nowDistance, z = player.location.z + (view.z / n) * CONFIG.nowDistance;
          const avoid = get("avoidSpawn");
          if (fromSpawn(x, z) < avoid) {
            // Push it out past the spawn area, in the same direction from spawn.
            const s = world.getDefaultSpawnLocation();
            const ax = x - s.x, az = z - s.z;
            const m = Math.hypot(ax, az);
            const ux = m > 0.1 ? ax / m : view.x / n, uz = m > 0.1 ? az / m : view.z / n;
            x = s.x + ux * (avoid + 16);
            z = s.z + uz * (avoid + 16);
          }
          launch({ x: Math.floor(x), z: Math.floor(z) });
        } catch (e) {
          console.warn(`[meteor] ${e}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "meteor_bp");
  },
  { namespaces: ["realm"] }
);
