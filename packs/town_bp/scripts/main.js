import {
  BlockPermutation,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Dimension,
  ItemLockMode,
  Player,
  StructureRotation,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, MessageFormData } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

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
/** @typedef {{ x: number, y: number, z: number, f: number }} Spot f: 0 south, 1 west, 2 north, 3 east (the way the build faces) */
/** @typedef {{ id: string, n: string, dim: string, x: number, y: number, z: number, lvl: number, spots: Record<string, Spot>, by: string, at: number }} Town */
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
const owedAll = () => readJson(PROP_OWED) ?? {};

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
    send("realm:quest_done", { player: p.id, pack: "town_bp", id, label, kind: "town" });
    if (rep > 0) send("realm:rep_add", { player: p.id, guild, amount: rep, reason: label });
  }
}

/** @param {string} pid @param {number} crowns @param {[string, string, string]} quest */
function owe(pid, crowns, quest) {
  const all = owedAll();
  const o = all[pid] ?? { cr: 0, q: [] };
  o.cr += crowns;
  o.q = [...o.q, quest].slice(-20);
  all[pid] = o;
  try {
    world.setDynamicProperty(PROP_OWED, JSON.stringify(all));
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

/** How many of an item the player carries that could be delivered. @param {Player} player @param {string} item */
function carried(player, item) {
  const inv = player.getComponent("minecraft:inventory")?.container;
  const keepNamed = get("keepNamedItems") === true;
  let n = 0;
  if (inv)
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it?.typeId === item && it.lockMode === ItemLockMode.none && !(keepNamed && it.nameTag)) n += it.amount;
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
    if (!it || it.typeId !== item || it.lockMode !== ItemLockMode.none || (keepNamed && it.nameTag)) continue;
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
  for (const [item, need] of Object.entries(p.needs)) {
    const left = need - (pr.got[item] ?? 0);
    if (left <= 0) continue;
    const n = take(player, item, left);
    if (!n) continue;
    pr.got[item] = (pr.got[item] ?? 0) + n;
    total += n;
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
  player.sendMessage(`§aYou delivered ${gave.join(", ")} for ${t.n}'s ${p.name}. §7Now ${pct(p, pr)} percent.`);
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
  ranked.forEach(([id], i) => {
    const crowns = CONFIG.topCrowns[i] ?? 0;
    const pl = online(id);
    if (pl) payNow(pl, crowns, [quest], `${p.name}, ${t.n}`);
    else owe(id, crowns, quest);
  });
  build(t, p, true);
  levelUp(t);
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
 * loaded; `fresh` tells operators what's missing.
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
  /** @type {Dimension} */
  let dim;
  try {
    dim = world.getDimension(t.dim);
    if (!dim.getBlock(s)) throw new Error("unloaded");
  } catch {
    if (fresh) tellOps(`§e[Town Projects] ${t.n}'s ${p.name} will be built when someone is near its spot (${s.x}, ${s.y}, ${s.z}).`);
    return false;
  }
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
      const fwd = FORWARD[s.f] ?? FORWARD[0];
      for (const pl of design(p.build)) {
        const loc = toWorld(s, pl.x, pl.y, pl.z);
        let block;
        try {
          block = dim.getBlock(loc);
        } catch {
          block = undefined;
        }
        if (!block || !canReplace(block.typeId, pl.mode)) {
          // A cobblestone floor under a well, or posts under a dock, are only needed where it's open.
          if (!(pl.mode === "wet" || (p.build === "well" && pl.y === -2) || (p.build === "garden" && pl.y === -2))) skipped++;
          continue;
        }
        const states = pl.block === "minecraft:wall_sign" ? { facing_direction: wallFacing({ x: -fwd.x, z: -fwd.z }) } : pl.states;
        block.setPermutation(perm(pl.block, states));
        placed++;
      }
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
 * @template {ActionFormData | MessageFormData} F
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

/** /realm:town @param {Player} player */
async function mainMenu(player) {
  const t = nearestTown(player);
  if (!t) {
    const any = allTowns().size;
    if (any) return townList(player);
    player.sendMessage(`§7No towns yet.${isOp(player) ? " Stand in the middle of one and run /realm:town_add <name>." : ""}`);
    return;
  }
  const inTown = Math.hypot(player.location.x - t.x, player.location.z - t.z) <= get("townRadius");
  await townMenu(player, t.id, inTown && get("deliverWithCommand") === true);
}

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

/** @param {Player} player @param {string} rawName */
function addTown(player, rawName) {
  const name = rawName
    .replace(/§./g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .trim()
    .slice(0, NAME_LENGTH);
  if (!name) return player.sendMessage("§cGive the town a name, for example /realm:town_add Riverside (quotes for spaces: \"Oak Hollow\").");
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "town";
  if ([...allTowns().values()].some((t) => t.n.toLowerCase() === name.toLowerCase())) return player.sendMessage(`§cThere is already a town called ${name}.`);
  const close = nearestTown(player, get("townRadius") / 2);
  if (close) return player.sendMessage(`§c${close.n} is too close (its center is at ${close.x}, ${close.z}). Towns must be at least ${Math.round(get("townRadius") / 2)} blocks apart.`);
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
  levelUp(t); // only if the config has no projects for level 1
  const first = projectsAt(t.lvl);
  player.sendMessage(
    `§aTown ${name} added here (${t.x}, ${t.z}), a ${levelName(t.lvl)}. ${first.length ? `Its first projects: ${first.map((p) => p.name).join(", ")}.` : ""} §7Mayors (NPCs with the role ${CONFIG.npcRole}) within ${get("townRadius")} blocks take deliveries. Set where each project is built with /realm:town_spot <project>.`,
  );
  if (get("announce") === true) world.sendMessage(`§6A new town: §e${name}§6! Bring materials to its mayor to build it up. /realm:town`);
}

/** @param {Player} player @param {string} projectId */
function setSpot(player, projectId) {
  const p = byId.get(projectId);
  if (!p) return player.sendMessage(`§cNo project "${projectId}". Projects: ${PROJECTS.map((x) => x.id).join(", ")}.`);
  const t = nearestTown(player, get("townRadius"));
  if (!t) return player.sendMessage(`§cYou're not in a town (within ${get("townRadius")} blocks of its center). /realm:town_add makes one.`);
  const pr = progressOf(t, p);
  if (pr.built) return player.sendMessage(`§e${t.n}'s ${p.name} is already built at ${t.spots[p.id] ? `${t.spots[p.id].x}, ${t.spots[p.id].y}, ${t.spots[p.id].z}` : "its spot"}.`);
  const yaw = player.getRotation().y;
  const f = ((Math.round(yaw / 90) % 4) + 4) % 4;
  const s = { x: Math.floor(player.location.x), y: Math.floor(player.location.y), z: Math.floor(player.location.z), f };
  t.spots[p.id] = s;
  saveTown(t);
  const facing = ["south", "west", "north", "east"][f];
  player.sendMessage(`§a${t.n}'s ${p.name} will be built here (${s.x}, ${s.y}, ${s.z}), facing ${facing}, in front of you. §7${spotHint(p)}`);
  if (pr.done) build(t, p, true);
}

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
  if (!res || res.canceled || res.selection !== 0 || !player.isValid) return;
  for (const p of PROJECTS) {
    const key = `${PROG_PREFIX}${t.id}:${p.id}`;
    progCache.delete(key);
    world.setDynamicProperty(key, undefined);
  }
  try {
    for (const key of world.getDynamicPropertyIds()) if (key.startsWith(`${PROG_PREFIX}${t.id}:`)) world.setDynamicProperty(key, undefined); // projects removed from config.js
  } catch {
    // fine
  }
  allTowns().delete(t.id);
  world.setDynamicProperty(TOWN_PREFIX + t.id, undefined);
  player.sendMessage(`§aTown ${t.n} removed.`);
}

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
      description: "Town Projects: the nearest town's level, projects, progress and contributors",
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
      description: "Set where a project of this town is built: where you stand, facing the way you face",
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
