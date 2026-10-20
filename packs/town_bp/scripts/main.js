import "./diag.js";
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
import { onScriptEvent } from "./script-events.js";
import { applyParts, createOwedStore } from "./owed.js";
import { BUILDS, FORWARD, design, designFootprint, isOptionalPlace, toWorld } from "./designs.js";
import { BRAM, cleanName, createPlacesAssembler, isTownMayorId, mayorParts, newTownMayor, offerTowns, planMigration, readMayor } from "./mayors.js";
import { MAX_CELLS, addCell, boxCells, cellOf, loadCells, saveParts, touches } from "./placed.js";
import { NATURAL, UNDER, UNKNOWN, WILD, allowedInRegion, decodePlan, isLeaves, overlaps, readColumn, rectOf, regionOf, scanTown } from "./sites.js";

// One world property per town ("town:t:<id>": name, center, level, build spots) and one per project of
// each town ("town:p:<town>:<project>": items delivered, contributors, finished, built), so a busy
// town's contributor lists never come near the 32 KB property limit. Rewards for contributors who
// were offline when a project finished wait in "town:owed:<playerId>" (one property each) until they join.

const TOWN_PREFIX = "town:t:";
const PROG_PREFIX = "town:p:";
const MAX_LEVEL = 5;
const NAME_LENGTH = 24;
const PROP_LIMIT = 30000;
const BUILD_CHECK_TICKS = 100;
const NEAR_SPOT = 64; // a waiting build goes up when a player is this close to its spot

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {typeof CONFIG.projects[number]} Project */
/**
 * f: 0 south, 1 west, 2 north, 3 east (the way the build faces). Once built: snap 1 when the ground under it was saved as
 * the structure snapId(town, project) before building, and b the box it covers [x1, y1, z1, x2, y2, z2]; old 1 when it was
 * built before snapshots existed (so what's there is never saved as the ground). A spot picked automatically (sites.js)
 * has a: 1, its grading plan lv (sites.js encodePlan, over the footprint plus a 2-block apron), lt the block a fill gets
 * on top ("grass_block"), and bs: 1 while its build has started but isn't finished (it resumes after a restart).
 * @typedef {{ x: number, y: number, z: number, f: number, snap?: number, b?: number[], old?: number, a?: number, lv?: string, lt?: string, bs?: number }} Spot
 */
/**
 * prot: 0 when "Protect from world events" is Disabled (missing means Enabled). v: 2 once the town has a mayor `m`
 * ("bram", or "mayor:<id>" named `mn`; mayors.js); records saved before mayors (v1) have neither and still read.
 */
/**
 * plf: 1 once the town's placed-block cells (placed.js) were full: it never levels ground again. Automatic spots:
 * scan the projects still to get a spot (picked while a player is in the town), nos those with no good spot (an
 * operator sets one), rt those whose spot failed its last check once (a second failure goes to nos), as: 1 once the
 * town's projects were queued for automatic spots (towns from before this version get it on the first check).
 * @typedef {{ id: string, n: string, dim: string, x: number, y: number, z: number, lvl: number, spots: Record<string, Spot>, by: string, at: number, prot?: number, v?: number, m?: string, mn?: string, plf?: number, scan?: string[], nos?: string[], rt?: string[], as?: number }} Town
 */
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
      if (t && typeof t.id === "string" && typeof t.x === "number") map.set(t.id, readSites(readMayor({ ...t, spots: t.spots ?? {}, lvl: t.lvl ?? 1 })));
    }
  } catch {
    return map; // the world isn't loaded yet: read again next time
  }
  return (towns = map);
}

/** Project id lists of a saved town, cleaned: known projects only, each once; empty lists dropped. @param {any} t */
function readSites(t) {
  for (const k of ["scan", "nos", "rt"]) {
    const list = Array.isArray(t[k]) ? [...new Set(t[k].filter((/** @type {unknown} */ x) => typeof x === "string" && byId.has(x)))] : [];
    if (list.length) t[k] = list;
    else delete t[k];
  }
  return t;
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

/** What a contributor is owed: crowns and their latest finished projects. Unknown or damaged records are repaired as they are read. @param {any} o @returns {Owed} */
function normalizeOwed(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("not an owed record");
  const q = Array.isArray(o.q) ? o.q.filter((/** @type {unknown} */ x) => Array.isArray(x) && x.length === 3 && x.every((y) => typeof y === "string")) : [];
  return { ...o, cr: Math.max(0, Math.floor(Number(o.cr) || 0)), q: q.slice(-10) };
}

// One world property per player ("town:owed:<playerId>") plus the index "town:owed_idx" (owed.js): no more shared-property cliff.
const owedStore = createOwedStore(world, { base: "town:owed", normalize: normalizeOwed, summarize: (v) => `${v?.cr ?? 0} Crowns, ${v?.q?.length ?? 0} projects` });

/** @param {Player} p @param {number} crowns @param {[string, string, string][]} quests @param {string} why @param {(crowns: number) => void} [keep] called with Crowns that could not be added */
function payNow(p, crowns, quests, why, keep) {
  if (crowns > 0) {
    const whole = Math.floor(crowns);
    const { applied } = applyParts(
      [whole],
      (n) => {
        const obj = crownsObjective();
        if (!obj) throw new Error("no crowns scoreboard");
        obj.addScore(p, n);
      },
      (failed) => keep?.(failed[0]),
      (m) => console.warn(`[town] ${m}`),
    );
    if (applied) {
      try {
        p.sendMessage(`§6+${whole} Crowns §7(${why})`);
      } catch (e) {
        console.warn(`[town] crowns message: ${e}`);
      }
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
  const saved = owedStore.update(pid, (cur) => {
    const o = cur ? normalizeOwed(cur) : { cr: 0, q: [] };
    o.cr += crowns;
    o.q = [...o.q, quest].slice(-10);
    return o;
  });
  if (!saved) console.warn(`[town] owed: ${crowns} Crowns for ${pid} could not be saved`);
}

/** @param {Player} p */
function payOwed(p) {
  const raw = owedStore.take(p.id);
  if (!raw) return;
  const o = normalizeOwed(raw);
  p.sendMessage("§6Town projects you helped with were finished while you were away. Thank you!");
  payNow(p, o.cr, o.q, "Town projects", (crowns) => {
    if (!owedStore.update(p.id, (cur) => ({ ...o, ...(cur ? normalizeOwed(cur) : {}), cr: crowns + (cur ? normalizeOwed(cur).cr : 0), q: [] }))) console.warn(`[town] owed: ${crowns} Crowns for ${p.id} could not be saved`);
  });
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

// Town news: a finished project is Townsfolk gossip about the top contributor (at most one piece per in-game hour
// from this pack, each project once) and a letter through Realm Mail to the contributors who are offline (the
// biggest LETTERS_MAX), so they hear of it before they next join.
const NEWS_GAP = 1000; // ticks, an in-game hour
const LETTERS_MAX = 10;
let newsAt = -NEWS_GAP;
/** @type {Set<string>} */
const newsSeen = new Set();

/** @param {string} key @param {object} msg */
function gossip(key, msg) {
  const now = system.currentTick;
  if (newsSeen.has(key) || now - newsAt < NEWS_GAP) return false;
  newsAt = now;
  newsSeen.add(key);
  if (newsSeen.size > 64) newsSeen.delete(/** @type {string} */ (newsSeen.values().next().value));
  send("realm:gossip", msg);
  return true;
}

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
  if (ranked[0]) gossip(`${t.id}:${p.id}`, { kind: "town_project", player: ranked[0][0], name: ranked[0][1], place: `${p.name} in ${t.n}` });
  let letters = 0;
  ranked.forEach(([id, name, n], i) => {
    const crowns = CONFIG.topCrowns[i] ?? 0;
    const pl = online(id);
    if (pl)
      payNow(pl, crowns, [quest], `${p.name}, ${t.n}`, (kept) => {
        // The quest lines went out already: only the Crowns that could not be added are owed.
        owedStore.update(id, (cur) => {
          const o = cur ? normalizeOwed(cur) : { cr: 0, q: [] };
          return { ...o, cr: o.cr + kept };
        });
      });
    else {
      owe(id, crowns, quest);
      if (letters++ >= LETTERS_MAX) return;
      const body =
        `${name},\n\n${t.n} finished its ${p.name} while you were away. You delivered ${fmt(n)} items for it` +
        `${i === 0 ? ", more than anyone" : ""}.${crowns > 0 ? ` Your ${fmt(crowns)} Crowns wait for you when you next come by.` : ""}\n\nThank you!\n\n- ${t.n}`;
      send("realm:mail_send", { to: id, from: `${t.n}`.replace(/§./g, "").slice(0, 32), subject: `${p.name} is finished`.slice(0, 40), body: body.slice(0, 600) });
    }
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
  queueScan(t, projectsAt(t.lvl).map((p) => p.id));
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
 * What each placement may replace (designs.js): "air" air and plants; "ground" also grass and dirt; "water" also
 * water; "wet" only water.
 * @typedef {import("./designs.js").Mode} Mode
 * @typedef {import("./designs.js").Place} Place
 */

/** A block of a design that's only needed where it's open. @param {Project} p @param {Place} pl */
const isOptional = (p, pl) => isOptionalPlace(p.build, pl);

/** @param {string} type @param {Mode} mode */
function canReplace(type, mode) {
  if (mode === "wet") return WATER.has(type);
  if (PLANTS.has(type)) return true;
  if (mode === "ground") return GROUND.has(type);
  if (mode === "water") return WATER.has(type);
  return false;
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
    if (fresh) {
      if (get("autoSpots") === true && t.scan?.includes(p.id)) tellOps(`§e[Town Projects] ${t.n}'s ${p.name} is finished: its spot is picked automatically when a player is in the town.`);
      else tellOps(`§e[Town Projects] ${t.n}'s ${p.name} is finished${t.nos?.includes(p.id) ? " but no good spot was found for it" : ""}. Stand where it should go, facing the way it should face, and run /realm:town_spot ${p.id}`);
    }
    return false;
  }
  // A spot picked automatically: leveled and built a few blocks a tick, after its outline is shown (autoBuild).
  if (s.a) return queueAutoBuild(t, p);
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
  announceBuilt(t, p, s, dim, placed, skipped);
  return true;
}

/** @param {Town} t @param {Project} p @param {Spot} s @param {Dimension} dim @param {number} placed @param {number} skipped */
function announceBuilt(t, p, s, dim, placed, skipped) {
  const where = `${s.x}, ${s.y}, ${s.z}`;
  const msg = `§a${t.n}'s new ${p.name} is built at ${where}.`;
  if (get("announce") === true) world.sendMessage(msg);
  else tellOps(msg);
  if (skipped) tellOps(`§7[Town Projects] ${skipped} block${skipped === 1 ? " was" : "s were"} left out of the ${p.name} because something else was in the way. Builds only replace air, plants, grass and dirt (and water for a dock).`);
  if (placed && get("fireworks") === true) fireworks(dim, toWorld(s, 0, 1, 2));
  if (p.build === "notice_board") system.runTimeout(() => refreshBoard(t), 2);
}

// ---------------------------------------------------------------------------
// Footprints and snapshots
// ---------------------------------------------------------------------------

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
  return designFootprint(p.build, s);
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
 * @param {Town} t @param {Project} p @param {Spot} s @param {Dimension} dim @param {Box} box @returns {boolean}
 */
function snapshot(t, p, s, dim, box) {
  const id = snapId(t, p);
  try {
    deleteStructure(id);
    world.structureManager.createFromWorld(id, dim, box.min, box.max, { includeBlocks: true, includeEntities: false, saveMode: StructureSaveMode.World });
    s.snap = 1;
    s.b = boxArray(box);
    saveTown(t);
    return true;
  } catch (e) {
    console.warn(`[town] snapshot ${id}: ${e}`);
    return false;
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
      const kinds = buildKinds(p);
      // Leveling filled with dirt and the surrounding top block: those go back too.
      if (s.a) for (const k of ["minecraft:dirt", fillTop(s)]) kinds.add(k);
      restoreGround(dim, st, box, kinds);
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
  // Twice: first what becomes air, top down (so nothing left above falls), then the rest, bottom up (so sand and
  // gravel always land on what holds them).
  for (const pass of [0, 1])
    for (let k = 0; k <= box.max.y - box.min.y; k++) {
      const y = pass === 0 ? box.max.y - k : box.min.y + k;
      for (let x = box.min.x; x <= box.max.x; x++)
        for (let z = box.min.z; z <= box.max.z; z++) {
          const want = st.getBlockPermutation({ x: x - box.min.x, y: y - box.min.y, z: z - box.min.z }) ?? air;
          if ((want.type.id === "minecraft:air") !== (pass === 0)) continue;
          if (want.type.id === "minecraft:structure_void") continue;
          const b = dim.getBlock({ x, y, z });
          if (!b) continue;
          if (b.permutation.matches(want.type.id, want.getAllStates())) continue;
          if (!b.isAir && !b.isLiquid && !kinds.has(b.typeId)) continue; // someone's own block
          b.setPermutation(want);
        }
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
  const out = { placed: 0, skipped: 0 };
  const steps = placeDesignSteps(dim, s, p, false, out);
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value ? out : undefined;
}

/**
 * placeDesign a block at a time: yields after each block it changes (the build job spreads them over ticks), returns
 * false (changing nothing) when a block isn't loaded. `auto` (a spot picked automatically): "ground" places may also
 * replace the natural ground they sit in (sand, gravel, stone), which the spot's snapshot keeps.
 * @param {Dimension} dim @param {Spot} s @param {Project} p @param {boolean} auto @param {{ placed: number, skipped: number }} out
 * @returns {Generator<void, boolean, void>}
 */
function* placeDesignSteps(dim, s, p, auto, out) {
  const fwd = FORWARD[s.f] ?? FORWARD[0];
  const { min, max } = dim.heightRange;
  /** @type {{ pl: Place, loc: Vector3, block: import("@minecraft/server").Block }[]} */
  const items = [];
  for (const pl of design(p.build)) {
    const loc = toWorld(s, pl.x, pl.y, pl.z);
    if (loc.y < min || loc.y >= max) {
      out.skipped++;
      continue;
    }
    let block;
    try {
      block = dim.getBlock(loc);
    } catch {
      block = undefined;
    }
    if (!block) return false; // not loaded
    items.push({ pl, loc, block });
    yield; // reads only: nothing has changed yet
  }
  /** @param {string} type @param {Mode} mode */
  const replaceable = (type, mode) => canReplace(type, mode) || (auto && mode === "ground" && NATURAL.has(type));
  /** @param {Place} pl */
  const optional = (pl) => isOptional(p, pl);
  /** @param {Place} pl */
  const later = (pl) => pl.block === "minecraft:water" || pl.block === "minecraft:waterlily";
  /** @param {{ pl: Place, block: import("@minecraft/server").Block }} it */
  const put = (it) => {
    const states = it.pl.block === "minecraft:wall_sign" ? { facing_direction: wallFacing({ x: -fwd.x, z: -fwd.z }) } : it.pl.states;
    it.block.setPermutation(perm(it.pl.block, states));
    out.placed++;
  };
  // 1. Everything but water and lily pads, supports first. A block that's already there (a rebuild) stays.
  for (const it of items) {
    if (later(it.pl)) continue;
    yield;
    if (it.block.typeId === it.pl.block) continue;
    if (!replaceable(it.block.typeId, it.pl.mode)) {
      // A cobblestone floor under a well, or posts under a dock, are only needed where it's open.
      if (!optional(it.pl)) out.skipped++;
      continue;
    }
    put(it);
  }
  // 2. Water, only where it can't spill.
  const water = items.filter((it) => it.pl.block === "minecraft:water" && it.block.typeId !== "minecraft:water");
  const wetAlready = new Set(items.filter((it) => it.pl.block === "minecraft:water" && it.block.typeId === "minecraft:water").map((it) => keyOf(it.loc)));
  const want = new Map(water.filter((it) => replaceable(it.block.typeId, it.pl.mode)).map((it) => [keyOf(it.loc), it]));
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
  out.skipped += water.length - want.size;
  for (const it of want.values()) {
    put(it);
    yield;
  }
  // 3. Lily pads on the water just placed.
  for (const it of items) {
    if (it.pl.block !== "minecraft:waterlily" || it.block.typeId === it.pl.block) continue;
    const below = keyOf({ x: it.loc.x, y: it.loc.y - 1, z: it.loc.z });
    if ((want.has(below) || wetAlready.has(below)) && replaceable(it.block.typeId, it.pl.mode)) {
      put(it);
      yield;
    } else out.skipped++;
  }
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

// Finished projects waiting to be built go up when someone is near their spot; towns whose mayor is missing ask
// Townsfolk for it again (mayorCheck).
system.runInterval(() => {
  try {
    mayorMigrate();
    const players = world.getAllPlayers();
    if (!players.length) return;
    mayorCheck(players);
    autoTick(players);
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

/** Why a finished project has no spot yet. @param {Town} t @param {Project} p */
const spotWait = (t, p) =>
  t.nos?.includes(p.id) ? "§7(no good spot was found: an operator can set one)" : get("autoSpots") === true && t.scan?.includes(p.id) ? "§7(a spot is being picked)" : "§7(waiting for an operator to pick its spot)";

/** @param {Town} t @param {Project} p */
function projectLine(t, p) {
  const pr = progressOf(t, p);
  if (pr.done) return `§a[Done] ${p.name}§r ${pr.built ? "§7(built)" : t.spots[p.id]?.bs ? "§7(being built)" : t.spots[p.id] ? "§7(waiting for someone nearby to be built)" : spotWait(t, p)}`;
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
    ...(t.nos ?? []).flatMap((id) => (byId.has(id) ? [`§eNo good spot was found for the ${byId.get(id)?.name}: an operator can set one (Set a project spot).§r`] : [])),
    canDeliver ? "Pick a project to see what it needs and deliver from your inventory." : `Deliver materials through ${mayorName(t)}.`,
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
  if (op && here?.nos?.length) lines.push(`§eNo good spot was found for ${here.nos.map((id) => byId.get(id)?.name ?? id).join(", ")}: set one (Set a project spot) or try Find spots again.`);
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
      if (get("autoSpots") === true)
        actions.push({
          text: `§4Find spots again\n§8Operators: ${here.nos?.length ? `${here.nos.length} without a good spot` : "pick spots automatically"}`,
          run: () => {
            const t = allTowns().get(here.id);
            if (t && player.isValid && stillOp(player)) findSpotsAgain(t, (m) => player.sendMessage(m));
          },
        });
      actions.push({ text: `§4Mayor\n§8Operators: ${here.m === BRAM ? "Mayor Bram, move" : here.m ? `${mayorName(here)}, move or rename` : "none yet"}`, run: () => mayorMenu(player, here.id) });
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
    as: 1,
  };
  queueScan(t, projectsAt(1).map((p) => p.id)); // automatic spots, picked while a player is in the town
  // Its own mayor (Townsfolk): Mayor Bram for the realm's first town, else a new one standing here.
  const mayors = get("townMayors") === true;
  if (mayors) Object.assign(t, { v: 2 }, newTownMayor([...allTowns().values()], t.id, t.n, CONFIG.mayorNames));
  saveTown(t);
  zonesChanged();
  if (mayors && isTownMayorId(t.m)) mayorSet(t, { x: t.x, y: t.y, z: t.z }, player.getRotation().y);
  levelUp(t); // only if the config has no projects for level 1
  const first = projectsAt(t.lvl);
  const who = !mayors
    ? `Mayors (NPCs with the role ${CONFIG.npcRole}) within ${get("townRadius")} blocks take deliveries.`
    : t.m === BRAM
      ? "Its mayor is Mayor Bram (Townsfolk): wherever he lives, he takes deliveries for it."
      : `Its mayor, ${t.mn}, stands here (Townsfolk) and takes deliveries for it; move or rename them in /realm:town.`;
  tell(
    `§aTown ${name} added here (${t.x}, ${t.z}), a ${levelName(t.lvl)}. ${first.length ? `Its first projects: ${first.map((p) => p.name).join(", ")}.` : ""} §7${who} ${get("autoSpots") === true ? "The town picks a spot for each project in the next minute or so (you can still set or move one from /realm:town)." : "Set where each project is built from /realm:town or with /realm:town_spot <project>."} World events don't break blocks here (Protect from world events is Enabled).`,
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
    const auto = s?.a ? " (picked)" : "";
    const state = pr.built && s ? `built at ${s.x}, ${s.y}, ${s.z}${auto}` : s ? `spot at ${s.x}, ${s.y}, ${s.z}${auto}` : t.nos?.includes(p.id) ? "no good spot found" : pr.done ? "finished, no spot yet" : "no spot yet";
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
    s.a ? `Picked automatically${s.lv ? ": the ground around it is leveled (natural ground only, at most 3 blocks) when it's built, and Remove spot puts it back" : ""}. A spot you set instead is kept and never leveled.` : "",
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
  cancelAutoBuild(`${t.id}:${p.id}`);
  // A build stopped half way (bs) is taken away like a finished one.
  const moving = pr.built === 1 || old?.bs === 1;
  if (moving && old) {
    const why = unbuild(t, p, old);
    if (why) {
      tell(`§cThe ${p.name} couldn't be moved: ${why}.`);
      return false;
    }
  } else if (old?.snap) deleteStructure(snapId(t, p));
  if (moving && pr.built) {
    pr.built = 0;
    saveProgress(t, p, pr);
  }
  t.spots[p.id] = { x: s.x, y: s.y, z: s.z, f: s.f };
  dropFrom(t, p.id); // an operator's spot: kept, never leveled (D5)
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
  cancelAutoBuild(`${t.id}:${p.id}`);
  const wasBuilt = pr.built === 1 || s.bs === 1;
  if (wasBuilt) {
    const why = unbuild(t, p, s);
    if (why) return tell(`§cThe ${p.name} couldn't be removed: ${why}.`);
    if (pr.built) {
      pr.built = 0;
      saveProgress(t, p, pr);
    }
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
  placedCells.delete(t.id);
  if (scanJob?.town === t.id) scanJob = undefined;
  for (const p of PROJECTS) cancelAutoBuild(`${t.id}:${p.id}`);
  for (let k = 0; k < 2; k++) world.setDynamicProperty(`${PLACED_PREFIX}${t.id}:${k}`, undefined);
  // Its own mayor goes with it (Mayor Bram stays where he lives).
  if (isTownMayorId(t.m)) send("realm:npc_mayor", { op: "remove", id: t.m });
  lastSet.delete(t.id);
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
    // Townsfolk: where the mayors are, and every mayor id (it drops mayors of towns removed meanwhile).
    try {
      allTowns();
      sendMayorList();
    } catch (e) {
      console.warn(`[town] mayors: ${e}`);
    }
    send("realm:npc_places_ping", {});
    send("realm:place_ping", {}); // story places: automatic spots keep away from them
  }, 100),
);
onScriptEvent(
  ["realm:zones_ping", "realm:town_list_ping", "realm:town_state"],
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
);

// ---------------------------------------------------------------------------
// Automatic spots (F37, sites.js): a town picks a spot for each project without one, while a player is in it (D10:
// no ticking areas), one town at a time, a few column reads a tick. Spots operators set are kept and never leveled
// (D5). A finished project at an automatic spot shows its outline to players nearby, is checked block by block again,
// saved (its region and depth, so Remove spot puts the terrain back), then leveled and built a few blocks a tick.
// ---------------------------------------------------------------------------

const SCAN_READS_TICK = 12; // column (or block) reads a tick
const SCAN_STEPS_TICK = 4000; // candidate steps a tick, so the scan's own work stays small too
const SCAN_FINAL_AFTER = 3; // scans that waited for unloaded ground; then the best known spot is taken
const CHECK_TICK = 32; // block reads a tick while a spot is checked (2 native calls each)
const APPLY_TICK = 48; // steps a tick while it is built: one block read, and at most one change, each
const CLAIMS_WAIT = 20; // ticks to wait for Land Claims (no answer: it isn't installed)
const OUTLINE_NEAR = 32;
const POST_KEEP = 6; // blocks from a townsfolk's post (their house)
const MAYOR_KEEP = 4;
const PLACE_KEEP = 16; // blocks from a story place (its prefab is built later)

/** @typedef {import("./sites.js").ScanRequest} ScanRequest */

/** Adds projects without a spot to the town's scan list (saved with the town by the caller). @param {Town} t @param {string[]} ids */
function queueScan(t, ids) {
  const list = new Set(t.scan ?? []);
  for (const id of ids) if (!t.spots[id] && byId.has(id)) list.add(id);
  if (list.size) t.scan = [...list];
  else delete t.scan;
}

/** @param {Town} t @param {string} id */
function dropFrom(t, id) {
  for (const k of /** @type {const} */ (["scan", "nos", "rt"])) {
    const list = t[k]?.filter((x) => x !== id);
    if (list?.length) t[k] = list;
    else delete t[k];
  }
}

/** The block a fill gets on top at a spot: its saved `lt` when it is natural ground, else grass. @param {Spot} s */
function fillTop(s) {
  const id = typeof s.lt === "string" && /^[a-z_]{1,40}$/.test(s.lt) ? `minecraft:${s.lt}` : "";
  return NATURAL.has(id) && id !== "minecraft:snow_layer" ? id : "minecraft:grass_block";
}

/** @param {Player[]} players @param {Town} t */
const playerIn = (players, t) => players.some((pl) => pl.dimension.id === t.dim && Math.hypot(pl.location.x - t.x, pl.location.z - t.z) <= get("townRadius"));

/** Story places (Story Questlines' realm:place_ready, asked with realm:place_ping at load), name -> where. @type {Map<string, { dim: string, x: number, z: number }>} */
const storyPlaces = new Map();
/** Land Claims answers waiting, by request id. @type {Map<string, (claims: { x1: number, z1: number, x2: number, z2: number }[]) => void>} */
const claimAsks = new Map();
let askSeq = 0;

/** Asks Land Claims which claims overlap a box (every claim: player ""). @param {string} dim @param {import("./sites.js").Rect} r @param {(claims: { x1: number, z1: number, x2: number, z2: number }[]) => void} fn */
function askClaims(dim, r, fn) {
  const id = `town_${++askSeq}`;
  claimAsks.set(id, fn);
  send("realm:claims_check", { id, player: "", dim, x1: r.x1, z1: r.z1, x2: r.x2, z2: r.z2 });
  return id;
}

/** @param {Dimension} dim @param {number} x @param {number} y @param {number} z @returns {import("./sites.js").BlockInfo | undefined} */
function blockInfo(dim, x, y, z) {
  try {
    const b = dim.getBlock({ x, y, z });
    if (!b) return undefined;
    const id = b.typeId;
    return isLeaves(id) ? { id, persistent: b.permutation.getState(/** @type {any} */ ("persistent_bit")) === true } : { id };
  } catch {
    return undefined; // not loaded (C16)
  }
}

/** One column for the scan (sites.js readColumn), unknown where it isn't loaded. @param {Dimension} dim @param {number} x @param {number} z */
function readCol(dim, x, z) {
  try {
    const top = dim.getTopmostBlock({ x, z });
    if (!top) return UNKNOWN;
    const topY = top.location.y;
    if (topY >= dim.heightRange.max - 1) return UNKNOWN; // C16: not ticking
    const id = top.typeId;
    const first = isLeaves(id) ? { id, persistent: top.permutation.getState(/** @type {any} */ ("persistent_bit")) === true } : { id };
    const surface = () => {
      // getTopmostBlock skips water (C15): the first block from above, water included.
      try {
        const w = dim.getBlockBelow({ x, y: Math.min(dim.heightRange.max - 1, topY + 64), z }, { includeLiquidBlocks: true, maxDistance: 80 });
        return w && w.isLiquid ? w.location.y : undefined;
      } catch {
        return undefined;
      }
    };
    return readColumn(topY, (y) => (y === topY ? first : blockInfo(dim, x, y, z)), surface);
  } catch {
    return UNKNOWN;
  }
}

/**
 * The scan in progress: the town, sites.js's generator, the request it waits on, and a Land Claims question.
 * @type {{ town: string, dim?: Dimension, gen?: Generator<ScanRequest, any, any>, pending?: ScanRequest, answer?: any, claims?: { x1: number, z1: number, x2: number, z2: number }[], ask?: { id: string, until: number } } | undefined}
 */
let scanJob;
/** Scans that waited for unloaded ground, by town, this session. @type {Map<string, number>} */
const scanWaits = new Map();

/** @param {Town} t */
function startScan(t) {
  const r = get("townRadius");
  const job = { town: t.id, ask: { id: "", until: system.currentTick + CLAIMS_WAIT } };
  job.ask.id = askClaims(t.dim, { x1: t.x - r, z1: t.z - r, x2: t.x + r, z2: t.z + r }, (claims) => {
    /** @type {any} */ (job).claims = claims;
  });
  scanJob = job;
  ensureJobs();
}

/** What the scan needs to know about the town and what's around it. @param {Town} t @param {{ x1: number, z1: number, x2: number, z2: number }[]} claims @returns {import("./sites.js").ScanInput} */
function scanInput(t, claims) {
  const ids = (t.scan ?? []).filter((id) => !t.spots[id]);
  /** @type {import("./sites.js").Rect[]} */
  const taken = [];
  for (const o of allTowns().values()) {
    if (o.dim !== t.dim) continue;
    for (const [id, s] of Object.entries(o.spots)) {
      const p = byId.get(id);
      if (p) taken.push(regionOf(rectOf(footprint(p, s))));
    }
  }
  /** @type {{ x: number, z: number, r: number }[]} */
  const posts = [];
  for (const [id, at] of places ?? []) if (dimId(at.dim) === t.dim) posts.push({ x: at.x, z: at.z, r: id === t.m ? MAYOR_KEEP : POST_KEEP });
  for (const at of storyPlaces.values()) if (dimId(at.dim) === t.dim) posts.push({ x: at.x, z: at.z, r: PLACE_KEEP });
  const depth = t.plf === 1 ? 0 : Math.max(0, Math.min(3, Math.floor(Number(get("levelDepth")) || 0)));
  return {
    cx: t.x,
    cz: t.z,
    radius: get("townRadius"),
    depth,
    projects: ids.map((id) => {
      const p = /** @type {Project} */ (byId.get(id));
      return { id, well: p.build === "well", dock: p.build === "dock", box: (/** @type {{ x: number, y: number, z: number, f: number }} */ s) => footprint(p, s) };
    }),
    taken,
    pads: Object.values(t.spots).map((s) => s.y - 1),
    posts,
    claims,
    claimsMore: claims.length >= 10,
    placed: (r, y1, y2) => touches(cellsOf(t), t, r, y1, y2),
    final: (scanWaits.get(t.id) ?? 0) >= SCAN_FINAL_AFTER,
  };
}

/** A tick of the scan: up to SCAN_READS_TICK reads. */
function stepScan() {
  const job = scanJob;
  if (!job) return;
  const t = allTowns().get(job.town);
  if (!t || get("autoSpots") !== true || !playerIn(world.getAllPlayers(), t)) {
    scanJob = undefined; // t.scan stays: it starts again when a player is in the town
    return;
  }
  if (job.ask) {
    if (!job.gen ? job.claims === undefined : job.answer === undefined) {
      if (system.currentTick <= job.ask.until) return;
      claimAsks.delete(job.ask.id);
      if (!job.gen) job.claims = []; // no Land Claims
      else job.answer = 0;
    }
    job.ask = undefined;
  }
  if (!job.gen) {
    job.dim = world.getDimension(t.dim);
    job.gen = scanTown(scanInput(t, job.claims ?? []));
  }
  const dim = /** @type {Dimension} */ (job.dim);
  let reads = 0;
  for (let steps = 0; steps < SCAN_STEPS_TICK; steps++) {
    let q = job.pending;
    if (!q) {
      const r = job.gen.next(job.answer);
      job.answer = undefined;
      if (r.done) return finishScan(t, r.value);
      q = r.value;
    }
    if (q[0] === "claims") {
      job.pending = undefined;
      const [, x1, z1, x2, z2] = /** @type {["claims", number, number, number, number]} */ (q);
      const ask = { id: "", until: system.currentTick + CLAIMS_WAIT };
      ask.id = askClaims(t.dim, { x1, z1, x2, z2 }, (claims) => {
        if (scanJob === job && job.ask === ask) job.answer = claims.length;
      });
      job.ask = ask;
      return;
    }
    if (reads >= SCAN_READS_TICK) {
      job.pending = q;
      return;
    }
    reads++;
    job.pending = undefined;
    const [kind, a, b, c] = /** @type {[string, number, number, number]} */ (q);
    job.answer = kind === "c" ? readCol(dim, a, b) : blockInfo(dim, a, b, c);
  }
}

/** @param {Town} t0 @param {{ picks: { id: string, spot: Spot }[], nos: string[], wait: string[] }} res */
function finishScan(t0, res) {
  scanJob = undefined;
  const t = allTowns().get(t0.id);
  if (!t) return;
  /** @type {string[]} */
  const got = [];
  for (const { id, spot } of res.picks) {
    const p = byId.get(id);
    if (!p || t.spots[id]) continue;
    // An operator set a spot meanwhile, in the way: pick again next time.
    const region = regionOf(rectOf(footprint(p, spot)));
    if (Object.entries(t.spots).some(([o, s]) => byId.has(o) && overlaps(regionOf(rectOf(footprint(/** @type {Project} */ (byId.get(o)), s))), region))) continue;
    t.spots[id] = spot;
    // Off the lists, except rt: a second failed check still goes to "no good spot".
    t.scan = t.scan?.filter((x) => x !== id);
    t.nos = t.nos?.filter((x) => x !== id);
    got.push(p.name);
  }
  for (const id of res.nos) {
    const p = byId.get(id);
    if (!p) continue;
    t.scan = t.scan?.filter((x) => x !== id);
    t.nos = [...new Set([...(t.nos ?? []), id])];
    tellOps(`§e[Town Projects] No good spot was found for ${t.n}'s ${p.name}: an operator can set one (Set a project spot in /realm:town).`);
  }
  if (!t.scan?.length) delete t.scan;
  if (!t.nos?.length) delete t.nos;
  if (res.wait.length) scanWaits.set(t.id, (scanWaits.get(t.id) ?? 0) + 1);
  else scanWaits.delete(t.id);
  saveTown(t);
  if (got.length) console.warn(`[town] ${t.n}: spots picked for ${got.join(", ")}`);
  // Finished projects that just got a spot go up when someone is near (the build check), or now.
  for (const { id } of res.picks) {
    const p = byId.get(id);
    if (p && t.spots[id]?.a && progressOf(t, p).done && !progressOf(t, p).built) build(t, p, false);
  }
}

/** Operators: forget "no good spot" and pick spots again for every project up to the town's level that has none. @param {Town} t @param {(msg: string) => void} tell */
function findSpotsAgain(t, tell) {
  delete t.nos;
  delete t.rt;
  queueScan(t, PROJECTS.filter((p) => p.level <= t.lvl && !progressOf(t, p).built).map((p) => p.id));
  scanWaits.delete(t.id);
  saveTown(t);
  if (get("autoSpots") !== true) return tell("§ePick project spots automatically (autoSpots) is Disabled in /realm:config.");
  tell(t.scan?.length ? `§a${t.n} looks for spots again for ${t.scan.map((id) => byId.get(id)?.name ?? id).join(", ")}, a few blocks at a time while a player is in the town.` : `§7Every project of ${t.n} up to its level has a spot.`);
}

// --- Building at an automatic spot ---

/**
 * The geometry of an automatic spot: its footprint, region (footprint plus 2), pad (ground height), the y range the
 * check and the snapshot cover, and its grading plan (changed columns only).
 * @param {Project} p @param {Spot} s
 */
function autoGeometry(p, s) {
  const fpBox = footprint(p, s);
  const fp = rectOf(fpBox);
  const region = regionOf(fp);
  const pad = s.y - 1;
  const plan = s.lv === undefined ? [] : (decodePlan(s.lv, region, pad) ?? []);
  return { fpBox, fp, region, pad, plan, dock: p.build === "dock", y1: Math.min(fpBox.min.y, pad - 5), y2: Math.max(fpBox.max.y, pad + 5) + 1 };
}
/** @typedef {ReturnType<typeof autoGeometry>} Geometry */

/**
 * The build in progress (one at a time) and the queue of others, "town:project".
 * @type {{ key: string, town: string, project: string, phase: "outline" | "check" | "standing" | "claims" | "apply", start: number, until?: number, said?: number, gen?: Generator<any, any, any>, ask?: { id: string, until: number }, claims?: number, out?: { placed: number, skipped: number }, changes?: number } | undefined}
 */
let buildJob;
/** @type {string[]} */
const buildQueue = [];
/** realm:town_test "build_pause" (scenarios): a build stops after this many block changes, as if the server stopped. */
let testPauseAfter = 0;
let testPaused = false;

/** @param {Town} t @param {Project} p @returns {boolean} */
function queueAutoBuild(t, p) {
  if (testPaused) return false;
  const key = `${t.id}:${p.id}`;
  if (buildJob?.key !== key && !buildQueue.includes(key)) buildQueue.push(key);
  ensureJobs();
  return true;
}

/** @param {string} key */
function cancelAutoBuild(key) {
  if (buildJob?.key === key) buildJob = undefined;
  const i = buildQueue.indexOf(key);
  if (i >= 0) buildQueue.splice(i, 1);
}

/** Players within OUTLINE_NEAR of a spot. @param {Town} t @param {Spot} s */
const playersNear = (t, s) => world.getAllPlayers().filter((pl) => pl.dimension.id === t.dim && Math.hypot(pl.location.x - s.x, pl.location.z - s.z) <= OUTLINE_NEAR);

/**
 * Checks the region block by block before anything changes (yields after each read): every block natural, air, wild
 * plants or (for a dock) water; under every column the plan cuts, 2 natural solid blocks; the ground where the plan
 * says. Returns undefined when it may be built, "unloaded", or why not.
 * @param {Dimension} dim @param {Town} t @param {Geometry} geo @returns {Generator<void, string | undefined, void>}
 */
function* checkRegion(dim, t, geo) {
  const { region, plan, dock } = geo;
  const { min, max } = dim.heightRange;
  const y1 = Math.max(min, geo.y1);
  const y2 = Math.min(max - 1, geo.y2);
  if (touches(cellsOf(t), t, region, y1, y2)) return "a player placed blocks there";
  const target = new Map(plan.map((c) => [`${c.x},${c.z}`, c.t]));
  for (let x = region.x1; x <= region.x2; x++)
    for (let z = region.z1; z <= region.z2; z++) {
      /** @type {number | undefined} */
      let ground;
      /** @type {Map<number, string>} */
      const ids = new Map();
      for (let y = y2; y >= y1; y--) {
        const b = blockInfo(dim, x, y, z);
        if (!b) return "unloaded";
        if (!allowedInRegion(b, dock)) return `${itemName(b.id)} at ${x}, ${y}, ${z}`;
        if (ground === undefined && UNDER.has(b.id)) ground = y;
        ids.set(y, b.id);
        yield;
      }
      const to = target.get(`${x},${z}`);
      if (to === undefined) continue;
      if (ground === undefined || Math.abs(to - ground) > 3) return `the ground changed at ${x}, ${z}`;
      if (to < ground) for (const y of [to - 1, to - 2]) if (!UNDER.has(ids.get(y) ?? "")) return `an opening under ${x}, ${to}, ${z}`;
    }
  return undefined;
}

/**
 * Levels the ground the plan says (cuts top down, fills bottom up, only natural blocks and wild plants change), then
 * places the build; yields after each block it reads or changes. Applying it again changes nothing. Returns false when a
 * block isn't loaded (nothing was changed by that step).
 * @param {Dimension} dim @param {Project} p @param {Spot} s @param {Geometry} geo @param {{ placed: number, skipped: number }} out
 * @returns {Generator<void, boolean, void>}
 */
function* applyBuild(dim, p, s, geo, out) {
  const air = perm("minecraft:air");
  const dirt = perm("minecraft:dirt");
  const topId = fillTop(s);
  const top = perm(topId);
  /** @param {number} x @param {number} y @param {number} z */
  const at = (x, y, z) => {
    const b = dim.getBlock({ x, y, z });
    if (!b) throw new Error("unloaded");
    return b;
  };
  try {
    for (const c of geo.plan) {
      // Down to the new top: natural ground and wild plants above it go, top down.
      for (let y = c.t + 5; y > c.t; y--) {
        const b = at(c.x, y, c.z);
        if (NATURAL.has(b.typeId) || WILD.has(b.typeId)) b.setPermutation(air);
        yield;
      }
      // Up to it: the open blocks right under the new top become dirt, bottom up (never into a cave below).
      /** @type {import("@minecraft/server").Block[]} */
      const open = [];
      for (let y = c.t - 1; y >= c.t - 3; y--) {
        const b = at(c.x, y, c.z);
        yield;
        if (!(b.isAir || WILD.has(b.typeId))) break;
        open.unshift(b);
      }
      for (const b of open) {
        b.setPermutation(dirt);
        yield;
      }
      // The new top: the surrounding top block on a fill, grass again on dirt a cut laid bare.
      const b = at(c.x, c.t, c.z);
      if (b.isAir || WILD.has(b.typeId) || (b.typeId === "minecraft:dirt" && topId === "minecraft:grass_block")) b.setPermutation(top);
      yield;
    }
  } catch {
    return false;
  }
  const structure = p.structure ? savedStructure(p.structure) : undefined;
  if (structure) {
    const rotation = [StructureRotation.None, StructureRotation.Rotate90, StructureRotation.Rotate180, StructureRotation.Rotate270][s.f] ?? StructureRotation.None;
    world.structureManager.place(structure, dim, { x: s.x, y: s.y, z: s.z }, { rotation, includeEntities: false });
    out.placed++;
    return true;
  }
  return yield* placeDesignSteps(dim, s, p, true, out);
}

/** Is a player inside the build's volume? @param {Town} t @param {Geometry} geo */
const playersOn = (t, geo) =>
  world.getAllPlayers().filter((pl) => {
    if (pl.dimension.id !== t.dim) return false;
    const { x, y, z } = pl.location;
    return x >= geo.fp.x1 && x < geo.fp.x2 + 1 && z >= geo.fp.z1 && z < geo.fp.z2 + 1 && y >= geo.pad - 1 && y <= geo.fpBox.max.y + 2;
  });

/**
 * The spot failed its check: forget it and look once more; a second failure lists it under "no good spot".
 * @param {Town} t @param {Project} p @param {string} why
 */
function respot(t, p, why) {
  buildJob = undefined;
  const s = t.spots[p.id];
  if (s?.snap && !s.bs) deleteStructure(snapId(t, p));
  delete t.spots[p.id];
  const again = !t.rt?.includes(p.id);
  dropFrom(t, p.id);
  if (again) {
    t.rt = [...(t.rt ?? []), p.id];
    queueScan(t, [p.id]);
    tellOps(`§e[Town Projects] ${t.n}'s ${p.name} can't go up at its spot (${why}): picking another.`);
  } else {
    t.nos = [...(t.nos ?? []), p.id];
    tellOps(`§e[Town Projects] No good spot was found for ${t.n}'s ${p.name} (${why}): an operator can set one (Set a project spot in /realm:town).`);
  }
  saveTown(t);
}

/** A tick of the build in progress. */
function stepBuild() {
  if (!buildJob) {
    const key = buildQueue.shift();
    if (!key) return;
    const [town, project] = key.split(":");
    const t = allTowns().get(town);
    const p = byId.get(project);
    const s = t && p ? t.spots[p.id] : undefined;
    if (!t || !p || !s?.a) return;
    const pr = progressOf(t, p);
    if (!pr.done || pr.built) return;
    const outline = Math.max(0, Math.min(15, Math.floor(Number(get("outlineSeconds")) || 0)));
    buildJob = { key, town, project, phase: s.bs ? "apply" : outline > 0 ? "outline" : "check", start: system.currentTick, until: system.currentTick + outline * 20 };
  }
  const job = buildJob;
  const t = allTowns().get(job.town);
  const p = byId.get(job.project);
  const s = t && p ? t.spots[p.id] : undefined;
  if (!t || !p || !s?.a || progressOf(t, p).built) {
    buildJob = undefined;
    return;
  }
  const dim = world.getDimension(t.dim);
  const geo = autoGeometry(p, s);
  const now = system.currentTick;
  switch (job.phase) {
    case "outline": {
      const near = playersNear(t, s);
      if (now === job.start) {
        const secs = Math.round(((job.until ?? now) - now) / 20);
        for (const pl of near) pl.sendMessage(`§e${t.n}'s ${p.name} goes up here in ${secs} second${secs === 1 ? "" : "s"}.`);
      }
      if ((now - job.start) % 10 === 0) for (const pl of near) drawPreview(pl, { p, s });
      if (now >= (job.until ?? now)) job.phase = "check";
      return;
    }
    case "check": {
      job.gen ??= checkRegion(dim, t, geo);
      for (let i = 0; i < CHECK_TICK; i++) {
        const r = job.gen.next();
        if (!r.done) continue;
        job.gen = undefined;
        if (r.value === "unloaded") buildJob = undefined; // again when a player is near
        else if (r.value) respot(t, p, r.value);
        else job.phase = "standing";
        return;
      }
      return;
    }
    case "standing": {
      const on = playersOn(t, geo);
      if (on.length) {
        if (now - (job.said ?? -1000) >= 200) {
          job.said = now;
          for (const pl of on) pl.sendMessage(`§eStep off the spot: ${t.n}'s ${p.name} goes up here.`);
        }
        return;
      }
      job.phase = "claims";
      const ask = { id: "", until: now + CLAIMS_WAIT };
      ask.id = askClaims(t.dim, geo.region, (claims) => {
        if (buildJob === job && job.ask === ask) job.claims = claims.length;
      });
      job.ask = ask;
      return;
    }
    case "claims": {
      if (job.claims === undefined && now <= (job.ask?.until ?? 0)) return;
      if (job.ask) claimAsks.delete(job.ask.id);
      if ((job.claims ?? 0) > 0) return respot(t, p, "a land claim");
      // Saved first: the region and its depth, so Remove spot puts the terrain back; then bs, so a restart resumes.
      if (!s.snap && !s.old) {
        const box = clampBox({ min: { x: geo.region.x1, y: geo.y1, z: geo.region.z1 }, max: { x: geo.region.x2, y: geo.y2, z: geo.region.z2 } }, dim);
        if (!snapshot(t, p, s, dim, box)) {
          buildJob = undefined;
          return;
        }
      }
      s.bs = 1;
      saveTown(t);
      job.phase = "apply";
      return;
    }
    case "apply": {
      job.out ??= { placed: 0, skipped: 0 };
      job.gen ??= applyBuild(dim, p, s, geo, job.out);
      try {
        for (let i = 0; i < APPLY_TICK; i++) {
          if (testPauseAfter > 0 && (job.changes = (job.changes ?? 0) + 1) > testPauseAfter) {
            testPaused = true;
            buildJob = undefined;
            console.warn(`[town_test] build of ${job.key} paused after ${testPauseAfter} changes`);
            return;
          }
          const r = job.gen.next();
          if (!r.done) continue;
          buildJob = undefined;
          if (!r.value) return; // unloaded: resumes from bs when a player is near
          const pr = progressOf(t, p);
          pr.built = 1;
          saveProgress(t, p, pr);
          delete s.bs;
          dropFrom(t, p.id);
          saveTown(t);
          announceBuilt(t, p, s, dim, job.out.placed, job.out.skipped);
          return;
        }
      } catch (e) {
        console.warn(`[town] build ${job.key}: ${e}`); // a chunk unloaded mid-way: it resumes (bs: 1)
        buildJob = undefined;
      }
      return;
    }
  }
}

/** Runs the scan and the build a tick at a time while there is work; idle, nothing runs. */
let jobTicker = /** @type {number | undefined} */ (undefined);
function ensureJobs() {
  if (jobTicker !== undefined) return;
  jobTicker = system.runInterval(() => {
    try {
      stepScan();
    } catch (e) {
      console.warn(`[town] scan: ${e}`);
      scanJob = undefined;
    }
    try {
      stepBuild();
    } catch (e) {
      console.warn(`[town] build: ${e}`);
      buildJob = undefined;
    }
    if (!scanJob && !buildJob && !buildQueue.length && jobTicker !== undefined) {
      system.clearRun(jobTicker);
      jobTicker = undefined;
    }
  }, 1);
}

/**
 * On the build check (every 100 ticks): towns from before automatic spots queue their projects once (the current
 * level's and finished ones without a spot), and a town with projects to place is scanned while a player is in it.
 * @param {Player[]} players
 */
function autoTick(players) {
  if (!towns) return;
  for (const t of allTowns().values()) {
    if (t.as === 1) continue;
    queueScan(t, [...projectsAt(t.lvl), ...PROJECTS.filter((p) => progressOf(t, p).done && !progressOf(t, p).built)].map((p) => p.id));
    t.as = 1;
    saveTown(t);
  }
  if (get("autoSpots") !== true || scanJob) return;
  const t = [...allTowns().values()].find((x) => x.scan?.length && playerIn(players, x));
  if (t) startScan(t);
}

onScriptEvent(["realm:place_ready", "realm:claims_check_result"], ({ id, message }) => {
  if (id !== "realm:place_ready" && id !== "realm:claims_check_result") return;
  /** @type {any} */
  let m;
  try {
    m = JSON.parse(message);
  } catch {
    return;
  }
  if (!m || typeof m !== "object") return;
  if (id === "realm:claims_check_result") {
    const fn = typeof m.id === "string" ? claimAsks.get(m.id) : undefined;
    if (!fn) return;
    claimAsks.delete(m.id);
    const claims = Array.isArray(m.claims) ? m.claims.filter((/** @type {any} */ c) => c && [c.x1, c.z1, c.x2, c.z2].every(Number.isFinite)).slice(0, 10) : [];
    fn(claims.map((/** @type {any} */ c) => ({ x1: Math.min(c.x1, c.x2), z1: Math.min(c.z1, c.z2), x2: Math.max(c.x1, c.x2), z2: Math.max(c.z1, c.z2) })));
    return;
  }
  if (typeof m.name !== "string") return;
  if (m.state === "removed") storyPlaces.delete(m.name);
  else if (typeof m.dim === "string" && Number.isFinite(m.x) && Number.isFinite(m.z) && (storyPlaces.size < 200 || storyPlaces.has(m.name))) storyPlaces.set(m.name, { dim: m.dim, x: m.x, z: m.z });
});

// ---------------------------------------------------------------------------
// Placed blocks (placed.js): natural-kind blocks players place in a town look like the ground, so the town keeps
// their 4 x 4 x 4 cells in "town:pl:<town>:0" and ":1" (saved at most every 10 s) and never levels there. Other packs
// that place natural blocks by script report boxes with realm:blocks_placed { dim, box: [x1, y1, z1, x2, y2, z2] }
// (or x1..z2 as fields).
// ---------------------------------------------------------------------------

const PLACED_PREFIX = "town:pl:";
const PLACED_SAVE_TICKS = 200;
/** Cells by town id, read when first needed. @type {Map<string, import("./placed.js").Cells>} */
const placedCells = new Map();

/** @param {Town} t @returns {import("./placed.js").Cells | undefined} */
function cellsOf(t) {
  let c = placedCells.get(t.id);
  if (c) return c;
  try {
    c = loadCells([0, 1].map((k) => world.getDynamicProperty(`${PLACED_PREFIX}${t.id}:${k}`)), t.plf === 1);
  } catch {
    return undefined; // not loaded yet
  }
  placedCells.set(t.id, c);
  return c;
}

/** @param {Town} t @param {number[]} cells @param {boolean} [tooMany] a box too big to keep: the town is full */
function markPlaced(t, cells, tooMany = false) {
  const c = cellsOf(t);
  if (!c) return;
  for (const n of cells) addCell(c, n);
  if (tooMany) c.full = true;
  if (c.full && t.plf !== 1) {
    t.plf = 1;
    saveTown(t);
    console.warn(`[town] ${t.n}: more than ${MAX_CELLS} places where players put natural blocks; it never levels ground from now on`);
  }
}

/** "overworld" and "minecraft:overworld" alike. @param {unknown} d */
const dimId = (d) => (typeof d === "string" ? (d.startsWith("minecraft:") ? d : `minecraft:${d}`) : "");

world.afterEvents.playerPlaceBlock.subscribe(({ block }) => {
  try {
    if (!NATURAL.has(block.typeId)) return; // anything else is man-made anyway
    const { x, y, z } = block.location;
    const dim = block.dimension.id;
    const r = get("townRadius");
    for (const t of allTowns().values()) if (t.dim === dim && Math.hypot(x - t.x, z - t.z) <= r) markPlaced(t, [cellOf(t, x, y, z)]);
  } catch (e) {
    console.warn(`[town] placed: ${e}`);
  }
});

onScriptEvent("realm:blocks_placed", ({ id, message }) => {
  if (id !== "realm:blocks_placed") return;
  try {
    const m = JSON.parse(message);
    if (!m || typeof m !== "object") return;
    const b = Array.isArray(m.box) ? m.box.map(Number) : [m.x1, m.y1, m.z1, m.x2, m.y2, m.z2].map(Number);
    if (b.length !== 6 || !b.every(Number.isFinite)) return;
    const dim = dimId(m.dim);
    const r = get("townRadius");
    for (const t of allTowns().values()) {
      if (t.dim !== dim) continue;
      // The part of the box inside the town's square.
      const x1 = Math.max(Math.min(b[0], b[3]), t.x - r);
      const x2 = Math.min(Math.max(b[0], b[3]), t.x + r);
      const z1 = Math.max(Math.min(b[2], b[5]), t.z - r);
      const z2 = Math.min(Math.max(b[2], b[5]), t.z + r);
      if (x1 > x2 || z1 > z2) continue;
      const cells = boxCells(t, [x1, b[1], z1, x2, b[4], z2]);
      markPlaced(t, cells ?? [], !cells);
    }
  } catch {
    // not ours
  }
});

system.runInterval(() => {
  for (const [id, c] of placedCells) {
    if (!c.dirty) continue;
    if (!allTowns().has(id)) {
      placedCells.delete(id);
      continue;
    }
    try {
      const parts = saveParts(c);
      parts.forEach((v, k) => world.setDynamicProperty(`${PLACED_PREFIX}${id}:${k}`, v || undefined));
      c.dirty = false;
    } catch (e) {
      console.warn(`[town] placed cells of ${id}: ${e}`);
    }
  }
}, PLACED_SAVE_TICKS);

// ---------------------------------------------------------------------------
// Scenario tests (BDS harness): the operator actions without forms. Only from the server console or an operator.
//   /scriptevent realm:town_test {"action":"add|spot|finish|remove|rebuild|protect|zones|dump|mayor_move|mayor_rename|remove_town|v1|scan|build_pause", "player"?, "town"?, "project"?, "name"?, "spot"?, "on"?, "after"?}
// ---------------------------------------------------------------------------

onScriptEvent(
  "realm:town_test",
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
      if (m.action === "dump")
        return tell(JSON.stringify({ town: t, progress: PROJECTS.map((x) => [x.id, progressOf(t, x)]), placed: places ? [...places.keys()] : null, scanning: scanJob?.town ?? null, building: buildJob ? [buildJob.key, buildJob.phase] : null, cells: cellsOf(t)?.list.length ?? 0, regions: Object.fromEntries(Object.entries(t.spots).flatMap(([id, sp]) => (byId.has(id) ? [[id, Object.values(regionOf(rectOf(footprint(/** @type {Project} */ (byId.get(id)), sp))))]] : []))) }));
      if (m.action === "scan") {
        findSpotsAgain(t, tell);
        if (!scanJob && get("autoSpots") === true && t.scan?.length) startScan(t);
        return;
      }
      if (m.action === "build_pause") {
        testPauseAfter = Math.max(0, Math.floor(Number(m.after) || 0));
        return tell(`builds pause after ${testPauseAfter} changes until the next load`);
      }
      if (m.action === "v1") {
        // Makes every town look saved before mayors (and forgets their own mayors), until the next load.
        migrationHeld = true;
        for (const x of [...allTowns().values()]) {
          if (isTownMayorId(x.m)) send("realm:npc_mayor", { op: "remove", id: x.m });
          delete x.v;
          delete x.m;
          delete x.mn;
          saveTown(x);
        }
        return tell("towns are v1 until the next load");
      }
      if (m.action === "remove_town") {
        deleteTown(t);
        return tell(`town ${t.id} removed`);
      }
      if (m.action === "mayor_rename") return mayorRename(t, cleanName(m.name) || "Mayor Test", tell);
      if (m.action === "mayor_move") {
        const at = m.spot && typeof m.spot === "object" ? { x: Number(m.spot.x), y: Number(m.spot.y), z: Number(m.spot.z) } : player?.location;
        if (!at || ![at.x, at.y, at.z].every(Number.isFinite)) return tell("no spot");
        if (!isTownMayorId(t.m)) return tell("no town mayor");
        mayorSet(t, at, Number(m.spot?.yaw) || 0, tell);
        return tell(`mayor ${t.m} asked to move to ${Math.floor(at.x)}, ${Math.floor(at.y)}, ${Math.floor(at.z)}`);
      }
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
        // "donors": that many offline contributors (5 items each, as on a big server); "give": the player's own items.
        const donors = Math.max(0, Math.min(500, Math.floor(Number(m.donors) || 0)));
        for (let i = 0; i < donors; i++) pr.c[`-${4294970000 - i}`] = [`Away${i}`, 5];
        if (player && Number(m.give) > 0) pr.c[player.id] = [player.name, Math.floor(Number(m.give))];
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
);

// ---------------------------------------------------------------------------
// Mayors (Townsfolk, npc_bp; mayors.js): a mayor per town. town_bp asks with realm:npc_mayor { op: set | rename |
// remove } (answered with realm:npc_mayor_ack) and learns who stands where from realm:npc_places.
// ---------------------------------------------------------------------------

const MAYOR_RESEND_TICKS = 600; // a missing mayor is asked for again at most every 30 s per town
/** Placed townsfolk (realm:npc_places), id -> { dim, x, z }; undefined until Townsfolk answers. @type {Map<string, import("./mayors.js").Place> | undefined} */
let places;
const placesParts = createPlacesAssembler();
/** Town id -> tick of the last set request. @type {Map<string, number>} */
const lastSet = new Map();
/** Mayor id -> who to tell if Townsfolk refuses an operator's request. @type {Map<string, { tell: (msg: string) => void, until: number }>} */
const pendingAcks = new Map();

/** Is this townsfolk placed (as far as Townsfolk said)? @param {string | undefined} id */
const mayorPlaced = (id) => !!id && !!places?.has(id);

/** "Mayor Alda", "Mayor Bram" or "the town's mayor". @param {Town} t */
const mayorName = (t) => (t.m === BRAM ? "Mayor Bram" : isTownMayorId(t.m) && t.mn ? t.mn : "the town's mayor");

/**
 * Asks Townsfolk to put the town's own mayor at `at` (creates it, or moves it there).
 * @param {Town} t @param {Vector3} at @param {number} yaw @param {(msg: string) => void} [tell] told if it is refused
 */
function mayorSet(t, at, yaw, tell) {
  if (!isTownMayorId(t.m)) return;
  lastSet.set(t.id, system.currentTick);
  if (tell) pendingAcks.set(t.m, { tell, until: system.currentTick + 100 });
  const r = (/** @type {number} */ n) => Math.round(n * 100) / 100;
  send("realm:npc_mayor", { op: "set", id: t.m, name: t.mn ?? mayorName(t), town: t.id, tn: t.n, dim: t.dim, x: r(at.x), y: r(at.y), z: r(at.z), yaw: Math.round(yaw) });
}

/**
 * Every 100 ticks: a town whose own mayor Townsfolk doesn't have placed is asked for again when a player is in the
 * town (at most every 30 s per town), at the town's center.
 * @param {Player[]} players
 */
function mayorCheck(players) {
  if (get("townMayors") !== true || !places) return;
  const now = system.currentTick;
  const r = get("townRadius");
  for (const t of allTowns().values()) {
    if (!isTownMayorId(t.m) || places.has(t.m)) continue;
    if (now - (lastSet.get(t.id) ?? -MAYOR_RESEND_TICKS) < MAYOR_RESEND_TICKS) continue;
    if (!players.some((pl) => pl.dimension.id === t.dim && Math.hypot(pl.location.x - t.x, pl.location.z - t.z) <= r)) continue;
    mayorSet(t, { x: t.x, y: t.y, z: t.z }, 0);
  }
}

/** realm:town_test "v1" (scenarios): no migration until the next load. */
let migrationHeld = false;

/**
 * Towns saved before mayors (no `v`) get theirs once Townsfolk has said where everyone is (realm:npc_places, asked
 * for 5 s after the world loads): Mayor Bram keeps his town (the one nearest his post within townRadius; else, or
 * with Bram not placed, the oldest), every other town gets its own mayor, made when a player next comes near. With
 * no answer (Townsfolk not installed) nothing is written. Only `v`, `m` and `mn` change: spots, progress, owed
 * rewards and snapshots stay as they are.
 */
function mayorMigrate() {
  if (migrationHeld || get("townMayors") !== true || !places || !towns) return;
  const list = [...allTowns().values()];
  if (!list.some((t) => t.v !== 2)) return;
  const plan = planMigration(list, places.get(BRAM), get("townRadius"), CONFIG.mayorNames);
  for (const c of plan) {
    const t = allTowns().get(c.id);
    if (!t) continue;
    t.v = 2;
    t.m = c.m;
    if (c.mn) t.mn = c.mn;
    else delete t.mn;
    saveTown(t);
    console.warn(`[town] ${t.n}: its mayor is ${c.m === BRAM ? "Mayor Bram" : `${c.mn} (${c.m}), made when a player next comes near`}`);
  }
}

/** Every mayor id the towns have, for Townsfolk to drop mayors of towns removed while it wasn't listening. */
function sendMayorList() {
  if (!towns) return; // the towns couldn't be read: no list rather than an empty one
  const ids = [...allTowns().values()].flatMap((t) => (isTownMayorId(t.m) ? [t.m] : []));
  for (const m of mayorParts(ids)) send("realm:npc_mayors", m);
}

/** Operators: the town's mayor, moved where they stand or renamed. @param {Player} player @param {string} townId */
async function mayorMenu(player, townId) {
  const t = allTowns().get(townId);
  if (!t) return;
  const at = t.m ? places?.get(t.m) : undefined;
  const where = at ? `${mayorName(t)} lives at ${Math.floor(at.x)}, ${Math.floor(at.z)}.` : places ? `${mayorName(t)} isn't placed yet.` : "Townsfolk hasn't said where the townsfolk are (is it installed?).";
  /** @type {{ text: string, run: () => unknown }[]} */
  const actions = [];
  /** @type {string[]} */
  const lines = [];
  if (t.m === BRAM) {
    lines.push(`Mayor Bram (Townsfolk) is ${t.n}'s mayor, the realm's main mayor: he offers its projects wherever he lives.`, where, "His name belongs to the stories, so he can only be moved.");
    actions.push({
      text: "Move Bram here\n§8Where you stand, facing your way",
      run: () => {
        if (!player.isValid || !stillOp(player)) return;
        send("realm:npc_summon", { id: BRAM, player: player.id });
      },
    });
  } else if (isTownMayorId(t.m)) {
    lines.push(`${mayorName(t)} is ${t.n}'s mayor (Townsfolk): they offer its projects wherever the player stands.`, where);
    if (!at && !mayorPlaced(t.m)) lines.push("§7They arrive at the town's center when a player is in the town, or move them here now.");
    actions.push({ text: "Move here\n§8Where you stand, facing your way", run: () => mayorMoveHere(player, t.id) });
    actions.push({ text: "Rename\n§8Up to 24 letters", run: () => mayorRenameForm(player, t.id) });
  } else {
    lines.push(`${t.n} has no mayor yet.`, get("townMayors") === true ? "§7Its mayor is picked once Townsfolk answers (every town gets one; the first one Mayor Bram)." : "§7Town mayors (townMayors) is Disabled in /realm:config: NPCs with the mayor role offer the nearest town.");
  }
  actions.push({ text: "Back", run: () => mainMenu(player) });
  await menu(player, `§l${t.n}: mayor`, lines.join("\n\n"), actions);
}

/** @param {Player} player @param {string} townId */
function mayorMoveHere(player, townId) {
  const t = allTowns().get(townId);
  if (!t || !player.isValid || !stillOp(player) || !isTownMayorId(t.m)) return;
  if (player.dimension.id !== t.dim) return player.sendMessage(`§c${t.n} is in another dimension.`);
  if (Math.hypot(player.location.x - t.x, player.location.z - t.z) > get("townRadius")) return player.sendMessage(`§cStand inside ${t.n} (within ${get("townRadius")} blocks of its center).`);
  mayorSet(t, player.location, player.getRotation().y, (m) => player.sendMessage(m));
  player.sendMessage(`§a${mayorName(t)} now lives where you stand, facing your way.`);
}

/** @param {Player} player @param {string} townId */
async function mayorRenameForm(player, townId) {
  const t0 = allTowns().get(townId);
  if (!t0) return;
  const res = await show(player, new ModalFormData().title(`§l${t0.n}: mayor`).textField("Name (up to 24 letters)", "Mayor Alda", { defaultValue: t0.mn ?? "" }).submitButton("Rename"));
  if (!res || res.canceled || !res.formValues || !player.isValid || !stillOp(player)) return;
  const t = allTowns().get(townId);
  if (!t || !isTownMayorId(t.m)) return player.sendMessage("§cThat town was removed.");
  const name = cleanName(res.formValues.find((v) => typeof v === "string"));
  if (!name) return player.sendMessage("§cGive the mayor a name (letters, digits and spaces).");
  mayorRename(t, name, (m) => player.sendMessage(m));
}

/** @param {Town} t @param {string} name @param {(msg: string) => void} tell */
function mayorRename(t, name, tell) {
  if (!isTownMayorId(t.m)) return tell("§cOnly a town's own mayor can be renamed (Mayor Bram's name is the story's).");
  t.mn = name;
  saveTown(t);
  // A mayor that isn't placed yet gets the new name when it arrives (set carries it).
  if (mayorPlaced(t.m)) {
    pendingAcks.set(t.m, { tell, until: system.currentTick + 100 });
    send("realm:npc_mayor", { op: "rename", id: t.m, name, tn: t.n });
  }
  tell(`§a${t.n}'s mayor is now ${name}.`);
}

onScriptEvent(
  ["realm:npc_places", "realm:npc_mayor_ack"],
  ({ id, message }) => {
    if (id !== "realm:npc_places" && id !== "realm:npc_mayor_ack") return;
    /** @type {any} */
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (id === "realm:npc_places") {
      const got = placesParts.add(msg);
      if (got) places = got;
      return;
    }
    if (!msg || typeof msg.id !== "string") return;
    const wait = pendingAcks.get(msg.id);
    if (wait) pendingAcks.delete(msg.id);
    if (msg.ok === true) return;
    const why = typeof msg.error === "string" ? msg.error.slice(0, 120) : "refused";
    console.warn(`[town] Townsfolk didn't ${String(msg.op).slice(0, 8)} ${msg.id}: ${why}`);
    if (wait && wait.until >= system.currentTick) wait.tell(`§cTownsfolk couldn't do that: ${why}.`);
  },
);

// ---------------------------------------------------------------------------
// Townsfolk (npc_bp): a town's own mayor offers its projects anywhere; any mayor offers the town the player stands
// in when that town's own mayor isn't placed
// ---------------------------------------------------------------------------

onScriptEvent(
  ["realm:npc_talk", "realm:npc_choose"],
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
        const roles = Array.isArray(msg.roles) ? msg.roles.filter((/** @type {unknown} */ r) => typeof r === "string") : [];
        const npc = typeof msg.npc === "string" ? msg.npc : "";
        const list = [...allTowns().values()];
        const ids = offerTowns({ towns: list, npc, roles, role: CONFIG.npcRole, here: nearestTown(player, get("townRadius"))?.id, placed: mayorPlaced, enabled: get("townMayors") === true });
        ids.forEach((townId, i) => {
          const t = allTowns().get(townId);
          if (t) send("realm:npc_offer", { req: msg.req, pack: "town_bp", key: `town:${t.id}`, label: `Town projects (${t.n})`, order: 30 + i });
        });
      } else if (msg.pack === "town_bp" && typeof msg.key === "string" && msg.key.startsWith("town:")) {
        const townId = msg.key.slice(5);
        system.run(() => townMenu(player, townId, true).catch((e) => console.warn(`[town] ${e}`)));
      }
    } catch (e) {
      console.warn(`[town] npc: ${e}`);
    }
  },
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
          if (!pr.done || pr.built || t.spots[p.id] || (get("autoSpots") === true && t.scan?.includes(p.id))) continue;
          player.sendMessage(`§e[Town Projects] ${t.n}'s ${p.name} is finished but has no spot${t.nos?.includes(p.id) ? " (no good spot was found)" : ""}: stand there and run /realm:town_spot ${p.id}`);
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
onScriptEvent(
  "realm:help_ping",
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "town_bp");
  },
);
