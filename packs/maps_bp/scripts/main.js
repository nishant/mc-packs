import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, Dimension, ItemStack, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

const PACK = "maps_bp";
const PROP_HUNTS = "maps:hunts"; // player: JSON Hunt[]
const OVERWORLD = "minecraft:overworld";
const MAP_ITEM = "minecraft:paper"; // paper, not a real map: no map mechanics to fight with
const MAP_NAME = "§r§6Treasure Map";
const MAP_ID_PREFIX = "§8Map ";
const LORE_WIDTH = 38;
const DESCRIBE_DISTANCE = 96; // the map names what the spot looks like once its chunk is about to load
const FOUND_RADIUS = 3; // blocks (ignoring height, within 6 up or down) from the chest that count as finding it
const MAX_TRIES = 4; // places tried for the chest before the treasure is handed over directly
const READS_PER_RUN = 150; // block reads for chest-spot searches every 10 ticks (300 a second at most, all players together)
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];

// Blocks the chest may replace, and that may lie over it: natural ground only.
const GROUND =
  /^minecraft:(grass_block|grass|dirt|coarse_dirt|podzol|mycelium|dirt_with_roots|rooted_dirt|mud|sand|red_sand|gravel|clay|stone|andesite|diorite|granite|deepslate|tuff|sandstone|red_sandstone|snow|moss_block|calcite|hardened_clay|(white|orange|yellow|brown|red|light_gray)_terracotta)$/;
// Plants and snow on top of the ground, looked through to find it.
const SOFT = /short_grass|tall_grass|fern|flower|dandelion|poppy|tulip|orchid|allium|bluet|daisy|cornflower|lily_of_the_valley|snow_layer|deadbush|dead_bush|bush|petals|leaf_litter|torchflower/;
// Anything a player probably placed: a spot with one of these nearby is skipped (packs can't read Land Claims).
const MADE =
  /planks|glass|chest|barrel|sign|bed\b|_bed|torch|lantern|door|fence|wool|carpet|concrete|glazed|crafting_table|furnace|smoker|brick|slab|stairs|_wall|lectern|bookshelf|anvil|hopper|rail|ladder|scaffolding|campfire|bell|banner|lever|button|pressure_plate|shulker|smooth|polished|stripped|chiseled|cut_|beacon|cauldron|composter|loom|cartography|fletching|smithing|stonecutter|grindstone|brewing|enchanting|jukebox|noteblock|note_block|target|redstone_wire|repeater|comparator|piston|observer|dispenser|dropper|tnt|frame|flower_pot|farmland|grass_path|dirt_path|hay_block|cobblestone|candle|chain|bars|trapdoor|copper_bulb|copper_grate|lightning_rod|end_rod|sea_lantern|glowstone|quartz|purpur|prismarine_bricks|bamboo_mosaic|bamboo_block|crafter|vault|spawner/;
const WATERY = /water|seagrass|kelp|bubble_column/;

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {{ x: number, z: number }} XZ */
/**
 * @typedef {{ id: string, dim: string, pts: XZ[], leg: number, clue: string, place?: string, chest?: Vector3, tries: number, t: number }} Hunt
 * pts: the end of each leg (the last is the treasure), leg: the leg being followed (0-based), clue: its riddle,
 * place: what the end of the leg looks like (once seen), chest: where the chest was buried, tries: chest spots that failed
 */

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** 12345 -> "12,345". @param {number} n */
const fmt = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
/** @param {string} id @returns {Player | undefined} */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);
/** @param {number} lo @param {number} hi whole numbers, inclusive */
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (Math.max(lo, hi) - lo + 1));
/** @template T @param {T[]} list @returns {T} */
const any = (list) => list[Math.floor(Math.random() * list.length)];
/** @param {XZ} a @param {XZ} b */
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** Sends a cross-pack script event (see the build spec's contracts). @param {string} id @param {object} data */
function send(id, data) {
  try {
    system.sendScriptEvent(id, JSON.stringify(data));
  } catch (e) {
    console.warn(`[maps] ${id}: ${e}`);
  }
}

// Crowns: the shared `crowns` scoreboard (the Crowns pack shows balances; any pack may pay or charge).
function crownsObjective() {
  const sb = world.scoreboard;
  const found = sb.getObjective("crowns");
  if (found) return found;
  try {
    return sb.addObjective("crowns", "Crowns");
  } catch {
    return /** @type {import("@minecraft/server").ScoreboardObjective} */ (sb.getObjective("crowns")); // another pack made it this tick
  }
}
/** @param {Player} p */
function crownsOf(p) {
  try {
    return crownsObjective().getScore(p) ?? 0;
  } catch {
    return 0;
  }
}
/** @param {Player} p @param {number} n */
function addCrowns(p, n) {
  try {
    crownsObjective().addScore(p, Math.floor(n));
    return true;
  } catch (e) {
    console.warn(`[maps] crowns: ${e}`);
    return false;
  }
}
/** @param {Player} p @param {number} n */
function takeCrowns(p, n) {
  if (n <= 0) return true;
  if (crownsOf(p) < n) return false;
  return addCrowns(p, -n);
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

/** Splits text into lines of at most `width` characters, at spaces. @param {string} text @param {number} width */
function wrap(text, width) {
  /** @type {string[]} */
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/** @param {Dimension} dim @param {number} x @param {number} y @param {number} z */
function blockAt(dim, x, y, z) {
  try {
    return dim.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
  } catch {
    return undefined; // unloaded or outside the world
  }
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
// Clues
// ---------------------------------------------------------------------------

/** 0 = N, 1 = NE ... 7 = NW, from `a` toward `b` (north is -z, east is +x). @param {XZ} a @param {XZ} b */
function octant(a, b) {
  const deg = (Math.atan2(b.x - a.x, -(b.z - a.z)) * 180) / Math.PI;
  return Math.round((((deg % 360) + 360) % 360) / 45) % 8;
}

/** 1230 -> "about twelve hundred". @param {number} d */
function distanceWords(d) {
  const h = Math.max(1, Math.round(d / 100));
  if (h === 1) return "about a hundred";
  if (h < 10) return `about ${ONES[h]} hundred`;
  if (h === 10) return "about a thousand";
  if (h < 20) return `about ${TEENS[h - 10]} hundred`;
  if (h < 100 && h % 10 === 0) return `about ${ONES[h / 10]} thousand`;
  if (h < 100) return `about ${ONES[Math.floor(h / 10)]} thousand ${ONES[h % 10]} hundred`;
  return "many thousand";
}

/** The riddle for the hunt's current leg, from where the player stands. @param {Hunt} hunt @param {XZ} at */
function makeClue(hunt, at) {
  const target = hunt.pts[hunt.leg];
  const final = hunt.leg === hunt.pts.length - 1;
  const templates = final ? CONFIG.finalClues : CONFIG.clues;
  const text = any(templates.length ? templates : ["Walk {dir} for {dist} paces."])
    .replaceAll("{dir}", CONFIG.directions[octant(at, target)] ?? COMPASS[octant(at, target)])
    .replaceAll("{dist}", distanceWords(flat(at, target)));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "(W, about 1,000 blocks)" from where the player stands. @param {Hunt} hunt @param {XZ} at */
function plainHint(hunt, at) {
  const target = hunt.chest ?? hunt.pts[hunt.leg];
  return `(${COMPASS[octant(at, target)]}, about ${fmt(Math.max(10, Math.round(flat(at, target) / 10) * 10))} blocks)`;
}

/** What the end of a leg looks like, from a few blocks at its loaded spot; undefined while unloaded. @param {Dimension} dim @param {XZ} p */
function describe(dim, p) {
  const top = topAt(dim, p.x, p.z);
  if (!top) return undefined;
  const id = top.typeId;
  if (WATERY.test(id)) {
    let land = 0;
    for (const [dx, dz] of [[8, 0], [-8, 0], [0, 8], [0, -8]]) {
      const t = topAt(dim, p.x + dx, p.z + dz);
      if (t && !WATERY.test(t.typeId)) land++;
    }
    return land ? "where the land meets the water" : "out on the open water";
  }
  if (/sand/.test(id)) return "on the warm sand";
  if (/snow|ice/.test(id)) return "in the snow";
  if (/leaves|log|wood/.test(id)) return "among the trees";
  if (/terracotta|hardened_clay/.test(id)) return "among the red rocks";
  if (/stone|andesite|diorite|granite|gravel|tuff|calcite/.test(id)) return top.location.y > 100 ? "high on the bare mountain" : "on bare stone";
  if (/mud|mangrove|lily/.test(id)) return "in the muddy marsh";
  return top.location.y > 100 ? "high up in the hills" : "in the open fields";
}

// ---------------------------------------------------------------------------
// Hunts (cached per player)
// ---------------------------------------------------------------------------

/** @type {Map<string, Hunt[]>} */
const cache = new Map();
/** Last distance shown per player and hunt, for Warmer / Colder. @type {Map<string, number>} */
const lastDistance = new Map();

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  cache.delete(playerId);
  lastNpc.delete(playerId);
  for (const key of [...jobs.keys()]) if (key.startsWith(`${playerId}/`)) jobs.delete(key);
  for (const key of [...lastDistance.keys()]) if (key.startsWith(`${playerId}/`)) lastDistance.delete(key);
});

/** @param {Player} player @returns {Hunt[]} */
function huntsOf(player) {
  let hunts = cache.get(player.id);
  if (hunts) return hunts;
  hunts = [];
  try {
    const raw = player.getDynamicProperty(PROP_HUNTS);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : undefined;
    if (Array.isArray(parsed)) hunts = parsed.filter((h) => h && typeof h.id === "string" && Array.isArray(h.pts) && h.pts.length && typeof h.leg === "number");
  } catch {
    // corrupt: no hunts
  }
  cache.set(player.id, hunts);
  return hunts;
}

/** @param {Player} player @param {Hunt[]} hunts */
function saveHunts(player, hunts) {
  cache.set(player.id, hunts);
  try {
    player.setDynamicProperty(PROP_HUNTS, hunts.length ? JSON.stringify(hunts) : undefined);
  } catch (e) {
    console.warn(`[maps] save: ${e}`);
  }
}

/**
 * A new hunt from where the player stands: the treasure 800-2000 blocks away (away from world spawn), and 2-3 legs
 * that wander a little on the way.
 * @param {Player} player @returns {Hunt}
 */
function newHunt(player) {
  const from = { x: player.location.x, z: player.location.z };
  const lo = Math.max(100, get("minDistance"));
  const dist = randInt(lo, Math.max(lo, get("maxDistance")));
  const spawn = world.getDefaultSpawnLocation();
  const keepAway = get("avoidSpawn") + CONFIG.searchRadius + 16;
  /** @type {XZ} */
  let end = from;
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2;
    end = { x: Math.round(from.x + Math.sin(a) * dist), z: Math.round(from.z - Math.cos(a) * dist) };
    if (flat(end, spawn) >= keepAway) break;
  }
  const legs = randInt(Math.max(1, CONFIG.legsMin), Math.max(1, CONFIG.legsMin, CONFIG.legsMax));
  /** @type {XZ[]} */
  const pts = [];
  const dx = end.x - from.x;
  const dz = end.z - from.z;
  for (let i = 1; i < legs; i++) {
    const side = (Math.random() * 2 - 1) * 0.25 * (dist / legs); // a sideways wander, up to a quarter of a leg
    pts.push({ x: Math.round(from.x + (dx * i) / legs + (-dz / dist) * side), z: Math.round(from.z + (dz * i) / legs + (dx / dist) * side) });
  }
  pts.push(end);
  const taken = new Set(huntsOf(player).map((h) => h.id));
  let id = "";
  do id = Math.floor(Math.random() * 46656).toString(36).padStart(3, "0").toUpperCase();
  while (taken.has(id));
  /** @type {Hunt} */
  const hunt = { id, dim: OVERWORLD, pts, leg: 0, clue: "", tries: 0, t: Date.now() };
  hunt.clue = makeClue(hunt, from);
  return hunt;
}

/** @param {Hunt} hunt */
function mapStack(hunt) {
  const stack = new ItemStack(MAP_ITEM, 1);
  stack.nameTag = MAP_NAME;
  const lore = wrap(hunt.clue, LORE_WIDTH).map((l) => `§7${l}`);
  if (hunt.place) lore.push(...wrap(`The spot lies ${hunt.place}.`, LORE_WIDTH).map((l) => `§e${l}`));
  lore.push(`§8Clue ${hunt.leg + 1} of ${hunt.pts.length}`, `${MAP_ID_PREFIX}${hunt.id}`);
  stack.setLore(lore.slice(-20));
  return stack;
}

/** The hunt id a held stack is the map for. @param {ItemStack | undefined} stack */
function mapIdOf(stack) {
  if (!stack || stack.typeId !== MAP_ITEM || stack.nameTag !== MAP_NAME) return undefined;
  const last = stack.getLore().at(-1) ?? "";
  return last.startsWith(MAP_ID_PREFIX) ? last.slice(MAP_ID_PREFIX.length) : undefined;
}

/** @param {Player} player */
const inventoryOf = (player) => player.getComponent("minecraft:inventory")?.container;

/** Gives the player a copy of the map (dropped at their feet if the inventory is full). @param {Player} player @param {Hunt} hunt */
function giveMap(player, hunt) {
  const rest = inventoryOf(player)?.addItem(mapStack(hunt));
  if (rest) player.dimension.spawnItem(rest, player.location);
}

/** Rewrites (or with `remove`, takes away) every copy of this hunt's map the player carries. @param {Player} player @param {Hunt} hunt @param {boolean} [remove] */
function updateMaps(player, hunt, remove = false) {
  const inv = inventoryOf(player);
  if (!inv) return;
  for (let slot = 0; slot < inv.size; slot++) {
    const stack = inv.getItem(slot);
    if (mapIdOf(stack) !== hunt.id) continue;
    inv.setItem(slot, remove ? undefined : mapStack(hunt));
  }
}

/** Starts a hunt: saves it, gives the map, reads the first clue. @param {Player} player @param {string} why */
function startHunt(player, why) {
  const hunt = newHunt(player);
  saveHunts(player, [...huntsOf(player), hunt]);
  giveMap(player, hunt);
  player.sendMessage(`§6${why} §7The first clue: §f"${hunt.clue}"`);
  player.playSound("item.book.page_turn");
}

// ---------------------------------------------------------------------------
// Following the clues (every second) and Warmer / Colder (every 2 seconds)
// ---------------------------------------------------------------------------

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    try {
      const hunts = huntsOf(player);
      if (!hunts.length || player.dimension.id !== OVERWORLD) continue;
      for (const hunt of [...hunts]) step(player, hunt);
    } catch (e) {
      console.warn(`[maps] ${e}`);
    }
  }
}, 20);

/** @param {Player} player @param {Hunt} hunt */
function step(player, hunt) {
  if (hunt.dim !== player.dimension.id) return;
  const at = { x: player.location.x, z: player.location.z };
  const final = hunt.leg >= hunt.pts.length - 1;
  const target = hunt.pts[hunt.leg];
  const d = flat(at, target);

  if (!hunt.place && d <= DESCRIBE_DISTANCE) {
    const place = describe(player.dimension, target);
    if (place) {
      hunt.place = place;
      saveHunts(player, huntsOf(player));
      updateMaps(player, hunt);
      player.sendMessage(`§6The map's ink darkens: §7the spot lies ${place}.`);
    }
  }

  if (!final) {
    if (d > CONFIG.legRadius) return;
    hunt.leg++;
    hunt.place = undefined;
    hunt.clue = makeClue(hunt, at);
    saveHunts(player, huntsOf(player));
    updateMaps(player, hunt);
    lastDistance.delete(`${player.id}/${hunt.id}`);
    const last = hunt.leg === hunt.pts.length - 1;
    player.sendMessage(`§6You found ${last ? "the last" : "the next"} clue! §7(${hunt.leg + 1} of ${hunt.pts.length}) §f"${hunt.clue}"`);
    player.playSound("item.book.page_turn");
    player.playSound("random.orb", { pitch: 0.8 });
    return;
  }

  if (hunt.chest) {
    const c = hunt.chest;
    if (flat(at, c) <= FOUND_RADIUS && Math.abs(player.location.y - c.y) <= 6) found(player, hunt, true);
    return;
  }
  const key = `${player.id}/${hunt.id}`;
  if (d <= CONFIG.buryDistance && !jobs.has(key)) jobs.set(key, { gen: findSpot(player.dimension, target), player, hunt });
}

system.runInterval(() => {
  if (get("warmth") !== true) return;
  for (const player of world.getAllPlayers()) {
    try {
      const hunts = huntsOf(player);
      if (!hunts.length) continue;
      const inv = inventoryOf(player);
      const id = mapIdOf(inv?.getItem(player.selectedSlotIndex));
      if (!id) continue;
      const hunt = hunts.find((h) => h.id === id);
      let text;
      if (!hunt) text = "§7This map's treasure was found or given up.";
      else if (hunt.dim !== player.dimension.id) text = "§7The map shows nothing in this dimension.";
      else {
        const key = `${player.id}/${hunt.id}`;
        const d = flat(player.location, hunt.chest ?? hunt.pts[hunt.leg]);
        const prev = lastDistance.get(key);
        lastDistance.set(key, d);
        const leg = `§8(clue ${hunt.leg + 1} of ${hunt.pts.length})`;
        const trend = prev === undefined || Math.abs(d - prev) < 1 ? 0 : d < prev ? 1 : -1;
        const then = trend > 0 ? ", warmer" : trend < 0 ? ", colder" : "";
        // Near the buried chest the bands get finer, so the player can find the spot to dig.
        if (hunt.chest && d <= FOUND_RADIUS + 1) text = "§4Burning hot! Dig here.";
        else if (hunt.chest && d <= 12) text = `§cHot${then} ${leg}`;
        else if (d <= CONFIG.veryWarm) text = `§cVery warm${then} ${leg}`;
        else if (!trend) text = `§7The map is quiet ${leg}`;
        else text = trend > 0 ? `§6Warmer ${leg}` : `§bColder ${leg}`;
      }
      // Ask the Coordinates HUD, if installed, to leave the note on screen for a moment.
      send("realm:actionbar", { player: player.id, ticks: 45 });
      player.onScreenDisplay.setActionBar(text);
    } catch (e) {
      console.warn(`[maps] ${e}`);
    }
  }
}, 40);

// ---------------------------------------------------------------------------
// Burying the chest: a spot search spread over time (block reads are budgeted)
// ---------------------------------------------------------------------------

/** @type {Map<string, { gen: Generator<void, Vector3 | undefined, void>, player: Player, hunt: Hunt }>} key: player id/hunt id */
const jobs = new Map();

/** Offsets to try around the planned spot: the spot itself, then rings outward. */
function candidates() {
  /** @type {XZ[]} */
  const out = [{ x: 0, z: 0 }];
  for (let r = 6; r <= CONFIG.searchRadius; r += 6) {
    const n = Math.max(8, Math.round(r / 2));
    const turn = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = turn + (i / n) * Math.PI * 2;
      out.push({ x: Math.round(Math.cos(a) * r), z: Math.round(Math.sin(a) * r) });
    }
  }
  return out;
}

/**
 * Looks for a buried-chest spot near `center`: dry natural ground, 1-3 blocks down, nothing player-made in the 9 x 9
 * columns around it (surface +-4), far enough from world spawn. Yields before every block read so the caller can budget them.
 * @param {Dimension} dim @param {XZ} center @returns {Generator<void, Vector3 | undefined, void>}
 */
function* findSpot(dim, center) {
  const spawn = world.getDefaultSpawnLocation();
  for (const off of candidates()) {
    const x = Math.floor(center.x) + off.x;
    const z = Math.floor(center.z) + off.z;
    if (flat({ x, z }, spawn) < get("avoidSpawn")) continue;
    yield;
    let g = topAt(dim, x, z);
    for (let i = 0; i < 3 && g && !GROUND.test(g.typeId) && SOFT.test(g.typeId); i++) {
      yield;
      g = blockAt(dim, x, g.location.y - 1, z);
    }
    if (!g || !GROUND.test(g.typeId)) continue; // water, trees, builds, unloaded
    const gy = g.location.y;
    const depth = randInt(1, 3);
    let solid = true;
    for (let y = gy - 1; y >= gy - depth && solid; y--) {
      yield;
      const b = blockAt(dim, x, y, z);
      solid = !!b && GROUND.test(b.typeId);
    }
    if (!solid) continue; // a cave or something odd underneath
    let built = false;
    for (let dx = -4; dx <= 4 && !built; dx++) {
      for (let dz = -4; dz <= 4 && !built; dz++) {
        yield;
        const t = topAt(dim, x + dx, z + dz);
        if (!t || MADE.test(t.typeId)) {
          built = true; // a build, or an unloaded column we can't check
          break;
        }
        for (let y = Math.min(t.location.y - 1, gy + 4); y >= gy - 4; y--) {
          yield;
          const b = blockAt(dim, x + dx, y, z + dz);
          if (b && MADE.test(b.typeId)) {
            built = true;
            break;
          }
        }
      }
    }
    if (!built) return { x, y: gy - depth, z };
  }
  return undefined;
}

system.runInterval(() => {
  if (!jobs.size) return;
  let budget = READS_PER_RUN;
  for (const [key, job] of jobs) {
    if (!job.player.isValid) {
      jobs.delete(key);
      continue;
    }
    while (budget > 0) {
      budget--;
      /** @type {IteratorResult<void, Vector3 | undefined>} */
      let r;
      try {
        r = job.gen.next();
      } catch (e) {
        console.warn(`[maps] search: ${e}`);
        r = { done: true, value: undefined };
      }
      if (r.done) {
        jobs.delete(key);
        try {
          buried(job.player, job.hunt, r.value);
        } catch (e) {
          console.warn(`[maps] bury: ${e}`);
        }
        break;
      }
    }
    if (budget <= 0) break;
  }
}, 10);

/** The chest's loot. @returns {ItemStack[]} */
function rollLoot() {
  /** @type {ItemStack[]} */
  const out = [];
  for (const l of CONFIG.loot) {
    if (Math.random() >= l.chance) continue;
    try {
      out.push(new ItemStack(l.item, randInt(Math.max(1, l.min), Math.max(1, l.min, l.max))));
    } catch (e) {
      console.warn(`[maps] loot ${l.item}: ${e}`);
    }
  }
  const first = CONFIG.loot[0];
  if (!out.length && first) {
    try {
      out.push(new ItemStack(first.item, Math.max(1, first.min)));
    } catch {
      // a bad item id in config.js
    }
  }
  return out;
}

/**
 * The search finished: bury the chest, or move the treasure a little further and try again.
 * @param {Player} player @param {Hunt} hunt @param {Vector3 | undefined} spot
 */
function buried(player, hunt, spot) {
  const hunts = huntsOf(player);
  if (!hunts.includes(hunt) || hunt.chest) return; // given up meanwhile
  const dim = player.dimension;
  if (spot) {
    const b = blockAt(dim, spot.x, spot.y, spot.z);
    if (b && GROUND.test(b.typeId)) {
      b.setType("minecraft:chest");
      const inv = b.getComponent("minecraft:inventory")?.container;
      for (const stack of rollLoot()) inv?.addItem(stack);
      hunt.chest = spot;
      saveHunts(player, hunts);
      player.sendMessage("§6The map grows hot in your hands. §7The treasure is buried close by: follow the warmth, then dig.");
      return;
    }
  }
  hunt.tries++;
  if (hunt.tries >= MAX_TRIES) {
    found(player, hunt, false);
    return;
  }
  // Water, a build or a cave here: the treasure lies a little further on.
  const a = Math.random() * Math.PI * 2;
  const r = randInt(60, 120);
  const last = hunt.pts.length - 1;
  hunt.pts[last] = { x: Math.round(hunt.pts[last].x + Math.sin(a) * r), z: Math.round(hunt.pts[last].z - Math.cos(a) * r) };
  hunt.place = undefined;
  hunt.clue = makeClue(hunt, player.location);
  saveHunts(player, hunts);
  updateMaps(player, hunt);
  player.sendMessage(`§6The map's ink shifts: the treasure isn't here after all. §f"${hunt.clue}"`);
}

/**
 * The treasure is found: pay, tell the other packs, and close the hunt. `inChest` false hands the loot over directly
 * (when no spot for a chest was found).
 * @param {Player} player @param {Hunt} hunt @param {boolean} inChest
 */
function found(player, hunt, inChest) {
  saveHunts(
    player,
    huntsOf(player).filter((h) => h !== hunt),
  );
  updateMaps(player, hunt, true);
  lastDistance.delete(`${player.id}/${hunt.id}`);
  if (inChest) player.sendMessage("§6You found the treasure! §7The chest is buried right here, 1 to 3 blocks down: dig it up.");
  else {
    player.sendMessage("§6You found the treasure, washed up and half buried! §7Its contents are yours.");
    const inv = inventoryOf(player);
    for (const stack of rollLoot()) {
      const rest = inv?.addItem(stack);
      if (rest) player.dimension.spawnItem(rest, player.location);
    }
  }
  const lo = Math.max(0, get("crownsMin"));
  const crowns = randInt(lo, Math.max(lo, get("crownsMax")));
  if (crowns > 0 && addCrowns(player, crowns)) player.sendMessage(`§6+${crowns} Crowns §7(Treasure map)`);
  player.playSound("random.levelup");
  send("realm:quest_done", { player: player.id, pack: PACK, id: `treasure_${hunt.id}`, label: "Treasure map", kind: "treasure" });
  if (CONFIG.reputation > 0) send("realm:rep_add", { player: player.id, guild: "wayfarers", amount: CONFIG.reputation, reason: "Treasure map" });
  send("realm:journal", { player: player.id, page: "places", entry: "treasure", label: "Buried treasure" });
  if (CONFIG.skillXp > 0) send("realm:skill_xp", { player: player.id, skill: "exploration", amount: CONFIG.skillXp });
  if (CONFIG.relics.length && Math.random() < CONFIG.relicChance) {
    send("realm:relic_give", { player: player.id, relic: any(CONFIG.relics) });
    player.sendMessage("§dSomething old and strange glints among the coins...");
  }
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

/** @param {Player} player @param {string} title */
async function buyMenu(player, title) {
  const price = Math.max(0, get("price"));
  const hunts = huntsOf(player);
  const max = Math.max(1, get("maxHunts"));
  const lo = get("minDistance");
  const hi = Math.max(lo, get("maxDistance"));
  if (hunts.length >= max) {
    const res = await show(
      player,
      new ActionFormData()
        .title(title)
        .body(max === 1 ? "You're already following one of my maps. Find that treasure first, or give it up." : `You're already following ${hunts.length} of my maps. Find a treasure first, or give one up.`)
        .button("Your treasure hunt")
        .button("Goodbye"),
    );
    if (res && !res.canceled && res.selection === 0) await showHunts(player);
    return;
  }
  const body = [
    `A treasure map leads ${fmt(lo)} to ${fmt(hi)} blocks from here, in riddles: each clue tells you which way and how far to walk, and the next clue waits at the end.`,
    "Hold the map and it tells you whether you're getting warmer. At the end, a chest lies buried.",
    "",
    price > 0 ? `A map costs §6${fmt(price)} Crowns§r. You have §6${fmt(crownsOf(player))}§r.` : "Today the maps are free.",
  ].join("\n");
  const res = await show(player, new ActionFormData().title(title).body(body).button(price > 0 ? `Buy a map\n§8${fmt(price)} Crowns` : "Take a map").button("No thanks"));
  if (!res || res.canceled || res.selection !== 0 || !player.isValid) return;
  if (player.dimension.id !== OVERWORLD) {
    player.sendMessage("§cMy maps only show the Overworld.");
    return;
  }
  if (huntsOf(player).length >= max) return;
  if (!takeCrowns(player, price)) {
    player.sendMessage(`§cA treasure map costs ${fmt(price)} Crowns. You have ${fmt(crownsOf(player))}.`);
    return;
  }
  if (price > 0) player.sendMessage(`§6-${fmt(price)} Crowns §7(Treasure map)`);
  startHunt(player, "You bought a treasure map!");
}

/** /realm:maps: the player's hunts, with a new copy of the map and giving up. @param {Player} player */
async function showHunts(player) {
  const hunts = huntsOf(player);
  if (!hunts.length) {
    const price = Math.max(0, get("price"));
    await show(player, new ActionFormData().title("§lTreasure Maps").body(`You have no treasure hunt. Buy a treasure map from a cartographer${price > 0 ? ` (${fmt(price)} Crowns)` : ""}.`).button("Close"));
    return;
  }
  let hunt = hunts[0];
  if (hunts.length > 1) {
    const form = new ActionFormData().title("§lTreasure Maps").body("Your treasure hunts:");
    for (const h of hunts) form.button(`Map ${h.id}\n§8Clue ${h.leg + 1} of ${h.pts.length}`);
    form.button("Close");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || !hunts[res.selection]) return;
    hunt = hunts[res.selection];
  }
  const lines = [`§lClue ${hunt.leg + 1} of ${hunt.pts.length}§r (${hunt.leg} found)`, "", `§f"${hunt.clue}"`];
  if (hunt.place) lines.push(`§eThe spot lies ${hunt.place}.`);
  if (hunt.chest) lines.push("§6The chest is buried close by: follow the warmth, then dig.");
  if (get("plainHints") === true && hunt.dim === player.dimension.id) lines.push(`§7${plainHint(hunt, player.location)}`);
  lines.push("", "§7Hold the map to feel whether you're getting warmer. Each clue is told from where the last one was found.");
  const res = await show(player, new ActionFormData().title(`§lTreasure Map ${hunt.id}`).body(lines.join("\n")).button("A new copy of the map").button("Give up this hunt").button("Close"));
  if (!res || res.canceled || !player.isValid) return;
  if (res.selection === 0) {
    giveMap(player, hunt);
    player.sendMessage("§7Here's a fresh copy of your treasure map.");
  } else if (res.selection === 1) {
    const sure = await show(player, new ActionFormData().title("§lGive up?").body("Give up this treasure hunt? The map's Crowns aren't paid back.").button("Give it up").button("Keep hunting"));
    if (!sure || sure.canceled || sure.selection !== 0 || !player.isValid) return;
    saveHunts(
      player,
      huntsOf(player).filter((h) => h.id !== hunt.id),
    );
    updateMaps(player, hunt, true);
    jobs.delete(`${player.id}/${hunt.id}`);
    player.sendMessage("§7You gave up the treasure hunt.");
  }
}

// ---------------------------------------------------------------------------
// Townsfolk: NPCs with the cartographer role sell maps
// ---------------------------------------------------------------------------

/** The NPC each player last talked to, for the menu title. @type {Map<string, string>} */
const lastNpc = new Map();

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:npc_talk" && id !== "realm:npc_choose") return;
    /** @type {any} */
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object" || typeof msg.player !== "string") return;
    try {
      if (id === "realm:npc_talk") {
        if (!Array.isArray(msg.roles) || !msg.roles.includes(CONFIG.npcRole)) return;
        if (typeof msg.name === "string") lastNpc.set(msg.player, msg.name);
        const price = Math.max(0, get("price"));
        send("realm:npc_offer", { req: msg.req, pack: PACK, key: "buy", label: price > 0 ? `Buy a treasure map (${fmt(price)} Crowns)` : "Take a treasure map", order: 20 });
        const player = online(msg.player);
        if (player && huntsOf(player).length) send("realm:npc_offer", { req: msg.req, pack: PACK, key: "hunt", label: "Your treasure hunt", order: 21 });
        return;
      }
      if (msg.pack !== PACK) return;
      const player = online(msg.player);
      if (!player) return;
      const title = lastNpc.get(player.id) ?? "§lCartographer";
      const run = msg.key === "buy" ? buyMenu(player, title) : msg.key === "hunt" ? showHunts(player) : undefined;
      run?.catch((e) => console.warn(`[maps] ${e}`));
    } catch (e) {
      console.warn(`[maps] npc: ${e}`);
    }
  },
  { namespaces: ["realm"] },
);

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:maps",
      description: "Treasure Maps: your treasure hunt's clue, a new copy of the map, or give it up",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => showHunts(player).catch((e) => console.warn(`[maps] ${e}`)));
      return { status: CustomCommandStatus.Success };
    },
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:maps_give",
      description: "Treasure Maps: give a player a free treasure map (operators)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "player", type: CustomCommandParamType.PlayerSelector }],
    },
    (origin, /** @type {Player[] | undefined} */ targets) => {
      if (!targets?.length) return { status: CustomCommandStatus.Failure, message: "No player matched." };
      const caller = origin.initiator ?? origin.sourceEntity;
      system.run(() => {
        /** @type {string[]} */
        const notes = [];
        for (const p of targets) {
          try {
            if (!p.isValid) continue;
            if (p.dimension.id !== OVERWORLD) notes.push(`${p.name} isn't in the Overworld`);
            else if (huntsOf(p).length >= Math.max(1, get("maxHunts"))) notes.push(`${p.name} already has ${huntsOf(p).length} hunt(s)`);
            else {
              startHunt(p, "You received a treasure map!");
              notes.push(`gave ${p.name} a map`);
            }
          } catch (e) {
            console.warn(`[maps] give: ${e}`);
          }
        }
        if (caller instanceof Player && caller.isValid) caller.sendMessage(`§7Treasure maps: ${notes.join("; ") || "nothing to do"}.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "maps_bp");
  },
  { namespaces: ["realm"] },
);
