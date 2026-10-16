import { CommandPermissionLevel, CustomCommandStatus, Dimension, Entity, ItemStack, Player, WeatherType, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, getFor, setFor } from "./settings.js";

const PACK = "fishing_bp";
const PROP_WEATHER = "fishing:weather"; // world: overworld weather from the last change; scripts can't read the current weather
const PROP_RAIN_END = "fishing:rainEnd"; // world: when rain last stopped (ms), for `afterRain` species
const PROP_LOG = "fishing:log"; // player: JSON { [speciesId]: [count, best cm] }
const PROP_RECORDS = "fishing:records"; // world: JSON { [speciesId]: [cm, name, player id, ms] }
const PROP_TOURNEY = "fishing:tourney"; // world: JSON of the running tournament (see Tourney)
const PROP_TMETA = "fishing:tmeta"; // world: JSON { last, warned }: the scheduled starts already handled
const PROP_OWED = "fishing:owed"; // world: JSON { [player id]: [crowns, note] }: prizes for players who were offline
const OVERWORLD = "minecraft:overworld";
const FISH_ITEMS = new Set(["minecraft:cod", "minecraft:salmon", "minecraft:tropical_fish", "minecraft:pufferfish"]);
const MINUTE = 60000;
const HOUR = 3600000;
const DAY = 86400000;
const WEEK = 7 * DAY;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PLACES = ["1st", "2nd", "3rd"];

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("./config.js").Species} Species */
/** @typedef {typeof CONFIG.rarities[number]} RarityInfo */
/** @typedef {Record<string, [number, number]>} Log species id -> [times caught, best cm] */
/** @typedef {Record<string, [number, string, string, number]>} Records species id -> [cm, catcher's name, catcher's id, when] */
/** @typedef {[number, string, string, number, number]} Entry relative size (cm / species max), name, species name, cm, when */
/** @typedef {{ s: number, e: number, en: Record<string, Entry> }} Tourney start, end (ms) and each player's best fish */

const species = CONFIG.species;
const byId = new Map(species.map((s) => [s.id, s]));
const byName = new Map(species.map((s) => [s.name, s]));
const rarities = new Map(CONFIG.rarities.map((r) => [r.id, r]));
const rarityOrder = (/** @type {string} */ id) => CONFIG.rarities.findIndex((r) => r.id === id);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** 12345 -> "12,345". @param {number} n */
const fmt = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
/** @param {string} id @returns {Player | undefined} */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);
const isOp = (/** @type {Player} */ player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
/** "a Storm Eel", "an Ember Salmon". @param {string} name */
const article = (name) => (/^[AEIOU]/i.test(name) ? "an" : "a");
/** @param {Species} sp */
const colorOf = (sp) => rarities.get(sp.rarity)?.color ?? "§f";
/** @param {Species} sp */
const rarityLabel = (sp) => rarities.get(sp.rarity)?.label ?? sp.rarity;
/** "Oct 10, 2026" (UTC). @param {number} ms */
function dateText(ms) {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
/** "2d 5h", "1h 20m", "12m". @param {number} ms */
function until(ms) {
  const m = Math.max(1, Math.ceil(ms / MINUTE));
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/** Sends a cross-pack script event (see the build spec's contracts). @param {string} id @param {object} data */
function send(id, data) {
  try {
    system.sendScriptEvent(id, JSON.stringify(data));
  } catch (e) {
    console.warn(`[fishing] ${id}: ${e}`);
  }
}

/** @param {string} key @returns {any} parsed JSON, or undefined */
function loadWorld(key) {
  try {
    const raw = world.getDynamicProperty(key);
    return typeof raw === "string" ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}
/** @param {string} key @param {unknown} value undefined clears it */
function saveWorld(key, value) {
  try {
    world.setDynamicProperty(key, value === undefined ? undefined : JSON.stringify(value));
  } catch (e) {
    console.warn(`[fishing] save ${key}: ${e}`);
  }
}

// Crowns: the shared `crowns` scoreboard (the Crowns pack shows balances; any pack may pay).
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
/** @param {Player} p @param {number} n */
function addCrowns(p, n) {
  try {
    crownsObjective().addScore(p, Math.floor(n));
    return true;
  } catch (e) {
    console.warn(`[fishing] crowns: ${e}`);
    return false;
  }
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

// ---------------------------------------------------------------------------
// Weather (tracked, since scripts can't read it) and time of day
// ---------------------------------------------------------------------------

/** @type {string} */
let weather = WeatherType.Clear;
let rainEnd = 0;

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather }) => {
  if (dimension !== OVERWORLD && dimension !== "overworld") return; // BDS 1.26 sends "overworld"
  if (newWeather === WeatherType.Clear && weather !== WeatherType.Clear) {
    rainEnd = Date.now();
    try {
      world.setDynamicProperty(PROP_RAIN_END, rainEnd);
    } catch (e) {
      console.warn(`[fishing] ${e}`);
    }
  }
  weather = newWeather;
  try {
    world.setDynamicProperty(PROP_WEATHER, newWeather);
  } catch (e) {
    console.warn(`[fishing] ${e}`);
  }
});

/** "dawn" 23000-1000, "day" to 11500, "dusk" to 13500, then "night" (game ticks; 1000 is /time set day). */
function timeOfDay() {
  const t = world.getTimeOfDay();
  if (t >= 23000 || t < 1000) return "dawn";
  if (t < 11500) return "day";
  if (t < 13500) return "dusk";
  return "night";
}

// ---------------------------------------------------------------------------
// Where the bobber is: a guess from the blocks around it (biomes can't be read)
// ---------------------------------------------------------------------------

const WATERY = /water|seagrass|kelp|bubble_column/;
const FROZEN = /ice|snow/;
const SWAMPY = /waterlily|mangrove|^minecraft:mud$/;
const JUNGLY = /jungle|bamboo|cocoa/;
const DIRS = Array.from({ length: 12 }, (_, i) => ({ x: Math.cos((i * Math.PI) / 6), z: Math.sin((i * Math.PI) / 6) }));

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

/**
 * The places that describe the water at `at` (about 100 block reads, once per catch).
 * @param {Dimension} dim @param {Vector3} at @returns {Set<string>}
 */
function placesAt(dim, at) {
  /** @type {Set<string>} */
  const places = new Set();
  // The water surface: the bobber floats in the top water block, or just above it.
  let y = Math.floor(at.y);
  let b = blockAt(dim, at.x, y, at.z);
  if (!b || !WATERY.test(b.typeId)) {
    const below = blockAt(dim, at.x, y - 1, at.z);
    if (!below || !WATERY.test(below.typeId)) return places;
    y--;
  } else {
    for (let i = 0; i < 6; i++) {
      const up = blockAt(dim, at.x, y + 1, at.z);
      if (!up || !WATERY.test(up.typeId)) break;
      y++;
    }
  }
  const top = topAt(dim, at.x, at.z);
  if (y < CONFIG.caveBelowY && top && top.location.y > y + 2) places.add("cave");

  let water = 0;
  let seen = 0;
  for (const d of DIRS) {
    for (const r of [4, 8, 12, 16]) {
      const x = at.x + d.x * r;
      const z = at.z + d.z * r;
      const here = blockAt(dim, x, y, z);
      if (!here) continue;
      seen++;
      if (WATERY.test(here.typeId)) water++;
      if (FROZEN.test(here.typeId)) places.add("frozen");
      if (SWAMPY.test(here.typeId)) places.add("swamp");
      if (r <= 8) {
        const above = blockAt(dim, x, y + 1, z);
        if (above && FROZEN.test(above.typeId)) places.add("frozen");
        if (above && SWAMPY.test(above.typeId)) places.add("swamp");
      }
    }
  }
  if (seen) places.add(water / seen >= get("oceanShare") ? "ocean" : "river");
  // Trees and ground cover nearby (not in caves: the topmost block there is the surface far above).
  if (!places.has("cave")) {
    for (let i = 0; i < DIRS.length; i += 2) {
      for (const r of [6, 12]) {
        const t = topAt(dim, at.x + DIRS[i].x * r, at.z + DIRS[i].z * r);
        if (!t) continue;
        if (FROZEN.test(t.typeId)) places.add("frozen");
        if (SWAMPY.test(t.typeId)) places.add("swamp");
        if (JUNGLY.test(t.typeId)) places.add("jungle");
      }
    }
  }
  return places;
}

/**
 * The species that can bite this catch right here, right now.
 * @param {string} item @param {Dimension} dim @param {Vector3} at @returns {Species[]}
 */
function eligible(item, dim, at) {
  const places = placesAt(dim, at);
  const time = timeOfDay();
  const w = dim.id === OVERWORLD ? weather : WeatherType.Clear;
  const sinceRain = w === WeatherType.Clear && rainEnd > 0 ? Date.now() - rainEnd : Infinity;
  return species.filter(
    (sp) =>
      sp.item === item &&
      rarities.has(sp.rarity) &&
      (!sp.weather || sp.weather.includes(/** @type {any} */ (w))) &&
      (!sp.time || sp.time.includes(/** @type {any} */ (time))) &&
      (!sp.places || sp.places.some((p) => places.has(p))) &&
      (sp.afterRain === undefined || sinceRain <= sp.afterRain * MINUTE),
  );
}

/** Rarities Lucky Line (a Hearthkeeper talent, Skills) makes bite more often. */
const LUCKY = new Set(["rare", "epic", "legendary"]);

/** A weighted pick by rarity; `lucky` percent more weight for rare, epic and legendary fish. @param {Species[]} list @param {number} [lucky] */
function pick(list, lucky = 0) {
  const weightOf = (/** @type {Species} */ sp) => Math.max(0, rarities.get(sp.rarity)?.weight ?? 0) * (lucky > 0 && LUCKY.has(sp.rarity) ? 1 + lucky / 100 : 1);
  const total = list.reduce((n, sp) => n + weightOf(sp), 0);
  if (total <= 0) return list[0];
  let roll = Math.random() * total;
  for (const sp of list) {
    roll -= weightOf(sp);
    if (roll < 0) return sp;
  }
  return list[list.length - 1];
}

/** A size in whole cm, skewed small so near-record fish are rare. @param {Species} sp */
function rollSize(sp) {
  const lo = Math.max(1, Math.min(sp.min, sp.max));
  const hi = Math.max(lo, sp.max);
  return Math.max(1, Math.round(lo + (hi - lo) * Math.random() ** 1.6));
}

/** Average size of a species in whole cm, used on stackable species items. @param {Species} sp */
function avgSize(sp) {
  const lo = Math.max(1, Math.min(sp.min, sp.max));
  const hi = Math.max(lo, sp.max);
  return Math.max(1, Math.round((lo + hi) / 2));
}

/** Every fish of a species has identical lore, so they stack. @param {Species} sp @param {number} [amount] */
function fishStack(sp, amount = 1) {
  const stack = new ItemStack(sp.item, Math.max(1, amount));
  stack.nameTag = `§r${colorOf(sp)}${sp.name}`;
  stack.setLore([`§7${avgSize(sp)} cm`, `§7${rarityLabel(sp)} catch`]);
  return stack;
}

/**
 * A fish this pack made, from its name and lore (an anvil can rename an item but can't add lore).
 * @param {ItemStack | undefined} stack @returns {{ sp: Species, size: number } | undefined}
 */
function readFish(stack) {
  if (!stack || !FISH_ITEMS.has(stack.typeId) || !stack.nameTag) return undefined;
  const m = /^§r§.(.+)$/.exec(stack.nameTag);
  const sp = m ? byName.get(m[1]) : undefined;
  if (!sp || sp.item !== stack.typeId) return undefined;
  const lore = stack.getLore();
  const size = /^§7(\d+) cm$/.exec(lore[0] ?? "");
  const line1 = lore[1] ?? "";
  // Species stacks end in " catch"; fish caught before 1.1.4 carry "Caught by <name>".
  if (!size || (!line1.startsWith("§7Caught by ") && !line1.endsWith(" catch"))) return undefined;
  return { sp, size: Number(size[1]) };
}

/**
 * Upgrades any legacy per-catch fish in the player's inventory to canonical stackable species lore
 * and merges split stacks of the same species into full stacks of up to 64.
 * @param {Player} player @returns {number} number of fish consolidated
 */
function mergeSpeciesStacks(player) {
  const inv = inventoryOf(player);
  if (!inv) return 0;
  /** @type {Map<string, { sp: Species, slots: number[], amounts: number[], total: number, legacy: boolean }>} */
  const groups = new Map();
  for (let slot = 0; slot < inv.size; slot++) {
    const stack = inv.getItem(slot);
    const f = readFish(stack);
    if (!stack || !f) continue;
    let g = groups.get(f.sp.id);
    if (!g) {
      g = { sp: f.sp, slots: [], amounts: [], total: 0, legacy: false };
      groups.set(f.sp.id, g);
    }
    g.slots.push(slot);
    g.amounts.push(stack.amount);
    g.total += stack.amount;
    const lore = stack.getLore();
    const isCanonical = lore.length === 2 && lore[0] === `§7${avgSize(f.sp)} cm` && lore[1] === `§7${rarityLabel(f.sp)} catch`;
    if (!isCanonical) g.legacy = true;
  }
  let merged = 0;
  for (const g of groups.values()) {
    const packed = !g.legacy && g.slots.length === Math.ceil(g.total / 64) && g.amounts.slice(0, -1).every((a) => a === 64);
    if (packed) continue;
    for (const s of g.slots) inv.setItem(s, undefined);
    let left = g.total;
    let idx = 0;
    while (left > 0) {
      const amt = Math.min(64, left);
      left -= amt;
      const stack = fishStack(g.sp, amt);
      const targetSlot = g.slots[idx++];
      if (targetSlot !== undefined) inv.setItem(targetSlot, stack);
      else {
        const rest = inv.addItem(stack);
        if (rest) player.dimension.spawnItem(rest, player.location);
      }
    }
    merged += g.total;
  }
  return merged;
}

/** Crowns a fisher pays for one fish: the rarity's price x (0.5 + size / the species' biggest). @param {Species} sp @param {number} size */
const priceOf = (sp, size) => Math.max(1, Math.round((rarities.get(sp.rarity)?.price ?? 1) * (0.5 + Math.min(1, size / Math.max(1, sp.max)))));

// ---------------------------------------------------------------------------
// Logs and records
// ---------------------------------------------------------------------------

/** @type {Map<string, Log>} */
const logs = new Map();
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  logs.delete(playerId);
  lastNpc.delete(playerId);
});

/** @param {Player} player @returns {Log} */
function logOf(player) {
  let log = logs.get(player.id);
  if (log) return log;
  log = {};
  try {
    const raw = player.getDynamicProperty(PROP_LOG);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : undefined;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) log = parsed;
  } catch {
    // corrupt: start a new log
  }
  logs.set(player.id, /** @type {Log} */ (log));
  return /** @type {Log} */ (log);
}

/** @type {Records | undefined} */
let records;
/** @returns {Records} */
function recordsOf() {
  if (!records) {
    const r = loadWorld(PROP_RECORDS);
    records = r && typeof r === "object" && !Array.isArray(r) ? r : {};
  }
  return /** @type {Records} */ (records);
}

/**
 * Whether a catch would be a new species, a personal best or a realm record for this player.
 * @param {Player} player @param {Species} sp @param {number} size
 */
function notable(player, sp, size) {
  const before = logOf(player)[sp.id];
  const rec = recordsOf()[sp.id];
  return !before || size > before[1] || !rec || size > rec[0];
}

/** Records the catch and tells the player. @param {Player} player @param {Species} sp @param {number} size */
function caught(player, sp, size) {
  const log = logOf(player);
  const before = log[sp.id];
  const first = !before;
  const best = !!before && size > before[1];
  log[sp.id] = [(before?.[0] ?? 0) + 1, Math.max(before?.[1] ?? 0, size)];
  try {
    player.setDynamicProperty(PROP_LOG, JSON.stringify(log));
  } catch (e) {
    console.warn(`[fishing] log: ${e}`);
  }

  const recs = recordsOf();
  const rec = recs[sp.id];
  const record = !rec || size > rec[0];
  if (record) {
    recs[sp.id] = [size, player.name, player.id, Date.now()];
    saveWorld(PROP_RECORDS, recs);
  }

  const place = enterTournament(player, sp, size);
  const known = Object.keys(log).filter((id) => byId.has(id)).length;
  let line = `§bYou caught ${article(sp.name)} ${colorOf(sp)}${sp.name}§b (${size} cm)!`;
  if (record) line += " §6New realm record!";
  else if (best) line += " §aPersonal best!";
  if (first) line += ` §eNew species for your log (${known}/${species.length}).`;
  if (place) line += ` §d(Tournament: ${place})`;
  player.sendMessage(line);
  if (record || first) player.playSound("random.levelup", { pitch: 1.3, volume: 0.6 });

  if (sp.rarity === "legendary" && get("announceLegendary") === true) {
    for (const p of world.getAllPlayers()) if (p.id !== player.id) p.sendMessage(`§6${player.name} caught a legendary ${sp.name} (${size} cm)!`);
  }
  if (sp.rarity === "legendary") send("realm:gossip", { kind: "fish_legendary", player: player.id, name: player.name, place: sp.name }); // Townsfolk gossip
  send("realm:journal", { player: player.id, page: "fish", entry: sp.id, label: sp.name });
  send("realm:skill_xp", { player: player.id, skill: "fishing", amount: rarities.get(sp.rarity)?.xp ?? 0 });
}

// ---------------------------------------------------------------------------
// Catches: a hook belongs to the player nearest to where it appears; an item that appears where a
// hook just was is that player's catch (as Daily Quests recognizes it: there is no fishing event).
// ---------------------------------------------------------------------------

/** @type {Map<string, { hook: Entity, owner: Player, dim: string, at: Vector3, seen: number }>} */
const hooks = new Map();

/** The player who cast a hook: the projectile's owner when the game says, else the nearest player. @param {Entity} hook */
function hookOwner(hook) {
  try {
    const owner = hook.getComponent("minecraft:projectile")?.owner;
    if (owner instanceof Player) return owner;
  } catch {
    // no projectile component on this hook
  }
  const [near] = hook.dimension.getPlayers({ location: hook.location, maxDistance: 4, closest: 1 });
  return near;
}

/** A dropped item appears at the dropping player's head: such an item is never a catch. @param {Entity} item */
function droppedByPlayer(item) {
  const at = item.location;
  for (const p of item.dimension.getPlayers({ location: at, maxDistance: 3 })) {
    try {
      const head = p.getHeadLocation();
      if (Math.abs(head.x - at.x) <= 1 && Math.abs(head.y - at.y) <= 1 && Math.abs(head.z - at.z) <= 1) return true;
    } catch {
      // gone
    }
  }
  return false;
}

world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  try {
    if (entity.typeId === "minecraft:fishing_hook") {
      const owner = hookOwner(entity);
      if (owner) hooks.set(entity.id, { hook: entity, owner, dim: entity.dimension.id, at: entity.location, seen: system.currentTick });
      return;
    }
    if (entity.typeId !== "minecraft:item" || !hooks.size) return;
    const stack = entity.getComponent("minecraft:item")?.itemStack;
    // A catch is one unnamed fish (our own replacements are named). A stack of several, or a fish a player
    // drops near their bobber (it appears at their head), is never a catch.
    if (!stack || stack.nameTag || !FISH_ITEMS.has(stack.typeId) || stack.amount !== 1) return;
    if (droppedByPlayer(entity)) return;
    const at = entity.location;
    for (const [id, h] of hooks) {
      if (h.dim !== entity.dimension.id) continue;
      if (Math.abs(h.at.x - at.x) > 2 || Math.abs(h.at.y - at.y) > 2 || Math.abs(h.at.z - at.z) > 2) continue;
      // The catch appears as the hook is reeled in: the hook must be gone now or within a few ticks. An item
      // that turns up next to a hook that stays in the water (a fish mob killed by the bobber) isn't a catch.
      if (!h.hook.isValid && system.currentTick - h.seen > 3) continue;
      if (get("enabled") !== true) return;
      const owner = h.owner;
      const hookAt = h.at;
      const hook = h.hook;
      let waited = 0;
      // From the next tick, so every other pack's entitySpawn listener (Daily Quests counts fish) sees the vanilla item first.
      const check = () => {
        try {
          if (hook.isValid) {
            if (++waited <= 3) system.run(check);
            return; // the hook is still out: not a catch
          }
          if (!hooks.has(id)) return; // another item already took this catch
          hooks.delete(id);
          replace(entity, owner, hookAt);
        } catch (e) {
          console.warn(`[fishing] catch: ${e}`);
        }
      };
      system.run(check);
      return;
    }
  } catch (e) {
    console.warn(`[fishing] ${e}`);
  }
});

/**
 * Swaps the vanilla fish for a species: a new item where it is, flying the same way, and the old one removed.
 * @param {Entity} entity @param {Player} owner @param {Vector3} hookAt
 */
function replace(entity, owner, hookAt) {
  if (!entity.isValid || !owner.isValid) return;
  const stack = entity.getComponent("minecraft:item")?.itemStack;
  if (!stack || !FISH_ITEMS.has(stack.typeId) || stack.nameTag || stack.amount !== 1) return;
  const dim = entity.dimension;
  const list = eligible(stack.typeId, dim, hookAt);
  if (!list.length) return; // no species for this item here: the vanilla fish stays
  const sp = pick(list, Math.min(200, callingValue(owner, "luckyLine")));
  const size = rollSize(sp);
  // A player who doesn't want measured fish (or only notable ones) keeps the vanilla fish: it stacks. The catch still counts.
  const plain = getFor(owner, "measure") !== true || (getFor(owner, "notableOnly") === true && !notable(owner, sp, size));
  if (plain) {
    caught(owner, sp, size);
    return;
  }
  const fish = fishStack(sp, 1);
  const loc = entity.location;
  let vel = { x: 0, y: 0, z: 0 };
  try {
    vel = entity.getVelocity();
  } catch {
    // keep zero
  }
  const made = dim.spawnItem(fish, loc); // throws in an unloaded chunk: then the vanilla fish stays
  try {
    entity.remove();
  } catch (e) {
    // The vanilla fish couldn't be removed: take the new one back, so there's never one fish too many.
    try {
      made.remove();
    } catch {
      // nothing more to do
    }
    throw e;
  }
  try {
    made.clearVelocity();
    made.applyImpulse(vel);
  } catch {
    // it still drops where the fish was
  }
  caught(owner, sp, size);
  // Once the fish has flown into the inventory, merge it with the species' other stacks.
  system.runTimeout(() => {
    try {
      if (owner.isValid) mergeSpeciesStacks(owner);
    } catch {
      // the player left or the inventory is unavailable
    }
  }, 15);
}

// Follow live hooks every tick (a catch must appear as its hook goes), and forget them a second after they're gone.
system.runInterval(() => {
  if (!hooks.size) return;
  for (const [id, h] of hooks) {
    if (h.hook.isValid) {
      try {
        h.at = h.hook.location;
        h.seen = system.currentTick;
      } catch {
        // unloaded
      }
    } else if (system.currentTick - h.seen > 20) hooks.delete(id);
  }
}, 1);

// ---------------------------------------------------------------------------
// The weekly tournament
// ---------------------------------------------------------------------------

/** @type {Tourney | undefined} */
let tourney;
/** @type {{ last: number, warned: number }} */
let tmeta = { last: 0, warned: 0 };

const lengthMs = () => Math.max(1, get("tournamentMinutes")) * MINUTE;

/** The start of the scheduled tournament that is running now, or else the next one (ms). @param {number} now */
function scheduledStart(now) {
  const d = new Date(now);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  let s = midnight + ((get("tournamentDay") - d.getUTCDay() + 7) % 7) * DAY + get("tournamentHourUtc") * HOUR;
  if (s > now && s - WEEK + lengthMs() > now) s -= WEEK; // last week's is still on (it runs past midnight)
  else if (s + lengthMs() <= now) s += WEEK; // today's is over
  return s;
}

/** Players ranked by their best fish. @param {Tourney} t @returns {[string, Entry][]} */
const ranking = (t) => Object.entries(t.en).sort((a, b) => b[1][0] - a[1][0] || a[1][4] - b[1][4]);

/** "1st", ..., "7th". @param {number} i 0-based */
const placeName = (i) => PLACES[i] ?? `${i + 1}th`;

/** @param {number} end */
function startTournament(end) {
  const now = Date.now();
  tourney = { s: now, e: end, en: {} };
  saveWorld(PROP_TOURNEY, tourney);
  const prizes = CONFIG.tournamentPrizes.filter((n) => n > 0);
  const minutes = Math.max(1, Math.round((end - now) / MINUTE));
  const text = `The fishing tournament has begun! Catch the biggest fish for its kind in the next ${minutes} minutes.`;
  world.sendMessage(`§b[Fishing] ${text}${prizes.length ? ` §7Prizes: ${prizes.join(", ")} Crowns.` : ""}`);
  for (const p of world.getAllPlayers()) p.playSound("note.bell", { pitch: 1.2, volume: 0.8 });
  send("realm:sky_event", { kind: "tournament", text });
}

function finishTournament() {
  const t = tourney;
  if (!t) return;
  tourney = undefined;
  saveWorld(PROP_TOURNEY, undefined);
  const ranked = ranking(t);
  if (!ranked.length) {
    world.sendMessage("§b[Fishing] The tournament is over. Nobody caught a fish this time.");
    return;
  }
  /** @type {string[]} */
  const lines = ["§b[Fishing] The tournament is over! Results:"];
  ranked.slice(0, Math.max(3, CONFIG.tournamentPrizes.length)).forEach(([id, e], i) => {
    const prize = Math.max(0, Math.floor(CONFIG.tournamentPrizes[i] ?? 0));
    lines.push(`§6${placeName(i)} §f${e[1]} §7- ${e[2]}, ${e[3]} cm (${Math.round(e[0] * 100)}% of the biggest)${prize ? ` §6+${prize} Crowns` : ""}`);
    if (prize) pay(id, prize, `Fishing tournament: ${placeName(i)} place`, `tournament_${t.s}`);
  });
  world.sendMessage(lines.join("\n"));
}

/**
 * Pays a prize now, or when the player next joins.
 * @param {string} id @param {number} crowns @param {string} note @param {string} questId
 */
function pay(id, crowns, note, questId) {
  const player = online(id);
  if (player && addCrowns(player, crowns)) {
    player.sendMessage(`§6+${crowns} Crowns §7(${note})`);
    send("realm:quest_done", { player: id, pack: PACK, id: questId, label: note, kind: "tournament" });
    return;
  }
  const owed = loadWorld(PROP_OWED) ?? {};
  const prev = Array.isArray(owed[id]) ? owed[id] : [0, ""];
  owed[id] = [(Number(prev[0]) || 0) + crowns, note, questId];
  saveWorld(PROP_OWED, owed);
}

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  system.runTimeout(() => {
    try {
      const owed = loadWorld(PROP_OWED);
      const due = owed?.[player.id];
      if (!player.isValid || !Array.isArray(due)) return;
      delete owed[player.id];
      saveWorld(PROP_OWED, Object.keys(owed).length ? owed : undefined);
      if (addCrowns(player, due[0])) {
        player.sendMessage(`§6+${due[0]} Crowns §7(${due[1]})`);
        send("realm:quest_done", { player: player.id, pack: PACK, id: String(due[2] ?? "tournament"), label: String(due[1]), kind: "tournament" });
      }
    } catch (e) {
      console.warn(`[fishing] owed: ${e}`);
    }
  }, 100);
});

/**
 * Enters a catch in the running tournament; returns the player's place, or undefined when none is running.
 * @param {Player} player @param {Species} sp @param {number} size
 */
function enterTournament(player, sp, size) {
  const t = tourney;
  if (!t || Date.now() >= t.e) return undefined;
  const rel = Math.min(1, size / Math.max(1, sp.max));
  const prev = t.en[player.id];
  if (!prev || rel > prev[0]) {
    t.en[player.id] = [Math.round(rel * 1000) / 1000, player.name, sp.name, size, Date.now()];
    saveWorld(PROP_TOURNEY, t);
  }
  return placeName(ranking(t).findIndex(([id]) => id === player.id));
}

/** One line about the tournament: running (with the leader) or the next one. */
function tournamentStatus() {
  const now = Date.now();
  if (tourney) {
    const [lead] = ranking(tourney);
    return `§bTournament on! §7Ends in ${until(tourney.e - now)}.${lead ? ` Leader: ${lead[1][1]} (${lead[1][2]}, ${lead[1][3]} cm)` : " No fish yet."}`;
  }
  if (get("tournamentEnabled") !== true) return "§7No weekly tournament on this realm.";
  const s = scheduledStart(now);
  return `§7Next tournament: ${DAYS[get("tournamentDay")] ?? "?"} at ${String(get("tournamentHourUtc")).padStart(2, "0")}:00 UTC (in ${until(s - now)}).`;
}

world.afterEvents.worldLoad.subscribe(() => {
  const w = world.getDynamicProperty(PROP_WEATHER);
  if (w === WeatherType.Rain || w === WeatherType.Thunder) weather = w;
  const r = world.getDynamicProperty(PROP_RAIN_END);
  if (typeof r === "number") rainEnd = r;
  const t = loadWorld(PROP_TOURNEY);
  if (t && typeof t.s === "number" && typeof t.e === "number" && t.en && typeof t.en === "object") tourney = t;
  const m = loadWorld(PROP_TMETA);
  if (m && typeof m.last === "number" && typeof m.warned === "number") tmeta = m;
  loaded = true;
});

let loaded = false;
// The tournament clock: start, warn and finish on schedule (checked every 5 seconds, once the saved state is read).
system.runInterval(() => {
  if (!loaded) return;
  try {
    clock();
  } catch (e) {
    console.warn(`[fishing] tournament: ${e}`);
  }
}, 100);

function clock() {
  const now = Date.now();
  if (tourney) {
    if (now >= tourney.e) finishTournament();
    return;
  }
  if (get("tournamentEnabled") !== true) return;
  const s = scheduledStart(now);
  const warn = Math.max(0, CONFIG.tournamentWarnMinutes) * MINUTE;
  if (now >= s && tmeta.last !== s) {
    tmeta.last = s;
    saveWorld(PROP_TMETA, tmeta);
    startTournament(s + lengthMs());
  } else if (now < s && warn > 0 && now >= s - warn && tmeta.warned !== s) {
    tmeta.warned = s;
    saveWorld(PROP_TMETA, tmeta);
    world.sendMessage(`§b[Fishing] §7A fishing tournament starts in ${until(s - now)}! Grab a rod. The biggest fish for its kind wins.`);
  }
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

/** What the player knows about an uncaught species: its rarity and when and where it bites. @param {Species} sp */
function hint(sp) {
  /** @type {string[]} */
  const parts = [];
  if (sp.weather) parts.push(sp.weather.map((w) => (w === "Thunder" ? "thunderstorms" : w === "Rain" ? "rain" : "clear skies")).join(" or "));
  if (sp.time) parts.push(sp.time.join(" or "));
  if (sp.places) parts.push(sp.places.map((p) => (p === "cave" ? "caves" : p === "frozen" ? "frozen water" : p === "river" ? "rivers and lakes" : p === "swamp" ? "swamps" : p)).join(" or "));
  if (sp.afterRain !== undefined) parts.push(`just after rain`);
  return `${rarityLabel(sp)}${parts.length ? `: ${parts.join(", ")}` : ""}`;
}

const sorted = () => [...species].sort((a, b) => rarityOrder(a.rarity) - rarityOrder(b.rarity) || a.name.localeCompare(b.name));

/** /realm:fishing_log (and the first button of /realm:fishing): the player's fish log. @param {Player} player */
async function showLog(player) {
  const log = logOf(player);
  const known = species.filter((sp) => log[sp.id]);
  const total = known.reduce((n, sp) => n + (log[sp.id]?.[0] ?? 0), 0);
  const lines = sorted().map((sp) => {
    const e = log[sp.id];
    return e ? `${colorOf(sp)}${sp.name} §7x${fmt(e[0])}, best ${e[1]} cm` : `§8??? §7(${hint(sp)})`;
  });
  const body = [`Species caught: §e${known.length}/${species.length}§r   Fish caught: §e${fmt(total)}`, tournamentStatus(), "", ...lines].join("\n");
  const form = new ActionFormData().title("§lFish Log").body(body).button("Realm records").button("Close");
  const res = await show(player, form);
  if (res && !res.canceled && res.selection === 0) await showRecords(player);
}

/** /realm:fishing_top: the biggest fish of each species on the realm. @param {Player} player @param {string} [title] */
async function showRecords(player, title = "§lRealm Fish Records") {
  const recs = recordsOf();
  const lines = sorted()
    .filter((sp) => recs[sp.id])
    .map((sp) => {
      const r = recs[sp.id];
      return `${colorOf(sp)}${sp.name}§r: ${r[0]} cm §7by ${r[1]}, ${dateText(r[3])}`;
    });
  const body = [tournamentStatus(), "", lines.length ? `Records for ${lines.length} of ${species.length} species:` : "No records yet. Go fishing!", ...lines].join("\n");
  await show(player, new ActionFormData().title(title).body(body).button("Close"));
}

/** @param {Player} player */
function inventoryOf(player) {
  return player.getComponent("minecraft:inventory")?.container;
}

// Townsfolk (Hearth & Hearsay): Tobin pays his friends more for their fish. realm:affinity gives the percent (`off`) with
// tobin, on a level change and when the player joins; kept in memory only.
/** @type {Map<string, number>} player id -> percent */
const tobinOff = new Map();
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:affinity") return;
    try {
      const m = JSON.parse(message);
      if (!m || typeof m.player !== "string") return;
      if (m.all && typeof m.all === "object") tobinOff.set(m.player, Number(m.off?.tobin) || 0);
      else if (m.npc === "tobin") tobinOff.set(m.player, Number(m.off) || 0);
    } catch {
      // not ours
    }
  },
  { namespaces: ["realm"] },
);
/** @param {Player} player */
const tobinOffOf = (player) => Math.max(0, Math.min(50, tobinOff.get(player.id) ?? 0));

/** The player's fish that a fisher buys. @param {Player} player */
function fishFor(player) {
  /** @type {{ slot: number, stack: ItemStack, sp: Species, size: number, price: number }[]} */
  const out = [];
  const inv = inventoryOf(player);
  if (!inv) return out;
  for (let slot = 0; slot < inv.size; slot++) {
    const stack = inv.getItem(slot);
    const f = readFish(stack);
    if (stack && f) out.push({ slot, stack, sp: f.sp, size: f.size, price: Math.round(priceOf(f.sp, f.size) * stack.amount * (1 + tobinOffOf(player) / 100)) });
  }
  return out;
}

/**
 * Sells these slots if they still hold the same fish; returns [fish sold, Crowns].
 * @param {Player} player @param {{ slot: number, stack: ItemStack, price: number }[]} picks
 */
function sell(player, picks) {
  const inv = inventoryOf(player);
  if (!inv) return [0, 0];
  let n = 0;
  let crowns = 0;
  for (const p of picks) {
    const now = inv.getItem(p.slot);
    if (!now || !now.isStackableWith(p.stack) || now.amount !== p.stack.amount) continue; // moved or changed since the menu opened
    inv.setItem(p.slot, undefined);
    n += now.amount;
    crowns += p.price;
  }
  if (crowns > 0) {
    addCrowns(player, crowns);
    player.sendMessage(`§6+${fmt(crowns)} Crowns §7(Sold ${n} fish)`);
    player.playSound("random.orb", { pitch: 1.1 });
  }
  return [n, crowns];
}

/** The fisher's "Sell fish" menu. @param {Player} player */
async function sellMenu(player) {
  const title = lastNpc.get(player.id) ?? "§lSell Fish";
  mergeSpeciesStacks(player);
  for (let round = 0; round < 50; round++) {
    const fish = fishFor(player);
    if (!fish.length) {
      await show(player, new ActionFormData().title(title).body("You have no fish I can buy. Bring me fish you caught with a rod: the ones with a name and a size.").button("Goodbye"));
      return;
    }
    const total = fish.reduce((n, f) => n + f.price, 0);
    const count = fish.reduce((n, f) => n + f.stack.amount, 0);
    const shown = fish.slice(0, 30);
    const form = new ActionFormData()
      .title(title)
      .body(`You have ${count} fish worth ${fmt(total)} Crowns. Bigger and rarer fish pay more.`)
      .button(`Sell all\n§8${count} fish, ${fmt(total)} Crowns`);
    for (const f of shown) form.button(`${colorOf(f.sp)}${f.sp.name}§r ${f.size} cm${f.stack.amount > 1 ? ` x${f.stack.amount}` : ""}\n§8${fmt(f.price)} Crowns`);
    form.button("Goodbye");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
    if (res.selection === 0) {
      sell(player, fish);
      return;
    }
    const f = shown[res.selection - 1];
    if (!f) return;
    sell(player, [f]);
  }
}

// ---------------------------------------------------------------------------
// Stackable fish: measured fish (each with its own name and lore) don't stack. A player may turn them back into plain
// vanilla fish, which do. Logs and records were written when the fish was caught, so they stay.
// ---------------------------------------------------------------------------

/** The player's measured raw fish, slot by slot. @param {Player} player */
function measuredFish(player) {
  /** @type {{ slot: number, stack: ItemStack }[]} */
  const out = [];
  const inv = inventoryOf(player);
  if (!inv) return out;
  for (let slot = 0; slot < inv.size; slot++) {
    const stack = inv.getItem(slot);
    if (stack && readFish(stack)) out.push({ slot, stack });
  }
  return out;
}

/**
 * Turns every measured raw fish in the inventory into plain vanilla fish, merged into full stacks. Returns how many.
 * @param {Player} player
 */
function makeStackable(player) {
  const inv = inventoryOf(player);
  if (!inv) return 0;
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const { slot, stack } of measuredFish(player)) {
    counts.set(stack.typeId, (counts.get(stack.typeId) ?? 0) + stack.amount);
    inv.setItem(slot, undefined);
  }
  const converted = [...counts.values()].reduce((a, b) => a + b, 0);
  // Plain stacks of the same fish join in, so everything ends up in as few full stacks as possible.
  for (let slot = 0; slot < inv.size; slot++) {
    const stack = inv.getItem(slot);
    if (!stack || !counts.has(stack.typeId) || !stack.isStackableWith(new ItemStack(stack.typeId, 1))) continue;
    counts.set(stack.typeId, (counts.get(stack.typeId) ?? 0) + stack.amount);
    inv.setItem(slot, undefined);
  }
  for (const [typeId, count] of counts) {
    for (let left = count; left > 0; ) {
      const stack = new ItemStack(typeId, 1);
      stack.amount = Math.min(left, stack.maxAmount);
      left -= stack.amount;
      const rest = inv.addItem(stack); // the freed slots always fit them; anything over drops at the player's feet
      if (rest) player.dimension.spawnItem(rest, player.location);
    }
  }
  return converted;
}

/** "Make my fish stackable": asks first, then converts. @param {Player} player */
async function stackMenu(player) {
  mergeSpeciesStacks(player);
  const fish = measuredFish(player);
  const count = fish.reduce((n, f) => n + f.stack.amount, 0);
  if (!count) {
    await show(player, new ActionFormData().title("§lStackable Fish").body("You have no measured raw fish. Fish you catch with a name and a size can be turned into plain fish that stack.").button("Close"));
    return;
  }
  const body = [
    `Turn your ${count} measured raw fish into plain cod, salmon, tropical fish and pufferfish that stack?`,
    "",
    "§7They lose their names, sizes and catcher. Your fish log, personal bests and realm records keep them. A fisher only buys measured fish.",
  ].join("\n");
  const res = await show(player, new ActionFormData().title("§lStackable Fish").body(body).button(`Make ${count} fish stackable`).button("Cancel"));
  if (!res || res.canceled || res.selection !== 0 || !player.isValid) return;
  const n = makeStackable(player);
  if (n) {
    player.sendMessage(`§b${n} fish are plain now and stack.`);
    player.playSound("random.pop", { pitch: 1.2, volume: 0.6 });
  }
}

/** The player's fishing preferences (the same switches as /realm:prefs). @param {Player} player */
async function settingsMenu(player) {
  const measure = getFor(player, "measure") === true;
  const notableOnly = getFor(player, "notableOnly") === true;
  const form = new ModalFormData()
    .title("§lFishing Settings")
    .toggle("Measure my catches", { defaultValue: measure, tooltip: "Your fish carry their species, size and your name. Disabled: plain fish that stack (the catch still counts in your log)" })
    .toggle("Only measure notable catches", { defaultValue: notableOnly, tooltip: "A catch that isn't a new species, a personal best or a realm record comes as a plain fish that stacks" })
    .submitButton("Save");
  const res = await show(player, form);
  if (!res || res.canceled || !res.formValues || !player.isValid) return;
  const [m, n] = res.formValues;
  if (typeof m === "boolean" && m !== measure) setFor(player, "measure", m);
  if (typeof n === "boolean" && n !== notableOnly) setFor(player, "notableOnly", n);
  const state = (/** @type {string} */ key) => (getFor(player, key) === true ? "§aEnabled§7" : "§cDisabled§7");
  player.sendMessage(`§7Measure my catches: ${state("measure")}. Only measure notable catches: ${state("notableOnly")}.`);
}

/** /realm:fishing: every action of the pack. @param {Player} player */
async function mainMenu(player) {
  mergeSpeciesStacks(player);
  const measured = measuredFish(player).reduce((n, f) => n + f.stack.amount, 0);
  /** @type {[string, () => Promise<void> | void][]} */
  const actions = [
    ["Fish log\n§8Species caught and personal bests", () => showLog(player)],
    ["Realm records\n§8The biggest fish of each species", () => showRecords(player)],
    [`Make my fish stackable\n§8${measured ? `${measured} measured raw fish` : "No measured raw fish"}`, () => stackMenu(player)],
    [`Fishing settings\n§8Measure my catches: ${getFor(player, "measure") === true ? "Enabled" : "Disabled"}`, () => settingsMenu(player)],
  ];
  if (isOp(player)) actions.push([`Start a tournament now\n§8Operators, ${get("tournamentMinutes")} minutes`, () => opStartTournament(player)]);
  const form = new ActionFormData().title("§lFishing 2.0").body(tournamentStatus());
  for (const [label] of actions) form.button(label);
  form.button("Close");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  await actions[res.selection]?.[1]();
}

/** The menu's "Start a tournament now" (operators). @param {Player} player */
function opStartTournament(player) {
  if (!isOp(player)) return;
  if (tourney) player.sendMessage(`§cA tournament is already running (ends in ${until(tourney.e - Date.now())}).`);
  else startTournament(Date.now() + lengthMs());
}

// ---------------------------------------------------------------------------
// Townsfolk: NPCs with the fisher role offer "Sell fish" and "Fish records"
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
        send("realm:npc_offer", { req: msg.req, pack: PACK, key: "sell", label: "Sell fish", order: 20 });
        send("realm:npc_offer", { req: msg.req, pack: PACK, key: "records", label: "Fish records", order: 21 });
        return;
      }
      if (msg.pack !== PACK) return;
      const player = online(msg.player);
      if (!player) return;
      const run = msg.key === "sell" ? sellMenu(player) : msg.key === "records" ? showRecords(player, lastNpc.get(player.id)) : undefined;
      run?.catch((e) => console.warn(`[fishing] ${e}`));
    } catch (e) {
      console.warn(`[fishing] npc: ${e}`);
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
      name: "realm:fishing",
      description: "Fishing 2.0: a menu with your fish log, the records, stackable fish and your settings",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => mainMenu(player).catch((e) => console.warn(`[fishing] ${e}`)));
      return { status: CustomCommandStatus.Success };
    },
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:fishing_log",
      description: "Fishing 2.0: your fish log, species caught and personal bests",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => showLog(player).catch((e) => console.warn(`[fishing] ${e}`)));
      return { status: CustomCommandStatus.Success };
    },
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:fishing_stack",
      description: "Fishing 2.0: turn your measured raw fish into plain fish that stack (asks first)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => stackMenu(player).catch((e) => console.warn(`[fishing] ${e}`)));
      return { status: CustomCommandStatus.Success };
    },
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:fishing_top",
      description: "Fishing 2.0: the realm's biggest fish of each species",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => showRecords(player).catch((e) => console.warn(`[fishing] ${e}`)));
      return { status: CustomCommandStatus.Success };
    },
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:fishing_tournament",
      description: "Fishing 2.0: start a fishing tournament now (operators)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
    },
    () => {
      if (tourney) return { status: CustomCommandStatus.Failure, message: `A tournament is already running (ends in ${until(tourney.e - Date.now())}).` };
      system.run(() => {
        try {
          if (!tourney) startTournament(Date.now() + lengthMs());
        } catch (e) {
          console.warn(`[fishing] ${e}`);
        }
      });
      return { status: CustomCommandStatus.Success, message: `Starting a ${get("tournamentMinutes")}-minute fishing tournament.` };
    },
  );
});

// Callings (Skills): realm:calling carries each player's talent numbers (`bonus`: luckyLine: Hearthkeeper's percent more rare fish). Kept in memory; Skills
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
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  callingBonus.delete(playerId);
  tobinOff.delete(playerId); // Townsfolk sends it again when the player joins
});
/** A Calling talent's number for the player (0 without it). @param {Player} player @param {string} key */
const callingValue = (player, key) => Math.max(0, Number(callingBonus.get(player.id)?.[key]) || 0);

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "fishing_bp");
  },
  { namespaces: ["realm"] },
);
