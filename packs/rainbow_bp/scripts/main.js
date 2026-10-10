import { CommandPermissionLevel, CustomCommandStatus, Dimension, GameMode, ItemStack, MolangVariableMap, Player, WeatherType, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

// World property "rainbow:pot": JSON { id, x, z, y?, until, expires, placed, missed?, found? } for the
// current rainbow and its pot of gold (until / expires: Date.now() ms when the rainbow fades / the pot
// can no longer be found; placed: its chest is in the world; missed: no safe spot for a chest, so the
// finder gets the loot straight into their inventory). Cleared once the pot expires.
const PROP_POT = "rainbow:pot";
const OVERWORLD = "minecraft:overworld";
const RAINBOW = "realm:sky_rainbow"; // particle from the Realm Skies resource pack
const DRAW_TICKS = 40; // the rainbow is redrawn for each player every 2 s...
const LIFE = 3; // ...and each lasts 3 s (1 s fades), so they overlap with no gap
const DRAW_DISTANCE = 100; // drawn this far away, toward its end (or at its real spot when closer)
// Where the band's feet are, as a fraction of the half width: the Realm Skies texture's bands run from 0.7 to 0.97
// of the half width from the middle, so the middle of a foot is 0.835 of it.
const FOOT = 0.835;
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

/** @typedef {{ id: number, x: number, z: number, y?: number, until: number, expires: number, placed: boolean, missed?: boolean, found?: string }} Pot */

/** @type {Pot | undefined} */
let pot;
let loaded = false;
let busy = false; // looking for the chest's spot
/** @type {Set<string>} players who saw this rainbow (journal sent) */
const saw = new Set();
/** One map, made on first use: the stable API may refuse native objects while the world is still loading. @type {MolangVariableMap | undefined} */
let varsMap;
const molang = () => (varsMap ??= new MolangVariableMap()); // reused: spawnParticle copies the values

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
    return dim.getTopmostBlock({ x: Math.floor(x), z: Math.floor(z) });
  } catch {
    return undefined;
  }
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
    if (!pot && saved && typeof saved.x === "number" && typeof saved.z === "number" && typeof saved.expires === "number") pot = saved;
  } catch {
    console.warn(`[rainbow] ${PROP_POT} is corrupt; ignoring it`);
  }
}

world.afterEvents.worldLoad.subscribe(load);

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
  if (dimension !== OVERWORLD || newWeather !== WeatherType.Clear || previousWeather === WeatherType.Clear) return;
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
    const angle = Math.random() * Math.PI * 2;
    const d = rand(CONFIG.distance.min, CONFIG.distance.max);
    const x = Math.floor(player.location.x + Math.cos(angle) * d), z = Math.floor(player.location.z + Math.sin(angle) * d);
    if (fromSpawn(x, z) < get("avoidSpawn")) continue;
    const top = topAt(dim, x, z); // usually not loaded this far out; when it is, skip water now
    if (top && top.isLiquid) continue;
    const now = Date.now();
    // Replacing an earlier pot (an operator's /realm:rainbow_now, or one past its time): its chest goes if it's empty.
    if (pot) expire(pot);
    pot = { id: now, x, z, until: now + get("durationSeconds") * 1000, expires: now + Math.max(get("durationSeconds") / 60, get("potMinutes")) * 60000, placed: false };
    saw.clear();
    savePot();
    for (const p of dim.getPlayers()) p.sendMessage(`§eA rainbow! Its end is somewhere to the ${compass(x - p.location.x, z - p.location.z)}.`);
    system.sendScriptEvent("realm:sky_event", JSON.stringify({ kind: "rainbow", dim: OVERWORLD, x, z, text: "A rainbow, with a pot of gold at its end" }));
    draw();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Drawing it (Player.spawnParticle: each player gets their own, pointing at the end)
// ---------------------------------------------------------------------------

system.runInterval(() => {
  if (pot && Date.now() < pot.until) draw();
}, DRAW_TICKS);

/**
 * For each player in the Overworld: the arc stands on the line toward its end, one foot exactly on that
 * line, about 100 blocks away (at its real spot when closer). The particle faces the player and its
 * position is the middle of the arc's base, so the middle goes half a width to the side of the end.
 */
function draw() {
  const p0 = pot;
  if (!p0) return;
  const dim = overworld();
  for (const player of dim.getPlayers()) {
    try {
      const l = player.location;
      const top = topAt(dim, l.x, l.z);
      if (top && top.location.y - l.y > MAX_HEADROOM) continue; // far underground
      const fx = p0.x + 0.5 - l.x, fz = p0.z + 0.5 - l.z;
      const dist = Math.max(1, Math.hypot(fx, fz));
      const ux = fx / dist, uz = fz / dist;
      const tries = dist <= DRAW_DISTANCE ? [dist] : [DRAW_DISTANCE, 70, 45];
      for (const d of tries) {
        const real = d === dist;
        const size = (real ? Math.max(40, Math.min(1, dist / DRAW_DISTANCE) * get("size")) : (get("size") * d) / DRAW_DISTANCE);
        const footY = real && typeof p0.y === "number" ? p0.y : l.y - 6 * (d / DRAW_DISTANCE); // just under the horizon
        const foot = { x: l.x + ux * d, z: l.z + uz * d };
        molang().setFloat("variable.size", size);
        molang().setFloat("variable.life", LIFE);
        try {
          const side = (size / 2) * FOOT;
          player.spawnParticle(RAINBOW, { x: foot.x - uz * side, y: footY, z: foot.z + ux * side }, molang());
          break;
        } catch {
          // not loaded there: try closer
        }
      }
      if (!saw.has(player.id)) {
        saw.add(player.id);
        system.sendScriptEvent("realm:journal", JSON.stringify({ player: player.id, page: "weather", entry: "rainbow", label: "Rainbow" }));
      }
    } catch (e) {
      console.warn(`[rainbow] ${e}`);
    }
  }
}

// ---------------------------------------------------------------------------
// The pot of gold
// ---------------------------------------------------------------------------

// Every second: place the chest when someone gets close, see who reaches it first, expire it.
system.runInterval(() => {
  load();
  const p0 = pot;
  if (!p0 || !loaded) return;
  try {
    if (Date.now() >= p0.expires) {
      expire(p0);
      return;
    }
    if (p0.found) return;
    for (const player of overworld().getPlayers()) {
      const l = player.location;
      const d = Math.hypot(l.x - (p0.x + 0.5), l.z - (p0.z + 0.5));
      if (!p0.placed && !p0.missed && !busy && d <= PLACE_DISTANCE) {
        busy = true;
        system.runJob(placePot(p0));
      }
      if (d <= FIND_DISTANCE && (typeof p0.y !== "number" || Math.abs(l.y - (p0.y + 1)) <= 4) && (p0.placed || p0.missed)) {
        if (player.getGameMode() === GameMode.Spectator) continue;
        find(p0, player);
        return;
      }
    }
  } catch (e) {
    console.warn(`[rainbow] ${e}`);
  }
}, 20);

/**
 * Looks for a safe spot for the chest: the rainbow's end first, then nearby. Natural ground with air
 * (or a low plant) on it, not near spawn, and no player-made block in the 9 x 9 columns around it.
 * @param {Pot} p0 @returns {Generator<void, void, void>}
 */
function* placePot(p0) {
  try {
    const dim = overworld();
    for (let i = 0; i < SPOT_TRIES; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = i === 0 ? 0 : rand(2, SPOT_RADIUS);
      const x = Math.floor(p0.x + Math.cos(angle) * r), z = Math.floor(p0.z + Math.sin(angle) * r);
      if (fromSpawn(x, z) < get("avoidSpawn")) continue;
      let ground = topAt(dim, x, z);
      if (ground && PLANT.test(ground.typeId)) ground = ground.below();
      if (!ground || !GROUND.test(ground.typeId)) continue; // water, leaves, builds, unloaded
      const sy = ground.location.y;
      let safe = true;
      for (let dx = -SCAN; dx <= SCAN && safe; dx++) {
        for (let dz = -SCAN; dz <= SCAN && safe; dz++) {
          const top = topAt(dim, x + dx, z + dz);
          if (!top || isBuilt(top.typeId)) safe = false;
          for (let y = sy - SCAN; y <= sy + SCAN && safe; y++) {
            let b;
            try {
              b = dim.getBlock({ x: x + dx, y, z: z + dz });
            } catch {
              b = undefined;
            }
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
      return;
    }
    // No safe spot: the pot of gold is still there to find, and its loot goes straight to the finder. Its height
    // is the surface at its end, so flying high over it doesn't count as reaching it.
    if (pot === p0) {
      const top = topAt(dim, p0.x, p0.z);
      if (top) p0.y = top.location.y + 1;
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
  const crowns = get("crowns");
  if (crowns > 0 && addCrowns(player, crowns)) player.sendMessage(`§6+${crowns} Crowns §7(Pot of gold)`);
  if (p0.missed) {
    // No chest could be placed here: the loot goes into the finder's inventory (what doesn't fit drops at their feet).
    const inv = player.getComponent("minecraft:inventory")?.container;
    for (const item of rollLoot()) {
      const left = inv ? inv.addItem(item) : item;
      if (left) player.dimension.spawnItem(left, player.location);
    }
  }
  const relics = CONFIG.relics;
  if (relics.length && Math.random() < get("relicChance")) {
    system.sendScriptEvent("realm:relic_give", JSON.stringify({ player: player.id, relic: relics[Math.floor(Math.random() * relics.length)] }));
  }
  player.playSound("random.levelup");
  world.sendMessage(`§6${player.name} found the pot of gold at the rainbow's end!`);
}

/** The pot can't be found any more: an empty chest of ours is removed, one with items is left. @param {Pot} p0 */
function expire(p0) {
  if (p0.placed && typeof p0.y === "number") {
    try {
      const block = overworld().getBlock({ x: p0.x, y: p0.y, z: p0.z });
      const container = block?.typeId === "minecraft:chest" ? block.getComponent("minecraft:inventory")?.container : undefined;
      if (block && container && container.emptySlotsCount === container.size) block.setType("minecraft:air");
    } catch {
      // unloaded: the chest stays
    }
  }
  if (pot === p0) {
    pot = undefined;
    savePot();
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
  return now < p0.until ? `§eA rainbow is up! Its end is somewhere to the ${dir}.` : `§eThe rainbow has faded, but its pot of gold is still out there, somewhere to the ${dir}.`;
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
          if (!appear(player)) player.sendMessage("§cNo spot for the rainbow's end was found (too close to spawn?). Try again elsewhere.");
        } catch (e) {
          console.warn(`[rainbow] ${e}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "rainbow_bp");
  },
  { namespaces: ["realm"] }
);
