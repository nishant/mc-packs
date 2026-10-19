import "./diag.js";
import { CommandPermissionLevel, CustomCommandStatus, ItemStack, Player, ScriptEventSource, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { DISHES, FIXED_EFFECTS, INGREDIENTS, ROLLS, TRAIT_INGREDIENT } from "./recipes.js";
import { get, getFor } from "./settings.js";
import { onScriptEvent } from "./script-events.js";
import { applyParts, createOwedStore } from "./owed.js";

const PACK = "cooking_bp";
const PROP_KNOWN = "cooking:known"; // player: JSON [recipe id] learned (basics aren't saved)
const PROP_STATS = "cooking:stats"; // player: JSON { c: servings cooked, e: dishes eaten }
// Per player, one world property each plus an index (owed.js): "cooking:pending:<player id>" = [recipe id] learned while offline
// (index "cooking:pending_idx"), and "cooking:owed:<player id>" = { [dish id]: batches } cooked after the cook left, where the pot's
// area was unloaded (index "cooking:owed_idx").
const pendingStore = createOwedStore(world, {
  base: "cooking:pending",
  normalize: (v) => {
    if (!Array.isArray(v)) throw new Error("not a recipe list");
    return v;
  },
  summarize: (v) => `recipes ${JSON.stringify(v)}`,
});
const owedStore = createOwedStore(world, {
  base: "cooking:owed",
  normalize: (v) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("not a dish list");
    return v;
  },
  summarize: (v) => `dishes ${JSON.stringify(v)}`,
});const PROP_MOON = "cooking:moon"; // world: JSON { s: "blood" | "harvest", t: ms, a: game tick } the moon from realm:moon
const PROP_STAR = "cooking:star"; // world: ms of the last aurora or meteor (realm:sky_event)
const MINUTE = 60000;
const MOON_MAX_MS = 20 * MINUTE; // a moon night lasts about 10 minutes; forget a moon that never set (saved before game ticks were)
const MOON_MAX_TICKS = 24000; // the same in game time, which stands still while the realm is closed
const CARD_PREFIX = "Recipe Card: ";
const CROPS = new Set(["minecraft:wheat", "minecraft:carrots", "minecraft:potatoes", "minecraft:beetroot"]);
const HIVES = new Set(["minecraft:beehive", "minecraft:bee_nest"]);
const HOSTILE = new Set([
  "minecraft:zombie",
  "minecraft:husk",
  "minecraft:drowned",
  "minecraft:zombie_villager",
  "minecraft:skeleton",
  "minecraft:stray",
  "minecraft:bogged",
  "minecraft:creeper",
  "minecraft:spider",
  "minecraft:cave_spider",
  "minecraft:witch",
  "minecraft:enderman",
  "minecraft:slime",
  "minecraft:phantom",
  "minecraft:pillager",
  "minecraft:vindicator",
]);
const FX_NAMES = /** @type {Record<string, string>} */ ({
  speed: "Speed",
  haste: "Haste",
  night_vision: "Night Vision",
  water_breathing: "Water Breathing",
  fire_resistance: "Fire Resistance",
  saturation: "Saturation",
  jump_boost: "Jump Boost",
  absorption: "Absorption",
  resistance: "Resistance",
  regeneration: "Regeneration",
  strength: "Strength",
  health_boost: "Health Boost",
  slow_falling: "Slow Falling",
  conduit_power: "Conduit Power",
  village_hero: "Hero of the Village",
  levitation: "Levitation",
  nausea: "Nausea",
});
const BEA_LINES = [
  "Hungry? Of course you are. Sit, sit!",
  "A good stew is like a good story: it needs time, and salt.",
  "Bring me something rare and I'll show you something wonderful.",
  "Wash your hands! ...Fine. Just don't touch the bread.",
  "On my old ship we cooked in storms. This kitchen is a holiday.",
];

/** @typedef {import("./recipes.js").Dish} Dish */
/** @typedef {import("./recipes.js").Ingredient} Ingredient */
/** @typedef {import("./recipes.js").Need} Need */
/** @typedef {import("./recipes.js").Fx} Fx */
/** @typedef {import("./recipes.js").Offer} Offer */
/** @typedef {import("@minecraft/server").Container} Container */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {{ dim: string, loc: Vector3 }} Pot where the dish cooks */

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Text without § codes. @param {string} s */
const plain = (s) => s.replace(/§./g, "").trim();
/** "Harbor Chowder", "harbor_chowder" -> "harborchowder". @param {string} s */
const keyOf = (s) => plain(String(s)).toLowerCase().replace(/[^a-z0-9]/g, "");
/** @param {string} id @returns {Player | undefined} */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);
const isOp = (/** @type {Player} */ player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
/** "minecraft:cooked_beef" -> "Cooked Beef". @param {string} id */
const itemName = (id) =>
  id
    .replace(/^.*:/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
/** 300 -> "5:00". @param {number} s */
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
/** 300 -> "5m", 45 -> "45s", 90 -> "1m 30s". @param {number} s */
function span(s) {
  s = Math.round(s);
  if (s < 60) return `${s}s`;
  return s % 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s / 60}m`;
}
const ROMAN = ["I", "II", "III", "IV", "V"];
/** @param {number} percent */
const chance = (percent) => Math.random() * 100 < percent;

/** @param {string} id @param {object} data */
function send(id, data) {
  try {
    system.sendScriptEvent(id, JSON.stringify(data));
  } catch (e) {
    console.warn(`[cooking] ${id}: ${e}`);
  }
}

/** @param {Player | import("@minecraft/server").World} holder @param {string} key @returns {any} */
function loadJson(holder, key) {
  try {
    const raw = holder.getDynamicProperty(key);
    return typeof raw === "string" ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}
/** @param {Player | import("@minecraft/server").World} holder @param {string} key @param {unknown} value undefined clears it */
function saveJson(holder, key, value) {
  try {
    holder.setDynamicProperty(key, value === undefined ? undefined : JSON.stringify(value));
  } catch (e) {
    console.warn(`[cooking] save ${key}: ${e}`);
  }
}

/** @param {Player} player @returns {Container | undefined} */
function containerOf(player) {
  try {
    return player.getComponent("minecraft:inventory")?.container;
  } catch {
    return undefined;
  }
}

/** Plays a sound for a player who hasn't disabled cooking sounds. @param {Player} player @param {string} id @param {number} [pitch] */
function sound(player, id, pitch = 1) {
  try {
    if (getFor(player, "sounds") !== false) player.playSound(id, { pitch, volume: 0.7 });
  } catch {
    // gone
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

// Crowns: the shared `crowns` scoreboard.
function crownsObjective() {
  const sb = world.scoreboard;
  const found = sb.getObjective("crowns");
  if (found) return found;
  try {
    return sb.addObjective("crowns", "Crowns");
  } catch {
    return /** @type {import("@minecraft/server").ScoreboardObjective} */ (sb.getObjective("crowns"));
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
    console.warn(`[cooking] crowns: ${e}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Dishes, ingredients and recipe cards as items
// ---------------------------------------------------------------------------

const dishById = new Map(DISHES.map((d) => [d.id, d]));
const dishByName = new Map(DISHES.map((d) => [d.name, d]));
const dishByKey = new Map(DISHES.flatMap((d) => [[keyOf(d.id), d], [keyOf(d.name), d]]));
const ingById = new Map(INGREDIENTS.map((i) => [i.id, i]));
const ingByName = new Map(INGREDIENTS.map((i) => [i.name, i]));
const ingByKey = new Map(INGREDIENTS.flatMap((i) => [[keyOf(i.id), i], [keyOf(i.name), i]]));
const BASICS = DISHES.filter((d) => d.tier === "basic").map((d) => d.id);
const CARD_DISHES = DISHES.filter((d) => d.card);

/** "Haste II (5:00)". @param {Fx} fx */
function fxLore([id, amp, secs]) {
  const name = FX_NAMES[id] ?? itemName(id);
  if (id === "saturation") return `§9${name} (fills you up)`;
  return `§9${name} ${ROMAN[amp] ?? amp + 1} (${clock(secs)})`;
}

/** The lore every serving of a dish has (the same always, so servings stack). @param {Dish} d */
function dishLore(d) {
  const lines = [`§7${d.blurb}`];
  if (d.roll) lines.push("§dRolls for a surprise");
  else lines.push(...d.effects.map(fxLore));
  lines.push(d.tier === "rare" ? "§6Rare dish" : "§8Kitchen dish");
  return lines;
}

/** @param {Dish} d @param {number} n */
function dishStack(d, n) {
  const s = new ItemStack(d.base, n);
  s.nameTag = d.name;
  s.setLore(dishLore(d));
  return s;
}
/** @param {Ingredient} ing @param {number} n */
function ingStack(ing, n) {
  const s = new ItemStack(ing.item, n);
  s.nameTag = ing.name;
  s.setLore(["§7Rare ingredient", `§8${ing.source}`]);
  return s;
}
const CARD_LORE = "§7A recipe for the Kitchen.";
const CARD_DISH = "§8Recipe: ";

/** @param {Dish} d @param {number} n */
function cardStack(d, n) {
  const s = new ItemStack("minecraft:paper", n);
  s.nameTag = `${CARD_PREFIX}${d.name}`;
  s.setLore([CARD_LORE, "§7Open a cooking pot or /realm:cooking", "§7to learn it.", `${CARD_DISH}${d.name}`, "§7Works anywhere in your inventory"]);
  return s;
}

// Items are recognized by their name AND the lore this pack wrote (an anvil can rename an item but
// can't add or change lore, and Silly Enchants only appends its own lines). "Any lore" isn't enough:
// a cheap dish renamed on an anvil would pass as a rare one of the same food, and a renamed plain
// item with a silly enchant would pass as an ingredient.

/** A dish: the right food item, its name, and the dish's own first lore line. @param {ItemStack | undefined} s */
function dishOf(s) {
  if (!s?.nameTag) return undefined;
  const d = dishByName.get(plain(s.nameTag));
  if (!d || d.base !== s.typeId || s.getLore()[0] !== `§7${d.blurb}`) return undefined;
  return d;
}
/** A rare ingredient this pack made, or the Storm Eel of Fishing 2.0 (its size line). @param {ItemStack | undefined} s */
function ingOf(s) {
  if (!s?.nameTag) return undefined;
  const ing = ingByName.get(plain(s.nameTag));
  if (!ing) return undefined;
  const lore = s.getLore();
  if (s.typeId === ing.item && lore[0] === "§7Rare ingredient" && lore[1] === `§8${ing.source}`) return ing;
  if (ing.alsoAny && s.typeId === ing.alsoAny && /^§7\d+ cm$/.test(lore[0] ?? "")) return ing;
  return undefined;
}
/** A recipe card. Cards from before 1.0.1 have no recipe line; newer ones must name the same dish. @param {ItemStack | undefined} s */
function cardOf(s) {
  if (!s?.nameTag || s.typeId !== "minecraft:paper") return undefined;
  const name = plain(s.nameTag);
  const lore = s.getLore();
  if (!name.startsWith(CARD_PREFIX) || lore[0] !== CARD_LORE) return undefined;
  const d = dishByName.get(name.slice(CARD_PREFIX.length));
  const line = lore.find((l) => l.startsWith(CARD_DISH));
  if (!d || (line !== undefined && line !== `${CARD_DISH}${d.name}`)) return undefined;
  return d;
}

/** Gives items, dropping what doesn't fit at the player's feet (or at `at` if the player is gone). @param {Player} player @param {ItemStack} stack @param {number} total */
function giveItems(player, stack, total, at = /** @type {Pot | undefined} */ (undefined)) {
  const max = Math.max(1, stack.maxAmount);
  let left = Math.floor(total);
  while (left > 0) {
    const n = Math.min(max, left);
    left -= n;
    const s = stack.clone();
    s.amount = n;
    try {
      if (player.isValid) {
        const c = containerOf(player);
        const rest = c ? c.addItem(s) : s;
        if (rest) player.dimension.spawnItem(rest, player.location);
      } else if (at) world.getDimension(at.dim).spawnItem(s, at.loc);
    } catch (e) {
      console.warn(`[cooking] give: ${e}`);
    }
  }
}

/** @param {Need} need */
const needName = ([id]) => (id.startsWith("ing:") ? ingById.get(id.slice(4))?.name ?? id : itemName(id));
/** "2 Beetroot". @param {Need} need @param {number} [times] */
const needText = (need, times = 1) => `${need[1] * times} ${needName(need)}`;

/** Does this stack count for this need? Plain items only count without a custom name. @param {ItemStack} s @param {string} id */
function fits(s, id) {
  if (id.startsWith("ing:")) return ingOf(s)?.id === id.slice(4);
  return s.typeId === id && !s.nameTag;
}

/** How many of each need the player carries. @param {Container} c @param {Need[]} needs */
function haves(c, needs) {
  const out = needs.map(() => 0);
  for (let i = 0; i < c.size; i++) {
    const s = c.getItem(i);
    if (!s) continue;
    needs.forEach(([id], k) => {
      if (fits(s, id)) out[k] += s.amount;
    });
  }
  return out;
}

/** How many times the player could pay these needs. @param {Player} player @param {Need[]} needs */
function timesAffordable(player, needs) {
  const c = containerOf(player);
  if (!c) return 0;
  const h = haves(c, needs);
  return Math.min(...needs.map(([, n], k) => Math.floor(h[k] / n)));
}

/** Takes `times` of each need (check first with timesAffordable). @param {Player} player @param {Need[]} needs @param {number} times */
function takeNeeds(player, needs, times) {
  const c = containerOf(player);
  if (!c) return false;
  for (const [id, n] of needs) {
    let left = n * times;
    for (let i = 0; i < c.size && left > 0; i++) {
      const s = c.getItem(i);
      if (!s || !fits(s, id)) continue;
      const take = Math.min(left, s.amount);
      left -= take;
      if (take >= s.amount) c.setItem(i, undefined);
      else {
        s.amount -= take;
        c.setItem(i, s);
      }
    }
    if (left > 0) return false;
  }
  return true;
}

/** "Missing: 1 Kelp, 2 Wheat". @param {Player} player @param {Need[]} needs */
function missingText(player, needs) {
  const c = containerOf(player);
  const h = c ? haves(c, needs) : needs.map(() => 0);
  return needs
    .map((need, k) => (h[k] < need[1] ? `${need[1] - h[k]} ${needName(need)}` : ""))
    .filter(Boolean)
    .join(", ");
}

// ---------------------------------------------------------------------------
// Known recipes, stats, recipe cards
// ---------------------------------------------------------------------------

/** @param {Player} player @returns {string[]} learned ids (no basics) */
function learned(player) {
  const v = loadJson(player, PROP_KNOWN);
  return Array.isArray(v) ? v.filter((id) => typeof id === "string" && dishById.has(id)) : [];
}
/** @param {Player} player */
const knownSet = (player) => new Set([...BASICS, ...learned(player)]);

/**
 * Teaches a recipe. @param {Player} player @param {Dish} d @param {string} [from] for the message
 * @returns {boolean} true if it was new
 */
function learn(player, d, from) {
  if (knownSet(player).has(d.id)) return false;
  saveJson(player, PROP_KNOWN, [...learned(player), d.id]);
  player.sendMessage(`§aNew recipe: ${d.name}!${from ? ` §7(${from})` : ""} §7/realm:cooking shows what it needs.`);
  sound(player, "random.levelup", 1.4);
  return true;
}

/** @param {Player} player @returns {{ c: number, e: number }} */
function statsOf(player) {
  const v = loadJson(player, PROP_STATS);
  return { c: Number(v?.c) || 0, e: Number(v?.e) || 0 };
}
/** @param {Player} player @param {"c" | "e"} key @param {number} n */
function addStat(player, key, n) {
  const s = statsOf(player);
  s[key] += n;
  saveJson(player, PROP_STATS, s);
}

/** Learns the recipe cards the player carries (cards for recipes they know stay, to trade). @param {Player} player */
function readCards(player) {
  const c = containerOf(player);
  if (!c) return;
  for (let i = 0; i < c.size; i++) {
    const s = c.getItem(i);
    const d = cardOf(s);
    if (!s || !d || knownSet(player).has(d.id)) continue;
    learn(player, d, "recipe card");
    if (s.amount > 1) {
      s.amount -= 1;
      c.setItem(i, s);
    } else c.setItem(i, undefined);
  }
}

/** Recipes learned (by a story) while the player was offline. @param {Player} player */
function applyPending(player) {
  const list = pendingStore.take(player.id);
  if (!Array.isArray(list)) return;
  applyParts(
    list.filter((id) => dishById.has(id)),
    (id) => learn(player, /** @type {Dish} */ (dishById.get(id)), "from a story"),
    (failed) => {
      for (const id of failed) {
        const d = dishById.get(id);
        if (d) addPending(player.id, d);
      }
    },
    (m) => console.warn(`[cooking] ${m}`),
  );
}

/** @param {string} pid @param {Dish} d */
function addPending(pid, d) {
  const ok = pendingStore.update(pid, (cur) => {
    const list = Array.isArray(cur) ? cur : [];
    if (!list.includes(d.id)) list.push(d.id);
    return list;
  });
  if (!ok) console.warn(`[cooking] recipe ${d.id} for ${pid} could not be saved`);
}

// After a /reload, the players still online get what finished cooking meanwhile (others when they join).
world.afterEvents.worldLoad.subscribe(() =>
  system.runTimeout(() => {
    for (const player of world.getAllPlayers()) {
      try {
        applyOwed(player);
      } catch (e) {
        console.warn(`[cooking] owed: ${e}`);
      }
    }
  }, 100)
);

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  system.runTimeout(() => {
    try {
      if (player.isValid) applyPending(player);
      if (player.isValid) applyOwed(player);
    } catch (e) {
      console.warn(`[cooking] pending: ${e}`);
    }
  }, 100);
});

// ---------------------------------------------------------------------------
// Cooking
// ---------------------------------------------------------------------------

/** Players whose pot is bubbling right now. @type {Set<string>} */
const cooking = new Set();

/** Servings the player could cook right now (ignoring maxBatch). @param {Player} player @param {Dish} d */
const servingsNow = (player, d) => timesAffordable(player, d.needs);

/**
 * Cooks `times` batches of a dish at a pot: takes the ingredients now, gives the dish after cookSeconds.
 * @param {Player} player @param {Dish} d @param {number} times @param {Pot} pot
 * @returns {string | undefined} why it couldn't, or undefined when it started
 */
function cook(player, d, times, pot) {
  if (cooking.has(player.id)) return "Your pot is already bubbling. Wait a moment.";
  if (!knownSet(player).has(d.id)) return `You don't know how to cook ${d.name} yet.`;
  const n = Math.min(Math.floor(times), servingsNow(player, d), Math.max(1, CONFIG.maxBatch));
  if (n < 1) return `Missing: ${missingText(player, d.needs)}`;
  if (!takeNeeds(player, d.needs, n)) return "Your ingredients moved. Try again.";
  const pid = player.id;
  // The ingredients are gone now: the dish is owed until it is handed over, so a restart or a script
  // reload mid-cook hands it over on the next join instead of losing it.
  const owed = owe(pid, d, n);
  cooking.add(pid);
  const ticks = Math.max(1, Math.round(CONFIG.cookSeconds * 20));
  const top = { x: pot.loc.x + 0.5, y: pot.loc.y + 1.1, z: pot.loc.z + 0.5 };
  let t = 0;
  const run = system.runInterval(() => {
    t += 5;
    try {
      const dim = world.getDimension(pot.dim);
      dim.spawnParticle("minecraft:basic_smoke_particle", { x: top.x + (Math.random() - 0.5) * 0.5, y: top.y, z: top.z + (Math.random() - 0.5) * 0.5 });
      if (t % 10 === 0 && player.isValid) sound(player, "bubble.pop", 0.8 + Math.random() * 0.4);
    } catch {
      // unloaded
    }
    if (t < ticks) return;
    system.clearRun(run);
    cooking.delete(pid);
    finish(player, pid, d, n, pot, top, owed);
  }, 5);
  return undefined;
}

/** @param {Player} player @param {string} pid the player's id @param {Dish} d @param {number} n @param {Pot} pot @param {Vector3} top @param {boolean} owed the dish was saved as owed when the pot started */
function finish(player, pid, d, n, pot, top, owed) {
  try {
    world.getDimension(pot.dim).spawnParticle("minecraft:villager_happy", top);
  } catch {
    // unloaded
  }
  // The cook left and nobody is near the pot: nowhere to drop the dishes, so they stay owed for the next join.
  if (!player.isValid && !isLoaded(pot)) {
    if (!owed) owe(pid, d, n);
    return;
  }
  // Only what is still owed: a cook who left and came back mid-cook already got it on joining. If saving
  // it as owed failed, nothing could hand it over early, so all of it is due.
  const due = owed ? settle(pid, d, n) : n;
  if (due) deliver(player, d, due, pot);
}

/** Gives `n` batches of `d` (and what it gives back); drops them at the pot if the player is gone. @param {Player} player @param {Dish} d @param {number} n @param {Pot} [pot] */
function deliver(player, d, n, pot) {
  giveItems(player, dishStack(d, 1), n * d.yield, pot);
  for (const [id, k] of d.returns ?? []) giveItems(player, new ItemStack(id, 1), k * n, pot);
  if (!player.isValid) return;
  sound(player, "random.orb", 1.2);
  player.sendMessage(`§aYou cooked ${n * d.yield} ${d.name}.`);
  addStat(player, "c", n * d.yield);
  if (CONFIG.skillXp > 0) send("realm:skill_xp", { player: player.id, skill: "farming", amount: CONFIG.skillXp * n * d.yield });
}

/** @param {Pot} pot */
function isLoaded(pot) {
  try {
    return !!world.getDimension(pot.dim).getBlock(pot.loc);
  } catch {
    return false;
  }
}

/** @param {string} pid @param {Dish} d @param {number} n batches @returns {boolean} whether it was saved */
function owe(pid, d, n) {
  return owedStore.update(pid, (cur) => {
    const mine = cur && typeof cur === "object" && !Array.isArray(cur) ? cur : {};
    mine[d.id] = (Number(mine[d.id]) || 0) + n;
    return mine;
  });
}

/** Takes up to `n` batches of `d` off what `pid` is owed; returns how many were owed. @param {string} pid @param {Dish} d @param {number} n */
function settle(pid, d, n) {
  let due = 0;
  owedStore.update(pid, (cur) => {
    if (!cur || typeof cur !== "object" || Array.isArray(cur)) return cur;
    const have = Math.floor(Number(cur[d.id]) || 0);
    due = Math.max(0, Math.min(n, have));
    if (!due) return cur;
    if (have - due > 0) cur[d.id] = have - due;
    else delete cur[d.id];
    return Object.keys(cur).length ? cur : undefined;
  });
  return due;
}

/** Dishes that finished cooking after the player left (or that a restart interrupted). `pid` and `failIds` are for the native test hook. @param {Player} player @param {string} [pid] @param {Set<string>} [failIds] */
function applyOwed(player, pid = player.id, failIds) {
  const mine = owedStore.take(pid);
  if (!mine || typeof mine !== "object" || Array.isArray(mine)) return;
  const parts = Object.entries(mine)
    .map(([id, n]) => /** @type {[string, number]} */ ([id, Math.floor(Number(n))]))
    .filter(([id, n]) => dishById.has(id) && n > 0);
  applyParts(
    parts,
    ([id, n]) => {
      if (failIds?.has(id)) throw new Error("test: grant failed");
      deliver(player, /** @type {Dish} */ (dishById.get(id)), n);
    },
    (failed) => {
      for (const [id, n] of failed) owe(pid, /** @type {Dish} */ (dishById.get(id)), n);
    },
    (m) => console.warn(`[cooking] ${m}`),
  );
}

/** Is this cauldron a cooking pot (a lit campfire under it)? @param {import("@minecraft/server").Block} block */
function isPot(block) {
  if (block.typeId !== "minecraft:cauldron") return false;
  const below = block.below();
  if (!below || !CONFIG.potFires.includes(below.typeId)) return false;
  return below.permutation.getState("extinguished") !== true;
}

// ---------------------------------------------------------------------------
// Eating
// ---------------------------------------------------------------------------

/**
 * Adds effects, never shortening or weakening one the player already has.
 * @param {Player} player @param {Fx[]} list @returns {string[]} what was given, for chat
 */
function applyFx(player, list) {
  // Hearthkeeper's Hearty Dishes (Skills): `bonus.dishPct` percent longer, on top of the realm's multiplier.
  const mult = Math.max(0.05, Number(get("durationMultiplier")) || 1) * (1 + Math.min(100, callingValue(player, "dishPct")) / 100);
  const out = [];
  for (const [id, amp, secs] of list) {
    const scaled = FIXED_EFFECTS.includes(id) ? secs : secs * mult;
    const ticks = Math.max(1, Math.round(scaled * 20));
    try {
      const cur = player.getEffect(id);
      const stronger = cur && cur.amplifier > amp;
      const longer = cur && cur.amplifier === amp && cur.duration >= ticks;
      if (!stronger && !longer) player.addEffect(id, ticks, { amplifier: amp, showParticles: false });
    } catch (e) {
      console.warn(`[cooking] effect ${id}: ${e}`);
      continue;
    }
    const name = `${FX_NAMES[id] ?? itemName(id)}${id === "saturation" ? "" : ` ${ROMAN[amp] ?? amp + 1}`}`;
    out.push(id === "saturation" ? name : `${name} for ${span(scaled)}`);
  }
  return out;
}

/** Sparkles, hiccups or a burp. @param {Player} player @param {"glow" | "hiccups" | "burp"} act */
function silly(player, act) {
  if (act === "burp") {
    try {
      player.dimension.playSound("random.burp", player.location, { volume: 1, pitch: 0.6 });
      for (const p of player.dimension.getPlayers({ location: player.location, maxDistance: 16 })) {
        if (p.id !== player.id) p.sendMessage(`§7${player.name} burps loudly.`);
      }
    } catch {
      // gone
    }
    return;
  }
  let n = 0;
  const every = act === "glow" ? 5 : 30;
  const times = act === "glow" ? 60 : 6;
  const run = system.runInterval(() => {
    n++;
    if (!player.isValid || n > times) return system.clearRun(run);
    try {
      const l = player.location;
      if (act === "glow") {
        player.dimension.spawnParticle("minecraft:villager_happy", { x: l.x + (Math.random() - 0.5) * 1.2, y: l.y + Math.random() * 2, z: l.z + (Math.random() - 0.5) * 1.2 });
      } else {
        player.applyKnockback({ x: 0, z: 0 }, 0.35);
        player.dimension.playSound("random.pop", l, { volume: 0.6, pitch: 1.7 });
      }
    } catch {
      // can't push this player: the sound is enough
    }
  }, every);
}

/** Rolls a rolling dish's surprise. @param {Player} player @param {Dish} d */
function rollDish(player, d) {
  const r = d.roll ?? { silly: 1, jackpot: 1 };
  const weights = ROLLS.map((x) => x.w * (x.silly ? r.silly : 1) * (x.jackpot ? r.jackpot : 1));
  let pick = Math.random() * weights.reduce((a, b) => a + b, 0);
  let row = ROLLS[0];
  for (let i = 0; i < ROLLS.length; i++) {
    pick -= weights[i];
    if (pick < 0) {
      row = ROLLS[i];
      break;
    }
  }
  const given = row.fx ? applyFx(player, row.fx) : [];
  if (row.act) silly(player, row.act);
  player.sendMessage(`§d${d.name}: §f${row.text}${given.length ? ` §7(${given.join(", ")})` : ""}`);
  if (row.jackpot) sound(player, "random.levelup", 1.2);
  return row.id;
}

/** A player ate a dish (or a test said so). @param {Player} player @param {Dish} d */
function eat(player, d) {
  addStat(player, "e", 1);
  if (get("enabled") !== true) return;
  if (d.roll && get("rollingDishes") === true) {
    rollDish(player, d);
    return;
  }
  const given = applyFx(player, d.effects);
  if (given.length) player.sendMessage(`§a${d.name}: §f${given.join(", ")}`);
}

world.afterEvents.itemCompleteUse.subscribe(({ itemStack, source }) => {
  try {
    if (!(source instanceof Player)) return;
    const d = dishOf(itemStack);
    if (d) eat(source, d);
  } catch (e) {
    console.warn(`[cooking] eat: ${e}`);
  }
});

// ---------------------------------------------------------------------------
// Rare ingredients: champions, foraging, moons and sky events
// ---------------------------------------------------------------------------

/** @param {Player} player @param {string} id @param {string} [from] */
function giveIngredient(player, id, from) {
  const ing = ingById.get(id);
  if (!ing) return;
  giveItems(player, ingStack(ing, 1), 1);
  player.sendMessage(`§6Rare ingredient: §f${ing.name}${from ? ` §7(${from})` : ""}`);
  sound(player, "random.orb", 0.7);
}

/** realm:champion_slain from Champions. @param {any} msg */
function onChampion(msg) {
  const pct = Number(get("championDropChance")) || 0;
  const from = typeof msg.name === "string" ? plain(msg.name) : "a champion";
  const killer = typeof msg.player === "string" ? online(msg.player) : undefined;
  if (killer) {
    if (chance(pct)) giveIngredient(killer, "champions_heart", from);
    const extra = /** @type {Record<string, string>} */ (TRAIT_INGREDIENT)[String(msg.trait)];
    if (extra && chance(pct)) giveIngredient(killer, extra, from);
    if (msg.dim === "minecraft:nether" && chance(pct)) giveIngredient(killer, "ember_truffle", from);
    if (CARD_DISHES.length && chance(Number(get("recipeCardChance")) || 0)) {
      const d = CARD_DISHES[Math.floor(Math.random() * CARD_DISHES.length)];
      giveItems(killer, cardStack(d, 1), 1);
      killer.sendMessage(`§6Recipe card: §f${d.name} §7(open /realm:cooking to learn it)`);
    }
  }
  if (Array.isArray(msg.helpers)) {
    for (const id of msg.helpers) {
      const p = typeof id === "string" && id !== msg.player ? online(id) : undefined;
      if (p && chance(pct / 2)) giveIngredient(p, "champions_heart", from);
    }
  }
}

/** @param {"blood" | "harvest"} state */
function moonIs(state) {
  const m = loadJson(world, PROP_MOON);
  if (!m || m.s !== state) return false;
  // Game time, so a moon still up after a restart (the realm closed mid-night) keeps its window.
  if (Number.isFinite(m.a)) return Math.abs(world.getAbsoluteTime() - m.a) < MOON_MAX_TICKS;
  return Date.now() - Number(m.t) < MOON_MAX_MS;
}
function starNight() {
  const t = Number(world.getDynamicProperty(PROP_STAR) ?? 0);
  return Date.now() - t < CONFIG.starMinutes * MINUTE;
}
const foraging = () => get("foragingEnabled") === true;
/** Night in the Overworld sense: time of day 13000 to 23000. */
const isNight = () => {
  const t = world.getTimeOfDay();
  return t >= 13000 && t < 23000;
};

/** Is this crop or nether wart fully grown? @param {import("@minecraft/server").BlockPermutation} perm */
function ripe(perm) {
  const type = perm.type.id;
  if (CROPS.has(type)) return perm.getState("growth") === 7;
  if (type === "minecraft:nether_wart") return perm.getState("age") === 3;
  return false;
}

/** A ripe crop or nether wart was harvested (broken, or tapped by Right-click Harvest). @param {Player} player @param {string} type */
function forageCrop(player, type) {
  if (!foraging()) return;
  if (CROPS.has(type)) {
    if (type === "minecraft:wheat" && starNight() && chance(CONFIG.forage.starwrightFlour)) giveIngredient(player, "starwright_flour", "starlit wheat");
    if (moonIs("harvest") && chance(CONFIG.forage.harvestSaffron)) giveIngredient(player, "harvest_saffron", "Harvest Moon");
  } else if (type === "minecraft:nether_wart" && chance(CONFIG.forage.emberTruffle)) {
    giveIngredient(player, "ember_truffle", "nether wart");
  }
}

/** Where ripe crops were just broken: "dim x,y,z" to the tick, so a tap watched at the same spot doesn't count it twice. @type {Map<string, number>} */
const recentBreaks = new Map();
/** @param {string} dim @param {import("@minecraft/server").Vector3} at */
const spotKey = (dim, at) => `${dim} ${at.x},${at.y},${at.z}`;

world.afterEvents.playerBreakBlock.subscribe(({ player, block, brokenBlockPermutation: perm }) => {
  try {
    if (!ripe(perm)) return;
    const now = system.currentTick;
    for (const [k, t] of recentBreaks) if (now - t > 20) recentBreaks.delete(k);
    recentBreaks.set(spotKey(block.dimension.id, block.location), now);
    forageCrop(player, perm.type.id);
  } catch (e) {
    console.warn(`[cooking] forage: ${e}`);
  }
});

/**
 * A tap on a ripe crop that leaves it replanted (or gone) is a harvest too: the Right-click Harvest
 * pack cancels the tap and resets the crop, so no playerBreakBlock fires. Checked a few ticks later.
 * @param {Player} player @param {import("@minecraft/server").Block} block
 */
function watchTapHarvest(player, block) {
  const type = block.typeId;
  if (!CROPS.has(type) && type !== "minecraft:nether_wart") return;
  if (!ripe(block.permutation)) return;
  const dim = block.dimension;
  const at = { ...block.location };
  const tapped = system.currentTick;
  system.runTimeout(() => {
    try {
      const b = dim.getBlock(at);
      if (!b || !player.isValid) return;
      // Broken by hand meanwhile: playerBreakBlock already counted it.
      if ((recentBreaks.get(spotKey(dim.id, at)) ?? -1) >= tapped) return;
      // Replanted (same crop, not ripe) or no seed to replant (air): harvested. Air over trampled
      // farmland (now dirt) or washed away is not a harvest.
      const soil = b.below()?.typeId;
      const onSoil = type === "minecraft:nether_wart" ? soil === "minecraft:soul_sand" : soil === "minecraft:farmland";
      if ((b.typeId === type && !ripe(b.permutation)) || (b.typeId === "minecraft:air" && onSoil)) forageCrop(player, type);
    } catch (e) {
      console.warn(`[cooking] forage tap: ${e}`);
    }
  }, 3);
}

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  try {
    if (!foraging()) return;
    const killer = damageSource.damagingEntity;
    if (!(killer instanceof Player)) return;
    const type = deadEntity.typeId;
    if (type === "minecraft:stray" && chance(CONFIG.forage.frostPepper)) giveIngredient(killer, "frost_pepper", "a stray");
    if (HOSTILE.has(type) && moonIs("blood") && chance(CONFIG.forage.moonSalt)) giveIngredient(killer, "moon_salt", "Blood Moon");
  } catch (e) {
    console.warn(`[cooking] hunt: ${e}`);
  }
});

// Cooking pots (tap a cauldron over a lit campfire) and beehives (Glow Honey at night). A hive needs
// no isFirstEvent check: harvesting empties it, so a repeat sees honey_level 0.
world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  if (ev.cancel) return; // another pack refused the tap (e.g. a land claim)
  const { block, player, itemStack, isFirstEvent } = ev;
  let type;
  try {
    type = block.typeId;
  } catch {
    return;
  }
  if (type === "minecraft:cauldron") {
    if (itemStack && !player.isSneaking) return; // buckets and bottles work as usual
    let pot = false;
    try {
      pot = isPot(block);
    } catch {
      return;
    }
    if (!pot) return;
    ev.cancel = true;
    if (!isFirstEvent) return;
    const at = { dim: block.dimension.id, loc: { ...block.location } };
    system.run(() => potMenu(player, at).catch((e) => console.warn(`[cooking] pot: ${e}`)));
    return;
  }
  if (isFirstEvent && !player.isSneaking && foraging()) {
    try {
      watchTapHarvest(player, block);
    } catch {
      // the block can't be read: nothing to watch
    }
  }
  if (HIVES.has(type) && itemStack && (itemStack.typeId === "minecraft:glass_bottle" || itemStack.typeId === "minecraft:shears")) {
    let full = false;
    try {
      full = block.permutation.getState("honey_level") === 5;
    } catch {
      return;
    }
    if (!full) return;
    const dim = block.dimension;
    const at = { ...block.location };
    system.run(() => {
      try {
        // Only a real harvest counts: if the tap was canceled (a land claim, adventure mode...) the hive is still full.
        const level = dim.getBlock(at)?.permutation.getState("honey_level");
        if (level === undefined || level === 5) return;
        if (foraging() && isNight() && player.isValid && chance(CONFIG.forage.glowHoney)) giveIngredient(player, "glow_honey", "a hive at night");
      } catch (e) {
        console.warn(`[cooking] hive: ${e}`);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

/** "30 Crowns", "8 Cooked Beef", "1 Storm Eel + 60 Crowns". @param {Offer} o */
const offerText = (o) => [...(o.items ?? []).map((n) => needText(n)), ...(o.crowns ? [`${o.crowns} Crowns`] : [])].join(" + ");

/** How a recipe is learned, for the cookbook. @param {Dish} d */
function howToLearn(d) {
  if (d.tier === "basic") return "Everyone knows this one.";
  const parts = [];
  if (d.learn?.length) parts.push(`${CONFIG.chefName} teaches it for ${d.learn.map(offerText).join(", or for ")}.`);
  if (d.card) parts.push("Recipe cards for it drop from champions.");
  parts.push(d.learn?.length ? "Stories may teach it too." : "Stories may teach it.");
  return parts.join(" ");
}

/** The recipe's page: ingredients (with what you carry), effects, how to learn it; cook buttons at a pot. @param {Player} player @param {Dish} d @param {Pot} [pot] */
async function recipeView(player, d, pot) {
  const known = knownSet(player).has(d.id);
  const c = containerOf(player);
  const h = c ? haves(c, d.needs) : d.needs.map(() => 0);
  const lines = [`§7${d.blurb}`, "", `§fMakes ${d.yield} (${itemName(d.base)}). Needs:`];
  d.needs.forEach((need, k) => lines.push(`${h[k] >= need[1] ? "§a" : "§c"} ${needText(need)} §8(you have ${h[k]})`));
  lines.push("", "§fWhen eaten:");
  if (d.roll) lines.push(" §dRolls for a surprise: mostly a good buff, sometimes something silly.");
  else lines.push(...d.effects.map((fx) => ` ${fxLore(fx)}`));
  if (d.returns) lines.push(`§8Gives back ${d.returns.map((n) => needText(n)).join(", ")}.`);
  lines.push("", known ? "§aYou know this recipe." : `§7${howToLearn(d)}`);
  const n = known ? Math.min(servingsNow(player, d), Math.max(1, CONFIG.maxBatch)) : 0;
  const where = pot ?? (get("cookAnywhere") === true ? { dim: player.dimension.id, loc: { x: player.location.x - 0.5, y: player.location.y, z: player.location.z - 0.5 } } : undefined);
  if (known && !where) lines.push("§7Cook it at a cooking pot: a cauldron over a lit campfire.");
  const form = new ActionFormData().title(d.name).body(lines.join("\n"));
  /** @type {number[]} */
  const counts = [];
  if (where && n >= 1) {
    form.button(`Cook 1 batch\n§8${d.yield} serving${d.yield > 1 ? "s" : ""}`);
    counts.push(1);
    if (n > 1) {
      form.button(`Cook ${n} batches\n§8${n * d.yield} servings`);
      counts.push(n);
    }
  }
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return false;
  const times = counts[res.selection];
  if (times === undefined || !where) return true;
  const why = cook(player, d, times, where);
  if (why) player.sendMessage(`§c${why}`);
  return false;
}

/**
 * A list of recipes; picking one opens its page. @param {Player} player @param {string} title
 * @param {string} body @param {Dish[]} list @param {Pot} [pot]
 */
async function recipeList(player, title, body, list, pot) {
  for (;;) {
    const known = knownSet(player);
    const form = new ActionFormData().title(title).body(body);
    for (const d of list) {
      if (!known.has(d.id)) {
        form.button(`§8${d.name}\n§8${d.tier === "basic" ? "" : d.learn?.length ? "Bea can teach it" : "From a card or a story"}`);
        continue;
      }
      const n = servingsNow(player, d);
      form.button(n > 0 ? `§2${d.name}\n§8Ready: ${Math.min(n, CONFIG.maxBatch) * d.yield} servings` : `${d.name}\n§8Missing: ${missingText(player, d.needs)}`);
    }
    form.button("Back");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
    const d = list[res.selection];
    if (!d) return;
    if (!(await recipeView(player, d, pot))) return;
  }
}

/** Known recipes, the ones you can cook first. @param {Player} player */
function cookable(player) {
  const known = knownSet(player);
  return DISHES.filter((d) => known.has(d.id))
    .map((d) => ({ d, n: servingsNow(player, d) }))
    .sort((a, b) => Number(b.n > 0) - Number(a.n > 0))
    .map((x) => x.d);
}

/** The cooking pot's menu. @param {Player} player @param {Pot} pot */
async function potMenu(player, pot) {
  readCards(player);
  const list = cookable(player);
  const ready = list.filter((d) => servingsNow(player, d) > 0).length;
  await recipeList(player, "Cooking Pot", ready ? `You can cook ${ready} of your ${list.length} recipes with what you carry. Pick one.` : "You don't carry the ingredients for any recipe you know. Pick one to see what it needs.", list, pot);
}

/** @param {Player} player */
async function ingredientsView(player) {
  const c = containerOf(player);
  const count = new Map();
  if (c) {
    for (let i = 0; i < c.size; i++) {
      const ing = ingOf(c.getItem(i));
      if (ing) count.set(ing.id, (count.get(ing.id) ?? 0) + (c.getItem(i)?.amount ?? 0));
    }
  }
  const lines = INGREDIENTS.map((i) => {
    const uses = DISHES.filter((d) => d.needs.some(([id]) => id === `ing:${i.id}`)).map((d) => d.name);
    return `§6${i.name}§r x${count.get(i.id) ?? 0}\n§7${i.source}. §8For: ${uses.join(", ")}`;
  });
  await show(player, new ActionFormData().title("Rare ingredients").body(lines.join("\n\n")).button("Back"));
}

/** /realm:cooking @param {Player} player */
async function mainMenu(player) {
  for (;;) {
    readCards(player);
    const known = knownSet(player);
    const st = statsOf(player);
    const op = isOp(player);
    const body = [
      `Recipes known: ${known.size}/${DISHES.length}. Servings cooked: ${st.c}. Dishes eaten: ${st.e}.`,
      "",
      "Cook at a cooking pot: a cauldron over a lit campfire. Tap it with an empty hand, or sneak and tap.",
      `Learn recipes from ${CONFIG.chefName} (her Kitchen), stories and recipe cards.`,
    ].join("\n");
    /** @type {[string, () => Promise<unknown>][]} */
    const actions = [
      ["What can I cook?", () => recipeList(player, "What can I cook?", "Your recipes, the ones you have everything for first.", cookable(player))],
      ["My recipes", () => recipeList(player, "My recipes", `You know ${known.size} recipes.`, DISHES.filter((d) => known.has(d.id)))],
      ["Cookbook", () => recipeList(player, "Cookbook", "Every recipe in the realm. Gray ones you haven't learned yet.", DISHES)],
      ["Rare ingredients", () => ingredientsView(player)],
    ];
    if (op) {
      actions.push(["§4Teach or forget recipes", () => opTeach(player)]);
      actions.push(["§4Give dishes and ingredients", () => opGive(player)]);
    }
    const form = new ActionFormData().title("Kitchen").body(body);
    for (const [label] of actions) form.button(label);
    form.button("Close");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
    const act = actions[res.selection];
    if (!act) return;
    await act[1]();
  }
}

/** Bea's Kitchen (an NPC with the chef role). @param {Player} player @param {string} [npcName] */
async function kitchen(player, npcName) {
  readCards(player);
  const title = npcName ? plain(npcName) : CONFIG.chefName;
  const who = title.split(" ")[0];
  const line = BEA_LINES[Math.floor(Math.random() * BEA_LINES.length)];
  for (;;) {
    const known = knownSet(player);
    const teachable = DISHES.filter((d) => d.learn?.length && !known.has(d.id));
    const form = new ActionFormData()
      .title(`${title}: Kitchen`)
      .body(`${who}: "${line}"\n\nYou know ${known.size} of ${DISHES.length} recipes. You have ${crownsOf(player)} Crowns.`);
    /** @type {(Dish | string)[]} */
    const rows = [];
    for (const d of teachable) {
      form.button(`Learn: ${d.name}\n§8${d.learn?.map(offerText).join(" or ")}`);
      rows.push(d);
    }
    form.button("What can I cook?");
    rows.push("cook");
    form.button("Rare ingredients");
    rows.push("ings");
    form.button("Goodbye");
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
    const row = rows[res.selection];
    if (row === undefined) return;
    if (row === "cook") await recipeList(player, "What can I cook?", "Your recipes, the ones you have everything for first.", cookable(player));
    else if (row === "ings") await ingredientsView(player);
    else if (typeof row !== "string") await teach(player, row, who);
  }
}

// Townsfolk (Hearth & Hearsay): Bea's friends pay fewer Crowns for recipes. realm:affinity gives the percent off
// with Bea (`off`), on a level change and when the player joins; kept in memory only.
/** @type {Map<string, number>} player id -> percent off */
const beaOff = new Map();
onScriptEvent(
  "realm:affinity",
  ({ id, message }) => {
    if (id !== "realm:affinity") return;
    try {
      const m = JSON.parse(message);
      if (!m || typeof m.player !== "string") return;
      if (m.all && typeof m.all === "object") beaOff.set(m.player, Number(m.off?.bea) || 0);
      else if (m.npc === "bea") beaOff.set(m.player, Number(m.off) || 0);
    } catch {
      // not ours
    }
  },
);

/** A recipe offer with Bea's friend price on its Crowns (rounded down). @template {{ crowns?: number }} O @param {Player} player @param {O} o @returns {O} */
function beaPrice(player, o) {
  const off = Math.max(0, Math.min(50, beaOff.get(player.id) ?? 0));
  return off && o.crowns && o.crowns > 0 ? { ...o, crowns: Math.max(1, Math.floor((o.crowns * (100 - off)) / 100)) } : o;
}

/** Bea teaches one recipe for one of its offers. @param {Player} player @param {Dish} d @param {string} who */
async function teach(player, d, who) {
  const offers = (d.learn ?? []).map((o) => beaPrice(player, o));
  const form = new ActionFormData().title(d.name).body(`${who}: "${d.blurb}. I'll teach you."\n\n${howToLearn(d)}`);
  const can = offers.map((o) => crownsOf(player) >= (o.crowns ?? 0) && (!o.items || timesAffordable(player, o.items) >= 1));
  offers.forEach((o, i) => form.button(`${can[i] ? "" : "§8"}Pay ${offerText(o)}${can[i] ? "" : "\n§8You don't have it"}`));
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  const o = offers[res.selection];
  if (!o) return;
  if (knownSet(player).has(d.id)) return;
  if (crownsOf(player) < (o.crowns ?? 0) || (o.items && timesAffordable(player, o.items) < 1)) {
    player.sendMessage(`§c${who}: "Come back when you have ${offerText(o)}."`);
    return;
  }
  if (o.items && !takeNeeds(player, o.items, 1)) return;
  if (o.crowns) addCrowns(player, -o.crowns);
  learn(player, d, `taught by ${who}`);
}

/** Operators: teach or forget recipes. @param {Player} op */
async function opTeach(op) {
  const players = world.getAllPlayers();
  const names = ["All recipes", ...DISHES.map((d) => d.name)];
  const form = new ModalFormData()
    .title("Teach or forget recipes")
    .dropdown("Player", players.map((p) => p.name), { defaultValueIndex: Math.max(0, players.findIndex((p) => p.id === op.id)) })
    .dropdown("Recipe", names, { defaultValueIndex: 0 })
    .toggle("Forget instead of teach (basics can't be forgotten)", { defaultValue: false })
    .submitButton("OK");
  const res = await show(op, form);
  if (!res || res.canceled || !res.formValues || !op.isValid) return;
  if (!isOp(op)) return op.sendMessage("§cOnly operators can do that."); // de-opped while the form was open
  const [pi, ri, forget] = res.formValues;
  const p = players[Number(pi)];
  if (!p?.isValid) return;
  const list = Number(ri) === 0 ? DISHES : [DISHES[Number(ri) - 1]].filter(Boolean);
  if (forget) {
    const drop = new Set(list.map((d) => d.id));
    saveJson(p, PROP_KNOWN, learned(p).filter((id) => !drop.has(id)));
    op.sendMessage(`§7${p.name} forgot ${list.length === 1 ? list[0].name : "every learned recipe"}.`);
    return;
  }
  let n = 0;
  for (const d of list) if (learn(p, d, `taught by ${op.name}`)) n++;
  op.sendMessage(`§7Taught ${p.name} ${n} new recipe${n === 1 ? "" : "s"}.`);
}

/** Operators: give dishes, ingredients or recipe cards. @param {Player} op */
async function opGive(op) {
  const players = world.getAllPlayers();
  /** @type {[string, (n: number) => ItemStack][]} */
  const items = [
    ...DISHES.map((d) => /** @type {[string, (n: number) => ItemStack]} */ ([d.name, (n) => dishStack(d, n)])),
    ...INGREDIENTS.map((i) => /** @type {[string, (n: number) => ItemStack]} */ ([i.name, (n) => ingStack(i, n)])),
    ...CARD_DISHES.map((d) => /** @type {[string, (n: number) => ItemStack]} */ ([`${CARD_PREFIX}${d.name}`, (n) => cardStack(d, n)])),
  ];
  const form = new ModalFormData()
    .title("Give dishes and ingredients")
    .dropdown("Player", players.map((p) => p.name), { defaultValueIndex: Math.max(0, players.findIndex((p) => p.id === op.id)) })
    .dropdown("Item", items.map(([n]) => n), { defaultValueIndex: 0 })
    .slider("How many", 1, 64, { valueStep: 1, defaultValue: 1 })
    .submitButton("Give");
  const res = await show(op, form);
  if (!res || res.canceled || !res.formValues || !op.isValid) return;
  if (!isOp(op)) return op.sendMessage("§cOnly operators can do that."); // de-opped while the form was open
  const [pi, ii, count] = res.formValues;
  const p = players[Number(pi)];
  const it = items[Number(ii)];
  if (!p?.isValid || !it) return;
  giveItems(p, it[1](1), Number(count) || 1);
  op.sendMessage(`§7Gave ${p.name} ${count} ${it[0]}.`);
}

// ---------------------------------------------------------------------------
// Script events: townsfolk, champions, moons, sky, stories and tests
// ---------------------------------------------------------------------------

/** The NPC each player last talked to, for the Kitchen's title. @type {Map<string, string>} */
const lastNpc = new Map();

/** @param {unknown} v @returns {Dish | undefined} */
const findDish = (v) => (typeof v === "string" ? dishByKey.get(keyOf(v)) : undefined);
/** @param {unknown} v @returns {Ingredient | undefined} */
const findIng = (v) => (typeof v === "string" ? ingByKey.get(keyOf(v)) : undefined);
/** @param {unknown} v */
const amountOf = (v) => Math.max(1, Math.min(640, Math.floor(Number(v) || 1)));

onScriptEvent(
  [
  "realm:npc_talk",
  "realm:npc_choose",
  "realm:champion_slain",
  "realm:moon",
  "realm:sky_event",
  "realm:recipe_learn",
  "realm:dish_give",
  "realm:ingredient_give",
  "realm:cooking_cook",
  "realm:cooking_eat",
  "realm:cooking_owed_ping",
  "realm:cooking_owed_test",
  ],
  ({ id, message, sourceType }) => {
    /** @type {any} */
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    try {
      if (id === "realm:cooking_owed_test") {
        // Tests (console only): seed an old-layout owed map, hand a stored debt to a named player, report the saved keys.
        if (sourceType !== ScriptEventSource.Server) return;
        if (msg.seed && typeof msg.seed === "object") world.setDynamicProperty("cooking:owed", JSON.stringify(msg.seed));
        if (typeof msg.claim === "string" && typeof msg.as === "string") {
          const who = world.getPlayers({ name: msg.as })[0];
          if (who) applyOwed(who, msg.claim, Array.isArray(msg.fail) ? new Set(msg.fail.map(String)) : undefined);
        }
        const ids = owedStore.ids().slice(0, 10);
        /** @type {Record<string, unknown>} */
        const values = {};
        for (const pid of ids) values[pid] = owedStore.get(pid);
        const legacy = world.getDynamicProperty("cooking:owed");
        const full = {
          keys: world.getDynamicPropertyIds().filter((k) => k.startsWith("cooking:owed")).slice(0, 20),
          index: ids,
          values,
          legacy: typeof legacy === "string" ? JSON.parse(legacy) : null,
        };
        // A script event message is limited to 2048 characters: a report that does not fit says so instead of being cut.
        const text = JSON.stringify(full);
        if (text.length < 2000) send("realm:cooking_owed_test_report", full);
        else {
          console.warn(`[cooking] owed test report is ${text.length} characters, too long to send`);
          send("realm:cooking_owed_test_report", { error: "too long", length: text.length });
        }
        return;
      }
      if (id === "realm:cooking_owed_ping") {
        // Tests: how many players are owed dishes and how many batches in all.
        const lists = owedStore.ids().map((pid) => owedStore.get(pid)).filter((m) => m && typeof m === "object");
        const batches = lists.reduce((sum, m) => sum + Object.values(m ?? {}).reduce((a, b) => a + (Math.floor(Number(b)) || 0), 0), 0);
        send("realm:cooking_owed", { players: lists.length, batches });
        return;
      }
      switch (id) {
        case "realm:npc_talk":
          if (typeof msg.req !== "string" || !Array.isArray(msg.roles) || !msg.roles.includes(CONFIG.chefRole)) return;
          if (typeof msg.player === "string" && typeof msg.name === "string") lastNpc.set(msg.player, msg.name);
          send("realm:npc_offer", { req: msg.req, pack: PACK, key: "kitchen", label: "Kitchen", order: 15 });
          return;
        case "realm:npc_choose": {
          if (msg.pack !== PACK || msg.key !== "kitchen" || typeof msg.player !== "string") return;
          const p = online(msg.player);
          if (p) kitchen(p, lastNpc.get(p.id)).catch((e) => console.warn(`[cooking] kitchen: ${e}`));
          return;
        }
        case "realm:champion_slain":
          onChampion(msg);
          return;
        case "realm:moon":
          if (msg.state === "blood" || msg.state === "harvest") {
            const was = moonIs(msg.state);
            saveJson(world, PROP_MOON, { s: msg.state, t: Date.now(), a: world.getAbsoluteTime() });
            if (!was && foraging()) {
              if (msg.state === "harvest" && CONFIG.forage.harvestSaffron > 0) world.sendMessage("§6Kitchen: §7ripe crops harvested tonight may give §fHarvest Saffron§7.");
              if (msg.state === "blood" && CONFIG.forage.moonSalt > 0) world.sendMessage("§6Kitchen: §7monsters slain tonight may drop §fMoon Salt§7.");
            }
          } else saveJson(world, PROP_MOON, undefined);
          return;
        case "realm:sky_event":
          if (msg.kind === "aurora" || msg.kind === "meteor") {
            const open = starNight();
            world.setDynamicProperty(PROP_STAR, Date.now());
            if (!open && foraging() && CONFIG.forage.starwrightFlour > 0) {
              world.sendMessage(`§6Stardust settles on the fields. §7Ripe wheat harvested in the next ${CONFIG.starMinutes} minutes may give §fStarwright Flour§7 (Kitchen).`);
            }
          }
          return;
      }
      // The rest name a player and a recipe, dish or ingredient.
      const pid = typeof msg.player === "string" ? msg.player : undefined;
      if (!pid) return;
      const p = online(pid);
      if (id === "realm:recipe_learn") {
        const d = findDish(msg.recipe);
        if (!d) return console.warn(`[cooking] realm:recipe_learn: unknown recipe ${msg.recipe}`);
        if (p) learn(p, d, "from a story");
        else addPending(pid, d);
        return;
      }
      if (!p) return;
      if (id === "realm:dish_give") {
        const d = findDish(msg.dish);
        if (d) giveItems(p, dishStack(d, 1), amountOf(msg.amount));
      } else if (id === "realm:ingredient_give") {
        const ing = findIng(msg.ingredient);
        if (ing) giveItems(p, ingStack(ing, 1), amountOf(msg.amount));
      } else if (id === "realm:cooking_cook") {
        const d = findDish(msg.recipe);
        if (!d) return;
        const why = cook(p, d, amountOf(msg.times), { dim: p.dimension.id, loc: { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) } });
        if (why) p.sendMessage(`§c${why}`);
      } else if (id === "realm:cooking_eat") {
        const d = findDish(msg.dish);
        if (d) eat(p, d);
      }
    } catch (e) {
      console.warn(`[cooking] ${id}: ${e}`);
    }
  },
);

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:cooking",
      description: "Kitchen: your recipes, what you can cook, the cookbook and rare ingredients",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => mainMenu(player).catch((e) => console.warn(`[cooking] ${e}`)));
      return { status: CustomCommandStatus.Success };
    },
  );
});

// Callings (Skills): realm:calling carries each player's talent numbers (`bonus`: dishPct: Hearthkeeper's longer dish effects). Kept in memory; Skills
// sends it when a player joins or changes it, and again on realm:calling_ping (asked once the world has loaded).
/** @type {Map<string, Record<string, number>>} */
const callingBonus = new Map();
onScriptEvent(
  "realm:calling",
  ({ id, message }) => {
    if (id !== "realm:calling") return;
    try {
      const m = JSON.parse(message);
      if (m && typeof m.player === "string" && m.bonus && typeof m.bonus === "object") callingBonus.set(m.player, m.bonus);
    } catch {
      // not ours
    }
  },
);
world.afterEvents.worldLoad.subscribe(() => system.runTimeout(() => system.sendScriptEvent("realm:calling_ping", "{}"), 140));
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  callingBonus.delete(playerId);
  beaOff.delete(playerId); // Townsfolk sends it again when the player joins
  lastNpc.delete(playerId);
});
/** A Calling talent's number for the player (0 without it). @param {Player} player @param {string} key */
const callingValue = (player, key) => Math.max(0, Number(callingBonus.get(player.id)?.[key]) || 0);

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
onScriptEvent(
  "realm:help_ping",
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "cooking_bp");
  },
);
