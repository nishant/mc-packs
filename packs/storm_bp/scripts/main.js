import "./diag.js";
import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, Dimension, ItemStack, Player, WeatherType, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, getFor } from "./settings.js";
import { protectedBox } from "./zones.js";

const PROP_WEATHER = "storm:weather"; // world: overworld weather from the last change; scripts can't read the current weather
const PROP_CELL = "storm:cell"; // world: JSON of the current storm cell, so it survives a restart
const PROP_RODS = "storm:rods"; // world: JSON [[dim, x, y, z, charged 0|1], ...] lightning rods players placed
const OVERWORLD = "minecraft:overworld";
const DIMS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];
// Lightning rods oxidize (exposed, weathered, oxidized) and can be waxed: every variant is still the same rod.
/** @param {string} id */
const isRod = (id) => /^minecraft:(waxed_)?((exposed|weathered|oxidized)_)?lightning_rod$/.test(id);
const SPARK = "realm:sky_spark"; // from the Realm Skies resource pack; without it nothing shows
const BOLT = "minecraft:lightning_bolt";
const ROD_REACH = 3; // a bolt this close to a rod (blocks) charges it
const REPORT_EVERY = 2; // seconds between realm:storm_cell reports
const SAVE_EVERY = 10; // seconds between saves of the moving cell
const SCAN = 4; // the player-build scan covers (2 * SCAN + 1)^2 columns around a strike
const SCAN_DEPTH = 4; // and the surface block plus this many under it
// Blocks players build with. A strike near one is skipped, so the storm never sets a build on fire.
const BUILT =
  /planks|glass|chest|barrel|sign|_bed$|^minecraft:bed$|torch|lantern|door|fence|wool|carpet|concrete|glazed_terracotta|crafting_table|furnace|smoker|bookshelf|brick|slab|stairs|_wall$|lectern|anvil|ladder|scaffolding|hay_block|campfire|banner|smooth_stone|quartz|stripped_|lightning_rod|rail|redstone|hopper|dispenser|dropper|piston|observer|lever|button|pressure_plate|trapdoor|frame|flower_pot|composter|cauldron|brewing_stand|enchanting_table|beacon|shulker_box|loom|cartography_table|fletching_table|smithing_table|stonecutter|grindstone|bell|chain|candle|jukebox|noteblock|target|tnt|farmland|bamboo_block|beehive|polished|chiseled|cut_|copper(?!_ore)|_path$|item_frame|honeycomb_block|lodestone|respawn_anchor|crafter|vault|decorated_pot/;

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {{ x: number, z: number, heading: number, speed: number, age: number, life: number, peak: number, forced: boolean }} Cell heading: radians, 0 = north, clockwise */
/** @typedef {[number, number, number, number, number]} Rod [dim index, x, y, z, charged] */

/** @type {WeatherType} */
let weather = WeatherType.Clear;
/** @type {Cell | undefined} */
let cell;
let nextStrike = 0; // seconds until the next strike
let nextFormTick = 0; // no new cell before this tick
let seconds = 0;
/** Players who got the journal entry for the current cell. @type {Set<string>} */
let journaled = new Set();

/** @param {number} a @param {number} b */
const between = (a, b) => a + Math.random() * (Math.max(a, b) - a);

/** 8-way compass direction (north is -z). @param {number} dx @param {number} dz */
function direction(dx, dz) {
  const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
}

const overworld = () => world.getDimension("overworld");

/** Strength 1-10: rises to the cell's peak halfway through its life, then falls. @param {Cell} c */
function strength(c) {
  const t = Math.max(0, Math.min(1, c.age / Math.max(1, c.life)));
  return Math.max(1, Math.min(10, Math.round(c.peak * Math.sin(Math.PI * t))));
}

/** "Cell: 340m NE, strength 7/10" for a player, or "No storm cell." @param {Player} player */
function reading(player) {
  if (!cell || player.dimension.id !== OVERWORLD) return "No storm cell.";
  const dx = cell.x - player.location.x;
  const dz = cell.z - player.location.z;
  return `Cell: ${Math.round(Math.hypot(dx, dz))}m ${direction(dx, dz)}, strength ${strength(cell)}/10`;
}

// ---------------------------------------------------------------------------
// Weather and saved state
// ---------------------------------------------------------------------------

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather }) => {
  if (dimension !== OVERWORLD && dimension !== "overworld") return; // the event names it "overworld" on BDS 1.26
  // A storm that just started gets its first cell 10 to 40 seconds in, not at once.
  if (newWeather === WeatherType.Thunder && weather !== WeatherType.Thunder) nextFormTick = Math.max(nextFormTick, system.currentTick + Math.floor(between(200, 800)));
  weather = newWeather;
  try {
    world.setDynamicProperty(PROP_WEATHER, newWeather);
  } catch (e) {
    console.warn(`[storm] ${e}`);
  }
});

function saveCell() {
  try {
    world.setDynamicProperty(PROP_CELL, cell ? JSON.stringify(cell) : undefined);
  } catch (e) {
    console.warn(`[storm] ${e}`);
  }
}

world.afterEvents.worldLoad.subscribe(() => {
  try {
    const saved = world.getDynamicProperty(PROP_WEATHER);
    if (saved === WeatherType.Rain || saved === WeatherType.Thunder) weather = saved;
    const raw = world.getDynamicProperty(PROP_CELL);
    const c = typeof raw === "string" ? JSON.parse(raw) : undefined;
    const ok = c && ["x", "z", "heading", "speed", "age", "life", "peak"].every((k) => Number.isFinite(c[k]));
    if (ok && (c.forced || weather === WeatherType.Thunder)) {
      cell = { x: c.x, z: c.z, heading: c.heading, speed: c.speed, age: c.age, life: c.life, peak: c.peak, forced: !!c.forced };
      nextStrike = between(CONFIG.strikeSecondsMin, CONFIG.strikeSecondsMax);
    } else if (raw !== undefined) world.setDynamicProperty(PROP_CELL, undefined);
  } catch (e) {
    console.warn(`[storm] saved cell: ${e}`);
  }
  nextFormTick = system.currentTick + 200;
  loadRods();
});

// ---------------------------------------------------------------------------
// The storm cell
// ---------------------------------------------------------------------------

/** Tells other packs (Relics' Storm Meter) where the cell is, and the Field Journal who's near it. */
function report() {
  if (!cell) {
    system.sendScriptEvent("realm:storm_cell", JSON.stringify({ dim: null }));
    return;
  }
  const c = cell;
  system.sendScriptEvent("realm:storm_cell", JSON.stringify({ dim: OVERWORLD, x: Math.round(c.x), z: Math.round(c.z), strength: strength(c) }));
  for (const p of world.getAllPlayers()) {
    if (p.dimension.id !== OVERWORLD || journaled.has(p.id) || Math.hypot(p.location.x - c.x, p.location.z - c.z) > CONFIG.journalRadius) continue;
    journaled.add(p.id);
    system.sendScriptEvent("realm:journal", JSON.stringify({ player: p.id, page: "weather", entry: "storm_cell", label: "Storm cell" }));
  }
}

/**
 * Starts a cell `min` to `max` blocks from `player`.
 * @param {Player} player @param {number} min @param {number} max @param {boolean} forced lasts even if the thunderstorm ends
 */
function form(player, min, max, forced) {
  const a = Math.random() * Math.PI * 2;
  const d = between(min, max);
  cell = {
    x: player.location.x + Math.sin(a) * d,
    z: player.location.z - Math.cos(a) * d,
    heading: Math.random() * Math.PI * 2,
    speed: between(CONFIG.minSpeed, CONFIG.maxSpeed),
    age: 0,
    life: Math.round(between(CONFIG.minLifeSeconds, CONFIG.maxLifeSeconds)),
    peak: Math.round(between(5, 10)),
    forced,
  };
  journaled = new Set();
  nextStrike = between(CONFIG.strikeSecondsMin, CONFIG.strikeSecondsMax);
  saveCell();
  const c = cell;
  system.sendScriptEvent("realm:sky_event", JSON.stringify({ kind: "storm_cell", dim: OVERWORLD, x: Math.round(c.x), z: Math.round(c.z), text: "A storm cell is forming" }));
  for (const p of world.getAllPlayers()) {
    try {
      if (p.dimension.id !== OVERWORLD || getFor(p, "formNotes") !== true) continue;
      p.sendMessage(`§9A storm cell is forming to the ${direction(c.x - p.location.x, c.z - p.location.z)}.`);
    } catch (e) {
      console.warn(`[storm] ${e}`);
    }
  }
  report();
}

function end() {
  cell = undefined;
  journaled = new Set();
  saveCell();
  report();
  nextFormTick = system.currentTick + get("gapSeconds") * 20;
}

/** Once a second. */
function tick() {
  seconds++;
  const enabled = get("enabled") === true;
  if (!cell) {
    if (!enabled || weather !== WeatherType.Thunder || system.currentTick < nextFormTick) return;
    const players = world.getAllPlayers().filter((p) => p.dimension.id === OVERWORLD);
    if (!players.length) return;
    form(players[Math.floor(Math.random() * players.length)], CONFIG.minDistance, CONFIG.maxDistance, false);
    return;
  }
  const c = cell;
  if (!enabled || (!c.forced && weather !== WeatherType.Thunder) || c.age >= c.life) {
    end();
    return;
  }
  c.age++;
  // The wind turns a little each second; the cell drifts with it.
  const turn = (CONFIG.turnPerSecond * Math.PI) / 180;
  c.heading += (Math.random() * 2 - 1) * turn;
  c.x += Math.sin(c.heading) * c.speed;
  c.z -= Math.cos(c.heading) * c.speed;
  nextStrike--;
  if (nextStrike <= 0) {
    const s = strength(c);
    // Strength 10 strikes every strikeSecondsMin, strength 1 every strikeSecondsMax, give or take a second.
    nextStrike = CONFIG.strikeSecondsMax - ((s - 1) / 9) * (CONFIG.strikeSecondsMax - CONFIG.strikeSecondsMin) + (Math.random() * 2 - 1);
    if (get("lightning") === true) strike(c);
  }
  if (seconds % REPORT_EVERY === 0) report();
  if (seconds % SAVE_EVERY === 0) saveCell();
}

system.runInterval(() => {
  try {
    tick();
  } catch (e) {
    console.warn(`[storm] ${e}`);
  }
}, 20);

// ---------------------------------------------------------------------------
// Lightning
// ---------------------------------------------------------------------------

/** @param {Dimension} dim @param {number} x @param {number} z */
function topAt(dim, x, z) {
  try {
    return dim.getTopmostBlock({ x: Math.floor(x), z: Math.floor(z) });
  } catch {
    return undefined; // unloaded
  }
}

/**
 * Is there anything players built around this spot? Unloaded columns count as built, to be safe. A job step per
 * column (81 columns, up to 405 blocks), so a strike never holds up one tick.
 * @param {Dimension} dim @param {number} x @param {number} z @returns {Generator<void, boolean, void>}
 */
function* nearBuild(dim, x, z) {
  const cx = Math.floor(x), cz = Math.floor(z);
  for (let dx = -SCAN; dx <= SCAN; dx++) {
    for (let dz = -SCAN; dz <= SCAN; dz++) {
      if ((dx * (2 * SCAN + 1) + dz) % 9 === 0) yield;
      const top = topAt(dim, cx + dx, cz + dz);
      if (!top) return true;
      for (let i = 0; i <= SCAN_DEPTH; i++) {
        try {
          const b = i === 0 ? top : dim.getBlock({ x: cx + dx, y: top.location.y - i, z: cz + dz });
          if (b && BUILT.test(b.typeId)) return true;
        } catch (e) {
          // A chunk that's loaded but not ticking throws on reading the block: count it as built, to be safe.
          if (String(e).includes("Unloaded")) return true;
        }
      }
    }
  }
  return false;
}

/** @param {Dimension} dim @param {Vector3} at */
function bolt(dim, at) {
  try {
    dim.spawnEntity(BOLT, at);
    return true;
  } catch (e) {
    console.warn(`[storm] lightning: ${e}`);
    return false;
  }
}

let striking = false; // a strike's job is still running

/** Starts one strike near the cell (a job over a few ticks), unless the last one is still looking. @param {Cell} c */
function strike(c) {
  if (striking) return;
  striking = true;
  system.runJob(
    (function* () {
      try {
        yield* strikeJob(c);
      } catch (e) {
        console.warn(`[storm] lightning: ${e}`);
      } finally {
        striking = false;
      }
    })()
  );
}

/** One strike near the cell: an uncharged rod sometimes, else a random spot. Skipped where the chunk isn't loaded. @param {Cell} c */
function* strikeJob(c) {
  const dim = overworld();
  const r = CONFIG.strikeRadius;
  const near = rods.filter((rod) => rod[0] === 0 && !rod[4] && Math.hypot(rod[1] + 0.5 - c.x, rod[3] + 0.5 - c.z) <= r);
  if (near.length && Math.random() < CONFIG.rodChance) {
    const rod = near[Math.floor(Math.random() * near.length)];
    let block;
    try {
      block = dim.getBlock({ x: rod[1], y: rod[2], z: rod[3] });
    } catch {
      block = undefined;
    }
    if (block) {
      if (!isRod(block.typeId)) forgetRod(rod);
      else if (bolt(dim, { x: rod[1] + 0.5, y: rod[2] + 1, z: rod[3] + 0.5 })) charge(rod);
      return;
    }
    // unloaded: strike somewhere else instead
  }
  const a = Math.random() * Math.PI * 2;
  const d = Math.sqrt(Math.random()) * r;
  const x = c.x + Math.sin(a) * d;
  const z = c.z - Math.cos(a) * d;
  const top = topAt(dim, x, z);
  if (!top) return; // that chunk isn't loaded: no strike this time
  const spawn = world.getDefaultSpawnLocation();
  if (Math.hypot(x - spawn.x, z - spawn.z) < CONFIG.avoidSpawn) return;
  // Safe zones (scripts/zones.js): no strike in or next to one, so no fire can start there.
  if (get("avoidZones") === true && protectedBox(OVERWORLD, { x: x - SCAN, z: z - SCAN }, { x: x + SCAN, z: z + SCAN })) return;
  if (yield* nearBuild(dim, x, z)) return;
  if (cell !== c) return; // ended (or replaced) while we looked
  // getTopmostBlock skips water (it answers the bed of a lake or the sea): the bolt strikes the water's surface.
  let y = top.location.y;
  try {
    for (let b = top.above(), i = 0; b && i < 64 && (b.isLiquid || /water|kelp|seagrass|bubble_column/.test(b.typeId)); b = b.above(), i++) y = b.location.y;
  } catch {
    // the top of the world, or unloaded above
  }
  bolt(dim, { x: Math.floor(x) + 0.5, y: y + 1, z: Math.floor(z) + 0.5 });
}

// ---------------------------------------------------------------------------
// Lightning rods
// ---------------------------------------------------------------------------

/** @type {Rod[]} */
let rods = [];

function loadRods() {
  try {
    const raw = world.getDynamicProperty(PROP_RODS);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : [];
    rods = Array.isArray(parsed) ? parsed.filter((r) => Array.isArray(r) && r.length === 5 && r.every((n) => Number.isInteger(n))) : [];
  } catch {
    console.warn("[storm] storm:rods was unreadable; forgetting placed rods");
    rods = [];
  }
}

function saveRods() {
  try {
    world.setDynamicProperty(PROP_RODS, rods.length ? JSON.stringify(rods) : undefined);
  } catch (e) {
    console.warn(`[storm] ${e}`);
  }
}

/** @param {string} dimId @param {Vector3} at */
function rodAt(dimId, at) {
  const d = DIMS.indexOf(dimId);
  return rods.find((r) => r[0] === d && r[1] === at.x && r[2] === at.y && r[3] === at.z);
}

/** @param {Rod} rod */
function forgetRod(rod) {
  rods = rods.filter((r) => r !== rod);
  saveRods();
}

/** @param {Rod} rod */
function charge(rod) {
  if (rod[4]) return;
  rod[4] = 1;
  saveRods();
  try {
    const dim = world.getDimension(DIMS[rod[0]]);
    const at = { x: rod[1] + 0.5, y: rod[2] + 1, z: rod[3] + 0.5 };
    dim.spawnParticle(SPARK, at);
    dim.playSound("beacon.power", at, { volume: 1, pitch: 1.4 });
  } catch (e) {
    console.warn(`[storm] ${e}`);
  }
}

world.afterEvents.playerPlaceBlock.subscribe(({ block }) => {
  try {
    if (!isRod(block.typeId)) return;
    const d = DIMS.indexOf(block.dimension.id);
    if (d < 0) return;
    const { x, y, z } = block.location;
    const old = rodAt(block.dimension.id, block.location);
    if (old) rods = rods.filter((r) => r !== old);
    rods.push([d, x, y, z, 0]);
    if (rods.length > CONFIG.maxRods) rods.splice(0, rods.length - CONFIG.maxRods);
    saveRods();
  } catch (e) {
    console.warn(`[storm] ${e}`);
  }
});

world.afterEvents.playerBreakBlock.subscribe(({ block, brokenBlockPermutation }) => {
  try {
    if (!isRod(brokenBlockPermutation.type.id)) return;
    const rod = rodAt(block.dimension.id, block.location);
    if (rod) forgetRod(rod);
  } catch (e) {
    console.warn(`[storm] ${e}`);
  }
});

// Any lightning bolt next to a remembered rod charges it: the cell's, natural lightning (which rods
// attract), a channeling trident's.
world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  if (entity.typeId !== BOLT || !rods.length) return;
  try {
    const d = DIMS.indexOf(entity.dimension.id);
    const at = entity.location;
    for (const rod of rods) {
      if (rod[0] !== d || rod[4]) continue;
      if (Math.hypot(rod[1] + 0.5 - at.x, rod[2] + 0.5 - at.y, rod[3] + 0.5 - at.z) <= ROD_REACH) charge(rod);
    }
  } catch (e) {
    console.warn(`[storm] ${e}`);
  }
});

/** A stack of the shared Storm Glass item. @param {number} n */
function stormGlass(n) {
  const stack = new ItemStack("minecraft:prismarine_crystals", n);
  stack.nameTag = "§r§bStorm Glass";
  stack.setLore(["§7Charged by a lightning strike"]);
  return stack;
}

/** @param {Player} player @param {Rod} rod */
function collect(player, rod) {
  if (!rod[4] || !player.isValid) return;
  let block;
  try {
    block = world.getDimension(DIMS[rod[0]]).getBlock({ x: rod[1], y: rod[2], z: rod[3] });
  } catch {
    block = undefined;
  }
  if (!block || !isRod(block.typeId)) {
    if (block) forgetRod(rod);
    return;
  }
  rod[4] = 0;
  saveRods();
  // Rod Reader (a Stormcaller talent, Skills) and the Storm set (Relics) each add one more.
  const extra = Math.min(2, callingValue(player, "rodGlass")) + (stormSet.has(player.id) ? 1 : 0);
  const n = Math.max(1, Math.round(between(CONFIG.glassMin, CONFIG.glassMax))) + extra;
  const container = player.getComponent("minecraft:inventory")?.container;
  const rest = container ? container.addItem(stormGlass(n)) : stormGlass(n);
  if (rest) player.dimension.spawnItem(rest, player.location);
  player.sendMessage(`§bYou collect ${n} Storm Glass from the lightning rod${extra ? ` (${extra} more from your Calling and relics)` : ""}.${rest ? " §7It dropped at your feet: your inventory is full." : ""}`);
  player.playSound("random.orb", { pitch: 1.5 });
}

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { player, block, isFirstEvent, itemStack } = event;
  // Another pack already refused this tap (Land Claims: a rod in someone else's claim): its glass stays there.
  if (event.cancel || !isFirstEvent || !isRod(block.typeId)) return;
  const rod = rodAt(block.dimension.id, block.location);
  if (!rod) return;
  if (rod[4]) {
    event.cancel = true; // don't place a block against it: the tap collects the glass
    system.run(() => {
      try {
        collect(player, rod);
      } catch (e) {
        console.warn(`[storm] ${e}`);
      }
    });
  } else if (!itemStack) {
    system.run(() => {
      try {
        system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: player.id, ticks: 40, from: "storm_bp" }));
        player.onScreenDisplay.setActionBar("§7This lightning rod isn't charged. A lightning strike charges it.");
      } catch (e) {
        console.warn(`[storm] ${e}`);
      }
    });
  }
});

// Charged rods spark every 2 seconds while a player is near enough to see it. A rod that's gone (blown up, pushed
// by a piston, broken by something other than a player) is forgotten then, so no sparks hang in the air.
system.runInterval(() => {
  if (!rods.some((r) => r[4])) return;
  const players = world.getAllPlayers();
  /** @type {Rod[]} */
  const gone = [];
  for (const rod of rods) {
    if (!rod[4]) continue;
    const dimId = DIMS[rod[0]];
    const at = { x: rod[1] + 0.5, y: rod[2] + 1, z: rod[3] + 0.5 };
    if (!players.some((p) => p.dimension.id === dimId && Math.hypot(p.location.x - at.x, p.location.y - at.y, p.location.z - at.z) < 48)) continue;
    try {
      const dim = world.getDimension(dimId);
      const block = dim.getBlock({ x: rod[1], y: rod[2], z: rod[3] });
      if (!block) continue; // unloaded
      if (!isRod(block.typeId)) {
        gone.push(rod);
        continue;
      }
      dim.spawnParticle(SPARK, at);
    } catch {
      // unloaded, or the resource pack isn't there
    }
  }
  if (gone.length) {
    rods = rods.filter((r) => !gone.includes(r));
    saveRods();
  }
}, 40);

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {Player} player */
function holdsClock(player) {
  const container = player.getComponent("minecraft:inventory")?.container;
  return container?.getItem(player.selectedSlotIndex)?.typeId === "minecraft:clock";
}

/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

/** @param {Player} player */
function readStorm(player) {
  if (!holdsClock(player)) player.sendMessage("§7Hold a clock to read the storm.");
  else player.sendMessage(`§9${reading(player)}`);
}

/** Starts a cell near the player. @param {Player} player @param {boolean} forced @returns {string | undefined} why it can't */
function startCell(player, forced) {
  if (player.dimension.id !== OVERWORLD) return "Storm cells only form in the overworld.";
  if (get("enabled") !== true) return "Storm cells are disabled in /realm:config.";
  if (!forced && weather !== WeatherType.Thunder) return "There's no thunderstorm. Use /realm:storm_cell true to start one anyway.";
  form(player, CONFIG.commandMinDistance, CONFIG.commandMaxDistance, forced);
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

/** /realm:storm @param {Player} player */
async function mainMenu(player) {
  const zones = get("avoidZones") === true ? " Its lightning never strikes in a safe zone." : "";
  const body = `${cell ? "There's a storm cell out there. Hold a clock to read how far it is." : weather === WeatherType.Thunder ? "A thunderstorm, but no storm cell right now." : "No storm cell right now."}${zones}`;
  /** @type {{ text: string, run: () => void }[]} */
  const actions = [{ text: "Read the storm\n§8Hold a clock", run: () => readStorm(player) }];
  if (isOp(player)) {
    /** @param {boolean} forced */
    const start = (forced) => {
      const why = startCell(player, forced);
      player.sendMessage(why ? `§c${why}` : "A storm cell is forming near you.");
    };
    if (weather === WeatherType.Thunder) actions.push({ text: "§4Start a storm cell (operator)\n§8Near you", run: () => start(false) });
    actions.push({ text: "§4Start a storm cell anyway (operator)\n§8Even without a thunderstorm", run: () => start(true) });
    if (cell) {
      actions.push({
        text: "§4End the storm cell (operator)",
        run: () => {
          if (cell) end();
          player.sendMessage("§7The storm cell is gone.");
        },
      });
    }
  }
  const f = new ActionFormData().title("§lStorm Chasing").body(body);
  for (const a of actions) f.button(a.text);
  const res = await show(player, f);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  // Every button after the first is an operator's: checked again, as the player may have been de-opped meanwhile.
  if (res.selection > 0 && !isOp(player)) return player.sendMessage("§cOnly operators can do that.");
  actions[res.selection]?.run();
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:storm",
      description: "Storm Chasing: the menu (read the storm with a clock; for operators: start or end a storm cell)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => mainMenu(player).catch((e) => console.warn(`[storm] ${e}`)));
      return { status: CustomCommandStatus.Success };
    },
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:storm_read",
      description: "Storm Chasing: read the storm cell's distance, direction and strength (hold a clock)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => {
        try {
          readStorm(player);
        } catch (e) {
          console.warn(`[storm] ${e}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    },
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:storm_cell",
      description: "Storm Chasing: start a storm cell near you now (true: even without a thunderstorm)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      optionalParameters: [{ name: "force", type: CustomCommandParamType.Boolean }],
    },
    (origin, force) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      if (player.dimension.id !== OVERWORLD) return { status: CustomCommandStatus.Failure, message: "Storm cells only form in the overworld." };
      if (get("enabled") !== true) return { status: CustomCommandStatus.Failure, message: "Storm cells are disabled in /realm:config." };
      const forced = force === true;
      if (!forced && weather !== WeatherType.Thunder) {
        return { status: CustomCommandStatus.Failure, message: "There's no thunderstorm. Use /realm:storm_cell true to start one anyway." };
      }
      system.run(() => {
        try {
          startCell(player, forced);
        } catch (e) {
          console.warn(`[storm] ${e}`);
        }
      });
      return { status: CustomCommandStatus.Success, message: "A storm cell is forming near you." };
    },
  );
});

// Callings (Skills): realm:calling carries each player's talent numbers (`bonus`: rodGlass: Rod Reader's extra Storm Glass). Kept in memory; Skills
// sends it when a player joins or changes it, and again on realm:calling_ping (asked once the world has loaded).
/** @type {Map<string, Record<string, number>>} */
const callingBonus = new Map();
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:calling") return;
    try {
      const m = JSON.parse(message);
      if (m && typeof m.player === "string" && m.bonus && typeof m.bonus === "object") callingBonus.set(m.player, m.bonus);
    } catch {
      // not ours
    }
  },
  { namespaces: ["realm"] },
);
world.afterEvents.worldLoad.subscribe(() => system.runTimeout(() => system.sendScriptEvent("realm:calling_ping", "{}"), 140));
world.afterEvents.playerLeave.subscribe(({ playerId }) => callingBonus.delete(playerId));
// Relics: players with the Storm set (realm:relic_sets) get one more Storm Glass from a rod.
/** @type {Set<string>} */
const stormSet = new Set();
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:relic_sets") return;
    try {
      const m = JSON.parse(message);
      if (!m || typeof m.player !== "string" || !Array.isArray(m.sets)) return;
      if (m.sets.includes("storm")) stormSet.add(m.player);
      else stormSet.delete(m.player);
    } catch {
      // not ours
    }
  },
  { namespaces: ["realm"] },
);
world.afterEvents.worldLoad.subscribe(() => system.runTimeout(() => system.sendScriptEvent("realm:relic_sets_ping", "{}"), 150));
world.afterEvents.playerLeave.subscribe(({ playerId }) => stormSet.delete(playerId));
/** A Calling talent's number for the player (0 without it). @param {Player} player @param {string} key */
const callingValue = (player, key) => Math.max(0, Number(callingBonus.get(player.id)?.[key]) || 0);

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "storm_bp");
  },
  { namespaces: ["realm"] },
);
