import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, Dimension, ItemStack, Player, ScriptEventSource, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, getFor } from "./settings.js";
import { FAR, FAR_KINDS, MARKERS, WOOLS, coarse, markerLooks, nearRiddle, treeOf } from "./clues.js";
import { isProtected, protectedBox } from "./zones.js";
import { isSlot, sideBoxes } from "./side.js";
import { ANY_WOOL, kindOf, record, release, startSweep } from "./cleanup.js";

const PACK = "maps_bp";
const PROP_HUNTS = "maps:hunts"; // player: JSON Hunt[]
const OVERWORLD = "minecraft:overworld";
const MAP_ITEM = "minecraft:paper"; // paper, not a real map: no map mechanics to fight with
const MAP_NAME = "§r§6Treasure Map";
const MAP_ID_PREFIX = "§8Map ";
const LORE_WIDTH = 38;
const SCAN_RADIUS = 32; // blocks around a leg's planned end searched for a landmark (every 4th column)
const SCAN_STEP = 4;
const MARK_RADIUS = 4; // blocks (ignoring height, within 8 up or down) from a marker that count as reaching it
const ANCHOR_SPOT_RADIUS = 8; // how far from a landmark the chest may be buried and still be "at" it
const FOUND_RADIUS = 3; // blocks (ignoring height, within 6 up or down) from the chest that count as finding it
const MAX_TRIES = 4; // places tried for the chest before the treasure is handed over directly
const READS_PER_RUN = 150; // block reads for chest-spot searches every 10 ticks (300 a second at most, all players together)
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

// Blocks the chest may replace, and that may lie over it: natural ground only.
const GROUND =
  /^minecraft:(grass_block|grass|dirt|coarse_dirt|podzol|mycelium|dirt_with_roots|rooted_dirt|mud|sand|red_sand|gravel|clay|stone|andesite|diorite|granite|deepslate|tuff|sandstone|red_sandstone|snow|moss_block|calcite|hardened_clay|(white|orange|yellow|brown|red|light_gray)_terracotta)$/;
// Plants and snow on top of the ground, looked through to find it.
const SOFT = /short_grass|tall_grass|fern|flower|dandelion|poppy|tulip|orchid|allium|bluet|daisy|cornflower|lily_of_the_valley|snow_layer|deadbush|dead_bush|bush|petals|leaf_litter|torchflower/;
// Anything a player probably placed: a spot with one of these nearby is skipped (packs can't read Land Claims).
const MADE =
  /planks|glass|chest|barrel|sign|bed\b|_bed|torch|lantern|door|fence|wool|carpet|concrete|glazed|crafting_table|furnace|smoker|brick|slab|stairs|_wall|lectern|bookshelf|anvil|hopper|rail|ladder|scaffolding|campfire|bell|banner|lever|button|pressure_plate|shulker|smooth|polished|stripped|chiseled|cut_|beacon|cauldron|composter|loom|cartography|fletching|smithing|stonecutter|grindstone|brewing|enchanting|jukebox|noteblock|note_block|target|redstone_wire|repeater|comparator|piston|observer|dispenser|dropper|tnt|frame|flower_pot|farmland|grass_path|dirt_path|hay_block|cobblestone|candle|chain|bars|trapdoor|copper_bulb|copper_grate|lightning_rod|end_rod|sea_lantern|glowstone|quartz|purpur|prismarine_bricks|bamboo_mosaic|bamboo_block|crafter|vault|spawner|tiles|_wood$|_hyphae$|:(black|blue|cyan|gray|green|light_blue|lime|magenta|pink|purple)_terracotta$|:(iron|gold|diamond|emerald|lapis|redstone|netherite|coal|raw_iron|raw_gold|raw_copper|honey|honeycomb|slime|dried_kelp|amethyst|resin)_block$|copper|packed_mud|sponge|skull|_head$|decorated_pot|cake|lodestone|respawn_anchor|light_block|mud_bricks|tinted/;
const WATERY = /water|seagrass|kelp|bubble_column/;
const FLOWERS = /flower|dandelion|poppy|tulip|orchid|allium|bluet|daisy|cornflower|lily_of_the_valley|petals|torchflower/;
const TREE_TOP = /leaves|_log$|_wood$|mushroom_block|vine/;

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {{ x: number, z: number }} XZ */
/**
 * @typedef {{ id: string, dim: string, pts: XZ[], leg: number, clue: string, place?: string, chest?: Vector3, tries: number, t: number,
 *   v?: number, from?: XZ, fromName?: string, used?: string[], feats?: string[], near?: string, mark?: Vector3, style?: string, nomark?: boolean, regen?: boolean,
 *   markUndo?: string, chestUndo?: string, rv?: number }} Hunt
 * pts: the planned end of each leg (the last is the treasure), leg: the leg being followed (0-based), clue: its riddle,
 * chest: where the chest was buried, tries: chest spots that failed. Version 2 (v: 2): from/fromName: where the leg
 * starts and what the clue calls it, used: far clue kinds this hunt has used, feats: landmark kinds used, near: the
 * riddle for what the spot looks like (once its land loaded), mark: the marker built at the end of the leg (its
 * ground block), style: that marker's kind, nomark: no marker could stand there (the clue is found by coming close),
 * regen: an older map whose clue is rewritten the next time its holder is online. place: older maps only.
 * markUndo / chestUndo: the cleanup records (scripts/cleanup.js) of the blocks the marker and the chest placed.
 * rv: a race against Rook to the chest ends then (ms since 1970; Story Questlines' realm:map_rival).
 */

// Warmer / Colder in a Side HUD box (scripts/side.js, the side boxes protocol).
const side = sideBoxes("maps");

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
 * @template {ActionFormData | ModalFormData} F
 * @param {Player} player @param {F} form
 * @returns {Promise<Awaited<ReturnType<F["show"]>> | undefined>}
 */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = /** @type {any} */ (await form.show(player));
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

/** Block reads that found the land unloaded (or not ticking), so a spot search can tell "no spot" from "couldn't look". */
let unloadedReads = 0;

/** @param {Dimension} dim @param {number} x @param {number} y @param {number} z */
function blockAt(dim, x, y, z) {
  try {
    const b = dim.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
    if (b) void b.typeId; // throws when the chunk is loaded but not ticking
    else unloadedReads++;
    return b;
  } catch {
    unloadedReads++;
    return undefined; // unloaded or outside the world
  }
}
/** The highest block that isn't air (water counts). @param {Dimension} dim @param {number} x @param {number} z */
function topAt(dim, x, z) {
  try {
    const b = dim.getTopmostBlock({ x: Math.floor(x), z: Math.floor(z) });
    if (!b) return undefined;
    void b.typeId; // throws when the chunk is loaded but not ticking (it then answers y 319)
    // The topmost block skips water: answer the water (or seagrass, kelp) over it instead.
    const up = b.above();
    return up && WATERY.test(up.typeId) ? up : b;
  } catch {
    unloadedReads++;
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

/**
 * The riddle for the hunt's current leg, from where the leg starts: a far clue kind this hunt hasn't used yet
 * (bearing, steps, coordinates or mixed), unless `kind` is given.
 * @param {Hunt} hunt @param {string} [kind]
 */
function makeClue(hunt, kind) {
  const used = (hunt.used ??= []);
  const fresh = FAR_KINDS.filter((k) => !used.includes(k));
  const pick = kind ?? any(fresh.length ? fresh : FAR_KINDS);
  used.push(pick);
  const target = hunt.pts[hunt.leg];
  const final = hunt.leg === hunt.pts.length - 1;
  return FAR[pick](hunt.from ?? target, target, hunt.fromName ?? "", final);
}

/** "(W, about 1,000 blocks)" from where the player stands. @param {Hunt} hunt @param {XZ} at */
function plainHint(hunt, at) {
  const target = hunt.chest ?? hunt.mark ?? hunt.pts[hunt.leg];
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
/** When a landmark search that found the land not loaded yet may run again, per player and hunt. @type {Map<string, number>} */
const retryAt = new Map();
/** Last distance shown per player and hunt, for Warmer / Colder. @type {Map<string, number>} */
const lastDistance = new Map();

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  cache.delete(playerId);
  lastNpc.delete(playerId);
  for (const key of [...jobs.keys()]) if (key.startsWith(`${playerId}/`)) jobs.delete(key);
  for (const key of [...lastDistance.keys()]) if (key.startsWith(`${playerId}/`)) lastDistance.delete(key);
  for (const key of [...retryAt.keys()]) if (key.startsWith(`${playerId}/`)) retryAt.delete(key);
  legsSent.delete(playerId);
});

// ---------------------------------------------------------------------------
// Where each hunt's current leg is, for other packs: realm:map_leg (Wanderers and Story Questlines race to it)
// ---------------------------------------------------------------------------

/** Per player: hunt id -> what was sent for it. @type {Map<string, Map<string, string>>} */
const legsSent = new Map();

/**
 * Sends `realm:map_leg` { player, hunt, dim, x, z, leg, legs, final } when a hunt's current leg changed (a new clue,
 * its marker or chest placed, the treasure moved), and { player, hunt, gone: true } when the hunt ended (found or
 * given up). x, z: the chest once buried, else the marker, else the leg's planned end. Checked every second.
 * @param {Player} player @param {Hunt[]} hunts
 */
function syncLegs(player, hunts) {
  let sent = legsSent.get(player.id);
  if (!sent) {
    if (!hunts.length) return;
    legsSent.set(player.id, (sent = new Map()));
  }
  const now = new Set();
  for (const h of hunts) {
    now.add(h.id);
    const at = h.chest ?? h.mark ?? h.pts[h.leg];
    if (!at) continue;
    const msg = { player: player.id, hunt: h.id, dim: h.dim, x: Math.round(at.x), z: Math.round(at.z), leg: h.leg + 1, legs: h.pts.length, final: h.leg >= h.pts.length - 1 };
    const json = JSON.stringify(msg);
    if (sent.get(h.id) === json) continue;
    sent.set(h.id, json);
    send("realm:map_leg", msg);
  }
  for (const id of [...sent.keys()]) {
    if (now.has(id)) continue;
    sent.delete(id);
    send("realm:map_leg", { player: player.id, hunt: id, gone: true });
  }
  if (!sent.size) legsSent.delete(player.id);
}

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id === "realm:map_leg_ping") {
      legsSent.clear(); // every hunt's leg again within a second
      return;
    }
    if (id !== "realm:map_rival") return;
    try {
      // realm:map_rival { player, hunt, until }: a race against Rook to this hunt's chest ends at `until` (ms).
      const m = JSON.parse(message);
      if (!m || typeof m.player !== "string" || typeof m.hunt !== "string" || typeof m.until !== "number" || !Number.isFinite(m.until)) return;
      const p = online(m.player);
      const hunt = p ? huntsOf(p).find((h) => h.id === m.hunt) : undefined;
      if (!p || !hunt) return;
      hunt.rv = typeof hunt.rv === "number" ? Math.min(hunt.rv, Math.floor(m.until)) : Math.floor(m.until); // never later
      saveHunts(p, huntsOf(p));
    } catch {
      // not ours
    }
  },
  { namespaces: ["realm"] },
);

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
  for (const h of hunts) {
    if (h.v === 2) continue;
    // A map bought before clues and markers: keep its route and any buried chest; its clue is rewritten as
    // coordinates (which work from anywhere) the next time step() sees its holder.
    h.v = 2;
    h.used = [];
    h.feats = [];
    h.place = undefined;
    if (!h.chest) h.regen = true;
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

/** Shortest leg (blocks): longer than the Skills pack's widest Map Sense (160), so a marker is never seen from the leg's start. */
const MIN_LEG = 170;

/**
 * A new hunt from where the player stands: the treasure `minDistance`-`maxDistance` blocks away (away from world
 * spawn), and `legsMin`-`legsMax` legs that wander a little on the way, each at least MIN_LEG blocks long.
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
  const legs = Math.min(randInt(Math.max(1, CONFIG.legsMin), Math.max(1, CONFIG.legsMin, CONFIG.legsMax)), Math.max(1, Math.floor(dist / MIN_LEG)));
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
  const hunt = { v: 2, id, dim: OVERWORLD, pts, leg: 0, clue: "", tries: 0, t: Date.now(), from: { x: Math.round(from.x), z: Math.round(from.z) }, fromName: "", used: [], feats: [] };
  hunt.clue = makeClue(hunt);
  return hunt;
}

/** @param {Hunt} hunt */
function mapStack(hunt) {
  const stack = new ItemStack(MAP_ITEM, 1);
  stack.nameTag = MAP_NAME;
  const lore = wrap(hunt.clue, LORE_WIDTH).map((l) => `§7${l}`);
  if (hunt.near) lore.push(...wrap(hunt.near, LORE_WIDTH).map((l) => `§e${l}`));
  lore.push(`§8Clue ${hunt.leg + 1} of ${hunt.pts.length}`);
  // Where the map works, as the last line players read; the id line stays last (mapIdOf reads it).
  if (get("warmth") === true) lore.push("§7Hold it in your hand to sense warmth");
  lore.push(`${MAP_ID_PREFIX}${hunt.id}`);
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
      syncLegs(player, hunts);
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
  const key = `${player.id}/${hunt.id}`;
  if (hunt.regen) {
    // An older map: its clue becomes coordinates, which read the same from anywhere.
    hunt.regen = false;
    hunt.from = { x: Math.round(at.x), z: Math.round(at.z) };
    hunt.fromName = "";
    hunt.clue = makeClue(hunt, "coords");
    saveHunts(player, huntsOf(player));
    updateMaps(player, hunt);
    player.sendMessage(`§6The ink on your treasure map stirs and rewrites itself. §f"${hunt.clue}"`);
  }
  const final = hunt.leg >= hunt.pts.length - 1;
  const planned = hunt.pts[hunt.leg];

  // Close to the planned spot, with its land loaded: find a landmark there and build the marker (or bury the chest).
  if (!hunt.near && !hunt.chest && !hunt.mark && !hunt.nomark && !jobs.has(key) && (retryAt.get(key) ?? 0) <= system.currentTick && flat(at, planned) <= revealFor(player) && topAt(player.dimension, planned.x, planned.z)) {
    const dim = player.dimension;
    jobs.set(key, { gen: settle(dim, hunt, final), player, hunt, missed: 0, done: (/** @type {any} */ r, /** @type {number} */ missed) => settled(player, hunt, final, r, missed) });
  }

  if (!final) {
    let reached = false;
    if (hunt.mark) reached = flat(at, hunt.mark) <= MARK_RADIUS && Math.abs(player.location.y - hunt.mark.y) <= 8;
    else if (hunt.nomark) reached = flat(at, planned) <= CONFIG.legRadius;
    if (!reached) return;
    const hadMark = !!hunt.mark;
    const name = hunt.mark ? (MARKERS.find((m) => m.id === hunt.style)?.name ?? "the marker") : "the bottle";
    letGo(player, hunt, false);
    hunt.from = hunt.mark ? { x: hunt.mark.x, z: hunt.mark.z } : { x: Math.round(at.x), z: Math.round(at.z) };
    hunt.fromName = hunt.mark ? name : "where you found the bottle";
    hunt.leg++;
    hunt.near = undefined;
    hunt.mark = undefined;
    hunt.nomark = undefined;
    hunt.clue = makeClue(hunt);
    saveHunts(player, huntsOf(player));
    updateMaps(player, hunt);
    lastDistance.delete(key);
    const last = hunt.leg === hunt.pts.length - 1;
    const where = !hadMark
      ? "Inside it"
      : any(name === "the flag" ? ["Tied to the pole", "Rolled up in the flag"] : name === "the cairn" ? ["Tucked between its stones", "Wedged under the lantern"] : ["Scratched into the stone", "Wedged beneath it"]);
    player.sendMessage(`§6You found ${name}! §7${where}: ${last ? "the last" : "the next"} clue (${hunt.leg + 1} of ${hunt.pts.length}). §f"${hunt.clue}"`);
    player.playSound("item.book.page_turn");
    player.playSound("random.orb", { pitch: 0.8 });
    return;
  }

  if (hunt.chest) {
    const c = hunt.chest;
    if (flat(at, c) <= FOUND_RADIUS && Math.abs(player.location.y - c.y) <= 6) found(player, hunt, true);
  }
}

system.runInterval(() => {
  if (get("warmth") !== true) return;
  for (const player of world.getAllPlayers()) {
    try {
      const inv = inventoryOf(player);
      const id = mapIdOf(inv?.getItem(player.selectedSlotIndex));
      if (!id) continue;
      // A map from a finished or abandoned hunt (a copy kept in a chest) says so, also when no hunt is left.
      const hunt = huntsOf(player).find((h) => h.id === id);
      let text;
      if (!hunt) text = "§7This map's treasure was found or given up.";
      else if (hunt.dim !== player.dimension.id) text = "§7The map shows nothing in this dimension.";
      else {
        const key = `${player.id}/${hunt.id}`;
        const d = flat(player.location, hunt.chest ?? hunt.mark ?? hunt.pts[hunt.leg]);
        const leg = `§8(clue ${hunt.leg + 1} of ${hunt.pts.length})`;
        const radius = Math.max(8, get("warmthRadius"));
        if (d > radius) {
          // Far away the map only knows cold, cool or faintly warm: the clue, not the map, shows the way.
          lastDistance.delete(key);
          text = `${coarse(d, radius)} ${leg}`;
        } else {
          const prev = lastDistance.get(key);
          lastDistance.set(key, d);
          const trend = prev === undefined || Math.abs(d - prev) < 1 ? 0 : d < prev ? 1 : -1;
          const then = trend > 0 ? ", warmer" : trend < 0 ? ", colder" : "";
          // Near the buried chest (or a marker) the bands get finer, so the player can find the spot.
          if (hunt.chest && d <= FOUND_RADIUS + 1) text = "§4Burning hot! Dig here.";
          else if ((hunt.chest || hunt.mark) && d <= 12) text = `§cHot${then} ${leg}`;
          else if (d <= CONFIG.veryWarm) text = `§cVery warm${then} ${leg}`;
          else if (!trend) text = `§7The map is quiet ${leg}`;
          else text = trend > 0 ? `§6Warmer ${leg}` : `§bColder ${leg}`;
        }
      }
      const where = getFor(player, "where");
      if (isSlot(where)) side.show(player, where, text, 45);
      else {
        // Ask the Coordinates HUD, if installed, to leave the note on screen for a moment.
        send("realm:actionbar", { player: player.id, ticks: 45, from: "maps_bp" });
        player.onScreenDisplay.setActionBar(text);
      }
    } catch (e) {
      console.warn(`[maps] ${e}`);
    }
  }
}, 40);

// ---------------------------------------------------------------------------
// Burying the chest: a spot search spread over time (block reads are budgeted)
// ---------------------------------------------------------------------------

/** @type {Map<string, { gen: Generator<void, any, void>, player: Player, hunt: Hunt, missed: number, done: (value: any, missed: number) => void }>} key: player id/hunt id */
const jobs = new Map();

/** Offsets to try around a spot: the spot itself, then rings outward. @param {number} radius */
function candidates(radius) {
  /** @type {XZ[]} */
  const out = [{ x: 0, z: 0 }];
  for (let r = 6; r <= radius; r += 6) {
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
 * columns around it (surface +-4), far enough from world spawn and outside safe zones and claims. Yields before every block
 * read so the caller can budget them.
 * @param {Dimension} dim @param {XZ} center @param {number} radius @returns {Generator<void, Vector3 | undefined, void>}
 */
function* findSpot(dim, center, radius) {
  const spawn = world.getDefaultSpawnLocation();
  for (const off of candidates(radius)) {
    const x = Math.floor(center.x) + off.x;
    const z = Math.floor(center.z) + off.z;
    if (flat({ x, z }, spawn) < get("avoidSpawn")) continue;
    if (protectedBox(dim.id, { x: x - 4, z: z - 4 }, { x: x + 4, z: z + 4 })) continue;
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
      const before = unloadedReads;
      try {
        r = job.gen.next();
      } catch (e) {
        console.warn(`[maps] search: ${e}`);
        r = { done: true, value: undefined };
      }
      job.missed += unloadedReads - before;
      if (r.done) {
        jobs.delete(key);
        try {
          job.done(r.value, job.missed);
        } catch (e) {
          console.warn(`[maps] bury: ${e}`);
        }
        break;
      }
    }
    if (budget <= 0) break;
  }
}, 10);

/**
 * A spot for a marker at `at`: natural ground with room above, nothing player-made in the 5 x 5 tops around it, no
 * player standing there, away from world spawn and outside safe zones and claims. Yields before every block read.
 * @param {Dimension} dim @param {XZ} at @returns {Generator<void, (Vector3 & { styles: string[] }) | undefined, void>}
 */
function* markerSpot(dim, at) {
  const x = Math.floor(at.x);
  const z = Math.floor(at.z);
  if (flat({ x, z }, world.getDefaultSpawnLocation()) < get("avoidSpawn")) return undefined;
  if (isProtected(dim.id, x + 0.5, z + 0.5) || protectedBox(dim.id, { x: x - 3, z: z - 3 }, { x: x + 3, z: z + 3 })) return undefined;
  yield;
  let g = topAt(dim, x, z);
  for (let i = 0; i < 3 && g && !GROUND.test(g.typeId) && SOFT.test(g.typeId); i++) {
    yield;
    g = blockAt(dim, x, g.location.y - 1, z);
  }
  if (!g || !GROUND.test(g.typeId)) return undefined;
  const gy = g.location.y;
  // Which marker styles fit: every block a style places must go where there is only air or plants now.
  /** @type {Map<string, boolean>} */
  const free = new Map();
  for (const o of MARKER_ROOM) {
    yield;
    const b = blockAt(dim, x + o.dx, gy + o.dy, z + o.dz);
    free.set(`${o.dx},${o.dy},${o.dz}`, !!b && (b.isAir || SOFT.test(b.typeId)));
  }
  const styles = MARKERS.filter((m) => m.blocks("minecraft:white_wool").every((o) => free.get(`${o.dx},${o.dy},${o.dz}`))).map((m) => m.id);
  if (!styles.length) return undefined; // a tree, a rock face or unloaded
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      yield;
      const t = topAt(dim, x + dx, z + dz);
      if (!t || MADE.test(t.typeId)) return undefined;
    }
  }
  try {
    if (dim.getPlayers({ location: { x: x + 0.5, y: gy + 1, z: z + 0.5 }, maxDistance: 3 }).length) return undefined;
  } catch {
    // fine
  }
  return { x, y: gy, z, styles };
}

/** Every block any marker style places, relative to the ground block under it. */
const MARKER_ROOM = [...new Map(MARKERS.flatMap((m) => m.blocks("minecraft:white_wool")).map((b) => [`${b.dx},${b.dy},${b.dz}`, b])).values()];

/** @template T @param {T[]} list @returns {T[]} a shuffled copy */
function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Landmarks around a leg's planned end, from the top blocks of every 4th column: water, the edge of a wood (by
 * tree), the highest and lowest ground, sand, snow, flowers and level ground. Each with the columns that stand
 * "at" it, nearest the center first.
 * @param {{ x: number, z: number, y: number, id: string }[]} cells @param {XZ} center
 * @returns {{ kind: string, info: { tree?: string, y?: number, big?: boolean }, anchors: { x: number, z: number, y: number }[] }[]}
 */
function landmarks(cells, center) {
  const at = new Map(cells.map((c) => [`${c.x},${c.z}`, c]));
  /** @param {{ x: number, z: number }} c */
  const around = (c) => {
    const out = [];
    for (let dx = -SCAN_STEP; dx <= SCAN_STEP; dx += SCAN_STEP)
      for (let dz = -SCAN_STEP; dz <= SCAN_STEP; dz += SCAN_STEP) {
        if (!dx && !dz) continue;
        const n = at.get(`${c.x + dx},${c.z + dz}`);
        if (n) out.push(n);
      }
    return out;
  };
  const land = cells.filter((c) => !WATERY.test(c.id) && !TREE_TOP.test(c.id) && !MADE.test(c.id));
  /** @param {typeof cells} list */
  const near = (list) => [...list].sort((a, b) => flat(a, center) - flat(b, center));
  /** @type {ReturnType<typeof landmarks>} */
  const out = [];
  if (!land.length) return out;
  const water = cells.filter((c) => WATERY.test(c.id));
  if (water.length >= 2) {
    const shore = land.filter((c) => around(c).some((n) => WATERY.test(n.id)));
    if (shore.length) out.push({ kind: "water", info: { big: water.length >= cells.length / 4 }, anchors: near(shore) });
  }
  /** @type {Map<string, number>} */
  const trees = new Map();
  for (const c of cells) {
    const m = /^minecraft:(\w+?)_leaves/.exec(c.id);
    if (m) trees.set(m[1], (trees.get(m[1]) ?? 0) + 1);
  }
  for (const [tree, n] of trees) {
    const name = treeOf(`minecraft:${tree}_leaves`);
    if (n < 3 || !name) continue;
    const edge = land.filter((c) => around(c).some((o) => o.id.startsWith(`minecraft:${tree}_leaves`)));
    if (edge.length) out.push({ kind: `trees:${tree}`, info: { tree: name }, anchors: near(edge) });
  }
  const ys = land.map((c) => c.y).sort((a, b) => a - b);
  const median = ys[Math.floor(ys.length / 2)];
  const top = ys[ys.length - 1];
  const low = ys[0];
  if (top - median >= 6) out.push({ kind: "peak", info: { y: top }, anchors: near(land.filter((c) => c.y >= top - 1)) });
  if (median - low >= 5) out.push({ kind: "hollow", info: { y: low }, anchors: near(land.filter((c) => c.y <= low + 1)) });
  const sand = land.filter((c) => /sand$/.test(c.id));
  if (sand.length >= 3) out.push({ kind: "sand", info: {}, anchors: near(sand) });
  const snow = land.filter((c) => /snow/.test(c.id));
  if (snow.length >= 3) out.push({ kind: "snow", info: {}, anchors: near(snow) });
  const flowers = land.filter((c) => FLOWERS.test(c.id));
  if (flowers.length >= 3) out.push({ kind: "flowers", info: {}, anchors: near(flowers) });
  const level = land.filter((c) => {
    const ns = around(c);
    return ns.length === 8 && ns.every((n) => n.y === c.y && !WATERY.test(n.id));
  });
  if (level.length) out.push({ kind: "flat", info: { y: level[0].y }, anchors: near(level) });
  return out;
}

/**
 * Settles the end of a leg once its land is loaded: reads the top block of every 4th column within 32 blocks,
 * picks a landmark this hunt hasn't used (level ground last), and finds a spot at it for the marker or, on the last
 * leg, the buried chest. Yields before every block read.
 * @param {Dimension} dim @param {Hunt} hunt @param {boolean} final
 * @returns {Generator<void, { kind?: string, info?: object, spot?: Vector3, retry?: boolean } | undefined, void>}
 */
function* settle(dim, hunt, final) {
  const c = hunt.pts[hunt.leg];
  const cx = Math.floor(c.x);
  const cz = Math.floor(c.z);
  /** @type {{ x: number, z: number, y: number, id: string }[]} */
  const cells = [];
  let columns = 0;
  for (let dx = -SCAN_RADIUS; dx <= SCAN_RADIUS; dx += SCAN_STEP) {
    for (let dz = -SCAN_RADIUS; dz <= SCAN_RADIUS; dz += SCAN_STEP) {
      if (dx * dx + dz * dz > SCAN_RADIUS * SCAN_RADIUS) continue;
      columns++;
      yield;
      const t = topAt(dim, cx + dx, cz + dz);
      if (t) cells.push({ x: cx + dx, z: cz + dz, y: t.location.y, id: t.typeId });
    }
  }
  // Part of the land isn't loaded (and ticking) yet: try again when the player is closer.
  if (cells.length < columns * 0.9) return { retry: true };
  const used = hunt.feats ?? [];
  const kindOf = (/** @type {string} */ k) => k.split(":")[0];
  const found = landmarks(cells, c);
  const fresh = shuffled(found.filter((f) => f.kind !== "flat" && !used.includes(kindOf(f.kind))));
  const again = shuffled(found.filter((f) => f.kind !== "flat" && used.includes(kindOf(f.kind))));
  const order = [...fresh, ...found.filter((f) => f.kind === "flat"), ...again];
  for (const f of order) {
    for (const a of f.anchors.slice(0, 4)) {
      const spot = final ? yield* findSpot(dim, a, ANCHOR_SPOT_RADIUS) : yield* markerSpot(dim, a);
      if (spot) return { kind: f.kind, info: f.info, spot };
    }
  }
  if (!final) return undefined;
  const spot = yield* findSpot(dim, c, CONFIG.searchRadius);
  return spot ? { spot } : undefined;
}

/**
 * The end of a leg is settled: build the marker and tell the player what the spot looks like, or bury the chest.
 * @param {Player} player @param {Hunt} hunt @param {boolean} final @param {{ kind?: string, info?: any, spot?: Vector3, retry?: boolean } | undefined} r
 * @param {number} [missed] block reads of the search that found the land unloaded
 */
function settled(player, hunt, final, r, missed = 0) {
  const hunts = huntsOf(player);
  // The player left while the land was searched (flew on, went home, changed dimension), so part of it unloaded:
  // that is no reason to move the treasure or leave a bottle. Look again when they come back.
  const left = () => player.dimension.id !== hunt.dim || flat(player.location, hunt.pts[hunt.leg]) > revealFor(player);
  if (!r?.retry && missed > 0 && !r?.spot && left()) r = { retry: true };
  if (r?.retry) {
    retryAt.set(`${player.id}/${hunt.id}`, system.currentTick + 100); // not loaded yet: look again in 5 seconds
    return;
  }
  if (!hunts.includes(hunt) || hunt.chest || hunt.mark) return; // given up or done meanwhile
  let dim;
  try {
    dim = world.getDimension(hunt.dim);
  } catch {
    dim = player.dimension;
  }
  if (r?.spot && !blockAt(dim, r.spot.x, r.spot.y, r.spot.z)) {
    retryAt.set(`${player.id}/${hunt.id}`, system.currentTick + 100); // its land unloaded just now: look again later
    return;
  }
  const kind = r?.kind ? r.kind.split(":")[0] : undefined;
  if (final) {
    const near = kind ? nearRiddle(kind, "the treasure lies buried", r?.info ?? {}) : undefined;
    buried(player, hunt, r?.spot, near, kind);
    return;
  }
  if (r?.spot && kind && get("markers") === true) {
    const styles = /** @type {Vector3 & { styles?: string[] }} */ (r.spot).styles;
    const fits = MARKERS.filter((m) => !styles || styles.includes(m.id));
    const style = any(fits.filter((m) => m.id !== hunt.style)) ?? fits[0] ?? MARKERS[0];
    const wool = any(WOOLS);
    let ok = true;
    /** @type {Parameters<typeof record>[1]} */
    const placed = [];
    for (const b of style.blocks(wool)) {
      const block = blockAt(dim, r.spot.x + b.dx, r.spot.y + b.dy, r.spot.z + b.dz);
      if (!block || !(block.isAir || SOFT.test(block.typeId))) continue; // something moved in meanwhile
      try {
        const orig = kindOf(block);
        block.setType(b.type);
        placed.push({ x: block.location.x, y: block.location.y, z: block.location.z, placed: b.type, orig });
      } catch (e) {
        ok = false;
        console.warn(`[maps] marker: ${e}`);
      }
    }
    if (placed.length) hunt.markUndo = record({ dim: dim.id, owner: player.id, hunt: hunt.id, what: "mark" }, placed);
    if (!ok) release(hunt.markUndo);
    if (ok) {
      hunt.mark = { x: r.spot.x, y: r.spot.y + 1, z: r.spot.z };
      hunt.style = style.id;
      hunt.near = nearRiddle(kind, `${markerLooks(style.id, wool)} stands`, r.info ?? {});
      (hunt.feats ??= []).push(kind);
      saveHunts(player, hunts);
      updateMaps(player, hunt);
      player.sendMessage(`§6The map's ink darkens: §e${hunt.near}`);
      player.playSound("item.book.page_turn");
      return;
    }
  }
  // Water, builds or no markers: the next clue waits in a bottle, found by coming close.
  hunt.nomark = true;
  const place = describe(dim, hunt.pts[hunt.leg]);
  hunt.near = `A bottle with the next clue lies ${place ?? "somewhere close"}, within ${CONFIG.legRadius} paces of the spot.`;
  saveHunts(player, hunts);
  updateMaps(player, hunt);
  player.sendMessage(`§6The map's ink darkens: §e${hunt.near}`);
}

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
 * @param {Player} player @param {Hunt} hunt @param {Vector3 | undefined} spot @param {string} [near] the riddle for the spot @param {string} [kind] its landmark
 */
function buried(player, hunt, spot, near, kind) {
  const hunts = huntsOf(player);
  if (!hunts.includes(hunt) || hunt.chest) return; // given up meanwhile
  let dim;
  try {
    dim = world.getDimension(hunt.dim); // the player may have changed dimension while the spot was searched
  } catch {
    dim = player.dimension;
  }
  if (spot) {
    const b = blockAt(dim, spot.x, spot.y, spot.z);
    if (b && GROUND.test(b.typeId)) {
      const orig = kindOf(b);
      b.setType("minecraft:chest");
      hunt.chestUndo = record({ dim: dim.id, owner: player.id, hunt: hunt.id, what: "chest" }, [{ x: spot.x, y: spot.y, z: spot.z, placed: "minecraft:chest", orig }]);
      const inv = b.getComponent("minecraft:inventory")?.container;
      for (const stack of rollLoot()) inv?.addItem(stack);
      hunt.chest = spot;
      hunt.near = near ?? `The treasure lies buried ${describe(dim, spot) ?? "close by"}.`;
      if (kind) (hunt.feats ??= []).push(kind);
      saveHunts(player, hunts);
      updateMaps(player, hunt);
      player.sendMessage(`§6The map grows warm in your hands. §e${hunt.near} §7Close by, follow the warmth, then dig.`);
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
  hunt.near = undefined;
  hunt.from = { x: Math.round(player.location.x), z: Math.round(player.location.z) };
  hunt.fromName = "where you stand";
  hunt.clue = FAR.bearing(hunt.from, hunt.pts[last], "where you stand", true);
  saveHunts(player, hunts);
  updateMaps(player, hunt);
  player.sendMessage(`§6The map's ink shifts: the treasure isn't here after all. §f"${hunt.clue}"`);
}

/**
 * The hunt is done with its marker (and, with `chest`, its chest): their blocks are put back soon (scripts/cleanup.js).
 * A marker or chest from before 1.3.0 has no record: one is made from what the hunt remembers (the marker's style, any
 * wool color; it stood on air, the chest on dirt).
 * @param {Player} player @param {Hunt} hunt @param {boolean} chest
 */
function letGo(player, hunt, chest) {
  try {
    const at = { dim: hunt.dim, owner: player.id, hunt: hunt.id };
    if (hunt.markUndo) release(hunt.markUndo);
    else if (hunt.mark) {
      const style = MARKERS.find((m) => m.id === hunt.style);
      const g = hunt.mark;
      const list = (style?.blocks(ANY_WOOL) ?? []).map((b) => ({ x: g.x + b.dx, y: g.y - 1 + b.dy, z: g.z + b.dz, placed: b.type, orig: { t: "minecraft:air" } }));
      if (list.length) release(record({ ...at, what: "mark" }, list));
    }
    hunt.markUndo = undefined;
    if (!chest) return;
    if (hunt.chestUndo) release(hunt.chestUndo);
    else if (hunt.chest) release(record({ ...at, what: "chest" }, [{ ...hunt.chest, placed: "minecraft:chest", orig: { t: "minecraft:dirt" } }]));
    hunt.chestUndo = undefined;
  } catch (e) {
    console.warn(`[maps] cleanup: ${e}`);
  }
}

// Records whose hunt is gone (an older save, a hunt lost some other way) are let go once their owner is online.
startSweep((owner) => {
  const p = online(owner);
  if (!p) return undefined;
  return huntsOf(p).flatMap((h) => [h.markUndo ?? "", h.chestUndo ?? ""]).filter(Boolean);
});

/**
 * The treasure is found: pay, tell the other packs, and close the hunt. `inChest` false hands the loot over directly
 * (when no spot for a chest was found).
 * @param {Player} player @param {Hunt} hunt @param {boolean} inChest
 */
function found(player, hunt, inChest) {
  letGo(player, hunt, true);
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
  let crowns = randInt(lo, Math.max(lo, get("crownsMax")));
  if (typeof hunt.rv === "number" && Date.now() > hunt.rv) {
    // Lost the race: Rook got to the chest first and took his cut.
    crowns = Math.floor(crowns * Math.max(0, Math.min(1, Number(CONFIG.rivalShare))));
    player.sendMessage("§7Rook got here first: he left you the chest, but took his cut of the coins.");
  }
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
  shareWithParty(player, crowns);
}

const PARTY_TAG = "realm_party:"; // the Parties pack's tag on every member, `realm_party:<code>`

/**
 * Party mates near the finder share the find: `partyShare` percent of its Crowns each (paid on top), the Field Journal
 * entry and the Exploration XP. The loot in the chest is theirs to split.
 * @param {Player} player @param {number} crowns what the finder got
 */
function shareWithParty(player, crowns) {
  const tag = player.getTags().find((t) => t.startsWith(PARTY_TAG));
  if (!tag) return;
  const range = Math.max(1, get("partyRange"));
  const share = Math.floor((crowns * Math.max(0, Math.min(100, get("partyShare")))) / 100);
  const mates = player.dimension.getPlayers({ location: player.location, maxDistance: range, tags: [tag] }).filter((p) => p.id !== player.id);
  for (const mate of mates) {
    mate.sendMessage(`§d[Party] §6You helped ${player.name} find the treasure!`);
    if (share > 0 && addCrowns(mate, share)) mate.sendMessage(`§6+${share} Crowns §7(Treasure map, with ${player.name})`);
    mate.playSound("random.levelup", { pitch: 1.2 });
    send("realm:journal", { player: mate.id, page: "places", entry: "treasure", label: "Buried treasure" });
    if (CONFIG.skillXp > 0) send("realm:skill_xp", { player: mate.id, skill: "exploration", amount: CONFIG.skillXp });
  }
}

// Scenario tests (BDS harness): finds the treasure of a player's first hunt right away (a whole hunt takes minutes).
// Only from the server console. /scriptevent realm:maps_test {"action":"found","player":"<name>"}
system.afterEvents.scriptEventReceive.subscribe(
  (ev) => {
    if (ev.id !== "realm:maps_test" || ev.sourceType !== ScriptEventSource.Server) return;
    try {
      const m = JSON.parse(ev.message);
      const player = world.getAllPlayers().find((p) => p.name === m?.player);
      const hunt = player ? huntsOf(player)[0] : undefined;
      if (player && hunt && m.action === "found") found(player, hunt, false);
    } catch (e) {
      console.warn(`[maps] test: ${e}`);
    }
  },
  { namespaces: ["realm"] },
);

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

// Townsfolk (Hearth & Hearsay): Mara's friends pay less for a treasure map. realm:affinity gives the percent (`off`) with
// mara, on a level change and when the player joins; kept in memory only.
/** @type {Map<string, number>} player id -> percent */
const maraOff = new Map();
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:affinity") return;
    try {
      const m = JSON.parse(message);
      if (!m || typeof m.player !== "string") return;
      if (m.all && typeof m.all === "object") maraOff.set(m.player, Number(m.off?.mara) || 0);
      else if (m.npc === "mara") maraOff.set(m.player, Number(m.off) || 0);
    } catch {
      // not ours
    }
  },
  { namespaces: ["realm"] },
);
/** @param {Player} player */
const maraOffOf = (player) => Math.max(0, Math.min(50, maraOff.get(player.id) ?? 0));
/** A price after the friend discount, rounded down (at least 1 when it isn't free). @param {Player} player @param {number} price */
const maraOffPrice = (player, price) => (price > 0 ? Math.max(1, Math.floor((price * (100 - maraOffOf(player))) / 100)) : 0);

/** @param {Player} player @param {string} title */
async function buyMenu(player, title) {
  const price = maraOffPrice(player, get("price"));
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
    `A treasure map leads ${fmt(lo)} to ${fmt(hi)} blocks from here, in riddles: a heading, compass steps or coordinates to puzzle out, and at the end of each a marker holds the next clue.`,
    `Hold the map near a marker or the treasure (within ${fmt(Math.max(8, get("warmthRadius")))} blocks) and it tells you whether you're getting warmer. At the end, a chest lies buried.`,
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
    const price = maraOffPrice(player, get("price"));
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
  if (hunt.near) lines.push(`§e${hunt.near}`);
  if (hunt.chest) lines.push("§6The chest is buried close by: follow the warmth, then dig.");
  if (get("plainHints") === true && hunt.dim === player.dimension.id) lines.push(`§7${plainHint(hunt, player.location)}`);
  lines.push("", `§7Within ${fmt(Math.max(8, get("warmthRadius")))} blocks of the marker or the chest, hold the map to feel whether you're getting warmer. Each clue is told from the marker where you found it.`);
  const res = await show(player, new ActionFormData().title(`§lTreasure Map ${hunt.id}`).body(lines.join("\n")).button("A new copy of the map").button("Give up this hunt").button("Close"));
  if (!res || res.canceled || !player.isValid) return;
  if (res.selection === 0) {
    if (!huntsOf(player).some((h) => h.id === hunt.id)) return; // found or given up while the menu was open
    const inv = inventoryOf(player);
    let carried = false;
    for (let slot = 0; inv && slot < inv.size && !carried; slot++) carried = mapIdOf(inv.getItem(slot)) === hunt.id;
    if (carried) {
      player.sendMessage("§7You already carry this treasure map.");
      return;
    }
    giveMap(player, hunt);
    player.sendMessage("§7Here's a fresh copy of your treasure map.");
  } else if (res.selection === 1) {
    const sure = await show(player, new ActionFormData().title("§lGive up?").body("Give up this treasure hunt? The map's Crowns aren't paid back.").button("Give it up").button("Keep hunting"));
    if (!sure || sure.canceled || sure.selection !== 0 || !player.isValid) return;
    const gone = huntsOf(player).find((h) => h.id === hunt.id);
    if (gone) letGo(player, gone, true);
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
        const buyer = online(msg.player);
        const price = buyer ? maraOffPrice(buyer, get("price")) : Math.max(0, get("price"));
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

// ---------------------------------------------------------------------------
// /realm:maps: the pack's menu
// ---------------------------------------------------------------------------

const isOp = (/** @type {Player} */ player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

/**
 * /realm:maps_give: a free map for each player that can take one, with a note for the caller.
 * @param {Player | undefined} caller @param {Player[]} targets
 */
function giveMaps(caller, targets) {
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
  if (caller?.isValid) caller.sendMessage(`§7Treasure maps: ${notes.join("; ") || "nothing to do"}.`);
}

/** The menu's "Give a treasure map": pick an online player, like /realm:maps_give. @param {Player} player */
async function giveMapForm(player) {
  const players = world.getAllPlayers().sort((a, b) => a.name.localeCompare(b.name));
  const res = await show(player, new ModalFormData().title("§lGive a treasure map").dropdown("Player", players.map((p) => p.name)).submitButton("Give"));
  if (!res || res.canceled || !res.formValues || !player.isValid) return;
  if (!isOp(player)) return player.sendMessage("§cOnly operators can give treasure maps."); // de-opped while the form was open
  const target = players[Number(res.formValues[0])];
  if (target) giveMaps(player, [target]);
}

/** @param {Player} player */
async function settingsInfo(player) {
  const res = await show(
    player,
    new ActionFormData()
      .title("§lSettings")
      .body("Operators change this pack's settings in §e/realm:config§r: pick §eTreasure Maps & Riddles§r there. The map price, hunts at once, hunt distances and hints are all there.")
      .button("Back"),
  );
  if (res && !res.canceled && player.isValid) await packMenu(player);
}

/**
 * /realm:maps: every action this player may use. A player with only one (not an operator) goes
 * straight to it, so the common case is no slower than before.
 * @param {Player} player
 */
async function packMenu(player) {
  /** @type {{ text: string, run: () => Promise<void> }[]} */
  const entries = [{ text: `Your treasure hunts\n§8${huntsOf(player).length} going`, run: () => showHunts(player) }];
  if (isOp(player)) {
    entries.push({ text: "Give a treasure map\n§8Operators", run: () => giveMapForm(player) });
    entries.push({ text: "Settings\n§8Operators", run: () => settingsInfo(player) });
  }
  if (entries.length === 1) return entries[0].run();
  const form = new ActionFormData().title("§lTreasure Maps").body("Buy treasure maps from a cartographer, then follow the clues to the buried chest.");
  for (const e of entries) form.button(e.text);
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  await entries[res.selection]?.run();
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:maps",
      description: "Treasure Maps: the menu (your treasure hunts; operators can also give maps)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => packMenu(player).catch((e) => console.warn(`[maps] ${e}`)));
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
      system.run(() => giveMaps(caller instanceof Player ? caller : undefined, targets));
      return { status: CustomCommandStatus.Success };
    },
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:maps_hunts",
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
});

// Callings (Skills): realm:calling carries each player's talent numbers (`bonus`: mapReveal: Map Sense's reveal distance). Kept in memory; Skills
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
/** How near a planned spot must be to build it: `revealDistance`, or farther with the Pathfinder's Map Sense (at most 160). @param {Player} player */
const revealFor = (player) => Math.max(get("revealDistance"), Math.min(160, callingValue(player, "mapReveal")));
/** A Calling talent's number for the player (0 without it). @param {Player} player @param {string} key */
const callingValue = (player, key) => Math.max(0, Number(callingBonus.get(player.id)?.[key]) || 0);

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "maps_bp");
  },
  { namespaces: ["realm"] },
);
