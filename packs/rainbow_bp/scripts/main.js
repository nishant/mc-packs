import { CommandPermissionLevel, CustomCommandStatus, Dimension, GameMode, ItemStack, MolangVariableMap, Player, WeatherType, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { COLORS, SPREAD, antisolarAngle, arcDots } from "./sky.js";
import { get } from "./settings.js";

// World property "rainbow:pot": JSON { id, x, z, y?, low?, until, expires, placed, wet?, missed?, found? }
// for the current rainbow and its pot of gold (until / expires: Date.now() ms when the rainbow fades / the pot
// can no longer be found; placed: its chest is in the world; wet: that chest floats on water, which comes back
// when it's removed; missed: no safe spot for a chest, so the finder gets the loot straight into their
// inventory). Cleared once the pot expires. Pots saved by versions before 1.4.0 also have ang, by and ground
// (the old sky arc's plane and ground height): ignored.
//
// The way there is the Minimap's compass; near the end (ARC_SEE) a small rainbow of vanilla colored flame
// particles stands over it, one foot on the pot, until the pot is found or expires. While a pot is up and not found,
// realm:rainbow_pot { dim, x, z } says where it is (when it appears, when its chest moves it, on
// realm:rainbow_ping and once after world load); realm:rainbow_pot {} says there is none.
const PROP_POT = "rainbow:pot";
// World property "rainbow:left": JSON [{ x, y, z, wet? }], pot chests that were still in the world when their pot expired
// but couldn't be checked (no one near: their chunk wasn't loaded). Each is removed, if it's still an empty chest,
// once a player comes near; one with items is left. At most MAX_LEFT.
const PROP_LEFT = "rainbow:left";
// World property "rainbow:story": Date.now() ms of the last rainbow a story request put up (realm:sky_request).
const PROP_STORY = "rainbow:story";
const STORY_GAP = 30 * 60000; // at most one story rainbow per 30 real minutes
const MAX_LEFT = 20;
const OVERWORLD = "minecraft:overworld";
const ARC_SEE = 96; // the rainbow over the end is drawn while a player is this close to it
const ARC_TICKS = 10; // and redrawn this often (the flame dots fade fast)
const ARC_PARTICLE = "minecraft:colored_flame_particle"; // vanilla: takes variable.color, needs no resource pack
const MAX_SEE = 512; // players farther than this from the rainbow's end don't see it (no Journal entry)
const PLACE_DISTANCE = 40; // the pot's chest is placed when a player comes this close (its chunk is loaded then)
const FIND_DISTANCE = 3;
const MAX_HEADROOM = 24; // deeper underground than this, no rainbow
const TARGET_TRIES = 12;
const SPOT_TRIES = 10; // spots tried for the chest: its end first, then around it
const SPOT_RADIUS = 12;
const SCAN = 4; // the build scan covers 9 x 9 columns (4 each way), from the surface - 4 to + 4
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const PLANT =
  /^minecraft:(short_grass|tall_grass|fern|large_fern|dead_bush|bush|firefly_bush|dandelion|poppy|blue_orchid|allium|azure_bluet|(red|orange|white|pink)_tulip|oxeye_daisy|cornflower|lily_of_the_valley|sunflower|lilac|rose_bush|peony|pink_petals|wildflowers|leaf_litter|short_dry_grass|tall_dry_grass|snow_layer)$/;
// Ground the chest may stand on.
const GROUND = /^minecraft:(grass_block|dirt|coarse_dirt|podzol|mycelium|rooted_dirt|dirt_with_roots|mud|clay|gravel|sand|red_sand|sandstone|red_sandstone|stone|granite|diorite|andesite|tuff|calcite|moss_block|snow|terracotta|(white|orange|yellow|brown|red|light_gray)_terracotta)$/;
// Player-made blocks: the chest never goes where the scan finds one of these.
const BUILT =
  /planks|glass|chest|barrel|sign|_bed$|^minecraft:bed$|torch|lantern|door|fence|wool|carpet|concrete|glazed|crafting_table|furnace|smoker|brick|stairs|slab|_wall$|bookshelf|ladder|rail|hopper|anvil|lectern|loom|composter|_table$|grindstone|stonecutter|brewing_stand|beacon|button|lever|pressure_plate|redstone_wire|repeater|comparator|piston|observer|dispenser|dropper|flower_pot|candle|scaffolding|iron_bars|chain|stripped_|polished_|smooth_|cut_|chiseled_|frame|jukebox|noteblock|shulker_box|campfire|bell|banner|farmland|hay_block|cobblestone|_path$|waxed_|copper_block|quartz_block|purpur|lamp|cauldron|crafter|beehive|_head$|_skull$|pot$|terracotta|(iron|gold|diamond|emerald|lapis|redstone|coal|netherite|amethyst)_block|raw_/;
const NATURAL_EXCEPTIONS = /^minecraft:(moss_carpet|torchflower|(white|orange|yellow|brown|red|light_gray)?_?terracotta)$/;

/** @typedef {{ id: number, x: number, z: number, y?: number, low?: number, until: number, expires: number, placed: boolean, wet?: boolean, missed?: boolean, found?: string }} Pot */

/** @type {Pot | undefined} */
let pot;
let loaded = false;
let busy = false; // looking for the chest's spot
/** Expired pots' chests still to check (see PROP_LEFT). @type {{ x: number, y: number, z: number, wet?: boolean }[]} */
let left = [];
/** @type {Set<string>} players who saw this rainbow (journal sent) */
const saw = new Set();

const rand = (/** @type {number} */ min, /** @type {number} */ max) => min + Math.random() * (max - min);
const randInt = (/** @type {number} */ min, /** @type {number} */ max) => Math.floor(rand(min, max + 1));
/** @returns {Dimension} */
const overworld = () => world.getDimension(OVERWORLD);

/** "NE" for a direction given as x and z steps (north is -z). @param {number} dx @param {number} dz */
function compass(dx, dz) {
  const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8];
}

/** @param {number} x @param {number} z */
function fromSpawn(x, z) {
  const s = world.getDefaultSpawnLocation();
  return Math.hypot(x - s.x, z - s.z);
}

/** @param {string} id */
const isBuilt = (id) => !NATURAL_EXCEPTIONS.test(id) && !PLANT.test(id) && BUILT.test(id);

/** @param {Dimension} dim @param {number} x @param {number} z */
function topAt(dim, x, z) {
  try {
    // In an unloaded chunk this can return a block whose every property throws LocationInUnloadedChunkError
    // (that broke /realm:rainbow_now for any end far enough away): read it here, inside the try.
    const block = dim.getTopmostBlock({ x: Math.floor(x), z: Math.floor(z) });
    if (block) void block.typeId, block.isLiquid;
    return block;
  } catch {
    return undefined;
  }
}

const WATERY = /water|kelp|seagrass|bubble_column/;

/**
 * The surface at a column, water included: getTopmostBlock skips water (it answers the sea floor), so this climbs
 * through the water (and kelp, seagrass) over it. `wet` says whether there was any, `floor` is the block under it.
 * undefined while unloaded.
 * @param {Dimension} dim @param {number} x @param {number} z @returns {{ y: number, wet: boolean, floor: number } | undefined}
 */
function surfaceAt(dim, x, z) {
  const top = topAt(dim, x, z);
  if (!top) return undefined;
  let b = top;
  let wet = !!top.isLiquid;
  try {
    for (let i = 0; i < 64; i++) {
      const up = b.above();
      if (!up || !(up.isLiquid || WATERY.test(up.typeId))) break;
      b = up;
      wet = true;
    }
  } catch {
    // the top of the world, or unloaded above
  }
  return { y: b.location.y, wet, floor: top.location.y };
}

function savePot() {
  try {
    world.setDynamicProperty(PROP_POT, pot ? JSON.stringify(pot) : undefined);
  } catch (e) {
    console.warn(`[rainbow] ${e}`);
  }
}

/** Reads the saved pot once the world is up (at load, or on first use after a script reload). */
function load() {
  if (loaded) return;
  let raw;
  try {
    raw = world.getDynamicProperty(PROP_POT);
  } catch {
    return; // the world isn't up yet
  }
  loaded = true;
  try {
    const saved = typeof raw === "string" ? JSON.parse(raw) : undefined;
    if (!pot && saved && typeof saved.x === "number" && typeof saved.z === "number" && typeof saved.expires === "number") {
      delete saved.ang, delete saved.by, delete saved.ground; // from older versions, when the arc was drawn
      pot = saved;
    }
  } catch {
    console.warn(`[rainbow] ${PROP_POT} is corrupt; ignoring it`);
  }
  try {
    const raw2 = world.getDynamicProperty(PROP_LEFT);
    const saved = typeof raw2 === "string" ? JSON.parse(raw2) : [];
    if (Array.isArray(saved)) left = [...saved.filter((c) => c && [c.x, c.y, c.z].every(Number.isFinite)), ...left].slice(-MAX_LEFT);
  } catch {
    console.warn(`[rainbow] ${PROP_LEFT} is corrupt; ignoring it`);
  }
}

/** Tells the Minimap where the unfound pot of gold is, or that there is none (realm:rainbow_pot). */
function broadcastPot() {
  const p0 = pot;
  const up = p0 && !p0.found && Date.now() < p0.expires;
  try {
    system.sendScriptEvent("realm:rainbow_pot", up ? JSON.stringify({ dim: OVERWORLD, x: Math.floor(p0.x), z: Math.floor(p0.z) }) : "{}");
  } catch (e) {
    console.warn(`[rainbow] ${e}`);
  }
}

function saveLeft() {
  try {
    world.setDynamicProperty(PROP_LEFT, left.length ? JSON.stringify(left) : undefined);
  } catch (e) {
    console.warn(`[rainbow] ${e}`);
  }
}

world.afterEvents.worldLoad.subscribe(() => {
  load();
  system.runTimeout(() => {
    load();
    broadcastPot();
  }, 40);
});

// ---------------------------------------------------------------------------
// Safe zones (realm:zones from Safe Zones, Town Projects, Land Claims): no pot chest inside one
// ---------------------------------------------------------------------------

/** @typedef {{ dim: string, x: number, z: number, r: number, square: boolean }} Zone square: a land claim (x - r to x + r, z - r to z + r), else a circle */
/** src -> its zones, gathered from the parts of its latest broadcast. @type {Map<string, Zone[]>} */
const zones = new Map();
/** src -> parts received so far of a broadcast in progress. @type {Map<string, { parts: number, got: Map<number, Zone[]> }>} */
const zoneParts = new Map();

/** Is this spot inside any safe zone (Overworld)? @param {number} x @param {number} z */
function inZone(x, z) {
  for (const list of zones.values())
    for (const zn of list) {
      if (zn.dim !== OVERWORLD) continue;
      if (zn.square ? Math.abs(x - zn.x) <= zn.r && Math.abs(z - zn.z) <= zn.r : Math.hypot(x - zn.x, z - zn.z) <= zn.r) return true;
    }
  return false;
}

/** @param {any} msg */
function onZones(msg) {
  if (!msg || typeof msg.src !== "string") return;
  const src = msg.src.slice(0, 32);
  const parts = Math.floor(Number(msg.parts));
  if (!Number.isFinite(parts) || parts <= 0) {
    zones.delete(src); // parts 0: the provider has no zones
    zoneParts.delete(src);
    return;
  }
  /** @type {Zone[]} */
  const list = [];
  for (const zn of Array.isArray(msg.zones) ? msg.zones : []) {
    if (!zn || !Number.isFinite(zn.x) || !Number.isFinite(zn.z) || !Number.isFinite(zn.r)) continue;
    const dim = typeof zn.dim === "string" ? (zn.dim.includes(":") ? zn.dim : `minecraft:${zn.dim}`) : OVERWORLD;
    list.push({ dim, x: zn.x, z: zn.z, r: Math.max(0, zn.r), square: zn.shape === "square" });
  }
  // Parts may be numbered from 1 (or from 0): a part at or below the first one starts a new broadcast.
  const part = Math.floor(Number(msg.part)) || 0;
  let entry = zoneParts.get(src);
  if (!entry || part <= Math.min(...entry.got.keys()) || entry.parts !== parts) zoneParts.set(src, (entry = { parts, got: new Map() }));
  entry.got.set(part, list);
  if (entry.got.size >= parts) {
    zones.set(src, [...entry.got.values()].flat());
    zoneParts.delete(src);
  }
}

world.afterEvents.worldLoad.subscribe(() => system.runTimeout(() => system.sendScriptEvent("realm:zones_ping", "{}"), 40));

// ---------------------------------------------------------------------------
// Crowns (the shared "crowns" scoreboard; works without the Crowns pack)
// ---------------------------------------------------------------------------

function crownsObjective() {
  try {
    return world.scoreboard.getObjective("crowns") ?? world.scoreboard.addObjective("crowns", "Crowns");
  } catch {
    return world.scoreboard.getObjective("crowns"); // another pack created it this tick
  }
}

/** @param {Player} p @param {number} n */
function addCrowns(p, n) {
  try {
    crownsObjective()?.addScore(p, Math.floor(n));
    return true;
  } catch (e) {
    console.warn(`[rainbow] crowns: ${e}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// A rainbow appears
// ---------------------------------------------------------------------------

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather, previousWeather }) => {
  if ((dimension !== OVERWORLD && dimension !== "overworld") || newWeather !== WeatherType.Clear || previousWeather === WeatherType.Clear) return;
  try {
    load();
    if (!get("enabled") || (pot && !pot.found && Date.now() < pot.expires)) return; // one pot of gold at a time
    const tod = world.getTimeOfDay();
    const morning = tod >= 0 && tod <= 3000, evening = tod >= 9000 && tod <= 12000;
    if (!morning && !evening) return;
    if (Math.random() >= get("chance")) return;
    const players = overworld().getPlayers().filter((p) => p.getGameMode() !== GameMode.Spectator);
    if (players.length) appear(players[Math.floor(Math.random() * players.length)]);
  } catch (e) {
    console.warn(`[rainbow] ${e}`);
  }
});

/** Puts a rainbow up, with its end somewhere 150-300 blocks from `player`. @param {Player} player @returns {boolean} */
function appear(player) {
  const dim = overworld();
  for (let i = 0; i < TARGET_TRIES; i++) {
    // Opposite the sun (or the moon), as real rainbows are; if those spots keep failing, any direction.
    const angle = i < TARGET_TRIES / 2 ? antisolarAngle(world.getTimeOfDay()) + (Math.random() * 2 - 1) * SPREAD : Math.random() * Math.PI * 2;
    const d = rand(CONFIG.distance.min, CONFIG.distance.max);
    const x = Math.floor(player.location.x + Math.cos(angle) * d), z = Math.floor(player.location.z + Math.sin(angle) * d);
    if (fromSpawn(x, z) < get("avoidSpawn") || inZone(x, z)) continue;
    const top = surfaceAt(dim, x, z); // usually not loaded this far out; when it is, skip water now
    if (top?.wet) continue;
    const now = Date.now();
    // Replacing an earlier pot (an operator's /realm:rainbow_now, or one past its time): its chest goes if it's empty.
    if (pot) expire(pot);
    pot = { id: now, x, z, until: now + get("durationSeconds") * 1000, expires: now + Math.max(get("durationSeconds") / 60, get("potMinutes")) * 60000, placed: false };
    saw.clear();
    savePot();
    for (const p of dim.getPlayers()) p.sendMessage(`§eA rainbow! Its pot of gold is somewhere to the ${compass(x + 0.5 - p.location.x, z + 0.5 - p.location.z)}: follow the rainbow on your compass.`);
    system.sendScriptEvent("realm:sky_event", JSON.stringify({ kind: "rainbow", dim: OVERWORLD, x, z, text: "A rainbow, with a pot of gold at its end" }));
    broadcastPot();
    watch(pot);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Who sees it: every player in the Overworld within MAX_SEE of its end and not deep underground, while the
// rainbow lasts, gets its Journal entry once (nothing is drawn: the Minimap shows it on the compass).
// ---------------------------------------------------------------------------

/** @param {Pot} p0 */
function watch(p0) {
  if (Date.now() >= p0.until) return;
  const dim = overworld();
  for (const player of dim.getPlayers()) {
    if (saw.has(player.id)) continue;
    try {
      const l = player.location;
      if (Math.hypot(l.x - (p0.x + 0.5), l.z - (p0.z + 0.5)) > MAX_SEE) continue;
      const top = topAt(dim, l.x, l.z);
      if (top && top.location.y - l.y > MAX_HEADROOM) continue; // far underground
      saw.add(player.id);
      system.sendScriptEvent("realm:journal", JSON.stringify({ player: player.id, page: "weather", entry: "rainbow", label: "Rainbow" }));
    } catch (e) {
      console.warn(`[rainbow] ${e}`);
    }
  }
}

// ---------------------------------------------------------------------------
// The pot of gold
// ---------------------------------------------------------------------------

// Every second: Journal entries for who sees the rainbow, place the chest when someone gets close, see who reaches
// it first, expire it.
system.runInterval(() => {
  load();
  if (!loaded) return;
  if (left.length) sweepLeft();
  const p0 = pot;
  if (!p0) return;
  try {
    if (Date.now() >= p0.expires) {
      expire(p0);
      return;
    }
    watch(p0);
    if (p0.found) return;
    for (const player of overworld().getPlayers()) {
      const l = player.location;
      const d = Math.hypot(l.x - (p0.x + 0.5), l.z - (p0.z + 0.5));
      if (!p0.placed && !p0.missed && !busy && d <= PLACE_DISTANCE) {
        busy = true;
        system.runJob(placePot(p0));
      }
      if (d <= FIND_DISTANCE && (typeof p0.y !== "number" || (l.y <= p0.y + 5 && l.y >= (p0.low ?? p0.y + 1) - 4)) && (p0.placed || p0.missed)) {
        if (player.getGameMode() === GameMode.Spectator) continue;
        find(p0, player);
        return;
      }
    }
  } catch (e) {
    console.warn(`[rainbow] ${e}`);
  }
}, 20);

// ---------------------------------------------------------------------------
// The rainbow over the end: while the pot is up and unfound and a player is within ARC_SEE, a small rainbow of
// colored flame dots stands at its real spot, its outer foot on the pot (the chest once it's placed). It stands
// across the line from the first player who comes near, so they see it face on. Before the chest is placed its
// foot is the surface at the end (the water's surface on water), read once the land there is loaded.
// ---------------------------------------------------------------------------

/** The current arc: for which pot and spot, and its dots. @type {{ key: string, ang: number, dots: { x: number, y: number, z: number, band: number }[] } | undefined} */
let arc;
/** One color per band, made on first use (a MolangVariableMap can't be made while the scripts load). @type {MolangVariableMap[] | undefined} */
let arcColors;

/** @param {Pot} p0 */
function drawArc(p0) {
  if (p0.found || Date.now() >= p0.expires) return;
  const dim = overworld();
  const cx = p0.x + 0.5, cz = p0.z + 0.5;
  let near;
  let nearD = Infinity;
  for (const pl of dim.getPlayers()) {
    const d = Math.hypot(pl.location.x - cx, pl.location.z - cz);
    if (d < nearD) [near, nearD] = [pl, d];
  }
  if (!near || nearD > ARC_SEE) return;
  let y = p0.y;
  if (typeof y !== "number") {
    const top = surfaceAt(dim, p0.x, p0.z); // undefined while the end's land isn't loaded
    if (!top) return;
    y = top.y + 1;
  }
  const key = `${p0.id}|${p0.x}|${y}|${p0.z}`;
  if (arc?.key !== key) {
    // Keep the plane when only the foot moved (the chest went up to 12 blocks away): across the first viewer's line.
    const ang = arc && arc.key.startsWith(`${p0.id}|`) ? arc.ang : Math.atan2(cz - near.location.z, cx - near.location.x) + (p0.id % 2 ? Math.PI / 2 : -Math.PI / 2);
    arc = { key, ang, dots: arcDots({ x: cx, y: y + (p0.placed ? 0.9 : 0.2), z: cz }, ang) };
  }
  arcColors ??= COLORS.map(([red, green, blue]) => {
    const m = new MolangVariableMap();
    m.setColorRGB("variable.color", { red, green, blue });
    return m;
  });
  for (const d of arc.dots) {
    try {
      dim.spawnParticle(ARC_PARTICLE, d, arcColors[d.band]);
    } catch {
      // that part isn't loaded
    }
  }
}

system.runInterval(() => {
  const p0 = pot;
  if (!loaded || !p0) return;
  try {
    drawArc(p0);
  } catch (e) {
    console.warn(`[rainbow] arc: ${e}`);
  }
}, ARC_TICKS);

/**
 * Looks for a safe spot for the chest: the rainbow's end first, then nearby. Natural ground with air
 * (or a low plant) on it, not near spawn, and no player-made block in the 9 x 9 columns around it.
 * @param {Pot} p0 @returns {Generator<void, void, void>}
 */
function* placePot(p0) {
  // Part of the land not loaded (and ticking) yet: try again next second instead of giving up on a chest.
  let unloaded = false;
  try {
    const dim = overworld();
    for (let i = 0; i < SPOT_TRIES; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = i === 0 ? 0 : rand(2, SPOT_RADIUS);
      const x = Math.floor(p0.x + Math.cos(angle) * r), z = Math.floor(p0.z + Math.sin(angle) * r);
      if (fromSpawn(x, z) < get("avoidSpawn") || inZone(x, z)) continue; // never near spawn or in a safe zone
      let ground = topAt(dim, x, z);
      if (ground && PLANT.test(ground.typeId)) ground = ground.below();
      if (!ground) unloaded = true;
      if (!ground || !GROUND.test(ground.typeId)) continue; // water, leaves, builds, unloaded
      const sy = ground.location.y;
      let safe = true;
      for (let dx = -SCAN; dx <= SCAN && safe; dx++) {
        for (let dz = -SCAN; dz <= SCAN && safe; dz++) {
          const top = topAt(dim, x + dx, z + dz);
          if (!top) unloaded = true;
          if (!top || isBuilt(top.typeId)) safe = false;
          for (let y = sy - SCAN; y <= sy + SCAN && safe; y++) {
            let b;
            try {
              b = dim.getBlock({ x: x + dx, y, z: z + dz });
            } catch {
              b = undefined;
            }
            if (!b && y >= -64 && y <= 319) unloaded = true;
            if (!b || isBuilt(b.typeId)) safe = false;
          }
          yield;
        }
      }
      if (!safe || pot !== p0) continue;
      const spot = ground.above();
      if (!spot || !(spot.isAir || PLANT.test(spot.typeId))) continue;
      spot.setType("minecraft:chest");
      fill(spot.getComponent("minecraft:inventory")?.container);
      p0.x = x;
      p0.z = z;
      p0.y = spot.location.y;
      p0.placed = true;
      savePot();
      broadcastPot(); // the chest may stand up to SPOT_RADIUS from the end
      return;
    }
    // The end is out on the water (getTopmostBlock answers the sea bed there, and the spot over it is water, so no
    // land spot above was taken): the chest floats at the water's surface, under the open sky, where it can be seen.
    if (pot === p0 && !unloaded) {
      const top = surfaceAt(dim, p0.x, p0.z);
      const water = top?.wet ? dim.getBlock({ x: Math.floor(p0.x), y: top.y, z: Math.floor(p0.z) }) : undefined;
      if (top && water && water.typeId === "minecraft:water" && water.above()?.isAir && fromSpawn(p0.x, p0.z) >= get("avoidSpawn") && !inZone(p0.x, p0.z)) {
        water.setType("minecraft:chest");
        fill(water.getComponent("minecraft:inventory")?.container);
        p0.x = Math.floor(p0.x);
        p0.z = Math.floor(p0.z);
        p0.y = top.y;
        p0.low = top.floor + 1; // a swimmer under it finds it too
        p0.placed = true;
        p0.wet = true;
        savePot();
        broadcastPot();
        return;
      }
    }
    // No safe spot: the pot of gold is still there to find, and its loot goes straight to the finder. Its height
    // is the surface at its end, so flying high over it doesn't count as reaching it.
    if (pot === p0 && !unloaded) {
      // On water, its surface: a swimmer or a boat there finds it.
      const top = surfaceAt(dim, p0.x, p0.z);
      if (top) p0.y = top.y + 1;
      if (top?.wet) p0.low = top.floor + 1; // and anywhere down to the bottom
      p0.missed = true;
      savePot();
    }
  } catch (e) {
    console.warn(`[rainbow] pot: ${e}`);
  } finally {
    busy = false;
  }
}

/** @returns {ItemStack[]} the pot's loot, rolled from CONFIG.loot */
function rollLoot() {
  /** @type {ItemStack[]} */
  const items = [];
  for (const entry of CONFIG.loot) {
    if (Math.random() >= entry.chance) continue;
    try {
      items.push(new ItemStack(entry.item, randInt(entry.min, entry.max)));
    } catch (e) {
      console.warn(`[rainbow] loot ${entry.item}: ${e}`);
    }
  }
  return items;
}

/** Puts the loot in random slots. @param {import("@minecraft/server").Container | undefined} container */
function fill(container) {
  if (!container) return;
  const slots = [...Array(container.size).keys()].sort(() => Math.random() - 0.5);
  rollLoot().forEach((item, i) => container.setItem(slots[i % slots.length], item));
}

/** @param {Pot} p0 @param {Player} player */
function find(p0, player) {
  p0.found = player.name;
  savePot();
  broadcastPot();
  const crowns = get("crowns");
  if (crowns > 0 && addCrowns(player, crowns)) player.sendMessage(`§6+${crowns} Crowns §7(Pot of gold)`);
  if (p0.missed) {
    // No chest could be placed here: the loot goes into the finder's inventory (what doesn't fit drops at their feet).
    const inv = player.getComponent("minecraft:inventory")?.container;
    for (const item of rollLoot()) {
      const left = inv ? inv.addItem(item) : item;
      if (left) player.dimension.spawnItem(left, player.location);
    }
    player.sendMessage("§eNo chest could stand here: the pot's gold is in your inventory.");
  }
  const relics = CONFIG.relics;
  if (relics.length && Math.random() < get("relicChance")) {
    system.sendScriptEvent("realm:relic_give", JSON.stringify({ player: player.id, relic: relics[Math.floor(Math.random() * relics.length)] }));
  }
  player.playSound("random.levelup");
  world.sendMessage(`§6${player.name} found the pot of gold at the rainbow's end!`);
}

/**
 * Removes the pot chest at x, y, z if it's still an empty chest (one with items is left); one on water leaves water.
 * @param {number} x @param {number} y @param {number} z @param {boolean} [wet] @returns {boolean} false when that spot isn't loaded
 */
function clearChest(x, y, z, wet) {
  try {
    const block = overworld().getBlock({ x, y, z });
    if (!block) return false;
    const container = block.typeId === "minecraft:chest" ? block.getComponent("minecraft:inventory")?.container : undefined;
    if (container && container.emptySlotsCount === container.size) block.setType(wet ? "minecraft:water" : "minecraft:air");
    return true;
  } catch {
    return false; // unloaded
  }
}

/** Expired pots' chests that weren't loaded then: checked once a player comes near (their chunk is loaded then). */
function sweepLeft() {
  try {
    const players = overworld().getPlayers();
    const before = left.length;
    left = left.filter((c) => !players.some((p) => Math.hypot(p.location.x - (c.x + 0.5), p.location.z - (c.z + 0.5)) <= PLACE_DISTANCE) || !clearChest(c.x, c.y, c.z, c.wet));
    if (left.length !== before) saveLeft();
  } catch (e) {
    console.warn(`[rainbow] ${e}`);
  }
}

/** The pot can't be found any more: an empty chest of ours is removed, one with items is left. @param {Pot} p0 */
function expire(p0) {
  if (p0.placed && typeof p0.y === "number" && !clearChest(p0.x, p0.y, p0.z, p0.wet)) {
    // Unloaded: removed (if still empty) when a player next comes near.
    left = [...left, { x: p0.x, y: p0.y, z: p0.z, ...(p0.wet ? { wet: true } : {}) }].slice(-MAX_LEFT);
    saveLeft();
  }
  if (pot === p0) {
    pot = undefined;
    savePot();
    broadcastPot();
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {Player | undefined} player */
function describe(player) {
  load();
  const p0 = pot;
  const now = Date.now();
  if (!p0 || now >= p0.expires) return "No rainbow right now.";
  if (p0.found) return now < p0.until ? `There's a rainbow, but its pot of gold was already found by ${p0.found}.` : `No rainbow right now. The last pot of gold was found by ${p0.found}.`;
  if (!player || player.dimension.id !== OVERWORLD) return now < p0.until ? "There's a rainbow in the Overworld." : "A pot of gold is still out there in the Overworld.";
  const dir = compass(p0.x + 0.5 - player.location.x, p0.z + 0.5 - player.location.z);
  return now < p0.until
    ? `§eA rainbow is up! Its pot of gold is somewhere to the ${dir} (the rainbow on your compass).`
    : `§eThe rainbow still stands over its pot of gold, somewhere to the ${dir} (the rainbow on your compass).`;
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:rainbow",
      description: "Rainbows: whether a rainbow is up, and which way its end (and the pot of gold) is",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const source = origin.initiator ?? origin.sourceEntity;
      return { status: CustomCommandStatus.Success, message: describe(source instanceof Player ? source : undefined) };
    }
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:rainbow_now",
      description: "Rainbows (operators): a rainbow now, with its pot of gold 150-300 blocks from you",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      if (player.dimension.id !== OVERWORLD) return { status: CustomCommandStatus.Failure, message: "Rainbows only appear in the Overworld." };
      system.run(() => {
        try {
          if (!player.isValid) return;
          // Any unfound pot is replaced (its chest, if placed, stays with its loot).
          if (!appear(player)) player.sendMessage("§cNo spot for the rainbow's end was found (too close to spawn, or in a safe zone?). Try again elsewhere.");
        } catch (e) {
          console.warn(`[rainbow] ${e}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
});

// ---------------------------------------------------------------------------
// Story requests: realm:sky_request { kind: "rainbow", player, from, dim?, reason? }
// ---------------------------------------------------------------------------

/** @param {unknown} v @param {number} max */
const optText = (v, max) => v === undefined || (typeof v === "string" && v.length <= max);

/**
 * A rainbow for that player, as after rain (its end 150-300 blocks away, out of safe zones and the spawn
 * area, with its pot of gold). Ignored silently when the pack or its Story events setting is disabled, a
 * rainbow or an unfound pot of gold is already out, the last story rainbow was under 30 minutes ago, the
 * player isn't in the Overworld, or the message is malformed.
 * @param {string} message
 */
function skyRequest(message) {
  let req;
  try {
    req = JSON.parse(message);
  } catch {
    return;
  }
  if (!req || typeof req !== "object" || Array.isArray(req) || req.kind !== "rainbow") return;
  if (typeof req.player !== "string" || !req.player || req.player.length > 64 || !optText(req.from, 64) || !optText(req.reason, 200)) return;
  if (req.dim !== undefined && req.dim !== OVERWORLD) return;
  if (!get("enabled") || get("storyEvents") !== true) return;
  if (world.getTimeOfDay() > 12000) return; // rainbows are a daytime thing, even in a story
  load();
  const now = Date.now();
  if (pot && now < pot.expires && (!pot.found || now < pot.until)) return; // one rainbow, one pot of gold at a time
  const last = world.getDynamicProperty(PROP_STORY);
  if (typeof last === "number" && now >= last && now - last < STORY_GAP) return;
  const player = overworld().getPlayers().find((p) => p.id === req.player);
  if (!player || player.getGameMode() === GameMode.Spectator) return;
  if (appear(player)) world.setDynamicProperty(PROP_STORY, now);
}

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "rainbow_bp");
    else if (id === "realm:rainbow_ping") {
      load();
      broadcastPot();
    }
    else if (id === "realm:sky_request") {
      try {
        skyRequest(message);
      } catch (e) {
        console.warn(`[rainbow] ${e}`);
      }
    }
    else if (id === "realm:zones") {
      try {
        onZones(JSON.parse(message));
      } catch {
        // not a zone list
      }
    }
  },
  { namespaces: ["realm"] }
);
