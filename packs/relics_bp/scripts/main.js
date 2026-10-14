import {
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  EntityDamageCause,
  EquipmentSlot,
  ItemStack,
  Player,
  WeatherType,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, getFor } from "./settings.js";

// A relic is a vanilla item that doesn't stack, with a name, lore and the item dynamic property
// `relic:id` (plus `relic:serial`, a number unique on this realm). An anvil can rename any item, but
// can't add the property, so only this pack makes relics.
const ITEM_ID = "relic:id";
const ITEM_SERIAL = "relic:serial";
const PROP_FOUND = "relics:found"; // player: JSON array of the relic ids this player has had
const PROP_SERIAL = "relics:serial"; // world: the last serial number handed out
const PROP_PENDING = "relics:pending"; // world: JSON { playerId: { r: relic ids, s: shards } } for players who were offline
const PROP_WEATHER = "relics:weather"; // world: overworld weather from the last change; scripts can't read the current weather

const SHARD_ITEM = "minecraft:amethyst_shard"; // the shared Relic Shard item (see the spec's contracts)
const SHARD_NAME = "§r§dRelic Shard";
const SHARD_LORE = "§7Bring 8 to a relicsmith";
const FALLBACK_ITEM = "minecraft:brush"; // used if a relic's configured item stacks (and so can't carry data)
const OVERWORLD = "minecraft:overworld";
const DRY_GROUND = /sand|terracotta|snow|ice/; // deserts and badlands get no rain; snowy places get snow
const LORE_WIDTH = 40; // lore lines are kept short: the game limits their length
const PENDING_PLAYERS = 100;
const STORM_FRESH_TICKS = 100; // a storm cell report older than this (storm_bp sends one every 2 s) is gone
const STORM_CELL_REACH = 160; // the Storm Staff also answers this close to a storm cell (Storm Chasing)
const BOLT_EVIDENCE_TICKS = 1200; // a lightning bolt not made by this pack means a thunderstorm for the next minute
const SMITH_WAIT_TICKS = 20; // how long Place a relicsmith here waits for the Townsfolk pack's answer
const ATTACK_MEMORY_MS = 10000; // the Choir Mask and Fen Charm stop protecting you from a kind you hit this recently
const PROP_DEATH = "relics:death"; // player: JSON { dim, x, y, z } where the player last died (Hal's Compass)
const NIGHT = { from: 13000, to: 23000 }; // time of day
const HOSTILE_FAMILY = "monster"; // what the Singing Blade and Keeper's Lamp slow

// Relic Ascension (docs/RPG_DESIGN.md section 5): the stage lives on the item, `relic:asc` 1-3 (missing = 0).
const ITEM_ASC = "relic:asc";
const ESSENCE_ITEM = "minecraft:echo_shard";
const ESSENCE_NAME = "§r§bRelic Essence";
const ESSENCE_LORE = "§7From a broken relic: ascends relics";
const GLASS_ITEM = "minecraft:prismarine_crystals"; // Storm Glass, the shared item (Storm Chasing makes it)
const GLASS_LORE = "§7Charged by a lightning strike";
const STAGES = ["", "Awakened", "Ascended", "Starlit"];
const CD_MULT = [1, 0.8, 0.65, 0.5]; // cooldown relics: -20 / -35 / -50%
const BOOST = [1, 1.25, 1.5, 1.75]; // range and duration relics: +25 / +50 / +75%
const LINGER = [0, 10, 20, 30]; // passive relics: seconds they keep working after their condition ends
/**
 * What ascension does for each relic: `cd` shortens its cooldown, `boost` stretches a range, a duration or a
 * protection (`what`), `linger` keeps a passive working a while after its condition ends. `flavor` is the +2 lore
 * line, `star` the +3 (Starlit) bonus.
 * @type {Record<string, { kind: "cd" | "boost" | "linger", what?: string, flavor: string, star: string }>}
 */
const ASC = {
  storm_staff: { kind: "cd", flavor: "The shaft hums before every storm.", star: "Answers in any rain, not only in thunder" },
  rain_charm: { kind: "linger", flavor: "It smells of wet stone, always.", star: "Also works while you swim" },
  tide_boots: { kind: "linger", flavor: "Salt never dries out of the seams.", star: "Water Breathing while you swim" },
  lantern_deep: { kind: "linger", flavor: "The glass is warm in the dark.", star: "Works below y 30, not only y 0" },
  storm_meter: { kind: "linger", flavor: "The lens fogs when lightning is near.", star: "Says if the cell is closing in or moving away" },
  compass_echoes: { kind: "cd", flavor: "It hums the name of what it finds.", star: "Also tells the champion's health" },
  frost_band: { kind: "boost", what: "slow duration", flavor: "Frost forms on it in summer.", star: "Slowness II instead of I" },
  sun_pendant: { kind: "cd", flavor: "It is never cold to the touch.", star: "Also Regeneration I while the fire burns out" },
  miners_lamp: { kind: "linger", flavor: "Dunmore's mark is scratched inside.", star: "Haste II below y 0" },
  wayfarer_boots: { kind: "linger", flavor: "The soles never wear through.", star: "Works under cover too, not only outdoors" },
  lantern_shard: { kind: "linger", flavor: "A little starlight is caught inside.", star: "Night Vision anywhere, dark or not" },
  choir_mask: { kind: "boost", what: "protection", flavor: "It no longer hums. Mostly.", star: "Choir enemies can't hurt you while you sneak" },
  hal_compass: { kind: "cd", flavor: "The needle shivers toward the sea.", star: "Each use also gives Speed I for 15s" },
  vesna_charm: { kind: "boost", what: "protection after a fight", flavor: "Fen water still beads on it.", star: "Wither can't take hold either" },
  singing_blade: { kind: "cd", flavor: "It sings a little when drawn.", star: "The note also gives Weakness I" },
  hollow_crown: { kind: "linger", flavor: "The hollow inside is darker now.", star: "Works from dusk to dawn" },
  keeper_lamp: { kind: "boost", what: "ring range", flavor: "Its flame leans toward the lost.", star: "Monsters in the ring get Weakness I too" },
};
/** Relic sets: all three in the hotbar, off hand or worn. */
const SETS = [
  { id: "storm", name: "Storm", relics: ["storm_staff", "storm_meter", "rain_charm"], text: "Lightning can't hurt you, and charged lightning rods give 1 more Storm Glass (Storm Chasing)" },
  { id: "tide", name: "Tide", relics: ["tide_boots", "hal_compass", "compass_echoes"], text: "Conduit Power in water" },
  { id: "deep", name: "Deep", relics: ["miners_lamp", "lantern_deep", "lantern_shard"], text: "Night Vision below y 0, and no Darkness there" },
  { id: "sun", name: "Sun", relics: ["sun_pendant", "frost_band", "wayfarer_boots"], text: "Fire Resistance at dawn and dusk, and freezing can't hurt you then" },
];

/** @typedef {typeof CONFIG.relics[number]} Relic */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("@minecraft/server").Container} Container */

const RARITY = {
  common: { label: "Common", color: "§a" },
  rare: { label: "Rare", color: "§9" },
  epic: { label: "Epic", color: "§5" },
  legendary: { label: "Legendary", color: "§6" },
};
const WHERE = {
  hand: "Works in your main hand",
  carry: "Works anywhere in your hotbar or off hand",
  head: "Works worn on your head",
  feet: "Works worn on your feet",
};

/** Leather relics' colors. @type {Record<string, { red: number, green: number, blue: number }>} */
const DYES = {
  tide_boots: { red: 0.15, green: 0.45, blue: 0.8 },
  choir_mask: { red: 0.62, green: 0.62, blue: 0.66 },
};

/** @type {Map<string, Relic>} */
const relics = new Map(CONFIG.relics.map((r) => [r.id, r]));
/** Relics the forge (and "still to find") count: not the story rewards. */
const forgeable = CONFIG.relics.filter((r) => !r.story);
const storyRelics = CONFIG.relics.filter((r) => r.story);
/** Item types a relic can be: only these are checked for the property. */
const relicItems = new Set([...CONFIG.relics.map((r) => r.item), FALLBACK_ITEM]);

/** "storm_staff" -> the relic, from an item stack's property. @param {ItemStack | undefined} stack @returns {Relic | undefined} */
function relicOf(stack) {
  if (!stack || !relicItems.has(stack.typeId)) return undefined;
  try {
    const id = stack.getDynamicProperty(ITEM_ID);
    return typeof id === "string" ? relics.get(id) : undefined;
  } catch {
    return undefined;
  }
}

/** A relic item's ascension stage, 0-3. @param {ItemStack | undefined} stack */
function ascOf(stack) {
  try {
    const n = stack?.getDynamicProperty(ITEM_ASC);
    return typeof n === "number" ? Math.max(0, Math.min(3, Math.floor(n))) : 0;
  } catch {
    return 0;
  }
}

/** A relic's cooldown in seconds at a stage. @param {Relic} def @param {number} asc */
const cooldownAt = (def, asc) => (ASC[def.id]?.kind === "cd" ? Math.round(def.cooldown * CD_MULT[asc] * 10) / 10 : def.cooldown);

/** What a stage does, for lore and menus. @param {Relic} def @param {number} asc */
function stageText(def, asc) {
  const a = ASC[def.id];
  if (!a || asc <= 0) return "";
  if (a.kind === "cd") return `${Math.round((1 - CD_MULT[asc]) * 100)}% shorter cooldown`;
  if (a.kind === "boost") return `+${Math.round((BOOST[asc] - 1) * 100)}% ${a.what ?? "range"}`;
  return `Keeps working ${LINGER[asc]}s after its condition ends`;
}

/** @param {string} id */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);

/** Tick until which another pack's note (or one of ours) holds a player's bar: the steady readouts wait. @type {Map<string, number>} */
const barHeld = new Map();
/**
 * The readouts' rank among steady lines (`steady` in their `realm:actionbar`): a higher one keeps the bar, a lower one
 * waits for them. They show only while the player holds that relic, so they come before the lines that are always there.
 */
const STEADY = 45;

/**
 * Shows a line above the hotbar, asking the Coordinates HUD to step aside first. A `steady` line (the Storm Meter and
 * Lantern Shard readouts, redrawn every second) waits while another pack's note, one of ours or a higher steady line shows.
 * @param {Player} player @param {string} text @param {number} [ticks] @param {boolean} [steady]
 */
function actionbar(player, text, ticks = 40, steady = false) {
  if (steady && (barHeld.get(player.id) ?? 0) > system.currentTick) return;
  if (!steady) barHeld.set(player.id, system.currentTick + ticks);
  system.sendScriptEvent("realm:actionbar", JSON.stringify(steady ? { player: player.id, ticks, from: "relics_bp", steady: STEADY } : { player: player.id, ticks, from: "relics_bp" }));
  player.onScreenDisplay.setActionBar(text);
}

/** 8-way compass direction from one spot to another (north is -z). @param {number} dx @param {number} dz */
function direction(dx, dz) {
  const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
}

/** Splits a sentence into lines of at most LORE_WIDTH characters. @param {string} text */
function wrap(text) {
  /** @type {string[]} */
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + 1 + word.length > LORE_WIDTH) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

// ---------------------------------------------------------------------------
// Weather (tracked like Rain Extras: the stable API can't read it)
// ---------------------------------------------------------------------------

/** @type {WeatherType} */
let weather = WeatherType.Clear;
let weatherSeen = false; // a weatherChange arrived since the scripts started: newer than the saved value
/** Tick of the last lightning bolt in the Overworld that this pack didn't make (natural storms, Storm Chasing). */
let lastBolt = -Infinity;
/** Where and when the Storm Staff struck lately, so its own bolts aren't taken for a storm. @type {{ x: number, z: number, tick: number }[]} */
let ownStrikes = [];

/** The event's dimension may come with or without the namespace. @param {string} id */
const isOverworld = (id) => id === OVERWORLD || id === "overworld";

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather }) => {
  if (!isOverworld(dimension)) return;
  weather = newWeather;
  weatherSeen = true;
  try {
    world.setDynamicProperty(PROP_WEATHER, newWeather);
  } catch (e) {
    console.warn(`[relics] ${e}`);
  }
});

world.afterEvents.worldLoad.subscribe(() => {
  // The saved weather, unless a weatherChange already came in (it's newer).
  if (!weatherSeen) {
    try {
      const saved = world.getDynamicProperty(PROP_WEATHER);
      if (saved === WeatherType.Rain || saved === WeatherType.Thunder || saved === WeatherType.Clear) weather = saved;
    } catch (e) {
      console.warn(`[relics] ${e}`);
    }
  }
  system.runTimeout(() => system.sendScriptEvent("realm:seals_ping", "{}"), 100);
  system.runTimeout(() => system.sendScriptEvent("realm:npc_flags_ping", "{}"), 110); // story flags for the story relic gates
});

// The weather may have changed while the pack wasn't running (installed mid-storm, say), and scripts can't read
// it. Lightning that isn't ours shows a storm anyway: only thunderstorms (and Storm Chasing's cells) make it.
world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  try {
    if (entity.typeId !== "minecraft:lightning_bolt" || !entity.isValid || entity.dimension.id !== OVERWORLD) return;
    const now = system.currentTick;
    ownStrikes = ownStrikes.filter((s) => now - s.tick <= 10);
    const l = entity.location;
    if (ownStrikes.some((s) => Math.abs(s.x - l.x) < 2 && Math.abs(s.z - l.z) < 2)) return;
    lastBolt = now;
  } catch {
    // gone already
  }
});

/** Is there a thunderstorm where the player is, as far as the pack can tell? @param {Player} player */
function stormy(player) {
  if (player.dimension.id !== OVERWORLD) return false;
  if (weather === WeatherType.Thunder || system.currentTick - lastBolt < BOLT_EVIDENCE_TICKS) return true;
  const c = cell;
  return !!c && system.currentTick - c.tick <= STORM_FRESH_TICKS && c.dim === OVERWORLD && Math.hypot(c.x - player.location.x, c.z - player.location.z) <= STORM_CELL_REACH;
}

/** @param {Player} player */
function isNight(player) {
  if (player.dimension.id !== OVERWORLD) return false;
  const t = world.getTimeOfDay();
  return t >= NIGHT.from && t < NIGHT.to;
}

// ---------------------------------------------------------------------------
// Making and giving relics
// ---------------------------------------------------------------------------

function nextSerial() {
  const last = world.getDynamicProperty(PROP_SERIAL);
  const n = (typeof last === "number" ? last : 0) + 1;
  world.setDynamicProperty(PROP_SERIAL, n);
  return n;
}

/** A relic's lore lines: rarity and stage, ability, cooldown, then what its stage adds. @param {Relic} def @param {number} [asc] */
function loreFor(def, asc = 0) {
  const rarity = RARITY[def.rarity] ?? RARITY.common;
  const lore = [`${rarity.color}${rarity.label} relic${asc ? ` +${asc} ${STAGES[asc]}` : ""}`, ...wrap(def.ability).map((l) => `§7${l}`)];
  if (def.cooldown > 0) lore.push(`§8Cooldown: ${cooldownAt(def, asc)}s`);
  if (asc >= 1) lore.push(...wrap(stageText(def, asc)).map((l) => `§b${l}`));
  if (asc >= 2) lore.push(...wrap(ASC[def.id]?.flavor ?? "").map((l) => `§3${l}`));
  if (asc >= 3) lore.push(...wrap(`Starlit: ${ASC[def.id]?.star ?? ""}`).map((l) => `§6${l}`));
  return lore;
}

/** A relic's name: its rarity color, then gold once Starlit. @param {Relic} def @param {number} asc */
function nameFor(def, asc) {
  const rarity = RARITY[def.rarity] ?? RARITY.common;
  return `§r${asc >= 3 ? "§6" : rarity.color}${def.name}${asc ? ` +${asc}` : ""}`;
}

/** Brings a relic's name and lore up to date (its stage, an ability that changed). Returns true if it changed. @param {ItemStack} stack @param {Relic} def */
function freshen(stack, def) {
  try {
    const asc = ascOf(stack);
    const want = loreFor(def, asc);
    const name = nameFor(def, asc);
    // A name from an anvil (no leading reset code) is the player's: only the lore follows the stage then.
    const ours = !stack.nameTag || stack.nameTag.startsWith("§r");
    if (stack.getLore().join("\n") === want.join("\n") && (!ours || stack.nameTag === name)) return false;
    stack.setLore(want);
    if (ours) stack.nameTag = name;
    return true;
  } catch {
    return false;
  }
}

/** A new relic item. @param {Relic} def */
function makeRelic(def) {
  /** @type {ItemStack} */
  let stack;
  try {
    stack = new ItemStack(def.item, 1);
    if (stack.maxAmount !== 1) {
      console.warn(`[relics] ${def.item} stacks, so it can't be a relic; using ${FALLBACK_ITEM} for ${def.id}`);
      stack = new ItemStack(FALLBACK_ITEM, 1);
    }
  } catch {
    console.warn(`[relics] ${def.item} isn't an item; using ${FALLBACK_ITEM} for ${def.id}`);
    stack = new ItemStack(FALLBACK_ITEM, 1);
  }
  stack.nameTag = nameFor(def, 0);
  stack.setLore(loreFor(def));
  stack.setDynamicProperty(ITEM_ID, def.id);
  stack.setDynamicProperty(ITEM_SERIAL, nextSerial());
  stack.keepOnDeath = CONFIG.keepOnDeath;
  const color = DYES[def.id];
  if (color) {
    try {
      const dye = stack.getComponent("minecraft:dyeable");
      if (dye) dye.color = color;
    } catch {
      // undyed leather works the same
    }
  }
  return stack;
}

/** A stack of Relic Shards (the shared item). @param {number} amount */
function makeShards(amount) {
  const stack = new ItemStack(SHARD_ITEM, amount);
  stack.nameTag = SHARD_NAME;
  stack.setLore([SHARD_LORE]);
  return stack;
}

/** Into the inventory, or at the player's feet when it's full. Returns true if anything dropped. @param {Player} player @param {ItemStack} stack */
function giveItem(player, stack) {
  const container = player.getComponent("minecraft:inventory")?.container;
  const rest = container ? container.addItem(stack) : stack;
  if (!rest) return false;
  player.dimension.spawnItem(rest, player.location);
  return true;
}

/** @type {Map<string, Set<string>>} player id -> relic ids found (cached) */
const foundCache = new Map();

/** @param {Player} player @returns {Set<string>} */
function foundOf(player) {
  let set = foundCache.get(player.id);
  if (set) return set;
  set = new Set();
  try {
    const raw = player.getDynamicProperty(PROP_FOUND);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) for (const id of parsed) if (typeof id === "string" && relics.has(id)) set.add(id);
  } catch {
    // corrupt: start over
  }
  foundCache.set(player.id, set);
  return set;
}

/** Records that the player has had this relic. The first time, tells the Field Journal. @param {Player} player @param {Relic} def */
function markFound(player, def) {
  const set = foundOf(player);
  if (set.has(def.id)) return false;
  set.add(def.id);
  player.setDynamicProperty(PROP_FOUND, JSON.stringify([...set]));
  system.sendScriptEvent("realm:journal", JSON.stringify({ player: player.id, page: "relics", entry: def.id, label: def.name }));
  return true;
}

/** @param {Player} player @param {Relic} def @param {string} how e.g. "You received" */
function giveRelic(player, def, how) {
  const dropped = giveItem(player, makeRelic(def));
  markFound(player, def);
  const rarity = RARITY[def.rarity] ?? RARITY.common;
  player.sendMessage(`§d${how} a relic: ${rarity.color}${def.name} §7(${rarity.label}). ${def.ability}.${dropped ? " It dropped at your feet: your inventory is full." : ""} §7See /realm:relics`);
  player.playSound("random.levelup", { pitch: 1.4, volume: 0.8 });
}

/** @param {Player} player @param {number} amount */
function giveShards(player, amount) {
  let left = amount;
  let dropped = false;
  while (left > 0) {
    const n = Math.min(64, left);
    left -= n;
    if (giveItem(player, makeShards(n))) dropped = true;
  }
  player.sendMessage(`§d+${amount} Relic Shard${amount === 1 ? "" : "s"}${dropped ? " §7(some dropped at your feet: your inventory is full)" : ""}`);
}

// Gifts for players who weren't online, handed over when they next join.

/** @returns {Record<string, { r: string[], s: number }>} */
function pending() {
  try {
    const raw = world.getDynamicProperty(PROP_PENDING);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** @param {Record<string, { r: string[], s: number }>} all */
function savePending(all) {
  world.setDynamicProperty(PROP_PENDING, Object.keys(all).length ? JSON.stringify(all) : undefined);
}

/** @param {string} playerId @param {string | undefined} relic @param {number} shards */
function queue(playerId, relic, shards) {
  const all = pending();
  const entry = all[playerId] ?? { r: [], s: 0 };
  if (!all[playerId] && Object.keys(all).length >= PENDING_PLAYERS) {
    console.warn(`[relics] too many gifts waiting; dropped one for ${playerId}`);
    return;
  }
  if (relic && entry.r.length < 20) entry.r.push(relic);
  entry.s = Math.min(6400, entry.s + shards);
  all[playerId] = entry;
  savePending(all);
}

/** @param {Player} player */
function deliver(player) {
  const all = pending();
  const entry = all[player.id];
  if (!entry || !player.isValid) return;
  delete all[player.id];
  savePending(all);
  for (const id of entry.r ?? []) {
    const def = relics.get(id);
    if (def) giveRelic(player, def, "You received");
  }
  if (entry.s > 0) giveShards(player, entry.s);
}

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  system.runTimeout(() => {
    try {
      deliver(player);
    } catch (e) {
      console.warn(`[relics] ${e}`);
    }
  }, 100);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  foundCache.delete(playerId);
  carried.delete(playerId);
  kept.delete(playerId);
  passiveNote.delete(playerId);
  lastUse.delete(playerId);
  setsSent.delete(playerId);
  struckAt.delete(playerId);
  meterLast.delete(playerId);
  affinity.delete(playerId);
  idaOff.delete(playerId);
  storyFlags.delete(playerId);
  smithWaits.delete(playerId);
  barHeld.delete(playerId);
  for (const map of [cooldowns, lastAttack, lastOn]) for (const key of [...map.keys()]) if (key.startsWith(`${playerId}:`)) map.delete(key);
});

// ---------------------------------------------------------------------------
// Cooldowns
// ---------------------------------------------------------------------------

/** "playerId:relicId" -> Date.now() when it's ready again. Kept in memory: a restart resets them. @type {Map<string, number>} */
const cooldowns = new Map();

/** Seconds until the relic can be used again (0 = ready). @param {Player} player @param {Relic} def */
function waitFor(player, def) {
  const at = cooldowns.get(`${player.id}:${def.id}`) ?? 0;
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

/** @param {Player} player @param {Relic} def @param {number} [asc] the relic's stage: cooldown relics wait less */
function startCooldown(player, def, asc = 0) {
  const s = cooldownAt(def, asc);
  if (s > 0) cooldowns.set(`${player.id}:${def.id}`, Date.now() + s * 1000);
}

/** True if ready; otherwise says how long to wait. @param {Player} player @param {Relic} def */
function ready(player, def) {
  const s = waitFor(player, def);
  if (s <= 0) return true;
  actionbar(player, `§7${def.name}: ready in ${s}s`);
  return false;
}

// ---------------------------------------------------------------------------
// Passive abilities: checked once a second
// ---------------------------------------------------------------------------

// Effects last a little longer than a check, are topped up when they run low, and are removed when
// their condition stops. A stronger or longer effect (a potion, a beacon) is never shortened.
const EFFECT = { duration: 210, refreshBelow: 30 }; // 210/30: Regeneration still heals at its usual pace
const NIGHT_VISION = { duration: 400, refreshBelow: 240 }; // night vision flickers in its last 10 s

/**
 * What each player carries: relic ids in their hand, anywhere in the hotbar or off hand, and worn, with stages (`asc`:
 * the highest of each id in the hotbar or off hand; `handAsc`, `headAsc`, `feetAsc` for those slots).
 * @typedef {{ hand?: string, handAsc: number, carry: Set<string>, asc: Map<string, number>, head?: string, headAsc: number, feet?: string, feetAsc: number }} Carried
 */
/** @type {Map<string, Carried>} */
const carried = new Map();
/** Tick each passive relic's condition last held, "playerId:relicId" (for lingering). @type {Map<string, number>} */
const lastOn = new Map();
/** The sets each player has together, last sent (realm:relic_sets). @type {Map<string, string>} */
const setsSent = new Map();
/** Tick a player was last struck by lightning (the Storm set also puts out the fire it starts). @type {Map<string, number>} */
const struckAt = new Map();
/** Storm Meter: the cell distance last read per player, for the Starlit trend. @type {Map<string, number>} */
const meterLast = new Map();

/** A relic's stage where it works for this player. @param {Carried | undefined} c @param {string} id */
function ascFor(c, id) {
  if (!c) return 0;
  const where = relics.get(id)?.where;
  if (where === "hand") return c.hand === id ? c.handAsc : c.asc.get(id) ?? 0;
  if (where === "head") return c.head === id ? c.headAsc : c.asc.get(id) ?? 0;
  if (where === "feet") return c.feet === id ? c.feetAsc : c.asc.get(id) ?? 0;
  return c.asc.get(id) ?? 0;
}

/** Is the relic anywhere it's read (hotbar, off hand, head, feet)? For sets and lingering. @param {Carried} c @param {string} id */
const anywhere = (c, id) => c.carry.has(id) || c.head === id || c.feet === id;
/** Effects this pack is keeping on each player: type -> amplifier. @type {Map<string, Map<string, number>>} */
const kept = new Map();
/** Tick of the last "not ready" note per player for passive relics, so it isn't shown every second. @type {Map<string, number>} */
const passiveNote = new Map();

/** @param {string} type */
function effectTiming(type) {
  return type === "night_vision" ? NIGHT_VISION : EFFECT;
}

/** @param {Player} player @param {string} type @param {number} [amp] */
function keep(player, type, amp = 0) {
  const t = effectTiming(type);
  const e = player.getEffect(type);
  if (!e || e.amplifier < amp || (e.amplifier === amp && e.duration < t.refreshBelow)) player.addEffect(type, t.duration, { amplifier: amp, showParticles: false });
  let map = kept.get(player.id);
  if (!map) kept.set(player.id, (map = new Map()));
  map.set(type, amp);
}

/** Removes the effects this pack kept on the player that aren't wanted now. @param {Player} player @param {Map<string, number>} wanted */
function release(player, wanted) {
  const map = kept.get(player.id);
  if (!map) return;
  for (const [type, amp] of [...map]) {
    if (wanted.has(type) && (wanted.get(type) ?? 0) >= amp) continue;
    map.delete(type);
    if (wanted.has(type)) continue; // a lower level is still wanted: keep() tops it up when this one runs out
    const e = player.getEffect(type);
    // Only ours: the level we gave and no longer than we give. A potion's longer or stronger effect stays.
    if (e && e.amplifier === amp && e.duration <= effectTiming(type).duration) player.removeEffect(type);
  }
}

/** Highest block over the player: open sky (nothing 2+ blocks overhead) and dry ground. @param {Player} player */
function sky(player) {
  try {
    const feet = player.location;
    const top = player.dimension.getTopmostBlock({ x: Math.floor(feet.x), z: Math.floor(feet.z) });
    if (!top) return undefined;
    // getTopmostBlock skips water: a sandy lake or sea bed under the player is no desert (rain falls on the water).
    const up = top.above();
    const wet = !!up && (up.isLiquid || /water|kelp|seagrass|bubble_column/.test(up.typeId));
    return { open: top.location.y - Math.floor(feet.y) < 2, dry: !wet && DRY_GROUND.test(top.typeId) };
  } catch {
    return undefined; // unloaded
  }
}

/** Restores a relic's durability. Returns true if it changed. @param {ItemStack} stack */
function mend(stack) {
  try {
    const d = stack.getComponent("minecraft:durability");
    if (!d || d.damage === 0) return false;
    d.damage = 0;
    return true;
  } catch {
    return false;
  }
}

/** @param {Player} player */
function scanCarried(player) {
  /** @type {Carried} */
  const c = { carry: new Set(), asc: new Map(), handAsc: 0, headAsc: 0, feetAsc: 0 };
  const repair = get("autoRepair") === true;
  const container = player.getComponent("minecraft:inventory")?.container;
  const equip = player.getComponent("minecraft:equippable");
  /** @param {Relic} def @param {ItemStack} stack */
  const noteAsc = (def, stack) => c.asc.set(def.id, Math.max(c.asc.get(def.id) ?? 0, ascOf(stack)));
  if (container) {
    const selected = player.selectedSlotIndex;
    for (let slot = 0; slot < 9; slot++) {
      const stack = container.getItem(slot);
      const def = relicOf(stack);
      if (!def || !stack) continue;
      markFound(player, def);
      c.carry.add(def.id);
      noteAsc(def, stack);
      let changed = freshen(stack, def);
      if (slot === selected) {
        c.hand = def.id;
        c.handAsc = ascOf(stack);
        if (repair && mend(stack)) changed = true;
      }
      if (changed) container.setItem(slot, stack);
    }
  }
  if (equip) {
    for (const [slot, key] of /** @type {const} */ ([[EquipmentSlot.Offhand, "offhand"], [EquipmentSlot.Head, "head"], [EquipmentSlot.Feet, "feet"]])) {
      const stack = equip.getEquipment(slot);
      const def = relicOf(stack);
      if (!def || !stack) continue;
      markFound(player, def);
      if (key === "offhand") {
        c.carry.add(def.id);
        noteAsc(def, stack);
      } else if (key === "head") {
        c.head = def.id;
        c.headAsc = ascOf(stack);
      } else {
        c.feet = def.id;
        c.feetAsc = ascOf(stack);
      }
      const fresh = freshen(stack, def);
      if ((repair && key !== "offhand" && mend(stack)) || fresh) equip.setEquipment(slot, stack);
    }
  }
  carried.set(player.id, c);
  return c;
}

/** Dawn and dusk (the Sun set), by time of day. */
const dawnOrDusk = () => {
  const t = world.getTimeOfDay();
  return t >= 23000 || t < 1000 || (t >= 11500 && t < 13500);
};

/** The sets a player has all three relics of. @param {Carried} c */
const setsOf = (c) => (get("setsEnabled") === true ? SETS.filter((set) => set.relics.every((id) => anywhere(c, id))).map((set) => set.id) : []);

/** Tells other packs (Storm Chasing) which sets a player has, when that changed. @param {Player} player @param {string[]} sets @param {boolean} [force] */
function sendSets(player, sets, force = false) {
  const json = sets.join(",");
  const before = setsSent.get(player.id);
  if (!force && before === json) return;
  setsSent.set(player.id, json);
  system.sendScriptEvent("realm:relic_sets", JSON.stringify({ player: player.id, sets, from: "relics_bp" }));
  if (before === undefined || force) return;
  const had = new Set(before ? before.split(",") : []);
  const fresh = SETS.find((set) => sets.includes(set.id) && !had.has(set.id));
  if (fresh) actionbar(player, `§d${fresh.name} set: §f${fresh.text}`, 80);
}

/** @param {Player} player */
function passives(player) {
  const c = scanCarried(player);
  /** @type {Map<string, number>} effect -> amplifier */
  const wanted = new Map();
  const want = (/** @type {string} */ type, amp = 0) => wanted.set(type, Math.max(wanted.get(type) ?? 0, amp));
  const sets = setsOf(c);
  if (get("enabled") === true) {
    const y = player.location.y;
    const now = system.currentTick;
    const overworld = player.dimension.id === OVERWORLD;
    const has = (/** @type {string} */ id) => {
      const where = relics.get(id)?.where;
      if (where === "hand") return c.hand === id;
      if (where === "head") return c.head === id;
      if (where === "feet") return c.feet === id;
      return c.carry.has(id);
    };
    /**
     * A passive relic is working: where it works and its condition holds, or (ascended, `linger`) still carried and
     * its condition held in the last few seconds.
     * @param {string} id @param {() => boolean} cond
     */
    const lit = (id, cond) => {
      const key = `${player.id}:${id}`;
      if (has(id) && cond()) {
        lastOn.set(key, now);
        return true;
      }
      const a = ascFor(c, id);
      if (ASC[id]?.kind !== "linger" || a <= 0 || !anywhere(c, id)) return false;
      const at = lastOn.get(key);
      return at !== undefined && now - at <= LINGER[a] * 20;
    };
    const star = (/** @type {string} */ id) => ascFor(c, id) >= 3;
    /** @type {ReturnType<typeof sky> | null} null = not looked up yet */
    let above = null;
    const look = () => (above === null ? (above = sky(player)) : above);
    const raining = overworld && weather !== WeatherType.Clear;
    const inRain = () => {
      const s = raining ? look() : undefined;
      return !!s && s.open && !s.dry;
    };
    if (lit("rain_charm", () => inRain() || (star("rain_charm") && player.isInWater))) want("regeneration");
    if (lit("tide_boots", inRain)) {
      want("jump_boost"); // Bedrock has no Dolphin's Grace effect
      want("speed");
    }
    if (has("tide_boots") && star("tide_boots") && player.isInWater) want("water_breathing");
    if (lit("lantern_deep", () => y < (star("lantern_deep") ? 30 : 0))) want("night_vision");
    if (lit("miners_lamp", () => y < 30)) want("haste", star("miners_lamp") && y < 0 ? 1 : 0);
    if (lit("wayfarer_boots", () => overworld && player.isSprinting && (star("wayfarer_boots") || look()?.open === true))) want("speed");
    // "In the dark": at night in the Overworld, under cover deep down, or anywhere in the Nether or the End.
    // (The stable API can't read light levels.)
    const dark = () => isNight(player) || !overworld || (y < 50 && look()?.open === false);
    if (lit("lantern_shard", () => star("lantern_shard") || dark())) want("night_vision");
    if (lit("hollow_crown", () => isNight(player) || (star("hollow_crown") && overworld && (world.getTimeOfDay() >= 12000 || world.getTimeOfDay() < 1000)))) {
      want("night_vision");
      want("strength");
    }
    // Sets
    if (sets.includes("tide") && player.isInWater) want("conduit_power");
    if (sets.includes("deep") && y < 0) {
      want("night_vision");
      if (player.getEffect("darkness")) player.removeEffect("darkness");
    }
    if (sets.includes("sun") && overworld && dawnOrDusk()) want("fire_resistance");
    for (const [type, amp] of wanted) {
      try {
        keep(player, type, amp);
      } catch (e) {
        console.warn(`[relics] ${type}: ${e}`);
      }
    }
    if (has("sun_pendant") && player.getComponent("minecraft:onfire")) sunPendant(player);
    if (has("vesna_charm") && player.getEffect("poison")) player.removeEffect("poison");
    if (has("vesna_charm") && star("vesna_charm") && player.getEffect("wither")) player.removeEffect("wither");
    if (has("choir_mask") && player.getEffect("darkness")) player.removeEffect("darkness");
    if (lit("keeper_lamp", dark)) keeperLamp(player, ascFor(c, "keeper_lamp"));
    const meter = lit("storm_meter", () => true);
    if (meter && getFor(player, "meterReadout") === true) actionbar(player, `§bStorm Meter: ${stormReading(player, star("storm_meter"))}`, 30, true);
    else if (c.hand === "lantern_shard" && system.currentTick % 60 < 20) {
      const pull = sealReading(player);
      if (pull) actionbar(player, `§bLantern Shard: ${pull}`, 50, true);
    }
  }
  release(player, wanted);
  sendSets(player, sets);
}

/** Keeper's Lamp: a ring of light at your feet, and monsters inside it slow down. @param {Player} player @param {number} asc */
function keeperLamp(player, asc) {
  const dim = player.dimension;
  const l = player.location;
  const range = CONFIG.auraRange * BOOST[asc];
  const r = Math.min(4 * BOOST[asc], range);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + (system.currentTick / 20) * 0.3;
    try {
      dim.spawnParticle("minecraft:endrod", { x: l.x + Math.cos(a) * r, y: l.y + 0.3, z: l.z + Math.sin(a) * r });
    } catch {
      // unloaded
    }
  }
  for (const mob of dim.getEntities({ location: l, maxDistance: range, families: [HOSTILE_FAMILY] })) {
    try {
      if (!mob.getEffect("slowness")) mob.addEffect("slowness", 30, { amplifier: 0 });
      if (asc >= 3 && !mob.getEffect("weakness")) mob.addEffect("weakness", 30, { amplifier: 0 });
    } catch {
      // not a mob that takes effects
    }
  }
}

// ---------------------------------------------------------------------------
// Seals (Lantern Shard): the Story Questlines report the seals that are still unlit
// ---------------------------------------------------------------------------

/** @typedef {{ name: string, dim: string, x: number, z: number }} Seal */
/** Seals for everyone (key "") and for single players (their id). @type {Map<string, Seal[]>} */
const seals = new Map();

/** "the Tide Seal pulls 340m NE", or undefined when no seal is known in this dimension. @param {Player} player */
function sealReading(player) {
  const list = seals.get(player.id) ?? seals.get("") ?? [];
  let best;
  let bestD = Infinity;
  for (const s of list) {
    if (s.dim !== player.dimension.id) continue;
    const d = Math.hypot(s.x - player.location.x, s.z - player.location.z);
    if (d < bestD) [best, bestD] = [s, d];
  }
  if (!best) return list.length ? "§7no seal in this dimension" : undefined;
  return `§f${best.name} pulls ${Math.round(bestD)}m ${direction(best.x - player.location.x, best.z - player.location.z)}`;
}

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    try {
      if (player.isValid) passives(player);
    } catch (e) {
      console.warn(`[relics] ${e}`);
    }
  }
}, 20);

// Sun Pendant: as soon as you catch fire (the loop above also checks every second).
/** @param {Player} player */
function sunPendant(player) {
  const def = relics.get("sun_pendant");
  if (!def || player.getEffect("fire_resistance")) return;
  const wait = waitFor(player, def);
  if (wait > 0) {
    // Burning lasts several seconds: say so once every 5 s, not every second.
    if (system.currentTick - (passiveNote.get(player.id) ?? -1000) >= 100) {
      passiveNote.set(player.id, system.currentTick);
      actionbar(player, `§7${def.name}: ready in ${wait}s`);
    }
    return;
  }
  const asc = ascFor(carried.get(player.id), def.id);
  player.addEffect("fire_resistance", 200, { amplifier: 0, showParticles: true });
  if (asc >= 3 && !player.getEffect("regeneration")) player.addEffect("regeneration", 200, { amplifier: 0, showParticles: true });
  startCooldown(player, def, asc);
  actionbar(player, `§6${def.name}: Fire Resistance for 10s`);
  player.playSound("random.fizz", { volume: 0.6 });
}

const FIRE = new Set([EntityDamageCause.fire, EntityDamageCause.fireTick, EntityDamageCause.lava, EntityDamageCause.campfire, EntityDamageCause.soulCampfire, EntityDamageCause.magma]);
const CHOIR_TAG = "saga:choir"; // Story Questlines tags the Choir enemies it spawns with this
const WITCH = "minecraft:witch";

/** "playerId:kind" -> Date.now() of the player's last hit on a Choir enemy ("choir") or a witch ("witch"). @type {Map<string, number>} */
const lastAttack = new Map();
/** @param {Player} player @param {string} kind */
const attackedLately = (player, kind) => Date.now() - (lastAttack.get(`${player.id}:${kind}`) ?? 0) < ATTACK_MEMORY_MS;

/** Gives back `amount` health right after a hit (the stable API can't cancel damage). @param {Player} player @param {number} amount */
function refund(player, amount) {
  const health = player.getComponent("minecraft:health");
  if (!health || health.currentValue <= 0 || amount <= 0) return;
  health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + amount));
}

world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource, damage }) => {
  try {
    if (get("enabled") !== true || !hurtEntity.isValid) return;
    const cause = damageSource.cause;
    const attacker = damageSource.damagingEntity;
    if (hurtEntity instanceof Player) {
      const c = carried.get(hurtEntity.id);
      if (!c) return;
      const sets = setsOf(c);
      // Storm set: lightning can't hurt you, nor the fire it starts on you.
      if (sets.includes("storm") && (cause === EntityDamageCause.lightning || (FIRE.has(cause) && system.currentTick - (struckAt.get(hurtEntity.id) ?? -1000) < 100))) {
        if (cause === EntityDamageCause.lightning) struckAt.set(hurtEntity.id, system.currentTick);
        refund(hurtEntity, damage);
        hurtEntity.extinguishFire(false);
        return;
      }
      // Sun set: freezing can't hurt you at dawn and dusk.
      if (sets.includes("sun") && cause === EntityDamageCause.freezing && dawnOrDusk()) {
        refund(hurtEntity, damage);
        return;
      }
      if (FIRE.has(cause)) {
        if (c.carry.has("sun_pendant")) sunPendant(hurtEntity);
        return;
      }
      if (!attacker?.isValid) return;
      // Gray Choir Mask: Choir enemies only do half damage (more once ascended; none while you sneak, Starlit), unless you've been fighting them.
      if (c.head === "choir_mask" && attacker.hasTag(CHOIR_TAG) && !attackedLately(hurtEntity, "choir")) {
        const a = c.headAsc;
        refund(hurtEntity, a >= 3 && hurtEntity.isSneaking ? damage : Math.min(1, 0.5 * BOOST[a]) * damage);
      }
      // Fen Charm: witches (their potions too) can't hurt you, unless you've been fighting one (then, ascended, still less).
      else if (c.carry.has("vesna_charm") && attacker.typeId === WITCH) refund(hurtEntity, attackedLately(hurtEntity, "witch") ? (BOOST[ascFor(c, "vesna_charm")] - 1) * damage : damage);
      return;
    }
    if (!(attacker instanceof Player)) return;
    if (hurtEntity.hasTag(CHOIR_TAG)) lastAttack.set(`${attacker.id}:choir`, Date.now());
    if (hurtEntity.typeId === WITCH) lastAttack.set(`${attacker.id}:witch`, Date.now());
    if (cause !== EntityDamageCause.entityAttack) return;
    const c = carried.get(attacker.id);
    if (!c) return;
    // Frost Band: melee hits slow what they hit (longer once ascended; Slowness II when Starlit).
    if (c.carry.has("frost_band")) {
      const a = ascFor(c, "frost_band");
      hurtEntity.addEffect("slowness", Math.round(60 * BOOST[a]), { amplifier: a >= 3 ? 1 : 0 });
    }
    if (c.hand === "singing_blade") singingBlade(attacker, hurtEntity, c.handAsc);
  } catch (e) {
    console.warn(`[relics] ${e}`);
  }
});

/** The Singing Blade's note: monsters near what you hit (and it) slow down for 2 s. @param {Player} player @param {import("@minecraft/server").Entity} target @param {number} asc */
function singingBlade(player, target, asc) {
  const def = relics.get("singing_blade");
  if (!def || waitFor(player, def) > 0) return; // a short silent cooldown between notes
  startCooldown(player, def, asc);
  const at = target.location;
  player.dimension.playSound("note.bell", at, { pitch: 0.8 + Math.random() * 0.8, volume: 1 });
  const mobs = player.dimension.getEntities({ location: at, maxDistance: CONFIG.auraRange, families: [HOSTILE_FAMILY] });
  if (!mobs.some((m) => m.id === target.id) && target.matches({ families: [HOSTILE_FAMILY] })) mobs.push(target);
  for (const mob of mobs) {
    try {
      mob.addEffect("slowness", 40, { amplifier: 1 });
      if (asc >= 3) mob.addEffect("weakness", 60, { amplifier: 0 });
    } catch {
      // not a mob that takes effects
    }
  }
  try {
    player.dimension.spawnParticle("minecraft:note_particle", { x: at.x, y: at.y + 2, z: at.z });
  } catch {
    // unloaded
  }
}

// Fen Charm: poison never takes hold.
world.beforeEvents.effectAdd.subscribe((ev) => {
  try {
    const type = ev.effectType.replace(/^minecraft:/, "");
    if (type !== "poison" && type !== "wither") return;
    const c = carried.get(ev.entity.id);
    if (!c?.carry.has("vesna_charm") || get("enabled") !== true) return;
    // Fen Charm: no Poison; Starlit, no Wither either.
    if (type === "poison" || ascFor(c, "vesna_charm") >= 3) ev.cancel = true;
  } catch {
    // not a player we know
  }
});

// Hal's Compass: where each player last died.
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  try {
    if (!(deadEntity instanceof Player)) return;
    const l = deadEntity.location;
    deadEntity.setDynamicProperty(PROP_DEATH, JSON.stringify({ dim: deadEntity.dimension.id, x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) }));
  } catch (e) {
    console.warn(`[relics] ${e}`);
  }
});

// The Hollow Crown: villagers won't deal with you.
world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  try {
    const t = ev.target.typeId;
    if (t !== "minecraft:villager_v2" && t !== "minecraft:villager" && t !== "minecraft:wandering_trader") return;
    if (ev.target.hasTag("realm:npc")) return; // a wanderer dressed as a villager talks to you anyway (its pack opens its menu)
    if (carried.get(ev.player.id)?.head !== "hollow_crown" || get("enabled") !== true) return;
    ev.cancel = true;
    const player = ev.player;
    system.run(() => player.isValid && actionbar(player, "§8The villager shrinks away from the Hollow Crown"));
  } catch {
    // not ours
  }
});

// ---------------------------------------------------------------------------
// Storm Meter: storm_bp reports the storm cell every 2 s
// ---------------------------------------------------------------------------

/** @type {{ dim: string, x: number, z: number, strength: number, tick: number } | undefined} */
let cell;

/** "Cell: 340m NE, strength 7/10" (Starlit: ", closing in"), or "No storm cell". @param {Player} player @param {boolean} [trend] */
function stormReading(player, trend = false) {
  if (!cell || system.currentTick - cell.tick > STORM_FRESH_TICKS || cell.dim !== player.dimension.id) {
    meterLast.delete(player.id);
    return "§7No storm cell";
  }
  const dx = cell.x - player.location.x;
  const dz = cell.z - player.location.z;
  const dist = Math.round(Math.hypot(dx, dz));
  let way = "";
  if (trend) {
    const before = meterLast.get(player.id);
    meterLast.set(player.id, dist);
    if (before !== undefined && Math.abs(before - dist) >= 1) way = before > dist ? ", §aclosing in" : ", §7moving away";
  }
  return `§fCell: ${dist}m ${direction(dx, dz)}, strength ${cell.strength}/10${way}`;
}

// ---------------------------------------------------------------------------
// Used abilities: Storm Staff, Compass of Echoes, Hal's Compass
// ---------------------------------------------------------------------------

const NOT_TARGETS = ["minecraft:item", "minecraft:xp_orb", "minecraft:arrow", "minecraft:thrown_trident", "minecraft:fishing_hook", "minecraft:lightning_bolt"];
const STRIKE_CLEAR = 5; // blocks around a strike that must be free of players, villagers, pets and townsfolk
const PROTECTED_TYPES = new Set(["minecraft:villager", "minecraft:villager_v2", "minecraft:wandering_trader", "minecraft:npc", "minecraft:armor_stand", "minecraft:item_frame", "minecraft:glow_item_frame", "minecraft:painting"]);
const FIRE_CHECKS = [1, 5, 15, 40, 80]; // ticks after a strike when its fire is put out
const USE_DEBOUNCE = 4; // ticks: one tap can arrive as several events (use, interact with a block, start using)

/** Tick of each player's last relic use, so one tap does one thing. @type {Map<string, number>} */
const lastUse = new Map();

/** Where the Storm Staff would strike, or why it can't. @param {Player} player @returns {{ at: Vector3 } | { why: string }} */
function staffTarget(player) {
  const range = CONFIG.staffRange;
  const hitsPlayers = get("staffHitsPlayers") === true;
  const excludeTypes = hitsPlayers ? NOT_TARGETS : [...NOT_TARGETS, "minecraft:player"];
  const hit = player
    .getEntitiesFromViewDirection({ maxDistance: range, excludeTypes, excludeTags: ["realm:npc"] })
    .find((h) => h.entity.isValid && h.entity.id !== player.id);
  /** @type {Vector3 | undefined} */
  let at = hit?.entity.location;
  if (!at) {
    const block = player.getBlockFromViewDirection({ maxDistance: range, includeLiquidBlocks: true })?.block;
    if (block) at = { x: block.location.x + 0.5, y: block.location.y + 1, z: block.location.z + 0.5 };
  }
  if (!at) return { why: `nothing to strike within ${range} blocks` };
  const spawn = world.getDefaultSpawnLocation();
  const avoid = get("avoidSpawn");
  if (avoid > 0 && Math.hypot(at.x - spawn.x, at.z - spawn.z) < avoid) return { why: `the sky won't strike within ${avoid} blocks of spawn` };
  // Lightning turns villagers into witches, hurts pets and anyone standing near: never there.
  const bystander = player.dimension.getEntities({ location: at, maxDistance: STRIKE_CLEAR }).find((e) => protectedFromStaff(e, player));
  if (bystander) return { why: `too close to ${bystander instanceof Player ? (bystander.id === player.id ? "you" : bystander.name) : "someone who'd get hurt"}` };
  return { at };
}

/** @param {Player} player @param {Relic} def @param {number} asc */
function stormStaff(player, def, asc) {
  // Starlit: any rain will do.
  if (!stormy(player) && !(asc >= 3 && player.dimension.id === OVERWORLD && weather !== WeatherType.Clear)) {
    actionbar(player, `§7${def.name}: it only answers in a thunderstorm`);
    player.playSound("random.click", { pitch: 0.6, volume: 0.5 });
    return;
  }
  if (!ready(player, def)) return;
  const target = staffTarget(player);
  if ("why" in target) {
    actionbar(player, `§7${def.name}: ${target.why}`);
    return;
  }
  const { at } = target;
  const dimension = player.dimension;
  try {
    ownStrikes.push({ x: at.x, z: at.z, tick: system.currentTick }); // before the spawn: its event may come at once
    dimension.spawnEntity("minecraft:lightning_bolt", at);
  } catch (e) {
    actionbar(player, `§7${def.name}: the bolt couldn't reach there`);
    console.warn(`[relics] storm staff: ${e}`);
    return;
  }
  startCooldown(player, def, asc);
  actionbar(player, `§b${def.name}: lightning! §7Ready again in ${cooldownAt(def, asc)}s`);
  // Lightning sets fire where it lands; put it out so the staff can't burn anyone's build.
  for (const delay of FIRE_CHECKS) system.runTimeout(() => putOutFire(dimension, at), delay);
}

/** Would a strike near this entity hurt something it shouldn't? @param {import("@minecraft/server").Entity} e @param {Player} caster */
function protectedFromStaff(e, caster) {
  try {
    if (e instanceof Player) return e.id === caster.id || get("staffHitsPlayers") !== true;
    if (PROTECTED_TYPES.has(e.typeId) || e.hasTag("realm:npc")) return true;
    return !!e.getComponent("minecraft:is_tamed");
  } catch {
    return false;
  }
}

/** Removes fire in a small box around a strike (only fire: nothing else is touched). @param {import("@minecraft/server").Dimension} dimension @param {Vector3} at */
function putOutFire(dimension, at) {
  const cx = Math.floor(at.x);
  const cy = Math.floor(at.y);
  const cz = Math.floor(at.z);
  for (let x = cx - 3; x <= cx + 3; x++) {
    for (let y = cy - 3; y <= cy + 3; y++) {
      for (let z = cz - 3; z <= cz + 3; z++) {
        try {
          const b = dimension.getBlock({ x, y, z });
          if (b?.typeId === "minecraft:fire") b.setType("minecraft:air");
        } catch {
          // unloaded
        }
      }
    }
  }
}

/** @param {Player} player @param {Relic} def @param {number} asc */
function compass(player, def, asc) {
  if (!ready(player, def)) return;
  startCooldown(player, def, asc);
  const [champion] = player.dimension.getEntities({ tags: ["realm:champion"], location: player.location, maxDistance: CONFIG.compassRange, closest: 1 });
  if (!champion) {
    player.sendMessage(`§7${def.name}: no champion within ${CONFIG.compassRange} blocks.`);
    return;
  }
  const dx = champion.location.x - player.location.x;
  const dz = champion.location.z - player.location.z;
  const name = champion.nameTag || champion.typeId.replace(/^minecraft:/, "").replace(/_/g, " ");
  let health = "";
  if (asc >= 3) {
    const h = champion.getComponent("minecraft:health");
    if (h) health = ` It has ${Math.ceil(h.currentValue)} of ${Math.ceil(h.effectiveMax)} health.`;
  }
  player.sendMessage(`§d${def.name}: §fa champion (${name}§f) is ${Math.round(Math.hypot(dx, dz))}m ${direction(dx, dz)}.${health}`);
  player.playSound("block.bell.hit", { pitch: 1.6, volume: 0.6 });
}

const DIM_NAMES = /** @type {Record<string, string>} */ ({ "minecraft:overworld": "the Overworld", "minecraft:nether": "the Nether", "minecraft:the_end": "the End" });

/** "340m NE (y 12)" from the player to a spot, or the dimension it's in. @param {Player} player @param {{ dim: string, x: number, y: number, z: number }} spot */
function way(player, spot) {
  if (spot.dim !== player.dimension.id) return `in ${DIM_NAMES[spot.dim] ?? spot.dim}`;
  const dx = spot.x + 0.5 - player.location.x;
  const dz = spot.z + 0.5 - player.location.z;
  const d = Math.round(Math.hypot(dx, dz));
  return d < 4 ? `right here (y ${spot.y})` : `${d}m ${direction(dx, dz)} (y ${spot.y})`;
}

/** Hal's Compass: the way to your last death point and your home (bed or respawn point, else world spawn). @param {Player} player @param {Relic} def @param {number} asc */
function halCompass(player, def, asc) {
  if (!ready(player, def)) return;
  startCooldown(player, def, asc);
  if (asc >= 3) {
    const e = player.getEffect("speed");
    if (!e || (e.amplifier === 0 && e.duration < 300)) player.addEffect("speed", 300, { amplifier: 0, showParticles: false });
  }
  /** @type {{ dim: string, x: number, y: number, z: number } | undefined} */
  let death;
  try {
    const raw = player.getDynamicProperty(PROP_DEATH);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : undefined;
    if (parsed && typeof parsed.dim === "string" && [parsed.x, parsed.y, parsed.z].every(Number.isFinite)) death = parsed;
  } catch {
    // corrupt: as if none
  }
  const bed = player.getSpawnPoint();
  const s = world.getDefaultSpawnLocation();
  const home = bed ? { dim: bed.dimension.id, x: Math.floor(bed.x), y: Math.floor(bed.y), z: Math.floor(bed.z) } : { dim: OVERWORLD, x: s.x, y: s.y > 320 ? 64 : s.y, z: s.z };
  player.sendMessage(
    `§d${def.name}: §fYour last death: ${death ? way(player, death) : "§7none yet§f"}. ${bed ? "Home" : "World spawn"}: ${way(player, home)}.`,
  );
  player.playSound("block.bell.hit", { pitch: 1.2, volume: 0.5 });
}

/** Runs a used relic's power once per tap. @param {Player} player @param {Relic} def @param {number} asc the used item's stage */
function useRelic(player, def, asc) {
  const now = system.currentTick;
  if (now - (lastUse.get(player.id) ?? -100) < USE_DEBOUNCE) return;
  lastUse.set(player.id, now);
  markFound(player, def);
  if (get("enabled") !== true) return;
  if (def.id === "storm_staff") stormStaff(player, def, asc);
  else if (def.id === "compass_echoes") compass(player, def, asc);
  else if (def.id === "hal_compass") halCompass(player, def, asc);
}

/** Relics whose use is their power. */
const USED = new Set(["storm_staff", "compass_echoes", "hal_compass"]);

// The Storm Staff is a trident: using it would charge and throw it (and it could be lost in lava or the void).
// Its use is the staff's power instead, so the use is canceled before the trident starts charging. A canceled
// use has no afterEvents.itemUse, so every used relic runs from here.
world.beforeEvents.itemUse.subscribe((ev) => {
  try {
    const def = relicOf(ev.itemStack);
    if (!def || !USED.has(def.id)) return;
    if (def.id === "storm_staff") ev.cancel = true;
    const player = ev.source;
    const asc = ascOf(ev.itemStack);
    system.run(() => {
      try {
        if (player.isValid) useRelic(player, def, asc);
      } catch (e) {
        console.warn(`[relics] ${e}`);
      }
    });
  } catch {
    // not a relic
  }
});

// Tapping a block with a relic: keep relics out of jukeboxes, and a used relic still works (a tap on the ground
// in front of you may arrive as a block interaction instead of a use).
world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  try {
    const def = relicOf(ev.itemStack);
    if (!def) return;
    const player = ev.player;
    if (ev.block.typeId === "minecraft:jukebox") {
      ev.cancel = true;
      if (ev.isFirstEvent) system.run(() => player.isValid && actionbar(player, "§7Relics don't go in a jukebox"));
      return;
    }
    if (!USED.has(def.id)) return;
    if (def.id === "storm_staff") ev.cancel = true;
    if (!ev.isFirstEvent) return;
    const asc = ascOf(ev.itemStack);
    system.run(() => {
      try {
        if (player.isValid) useRelic(player, def, asc);
      } catch (e) {
        console.warn(`[relics] ${e}`);
      }
    });
  } catch {
    // not a relic
  }
});

// Safety net: if a client starts charging the staff anyway, its power still runs (and the debounce keeps it to once).
world.afterEvents.itemStartUse.subscribe(({ source, itemStack }) => {
  try {
    const def = relicOf(itemStack);
    if (def?.id === "storm_staff" && source.isValid) useRelic(source, def, ascOf(itemStack));
  } catch (e) {
    console.warn(`[relics] ${e}`);
  }
});

// ---------------------------------------------------------------------------
// The forge and the menu
// ---------------------------------------------------------------------------

/** Is this stack a Relic Shard (by its first lore line)? @param {ItemStack | undefined} stack */
function isShard(stack) {
  if (!stack || stack.typeId !== SHARD_ITEM) return false;
  try {
    return stack.getLore()[0] === SHARD_LORE;
  } catch {
    return false;
  }
}

/** @param {Container | undefined} container */
function countShards(container) {
  let n = 0;
  if (!container) return 0;
  for (let i = 0; i < container.size; i++) {
    const stack = container.getItem(i);
    if (isShard(stack) && stack) n += stack.amount;
  }
  return n;
}

/** Removes `n` shards. Only call after countShards said there are enough. @param {Container} container @param {number} n */
function takeShards(container, n) {
  let left = n;
  for (let i = 0; i < container.size && left > 0; i++) {
    const stack = container.getItem(i);
    if (!stack || !isShard(stack)) continue;
    if (stack.amount <= left) {
      left -= stack.amount;
      container.setItem(i, undefined);
    } else {
      stack.amount -= left;
      left = 0;
      container.setItem(i, stack);
    }
  }
}

/** A random forgeable relic the player hasn't found yet (any, once they found them all), weighted by rarity. Story relics are never forged. @param {Player} player */
function pickRelic(player) {
  const found = foundOf(player);
  const fresh = forgeable.filter((r) => !found.has(r.id));
  const pool = fresh.length ? fresh : forgeable;
  if (!pool.length) return undefined;
  /** @param {Relic} r */
  const weight = (r) => Math.max(0, CONFIG.rarityWeights[r.rarity] ?? 0);
  const total = pool.reduce((sum, r) => sum + weight(r), 0);
  if (total <= 0) return pool[Math.floor(Math.random() * pool.length)];
  let roll = Math.random() * total;
  for (const r of pool) {
    roll -= weight(r);
    if (roll < 0) return r;
  }
  return pool[pool.length - 1];
}

// Townsfolk (Hearth & Hearsay): Ida's friends need fewer Relic Shards to forge. realm:affinity gives the percent (`off`) with
// ida, on a level change and when the player joins; kept in memory only.
/** @type {Map<string, number>} player id -> percent */
const idaOff = new Map();
/** Affinity levels (0-4) with each townsfolk, and Story Questlines' flags (realm:npc_flags), per player: the story relic gates. @type {Map<string, Record<string, number>>} */
const affinity = new Map();
/** @type {Map<string, Record<string, string>>} */
const storyFlags = new Map();
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:affinity" && id !== "realm:npc_flags") return;
    try {
      const m = JSON.parse(message);
      if (!m || typeof m.player !== "string" || m.player.length > 64) return;
      if (id === "realm:npc_flags") {
        if (m.flags && typeof m.flags === "object") storyFlags.set(m.player, m.flags);
        return;
      }
      const levels = affinity.get(m.player) ?? {};
      if (m.all && typeof m.all === "object") {
        idaOff.set(m.player, Number(m.off?.ida) || 0);
        for (const [npc, level] of Object.entries(m.all)) if (typeof level === "number") levels[npc] = level;
      } else if (typeof m.npc === "string") {
        if (m.npc === "ida") idaOff.set(m.player, Number(m.off) || 0);
        if (typeof m.level === "number") levels[m.npc] = m.level;
      }
      affinity.set(m.player, levels);
    } catch {
      // not ours
    }
  },
  { namespaces: ["realm"] },
);
/** @param {Player} player */
const idaOffOf = (player) => Math.max(0, Math.min(50, idaOff.get(player.id) ?? 0));
/** A price after the friend discount, rounded down (at least 1 when it isn't free). @param {Player} player @param {number} price */
const idaOffPrice = (player, price) => (price > 0 ? Math.max(1, Math.floor((price * (100 - idaOffOf(player))) / 100)) : 0);

/** @param {Player} player */
function forge(player) {
  const cost = Math.max(1, idaOffPrice(player, get("shardsPerForge")));
  const container = player.getComponent("minecraft:inventory")?.container;
  const have = countShards(container);
  if (!container || have < cost) {
    player.sendMessage(`§cYou need ${cost} Relic Shards to forge a relic. You have ${have}.`);
    return;
  }
  const def = pickRelic(player);
  if (!def) return;
  takeShards(container, cost);
  player.playSound("random.anvil_use", { volume: 0.8 });
  giveRelic(player, def, "The forge roars! You made");
}

// ---------------------------------------------------------------------------
// Relic Ascension at the relicsmith, Relic Essence from duplicates
// ---------------------------------------------------------------------------

/** @param {ItemStack | undefined} stack @param {string} item @param {string} lore */
function isTagged(stack, item, lore) {
  if (!stack || stack.typeId !== item) return false;
  try {
    return stack.getLore()[0] === lore;
  } catch {
    return false;
  }
}
const isEssence = (/** @type {ItemStack | undefined} */ s) => isTagged(s, ESSENCE_ITEM, ESSENCE_LORE);
const isGlass = (/** @type {ItemStack | undefined} */ s) => isTagged(s, GLASS_ITEM, GLASS_LORE);

/** @param {Container | undefined} container @param {(s: ItemStack | undefined) => boolean} test */
function countOf(container, test) {
  let n = 0;
  if (container) for (let i = 0; i < container.size; i++) {
    const stack = container.getItem(i);
    if (stack && test(stack)) n += stack.amount;
  }
  return n;
}

/** Removes `n` matching items (only after countOf said there are enough). @param {Container} container @param {(s: ItemStack | undefined) => boolean} test @param {number} n */
function takeOf(container, test, n) {
  let left = n;
  for (let i = 0; i < container.size && left > 0; i++) {
    const stack = container.getItem(i);
    if (!stack || !test(stack)) continue;
    if (stack.amount <= left) {
      left -= stack.amount;
      container.setItem(i, undefined);
    } else {
      stack.amount -= left;
      left = 0;
      container.setItem(i, stack);
    }
  }
}

/** @param {number} amount */
function makeEssence(amount) {
  const stack = new ItemStack(ESSENCE_ITEM, amount);
  stack.nameTag = ESSENCE_NAME;
  stack.setLore([ESSENCE_LORE]);
  return stack;
}

function crownsObjective() {
  try {
    return world.scoreboard.getObjective("crowns") ?? world.scoreboard.addObjective("crowns", "Crowns");
  } catch {
    return world.scoreboard.getObjective("crowns");
  }
}

/** @param {Player} player */
function crownsOf(player) {
  try {
    return crownsObjective()?.getScore(player) ?? 0;
  } catch {
    return 0; // no score anywhere yet
  }
}

/**
 * Every relic on the player with where it is: inventory slots and armor/off hand, each with its serial (so a choice
 * made in a menu finds the same item after the form, wherever it moved).
 * @param {Player} player @returns {{ def: Relic, stack: ItemStack, asc: number, serial: number, put: (s: ItemStack | undefined) => void }[]}
 */
function relicStacks(player) {
  /** @type {{ def: Relic, stack: ItemStack, asc: number, serial: number, put: (s: ItemStack | undefined) => void }[]} */
  const out = [];
  const container = player.getComponent("minecraft:inventory")?.container;
  if (container) for (let i = 0; i < container.size; i++) {
    const stack = container.getItem(i);
    const def = relicOf(stack);
    if (!def || !stack) continue;
    const serial = Number(stack.getDynamicProperty(ITEM_SERIAL)) || 0;
    out.push({ def, stack, asc: ascOf(stack), serial, put: (s) => container.setItem(i, s) });
  }
  const equip = player.getComponent("minecraft:equippable");
  if (equip) for (const slot of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand]) {
    const stack = equip.getEquipment(slot);
    const def = relicOf(stack);
    if (!def || !stack) continue;
    const serial = Number(stack.getDynamicProperty(ITEM_SERIAL)) || 0;
    out.push({ def, stack, asc: ascOf(stack), serial, put: (s) => equip.setEquipment(slot, s) });
  }
  return out;
}

/** What the next stage of a relic costs (Ida's friends need fewer shards). @param {Player} player @param {number} asc the stage now */
function costOf(player, asc) {
  const c = CONFIG.ascension.costs[asc] ?? CONFIG.ascension.costs[CONFIG.ascension.costs.length - 1];
  return { shards: Math.max(1, idaOffPrice(player, Math.max(1, Math.floor(c.shards)))), glass: Math.max(0, Math.floor(c.glass)), crowns: Math.max(0, Math.floor(c.crowns)) };
}

/** Why a story relic can't go past +1 yet, or undefined. @param {Player} player @param {Relic} def @param {number} asc the stage now */
function gateOf(player, def, asc) {
  if (!def.story || asc < 1) return undefined;
  const gate = CONFIG.storyGates.find((g) => g.relic === def.id);
  if (!gate) return undefined;
  if ((affinity.get(player.id)?.[gate.npc] ?? 0) >= CONFIG.ascension.gateLevel) return undefined;
  if (gate.flag && storyFlags.get(player.id)?.[gate.flag] === gate.value) return undefined;
  return gate.text;
}

/** Materials the player has: essence and shards (together), Storm Glass, Crowns. @param {Player} player */
function materials(player) {
  const container = player.getComponent("minecraft:inventory")?.container;
  const essence = countOf(container, isEssence);
  const shards = countShards(container);
  return { container, essence, shards, glass: countOf(container, isGlass), crowns: crownsOf(player) };
}

/** Ascends the relic with this serial by one stage, taking the cost once. Returns why not, or undefined. @param {Player} player @param {number} serial */
function ascend(player, serial) {
  if (get("ascension.enabled") !== true) return "Ascension is closed on this realm.";
  const r = relicStacks(player).find((x) => x.serial === serial && serial > 0);
  if (!r) return "That relic isn't on you anymore.";
  if (r.asc >= 3) return `${r.def.name} is already Starlit.`;
  const gate = gateOf(player, r.def, r.asc);
  if (gate) return `${r.def.name} can't go past +1 yet: it needs ${gate}.`;
  const cost = costOf(player, r.asc);
  const m = materials(player);
  if (!m.container) return "No inventory.";
  if (m.essence + m.shards < cost.shards) return `You need ${cost.shards} Relic Shards or Relic Essence (you have ${m.essence + m.shards}).`;
  if (m.glass < cost.glass) return `You need ${cost.glass} Storm Glass (you have ${m.glass}).`;
  if (m.crowns < cost.crowns) return `You need ${cost.crowns} Crowns (you have ${m.crowns}).`;
  // Everything is there: take it all in this tick (nothing can move in between), Crowns first since only that can fail.
  try {
    if (cost.crowns) crownsObjective()?.addScore(player, -cost.crowns);
  } catch {
    return "The Crowns couldn't be taken.";
  }
  const fromEssence = Math.min(m.essence, cost.shards);
  if (fromEssence) takeOf(m.container, isEssence, fromEssence);
  if (cost.shards - fromEssence) takeShards(m.container, cost.shards - fromEssence);
  if (cost.glass) takeOf(m.container, isGlass, cost.glass);
  const asc = r.asc + 1;
  r.stack.setDynamicProperty(ITEM_ASC, asc);
  freshen(r.stack, r.def);
  r.put(r.stack);
  player.playSound(asc >= 3 ? "random.totem" : "random.anvil_use", { volume: 0.8 });
  player.sendMessage(`§d${r.def.name} is now +${asc} ${STAGES[asc]}: §f${stageText(r.def, asc)}.${asc >= 3 ? ` §6Starlit: ${ASC[r.def.id]?.star}.` : ""}`);
  if (asc >= 3) {
    system.sendScriptEvent("realm:gossip", JSON.stringify({ kind: "relic_starlit", player: player.id, name: player.name, place: r.def.name }));
    if (CONFIG.ascension.announceStarlit) for (const p of world.getAllPlayers()) if (p.id !== player.id) p.sendMessage(`§6${player.name}'s ${r.def.name} is Starlit!`);
  }
  return undefined;
}

/** Breaks the lowest-stage copy of a relic the player carries two of into Relic Essence. Returns why not, or undefined. @param {Player} player @param {string} id */
function breakDuplicate(player, id) {
  if (get("ascension.enabled") !== true) return "Ascension is closed on this realm.";
  const copies = relicStacks(player).filter((x) => x.def.id === id);
  if (copies.length < 2) return "You need two of the same relic to break one.";
  const low = copies.reduce((a, b) => (b.asc < a.asc ? b : a));
  low.put(undefined);
  const n = Math.max(1, Math.floor(CONFIG.ascension.essencePerBreak));
  const dropped = giveItem(player, makeEssence(n));
  player.playSound("random.break", { volume: 0.8 });
  player.sendMessage(`§dIda breaks your spare ${low.def.name}${low.asc ? ` +${low.asc}` : ""} into ${n} Relic Essence.${dropped ? " §7It dropped at your feet: your inventory is full." : ""}`);
  return undefined;
}

/** @param {Player} player @param {string} title @param {string} body @param {string} yes */
async function confirmForm(player, title, body, yes) {
  const res = await showForm(player, new MessageFormData().title(title).body(body).button1(yes).button2("Cancel"));
  return !!res && !res.canceled && res.selection === 0;
}

/** The ascension list: each relic on the player and its next stage. @param {Player} player */
async function showAscend(player) {
  const list = relicStacks(player)
    .filter((r) => r.asc < 3 && r.serial > 0)
    .sort((a, b) => b.asc - a.asc || a.def.name.localeCompare(b.def.name));
  const m = materials(player);
  const body = [
    "Ida can wake the power in a relic: +1 Awakened, +2 Ascended, +3 Starlit. Each stage costs Relic Shards (or Relic Essence), Storm Glass and Crowns.",
    `§7You have ${m.shards} Relic Shards, ${m.essence} Relic Essence, ${m.glass} Storm Glass and ${m.crowns} Crowns.`,
  ];
  if (!list.length) body.push("§7No relic on you can go further.");
  const form = new ActionFormData().title("§lAscend a relic").body(body.join("\n\n"));
  for (const r of list) {
    const c = costOf(player, r.asc);
    const gate = gateOf(player, r.def, r.asc);
    form.button(`${nameFor(r.def, r.asc)} §r-> +${r.asc + 1}\n§8${gate ? "needs a story or a friend" : `${c.shards} shards, ${c.glass} glass, ${c.crowns} Crowns`}`);
  }
  form.button("Back");
  const res = await showForm(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  const r = list[res.selection];
  if (!r) return showRelics(player, true);
  const next = r.asc + 1;
  const c = costOf(player, r.asc);
  const gate = gateOf(player, r.def, r.asc);
  const lines = [`§l${r.def.name}§r: +${r.asc} -> +${next} ${STAGES[next]}`, `§b${stageText(r.def, next)}`];
  if (next === 2) lines.push(`§3Adds a line: ${ASC[r.def.id]?.flavor ?? ""}`);
  if (next === 3) lines.push(`§6Starlit: ${ASC[r.def.id]?.star ?? ""}, and a gold name`);
  if (gate) {
    lines.push("", `§cA story relic stops at +1 until: ${gate}.`);
    await showForm(player, new ActionFormData().title("§lAscend a relic").body(lines.join("\n")).button("Back"));
    return showAscend(player);
  }
  lines.push("", `Cost: ${c.shards} Relic Shards or Essence (Essence first), ${c.glass} Storm Glass, ${c.crowns} Crowns.`, `§7You have ${m.shards + m.essence}, ${m.glass} and ${m.crowns}.`);
  if (!(await confirmForm(player, "§lAscend a relic", lines.join("\n"), "Ascend")) || !player.isValid) return showAscend(player);
  const why = ascend(player, r.serial);
  if (why) player.sendMessage(`§c${why}`);
  return showAscend(player);
}

/** Duplicates on the player, to break into Relic Essence. @param {Player} player */
async function showBreak(player) {
  /** @type {Map<string, { def: Relic, asc: number[] }>} */
  const groups = new Map();
  for (const r of relicStacks(player)) {
    const g = groups.get(r.def.id) ?? { def: r.def, asc: [] };
    g.asc.push(r.asc);
    groups.set(r.def.id, g);
  }
  const dupes = [...groups.values()].filter((g) => g.asc.length >= 2);
  const n = Math.max(1, Math.floor(CONFIG.ascension.essencePerBreak));
  const form = new ActionFormData()
    .title("§lBreak a duplicate")
    .body(`Carry two of the same relic and Ida breaks the lower one into ${n} Relic Essence, which counts like Relic Shards for ascension.${dupes.length ? "" : "\n\n§7You don't carry two of any relic."}`);
  for (const g of dupes) form.button(`${g.def.name} x${g.asc.length}\n§8Breaks a +${Math.min(...g.asc)} copy into ${n} Essence`);
  form.button("Back");
  const res = await showForm(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  const g = dupes[res.selection];
  if (!g) return showRelics(player, true);
  const low = Math.min(...g.asc);
  const ok = await confirmForm(player, "§lBreak a duplicate", `Break one ${g.def.name}${low ? ` +${low}` : ""} (your lowest copy) into ${n} Relic Essence? It's gone for good.${low ? "\n\n§cIts stage is lost too." : ""}`, "Break it");
  if (ok && player.isValid) {
    const why = breakDuplicate(player, g.def.id);
    if (why) player.sendMessage(`§c${why}`);
  }
  return showBreak(player);
}

/** The relic sets, for the list. @param {Set<string>} on */
function setLines(on) {
  return SETS.map((set) => `§d${set.name} set§r (${set.relics.map((id) => `${on.has(id) ? "§a" : "§7"}${relics.get(id)?.name ?? id}§r`).join(", ")}): §7${set.text}`).join("\n");
}

/** Relic ids anywhere on the player: inventory, armor and off hand. @param {Player} player */
function relicsOn(player) {
  /** @type {Set<string>} */
  const ids = new Set();
  const container = player.getComponent("minecraft:inventory")?.container;
  if (container) for (let i = 0; i < container.size; i++) {
    const def = relicOf(container.getItem(i));
    if (def) ids.add(def.id);
  }
  const equip = player.getComponent("minecraft:equippable");
  if (equip) for (const slot of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand]) {
    const def = relicOf(equip.getEquipment(slot));
    if (def) ids.add(def.id);
  }
  return ids;
}

/** Shows a form, waiting while the player has another screen open (chat, say). @template {{ show(p: Player): Promise<any> }} F @param {Player} player @param {F} form @returns {Promise<Awaited<ReturnType<F["show"]>> | undefined>} */
async function showForm(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (res.canceled && res.cancelationReason === FormCancelationReason.UserBusy) {
      await new Promise((r) => system.runTimeout(() => r(undefined), 20));
      continue;
    }
    return res;
  }
  return undefined;
}

/** @param {Player} player */
const isOperator = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

/** One relic's lines in the list. @param {Relic} def @param {Set<string>} on @param {number} [asc] the highest stage of it on the player */
function relicLines(def, on, asc = 0) {
  const rarity = RARITY[def.rarity] ?? RARITY.common;
  const cd = cooldownAt(def, asc);
  const stage = asc ? `\n§b+${asc} ${STAGES[asc]}: ${stageText(def, asc)}${asc >= 3 ? `. §6${ASC[def.id]?.star ?? ""}` : ""}` : "";
  return `${asc >= 3 ? "§6" : rarity.color}${def.name}${asc ? ` +${asc}` : ""} §7(${rarity.label})${on.has(def.id) ? "" : " §8- not with you"}§r\n§f${def.ability}${cd > 0 && def.id !== "singing_blade" ? ` §7(cooldown ${cd}s)` : ""}${stage}\n§8${WHERE[def.where] ?? ""}`;
}

/** The relics you've found (with the forge when opened at a relicsmith). @param {Player} player @param {boolean} atSmith opened from a relicsmith */
async function showRelics(player, atSmith) {
  if (!player.isValid) return;
  const on = relicsOn(player);
  for (const id of on) {
    const def = relics.get(id);
    if (def) markFound(player, def);
  }
  const found = foundOf(player);
  const cost = Math.max(1, idaOffPrice(player, get("shardsPerForge")));
  const shards = countShards(player.getComponent("minecraft:inventory")?.container);
  const canForge = atSmith || get("forgeAnywhere") === true;
  /** @type {Map<string, number>} the highest stage of each relic on the player */
  const best = new Map();
  for (const r of relicStacks(player)) best.set(r.def.id, Math.max(best.get(r.def.id) ?? 0, r.asc));
  const foundForgeable = forgeable.filter((r) => found.has(r.id));
  const foundStory = storyRelics.filter((r) => found.has(r.id));
  /** @type {string[]} */
  const lines = [`Relics found: ${foundForgeable.length} of ${forgeable.length}`];
  for (const def of foundForgeable) lines.push(relicLines(def, on, best.get(def.id)));
  /** @type {Record<string, number>} */
  const missing = {};
  for (const def of forgeable) if (!found.has(def.id)) missing[def.rarity] = (missing[def.rarity] ?? 0) + 1;
  const rest = Object.entries(missing).map(([r, n]) => `${n} ${RARITY[/** @type {keyof RARITY} */ (r)]?.label.toLowerCase() ?? r}`);
  if (rest.length) lines.push(`§7Still to find: ${rest.join(", ")}`);
  lines.push(`§fStory relics: ${foundStory.length} of ${storyRelics.length}§7 (rewards from the story, never forged)`);
  for (const def of foundStory) lines.push(relicLines(def, on, best.get(def.id)));
  if (get("setsEnabled") === true) lines.push(`§fRelic sets§7 (all three in your hotbar, off hand or worn):\n${setLines(on)}`);
  lines.push(
    canForge
      ? `§fYou have ${shards} Relic Shard${shards === 1 ? "" : "s"}. Forging a relic takes ${cost}.`
      : `§7Bring ${cost} Relic Shards to a relicsmith to forge a relic. You have ${shards}.`,
  );
  const form = new ActionFormData().title(atSmith ? "§lRelic forge" : "§lYour relics").body(lines.join("\n\n"));
  /** @type {(() => unknown)[]} */
  const actions = [];
  if (canForge) {
    form.button(`Forge a relic\n§8${cost} Relic Shards`);
    actions.push(() => forge(player));
    if (get("ascension.enabled") === true) {
      form.button("Ascend a relic\n§8+1 Awakened, +2 Ascended, +3 Starlit");
      actions.push(() => showAscend(player));
      form.button(`Break a duplicate\n§8Into ${Math.max(1, Math.floor(CONFIG.ascension.essencePerBreak))} Relic Essence`);
      actions.push(() => showBreak(player));
    }
  }
  form.button("Close");
  const res = await showForm(player, form);
  if (res && !res.canceled && res.selection !== undefined) await actions[res.selection]?.();
}

/** The /realm:relics menu: every action the player may use. @param {Player} player */
async function showMenu(player) {
  if (!player.isValid) return;
  const op = isOperator(player);
  const canForge = get("forgeAnywhere") === true;
  /** @type {{ label: string, run: () => unknown }[]} */
  const actions = [{ label: "Your relics\n§8What you've found and what each does", run: () => showRelics(player, false) }];
  if (canForge) actions.push({ label: `Forge a relic\n§8${Math.max(1, idaOffPrice(player, get("shardsPerForge")))} Relic Shards`, run: () => forge(player) });
  if (op) {
    actions.push({ label: "Give a relic\n§8Operators", run: () => showGive(player) });
    actions.push({ label: "Place a relicsmith here\n§8Operators: needs the Townsfolk pack", run: () => placeSmith(player) });
  }
  const form = new ActionFormData()
    .title("§lRelics")
    .body(canForge ? "Relics are rare items with powers of their own." : "Relics are rare items with powers of their own. Forge new ones from Relic Shards at a relicsmith.");
  for (const a of actions) form.button(a.label);
  const res = await showForm(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  await actions[res.selection]?.run();
}

/** Operators: pick a player and a relic. @param {Player} player */
async function showGive(player) {
  const players = world.getAllPlayers();
  const form = new ModalFormData()
    .title("§lGive a relic")
    .dropdown("Player", players.map((p) => p.name), { defaultValueIndex: Math.max(0, players.findIndex((p) => p.id === player.id)) })
    .dropdown("Relic", CONFIG.relics.map((r) => `${r.name}${r.story ? " (story)" : ""}`));
  const res = await showForm(player, form);
  if (!res || res.canceled || !res.formValues || !player.isValid) return;
  if (!isOperator(player)) return player.sendMessage("§cOnly operators can give relics."); // de-opped while the form was open
  const target = players[Number(res.formValues[0])];
  const def = CONFIG.relics[Number(res.formValues[1])];
  if (!target?.isValid || !def) return;
  giveRelic(target, def, "You received");
  if (target.id !== player.id) player.sendMessage(`§7Gave ${def.name} to ${target.name}.`);
}

/** Answers from the Townsfolk pack to realm:npc_summon, by player id. @type {Map<string, (msg: any) => void>} */
const smithWaits = new Map();

/** Operators: asks the Townsfolk pack to place the relicsmith at the player's spot. @param {Player} player */
function placeSmith(player) {
  if (!isOperator(player)) return Promise.resolve();
  const id = CONFIG.relicsmithId;
  return new Promise((resolve) => {
    const timeout = system.runTimeout(() => {
      smithWaits.delete(player.id);
      if (player.isValid) {
        player.sendMessage(
          `§cNo answer from the Townsfolk pack, so no relicsmith was placed. §7A relicsmith is a townsfolk with the ${CONFIG.npcRole} role (Ida, id ${id}), from the Townsfolk pack (npc_bp): add it to the realm, then try again.`,
        );
      }
      resolve(undefined);
    }, SMITH_WAIT_TICKS);
    smithWaits.set(player.id, (msg) => {
      system.clearRun(timeout);
      smithWaits.delete(player.id);
      if (player.isValid) {
        if (msg.ok) {
          player.sendMessage(`§aThe relicsmith is here. §7Players tap her and pick Relic forge.`);
          player.playSound("random.anvil_use", { volume: 0.5 });
        } else player.sendMessage(`§cThe relicsmith couldn't be placed: ${typeof msg.error === "string" ? msg.error.slice(0, 200) : "the Townsfolk pack said no"}.`);
      }
      resolve(undefined);
    });
    system.sendScriptEvent("realm:npc_summon", JSON.stringify({ id, player: player.id }));
  });
}

// ---------------------------------------------------------------------------
// Script events: gifts from other packs, the storm cell, townsfolk, seals
// ---------------------------------------------------------------------------

const HANDLED = new Set(["realm:actionbar", "realm:relic_give", "realm:shard_give", "realm:storm_cell", "realm:npc_talk", "realm:npc_choose", "realm:npc_summoned", "realm:seals", "realm:relic_sets_ping"]);

/** A seal list from a message, or undefined if it isn't one. @param {unknown} list @returns {Seal[] | undefined} */
function parseSeals(list) {
  if (!Array.isArray(list)) return undefined;
  /** @type {Seal[]} */
  const out = [];
  for (const s of list.slice(0, 16)) {
    if (!s || typeof s !== "object" || !Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
    const dim = typeof s.dim === "string" ? (s.dim.includes(":") ? s.dim : `minecraft:${s.dim}`) : OVERWORLD;
    out.push({ name: typeof s.name === "string" ? s.name.slice(0, 40) : "a seal", dim, x: s.x, z: s.z });
  }
  return out;
}

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (!HANDLED.has(id)) return;
    /** @type {any} */
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return; // not ours to fix
    }
    if (!msg || typeof msg !== "object") return;
    try {
      if (id === "realm:relic_sets_ping") {
        for (const p of world.getAllPlayers()) {
          const c = carried.get(p.id);
          if (c) sendSets(p, setsOf(c), true);
        }
        return;
      }
      if (id === "realm:actionbar") {
        // Another pack's note: the Storm Meter and Lantern Shard readouts wait while it shows (a steady line, like the HUD).
        // A lower steady line (`steady` below ours, or equal from a pack named after ours) waits for them instead.
        if (typeof msg.player !== "string" || msg.from === "relics_bp" || msg.background === true) return;
        if (Number.isFinite(msg.steady) && (msg.steady < STEADY || (msg.steady === STEADY && String(msg.from) > "relics_bp"))) return;
        const until = system.currentTick + Math.min(Math.max(Number(msg.ticks) || 40, 0), 200);
        if (until > (barHeld.get(msg.player) ?? 0)) barHeld.set(msg.player, until);
        return;
      }
      if (id === "realm:storm_cell") {
        if (typeof msg.dim === "string" && Number.isFinite(msg.x) && Number.isFinite(msg.z)) {
          const strength = Math.max(1, Math.min(10, Math.round(Number(msg.strength) || 1)));
          cell = { dim: msg.dim.includes(":") ? msg.dim : `minecraft:${msg.dim}`, x: msg.x, z: msg.z, strength, tick: system.currentTick };
        } else cell = undefined;
        return;
      }
      if (id === "realm:seals") {
        const list = parseSeals(msg.seals);
        if (!list) return;
        const key = typeof msg.player === "string" ? msg.player.slice(0, 64) : "";
        if (list.length) seals.set(key, list);
        else seals.delete(key);
        if (seals.size > 200) seals.delete(/** @type {string} */ (seals.keys().next().value));
        return;
      }
      if (id === "realm:npc_talk") {
        if (Array.isArray(msg.roles) && msg.roles.includes(CONFIG.npcRole) && typeof msg.req === "string") {
          system.sendScriptEvent("realm:npc_offer", JSON.stringify({ req: msg.req, pack: "relics_bp", key: "forge", label: "Relic forge", order: 40 }));
        }
        return;
      }
      if (typeof msg.player !== "string" || msg.player.length > 64) return;
      if (id === "realm:npc_summoned") {
        if (msg.id === CONFIG.relicsmithId) smithWaits.get(msg.player)?.(msg);
        return;
      }
      const player = online(msg.player);
      if (id === "realm:npc_choose") {
        if (player && msg.pack === "relics_bp" && msg.key === "forge") showRelics(player, true).catch((e) => console.warn(`[relics] ${e}`));
        return;
      }
      if (id === "realm:relic_give") {
        const def = typeof msg.relic === "string" ? relics.get(msg.relic) : undefined;
        if (!def) return;
        if (player) giveRelic(player, def, "You received");
        else queue(msg.player, def.id, 0);
        return;
      }
      // realm:shard_give
      const amount = Math.floor(Number(msg.amount));
      if (!Number.isFinite(amount) || amount < 1) return;
      const n = Math.min(640, amount);
      if (player) giveShards(player, n);
      else queue(msg.player, undefined, n);
    } catch (e) {
      console.warn(`[relics] ${id}: ${e}`);
    }
  },
  { namespaces: ["realm"] },
);

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {import("@minecraft/server").CustomCommandOrigin} origin @param {(p: Player) => Promise<unknown>} open */
function openFor(origin, open) {
  const player = origin.initiator ?? origin.sourceEntity;
  if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
  system.run(() => open(player).catch((e) => console.warn(`[relics] ${e}`)));
  return { status: CustomCommandStatus.Success };
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerEnum("realm:relic_id", CONFIG.relics.map((r) => r.id));
  customCommandRegistry.registerCommand(
    {
      name: "realm:relics",
      description: "Relics: a menu of your relics, the forge and (operators) giving relics and placing a relicsmith",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => openFor(origin, showMenu),
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:relics_list",
      description: "Relics: the relics you've found and what they do",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => openFor(origin, (p) => showRelics(p, false)),
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:relics_smith",
      description: "Relics (operators): place the relicsmith where you stand (needs the Townsfolk pack)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
    },
    (origin) => openFor(origin, placeSmith),
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:relics_give",
      description: "Relics: give a player a relic",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [
        { name: "player", type: CustomCommandParamType.PlayerSelector },
        { name: "realm:relic_id", type: CustomCommandParamType.Enum },
      ],
    },
    (origin, targets, relic) => {
      const def = typeof relic === "string" ? relics.get(relic) : undefined;
      if (!def) return { status: CustomCommandStatus.Failure, message: `No relic "${relic}".` };
      const players = Array.isArray(targets) ? targets.filter((p) => p instanceof Player) : [];
      if (!players.length) return { status: CustomCommandStatus.Failure, message: "No player found." };
      system.run(() => {
        for (const p of players) {
          try {
            if (p.isValid) giveRelic(p, def, "You received");
          } catch (e) {
            console.warn(`[relics] ${e}`);
          }
        }
      });
      return { status: CustomCommandStatus.Success, message: `Gave ${def.name} to ${players.map((p) => p.name).join(", ")}.` };
    },
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "relics_bp");
  },
  { namespaces: ["realm"] },
);
