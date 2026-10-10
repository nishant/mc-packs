import { Block, CommandPermissionLevel, CustomCommandStatus, Dimension, Player, SignSide, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

const PACK = "waystone_bp";
const PROP_LIST = "waystone:list"; // world: JSON Waystone[]
const PROP_NEXT = "waystone:next"; // world: the next waystone id (number)
const PROP_KNOWN = "waystone:known"; // player: JSON number[]: ids of the waystones they discovered
const PROP_NEWS = "waystone:news"; // world: JSON News[]: the latest sky events, newest first
const LODESTONE = "minecraft:lodestone";
const SIGN_PREFIX = /^\s*waystone\b\s*:?/i; // "Waystone: River Gate", or "Waystone" on the first line and the name below
const NAME_MAX = 24;
const CHECK_RANGE = 96; // waystones this close to a player (so their chunk is loaded) are checked for a missing lodestone
const CHECKS_PER_RUN = 8;
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const DIM_NAMES = /** @type {Record<string, string>} */ ({ "minecraft:overworld": "Overworld", "minecraft:nether": "Nether", "minecraft:the_end": "The End" });
const PASSABLE = /^minecraft:air$|sign|torch|short_grass|tall_grass|fern|flower|dandelion|poppy|tulip|orchid|allium|bluet|daisy|cornflower|lily_of_the_valley|carpet|snow_layer|button|lever|rail|vine|banner|pressure_plate|sapling|petals|leaf_litter|deadbush|dead_bush/;
const UNSAFE_FLOOR = /lava|fire|magma|cactus|campfire|sweet_berry|powder_snow|water|^minecraft:air$/;
const NEWS_TEXT = /** @type {Record<string, string>} */ ({
  tornado: "A tornado tore across the land",
  rainbow: "A rainbow stood over the realm",
  meteor: "A meteor fell from the sky",
  blood_moon: "A blood moon rose",
  harvest_moon: "A harvest moon rose",
  aurora: "Lights danced in the night sky",
  storm_cell: "A great storm rolled through",
  caravan: "A caravan of traders came by",
  tournament: "The fishing tournament began",
});

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {{ i: number, n: string, d: string, x: number, y: number, z: number, by: string, t: number }} Waystone id, name, dimension, lodestone position, who made it, when */
/** @typedef {{ k: string, t: number, text?: string, d?: string, x?: number, z?: number }} News */
/** @typedef {{ to: Waystone, at: Vector3, dim: string, left: number, cost: number, hurt: boolean }} Channel at/dim: where the player started, and goes back to if the far waystone turns out unsafe */

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** @param {string} id @returns {Player | undefined} */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);
const isOp = (/** @type {Player} */ player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
/** @param {Vector3} a @param {Vector3} b */
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** The middle of the lodestone. @param {Waystone} w */
const center = (w) => ({ x: w.x + 0.5, y: w.y + 0.5, z: w.z + 0.5 });
/** @param {string} dim */
const dimName = (dim) => DIM_NAMES[dim] ?? dim.replace(/^minecraft:/, "");
/** "River Gate" -> "river_gate". @param {string} name */
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "waystone";
/** 0 = N ... 7 = NW, from `a` toward `b` (north is -z). @param {Vector3} a @param {Vector3} b */
function compass(a, b) {
  const deg = (Math.atan2(b.x - a.x, -(b.z - a.z)) * 180) / Math.PI;
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
/** "240m NE". @param {Vector3} from @param {Vector3} to */
const where = (from, to) => `${Math.round(Math.hypot(to.x - from.x, to.z - from.z))}m ${compass(from, to)}`;
/** "3h ago". @param {number} ms */
function ago(ms) {
  const m = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

/** Sends a cross-pack script event (see the build spec's contracts). @param {string} id @param {object} data */
function send(id, data) {
  try {
    system.sendScriptEvent(id, JSON.stringify(data));
  } catch (e) {
    console.warn(`[waystone] ${id}: ${e}`);
  }
}

// Crowns: the shared `crowns` scoreboard (the Crowns pack shows balances; any pack may charge).
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
function takeCrowns(p, n) {
  if (n <= 0) return true;
  if (crownsOf(p) < n) return false;
  try {
    crownsObjective().addScore(p, -Math.floor(n));
    return true;
  } catch (e) {
    console.warn(`[waystone] crowns: ${e}`);
    return false;
  }
}

/** "3 Crowns" or "2 levels", in the travel currency. @param {number} n */
const price = (n) => (get("currency") === "levels" ? `${n} level${n === 1 ? "" : "s"}` : `${n} Crown${n === 1 ? "" : "s"}`);
/** @param {Player} player */
const balance = (player) => (get("currency") === "levels" ? player.level : crownsOf(player));
/** Takes the travel cost; false if the player can't pay. @param {Player} player @param {number} n */
function charge(player, n) {
  if (n <= 0) return true;
  if (get("currency") === "levels") {
    if (player.level < n) return false;
    player.addLevels(-n);
    return true;
  }
  return takeCrowns(player, n);
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

/** @param {Dimension} dim @param {Vector3} p */
function blockAt(dim, p) {
  try {
    return dim.getBlock({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) });
  } catch {
    return undefined; // unloaded or outside the world
  }
}

// ---------------------------------------------------------------------------
// The waystone list (world) and what each player discovered
// ---------------------------------------------------------------------------

/** @type {Waystone[] | undefined} */
let list;
/** @returns {Waystone[]} */
function waystones() {
  if (list) return list;
  try {
    const raw = world.getDynamicProperty(PROP_LIST);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : [];
    list = Array.isArray(parsed) ? parsed.filter((w) => w && typeof w.i === "number" && typeof w.n === "string" && typeof w.d === "string") : [];
  } catch {
    console.warn("[waystone] the waystone list is corrupt; starting a new one");
    list = [];
  }
  return /** @type {Waystone[]} */ (list);
}
function saveList() {
  try {
    world.setDynamicProperty(PROP_LIST, JSON.stringify(waystones()));
  } catch (e) {
    console.warn(`[waystone] save: ${e}`);
  }
}

/** The waystone whose lodestone is at this block. @param {string} dim @param {Vector3} p */
const waystoneAt = (dim, p) => waystones().find((w) => w.d === dim && w.x === p.x && w.y === p.y && w.z === p.z);
/** @param {number} id */
const byId = (id) => waystones().find((w) => w.i === id);

/** Removes a waystone (its lodestone is gone, or an operator removed it). @param {Waystone} w @param {string} why */
function removeWaystone(w, why) {
  list = waystones().filter((x) => x.i !== w.i);
  saveList();
  console.warn(`[waystone] removed "${w.n}" at ${w.x} ${w.y} ${w.z}: ${why}`);
  for (const [id, ch] of channels) {
    if (ch.to.i !== w.i) continue;
    channels.delete(id);
    online(id)?.sendMessage(`§cThe waystone ${w.n} is gone. Your trip is canceled.`);
  }
}

/** @type {Map<string, Set<number>>} */
const knownCache = new Map();
/** @param {Player} player */
function knownOf(player) {
  let known = knownCache.get(player.id);
  if (known) return known;
  known = new Set();
  try {
    const raw = player.getDynamicProperty(PROP_KNOWN);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) for (const id of parsed) if (typeof id === "number") known.add(id);
  } catch {
    // corrupt: start again
  }
  knownCache.set(player.id, known);
  return known;
}

/** Marks a waystone discovered for the player; true if it's new to them. @param {Player} player @param {Waystone} w */
function discover(player, w) {
  const known = knownOf(player);
  if (known.has(w.i)) return false;
  known.add(w.i);
  // Forget ids of waystones that no longer exist, so the list stays small.
  const live = new Set(waystones().map((x) => x.i));
  for (const id of known) if (!live.has(id)) known.delete(id);
  try {
    player.setDynamicProperty(PROP_KNOWN, JSON.stringify([...known]));
  } catch (e) {
    console.warn(`[waystone] save: ${e}`);
  }
  player.sendMessage(`§bWaystone discovered: §f${w.n}§b. §7Tap any waystone you know to travel here.`);
  player.playSound("random.orb", { pitch: 0.7 });
  send("realm:journal", { player: player.id, page: "places", entry: `waystone_${slug(w.n)}`, label: `Waystone: ${w.n}` });
  return true;
}

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  knownCache.delete(playerId);
  channels.delete(playerId);
  lastNpc.delete(playerId);
});

// ---------------------------------------------------------------------------
// Making a waystone: a lodestone with a "Waystone: <name>" sign within one block
// ---------------------------------------------------------------------------

/** The text on a sign block (front, then back), or undefined. @param {Block} block */
function signText(block) {
  try {
    const sign = block.getComponent("minecraft:sign");
    if (!sign) return undefined;
    for (const side of [SignSide.Front, SignSide.Back]) {
      let text = sign.getText(side);
      if (text === undefined) {
        const raw = sign.getRawText(side);
        text = raw?.rawtext?.map((r) => r.text ?? "").join("");
      }
      if (text && SIGN_PREFIX.test(text)) return text;
    }
  } catch {
    // not a sign after all
  }
  return undefined;
}

/** The waystone name on a sign next to this lodestone: "" when the sign has no name, undefined when there's no sign. @param {Block} lodestone */
function signName(lodestone) {
  const { x, y, z } = lodestone.location;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dy && !dz) continue;
        const b = blockAt(lodestone.dimension, { x: x + dx, y: y + dy, z: z + dz });
        if (!b || !b.typeId.includes("sign")) continue;
        const text = signText(b);
        if (text === undefined) continue;
        return text
          .replace(SIGN_PREFIX, "")
          .replace(/§./g, "")
          .replace(/[^\x20-\x7e]/g, " ") // game text stays ASCII
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, NAME_MAX)
          .trim();
      }
    }
  }
  return undefined;
}

world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  if (!ev.isFirstEvent || ev.itemStack || ev.block.typeId !== LODESTONE) return;
  const { player, block } = ev;
  const dimension = block.dimension;
  const at = { ...block.location };
  system.run(() => {
    try {
      const b = blockAt(dimension, at);
      if (b && b.typeId === LODESTONE && player.isValid) tapped(player, b);
    } catch (e) {
      console.warn(`[waystone] ${e}`);
    }
  });
});

/** An empty-hand tap on a lodestone: travel from a waystone, or make one. @param {Player} player @param {Block} lodestone */
function tapped(player, lodestone) {
  const w = waystoneAt(lodestone.dimension.id, lodestone.location);
  if (w) {
    discover(player, w);
    if (channels.has(player.id)) return;
    travelMenu(player, w).catch((e) => console.warn(`[waystone] ${e}`));
    return;
  }
  const name = signName(lodestone);
  if (name === undefined) {
    player.sendMessage("§7Put a sign saying §fWaystone: <name>§7 next to this lodestone, then tap it again to make a waystone.");
    return;
  }
  if (!name) {
    player.sendMessage("§cWrite a name after Waystone: on the sign, like Waystone: River Gate.");
    return;
  }
  if (get("whoCanCreate") === "operators" && !isOp(player)) {
    player.sendMessage("§cOnly operators can make waystones on this realm.");
    return;
  }
  const all = waystones();
  if (all.length >= CONFIG.maxWaystones) {
    player.sendMessage(`§cThis realm already has ${all.length} waystones, the most it can keep.`);
    return;
  }
  if (all.some((x) => x.n.toLowerCase() === name.toLowerCase())) {
    player.sendMessage(`§cThere's already a waystone named ${name}. Pick another name for the sign.`);
    return;
  }
  const next = world.getDynamicProperty(PROP_NEXT);
  const id = Math.max(typeof next === "number" ? next : 1, ...all.map((x) => x.i + 1));
  world.setDynamicProperty(PROP_NEXT, id + 1);
  const { x, y, z } = lodestone.location;
  /** @type {Waystone} */
  const made = { i: id, n: name, d: lodestone.dimension.id, x, y, z, by: player.name, t: Date.now() };
  all.push(made);
  saveList();
  player.sendMessage(`§bYou raised the waystone §f${name}§b! §7Anyone who finds it can travel here from another waystone.`);
  player.playSound("random.levelup", { pitch: 0.8 });
  discover(player, made);
}

// A lodestone that's broken or blown up takes its waystone with it.
world.afterEvents.playerBreakBlock.subscribe(({ block, brokenBlockPermutation, player }) => {
  if (brokenBlockPermutation.type.id !== LODESTONE) return;
  try {
    const w = waystoneAt(block.dimension.id, block.location);
    if (!w) return;
    removeWaystone(w, `broken by ${player.name}`);
    player.sendMessage(`§7The waystone ${w.n} is gone.`);
  } catch (e) {
    console.warn(`[waystone] ${e}`);
  }
});
world.afterEvents.blockExplode.subscribe(({ block, explodedBlockPermutation }) => {
  if (explodedBlockPermutation.type.id !== LODESTONE) return;
  try {
    const w = waystoneAt(block.dimension.id, block.location);
    if (w) removeWaystone(w, "blown up");
  } catch (e) {
    console.warn(`[waystone] ${e}`);
  }
});

// Every second: discover waystones players stand near. Every 5 seconds: check a few waystones near players
// (their chunks are loaded) for a lodestone that went missing some other way (pistons, /fill, an older pack version).
let checkIndex = 0;
let seconds = 0;
system.runInterval(() => {
  seconds++;
  const all = waystones();
  if (!all.length) return;
  const players = world.getAllPlayers();
  const radius = CONFIG.discoverRadius;
  for (const player of players) {
    try {
      const dim = player.dimension.id;
      const loc = player.location;
      const known = knownOf(player);
      for (const w of all) if (w.d === dim && !known.has(w.i) && dist3(loc, center(w)) <= radius + 0.5) discover(player, w);
    } catch (e) {
      console.warn(`[waystone] ${e}`);
    }
  }
  if (seconds % 5) return;
  for (let n = 0; n < Math.min(CHECKS_PER_RUN, all.length); n++) {
    const w = all[checkIndex++ % all.length];
    if (!w || !players.some((p) => p.dimension.id === w.d && dist3(p.location, center(w)) <= CHECK_RANGE)) continue;
    try {
      const b = blockAt(world.getDimension(w.d), w);
      if (b && b.typeId !== LODESTONE) {
        removeWaystone(w, `the lodestone is now ${b.typeId}`);
        break; // the list changed: carry on next time
      }
    } catch (e) {
      console.warn(`[waystone] ${e}`);
    }
  }
}, 20);

// ---------------------------------------------------------------------------
// Travel
// ---------------------------------------------------------------------------

/**
 * What a trip costs, or undefined when it isn't allowed (another dimension with crossDimension off).
 * @param {string} fromDim @param {Vector3} from @param {Waystone} to
 */
function costTo(fromDim, from, to) {
  if (fromDim !== to.d) return get("crossDimension") === true ? Math.max(0, get("crossDimensionCost")) : undefined;
  const d = dist3(from, center(to));
  return Math.max(Math.max(0, get("minCost")), Math.ceil((d / 100) * Math.max(0, get("costPer100"))));
}

/** The player's discovered waystones they can travel to from here, nearest first. @param {Player} player @param {Waystone | undefined} here */
function destinations(player, here) {
  const known = knownOf(player);
  const dim = player.dimension.id;
  const from = here ? center(here) : player.location;
  return waystones()
    .filter((w) => known.has(w.i) && w.i !== here?.i)
    .map((w) => ({ w, cost: costTo(dim, from, w), d: w.d === dim ? dist3(from, center(w)) : Infinity }))
    .sort((a, b) => a.d - b.d || a.w.n.localeCompare(b.w.n));
}

/**
 * The travel menu, at a waystone (`here`) or from anywhere (with travelAnywhere).
 * @param {Player} player @param {Waystone | undefined} here
 */
async function travelMenu(player, here) {
  const options = destinations(player, here).filter((o) => o.cost !== undefined);
  const title = here ? `§lWaystone: ${here.n}` : "§lWaystones";
  if (!options.length) {
    await show(player, new ActionFormData().title(title).body("You haven't discovered any other waystones yet. Find one by tapping it or standing next to it, and you can travel there from here.").button("Close"));
    return;
  }
  const from = here ? center(here) : player.location;
  const secs = Math.max(0, get("channelSeconds"));
  const body = `Where to? You have ${price(balance(player))}.${secs ? ` Stand still for ${secs} seconds after choosing: moving or getting hurt cancels the trip.` : ""}`;
  const form = new ActionFormData().title(title).body(body);
  for (const o of options) {
    const place = o.w.d === player.dimension.id ? where(from, center(o.w)) : dimName(o.w.d);
    form.button(`${o.w.n}\n§8${place}, ${o.cost ? price(/** @type {number} */ (o.cost)) : "free"}`);
  }
  form.button("Close");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  const pick = options[res.selection];
  if (!pick) return;
  const cost = /** @type {number} */ (pick.cost);
  if (balance(player) < cost) {
    player.sendMessage(`§cThat trip costs ${price(cost)}. You have ${price(balance(player))}.`);
    return;
  }
  if (here && dist3(player.location, center(here)) > 6) {
    player.sendMessage("§cYou walked away from the waystone.");
    return;
  }
  begin(player, pick.w, cost);
}

/** @type {Map<string, Channel>} player id -> the trip they're waiting for */
const channels = new Map();

/** @param {Player} player @param {Waystone} to @param {number} cost */
function begin(player, to, cost) {
  if (channels.has(player.id)) return;
  const secs = Math.max(0, get("channelSeconds"));
  channels.set(player.id, { to, at: { ...player.location }, dim: player.dimension.id, left: secs * 20, cost, hurt: false });
  if (secs) player.sendMessage(`§bTraveling to ${to.n} in ${secs} seconds. §7Stand still.`);
  player.playSound("beacon.activate", { pitch: 1.4, volume: 0.7 });
}

world.afterEvents.entityHurt.subscribe(({ hurtEntity }) => {
  if (!(hurtEntity instanceof Player)) return;
  const ch = channels.get(hurtEntity.id);
  if (ch) ch.hurt = true;
});

const CHANNEL_STEP = 5; // ticks
system.runInterval(() => {
  if (!channels.size) return;
  for (const [id, ch] of channels) {
    const player = online(id);
    if (!player) {
      channels.delete(id);
      continue;
    }
    try {
      const cancel = ch.hurt ? "You got hurt" : player.dimension.id !== ch.dim || dist3(player.location, ch.at) > 1 ? "You moved" : undefined;
      if (cancel) {
        channels.delete(id);
        player.sendMessage(`§c${cancel}: the trip to ${ch.to.n} is canceled.`);
        send("realm:actionbar", { player: id, ticks: 40 });
        player.onScreenDisplay.setActionBar("§cTrip canceled");
        continue;
      }
      ch.left -= CHANNEL_STEP;
      if (ch.left <= 10 && ch.left > 10 - CHANNEL_STEP) fade(player); // the screen goes dark just before the jump
      if (ch.left <= 0) {
        channels.delete(id);
        arrive(player, ch);
        continue;
      }
      if (ch.left % 20 < CHANNEL_STEP) {
        send("realm:actionbar", { player: id, ticks: 30 });
        player.onScreenDisplay.setActionBar(`§bTraveling to ${ch.to.n} in ${Math.ceil(ch.left / 20)}...`);
      }
    } catch (e) {
      channels.delete(id);
      console.warn(`[waystone] ${e}`);
    }
  }
}, CHANNEL_STEP);

/** @param {Player} player */
function fade(player) {
  try {
    player.camera.fade({ fadeTime: { fadeInTime: 0.5, holdTime: 0.6, fadeOutTime: 0.9 }, fadeColor: { red: 0.05, green: 0.05, blue: 0.15 } });
  } catch {
    // no fade: the trip still happens
  }
}

/**
 * A spot to stand next to the waystone: beside it (feet and head free, solid floor), else on top of it.
 * Undefined while its chunk isn't loaded.
 * @param {Dimension} dim @param {Waystone} w @returns {Vector3 | undefined}
 */
function safeSpot(dim, w) {
  if (!blockAt(dim, w)) return undefined;
  const free = (/** @type {Vector3} */ p) => {
    const b = blockAt(dim, p);
    return !!b && PASSABLE.test(b.typeId);
  };
  const floor = (/** @type {Vector3} */ p) => {
    const b = blockAt(dim, p);
    return !!b && !PASSABLE.test(b.typeId) && !UNSAFE_FLOOR.test(b.typeId);
  };
  const sides = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]];
  for (const dy of [0, 1, -1]) {
    for (const [dx, dz] of sides) {
      const feet = { x: w.x + dx, y: w.y + dy, z: w.z + dz };
      if (free(feet) && free({ ...feet, y: feet.y + 1 }) && floor({ ...feet, y: feet.y - 1 })) return { x: feet.x + 0.5, y: feet.y, z: feet.z + 0.5 };
    }
  }
  const top = { x: w.x, y: w.y + 1, z: w.z };
  if (free(top) && free({ ...top, y: top.y + 1 })) return { x: w.x + 0.5, y: w.y + 1, z: w.z + 0.5 };
  // Buried: the first open space with a safe floor straight above the lodestone (a waystone in a cellar).
  for (let y = w.y + 2; y <= w.y + 40; y++) {
    const feet = { x: w.x, y, z: w.z };
    if (free(feet) && free({ ...feet, y: y + 1 }) && floor({ ...feet, y: y - 1 })) return { x: w.x + 0.5, y, z: w.z + 0.5 };
  }
  return undefined;
}

/** A block a player can't stand in: anything solid, and lava or fire (water is fine). @param {import("@minecraft/server").Block | undefined} b */
const blocked = (b) => !!b && !PASSABLE.test(b.typeId) && !/water|seagrass|kelp/.test(b.typeId);

/** The wait is over: pay and jump. @param {Player} player @param {Channel} ch */
function arrive(player, ch) {
  const to = byId(ch.to.i);
  if (!to) {
    player.sendMessage(`§cThe waystone ${ch.to.n} is gone. Your trip is canceled.`);
    return;
  }
  if (!charge(player, ch.cost)) {
    player.sendMessage(`§cThat trip costs ${price(ch.cost)}. You have ${price(balance(player))}.`);
    return;
  }
  const dim = world.getDimension(to.d);
  // The far waystone's chunk is usually unloaded: land on top of the lodestone, then step beside it once it loads.
  // When it is loaded and there's nowhere safe to stand, don't go at all.
  const loaded = !!blockAt(dim, to);
  const found = safeSpot(dim, to);
  if (loaded && !found) {
    player.sendMessage(`§cThere's no safe place to stand at ${to.n}: the waystone is walled in. Your trip is canceled.`);
    return;
  }
  const spot = found ?? { x: to.x + 0.5, y: to.y + 1, z: to.z + 0.5 };
  try {
    player.teleport(spot, { dimension: dim, facingLocation: center(to), keepVelocity: false });
  } catch (e) {
    console.warn(`[waystone] teleport: ${e}`);
    player.sendMessage("§cThe waystone's magic fizzled. Try again in a moment.");
    if (ch.cost > 0) refund(player, ch.cost);
    return;
  }
  player.playSound("mob.endermen.portal", { volume: 0.8 });
  if (ch.cost > 0) player.sendMessage(`§7Paid ${price(ch.cost)} for the trip to ${to.n}.`);
  // A few times: a far chunk (or another dimension) can take a moment to load.
  system.runTimeout(() => settle(player, to, ch), 10);
  system.runTimeout(() => settle(player, to, ch), 40);
  system.runTimeout(() => settle(player, to, ch), 100);
}

/** @param {Player} player @param {number} n */
function refund(player, n) {
  try {
    if (get("currency") === "levels") player.addLevels(n);
    else crownsObjective().addScore(player, n);
  } catch (e) {
    console.warn(`[waystone] refund: ${e}`);
  }
}

/**
 * After landing: the lodestone may be gone, and the spot may be blocked (inside a block, in lava, or over a drop
 * where the lodestone was). Moves the player to a safe spot by the waystone, or else back to where they started,
 * with the trip paid back.
 * @param {Player} player @param {Waystone} to @param {Channel} ch
 */
function settle(player, to, ch) {
  try {
    if (!player.isValid || player.dimension.id !== to.d) return;
    if (dist3(player.location, center(to)) > 8) return; // already walked off
    const dim = player.dimension;
    const b = blockAt(dim, to);
    if (!b) return; // still loading: the next check looks again
    const gone = b.typeId !== LODESTONE;
    if (gone && byId(to.i)) {
      removeWaystone(to, `the lodestone is now ${b.typeId}`);
      player.sendMessage(`§7The waystone ${to.n} has crumbled: its lodestone is gone.`);
    }
    const loc = player.location;
    const feet = blockAt(dim, loc);
    const head = blockAt(dim, { ...loc, y: loc.y + 1 });
    const under = blockAt(dim, { ...loc, y: loc.y - 1 });
    const stuck = blocked(feet) || blocked(head);
    const falling = gone && !!under && PASSABLE.test(under.typeId);
    if (!stuck && !falling) return;
    const spot = safeSpot(dim, to);
    if (spot) {
      player.teleport(spot, { facingLocation: center(to) });
      return;
    }
    // Nowhere safe here: back to where the trip started, paid back.
    player.teleport(ch.at, { dimension: world.getDimension(ch.dim) });
    if (ch.cost > 0) refund(player, ch.cost);
    player.sendMessage(`§cThere's no safe place to stand at ${to.n}, so the waystone sent you back.${ch.cost > 0 ? ` Your ${price(ch.cost)} were paid back.` : ""}`);
  } catch (e) {
    console.warn(`[waystone] ${e}`);
  }
}

// ---------------------------------------------------------------------------
// /realm:waystones
// ---------------------------------------------------------------------------

/** @param {Player} player */
async function listMenu(player) {
  if (get("travelAnywhere") === true) {
    if (channels.has(player.id)) return;
    // At a waystone the trip is priced from it; anywhere else, from where the player stands.
    const near = waystones().find((w) => w.d === player.dimension.id && dist3(player.location, center(w)) <= CONFIG.discoverRadius + 0.5);
    await travelMenu(player, near);
    return;
  }
  const options = destinations(player, undefined);
  const lines = options.map((o) => `§f${o.w.n} §7${o.w.d === player.dimension.id ? where(player.location, center(o.w)) : dimName(o.w.d)}`);
  const body = options.length
    ? [`You've discovered ${options.length} waystone${options.length === 1 ? "" : "s"}. Tap a waystone (a lodestone with a Waystone sign) with an empty hand to travel.`, "", ...lines].join("\n")
    : "You haven't discovered any waystones yet. A waystone is a lodestone with a sign saying Waystone: <name>. Tap one or stand next to it to discover it.";
  await show(player, new ActionFormData().title("§lWaystones").body(body).button("Close"));
}

// ---------------------------------------------------------------------------
// Inns: NPCs with the innkeeper role rent beds and tell the news
// ---------------------------------------------------------------------------

/** The NPC each player last talked to: its id and name. @type {Map<string, { npc: string, name: string }>} */
const lastNpc = new Map();

/** @type {News[] | undefined} */
let news;
/** @returns {News[]} */
function newsOf() {
  if (news) return news;
  try {
    const raw = world.getDynamicProperty(PROP_NEWS);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : [];
    news = Array.isArray(parsed) ? parsed.filter((n) => n && typeof n.k === "string" && typeof n.t === "number") : [];
  } catch {
    news = [];
  }
  return /** @type {News[]} */ (news);
}

/** @param {any} msg a realm:sky_event message */
function remember(msg) {
  if (!msg || typeof msg.kind !== "string") return;
  /** @type {News} */
  const item = { k: msg.kind.slice(0, 32), t: Date.now() };
  if (typeof msg.text === "string") item.text = msg.text.replace(/§./g, "").slice(0, 160);
  if (typeof msg.dim === "string") item.d = msg.dim;
  if (typeof msg.x === "number" && typeof msg.z === "number") {
    item.x = Math.round(msg.x);
    item.z = Math.round(msg.z);
  }
  const all = newsOf();
  // The same kind of event again within a minute is the same event (some packs announce more than once).
  if (all[0] && all[0].k === item.k && item.t - all[0].t < 60000) all.shift();
  all.unshift(item);
  news = all.slice(0, Math.max(1, CONFIG.newsKept));
  try {
    world.setDynamicProperty(PROP_NEWS, JSON.stringify(news));
  } catch (e) {
    console.warn(`[waystone] news: ${e}`);
  }
}

/** @param {Player} player @param {string} title */
async function newsMenu(player, title) {
  const items = newsOf();
  const lines = items.map((n) => {
    const text = n.text ?? NEWS_TEXT[n.k] ?? `Something happened: ${n.k.replace(/_/g, " ")}`;
    const place = n.x !== undefined && n.z !== undefined && (n.d ?? "minecraft:overworld") === player.dimension.id ? ` §7(${where(player.location, { x: n.x, y: 0, z: n.z })} of here)` : "";
    return `§e${ago(n.t)}: §f${text}${place}`;
  });
  const body = lines.length ? ["Here's what travelers have been talking about:", "", ...lines].join("\n") : "Nothing new lately. Quiet times, and I'm not complaining.";
  await show(player, new ActionFormData().title(title).body(body).button("Thanks"));
}

/** Finds the innkeeper NPC the player is talking to. @param {Player} player @param {string} npc */
function findNpc(player, npc) {
  try {
    const [found] = player.dimension.getEntities({ type: "minecraft:npc", tags: [`realm:npc_id:${npc}`], location: player.location, maxDistance: 16, closest: 1 });
    return found;
  } catch {
    return undefined;
  }
}

/** @param {Player} player @param {string} npc @param {string} title */
async function bedMenu(player, npc, title) {
  const cost = Math.max(0, get("bedPrice"));
  const minutes = Math.max(0, get("wellRestedMinutes"));
  const perks = minutes ? ` You'll wake up Well Rested: 2 extra hearts for ${minutes} minutes.` : "";
  const body = `A warm bed for the night${cost ? ` is ${cost} Crowns` : " is on the house"}. You'll come back here if you fall on your travels, until you sleep in a bed of your own.${perks}${cost ? `\n\nYou have ${crownsOf(player)} Crowns.` : ""}`;
  const res = await show(player, new ActionFormData().title(title).body(body).button(cost ? `Rent a bed\n§8${cost} Crowns` : "Rent a bed").button("Not now"));
  if (!res || res.canceled || res.selection !== 0 || !player.isValid) return;
  const keeper = findNpc(player, npc);
  const spot = keeper?.location ?? player.location;
  const dim = keeper?.dimension ?? player.dimension;
  if (dim.id !== "minecraft:overworld") {
    player.sendMessage("§cBeds can only be rented in the Overworld.");
    return;
  }
  if (!takeCrowns(player, cost)) {
    player.sendMessage(`§cA bed costs ${cost} Crowns. You have ${crownsOf(player)}.`);
    return;
  }
  try {
    player.setSpawnPoint({ dimension: dim, x: Math.floor(spot.x), y: Math.floor(spot.y), z: Math.floor(spot.z) });
  } catch (e) {
    console.warn(`[waystone] spawn point: ${e}`);
    if (cost) crownsObjective().addScore(player, cost);
    player.sendMessage("§cThe innkeeper can't find a free bed right now. Try again in a moment.");
    return;
  }
  if (cost) player.sendMessage(`§6-${cost} Crowns §7(A bed at the inn)`);
  if (minutes) {
    try {
      player.addEffect("health_boost", minutes * 60 * 20, { amplifier: 0, showParticles: false });
      player.addEffect("saturation", 40, { amplifier: 0, showParticles: false });
      player.addEffect("regeneration", 100, { amplifier: 1, showParticles: false }); // fills the new hearts
    } catch (e) {
      console.warn(`[waystone] effects: ${e}`);
    }
  }
  player.sendMessage(`§aYou rest at the inn.${minutes ? ` Well Rested: 2 extra hearts for ${minutes} minutes.` : ""} §7You'll wake up here if you fall.`);
  player.playSound("random.orb", { pitch: 0.6 });
}

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:npc_talk" && id !== "realm:npc_choose" && id !== "realm:sky_event") return;
    /** @type {any} */
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    try {
      if (id === "realm:sky_event") {
        remember(msg);
        return;
      }
      if (typeof msg.player !== "string") return;
      if (id === "realm:npc_talk") {
        if (!Array.isArray(msg.roles) || !msg.roles.includes(CONFIG.npcRole)) return;
        lastNpc.set(msg.player, { npc: String(msg.npc ?? ""), name: typeof msg.name === "string" ? msg.name : "§lThe Inn" });
        const cost = Math.max(0, get("bedPrice"));
        send("realm:npc_offer", { req: msg.req, pack: PACK, key: "bed", label: cost ? `Rent a bed (${cost} Crowns)` : "Rent a bed", order: 20 });
        send("realm:npc_offer", { req: msg.req, pack: PACK, key: "news", label: "Hear the news", order: 21 });
        return;
      }
      if (msg.pack !== PACK) return;
      const player = online(msg.player);
      if (!player) return;
      const npc = lastNpc.get(player.id) ?? { npc: String(msg.npc ?? ""), name: "§lThe Inn" };
      const run = msg.key === "bed" ? bedMenu(player, String(msg.npc ?? npc.npc), npc.name) : msg.key === "news" ? newsMenu(player, npc.name) : undefined;
      run?.catch((e) => console.warn(`[waystone] ${e}`));
    } catch (e) {
      console.warn(`[waystone] ${id}: ${e}`);
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
      name: "realm:waystones",
      description: "Waystones: the waystones you've discovered (travel from one by tapping it)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => listMenu(player).catch((e) => console.warn(`[waystone] ${e}`)));
      return { status: CustomCommandStatus.Success };
    },
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:waystones_remove",
      description: "Waystones: remove the waystone you're looking at (operators)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => {
        try {
          const hit = player.getBlockFromViewDirection({ maxDistance: 8 });
          const b = hit?.block;
          if (!b) {
            player.sendMessage("§cLook at a waystone's lodestone or sign (within 8 blocks).");
            return;
          }
          const p = b.location;
          const dim = b.dimension.id;
          // The lodestone itself, or the waystone next to the sign you're looking at.
          const w = waystoneAt(dim, p) ?? waystones().find((x) => x.d === dim && Math.abs(x.x - p.x) <= 1 && Math.abs(x.y - p.y) <= 1 && Math.abs(x.z - p.z) <= 1);
          if (!w) {
            player.sendMessage("§cThat isn't a waystone.");
            return;
          }
          removeWaystone(w, `removed by ${player.name}`);
          player.sendMessage(`§7Removed the waystone ${w.n}. The lodestone and sign stay: break them if you want them gone.`);
        } catch (e) {
          console.warn(`[waystone] ${e}`);
        }
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "waystone_bp");
  },
  { namespaces: ["realm"] },
);
