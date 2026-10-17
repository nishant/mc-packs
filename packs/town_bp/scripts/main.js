import {
  BlockPermutation,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Dimension,
  ItemLockMode,
  LiquidType,
  Player,
  ScriptEventSource,
  StructureRotation,
  StructureSaveMode,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, MessageFormData, ModalFormData, uiManager } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, onChange } from "./settings.js";

// One world property per town ("town:t:<id>": name, center, level, build spots) and one per project of
// each town ("town:p:<town>:<project>": items delivered, contributors, finished, built), so a busy
// town's contributor lists never come near the 32 KB property limit. Rewards for contributors who
// were offline when a project finished wait in "town:owed" until they join.

const TOWN_PREFIX = "town:t:";
const PROG_PREFIX = "town:p:";
const PROP_OWED = "town:owed";
const MAX_LEVEL = 5;
const NAME_LENGTH = 24;
const PROP_LIMIT = 30000;
const BUILD_CHECK_TICKS = 100;
const NEAR_SPOT = 64; // a waiting build goes up when a player is this close to its spot
const BUILDS = ["well", "lamps", "stall", "bell_tower", "dock", "garden", "notice_board"];

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {typeof CONFIG.projects[number]} Project */
/**
 * f: 0 south, 1 west, 2 north, 3 east (the way the build faces). Once built: snap 1 when the ground under it was saved as
 * the structure snapId(town, project) before building, and b the box it covers [x1, y1, z1, x2, y2, z2]; old 1 when it was
 * built before snapshots existed (so what's there is never saved as the ground).
 * @typedef {{ x: number, y: number, z: number, f: number, snap?: number, b?: number[], old?: number }} Spot
 */
/** prot: 0 when "Protect from world events" is Disabled (missing means Enabled). */
/** @typedef {{ id: string, n: string, dim: string, x: number, y: number, z: number, lvl: number, spots: Record<string, Spot>, by: string, at: number, prot?: number }} Town */
/** @typedef {{ min: Vector3, max: Vector3 }} Box inclusive block corners */
/** @typedef {{ got: Record<string, number>, c: Record<string, [string, number]>, done: number, built: number }} Progress */
/** @typedef {{ cr: number, q: [string, string, string][] }} Owed crowns, and [quest id, label, guild] per finished project */

/** Projects from config.js that make sense; the rest are skipped with a warning. */
const PROJECTS = CONFIG.projects.filter((p) => {
  const okay = /^[a-z0-9_]{1,32}$/.test(p.id) && p.level >= 1 && p.level < MAX_LEVEL && Object.keys(p.needs ?? {}).length > 0 && BUILDS.includes(p.build);
  if (!okay) console.warn(`[town] project "${p.id}" in config.js is skipped: check its id, level (1 to 4), needs and build`);
  return okay;
});
const byId = new Map(PROJECTS.map((p) => [p.id, p]));

/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
/** Checked again once a form comes back: a player de-opped while it was open can't use it. @param {Player} player */
const stillOp = (player) => isOp(player) || (player.sendMessage("§cOnly operators can do that."), false);
/** 12345 -> "12,345". @param {number} n */
const fmt = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
/** "minecraft:oak_planks" -> "Oak Planks". @param {string} id */
const itemName = (id) =>
  id
    .replace(/^minecraft:/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
/** @param {number} lvl */
const levelName = (lvl) => CONFIG.levelNames[lvl - 1] ?? `Level ${lvl}`;
/** @param {string} id */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);
/** @param {string} id @param {object} data */
const send = (id, data) => system.sendScriptEvent(id, JSON.stringify(data));
/** @param {number} lvl */
const projectsAt = (lvl) => PROJECTS.filter((p) => p.level === lvl);
/** @param {Project} p */
const needTotal = (p) => Object.values(p.needs).reduce((a, b) => a + b, 0);

/** @param {string} key @returns {any} */
function readJson(key) {
  try {
    const raw = world.getDynamicProperty(key);
    return typeof raw === "string" ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

// Crowns (the Crowns pack shows balances; any pack may pay into the objective)
function crownsObjective() {
  try {
    return world.scoreboard.getObjective("crowns") ?? world.scoreboard.addObjective("crowns", "Crowns");
  } catch {
    return world.scoreboard.getObjective("crowns");
  }
}

// ---------------------------------------------------------------------------
// Towns and progress (cached; this pack is the only writer)
// ---------------------------------------------------------------------------

/** @type {Map<string, Town> | undefined} */
let towns;

/** @returns {Map<string, Town>} */
function allTowns() {
  if (towns) return towns;
  /** @type {Map<string, Town>} */
  const map = new Map();
  try {
    for (const key of world.getDynamicPropertyIds()) {
      if (!key.startsWith(TOWN_PREFIX)) continue;
      const t = readJson(key);
      if (t && typeof t.id === "string" && typeof t.x === "number") map.set(t.id, { ...t, spots: t.spots ?? {}, lvl: t.lvl ?? 1 });
    }
  } catch {
    return map; // the world isn't loaded yet: read again next time
  }
  return (towns = map);
}

/** @param {Town} t */
function saveTown(t) {
  allTowns().set(t.id, t);
  world.setDynamicProperty(TOWN_PREFIX + t.id, JSON.stringify(t));
}

/** @type {Map<string, Progress>} */
const progCache = new Map();

/** @param {Town} t @param {Project} p @returns {Progress} */
function progressOf(t, p) {
  const key = `${PROG_PREFIX}${t.id}:${p.id}`;
  let pr = progCache.get(key);
  if (pr) return pr;
  const raw = readJson(key);
  pr = raw && typeof raw === "object" ? { got: raw.got ?? {}, c: raw.c ?? {}, done: raw.done ? 1 : 0, built: raw.built ? 1 : 0 } : { got: {}, c: {}, done: 0, built: 0 };
  progCache.set(key, pr);
  return pr;
}

/** @param {Town} t @param {Project} p @param {Progress} pr */
function saveProgress(t, p, pr) {
  const key = `${PROG_PREFIX}${t.id}:${p.id}`;
  let json = JSON.stringify(pr);
  // Hundreds of contributors: keep the biggest ones so the property stays under the limit.
  while (json.length > PROP_LIMIT && Object.keys(pr.c).length > 10) {
    const smallest = Object.entries(pr.c).sort((a, b) => a[1][1] - b[1][1])[0][0];
    delete pr.c[smallest];
    json = JSON.stringify(pr);
  }
  progCache.set(key, pr);
  world.setDynamicProperty(key, json);
}

/** Items delivered toward a project, capped at what it needs. @param {Project} p @param {Progress} pr */
const delivered = (p, pr) => Object.entries(p.needs).reduce((sum, [item, n]) => sum + Math.min(n, pr.got[item] ?? 0), 0);
/** @param {Project} p @param {Progress} pr */
const pct = (p, pr) => (pr.done ? 100 : Math.min(99, Math.floor((delivered(p, pr) * 100) / Math.max(1, needTotal(p)))));

/** Nearest town in the player's dimension, within `max` blocks (flat). @param {Player} player @param {number} [max] */
function nearestTown(player, max = Infinity) {
  let best;
  let bestD = max;
  for (const t of allTowns().values()) {
    if (t.dim !== player.dimension.id) continue;
    const d = Math.hypot(t.x - player.location.x, t.z - player.location.z);
    if (d <= bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

/** Guild for a project by its materials: wood, crops and wool are the growers', stone and metal the miners'. @param {Project} p */
function guildFor(p) {
  const growers = /log|plank|wood|stem|wheat|seed|carrot|potato|beetroot|bone_meal|sapling|flower|leaves|wool|hay|melon|pumpkin|sugar|bamboo|sign|fence|barrel|stick/;
  let g = 0;
  let m = 0;
  for (const [item, n] of Object.entries(p.needs)) {
    if (growers.test(item)) g += n;
    else m += n;
  }
  return g >= m ? "growers" : "miners";
}

// ---------------------------------------------------------------------------
// Rewards (paid now, or kept until the contributor joins)
// ---------------------------------------------------------------------------

/** @returns {Record<string, Owed>} */
function owedAll() {
  const raw = readJson(PROP_OWED);
  /** @type {Record<string, Owed>} */
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [pid, o] of Object.entries(raw)) {
    if (!o || typeof o !== "object") continue;
    const q = Array.isArray(o.q) ? o.q.filter((/** @type {unknown} */ x) => Array.isArray(x) && x.length === 3 && x.every((y) => typeof y === "string")) : [];
    out[pid] = { cr: Math.max(0, Math.floor(Number(o.cr) || 0)), q };
  }
  return out;
}

/** @param {Player} p @param {number} crowns @param {[string, string, string][]} quests @param {string} why */
function payNow(p, crowns, quests, why) {
  if (crowns > 0) {
    try {
      crownsObjective()?.addScore(p, Math.floor(crowns));
      p.sendMessage(`§6+${Math.floor(crowns)} Crowns §7(${why})`);
    } catch (e) {
      console.warn(`[town] crowns: ${e}`);
    }
  }
  const rep = get("repPerProject");
  for (const [id, label, guild] of quests) {
    send("realm:quest_done", { player: p.id, pack: "town_bp", id, label, kind: "town", guild });
    if (rep > 0) send("realm:rep_add", { player: p.id, guild, amount: rep, reason: label });
  }
}

/** @param {string} pid @param {number} crowns @param {[string, string, string]} quest */
function owe(pid, crowns, quest) {
  const all = owedAll();
  const o = all[pid] ?? { cr: 0, q: [] };
  o.cr += crowns;
  o.q = [...o.q, quest].slice(-10);
  all[pid] = o;
  // Many offline contributors: keep everyone's Crowns, and only their latest finished projects.
  let json = JSON.stringify(all);
  for (let keep = 5; json.length > PROP_LIMIT && keep >= 0; keep--) {
    for (const v of Object.values(all)) v.q = v.q.slice(-keep);
    json = JSON.stringify(all);
  }
  try {
    world.setDynamicProperty(PROP_OWED, json);
  } catch (e) {
    console.warn(`[town] owed: ${e}`);
  }
}

/** @param {Player} p */
function payOwed(p) {
  const all = owedAll();
  const o = all[p.id];
  if (!o) return;
  delete all[p.id];
  world.setDynamicProperty(PROP_OWED, Object.keys(all).length ? JSON.stringify(all) : undefined);
  p.sendMessage("§6Town projects you helped with were finished while you were away. Thank you!");
  payNow(p, o.cr, o.q, "Town projects");
}

// ---------------------------------------------------------------------------
// Delivering
// ---------------------------------------------------------------------------

/**
 * Can this stack go into a project? Never a locked item, an item with lore (Storm Glass, Relic Shards, relics and
 * other packs' special items look like plain vanilla items otherwise) or, with `keepNamedItems`, a named one.
 * @param {import("@minecraft/server").ItemStack} it @param {string} item @param {boolean} keepNamed
 */
function deliverable(it, item, keepNamed) {
  if (it.typeId !== item || it.lockMode !== ItemLockMode.none || (keepNamed && it.nameTag)) return false;
  try {
    return it.getLore().length === 0;
  } catch {
    return true;
  }
}

/** How many of an item the player carries that could be delivered. @param {Player} player @param {string} item */
function carried(player, item) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  const keepNamed = get("keepNamedItems") === true;
  let n = 0;
  if (inv)
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it && deliverable(it, item, keepNamed)) n += it.amount;
    }
  return n;
}

/** Takes up to `max` of an item from the inventory; returns how many. @param {Player} player @param {string} item @param {number} max */
function take(player, item, max) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  if (!inv || max <= 0) return 0;
  const keepNamed = get("keepNamedItems") === true;
  let took = 0;
  for (let i = 0; i < inv.size && took < max; i++) {
    const it = inv.getItem(i);
    if (!it || !deliverable(it, item, keepNamed)) continue;
    const n = Math.min(it.amount, max - took);
    if (n >= it.amount) inv.setItem(i, undefined);
    else inv.getSlot(i).amount = it.amount - n;
    took += n;
  }
  return took;
}

/** @param {Player} player @param {Town} t @param {Project} p */
function deliver(player, t, p) {
  if (!allTowns().has(t.id)) return player.sendMessage("§cThat town was removed.");
  if (p.level !== t.lvl) return player.sendMessage(`§e${p.name} isn't open in ${t.n} right now.`);
  const pr = progressOf(t, p);
  if (pr.done) return player.sendMessage(`§e${t.n}'s ${p.name} already has everything it needs.`);
  /** @type {string[]} */
  const gave = [];
  let total = 0;
  // A Heartened town (a Choir siege held, Realm Calendar) counts every delivery x1.25.
  const mult = moodOf(t.id) === "heartened" ? HEARTENED : 1;
  for (const [item, need] of Object.entries(p.needs)) {
    const left = need - (pr.got[item] ?? 0);
    if (left <= 0) continue;
    const n = take(player, item, Math.ceil(left / mult));
    if (!n) continue;
    const counted = Math.min(left, Math.max(n, Math.floor(n * mult + 1e-9)));
    pr.got[item] = (pr.got[item] ?? 0) + counted;
    total += counted;
    gave.push(`${fmt(n)} ${itemName(item)}`);
  }
  if (!total) {
    player.sendMessage(`§eYou don't have any of what the ${p.name} still needs. §7${stillNeeds(p, pr)}`);
    return;
  }
  const mine = pr.c[player.id];
  pr.c[player.id] = [player.name, (mine?.[1] ?? 0) + total];
  const complete = Object.entries(p.needs).every(([item, n]) => (pr.got[item] ?? 0) >= n);
  if (complete) pr.done = 1;
  saveProgress(t, p, pr);
  player.sendMessage(`§aYou delivered ${gave.join(", ")} for ${t.n}'s ${p.name}.${mult > 1 ? " §6Heartened: it counts x1.25!" : ""} §7Now ${pct(p, pr)} percent.`);
  player.playSound("random.orb", { pitch: 1.2, volume: 0.7 });
  if (complete) finishProject(t, p, pr);
}

/** "Still needs: 12 Oak Planks, 4 Iron Ingot" @param {Project} p @param {Progress} pr */
function stillNeeds(p, pr) {
  const rest = Object.entries(p.needs)
    .map(([item, n]) => [item, n - (pr.got[item] ?? 0)])
    .filter(([, n]) => Number(n) > 0)
    .map(([item, n]) => `${fmt(Number(n))} ${itemName(String(item))}`);
  return rest.length ? `Still needs: ${rest.join(", ")}.` : "It has everything it needs.";
}

/** Highest first. @param {Progress} pr @returns {[string, string, number][]} id, name, amount */
const ranking = (pr) =>
  Object.entries(pr.c)
    .map(([id, [name, n]]) => /** @type {[string, string, number]} */ ([id, name, n]))
    .filter(([, , n]) => n > 0)
    .sort((a, b) => b[2] - a[2]);

/** @param {Town} t @param {Project} p @param {Progress} pr */
function finishProject(t, p, pr) {
  const ranked = ranking(pr);
  const top = ranked
    .slice(0, 3)
    .map(([, name, n]) => `${name} ${fmt(n)}`)
    .join(", ");
  const line = `§6${t.n} finished its ${p.name}!${top ? ` Top contributors: ${top}.` : ""} Thank you, everyone!`;
  if (get("announce") === true) {
    world.sendMessage(line);
    for (const pl of world.getAllPlayers()) pl.playSound("random.levelup", { pitch: 1, volume: 0.7 });
  } else {
    for (const [id] of ranked) online(id)?.sendMessage(line);
  }
  /** @type {[string, string, string]} */
  const quest = [`town_${t.id}_${p.id}`, `Town project: ${p.name} (${t.n})`, guildFor(p)];
  // Townsfolk gossip (Hearth & Hearsay) about the top contributor.
  if (ranked[0]) send("realm:gossip", { kind: "town_project", player: ranked[0][0], name: ranked[0][1], place: `${p.name} in ${t.n}` });
  ranked.forEach(([id], i) => {
    const crowns = CONFIG.topCrowns[i] ?? 0;
    const pl = online(id);
    if (pl) payNow(pl, crowns, [quest], `${p.name}, ${t.n}`);
    else owe(id, crowns, quest);
  });
  build(t, p, true);
  levelUp(t);
  refreshBoard(t);
}

/** Raises the town while every project of its level is finished. @param {Town} t */
function levelUp(t) {
  let raised = false;
  while (t.lvl < MAX_LEVEL && projectsAt(t.lvl).every((p) => progressOf(t, p).done)) {
    t.lvl++;
    raised = true;
  }
  if (!raised) return;
  saveTown(t);
  const title = `${t.n} is now a ${levelName(t.lvl)} (level ${t.lvl})`;
  const next = projectsAt(t.lvl);
  const sub = next.length ? `New projects: ${next.map((p) => p.name).join(", ")}` : "Every project is done!";
  const everyone = get("announce") === true;
  for (const pl of world.getAllPlayers()) {
    const near = pl.dimension.id === t.dim && Math.hypot(pl.location.x - t.x, pl.location.z - t.z) <= get("townRadius");
    if (!everyone && !near) continue;
    system.sendScriptEvent("realm:title", JSON.stringify({ player: pl.id, ticks: 110, from: "town_bp" }));
    pl.onScreenDisplay.setTitle(`§6${title}`, { subtitle: `§7${sub}`, fadeInDuration: 10, stayDuration: 80, fadeOutDuration: 20 });
    pl.playSound("random.totem", { volume: 0.5 });
  }
  if (everyone) world.sendMessage(`§6${title}! §7${sub}.`);
  refreshBoard(t);
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

const PLANTS = new Set(
  [
    "air", "short_grass", "tall_grass", "fern", "large_fern", "deadbush", "snow_layer", "leaf_litter", "pink_petals", "wildflowers", "bush",
    "firefly_bush", "short_dry_grass", "tall_dry_grass", "sweet_berry_bush", "brown_mushroom", "red_mushroom", "vine", "poppy", "dandelion",
    "cornflower", "azure_bluet", "oxeye_daisy", "allium", "lily_of_the_valley", "orange_tulip", "red_tulip", "white_tulip", "pink_tulip",
    "blue_orchid", "sunflower", "lilac", "rose_bush", "peony", "torchflower", "open_eyeblossom", "closed_eyeblossom",
  ].map((b) => `minecraft:${b}`),
);
const GROUND = new Set(["grass_block", "dirt", "coarse_dirt", "podzol", "mycelium", "dirt_with_roots"].map((b) => `minecraft:${b}`));
const WATER = new Set(["water", "flowing_water", "seagrass", "kelp", "waterlily"].map((b) => `minecraft:${b}`));

/**
 * What each placement may replace: "air" air and plants; "ground" also grass and dirt (the top of the
 * ground, for a well's water or a garden's farmland); "water" also water (a dock's deck); "wet" only
 * water (a dock's posts, down to the bottom).
 * @typedef {"air" | "ground" | "water" | "wet"} Mode
 * @typedef {{ x: number, y: number, z: number, block: string, states?: Record<string, string | number | boolean>, mode: Mode }} Place
 * x: to the right, y: up from the spot (0 = feet, -1 = the ground), z: forward
 */

/** @param {string} type @param {Mode} mode */
function canReplace(type, mode) {
  if (mode === "wet") return WATER.has(type);
  if (PLANTS.has(type)) return true;
  if (mode === "ground") return GROUND.has(type);
  if (mode === "water") return WATER.has(type);
  return false;
}

/** The blocks of a build, in placing order (supports first). @param {Project["build"]} kind @returns {Place[]} */
function design(kind) {
  /** @type {Place[]} */
  const out = [];
  /** @param {number} x @param {number} y @param {number} z @param {string} block @param {Mode} [mode] @param {Record<string, string | number | boolean>} [states] */
  const at = (x, y, z, block, mode = "air", states) => out.push({ x, y, z, block, mode, states });
  const slab = { "minecraft:vertical_half": "bottom" };
  switch (kind) {
    case "well":
      for (let x = -2; x <= 2; x++)
        for (let z = 1; z <= 5; z++) {
          const ring = Math.abs(x) === 2 || z === 1 || z === 5;
          if (!ring) at(x, -2, z, "minecraft:cobblestone"); // only where it's open below, so the water can't drain into a cave
          at(x, -1, z, ring ? "minecraft:cobblestone" : "minecraft:water", "ground");
          if (ring) at(x, 0, z, "minecraft:cobblestone");
        }
      for (const [x, z] of [[-2, 1], [2, 1], [-2, 5], [2, 5]]) for (let y = 1; y <= 2; y++) at(x, y, z, "minecraft:oak_fence");
      for (let x = -2; x <= 2; x++) for (let z = 1; z <= 5; z++) at(x, 3, z, "minecraft:oak_slab", "air", slab);
      break;
    case "lamps":
      for (let z = 0; z <= 12; z += 4) {
        for (let y = 0; y <= 2; y++) at(0, y, z, "minecraft:oak_fence");
        at(0, 3, z, "minecraft:lantern", "air", { hanging: false });
      }
      break;
    case "stall":
      for (const [x, z] of [[-2, 1], [2, 1], [-2, 3], [2, 3]]) for (let y = 0; y <= 2; y++) at(x, y, z, "minecraft:oak_fence");
      for (let x = -1; x <= 1; x++) at(x, 0, 1, "minecraft:oak_planks");
      at(-1, 0, 3, "minecraft:barrel");
      at(1, 0, 3, "minecraft:barrel");
      for (let x = -2; x <= 2; x++) for (let z = 1; z <= 3; z++) at(x, 3, z, (x + 2) % 2 === 0 ? "minecraft:red_wool" : "minecraft:white_wool");
      break;
    case "bell_tower":
      for (const [x, z] of [[-1, 1], [1, 1], [-1, 3], [1, 3]]) for (let y = 0; y <= 4; y++) at(x, y, z, "minecraft:stone_bricks");
      for (let x = -1; x <= 1; x++) for (let z = 1; z <= 3; z++) at(x, 5, z, "minecraft:stone_bricks");
      at(0, 6, 2, "minecraft:stone_bricks");
      at(0, 7, 2, "minecraft:lightning_rod", "air", { facing_direction: 1 });
      at(0, 4, 2, "minecraft:bell", "air", { attachment: "hanging" });
      break;
    case "dock": {
      const length = 10;
      for (let z = 1; z <= length; z++) for (let x = -1; x <= 1; x++) at(x, -1, z, "minecraft:oak_planks", "water");
      for (let z = 2; z <= length; z += 3) for (const x of [-1, 1]) for (let y = -2; y >= -9; y--) at(x, y, z, "minecraft:oak_log", "wet");
      for (let z = 1; z <= length; z++) for (const x of [-1, 1]) at(x, 0, z, "minecraft:oak_fence");
      at(-1, 1, length, "minecraft:lantern", "air", { hanging: false });
      at(1, 1, length, "minecraft:lantern", "air", { hanging: false });
      break;
    }
    case "garden": {
      const crops = ["minecraft:wheat", "minecraft:carrots", "minecraft:potatoes", "minecraft:beetroot"];
      let k = 0;
      for (let x = -2; x <= 2; x++)
        for (let z = 1; z <= 5; z++) {
          const border = Math.abs(x) === 2 || z === 1 || z === 5;
          const middle = x === 0 && z === 3;
          if (middle) at(x, -2, z, "minecraft:dirt");
          at(x, -1, z, border ? "minecraft:oak_log" : middle ? "minecraft:water" : "minecraft:farmland", "ground", middle || border ? undefined : { moisturized_amount: 7 });
          if (middle) at(x, 0, z, "minecraft:waterlily");
          else if (!border) at(x, 0, z, crops[k++ % crops.length], "air", { growth: 0 });
        }
      break;
    }
    case "notice_board":
      for (const x of [-2, 2]) for (let y = 0; y <= 2; y++) at(x, y, 1, "minecraft:oak_log");
      for (let x = -1; x <= 1; x++) for (let y = 1; y <= 2; y++) at(x, y, 1, "minecraft:oak_planks");
      for (let x = -2; x <= 2; x++) at(x, 3, 1, "minecraft:oak_slab", "air", slab);
      // Signs on the front, facing the spot: filled in by refreshBoard.
      for (let x = -1; x <= 1; x++) out.push({ x, y: 1, z: 0, block: "minecraft:wall_sign", mode: "air" });
      break;
  }
  return out;
}

/** A block of a design that's only needed where it's open (a dock's posts, the floor under a well's or a garden's water). @param {Project} p @param {Place} pl */
const isOptional = (p, pl) => pl.mode === "wet" || ((p.build === "well" || p.build === "garden") && pl.y === -2);

const FORWARD = [
  { x: 0, z: 1 },
  { x: -1, z: 0 },
  { x: 0, z: -1 },
  { x: 1, z: 0 },
];

/** Local (right, up, forward) to world. @param {Spot} s @param {number} x @param {number} y @param {number} z */
function toWorld(s, x, y, z) {
  const f = FORWARD[s.f] ?? FORWARD[0];
  const r = { x: -f.z, z: f.x };
  return { x: s.x + r.x * x + f.x * z, y: s.y + y, z: s.z + r.z * x + f.z * z };
}

/** facing_direction of a wall sign whose text faces the way d points. @param {{ x: number, z: number }} d */
const wallFacing = (d) => (d.z < 0 ? 2 : d.z > 0 ? 3 : d.x < 0 ? 4 : 5);

/** @param {string} id @param {Record<string, string | number | boolean>} [states] */
function perm(id, states) {
  try {
    return BlockPermutation.resolve(/** @type {any} */ (id), /** @type {any} */ (states));
  } catch {
    return BlockPermutation.resolve(/** @type {any} */ (id));
  }
}

/**
 * Builds a finished project at its spot. Waits (returns false) without a spot or while the spot isn't
 * loaded; `fresh` tells operators what's missing. Before the first build at a spot, the ground it covers
 * is saved as a structure (snapId), so removing or moving the build can put it back (not for a spot marked
 * `old`: a project built before snapshots existed, rebuilt over what's left of it).
 * @param {Town} t @param {Project} p @param {boolean} fresh
 */
function build(t, p, fresh) {
  const pr = progressOf(t, p);
  if (!pr.done || pr.built) return false;
  const s = t.spots[p.id];
  if (!s) {
    if (fresh) tellOps(`§e[Town Projects] ${t.n}'s ${p.name} is finished. Stand where it should go, facing the way it should face, and run /realm:town_spot ${p.id}`);
    return false;
  }
  const waiting = () => {
    if (fresh) tellOps(`§e[Town Projects] ${t.n}'s ${p.name} will be built when someone is near its spot (${s.x}, ${s.y}, ${s.z}).`);
    return false;
  };
  /** @type {Dimension} */
  let dim;
  try {
    dim = world.getDimension(t.dim);
    if (!dim.getBlock(s)) throw new Error("unloaded");
  } catch {
    return waiting();
  }
  const box = clampBox(footprint(p, s), dim);
  if (!boxLoaded(dim, box)) return waiting();
  if (!s.snap && !s.old) snapshot(t, p, s, dim, box);
  let skipped = 0;
  let placed = 0;
  try {
    const structure = p.structure ? world.structureManager.get(p.structure) : undefined;
    if (structure) {
      const rotation = [StructureRotation.None, StructureRotation.Rotate90, StructureRotation.Rotate180, StructureRotation.Rotate270][s.f] ?? StructureRotation.None;
      world.structureManager.place(structure, dim, { x: s.x, y: s.y, z: s.z }, { rotation, includeEntities: false });
      placed = 1;
    } else {
      if (p.structure) console.warn(`[town] structure "${p.structure}" for ${p.id} isn't saved in this world; building the ${p.build} instead`);
      const result = placeDesign(dim, s, p);
      // Part of it is in a chunk that isn't loaded: build all of it later rather than half of it now.
      if (!result) return waiting();
      ({ placed, skipped } = result);
    }
  } catch (e) {
    console.warn(`[town] build ${p.id}: ${e}`);
    if (fresh) tellOps(`§c[Town Projects] ${t.n}'s ${p.name} couldn't be built: ${e}`);
    return false;
  }
  pr.built = 1;
  saveProgress(t, p, pr);
  const where = `${s.x}, ${s.y}, ${s.z}`;
  const msg = `§a${t.n}'s new ${p.name} is built at ${where}.`;
  if (get("announce") === true) world.sendMessage(msg);
  else tellOps(msg);
  if (skipped) tellOps(`§7[Town Projects] ${skipped} block${skipped === 1 ? " was" : "s were"} left out of the ${p.name} because something else was in the way. Builds only replace air, plants, grass and dirt (and water for a dock).`);
  if (placed && get("fireworks") === true) fireworks(dim, toWorld(s, 0, 1, 2));
  if (p.build === "notice_board") system.runTimeout(() => refreshBoard(t), 2);
  return true;
}

// ---------------------------------------------------------------------------
// Footprints and snapshots
// ---------------------------------------------------------------------------

/** @type {Map<string, Box>} */
const localBoxes = new Map();

/** The box a built-in design covers, in (right, up, forward) from the spot, read from design(). @param {Project["build"]} kind */
function localBox(kind) {
  let box = localBoxes.get(kind);
  if (box) return box;
  const places = design(kind);
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const pl of places) {
    for (const k of /** @type {const} */ (["x", "y", "z"])) {
      min[k] = Math.min(min[k], pl[k]);
      max[k] = Math.max(max[k], pl[k]);
    }
  }
  box = places.length ? { min, max } : { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  localBoxes.set(kind, box);
  return box;
}

/** @param {string} id */
function savedStructure(id) {
  try {
    return world.structureManager.get(id);
  } catch {
    return undefined;
  }
}

/**
 * The blocks a project covers when built at a spot: a saved structure's size (turned the way the spot faces,
 * corner at the spot), else its built-in design's extent turned to world directions.
 * @param {Project} p @param {Spot} s @returns {Box}
 */
function footprint(p, s) {
  const st = p.structure ? savedStructure(p.structure) : undefined;
  if (st) {
    const size = st.size;
    const turned = s.f % 2 === 1;
    const sx = turned ? size.z : size.x;
    const sz = turned ? size.x : size.z;
    return { min: { x: s.x, y: s.y, z: s.z }, max: { x: s.x + sx - 1, y: s.y + size.y - 1, z: s.z + sz - 1 } };
  }
  const lb = localBox(p.build);
  const a = toWorld(s, lb.min.x, lb.min.y, lb.min.z);
  const b = toWorld(s, lb.max.x, lb.max.y, lb.max.z);
  return {
    min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) },
  };
}

/** The part of a box inside the world's height. @param {Box} box @param {Dimension} dim @returns {Box} */
function clampBox(box, dim) {
  const { min, max } = dim.heightRange;
  return { min: { ...box.min, y: Math.max(min, box.min.y) }, max: { ...box.max, y: Math.min(max - 1, box.max.y) } };
}

/** @param {Box} box */
const boxArray = (box) => [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z];
/** @param {number[] | undefined} b @returns {Box | undefined} */
const arrayBox = (b) => (Array.isArray(b) && b.length === 6 && b.every((n) => typeof n === "number") ? { min: { x: b[0], y: b[1], z: b[2] }, max: { x: b[3], y: b[4], z: b[5] } } : undefined);

/** Is every chunk the box touches loaded? @param {Dimension} dim @param {Box} box */
function boxLoaded(dim, box) {
  const xs = [];
  for (let x = box.min.x; x < box.max.x; x += 16) xs.push(x);
  xs.push(box.max.x);
  const zs = [];
  for (let z = box.min.z; z < box.max.z; z += 16) zs.push(z);
  zs.push(box.max.z);
  try {
    for (const x of xs) for (const z of zs) if (!dim.getBlock({ x, y: box.min.y, z })) return false;
    return true;
  } catch {
    return false;
  }
}

/** The structure that holds the ground under a town's project from before it was built. @param {Town} t @param {Project} p */
const snapId = (t, p) => `town:${t.id}__${p.id}`;

/** @param {string} id */
function deleteStructure(id) {
  try {
    world.structureManager.delete(id);
  } catch {
    // not there
  }
}

/**
 * Saves the ground a build will cover, before it's built.
 * @param {Town} t @param {Project} p @param {Spot} s @param {Dimension} dim @param {Box} box
 */
function snapshot(t, p, s, dim, box) {
  const id = snapId(t, p);
  try {
    deleteStructure(id);
    world.structureManager.createFromWorld(id, dim, box.min, box.max, { includeBlocks: true, includeEntities: false, saveMode: StructureSaveMode.World });
    s.snap = 1;
    s.b = boxArray(box);
    saveTown(t);
  } catch (e) {
    console.warn(`[town] snapshot ${id}: ${e}`);
  }
}

/**
 * Takes a build away: puts the saved ground back, or, for a build made before snapshots (or whose snapshot
 * is gone), clears the build's own blocks (ground blocks become grass, a dock's posts water, the rest air).
 * Returns why it couldn't, or undefined when done. `keep` keeps the snapshot (for a rebuild).
 * @param {Town} t @param {Project} p @param {Spot} s @param {boolean} [keep]
 * @returns {string | undefined}
 */
function unbuild(t, p, s, keep = false) {
  /** @type {Dimension} */
  let dim;
  try {
    dim = world.getDimension(t.dim);
  } catch {
    return "its dimension isn't available";
  }
  const box = arrayBox(s.b) ?? clampBox(footprint(p, s), dim);
  if (!boxLoaded(dim, box)) return `its spot (${s.x}, ${s.y}, ${s.z}) isn't loaded: go closer and try again`;
  const id = snapId(t, p);
  const st = s.snap ? savedStructure(id) : undefined;
  try {
    if (st) {
      restoreGround(dim, st, box, buildKinds(p));
      if (!keep) deleteStructure(id);
    } else clearBuild(dim, p, s, box);
  } catch (e) {
    return String(e);
  }
  if (!keep) {
    delete s.snap;
    delete s.b;
  }
  return undefined;
}

/**
 * The kinds of block a project's build is made of: its saved structure's, else its built-in design's.
 * @param {Project} p @returns {Set<string>}
 */
function buildKinds(p) {
  /** @type {Set<string>} */
  const kinds = new Set();
  const st = p.structure ? savedStructure(p.structure) : undefined;
  if (st) {
    const { x: sx, y: sy, z: sz } = st.size;
    if (sx * sy * sz > 200000) throw new Error("the structure is too big to clear");
    for (let x = 0; x < sx; x++)
      for (let y = 0; y < sy; y++)
        for (let z = 0; z < sz; z++) {
          const type = st.getBlockPermutation({ x, y, z })?.type.id;
          if (type && type !== "minecraft:air" && type !== "minecraft:structure_void") kinds.add(type);
        }
    return kinds;
  }
  for (const pl of design(p.build)) kinds.add(pl.block);
  if (kinds.has("minecraft:farmland")) kinds.add("minecraft:dirt"); // trampled farmland
  return kinds;
}

/**
 * Puts the saved ground back, block by block, where the build (or nothing) is now: a block of a kind the build
 * isn't made of, placed or left there since (a chest, a path, a torch), stays as it is, and so does a block that
 * still matches the snapshot (so a chest that was there all along keeps what's in it now).
 * @param {Dimension} dim @param {import("@minecraft/server").Structure} st @param {Box} box @param {Set<string>} kinds
 */
function restoreGround(dim, st, box, kinds) {
  const air = perm("minecraft:air");
  for (let y = box.min.y; y <= box.max.y; y++)
    for (let x = box.min.x; x <= box.max.x; x++)
      for (let z = box.min.z; z <= box.max.z; z++) {
        const b = dim.getBlock({ x, y, z });
        if (!b) continue;
        const want = st.getBlockPermutation({ x: x - box.min.x, y: y - box.min.y, z: z - box.min.z }) ?? air;
        if (want.type.id === "minecraft:structure_void") continue;
        if (b.permutation.matches(want.type.id, want.getAllStates())) continue;
        if (!b.isAir && !b.isLiquid && !kinds.has(b.typeId)) continue; // someone's own block
        b.setPermutation(want);
      }
}

/**
 * Clears a build that has no snapshot: only blocks that are still what the build put there.
 * @param {Dimension} dim @param {Project} p @param {Spot} s @param {Box} box
 */
function clearBuild(dim, p, s, box) {
  const air = perm("minecraft:air");
  const st = p.structure ? savedStructure(p.structure) : undefined;
  if (st) {
    // A saved structure: clear the blocks in its box that are of a kind the structure has.
    const kinds = buildKinds(p);
    for (let x = box.min.x; x <= box.max.x; x++)
      for (let y = box.min.y; y <= box.max.y; y++)
        for (let z = box.min.z; z <= box.max.z; z++) {
          const b = dim.getBlock({ x, y, z });
          if (b && kinds.has(b.typeId)) b.setPermutation(air);
        }
    return;
  }
  const grass = perm("minecraft:grass_block");
  const water = perm("minecraft:water");
  // Top down, so nothing above is left hanging while it's cleared.
  const places = design(p.build).sort((a, b) => b.y - a.y);
  for (const pl of places) {
    let b;
    try {
      b = dim.getBlock(toWorld(s, pl.x, pl.y, pl.z));
    } catch {
      continue; // outside the world's height
    }
    if (!b) continue;
    const same = b.typeId === pl.block || (pl.block === "minecraft:farmland" && b.typeId === "minecraft:dirt");
    if (!same) continue;
    b.setPermutation(pl.mode === "ground" ? grass : pl.mode === "wet" ? water : air);
  }
}

const SIDES = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
  { x: 0, y: -1, z: 0 },
];
/** @param {Vector3} v */
const keyOf = (v) => `${v.x},${v.y},${v.z}`;

/**
 * Places a built-in design. Returns undefined (and changes nothing) while any of its blocks is in an unloaded
 * chunk. Blocks in the way are left alone. Water goes in last, and only where it's held in on every side and
 * below (by a block, or by more of the design's water), so it can never spill out and wash away torches,
 * redstone or crops nearby; a lily pad only goes on water that was placed.
 * @param {Dimension} dim @param {Spot} s @param {Project} p
 * @returns {{ placed: number, skipped: number } | undefined}
 */
function placeDesign(dim, s, p) {
  const fwd = FORWARD[s.f] ?? FORWARD[0];
  const { min, max } = dim.heightRange;
  /** @type {{ pl: Place, loc: Vector3, block: import("@minecraft/server").Block }[]} */
  const items = [];
  let skipped = 0;
  for (const pl of design(p.build)) {
    const loc = toWorld(s, pl.x, pl.y, pl.z);
    if (loc.y < min || loc.y >= max) {
      skipped++;
      continue;
    }
    let block;
    try {
      block = dim.getBlock(loc);
    } catch {
      block = undefined;
    }
    if (!block) return undefined; // not loaded
    items.push({ pl, loc, block });
  }
  /** @param {Place} pl */
  const optional = (pl) => isOptional(p, pl);
  /** @param {Place} pl */
  const later = (pl) => pl.block === "minecraft:water" || pl.block === "minecraft:waterlily";
  let placed = 0;
  /** @param {{ pl: Place, block: import("@minecraft/server").Block }} it */
  const put = (it) => {
    const states = it.pl.block === "minecraft:wall_sign" ? { facing_direction: wallFacing({ x: -fwd.x, z: -fwd.z }) } : it.pl.states;
    it.block.setPermutation(perm(it.pl.block, states));
    placed++;
  };
  // 1. Everything but water and lily pads, supports first. A block that's already there (a rebuild) stays.
  for (const it of items) {
    if (later(it.pl) || it.block.typeId === it.pl.block) continue;
    if (!canReplace(it.block.typeId, it.pl.mode)) {
      // A cobblestone floor under a well, or posts under a dock, are only needed where it's open.
      if (!optional(it.pl)) skipped++;
      continue;
    }
    put(it);
  }
  // 2. Water, only where it can't spill.
  const water = items.filter((it) => it.pl.block === "minecraft:water" && it.block.typeId !== "minecraft:water");
  const wetAlready = new Set(items.filter((it) => it.pl.block === "minecraft:water" && it.block.typeId === "minecraft:water").map((it) => keyOf(it.loc)));
  const want = new Map(water.filter((it) => canReplace(it.block.typeId, it.pl.mode)).map((it) => [keyOf(it.loc), it]));
  /** @param {Vector3} at */
  const holds = (at) => {
    if (want.has(keyOf(at))) return true;
    try {
      const b = dim.getBlock(at);
      if (!b) return false;
      if (b.isLiquid) return true; // more water: it's already wet there
      return !b.isAir && !b.canBeDestroyedByLiquidSpread(LiquidType.Water);
    } catch {
      return false;
    }
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (const [k, it] of want) {
      if (SIDES.every((d) => holds({ x: it.loc.x + d.x, y: it.loc.y + d.y, z: it.loc.z + d.z }))) continue;
      want.delete(k);
      changed = true;
    }
  }
  skipped += water.length - want.size;
  for (const it of want.values()) put(it);
  // 3. Lily pads on the water just placed.
  for (const it of items) {
    if (it.pl.block !== "minecraft:waterlily" || it.block.typeId === it.pl.block) continue;
    const below = keyOf({ x: it.loc.x, y: it.loc.y - 1, z: it.loc.z });
    if ((want.has(below) || wetAlready.has(below)) && canReplace(it.block.typeId, it.pl.mode)) put(it);
    else skipped++;
  }
  return { placed, skipped };
}

/** @param {Dimension} dim @param {Vector3} at */
function fireworks(dim, at) {
  for (let i = 0; i < 6; i++) {
    system.runTimeout(() => {
      try {
        dim.spawnEntity("minecraft:fireworks_rocket", { x: at.x + (Math.random() * 4 - 2), y: at.y + 1, z: at.z + (Math.random() * 4 - 2) });
      } catch {
        // unloaded
      }
    }, i * 8);
  }
}

/** Updates the notice board's signs: name and level, projects, top contributors. @param {Town} t */
function refreshBoard(t) {
  const p = PROJECTS.find((x) => x.build === "notice_board" && progressOf(t, x).built && t.spots[x.id]);
  if (!p) return;
  const s = t.spots[p.id];
  try {
    const dim = world.getDimension(t.dim);
    const done = PROJECTS.filter((x) => progressOf(t, x).done).length;
    /** @type {Map<string, [string, number]>} */
    const totals = new Map();
    for (const x of PROJECTS)
      for (const [id, name, n] of ranking(progressOf(t, x))) {
        const was = totals.get(id);
        totals.set(id, [name, (was?.[1] ?? 0) + n]);
      }
    const top = [...totals.values()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name);
    const texts = [
      `§l${t.n}§r\n${levelName(t.lvl)}\nlevel ${t.lvl}`,
      `Projects done\n${done} of ${PROJECTS.length}\n\nSee /realm:town`,
      top.length ? `Thank you\n${top.join("\n")}` : "Bring materials\nto the mayor!",
    ];
    for (let x = -1; x <= 1; x++) {
      const block = dim.getBlock(toWorld(s, x, 1, 0));
      const sign = block?.typeId === "minecraft:wall_sign" ? block.getComponent("minecraft:sign") : undefined;
      if (!sign) continue;
      sign.setWaxed(false);
      sign.setText(texts[x + 1]);
      sign.setWaxed(true);
    }
  } catch {
    // not loaded: updated next time
  }
}

/** @param {string} text */
function tellOps(text) {
  for (const p of world.getAllPlayers()) if (isOp(p)) p.sendMessage(text);
}

// Finished projects waiting to be built go up when someone is near their spot.
system.runInterval(() => {
  try {
    const players = world.getAllPlayers();
    if (!players.length) return;
    for (const t of allTowns().values()) {
      for (const p of PROJECTS) {
        const s = t.spots[p.id];
        if (!s) continue;
        const pr = progressOf(t, p);
        if (!pr.done || pr.built) continue;
        if (!players.some((pl) => pl.dimension.id === t.dim && Math.hypot(pl.location.x - s.x, pl.location.z - s.z) <= NEAR_SPOT)) continue;
        build(t, p, false);
      }
    }
  } catch (e) {
    console.warn(`[town] ${e}`);
  }
}, BUILD_CHECK_TICKS);

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

/**
 * Shows a form, retrying while the player still has chat or another screen open.
 * @template {ActionFormData | MessageFormData | ModalFormData} F
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

/**
 * Buttons with what each does.
 * @param {Player} player @param {string} title @param {string} body @param {{ text: string, run: () => unknown }[]} actions
 */
async function menu(player, title, body, actions) {
  const form = new ActionFormData().title(title).body(body);
  for (const a of actions) form.button(a.text);
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  await actions[res.selection]?.run();
}

/** @param {number} percent */
function bar(percent) {
  const filled = Math.round(Math.min(100, percent) / 5);
  return `§a${"|".repeat(filled)}§8${"|".repeat(20 - filled)}§r`;
}

/** @param {Town} t @param {Project} p */
function projectLine(t, p) {
  const pr = progressOf(t, p);
  if (pr.done) return `§a[Done] ${p.name}§r ${pr.built ? "§7(built)" : t.spots[p.id] ? "§7(waiting for someone nearby to be built)" : "§7(waiting for an operator to pick its spot)"}`;
  return `§e${p.name}§r\n${bar(pct(p, pr))} §f${pct(p, pr)} percent`;
}

/**
 * The town's page. `canDeliver`: opened through the mayor (or /realm:town in town with deliverWithCommand).
 * @param {Player} player @param {string} townId @param {boolean} canDeliver
 */
async function townMenu(player, townId, canDeliver) {
  const t = allTowns().get(townId);
  if (!t) return player.sendMessage("§cThat town was removed.");
  const open = projectsAt(t.lvl);
  const dist = player.dimension.id === t.dim ? ` (${Math.round(Math.hypot(player.location.x - t.x, player.location.z - t.z))} blocks away)` : "";
  const body = [
    `§l${t.n}§r: ${levelName(t.lvl)}, level ${t.lvl} of ${MAX_LEVEL}`,
    `§7Center: ${t.x}, ${t.z}${dist}§r`,
    ...(moodOf(t.id) === "heartened" ? ["§aHeartened§r: the Choir was driven off. Deliveries count x1.25."] : moodOf(t.id) === "shaken" ? ["§cShaken§r: the Choir finished its song here. People are uneasy."] : []),
    t.lvl >= MAX_LEVEL || !open.length
      ? "Every project is done. Thank you, everyone!"
      : `Finish these to make ${t.n} a ${levelName(t.lvl + 1)}:\n\n${open.map((p) => projectLine(t, p)).join("\n\n")}`,
    canDeliver ? "Pick a project to see what it needs and deliver from your inventory." : "Deliver materials through the town's mayor.",
  ].join("\n\n");
  /** @type {{ text: string, run: () => unknown }[]} */
  const actions = open
    .filter((p) => !progressOf(t, p).done)
    .map((p) => ({ text: `${p.name}: ${pct(p, progressOf(t, p))} percent\n§8${canDeliver ? "Deliver" : "What it needs"}`, run: () => projectMenu(player, t.id, p.id, canDeliver) }));
  actions.push({ text: "Contributors\n§8Who helped build the town", run: () => contributors(player, t.id, canDeliver) });
  if (allTowns().size > 1) actions.push({ text: "Other towns", run: () => townList(player) });
  actions.push({ text: "Close", run: () => undefined });
  await menu(player, `§l${t.n}`, body, actions);
}

/** @param {Player} player @param {string} townId @param {string} projectId @param {boolean} canDeliver */
async function projectMenu(player, townId, projectId, canDeliver) {
  const t = allTowns().get(townId);
  const p = byId.get(projectId);
  if (!t || !p) return;
  const pr = progressOf(t, p);
  const needs = Object.entries(p.needs)
    .map(([item, n]) => {
      const got = Math.min(n, pr.got[item] ?? 0);
      const have = got < n ? ` §7(you carry ${fmt(carried(player, item))})` : " §a(done)";
      return `${itemName(item)}: ${fmt(got)} / ${fmt(n)}${have}`;
    })
    .join("\n");
  const top = ranking(pr).slice(0, 5);
  const body = [
    `§l${p.name}§r for ${t.n}`,
    `${bar(pct(p, pr))} §f${pct(p, pr)} percent`,
    needs,
    top.length ? `§lContributors§r\n${top.map(([, name, n], i) => `${i + 1}. ${name}: ${fmt(n)}`).join("\n")}` : "Nobody has delivered anything yet.",
    pr.done ? "§aFinished!" : canDeliver ? "Delivering takes what you carry of these items, up to what's still needed. Partial deliveries count." : "Bring these to the town's mayor.",
  ].join("\n\n");
  /** @type {{ text: string, run: () => unknown }[]} */
  const actions = [];
  if (canDeliver && !pr.done) {
    actions.push({
      text: "Deliver what I have",
      run: () => {
        deliver(player, t, p);
        return progressOf(t, p).done ? townMenu(player, t.id, canDeliver) : projectMenu(player, t.id, p.id, canDeliver);
      },
    });
  }
  actions.push({ text: "Back", run: () => townMenu(player, t.id, canDeliver) });
  await menu(player, `§l${p.name}`, body, actions);
}

/** @param {Player} player @param {string} townId @param {boolean} canDeliver */
async function contributors(player, townId, canDeliver) {
  const t = allTowns().get(townId);
  if (!t) return;
  /** @type {Map<string, [string, number]>} */
  const totals = new Map();
  for (const p of PROJECTS)
    for (const [id, name, n] of ranking(progressOf(t, p))) {
      const was = totals.get(id);
      totals.set(id, [name, (was?.[1] ?? 0) + n]);
    }
  const list = [...totals.values()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  const done = PROJECTS.filter((p) => progressOf(t, p).done);
  const body = [
    list.length ? `§lItems delivered§r\n${list.map(([name, n], i) => `${i + 1}. ${name}: ${fmt(n)}`).join("\n")}` : "Nobody has delivered anything yet.",
    done.length ? `§lFinished projects§r\n${done.map((p) => p.name).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  await menu(player, `§l${t.n}: contributors`, body, [{ text: "Back", run: () => townMenu(player, t.id, canDeliver) }]);
}

/** @param {Player} player */
async function townList(player) {
  const list = [...allTowns().values()].sort((a, b) => a.n.localeCompare(b.n));
  const inTown = nearestTown(player, get("townRadius"));
  await menu(
    player,
    "§lTowns",
    list.length ? "Every town on the realm." : "No towns yet.",
    list.map((t) => ({
      text: `${t.n}\n§8${levelName(t.lvl)}, level ${t.lvl} - ${t.x}, ${t.z}`,
      run: () => townMenu(player, t.id, get("deliverWithCommand") === true && inTown?.id === t.id),
    })),
  );
}

/** The old /realm:town page, now /realm:town_stats: the nearest town's level, projects and contributors. @param {Player} player */
async function townStats(player) {
  const t = nearestTown(player);
  if (!t) {
    player.sendMessage(`§7No towns yet.${isOp(player) ? " Stand in the middle of one and run /realm:town_add <name>." : ""}`);
    return;
  }
  await townMenu(player, t.id, canDeliverIn(player, t));
}

/** Can /realm:town deliver to this town from where the player stands? @param {Player} player @param {Town} t */
const canDeliverIn = (player, t) =>
  get("deliverWithCommand") === true && player.dimension.id === t.dim && Math.hypot(player.location.x - t.x, player.location.z - t.z) <= get("townRadius");

/** @param {Town} t */
const isProtected = (t) => t.prot !== 0;

/** /realm:town: everything the player may do, operators' actions included. @param {Player} player */
async function mainMenu(player) {
  const here = nearestTown(player, get("townRadius"));
  const near = here ?? nearestTown(player);
  const op = isOp(player);
  /** @type {string[]} */
  const lines = [];
  if (here) lines.push(`You're in §l${here.n}§r: ${levelName(here.lvl)}, level ${here.lvl} of ${MAX_LEVEL}.`);
  else if (near) lines.push(`The nearest town is §l${near.n}§r, ${Math.round(Math.hypot(player.location.x - near.x, player.location.z - near.z))} blocks away.`);
  else lines.push(`There are no towns yet.${op ? " Stand in the middle of one and add it." : ""}`);
  if (op && here) lines.push(`§7Protect from world events: ${isProtected(here) ? "§aEnabled" : "§cDisabled"}`);
  /** @type {{ text: string, run: () => unknown }[]} */
  const actions = [];
  if (near) {
    const deliver = canDeliverIn(player, near);
    actions.push({ text: "Town info\n§8Level, projects, contributors", run: () => townStats(player) });
    actions.push({ text: `Projects\n§8What each needs${deliver ? ", deliver" : ""}`, run: () => projectsMenu(player, near.id, deliver) });
  }
  if (allTowns().size > (near ? 1 : 0)) actions.push({ text: "Other towns\n§8Every town on the realm", run: () => townList(player) });
  if (op) {
    if (!here) actions.push({ text: "§4Add a town here\n§8Operators", run: () => addTownForm(player) });
    else {
      actions.push({ text: "§4Set a project spot\n§8Operators: with a preview", run: () => pickProject(player, here.id, "spot") });
      if (Object.keys(here.spots).length) actions.push({ text: "§4Manage spots\n§8Operators: remove, rebuild, relocate", run: () => pickProject(player, here.id, "manage") });
      actions.push({ text: `§4Protect from world events\n§8Operators: ${isProtected(here) ? "Enabled" : "Disabled"}`, run: () => protectForm(player, here.id) });
      actions.push({ text: "§4Remove town\n§8Operators", run: () => removeTown(player) });
    }
  }
  actions.push({ text: "Close", run: () => undefined });
  await menu(player, "§lTown Projects", lines.join("\n\n"), actions);
}

/** The projects open in a town right now. @param {Player} player @param {string} townId @param {boolean} canDeliver */
async function projectsMenu(player, townId, canDeliver) {
  const t = allTowns().get(townId);
  if (!t) return player.sendMessage("§cThat town was removed.");
  const open = projectsAt(t.lvl);
  const body = open.length
    ? `${t.n}'s projects for level ${t.lvl}. ${canDeliver ? "Pick one to see what it needs and deliver." : "Pick one to see what it needs: deliver at the town's mayor."}`
    : "Every project is done. Thank you, everyone!";
  /** @type {{ text: string, run: () => unknown }[]} */
  const actions = open.map((p) => {
    const pr = progressOf(t, p);
    return { text: pr.done ? `§2${p.name}: done` : `${p.name}: ${pct(p, pr)} percent`, run: () => projectMenu(player, t.id, p.id, canDeliver) };
  });
  actions.push({ text: "Back", run: () => mainMenu(player) });
  await menu(player, `§l${t.n}: projects`, body, actions);
}

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

/** @param {Player} player */
async function addTownForm(player) {
  const res = await show(player, new ModalFormData().title("§lAdd a town here").textField("Town name", "Riverside").submitButton("Add town"));
  if (!res || res.canceled || !res.formValues || !player.isValid || !stillOp(player)) return;
  const name = res.formValues.find((v) => typeof v === "string");
  addTown(player, typeof name === "string" ? name : "");
}

/** @param {Player} player @param {string} rawName @param {(msg: string) => void} [tell] */
function addTown(player, rawName, tell = (msg) => player.sendMessage(msg)) {
  const name = rawName
    .replace(/§./g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .trim()
    .slice(0, NAME_LENGTH);
  if (!name) return tell("§cGive the town a name, for example /realm:town_add Riverside (quotes for spaces: \"Oak Hollow\").");
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "town";
  if ([...allTowns().values()].some((t) => t.n.toLowerCase() === name.toLowerCase())) return tell(`§cThere is already a town called ${name}.`);
  const close = nearestTown(player, get("townRadius") / 2);
  if (close) return tell(`§c${close.n} is too close (its center is at ${close.x}, ${close.z}). Towns must be at least ${Math.round(get("townRadius") / 2)} blocks apart.`);
  let id = base;
  for (let k = 2; allTowns().has(id); k++) id = `${base}_${k}`;
  /** @type {Town} */
  const t = {
    id,
    n: name,
    dim: player.dimension.id,
    x: Math.floor(player.location.x),
    y: Math.floor(player.location.y),
    z: Math.floor(player.location.z),
    lvl: 1,
    spots: {},
    by: player.name,
    at: Date.now(),
  };
  saveTown(t);
  zonesChanged();
  levelUp(t); // only if the config has no projects for level 1
  const first = projectsAt(t.lvl);
  tell(
    `§aTown ${name} added here (${t.x}, ${t.z}), a ${levelName(t.lvl)}. ${first.length ? `Its first projects: ${first.map((p) => p.name).join(", ")}.` : ""} §7Mayors (NPCs with the role ${CONFIG.npcRole}) within ${get("townRadius")} blocks take deliveries. Set where each project is built from /realm:town or with /realm:town_spot <project>. World events don't break blocks here (Protect from world events is Enabled).`,
  );
  if (get("announce") === true) world.sendMessage(`§6A new town: §e${name}§6! Bring materials to its mayor to build it up. /realm:town`);
}

/** Where the player stands, facing the way they face (to the nearest quarter turn). @param {Player} player @returns {Spot} */
function spotOf(player) {
  const yaw = player.getRotation().y;
  const f = ((Math.round(yaw / 90) % 4) + 4) % 4;
  return { x: Math.floor(player.location.x), y: Math.floor(player.location.y), z: Math.floor(player.location.z), f };
}

const FACINGS = ["south", "west", "north", "east"];
/** @param {Spot} s */
const spotText = (s) => `${s.x}, ${s.y}, ${s.z}, facing ${FACINGS[s.f] ?? "south"}`;

/** Was this project built before snapshots, so taking it away can only clear its own blocks? @param {Town} t @param {Project} p */
function legacyBuild(t, p) {
  const s = t.spots[p.id];
  return !!s && progressOf(t, p).built === 1 && !(s.snap && savedStructure(snapId(t, p)));
}

/** /realm:town_spot <project>, without a town or project check yet. @param {Player} player @param {string} projectId */
function setSpot(player, projectId) {
  const p = byId.get(projectId);
  if (!p) return player.sendMessage(`§cNo project "${projectId}". Projects: ${PROJECTS.map((x) => x.id).join(", ")}.`);
  const t = nearestTown(player, get("townRadius"));
  if (!t) return player.sendMessage(`§cYou're not in a town (within ${get("townRadius")} blocks of its center). /realm:town_add makes one.`);
  return previewSpot(player, t.id, p.id);
}

/**
 * Pick a project: to set its spot ("spot") or to manage the spot it has ("manage").
 * @param {Player} player @param {string} townId @param {"spot" | "manage"} mode
 */
async function pickProject(player, townId, mode) {
  const t = allTowns().get(townId);
  if (!t) return;
  const list = mode === "manage" ? PROJECTS.filter((p) => t.spots[p.id]) : PROJECTS;
  /** @type {{ text: string, run: () => unknown }[]} */
  const actions = list.map((p) => {
    const s = t.spots[p.id];
    const pr = progressOf(t, p);
    const state = pr.built && s ? `built at ${s.x}, ${s.y}, ${s.z}` : s ? `spot at ${s.x}, ${s.y}, ${s.z}` : pr.done ? "finished, no spot yet" : "no spot yet";
    return { text: `${p.name}\n§8${state}`, run: () => (mode === "manage" ? manageSpot(player, t.id, p.id) : previewSpot(player, t.id, p.id)) };
  });
  actions.push({ text: "Back", run: () => mainMenu(player) });
  const body =
    mode === "manage"
      ? `Projects of ${t.n} with a spot. Pick one to remove its spot, rebuild it or move it.`
      : `Stand where a project should be built, facing the way it should face, then pick it. You see its outline before anything is saved.`;
  await menu(player, mode === "manage" ? "§lManage spots" : "§lSet a project spot", body, actions);
}

/** @param {Player} player @param {string} townId @param {string} projectId */
async function manageSpot(player, townId, projectId) {
  const t = allTowns().get(townId);
  const p = byId.get(projectId);
  if (!t || !p) return;
  const s = t.spots[p.id];
  if (!s) return player.sendMessage(`§e${t.n}'s ${p.name} has no spot.`);
  const pr = progressOf(t, p);
  const legacy = legacyBuild(t, p);
  const body = [
    `§l${p.name}§r in ${t.n}`,
    `Spot: ${spotText(s)}`,
    pr.built ? "Built." : pr.done ? "Finished, waiting to be built." : `Not finished yet (${pct(p, pr)} percent): it's built here when it is.`,
    legacy ? "§eBuilt before the ground was saved: removing or moving it clears its own blocks instead of restoring the ground." : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  /** @type {{ text: string, run: () => unknown }[]} */
  const actions = [{ text: "Relocate\n§8Preview a new spot where you stand", run: () => previewSpot(player, t.id, p.id) }];
  if (pr.built) actions.push({ text: "Rebuild\n§8Reset a damaged build", run: () => confirmRebuild(player, t.id, p.id) });
  actions.push({ text: pr.built ? "Remove spot\n§8Take the build away" : "Remove spot\n§8Forget it", run: () => confirmRemoveSpot(player, t.id, p.id) });
  actions.push({ text: "Back", run: () => pickProject(player, t.id, "manage") });
  await menu(player, `§l${p.name}`, body, actions);
}

/** @param {Player} player @param {string} title @param {string} body @param {string} yes */
async function confirm(player, title, body, yes) {
  const res = await show(player, new MessageFormData().title(title).body(body).button1(yes).button2("Cancel"));
  return !!res && !res.canceled && res.selection === 0 && player.isValid && stillOp(player);
}

/** @param {Player} player @param {string} townId @param {string} projectId */
async function confirmRemoveSpot(player, townId, projectId) {
  const t = allTowns().get(townId);
  const p = byId.get(projectId);
  if (!t || !p || !t.spots[p.id]) return;
  const pr = progressOf(t, p);
  const body = !pr.built
    ? `Forget where ${t.n}'s ${p.name} goes? Nothing is built yet, so nothing in the world changes.`
    : legacyBuild(t, p)
      ? `Take ${t.n}'s ${p.name} away?\n\n§eIt was built before the ground under builds was saved, so its own blocks are cleared: ground blocks become grass, a dock's posts water, the rest air. Anything else (paths, decorations you added) stays.§r\n\nIt stays finished: set a new spot to build it again.`
      : `Take ${t.n}'s ${p.name} away and put the ground back the way it was before it was built? Blocks added inside its outline since then stay, unless they are of a kind the build is made of.\n\nIt stays finished: set a new spot to build it again.`;
  if (await confirm(player, "§lRemove spot?", body, pr.built ? "§cRemove the build" : "Forget the spot")) removeSpot(t, p, (m) => player.sendMessage(m));
}

/** @param {Player} player @param {string} townId @param {string} projectId */
async function confirmRebuild(player, townId, projectId) {
  const t = allTowns().get(townId);
  const p = byId.get(projectId);
  if (!t || !p || !t.spots[p.id]) return;
  const body = legacyBuild(t, p)
    ? `Rebuild ${t.n}'s ${p.name}? It was built before the ground was saved, so missing blocks are put back; changed blocks stay as they are.`
    : `Rebuild ${t.n}'s ${p.name}? Its outline goes back to the ground saved before it was built, and it's built again, fresh. Blocks added inside its outline since then stay, unless they are of a kind the build is made of.`;
  if (await confirm(player, "§lRebuild?", body, "Rebuild")) rebuildSpot(t, p, (m) => player.sendMessage(m));
}

/**
 * Sets a project's spot, or moves it: a built project is taken away from its old spot first (the saved ground
 * goes back) and built at the new one.
 * @param {Town} t @param {Project} p @param {Spot} s @param {(msg: string) => void} tell @returns {boolean}
 */
function applySpot(t, p, s, tell) {
  const pr = progressOf(t, p);
  const old = t.spots[p.id];
  const moving = pr.built === 1;
  if (moving && old) {
    const why = unbuild(t, p, old);
    if (why) {
      tell(`§cThe ${p.name} couldn't be moved: ${why}.`);
      return false;
    }
  } else if (old?.snap) deleteStructure(snapId(t, p));
  if (moving) {
    pr.built = 0;
    saveProgress(t, p, pr);
  }
  t.spots[p.id] = { x: s.x, y: s.y, z: s.z, f: s.f };
  saveTown(t);
  tell(`§a${t.n}'s ${p.name} ${moving ? "was taken away from its old spot and goes" : "will be built"} at ${spotText(s)}. §7${spotHint(p)}`);
  if (pr.done) build(t, p, true);
  return true;
}

/** Forgets a project's spot; a built project is taken away. @param {Town} t @param {Project} p @param {(msg: string) => void} tell */
function removeSpot(t, p, tell) {
  const s = t.spots[p.id];
  if (!s) return tell(`§e${t.n}'s ${p.name} has no spot.`);
  const pr = progressOf(t, p);
  const wasBuilt = pr.built === 1;
  if (wasBuilt) {
    const why = unbuild(t, p, s);
    if (why) return tell(`§cThe ${p.name} couldn't be removed: ${why}.`);
    pr.built = 0;
    saveProgress(t, p, pr);
  } else if (s.snap) deleteStructure(snapId(t, p));
  delete t.spots[p.id];
  saveTown(t);
  tell(`§a${wasBuilt ? `${t.n}'s ${p.name} was taken away` : `${t.n}'s ${p.name} has no spot now`}.${pr.done ? " §7It's finished: set a new spot to build it." : ""}`);
}

/** Puts a built project back as new. @param {Town} t @param {Project} p @param {(msg: string) => void} tell */
function rebuildSpot(t, p, tell) {
  const s = t.spots[p.id];
  const pr = progressOf(t, p);
  if (!s || !pr.built) return tell(`§e${t.n}'s ${p.name} isn't built.`);
  const legacy = legacyBuild(t, p);
  if (legacy) {
    delete s.snap;
    s.old = 1; // never save what's there now as "the ground"
  } else {
    const why = unbuild(t, p, s, true);
    if (why) return tell(`§cThe ${p.name} couldn't be rebuilt: ${why}.`);
  }
  pr.built = 0;
  saveProgress(t, p, pr);
  saveTown(t);
  if (!build(t, p, true)) tell(`§eThe ${p.name} is built again as soon as its spot is loaded.`);
}

/**
 * Shows where a project would go (its outline and an arrow for its front, as particles only this operator
 * sees) and asks to set the spot there, turn it, or cancel.
 * @param {Player} player @param {string} townId @param {string} projectId
 */
async function previewSpot(player, townId, projectId) {
  const t = allTowns().get(townId);
  const p = byId.get(projectId);
  if (!t || !p) return;
  if (player.dimension.id !== t.dim) return player.sendMessage(`§c${t.n} is in another dimension.`);
  let s = spotOf(player);
  const moving = progressOf(t, p).built === 1 && !!t.spots[p.id];
  const legacy = moving && legacyBuild(t, p);
  for (;;) {
    const pv = { dim: t.dim, p, s, until: system.currentTick + PREVIEW_TICKS, open: true };
    previews.set(player.id, pv);
    const box = footprint(p, s);
    const size = `${box.max.x - box.min.x + 1} by ${box.max.z - box.min.z + 1} blocks, ${box.max.y - box.min.y + 1} high`;
    const blocked = inTheWay(t, p, s);
    const body = [
      `§l${p.name}§r for ${t.n}`,
      `At ${spotText(s)}: ${size}. The green outline shows the blocks it covers, the blue arrow the way its front faces.`,
      blocked ? `§e${blocked} block${blocked === 1 ? "" : "s"} of it would be left out: something is in the way.§r` : "",
      p.structure && savedStructure(p.structure) ? `The structure "${p.structure}" replaces whatever is inside the outline.` : "",
      moving ? `It's built now: setting the spot here takes it away from ${spotText(/** @type {Spot} */ (t.spots[p.id]))}${legacy ? " (clearing its own blocks: it was built before the ground was saved)" : " and puts the ground back"}, then builds it here.` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const form = new ActionFormData().title("§lSet the spot?").body(body).button("Set spot here").button("Rotate 90\n§8Turn it a quarter to the right").button("Look around\n§8Walk around it for 10 seconds").button("Cancel");
    const res = await show(player, form);
    pv.open = false;
    if (system.currentTick > pv.until) {
      if (previews.get(player.id) === pv) previews.delete(player.id);
      if (player.isValid) player.sendMessage("§7The spot preview timed out. Nothing was changed.");
      return;
    }
    if (previews.get(player.id) !== pv) return; // replaced by another preview
    if (!res || res.canceled || res.selection === undefined || res.selection === 3 || !player.isValid) {
      previews.delete(player.id);
      return;
    }
    if (res.selection === 1) {
      s = { ...s, f: (s.f + 1) % 4 };
      continue;
    }
    if (res.selection === 2) {
      pv.until = system.currentTick + LOOK_TICKS + 20;
      player.sendMessage("§7Walk around the outline. The question comes back in 10 seconds.");
      await new Promise((r) => system.runTimeout(() => r(undefined), LOOK_TICKS));
      if (previews.get(player.id) !== pv || !player.isValid) return;
      continue;
    }
    previews.delete(player.id);
    if (!stillOp(player)) return;
    const now = allTowns().get(townId);
    if (now) applySpot(now, p, s, (m) => player.sendMessage(m));
    return;
  }
}

/**
 * How many of a built-in design's blocks would be left out at a spot because something is in the way (0 for a
 * saved structure, or where it isn't loaded).
 * @param {Town} t @param {Project} p @param {Spot} s
 */
function inTheWay(t, p, s) {
  if (p.structure && savedStructure(p.structure)) return 0;
  const own = progressOf(t, p).built && t.spots[p.id] ? footprint(p, t.spots[p.id]) : undefined;
  let n = 0;
  try {
    const dim = world.getDimension(t.dim);
    for (const pl of design(p.build)) {
      if (pl.block === "minecraft:waterlily" || isOptional(p, pl)) continue;
      const loc = toWorld(s, pl.x, pl.y, pl.z);
      // Its own build, when moving it a little, is taken away first.
      if (own && loc.x >= own.min.x && loc.x <= own.max.x && loc.y >= own.min.y && loc.y <= own.max.y && loc.z >= own.min.z && loc.z <= own.max.z) continue;
      let b;
      try {
        b = dim.getBlock(loc);
      } catch {
        b = undefined;
      }
      if (b && !canReplace(b.typeId, pl.mode)) n++;
    }
  } catch {
    return 0;
  }
  return n;
}

const PREVIEW_TICKS = 600; // 30 seconds without an answer
const LOOK_TICKS = 200;
const OUTLINE = "minecraft:villager_happy";
const ARROW = "minecraft:blue_flame_particle";

/** Spot previews being shown, by player id. @type {Map<string, { dim: string, p: Project, s: Spot, until: number, open: boolean }>} */
const previews = new Map();

/** @param {Player} player @param {{ p: Project, s: Spot }} pv */
function drawPreview(player, pv) {
  const box = footprint(pv.p, pv.s);
  const lo = box.min;
  const hi = { x: box.max.x + 1, y: box.max.y + 1, z: box.max.z + 1 };
  /** @type {[Vector3, Vector3][]} */
  const edges = [];
  for (const y of [lo.y, hi.y]) {
    edges.push([{ x: lo.x, y, z: lo.z }, { x: hi.x, y, z: lo.z }]);
    edges.push([{ x: lo.x, y, z: hi.z }, { x: hi.x, y, z: hi.z }]);
    edges.push([{ x: lo.x, y, z: lo.z }, { x: lo.x, y, z: hi.z }]);
    edges.push([{ x: hi.x, y, z: lo.z }, { x: hi.x, y, z: hi.z }]);
  }
  for (const x of [lo.x, hi.x]) for (const z of [lo.z, hi.z]) edges.push([{ x, y: lo.y, z }, { x, y: hi.y, z }]);
  const total = edges.reduce((sum, [a, b]) => sum + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), 0);
  const step = Math.max(0.5, total / 400);
  /** @param {string} id @param {Vector3} at */
  const dot = (id, at) => {
    try {
      player.spawnParticle(id, at);
    } catch {
      // unloaded
    }
  };
  for (const [a, b] of edges) {
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= n; i++) dot(OUTLINE, { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n, z: a.z + ((b.z - a.z) * i) / n });
  }
  // The front: an arrow on the ground from the spot, pointing the way the build faces.
  const f = FORWARD[pv.s.f] ?? FORWARD[0];
  const r = { x: -f.z, z: f.x };
  const c = { x: pv.s.x + 0.5, y: pv.s.y + 0.2, z: pv.s.z + 0.5 };
  for (let k = 0; k <= 2.5; k += 0.25) dot(ARROW, { x: c.x + f.x * k, y: c.y, z: c.z + f.z * k });
  for (let k = 0.25; k <= 1; k += 0.25)
    for (const side of [-1, 1]) dot(ARROW, { x: c.x + f.x * (2.5 - k) + r.x * k * side, y: c.y, z: c.z + f.z * (2.5 - k) + r.z * k * side });
}

system.runInterval(() => {
  for (const [id, pv] of previews) {
    const player = online(id);
    if (!player) {
      previews.delete(id);
      continue;
    }
    if (system.currentTick > pv.until) {
      previews.delete(id);
      if (pv.open) {
        try {
          uiManager.closeAllForms(player);
        } catch {
          // already closed
        }
      }
      continue;
    }
    if (player.dimension.id === pv.dim) drawPreview(player, pv);
  }
}, 10);

/** @param {Project} p */
function spotHint(p) {
  if (p.structure) return `If the structure "${p.structure}" is saved in the world, it's placed with its corner here; otherwise the ${p.name} is built.`;
  switch (p.build) {
    case "dock":
      return "Stand at the water's edge facing the water: the deck goes out 10 blocks at the water's surface.";
    case "lamps":
      return "Four lamp posts in a row ahead of you, 4 blocks apart, starting where you stand.";
    case "well":
    case "garden":
      return "5 by 5 blocks just ahead of you, set into the ground.";
    default:
      return "Just ahead of you. Only air, plants, grass and dirt are replaced, never builds.";
  }
}

/** @param {Player} player @param {string} townId */
async function protectForm(player, townId) {
  const t = allTowns().get(townId);
  if (!t) return;
  const res = await show(
    player,
    new ModalFormData()
      .title(`§l${t.n}`)
      .toggle("Protect from world events", {
        defaultValue: isProtected(t),
        tooltip: `Meteors, tornadoes, storms and other world events still happen within ${get("townRadius")} blocks of ${t.n}, but don't break or place blocks there (in packs that support safe zones).`,
      })
      .submitButton("Save"),
  );
  if (!res || res.canceled || !res.formValues || !player.isValid || !stillOp(player)) return;
  const on = res.formValues.find((v) => typeof v === "boolean");
  if (typeof on === "boolean") setProtected(t, on, (m) => player.sendMessage(m));
}

/** @param {Town} t @param {boolean} on @param {(msg: string) => void} tell */
function setProtected(t, on, tell) {
  const now = allTowns().get(t.id);
  if (!now) return tell("§cThat town was removed.");
  if (on) delete now.prot;
  else now.prot = 0;
  saveTown(now);
  zonesChanged();
  tell(on ? `§aProtect from world events: Enabled for ${now.n}. §7World events still happen there but don't break blocks.` : `§eProtect from world events: Disabled for ${now.n}. §7World events can break blocks there now.`);
}

/** @param {Player} player */
async function removeTown(player) {
  const t = nearestTown(player, get("townRadius"));
  if (!t) return player.sendMessage(`§cYou're not in a town (within ${get("townRadius")} blocks of its center).`);
  const res = await show(
    player,
    new MessageFormData()
      .title("§lRemove town?")
      .body(`Remove ${t.n} (${levelName(t.lvl)}, level ${t.lvl}) and all its project progress? What's built stays standing.`)
      .button1("§cRemove it")
      .button2("Keep it"),
  );
  if (!res || res.canceled || res.selection !== 0 || !player.isValid || !stillOp(player)) return;
  deleteTown(t);
  player.sendMessage(`§aTown ${t.n} removed.`);
}

/** @param {Town} t */
function deleteTown(t) {
  for (const p of PROJECTS) {
    const key = `${PROG_PREFIX}${t.id}:${p.id}`;
    progCache.delete(key);
    world.setDynamicProperty(key, undefined);
    if (t.spots[p.id]?.snap) deleteStructure(snapId(t, p));
  }
  try {
    for (const key of world.getDynamicPropertyIds()) if (key.startsWith(`${PROG_PREFIX}${t.id}:`)) world.setDynamicProperty(key, undefined); // projects removed from config.js
  } catch {
    // fine
  }
  allTowns().delete(t.id);
  world.setDynamicProperty(TOWN_PREFIX + t.id, undefined);
  zonesChanged();
}

// ---------------------------------------------------------------------------
// Safe zones: towns with "Protect from world events" Enabled, for packs whose world events break blocks
// ---------------------------------------------------------------------------

const ZONE_LIMIT = 2000; // script event messages may be at most 2048 characters (town names are plain ASCII)

function broadcastZones() {
  const r = get("townRadius");
  const zones = [...allTowns().values()].filter(isProtected).map((t) => ({ id: t.id, name: t.n, dim: t.dim, x: t.x, z: t.z, r, shape: "circle" }));
  if (!zones.length) return send("realm:zones", { src: "town", part: 1, parts: 0, zones: [] });
  /** @type {object[][]} */
  const parts = [[]];
  for (const z of zones) {
    const last = /** @type {object[]} */ (parts.at(-1));
    if (last.length && JSON.stringify({ src: "town", part: 99, parts: 99, zones: [...last, z] }).length > ZONE_LIMIT) parts.push([z]);
    else last.push(z);
  }
  parts.forEach((list, i) => send("realm:zones", { src: "town", part: i + 1, parts: parts.length, zones: list }));
}

/**
 * Every town for Realm Calendar's sieges: realm:town_list { part, parts, towns: [{ id, n, dim, x, y, z, safe }] },
 * `safe` while **Protect from world events** is Enabled (parts under 2048 characters; parts 0 = no towns).
 */
function broadcastTownList() {
  const towns = [...allTowns().values()].map((t) => ({ id: t.id, n: t.n, dim: t.dim, x: t.x, y: t.y, z: t.z, safe: isProtected(t) }));
  if (!towns.length) return send("realm:town_list", { part: 1, parts: 0, towns: [] });
  /** @type {object[][]} */
  const parts = [[]];
  for (const t of towns) {
    const last = /** @type {object[]} */ (parts.at(-1));
    if (last.length && JSON.stringify({ part: 99, parts: 99, towns: [...last, t] }).length > ZONE_LIMIT) parts.push([t]);
    else last.push(t);
  }
  parts.forEach((list, i) => send("realm:town_list", { part: i + 1, parts: parts.length, towns: list }));
}

/** Town moods from Realm Calendar (realm:town_state): Heartened towns count deliveries x1.25. @type {Map<string, { mood: string, until: number }>} */
const moods = new Map();
/** @param {string} townId */
function moodOf(townId) {
  const m = moods.get(townId);
  return m && m.until > Date.now() ? m.mood : undefined;
}
const HEARTENED = 1.25;

let zonesQueued = false;
/** Sends the town zones again, once, a moment after a change. */
function zonesChanged() {
  if (zonesQueued) return;
  zonesQueued = true;
  system.runTimeout(() => {
    zonesQueued = false;
    try {
      broadcastZones();
      broadcastTownList();
    } catch (e) {
      console.warn(`[town] zones: ${e}`);
    }
  }, 5);
}

onChange((key) => {
  if (key === "townRadius" || key === "*") zonesChanged();
});
world.afterEvents.worldLoad.subscribe(() =>
  system.runTimeout(() => {
    zonesChanged();
    send("realm:town_state_ping", {});
  }, 100),
);
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id === "realm:zones_ping" || id === "realm:town_list_ping") zonesChanged();
    else if (id === "realm:town_state") {
      try {
        const m = JSON.parse(message);
        if (!m || typeof m.town !== "string" || typeof m.mood !== "string" || typeof m.until !== "number") return;
        if (moods.size < 200 || moods.has(m.town)) moods.set(m.town, { mood: m.mood.slice(0, 16), until: m.until });
      } catch {
        // not ours
      }
    }
  },
  { namespaces: ["realm"] },
);

// ---------------------------------------------------------------------------
// Scenario tests (BDS harness): the operator actions without forms. Only from the server console or an operator.
//   /scriptevent realm:town_test {"action":"add|spot|finish|remove|rebuild|protect|zones|dump", "player"?, "town"?, "project"?, "name"?, "spot"?, "on"?}
// ---------------------------------------------------------------------------

system.afterEvents.scriptEventReceive.subscribe(
  (ev) => {
    if (ev.id !== "realm:town_test") return;
    const src = ev.sourceEntity;
    if (ev.sourceType !== ScriptEventSource.Server && !(src instanceof Player && isOp(src))) return;
    let m;
    try {
      m = JSON.parse(ev.message);
    } catch {
      return;
    }
    if (!m || typeof m !== "object") return;
    const player = typeof m.player === "string" ? world.getAllPlayers().find((x) => x.name === m.player) : src instanceof Player ? src : undefined;
    /** @param {string} msg */
    const tell = (msg) => {
      console.warn(`[town_test] ${msg.replace(/§./g, "")}`);
      player?.sendMessage(msg);
    };
    try {
      const t = typeof m.town === "string" ? allTowns().get(m.town) : player ? nearestTown(player, get("townRadius")) : undefined;
      const p = typeof m.project === "string" ? byId.get(m.project) : undefined;
      if (m.action === "add") {
        if (player) addTown(player, String(m.name ?? ""), tell);
        return;
      }
      if (m.action === "zones") return broadcastZones();
      if (!t) return tell("no town");
      if (m.action === "dump") return tell(JSON.stringify({ town: t, progress: PROJECTS.map((x) => [x.id, progressOf(t, x)]) }));
      if (m.action === "protect") return setProtected(t, m.on !== false, tell);
      if (!p) return tell("no project");
      if (m.action === "spot") {
        const s = m.spot && typeof m.spot === "object" ? { x: Math.floor(m.spot.x), y: Math.floor(m.spot.y), z: Math.floor(m.spot.z), f: ((Math.floor(m.spot.f ?? 0) % 4) + 4) % 4 } : player ? spotOf(player) : undefined;
        if (!s || [s.x, s.y, s.z].some((n) => !Number.isFinite(n))) return tell("no spot");
        tell(`footprint ${JSON.stringify(footprint(p, s))}, in the way ${inTheWay(t, p, s)}`);
        applySpot(t, p, s, tell);
      } else if (m.action === "finish") {
        const pr = progressOf(t, p);
        if (pr.done) return tell("already finished");
        pr.got = { ...p.needs };
        pr.done = 1;
        saveProgress(t, p, pr);
        finishProject(t, p, pr);
      } else if (m.action === "remove") removeSpot(t, p, tell);
      else if (m.action === "rebuild") rebuildSpot(t, p, tell);
    } catch (e) {
      tell(`error: ${e}`);
    }
  },
  { namespaces: ["realm"] },
);

// ---------------------------------------------------------------------------
// Townsfolk (npc_bp): mayors offer the nearest town's projects
// ---------------------------------------------------------------------------

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:npc_talk" && id !== "realm:npc_choose") return;
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object" || typeof msg.player !== "string") return;
    try {
      const player = online(msg.player);
      if (!player) return;
      if (id === "realm:npc_talk") {
        if (!Array.isArray(msg.roles) || !msg.roles.includes(CONFIG.npcRole)) return;
        const t = nearestTown(player, get("townRadius"));
        if (!t) return;
        send("realm:npc_offer", { req: msg.req, pack: "town_bp", key: `town:${t.id}`, label: `Town projects (${t.n})`, order: 30 });
      } else if (msg.pack === "town_bp" && typeof msg.key === "string" && msg.key.startsWith("town:")) {
        const townId = msg.key.slice(5);
        system.run(() => townMenu(player, townId, true).catch((e) => console.warn(`[town] ${e}`)));
      }
    } catch (e) {
      console.warn(`[town] npc: ${e}`);
    }
  },
  { namespaces: ["realm"] },
);

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  system.runTimeout(() => {
    try {
      if (!player.isValid) return;
      payOwed(player);
      if (!isOp(player)) return;
      for (const t of allTowns().values())
        for (const p of PROJECTS) {
          const pr = progressOf(t, p);
          if (pr.done && !pr.built && !t.spots[p.id]) player.sendMessage(`§e[Town Projects] ${t.n}'s ${p.name} is finished but has no spot: stand there and run /realm:town_spot ${p.id}`);
        }
    } catch (e) {
      console.warn(`[town] join: ${e}`);
    }
  }, 200);
});

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {import("@minecraft/server").CustomCommandOrigin} origin */
const originPlayer = (origin) => {
  const p = origin.initiator ?? origin.sourceEntity;
  return p instanceof Player ? p : undefined;
};
const notPlayer = { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
const ok = { status: CustomCommandStatus.Success };
/** @param {() => unknown} fn */
const later = (fn) =>
  system.run(() => {
    try {
      const r = fn();
      if (r instanceof Promise) r.catch((e) => console.warn(`[town] ${e}`));
    } catch (e) {
      console.warn(`[town] ${e}`);
    }
  });

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerEnum("realm:town_project", PROJECTS.length ? PROJECTS.map((p) => p.id) : ["none"]);

  customCommandRegistry.registerCommand(
    {
      name: "realm:town",
      description: "Town Projects: a menu of everything you can do (town info, projects, other towns; operators: spots, towns)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = originPlayer(origin);
      if (!player) return notPlayer;
      later(() => mainMenu(player));
      return ok;
    },
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:town_stats",
      description: "Town Projects: the nearest town's level, projects, progress and contributors",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = originPlayer(origin);
      if (!player) return notPlayer;
      later(() => townStats(player));
      return ok;
    },
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:town_add",
      description: "Add a town centered where you stand, with a name",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "name", type: CustomCommandParamType.String }],
    },
    (origin, /** @type {string} */ name) => {
      const player = originPlayer(origin);
      if (!player) return notPlayer;
      later(() => addTown(player, String(name ?? "")));
      return ok;
    },
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:town_spot",
      description: "Set (or move) where a project of this town is built, with a preview: where you stand, facing the way you face",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "realm:town_project", type: CustomCommandParamType.Enum }],
    },
    (origin, /** @type {string} */ project) => {
      const player = originPlayer(origin);
      if (!player) return notPlayer;
      later(() => setSpot(player, String(project)));
      return ok;
    },
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:town_remove",
      description: "Remove the town you're in, with all its project progress (what's built stays)",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
    },
    (origin) => {
      const player = originPlayer(origin);
      if (!player) return notPlayer;
      later(() => removeTown(player));
      return ok;
    },
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "town_bp");
  },
  { namespaces: ["realm"] },
);
