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
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
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

/** @type {Map<string, Relic>} */
const relics = new Map(CONFIG.relics.map((r) => [r.id, r]));
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

/** @param {string} id */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);

/** Shows a line above the hotbar, asking the Coordinates HUD to step aside first. @param {Player} player @param {string} text @param {number} [ticks] */
function actionbar(player, text, ticks = 40) {
  system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: player.id, ticks }));
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

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather }) => {
  if (dimension !== OVERWORLD) return;
  weather = newWeather;
  try {
    world.setDynamicProperty(PROP_WEATHER, newWeather);
  } catch (e) {
    console.warn(`[relics] ${e}`);
  }
});

world.afterEvents.worldLoad.subscribe(() => {
  try {
    const saved = world.getDynamicProperty(PROP_WEATHER);
    if (saved === WeatherType.Rain || saved === WeatherType.Thunder) weather = saved;
  } catch (e) {
    console.warn(`[relics] ${e}`);
  }
});

// ---------------------------------------------------------------------------
// Making and giving relics
// ---------------------------------------------------------------------------

function nextSerial() {
  const last = world.getDynamicProperty(PROP_SERIAL);
  const n = (typeof last === "number" ? last : 0) + 1;
  world.setDynamicProperty(PROP_SERIAL, n);
  return n;
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
  const rarity = RARITY[def.rarity] ?? RARITY.common;
  stack.nameTag = `§r${rarity.color}${def.name}`;
  const lore = [`${rarity.color}${rarity.label} relic`, ...wrap(def.ability).map((l) => `§7${l}`)];
  if (def.cooldown > 0) lore.push(`§8Cooldown: ${def.cooldown}s`);
  stack.setLore(lore);
  stack.setDynamicProperty(ITEM_ID, def.id);
  stack.setDynamicProperty(ITEM_SERIAL, nextSerial());
  stack.keepOnDeath = CONFIG.keepOnDeath;
  if (def.id === "tide_boots") {
    try {
      const dye = stack.getComponent("minecraft:dyeable");
      if (dye) dye.color = { red: 0.15, green: 0.45, blue: 0.8 };
    } catch {
      // undyed boots work the same
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
  for (const key of [...cooldowns.keys()]) if (key.startsWith(`${playerId}:`)) cooldowns.delete(key);
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

/** @param {Player} player @param {Relic} def */
function startCooldown(player, def) {
  if (def.cooldown > 0) cooldowns.set(`${player.id}:${def.id}`, Date.now() + def.cooldown * 1000);
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

/** What each player carries: relic ids in their hand, anywhere in the hotbar or off hand, and worn. @type {Map<string, { hand?: string, carry: Set<string>, head?: string, feet?: string }>} */
const carried = new Map();
/** Effects this pack is keeping on each player. @type {Map<string, Set<string>>} */
const kept = new Map();
/** Tick of the last "not ready" note per player for passive relics, so it isn't shown every second. @type {Map<string, number>} */
const passiveNote = new Map();

/** @param {string} type */
function effectTiming(type) {
  return type === "night_vision" ? NIGHT_VISION : EFFECT;
}

/** @param {Player} player @param {string} type */
function keep(player, type) {
  const t = effectTiming(type);
  const e = player.getEffect(type);
  if (!e || (e.amplifier === 0 && e.duration < t.refreshBelow)) player.addEffect(type, t.duration, { amplifier: 0, showParticles: false });
  let set = kept.get(player.id);
  if (!set) kept.set(player.id, (set = new Set()));
  set.add(type);
}

/** Removes the effects this pack kept on the player that aren't wanted now. @param {Player} player @param {Set<string>} wanted */
function release(player, wanted) {
  const set = kept.get(player.id);
  if (!set) return;
  for (const type of [...set]) {
    if (wanted.has(type)) continue;
    set.delete(type);
    const e = player.getEffect(type);
    // Only ours: level I and no longer than we give. A potion's longer effect stays.
    if (e && e.amplifier === 0 && e.duration <= effectTiming(type).duration) player.removeEffect(type);
  }
}

/** Highest block over the player: open sky (nothing 2+ blocks overhead) and dry ground. @param {Player} player */
function sky(player) {
  try {
    const feet = player.location;
    const top = player.dimension.getTopmostBlock({ x: Math.floor(feet.x), z: Math.floor(feet.z) });
    if (!top) return undefined;
    return { open: top.location.y - Math.floor(feet.y) < 2, dry: DRY_GROUND.test(top.typeId) };
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
  /** @type {{ hand?: string, carry: Set<string>, head?: string, feet?: string }} */
  const c = { carry: new Set() };
  const repair = get("autoRepair") === true;
  const container = player.getComponent("minecraft:inventory")?.container;
  const equip = player.getComponent("minecraft:equippable");
  if (container) {
    const selected = player.selectedSlotIndex;
    for (let slot = 0; slot < 9; slot++) {
      const stack = container.getItem(slot);
      const def = relicOf(stack);
      if (!def || !stack) continue;
      markFound(player, def);
      c.carry.add(def.id);
      if (slot === selected) {
        c.hand = def.id;
        if (repair && mend(stack)) container.setItem(slot, stack);
      }
    }
  }
  if (equip) {
    for (const [slot, key] of /** @type {const} */ ([[EquipmentSlot.Offhand, "offhand"], [EquipmentSlot.Head, "head"], [EquipmentSlot.Feet, "feet"]])) {
      const stack = equip.getEquipment(slot);
      const def = relicOf(stack);
      if (!def || !stack) continue;
      markFound(player, def);
      if (key === "offhand") c.carry.add(def.id);
      else c[key] = def.id;
      if (repair && key !== "offhand" && mend(stack)) equip.setEquipment(slot, stack);
    }
  }
  carried.set(player.id, c);
  return c;
}

/** @param {Player} player */
function passives(player) {
  const c = scanCarried(player);
  /** @type {Set<string>} */
  const wanted = new Set();
  if (get("enabled") === true) {
    const y = player.location.y;
    const overworld = player.dimension.id === OVERWORLD;
    const has = (/** @type {string} */ id) => {
      const where = relics.get(id)?.where;
      if (where === "hand") return c.hand === id;
      if (where === "head") return c.head === id;
      if (where === "feet") return c.feet === id;
      return c.carry.has(id);
    };
    /** @type {ReturnType<typeof sky> | null} null = not looked up yet */
    let above = null;
    const look = () => (above === null ? (above = sky(player)) : above);
    const raining = overworld && weather !== WeatherType.Clear;
    const inRain = () => {
      const s = raining ? look() : undefined;
      return !!s && s.open && !s.dry;
    };
    if (has("rain_charm") && inRain()) wanted.add("regeneration");
    if (has("tide_boots") && inRain()) {
      wanted.add("dolphins_grace");
      wanted.add("speed");
    }
    if (has("lantern_deep") && y < 0) wanted.add("night_vision");
    if (has("miners_lamp") && y < 30) wanted.add("haste");
    if (has("wayfarer_boots") && overworld && player.isSprinting && look()?.open) wanted.add("speed");
    for (const type of wanted) keep(player, type);
    if (has("sun_pendant") && player.getComponent("minecraft:onfire")) sunPendant(player);
    if (has("storm_meter") && getFor(player, "meterReadout") === true) actionbar(player, `§bStorm Meter: ${stormReading(player)}`, 30);
  }
  release(player, wanted);
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
  player.addEffect("fire_resistance", 200, { amplifier: 0, showParticles: true });
  startCooldown(player, def);
  actionbar(player, `§6${def.name}: Fire Resistance for 10s`);
  player.playSound("random.fizz", { volume: 0.6 });
}

const FIRE = new Set([EntityDamageCause.fire, EntityDamageCause.fireTick, EntityDamageCause.lava, EntityDamageCause.campfire]);

world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource }) => {
  try {
    const cause = damageSource.cause;
    if (cause !== EntityDamageCause.entityAttack && !FIRE.has(cause)) return;
    if (get("enabled") !== true) return;
    if (FIRE.has(cause)) {
      if (hurtEntity instanceof Player && hurtEntity.isValid && carried.get(hurtEntity.id)?.carry.has("sun_pendant")) sunPendant(hurtEntity);
      return;
    }
    // Frost Band: melee hits slow what they hit.
    const attacker = damageSource.damagingEntity;
    if (!(attacker instanceof Player) || !hurtEntity.isValid) return;
    if (!carried.get(attacker.id)?.carry.has("frost_band")) return;
    hurtEntity.addEffect("slowness", 60, { amplifier: 0 });
  } catch (e) {
    console.warn(`[relics] ${e}`);
  }
});

// ---------------------------------------------------------------------------
// Storm Meter: storm_bp reports the storm cell every 2 s
// ---------------------------------------------------------------------------

/** @type {{ dim: string, x: number, z: number, strength: number, tick: number } | undefined} */
let cell;

/** "Cell: 340m NE, strength 7/10", or "No storm cell". @param {Player} player */
function stormReading(player) {
  if (!cell || system.currentTick - cell.tick > STORM_FRESH_TICKS || cell.dim !== player.dimension.id) return "§7No storm cell";
  const dx = cell.x - player.location.x;
  const dz = cell.z - player.location.z;
  const dist = Math.round(Math.hypot(dx, dz));
  return `§fCell: ${dist}m ${direction(dx, dz)}, strength ${cell.strength}/10`;
}

// ---------------------------------------------------------------------------
// Used abilities: Storm Staff and Compass of Echoes
// ---------------------------------------------------------------------------

const NOT_TARGETS = ["minecraft:item", "minecraft:xp_orb", "minecraft:arrow", "minecraft:thrown_trident", "minecraft:fishing_hook", "minecraft:lightning_bolt"];

/** @param {Player} player @param {Relic} def */
function stormStaff(player, def) {
  if (player.dimension.id !== OVERWORLD || weather !== WeatherType.Thunder) {
    actionbar(player, `§7${def.name}: it only answers in a thunderstorm`);
    return;
  }
  if (!ready(player, def)) return;
  const range = CONFIG.staffRange;
  const excludeTypes = get("staffHitsPlayers") === true ? NOT_TARGETS : [...NOT_TARGETS, "minecraft:player"];
  const hit = player
    .getEntitiesFromViewDirection({ maxDistance: range, excludeTypes, excludeTags: ["realm:npc"] })
    .find((h) => h.entity.isValid && h.entity.id !== player.id);
  /** @type {Vector3 | undefined} */
  let at = hit?.entity.location;
  if (!at) {
    const block = player.getBlockFromViewDirection({ maxDistance: range })?.block;
    if (block) at = { x: block.location.x + 0.5, y: block.location.y + 1, z: block.location.z + 0.5 };
  }
  if (!at) {
    actionbar(player, `§7${def.name}: nothing within ${range} blocks`);
    return;
  }
  const spawn = world.getDefaultSpawnLocation();
  if (Math.hypot(at.x - spawn.x, at.z - spawn.z) < CONFIG.avoidSpawn) {
    actionbar(player, `§7${def.name}: the sky won't strike this close to spawn`);
    return;
  }
  player.dimension.spawnEntity("minecraft:lightning_bolt", at);
  startCooldown(player, def);
}

/** @param {Player} player @param {Relic} def */
function compass(player, def) {
  if (!ready(player, def)) return;
  startCooldown(player, def);
  const [champion] = player.dimension.getEntities({ tags: ["realm:champion"], location: player.location, maxDistance: CONFIG.compassRange, closest: 1 });
  if (!champion) {
    player.sendMessage(`§7${def.name}: no champion within ${CONFIG.compassRange} blocks.`);
    return;
  }
  const dx = champion.location.x - player.location.x;
  const dz = champion.location.z - player.location.z;
  const name = champion.nameTag || champion.typeId.replace(/^minecraft:/, "").replace(/_/g, " ");
  player.sendMessage(`§d${def.name}: §fa champion (${name}§f) is ${Math.round(Math.hypot(dx, dz))}m ${direction(dx, dz)}.`);
  player.playSound("block.bell.hit", { pitch: 1.6, volume: 0.6 });
}

world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  try {
    if (!(source instanceof Player) || get("enabled") !== true) return;
    const def = relicOf(itemStack);
    if (!def) return;
    markFound(source, def);
    if (def.id === "storm_staff") stormStaff(source, def);
    else if (def.id === "compass_echoes") compass(source, def);
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

/** A random relic the player hasn't found yet (any, once they found them all), weighted by rarity. @param {Player} player */
function pickRelic(player) {
  const found = foundOf(player);
  const fresh = CONFIG.relics.filter((r) => !found.has(r.id));
  const pool = fresh.length ? fresh : CONFIG.relics;
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

/** @param {Player} player */
function forge(player) {
  const cost = get("shardsPerForge");
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

/** @param {Player} player @param {boolean} atSmith opened from a relicsmith */
async function showRelics(player, atSmith) {
  if (!player.isValid) return;
  const on = relicsOn(player);
  for (const id of on) {
    const def = relics.get(id);
    if (def) markFound(player, def);
  }
  const found = foundOf(player);
  const cost = get("shardsPerForge");
  const shards = countShards(player.getComponent("minecraft:inventory")?.container);
  const canForge = atSmith || get("forgeAnywhere") === true;
  /** @type {string[]} */
  const lines = [`Relics found: ${found.size} of ${relics.size}`];
  for (const def of CONFIG.relics) {
    if (!found.has(def.id)) continue;
    const rarity = RARITY[def.rarity] ?? RARITY.common;
    lines.push(
      `${rarity.color}${def.name} §7(${rarity.label})${on.has(def.id) ? "" : " §8- not with you"}§r\n§f${def.ability}${def.cooldown > 0 ? ` §7(cooldown ${def.cooldown}s)` : ""}\n§8${WHERE[def.where] ?? ""}`,
    );
  }
  /** @type {Record<string, number>} */
  const missing = {};
  for (const def of CONFIG.relics) if (!found.has(def.id)) missing[def.rarity] = (missing[def.rarity] ?? 0) + 1;
  const rest = Object.entries(missing).map(([r, n]) => `${n} ${RARITY[/** @type {keyof RARITY} */ (r)]?.label.toLowerCase() ?? r}`);
  if (rest.length) lines.push(`§7Still to find: ${rest.join(", ")}`);
  lines.push(
    canForge
      ? `§fYou have ${shards} Relic Shard${shards === 1 ? "" : "s"}. Forging a relic takes ${cost}.`
      : `§7Bring ${cost} Relic Shards to a relicsmith to forge a relic. You have ${shards}.`,
  );
  const form = new ActionFormData().title(atSmith ? "§lRelic forge" : "§lRelics").body(lines.join("\n\n"));
  if (canForge) form.button(`Forge a relic\n§8${cost} Relic Shards`);
  form.button("Close");
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return;
    const res = await form.show(player);
    if (res.canceled && res.cancelationReason === FormCancelationReason.UserBusy) {
      await new Promise((r) => system.runTimeout(() => r(undefined), 20));
      continue;
    }
    if (!res.canceled && canForge && res.selection === 0) forge(player);
    return;
  }
}

// ---------------------------------------------------------------------------
// Script events: gifts from other packs, the storm cell, townsfolk
// ---------------------------------------------------------------------------

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:relic_give" && id !== "realm:shard_give" && id !== "realm:storm_cell" && id !== "realm:npc_talk" && id !== "realm:npc_choose") return;
    /** @type {any} */
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return; // not ours to fix
    }
    if (!msg || typeof msg !== "object") return;
    try {
      if (id === "realm:storm_cell") {
        if (typeof msg.dim === "string" && Number.isFinite(msg.x) && Number.isFinite(msg.z)) {
          const strength = Math.max(1, Math.min(10, Math.round(Number(msg.strength) || 1)));
          cell = { dim: msg.dim.includes(":") ? msg.dim : `minecraft:${msg.dim}`, x: msg.x, z: msg.z, strength, tick: system.currentTick };
        } else cell = undefined;
        return;
      }
      if (id === "realm:npc_talk") {
        if (Array.isArray(msg.roles) && msg.roles.includes(CONFIG.npcRole) && typeof msg.req === "string") {
          system.sendScriptEvent("realm:npc_offer", JSON.stringify({ req: msg.req, pack: "relics_bp", key: "forge", label: "Relic forge", order: 40 }));
        }
        return;
      }
      if (typeof msg.player !== "string" || msg.player.length > 64) return;
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

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerEnum("realm:relic_id", CONFIG.relics.map((r) => r.id));
  customCommandRegistry.registerCommand(
    {
      name: "realm:relics",
      description: "Relics: the relics you've found, what they do, and the forge",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => showRelics(player, false).catch((e) => console.warn(`[relics] ${e}`)));
      return { status: CustomCommandStatus.Success };
    },
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
