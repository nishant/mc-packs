import "./diag.js";
import { createGossip } from "./gossip.js";
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
import { BUILDS, FORWARD, buildCells, design, designFootprint, isOptionalPlace, placeStates, structureLocal, toWorld } from "./designs.js";
import { BRAM, cleanName, createPlacesAssembler, isTownMayorId, mayorParts, newTownMayor, offerTowns, planMigration, readMayor } from "./mayors.js";
import { MAX_CELLS, addCell, boxCells, cellOf, loadCells, saveParts, touches } from "./placed.js";
import { PEN_ID, addLog, cleanText, houseCount, isWorkId, logLine, makePen, makeWorks, nextLevelText, readLog, townJson } from "./growth.js";
import { CLEARABLE, POSTS_MAX, boardTexts, packCells, penMissing, penSurplus, planPath, planPosts, postCount, readWorks, unpackCells } from "./life.js";
import { NATURAL, UNDER, UNKNOWN, WILD, allowedInRegion, decodePlan, isLeaves, overlaps, readColumn, rectOf, regionOf, scanTown } from "./sites.js";
import { HOME_LEASH, TICKS_PER_MINUTE, addNew, allocate, homeAt, homesFor, livingOf, lookEvent, lookFor, pickName, plan, readResidents, reconcile, ridOf, ridTag, slotCount } from "./residents.js";
import { spawnFresh } from "./spawn.js";

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
 * on top ("grass_block"), and bs: 1 while its build has started but isn't finished (it resumes after a restart); pt: 1
 * once the town's path from it was laid (townLife; life.js), or found no grass to lay.
 * @typedef {{ x: number, y: number, z: number, f: number, snap?: number, b?: number[], old?: number, a?: number, lv?: string, lt?: string, bs?: number, pt?: number }} Spot
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
 * log: the town's story so far (growth.js), [Realm day or 0, what happened], at most 12, the oldest dropped first.
 * lp: the level the town's lantern posts were last placed for (townLife; missing: 1).
 * @typedef {{ id: string, n: string, dim: string, x: number, y: number, z: number, lvl: number, spots: Record<string, Spot>, by: string, at: number, prot?: number, v?: number, m?: string, mn?: string, plf?: number, scan?: string[], nos?: string[], rt?: string[], as?: number, log?: import("./growth.js").LogEntry[], lp?: number }} Town
 */
/** @typedef {{ min: Vector3, max: Vector3 }} Box inclusive block corners */
/** an: 1 once the garden pen's animals were spawned; k: the types of those that died (never spawned again). @typedef {{ got: Record<string, number>, c: Record<string, [string, number]>, done: number, built: number, an?: number, k?: string[] }} Progress */
/** @typedef {{ cr: number, q: [string, string, string][] }} Owed crowns, and [quest id, label, guild] per finished project */

/** Projects from config.js that make sense; the rest are skipped with a warning. */
const PROJECTS = CONFIG.projects
  .filter((p) => {
    const okay = /^[a-z0-9_]{1,32}$/.test(p.id) && !isWorkId(p.id) && p.id !== PEN_ID && p.level >= 1 && p.level < MAX_LEVEL && Object.keys(p.needs ?? {}).length > 0 && BUILDS.includes(p.build);
    if (!okay) console.warn(`[town] project "${p.id}" in config.js is skipped: check its id (house_1 to house_10 and pen are the towns' own works), level (1 to 4), needs and build`);
    return okay;
  })
  .map((p) => ({ ...p, why: cleanText(p.why) || undefined })); // what the mayor says it's for: plain ASCII, 60 characters
/**
 * Town works (D8): the houses a town builds by itself from level 2 (house_1 .. house_10, growth.js), at automatic
 * spots, with no deliveries, rewards or quests and not counted for leveling. Their progress record is { done, built }.
 * ALL (projects and works) is what spots, builds, removing and deleting loop over; leveling, deliveries, rewards, the
 * board and the contributors stay on PROJECTS.
 */
const WORKS = /** @type {Project[]} */ (makeWorks(CONFIG.houseJobs));
/** The garden pen (townLife): a town work too, next to the garden once it is built. */
const PEN = /** @type {Project} */ (/** @type {unknown} */ (makePen()));
const ALL = [...PROJECTS, ...WORKS, PEN];
const byId = new Map(ALL.map((p) => [p.id, p]));
/** A town work (a house or the pen): no deliveries, rewards or quests. @param {Project} p */
const isWork = (p) => isWorkId(p.id) || p.id === PEN_ID;
/** @param {Project} p */
const isHouse = (p) => isWorkId(p.id);
/** The project whose build is the garden (the pen goes next to it). */
const GARDEN = PROJECTS.find((p) => p.build === "garden");

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

/** Project id lists of a saved town, cleaned: known projects only, each once; empty lists dropped; its log cleaned. @param {any} t */
function readSites(t) {
  const log = readLog(t.log);
  if (log) t.log = log;
  else delete t.log;
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
  world.setDynamicProperty(TOWN_PREFIX + t.id, townJson(t, PROP_LIMIT)); // the oldest story entries go first if it ever grows too big
}

/** The Realm day (realm:calendar, from Townsfolk or Realm Calendar), for the town's story; undefined until one says. @type {number | undefined} */
let realmDay;

/** Adds a line to the town's story (saved with the town by the caller). @param {Town} t @param {string} text */
function storyAdd(t, text) {
  t.log = addLog(t.log, realmDay, text);
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
  if (raw?.an) pr.an = 1;
  if (Array.isArray(raw?.k)) pr.k = raw.k.filter((/** @type {unknown} */ x) => x === "minecraft:sheep" || x === "minecraft:chicken").slice(0, 4);
  progCache.set(key, pr);
  return pr;
}

/** @param {Town} t @param {Project} p @param {Progress} pr */
function saveProgress(t, p, pr) {
  const key = `${PROG_PREFIX}${t.id}:${p.id}`;
  let json = JSON.stringify(isWork(p) ? { done: pr.done, built: pr.built, ...(pr.an ? { an: 1 } : {}), ...(pr.k?.length ? { k: pr.k } : {}) } : pr);
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
const LETTERS_MAX = 10;

/** Townsfolk gossip through the shared town-news gate (gossip.js): one piece per in-game hour, each key once. */
const gossip = createGossip((msg) => send("realm:gossip", msg), () => system.currentTick);

/** @param {Town} t @param {Project} p @param {Progress} pr */
function finishProject(t, p, pr) {
  const ranked = ranking(pr);
  const top = ranked
    .slice(0, 3)
    .map(([, name, n]) => `${name} ${fmt(n)}`)
    .join(", ");
  const line = `§6${t.n} finished its ${p.name}!${top ? ` Top contributors: ${top}.` : ""} Thank you, everyone!`;
  storyAdd(t, `The ${p.name} was finished${ranked[0] ? `, thanks to ${ranked[0][1]}` : ""}`);
  saveTown(t);
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
  queueWorks(t);
  censusAt.delete(t.id);
  storyAdd(t, `It became a ${levelName(t.lvl)}`);
  saveTown(t);
  lifeNews(t, `lvl${t.lvl}`);
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
/** A project's (or town work's) built-in design: a house with its own job-site block. @param {Project} p */
const designOf = (p) => design(p.build, /** @type {any} */ (p).job);

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
  if (isHouse(p) && get("houses") !== true && !s?.bs) return false; // houses Disabled: none goes up (one half built finishes)
  if (p.id === PEN_ID && get("townLife") !== true && !s?.bs) return false; // the same for the pen with townLife Disabled
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
  clearMobs(dim, box); // nothing walled in (O80)
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
  censusAt.delete(t.id); // a new well or house: its families move in at the next check
  const where = `${s.x}, ${s.y}, ${s.z}`;
  if (isWork(p)) {
    // A house or the pen: news for the town (players in it, and its story), not the whole realm; no fireworks.
    const pen = p.id === PEN_ID;
    const msg = pen ? `§a${t.n} has a garden pen at ${where}.` : `§a${t.n} has a new house (${p.name}) at ${where}.`;
    for (const pl of world.getAllPlayers()) if (isOp(pl) || (pl.dimension.id === t.dim && Math.hypot(pl.location.x - t.x, pl.location.z - t.z) <= get("townRadius"))) pl.sendMessage(msg);
    if (pen) penAnimals(t, s, dim);
    else {
      storyAdd(t, `A new house went up (${p.name})`);
      lifeNews(t, p.id);
    }
    saveTown(t);
    if (skipped) tellOps(`§7[Town Projects] ${skipped} block${skipped === 1 ? " was" : "s were"} left out of ${t.n}'s ${p.name} because something else was in the way.`);
    return;
  }
  const msg = `§a${t.n}'s new ${p.name} is built at ${where}.`;
  if (get("announce") === true) world.sendMessage(msg);
  else tellOps(msg);
  if (skipped) tellOps(`§7[Town Projects] ${skipped} block${skipped === 1 ? " was" : "s were"} left out of the ${p.name} because something else was in the way. Builds only replace air, plants, grass and dirt (and water for a dock).`);
  if (placed && get("fireworks") === true) fireworks(dim, toWorld(s, 0, 1, 2));
  if (p.build === "notice_board") system.runTimeout(() => refreshBoard(t), 2);
  if (p.build === "garden" && queueWorks(t)) saveTown(t); // its pen is due now (townLife)
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
      restoreGround(dim, st, box, cellsOfBuild(p, s));
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
 * What the build put in each block it may have changed ("x,y,z" -> block ids, designs.js buildCells): the leveling plan
 * at an automatic spot, then its saved structure's blocks (turned with the spot) or its built-in design's.
 * @param {Project} p @param {Spot} s @returns {Map<string, Set<string>>}
 */
function cellsOfBuild(p, s) {
  const plan = s.a && s.lv !== undefined ? autoGeometry(p, s).plan : [];
  const st = p.structure ? savedStructure(p.structure) : undefined;
  if (!st) return buildCells(s, designOf(p), plan, fillTop(s));
  const cells = buildCells(s, [], plan, fillTop(s));
  const size = st.size;
  if (size.x * size.y * size.z > 200000) throw new Error("the structure is too big to clear");
  const box = footprint(p, s);
  for (let x = box.min.x; x <= box.max.x; x++)
    for (let z = box.min.z; z <= box.max.z; z++) {
      const at = structureLocal(s, size, x, z);
      if (!at) continue;
      for (let y = 0; y < size.y; y++) {
        const id = st.getBlockPermutation({ x: at.x, y, z: at.z })?.type.id;
        if (!id || id === "minecraft:structure_void") continue;
        const k = `${x},${s.y + y},${z}`;
        const set = cells.get(k) ?? new Set();
        set.add(id);
        cells.set(k, set);
      }
    }
  return cells;
}

/**
 * Puts the saved ground back, block by block, only in the blocks the build changed (`cells`, cellsOfBuild) and only
 * where the block now is still what the build put there, or air (its block was taken): every other block is a player's
 * and stays as it is, even of a kind the build is made of (F37: never touch placed blocks). A block that still matches
 * the snapshot stays too (so a chest that was there all along keeps what's in it now).
 * @param {Dimension} dim @param {import("@minecraft/server").Structure} st @param {Box} box @param {Map<string, Set<string>>} cells
 */
function restoreGround(dim, st, box, cells) {
  const air = perm("minecraft:air");
  // Twice: first what becomes air, top down (so nothing left above falls), then the rest, bottom up (so sand and
  // gravel always land on what holds them).
  for (const pass of [0, 1])
    for (let k = 0; k <= box.max.y - box.min.y; k++) {
      const y = pass === 0 ? box.max.y - k : box.min.y + k;
      for (let x = box.min.x; x <= box.max.x; x++)
        for (let z = box.min.z; z <= box.max.z; z++) {
          const ours = cells.get(`${x},${y},${z}`);
          if (!ours) continue; // the build never changed it
          const want = st.getBlockPermutation({ x: x - box.min.x, y: y - box.min.y, z: z - box.min.z }) ?? air;
          if ((want.type.id === "minecraft:air") !== (pass === 0)) continue;
          if (want.type.id === "minecraft:structure_void") continue;
          const b = dim.getBlock({ x, y, z });
          if (!b) continue;
          if (b.permutation.matches(want.type.id, want.getAllStates())) continue;
          if (!b.isAir && !ours.has(b.typeId)) continue; // someone's own block
          spill(dim, b);
          b.setPermutation(want);
        }
    }
}

/**
 * Before a build's own block is taken away (Remove spot, Relocate, Rebuild): a container with something in it (a
 * stall's or a house's barrel, a smoker, a brewing stand) or a lectern (it may hold a book) is broken the way a player
 * breaks it, so what it holds drops on the ground instead of being lost.
 * @param {Dimension} dim @param {import("@minecraft/server").Block} b
 */
function spill(dim, b) {
  try {
    const c = /** @type {import("@minecraft/server").BlockInventoryComponent | undefined} */ (b.getComponent("minecraft:inventory"))?.container;
    if (!(c && c.emptySlotsCount < c.size) && b.typeId !== "minecraft:lectern") return;
    const { x, y, z } = b.location;
    dim.runCommand(`setblock ${x} ${y} ${z} air destroy`);
  } catch {
    // no inventory (most blocks), or not loaded
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
    // A saved structure: clear the blocks in its box that are still the structure's own block there.
    const cells = cellsOfBuild(p, s);
    for (let x = box.min.x; x <= box.max.x; x++)
      for (let y = box.min.y; y <= box.max.y; y++)
        for (let z = box.min.z; z <= box.max.z; z++) {
          const b = dim.getBlock({ x, y, z });
          if (!b || b.isAir || !cells.get(`${x},${y},${z}`)?.has(b.typeId)) continue;
          spill(dim, b);
          b.setPermutation(air);
        }
    return;
  }
  const grass = perm("minecraft:grass_block");
  const water = perm("minecraft:water");
  // Top down, so nothing above is left hanging while it's cleared.
  const places = designOf(p).sort((a, b) => b.y - a.y);
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
    spill(dim, b);
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
 * `mine(x, y, z)`: a block a player may have placed (applyBuild's), never replaced.
 * @param {Dimension} dim @param {Spot} s @param {Project} p @param {boolean} auto @param {{ placed: number, skipped: number }} out
 * @param {(x: number, y: number, z: number) => boolean} [mine]
 * @returns {Generator<void, boolean, void>}
 */
function* placeDesignSteps(dim, s, p, auto, out, mine = () => false) {
  const fwd = FORWARD[s.f] ?? FORWARD[0];
  const { min, max } = dim.heightRange;
  /** @type {{ pl: Place, loc: Vector3, block: import("@minecraft/server").Block }[]} */
  const items = [];
  for (const pl of designOf(p)) {
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
  /** @param {string} type @param {Mode} mode @param {Vector3} loc */
  const replaceable = (type, mode, loc) => !mine(loc.x, loc.y, loc.z) && (canReplace(type, mode) || (auto && mode === "ground" && NATURAL.has(type)));
  /** @param {Place} pl */
  const optional = (pl) => isOptional(p, pl);
  /** @param {Place} pl */
  const later = (pl) => pl.block === "minecraft:water" || pl.block === "minecraft:waterlily";
  /** @param {{ pl: Place, block: import("@minecraft/server").Block }} it */
  const put = (it) => {
    const states = it.pl.block === "minecraft:wall_sign" ? { facing_direction: wallFacing({ x: -fwd.x, z: -fwd.z }) } : placeStates(it.pl, s.f);
    it.block.setPermutation(perm(it.pl.block, states));
    out.placed++;
  };
  // 1. Everything but water and lily pads, supports first. A block that's already there (a rebuild) stays. The two
  // halves of a bed or a door (the second has `pair`) go in together, in one step, or neither does.
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (later(it.pl) || it.pl.pair) continue;
    yield;
    const mate = items[i + 1]?.pl.pair ? items[i + 1] : undefined;
    const group = mate ? [it, mate] : [it];
    if (group.every((g) => g.block.typeId === g.pl.block)) continue;
    if (!group.every((g) => g.block.typeId === g.pl.block || replaceable(g.block.typeId, g.pl.mode, g.loc))) {
      // A cobblestone floor under a well, or posts under a dock, are only needed where it's open.
      if (!optional(it.pl)) out.skipped += group.length;
      continue;
    }
    for (const g of group) put(g);
  }
  // 2. Water, only where it can't spill.
  const water = items.filter((it) => it.pl.block === "minecraft:water" && it.block.typeId !== "minecraft:water");
  const wetAlready = new Set(items.filter((it) => it.pl.block === "minecraft:water" && it.block.typeId === "minecraft:water").map((it) => keyOf(it.loc)));
  const want = new Map(water.filter((it) => replaceable(it.block.typeId, it.pl.mode, it.loc)).map((it) => [keyOf(it.loc), it]));
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
    if ((want.has(below) || wetAlready.has(below)) && replaceable(it.block.typeId, it.pl.mode, it.loc)) {
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

/** Updates the notice board's signs: name and level; projects done and residents; the newest residents (life.js boardTexts). @param {Town} t */
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
    const rs = residentsOf(t);
    const texts = boardTexts({ name: t.n, level: levelName(t.lvl), lvl: t.lvl, done, total: PROJECTS.length, residents: rs.r.filter((r) => r.d === undefined).length, newest: rs.new, top });
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
    residentTick(players);
    penTick(players);
    for (const t of allTowns().values()) {
      for (const p of ALL) {
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
  return `§e${p.name}§r${p.why ? ` §7- ${p.why}§r` : ""}\n${bar(pct(p, pr))} §f${pct(p, pr)} percent`;
}

/** The town's story so far, oldest first; empty for a town from before the story was kept. @param {Town} t */
const storyLines = (t) => (t.log?.length ? [`§lThe story so far§r\n${t.log.map((e) => `§7${logLine(e)}§r`).join("\n")}`] : []);

/** The town's houses: how many are built, of those its level brings. @param {Town} t */
function houseLines(t) {
  const n = housesAt(t);
  if (!n) return [];
  const built = WORKS.slice(0, n).filter((w) => progressOf(t, w).built).length;
  return [`§lHouses§r: ${built} of ${n} built${built < n ? " §7(the town builds them by itself, at spots it picks)" : ""}§r`];
}

/** What the town's next level brings, or nothing at the top. @param {Town} t */
function nextLines(t) {
  const text = nextLevelText({ lvl: t.lvl, max: MAX_LEVEL, name: levelName(t.lvl + 1), projects: projectsAt(t.lvl + 1).map((p) => p.name), housesNow: housesAt(t), housesNext: housesAt(t, t.lvl + 1) });
  return text ? [`§7${text}§r`] : [];
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
    ...storyLines(t),
    t.lvl >= MAX_LEVEL || !open.length
      ? "Every project is done. Thank you, everyone!"
      : `Finish these to make ${t.n} a ${levelName(t.lvl + 1)}:\n\n${open.map((p) => projectLine(t, p)).join("\n\n")}`,
    ...houseLines(t),
    ...nextLines(t),
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
    ...(p.why ? [`§7${p.why}.§r`] : []),
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
  storyAdd(t, `Founded by ${player.name}`);
  // Its own mayor (Townsfolk): Mayor Bram for the realm's first town, else a new one standing here.
  const mayors = get("townMayors") === true;
  if (mayors) Object.assign(t, { v: 2 }, newTownMayor([...allTowns().values()], t.id, t.n, CONFIG.mayorNames));
  saveTown(t);
  const gone = goneTowns();
  if (gone.includes(t.id)) saveGone(gone.filter((x) => x !== t.id)); // a new town of that name: no more an old one's
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
  // Houses are listed once they're due (their spot can be set or moved like a project's).
  const list = mode === "manage" ? ALL.filter((p) => t.spots[p.id]) : ALL.filter((p) => !isWork(p) || progressOf(t, p).done || t.spots[p.id]);
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
      : `Take ${t.n}'s ${p.name} away and put the ground back the way it was before it was built? Blocks added inside its outline since then stay, even of a kind the build is made of: only the build's own blocks are taken away.\n\nIt stays finished: set a new spot to build it again.`;
  if (await confirm(player, "§lRemove spot?", body, pr.built ? "§cRemove the build" : "Forget the spot")) removeSpot(t, p, (m) => player.sendMessage(m));
}

/** @param {Player} player @param {string} townId @param {string} projectId */
async function confirmRebuild(player, townId, projectId) {
  const t = allTowns().get(townId);
  const p = byId.get(projectId);
  if (!t || !p || !t.spots[p.id]) return;
  const body = legacyBuild(t, p)
    ? `Rebuild ${t.n}'s ${p.name}? It was built before the ground was saved, so missing blocks are put back; changed blocks stay as they are.`
    : `Rebuild ${t.n}'s ${p.name}? Its outline goes back to the ground saved before it was built, and it's built again, fresh. Blocks added inside its outline since then stay, even of a kind the build is made of.`;
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
  // Its path and lanterns go first, so the ground under a path at a leveled spot is put back with the rest.
  if (old) clearLife(t, p.id);
  if (moving && old) {
    const why = unbuild(t, p, old);
    if (why) {
      delete old.pt; // laid again on a later check
      saveTown(t);
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
  // Its path and lanterns go first, so the ground under a path at a leveled spot is put back with the rest.
  clearLife(t, p.id);
  if (wasBuilt) {
    const why = unbuild(t, p, s);
    if (why) {
      delete s.pt; // laid again on a later check
      saveTown(t);
      return tell(`§cThe ${p.name} couldn't be removed: ${why}.`);
    }
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
    for (const pl of designOf(p)) {
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
      .body(`Remove ${t.n} (${levelName(t.lvl)}, level ${t.lvl}) and all its project progress? What's built stays standing; its residents move away (what they carry drops).`)
      .button1("§cRemove it")
      .button2("Keep it"),
  );
  if (!res || res.canceled || res.selection !== 0 || !player.isValid || !stillOp(player)) return;
  deleteTown(t);
  player.sendMessage(`§aTown ${t.n} removed.`);
}

/** @param {Town} t */
function deleteTown(t) {
  for (const p of ALL) {
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
  for (const p of ALL) cancelAutoBuild(`${t.id}:${p.id}`);
  for (let k = 0; k < 2; k++) world.setDynamicProperty(`${PLACED_PREFIX}${t.id}:${k}`, undefined);
  // Its paths, lanterns and pen stay standing, like its builds.
  lifeCache.delete(t.id);
  world.setDynamicProperty(LIFE_PREFIX + t.id, undefined);
  if (lifeJob?.town === t.id) lifeJob = undefined;
  // Its own mayor goes with it (Mayor Bram stays where he lives).
  if (isTownMayorId(t.m)) send("realm:npc_mayor", { op: "remove", id: t.m });
  lastSet.delete(t.id);
  dropResidents(t); // its residents stay as ordinary villagers
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
    send("realm:calendar_ping", {}); // the Realm day, for the towns' stories
  }, 100),
);
onScriptEvent(
  ["realm:zones_ping", "realm:town_list_ping", "realm:town_state", "realm:calendar"],
  ({ id, message }) => {
    if (id === "realm:zones_ping" || id === "realm:town_list_ping") zonesChanged();
    else if (id === "realm:calendar") {
      try {
        const m = JSON.parse(message);
        if (m && typeof m.day === "number" && Number.isFinite(m.day) && m.day >= 1) realmDay = Math.floor(m.day);
      } catch {
        // not ours
      }
    }
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

/** The projects (and houses while houses is Enabled, the pen while townLife is) a town's scan picks spots for now. @param {Town} t */
const scanIds = (t) => (t.scan ?? []).filter((id) => !t.spots[id] && (!isWorkId(id) || get("houses") === true) && (id !== PEN_ID || get("townLife") === true));

/** Houses a town has at its level, while houses is Enabled. @param {Town} t @param {number} [lvl] */
const housesAt = (t, lvl = t.lvl) => (get("houses") === true ? houseCount(lvl, CONFIG.residentsPerLevel, CONFIG.residentCapTown) : 0);

/**
 * The houses due at the town's level (houses Enabled) and the garden pen once the garden is built (townLife): each is
 * marked done (a town work takes no deliveries) and queued for an automatic spot. Returns true when the town changed
 * (the caller saves it).
 * @param {Town} t
 */
function queueWorks(t) {
  /** @type {string[]} */
  const due = [];
  // The garden pen, once the garden is built (townLife).
  const pen = get("townLife") === true && !!GARDEN && progressOf(t, GARDEN).built === 1 && !!t.spots[GARDEN.id];
  for (const w of [...WORKS.slice(0, housesAt(t)), ...(pen ? [PEN] : [])]) {
    const pr = progressOf(t, w);
    if (pr.done) continue;
    pr.done = 1;
    saveProgress(t, w, pr);
    due.push(w.id);
  }
  if (!due.length) return false;
  queueScan(t, due);
  return true;
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
  const ids = scanIds(t);
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
      const g = id === PEN_ID && GARDEN ? t.spots[GARDEN.id] : undefined; // the pen goes beside the garden's middle
      const near = g ? toWorld(g, 0, 0, 3) : undefined;
      return { id, well: p.build === "well", dock: p.build === "dock", near: near && { x: near.x, z: near.z }, box: (/** @type {{ x: number, y: number, z: number, f: number }} */ s) => footprint(p, s) };
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

/** A tick of the scan: up to SCAN_READS_TICK reads, ended early when the scan says its own work is used up ("tick"). */
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
    if (q[0] === "tick") return; // the scan's own work for this tick is used up (SCAN.workTick)
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
    const [kind, a, b, c] = /** @type {any[]} */ (q);
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
  queueWorks(t);
  queueScan(t, ALL.filter((p) => (isWork(p) ? progressOf(t, p).done === 1 : p.level <= t.lvl) && !progressOf(t, p).built).map((p) => p.id));
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
  /** @type {{ x: number, z: number, t: number }[]} */
  const plan = (s.lv === undefined ? undefined : decodePlan(s.lv, region, pad)) ?? [];
  return { fpBox, fp, region, pad, plan, dock: p.build === "dock", y1: Math.min(fpBox.min.y, pad - 5), y2: Math.max(fpBox.max.y, pad + 5) + 1 };
}
/** @typedef {ReturnType<typeof autoGeometry>} Geometry */

/**
 * The build in progress (one at a time) and the queue of others, "town:project".
 * `resume`: a half-done build (bs) picked up again, maybe long after its check: the outline and the region check are
 * not done again (its ground is half leveled), but players are still waited off the spot, claims checked again, and the
 * blocks players placed since are left alone (applyBuild's `mine`).
 * @type {{ key: string, town: string, project: string, phase: "outline" | "check" | "standing" | "claims" | "apply", resume?: boolean, start: number, until?: number, said?: number, gen?: Generator<any, any, any>, ask?: { id: string, until: number }, claims?: number, out?: { placed: number, skipped: number }, changes?: number } | undefined}
 */
let buildJob;
/** Half-done builds that wait for an operator this session (key -> why): a claim or a player's blocks in a structure's box. @type {Map<string, string>} */
const heldBuilds = new Map();
/** @type {string[]} */
const buildQueue = [];
/** realm:town_test "build_pause" (scenarios): a build stops after this many block changes, as if the server stopped. */
let testPauseAfter = 0;
let testPaused = false;

/** @param {Town} t @param {Project} p @returns {boolean} */
function queueAutoBuild(t, p) {
  if (testPaused) return false;
  const key = `${t.id}:${p.id}`;
  if (heldBuilds.has(key)) return false;
  if (buildJob?.key !== key && !buildQueue.includes(key)) buildQueue.push(key);
  ensureJobs();
  return true;
}

/** @param {string} key */
function cancelAutoBuild(key) {
  heldBuilds.delete(key);
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
 * block isn't loaded (nothing was changed by that step), or why it can't go on (a saved structure's box holds something
 * it would replace). `mine(x, y, z)`: a block in a cell a player placed blocks in since the check (it may be resumed
 * long after): never cut, filled or built over.
 * @param {Dimension} dim @param {Project} p @param {Spot} s @param {Geometry} geo @param {{ placed: number, skipped: number }} out
 * @param {(x: number, y: number, z: number) => boolean} [mine]
 * @returns {Generator<void, boolean | string, void>}
 */
function* applyBuild(dim, p, s, geo, out, mine = () => false) {
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
        if ((NATURAL.has(b.typeId) || WILD.has(b.typeId)) && !mine(c.x, y, c.z)) b.setPermutation(air);
        yield;
      }
      // Up to it: the open blocks right under the new top become dirt, bottom up (never into a cave below).
      /** @type {import("@minecraft/server").Block[]} */
      const open = [];
      for (let y = c.t - 1; y >= c.t - 3; y--) {
        const b = at(c.x, y, c.z);
        yield;
        if (!(b.isAir || WILD.has(b.typeId)) || mine(c.x, y, c.z)) break;
        open.unshift(b);
      }
      for (const b of open) {
        b.setPermutation(dirt);
        yield;
      }
      // The new top: the surrounding top block on a fill, grass again on dirt a cut laid bare.
      const b = at(c.x, c.t, c.z);
      if (!mine(c.x, c.t, c.z) && (b.isAir || WILD.has(b.typeId) || (b.typeId === "minecraft:dirt" && topId === "minecraft:grass_block"))) b.setPermutation(top);
      yield;
    }
  } catch {
    return false;
  }
  const structure = p.structure ? savedStructure(p.structure) : undefined;
  if (structure) {
    // It replaces everything in its box: only air, natural ground and wild plants nobody placed may be there now.
    const { fpBox } = geo;
    const { min, max } = dim.heightRange;
    for (let x = fpBox.min.x; x <= fpBox.max.x; x++)
      for (let z = fpBox.min.z; z <= fpBox.max.z; z++)
        for (let y = Math.max(min, fpBox.min.y); y <= Math.min(max - 1, fpBox.max.y); y++) {
          const b = blockInfo(dim, x, y, z);
          if (!b) return false;
          if (mine(x, y, z)) return `a player placed blocks at ${x}, ${y}, ${z}`;
          if (b.id !== "minecraft:air" && !allowedInRegion(b, geo.dock)) return `${itemName(b.id)} at ${x}, ${y}, ${z}`;
          yield;
        }
    const rotation = [StructureRotation.None, StructureRotation.Rotate90, StructureRotation.Rotate180, StructureRotation.Rotate270][s.f] ?? StructureRotation.None;
    world.structureManager.place(structure, dim, { x: s.x, y: s.y, z: s.z }, { rotation, includeEntities: false });
    out.placed++;
    return true;
  }
  return yield* placeDesignSteps(dim, s, p, true, out, mine);
}

/** Players inside the region (the build and the ground leveled around it), who could be walled in by a fill. @param {Town} t @param {Geometry} geo */
const playersOn = (t, geo) =>
  world.getAllPlayers().filter((pl) => {
    if (pl.dimension.id !== t.dim) return false;
    const { x, y, z } = pl.location;
    return x >= geo.region.x1 && x < geo.region.x2 + 1 && z >= geo.region.z1 && z < geo.region.z2 + 1 && y >= geo.pad - 4 && y <= geo.fpBox.max.y + 2;
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

/**
 * A half-done build that can't go on (a claim now covers it, or a structure's box holds a player's blocks): it stops
 * where it is, nothing more changes, and operators are told once; Remove spot puts the ground back. It tries again
 * after a restart. @param {Town} t @param {Project} p @param {string} why
 */
function holdBuild(t, p, why) {
  const key = `${t.id}:${p.id}`;
  buildJob = undefined;
  heldBuilds.set(key, why);
  tellOps(`§e[Town Projects] ${t.n}'s ${p.name} is half built and stopped (${why}). An operator can Remove spot in /realm:town to put the ground back, or clear the way: it goes on after a restart.`);
}

/** Is (x, y, z) in a cell a player placed blocks in? Unknown cells count as placed. @param {Town} t */
const placedBy = (t) => {
  const c = cellsOf(t);
  return (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => !c || c.set.has(cellOf(t, x, y, z));
};

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
    buildJob = { key, town, project, phase: s.bs ? "standing" : outline > 0 ? "outline" : "check", resume: !!s.bs, start: system.currentTick, until: system.currentTick + outline * 20 };
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
      if ((job.claims ?? 0) > 0) return s.bs ? holdBuild(t, p, "a land claim covers it now") : respot(t, p, "a land claim");
      // Saved first: the region and its depth, so Remove spot puts the terrain back; then bs, so a restart resumes.
      if (!s.snap && !s.old) {
        const box = clampBox({ min: { x: geo.region.x1, y: geo.y1, z: geo.region.z1 }, max: { x: geo.region.x2, y: geo.y2, z: geo.region.z2 } }, dim);
        if (!snapshot(t, p, s, dim, box)) return respot(t, p, "its ground couldn't be saved");
      }
      s.bs = 1;
      saveTown(t);
      job.phase = "apply";
      return;
    }
    case "apply": {
      // Someone walked onto the spot meanwhile: wait, so no fill or wall goes up around them.
      const on = playersOn(t, geo);
      if (on.length) {
        if (now - (job.said ?? -1000) >= 200) {
          job.said = now;
          for (const pl of on) pl.sendMessage(`§eStep off the spot: ${t.n}'s ${p.name} goes up here.`);
        }
        return;
      }
      if (!cellsOf(t)) return; // the placed cells aren't readable yet
      // Mobs and items on the region (a resident strolling by) step aside first, so nothing is walled in (O80).
      clearMobs(dim, { min: { x: geo.region.x1, y: geo.pad - 4, z: geo.region.z1 }, max: { x: geo.region.x2, y: geo.fpBox.max.y + 2, z: geo.region.z2 } });
      job.out ??= { placed: 0, skipped: 0 };
      job.gen ??= applyBuild(dim, p, s, geo, job.out, placedBy(t));
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
          if (typeof r.value === "string") return holdBuild(t, p, r.value);
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
    try {
      stepLife();
    } catch (e) {
      console.warn(`[town] life: ${e}`);
      lifeJob = undefined;
    }
    if (!scanJob && !buildJob && !buildQueue.length && !lifeJob && jobTicker !== undefined) {
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
    // Houses due at the town's level (a town that leveled before this version, or houses just Enabled).
    if (queueWorks(t)) saveTown(t);
    if (t.as === 1) continue;
    queueScan(t, [...projectsAt(t.lvl), ...PROJECTS.filter((p) => progressOf(t, p).done && !progressOf(t, p).built)].map((p) => p.id));
    t.as = 1;
    saveTown(t);
  }
  lifeTick(players);
  if (get("autoSpots") !== true || scanJob) return;
  const t = [...allTowns().values()].find((x) => scanIds(x).length && playerIn(players, x));
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
// Small life (F40, townLife; life.js): a path from each build at an automatic spot toward the center, lantern posts
// beside the paths at each new level, the garden pen's animals, the notice board and the mayor's town news. Blocks are
// placed once, a few reads a tick in the job (no per-tick work otherwise), and saved in "town:w:<town>" so Remove spot
// turns them back; what wasn't loaded then waits under "~<project>" until it is.
// ---------------------------------------------------------------------------

const LIFE_PREFIX = "town:w:";
const LIFE_READS_TICK = 32; // block reads a tick while a path or the posts are planned
const LIFE_WAITS = 3; // tries of a path that met unloaded ground (this session); then what was found is laid
const PATH_BLOCK = "minecraft:grass_path";
const ANIMALS = ["minecraft:sheep", "minecraft:sheep", "minecraft:chicken", "minecraft:chicken"];
/** Each town's paths and posts (town:w:<town>), cached; this pack is the only writer. @type {Map<string, Record<string, [string, string]>>} */
const lifeCache = new Map();
/** Unloaded tries of a path, by "town:project". @type {Map<string, number>} */
const lifeWaits = new Map();
/**
 * The path or posts being planned (one at a time).
 * @type {{ town: string, kind: "path" | "posts", id: string, ask?: { id: string, until: number }, claims?: { x1: number, z1: number, x2: number, z2: number }[], gen?: Generator<import("./life.js").BlockRequest, any, any>, answer?: any } | undefined}
 */
let lifeJob;

/** @param {Town} t */
function lifeOf(t) {
  let w = lifeCache.get(t.id);
  if (!w) lifeCache.set(t.id, (w = readWorks(readJson(LIFE_PREFIX + t.id))));
  return w;
}

/** @param {Town} t @param {Record<string, [string, string]>} w */
function saveLife(t, w) {
  lifeCache.set(t.id, w);
  world.setDynamicProperty(LIFE_PREFIX + t.id, Object.keys(w).length ? JSON.stringify(w) : undefined);
}

/**
 * The town's mayor tells it (Townsfolk gossip, kind town_life, only that mayor: `from`): a new family, a new house, a
 * new level. At most one piece of this pack's news an in-game hour (gossip). @param {Town} t @param {string} key
 */
function lifeNews(t, key) {
  gossip(`${t.id}:life:${key}`, { kind: "town_life", place: t.n, ...(t.m ? { from: t.m } : {}) });
}

/** A pen animal at place i (0 .. 3) inside the pen, tagged town:a:<town>. @param {Town} t @param {Spot} s @param {Dimension} dim @param {string} type @param {number} i */
function spawnPenAnimal(t, s, dim, type, i) {
  const at = toWorld(s, (i % 2) * 2 - 1, 0, 2 + Math.floor(i / 2) * 2);
  try {
    const e = spawnFresh(dim, type, { x: at.x + 0.5, y: at.y, z: at.z + 0.5 }, { fresh: true });
    e.addTag(`town:a:${t.id}`);
  } catch (e) {
    console.warn(`[town] ${t.n}'s pen: ${type}: ${e}`);
  }
}

/** The garden pen's animals: 2 sheep and 2 chickens inside it, once (penTick brings back those that vanish). @param {Town} t @param {Spot} s @param {Dimension} dim */
function penAnimals(t, s, dim) {
  const pr = progressOf(t, PEN);
  if (pr.an) return;
  ANIMALS.forEach((type, i) => spawnPenAnimal(t, s, dim, type, i));
  pr.an = 1;
  saveProgress(t, PEN, pr);
}

const PEN_NEAR = 24; // a player this close to the pen (its chunk ticking, its animals loaded) for two checks in a row
const PEN_CHECK = 600; // ticks between a town's pen checks
/** Tick a player was first seen near each town's pen (deleted when nobody is), and of its last check. @type {Map<string, number>} */
const penSeen = new Map();
const penAt = new Map();

/**
 * On the build check (every 100 ticks): the vanilla sheep and chickens a script spawns despawn once no player is near
 * (instantly past 128 blocks), so a pen whose animals vanished gets them back (life.js penMissing: never the ones that
 * died). Only for a pen a player has been within PEN_NEAR of since the last check, so its animals are loaded and a
 * missing one is really gone; one town's pen at most every PEN_CHECK ticks.
 * @param {Player[]} players
 */
function penTick(players) {
  if (get("townLife") !== true) return;
  const now = system.currentTick;
  for (const t of allTowns().values()) {
    const s = t.spots[PEN_ID];
    const pr = s ? progressOf(t, PEN) : undefined;
    if (!s || !pr?.built || !pr.an) continue;
    const near = players.some((pl) => pl.dimension.id === t.dim && Math.hypot(pl.location.x - s.x, pl.location.z - s.z) <= PEN_NEAR);
    if (!near) {
      penSeen.delete(t.id);
      continue;
    }
    if (!penSeen.has(t.id)) penSeen.set(t.id, now);
    if (now - /** @type {number} */ (penSeen.get(t.id)) < PEN_CHECK || now - (penAt.get(t.id) ?? -PEN_CHECK) < PEN_CHECK) continue;
    penAt.set(t.id, now);
    try {
      const dim = world.getDimension(t.dim);
      // Every pen animal loaded, however far it wandered, counts: only those really gone are spawned again (O78).
      const tag = `town:a:${t.id}`;
      const found = dim.getEntities({ tags: [tag] });
      const middle = toWorld(s, 0, 0, 3);
      const extra = new Set(penSurplus(found.map((e) => ({ type: e.typeId, d: Math.hypot(e.location.x - middle.x, e.location.z - middle.z) })), pr.k ?? [], ANIMALS));
      for (const i of extra) found[i].removeTag(tag); // one that came back after its stand-in was spawned: an ordinary animal now
      const alive = found.filter((_, i) => !extra.has(i)).map((e) => e.typeId);
      penMissing(alive, pr.k ?? [], ANIMALS).forEach((type, i) => spawnPenAnimal(t, s, dim, type, i));
    } catch (e) {
      console.warn(`[town] ${t.n}'s pen: ${e}`);
    }
    return; // one town a check
  }
}

// A pen animal died (eaten, a fox, lava): it isn't spawned again.
world.afterEvents.entityDie.subscribe(
  ({ deadEntity }) => {
    try {
      const town = deadEntity.getTags().find((tag) => tag.startsWith("town:a:"))?.slice(7);
      const t = town ? allTowns().get(town) : undefined;
      if (!t) return;
      const pr = progressOf(t, PEN);
      if ((pr.k ?? []).length < ANIMALS.length) pr.k = [...(pr.k ?? []), deadEntity.typeId];
      saveProgress(t, PEN, pr);
    } catch (e) {
      console.warn(`[town] pen animal died: ${e}`);
    }
  },
  { entityTypes: [...new Set(ANIMALS)] },
);

/**
 * Turns paths back to grass and takes lantern posts away, only where they are still what the town put there. Returns
 * what wasn't loaded. @param {Dimension} dim @param {import("./life.js").Cell[]} paths @param {import("./life.js").Cell[]} posts
 * @returns {[import("./life.js").Cell[], import("./life.js").Cell[]]}
 */
function restoreLife(dim, paths, posts) {
  const grass = perm("minecraft:grass_block");
  const air = perm("minecraft:air");
  /** @type {import("./life.js").Cell[]} */
  const pathLeft = [];
  /** @type {import("./life.js").Cell[]} */
  const postLeft = [];
  for (const c of paths) {
    try {
      const b = dim.getBlock(c);
      if (!b) pathLeft.push(c);
      else if (b.typeId === PATH_BLOCK) b.setPermutation(grass);
    } catch {
      pathLeft.push(c);
    }
  }
  for (const c of posts) {
    try {
      const fence = dim.getBlock(c);
      const lamp = dim.getBlock({ x: c.x, y: c.y + 1, z: c.z });
      if (!fence || !lamp) {
        postLeft.push(c);
        continue;
      }
      if (lamp.typeId === "minecraft:lantern") lamp.setPermutation(air);
      if (fence.typeId === "minecraft:oak_fence") fence.setPermutation(air);
    } catch {
      postLeft.push(c);
    }
  }
  return [pathLeft, postLeft];
}

/**
 * Remove spot (or a move): the build's path and the posts beside it go too. `leftOnly`: only what an earlier removal
 * couldn't reach (the spot may have a new path meanwhile). @param {Town} t @param {string} id @param {boolean} [leftOnly]
 */
function clearLife(t, id, leftOnly = false) {
  const w = lifeOf(t);
  const old = "~" + id;
  const cur = leftOnly ? undefined : w[id];
  if (!cur && !w[old]) return;
  if (!leftOnly) {
    lifeWaits.delete(`${t.id}:${id}`);
    if (lifeJob?.town === t.id && lifeJob.id === id) lifeJob = undefined;
  }
  const paths = [cur?.[0], w[old]?.[0]].flatMap((x) => unpackCells(x, t.x, t.z));
  const posts = [cur?.[1], w[old]?.[1]].flatMap((x) => unpackCells(x, t.x, t.z));
  /** @type {[import("./life.js").Cell[], import("./life.js").Cell[]]} */
  let left = [paths, posts];
  try {
    left = restoreLife(world.getDimension(t.dim), paths, posts);
  } catch {
    // its dimension isn't there: later
  }
  if (!leftOnly) delete w[id];
  delete w[old];
  if (left[0].length || left[1].length) w[old] = [packCells(left[0], t.x, t.z), packCells(left[1], t.x, t.z)];
  saveLife(t, w);
}

/** Rects as inclusive columns. @param {import("./sites.js").Rect} r @param {number} x @param {number} z */
const inRect = (r, x, z) => x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2;

/**
 * Where a path or a post may not go: a build's region (`except` the path's own), a claim, a block a player placed, a
 * story place. @param {Town} t @param {string} except @param {{ x1: number, z1: number, x2: number, z2: number }[]} claims
 */
function lifeStop(t, except, claims) {
  const regions = Object.entries(t.spots).flatMap(([id, s]) => (id !== except && byId.has(id) ? [regionOf(rectOf(footprint(/** @type {Project} */ (byId.get(id)), s)))] : []));
  const story = [...storyPlaces.values()].filter((q) => dimId(q.dim) === t.dim);
  const cells = cellsOf(t);
  return (/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ y) =>
    regions.some((r) => inRect(r, x, z)) ||
    claims.some((r) => inRect(r, x, z)) ||
    story.some((q) => Math.hypot(q.x - x, q.z - z) <= PLACE_KEEP) ||
    touches(cells, t, { x1: x, z1: z, x2: x, z2: z }, y - 1, y + 2);
}

/** @param {Town} t @param {"path" | "posts"} kind @param {string} id @param {import("./sites.js").Rect} area */
function startLife(t, kind, id, area) {
  const job = { town: t.id, kind, id, ask: { id: "", until: system.currentTick + CLAIMS_WAIT } };
  job.ask.id = askClaims(t.dim, area, (claims) => {
    if (lifeJob === job) /** @type {any} */ (job).claims = claims;
  });
  lifeJob = job;
  ensureJobs();
}

/**
 * On the build check (every 100 ticks), while a player is in a town (townLife): what a removal couldn't reach is put
 * back; a build at an automatic spot without its path gets one; a town at a new level gets its lantern posts once no
 * build of it is waiting to go up. One job at a time. @param {Player[]} players
 */
function lifeTick(players) {
  for (const t of allTowns().values()) {
    if (!playerIn(players, t)) continue;
    const w = lifeOf(t);
    const old = Object.keys(w).filter((k) => k.startsWith("~"));
    for (const k of old) clearLife(t, k.slice(1), true);
  }
  if (get("townLife") !== true || lifeJob) return;
  for (const t of allTowns().values()) {
    if (!playerIn(players, t)) continue;
    for (const p of ALL) {
      const s = t.spots[p.id];
      if (!s?.a || s.pt || s.bs || progressOf(t, p).built !== 1) continue;
      const a = toWorld(s, 0, -1, -1);
      return startLife(t, "path", p.id, { x1: Math.min(a.x, t.x) - 1, z1: Math.min(a.z, t.z) - 1, x2: Math.max(a.x, t.x) + 1, z2: Math.max(a.z, t.z) + 1 });
    }
    if (t.lvl <= (t.lp ?? 1)) continue;
    // Wait for the level's builds at automatic spots (and spots still being picked), so their paths get posts too.
    const waiting = ALL.some((p) => t.spots[p.id]?.a && progressOf(t, p).done === 1 && progressOf(t, p).built !== 1) || (get("autoSpots") === true && scanIds(t).length > 0);
    if (waiting) continue;
    const r = get("townRadius");
    return startLife(t, "posts", "", { x1: t.x - r, z1: t.z - r, x2: t.x + r, z2: t.z + r });
  }
}

/** A tick of the path or posts being planned: up to LIFE_READS_TICK block reads, then the blocks placed at once. */
function stepLife() {
  const job = lifeJob;
  if (!job) return;
  const t = allTowns().get(job.town);
  if (!t || get("townLife") !== true || !playerIn(world.getAllPlayers(), t)) {
    lifeJob = undefined; // again on a later check
    return;
  }
  if (job.ask) {
    if (job.claims === undefined && system.currentTick <= job.ask.until) return;
    claimAsks.delete(job.ask.id);
    job.ask = undefined;
    job.claims ??= []; // no answer: no Land Claims
  }
  const dim = world.getDimension(t.dim);
  const claims = job.claims ?? [];
  const p = byId.get(job.id);
  const s = p ? t.spots[p.id] : undefined;
  if (job.kind === "path" && (!p || !s?.a || progressOf(t, p).built !== 1)) {
    lifeJob = undefined;
    return;
  }
  if (!job.gen) {
    if (job.kind === "path" && s) {
      const a = toWorld(s, 0, -1, -1); // the ground just in front of the build
      job.gen = planPath({ start: a, cx: t.x, cz: t.z, stop: lifeStop(t, job.id, claims) });
    } else {
      const w = lifeOf(t);
      const own = Object.entries(w).filter(([k]) => !k.startsWith("~"));
      job.gen = planPosts({
        paths: own.map(([id, v]) => ({ id, cells: unpackCells(v[0], t.x, t.z) })),
        posts: Object.values(w).flatMap((v) => unpackCells(v[1], t.x, t.z)),
        stop: lifeStop(t, "", claims),
        max: Math.max(0, POSTS_MAX - postCount(w)),
      });
    }
  }
  for (let reads = 0; reads < LIFE_READS_TICK; reads++) {
    const r = job.gen.next(job.answer);
    if (r.done) {
      lifeJob = undefined;
      if (job.kind === "path" && p && s) layPath(t, p, s, dim, r.value);
      else layPosts(t, dim, r.value);
      return;
    }
    const [, x, y, z] = r.value;
    job.answer = blockInfo(dim, x, y, z);
  }
}

/** @param {Town} t @param {Project} p @param {Spot} s @param {Dimension} dim @param {{ cells: import("./life.js").PathCell[], unloaded: boolean }} res */
function layPath(t, p, s, dim, res) {
  const key = `${t.id}:${p.id}`;
  if (res.unloaded && (lifeWaits.get(key) ?? 0) < LIFE_WAITS) {
    lifeWaits.set(key, (lifeWaits.get(key) ?? 0) + 1); // again on a later check, when more of it is loaded
    return;
  }
  lifeWaits.delete(key);
  const path = perm(PATH_BLOCK);
  const air = perm("minecraft:air");
  /** @type {import("./life.js").Cell[]} */
  const laid = [];
  for (const c of res.cells) {
    try {
      // Checked again as it's laid: still grass, with air (or the wild plant it had) above.
      const b = dim.getBlock(c);
      const above = dim.getBlock({ x: c.x, y: c.y + 1, z: c.z });
      if (!b || !above || b.typeId !== "minecraft:grass_block") break;
      if (!above.isAir && !(c.c && CLEARABLE.has(above.typeId))) break;
      if (!above.isAir) above.setPermutation(air);
      b.setPermutation(path);
      laid.push({ x: c.x, y: c.y, z: c.z });
    } catch {
      break;
    }
  }
  const w = lifeOf(t);
  if (laid.length) w[p.id] = [packCells(laid, t.x, t.z), w[p.id]?.[1] ?? ""];
  saveLife(t, w);
  s.pt = 1;
  saveTown(t);
}

/** @param {Town} t @param {Dimension} dim @param {{ id: string, x: number, y: number, z: number }[]} posts */
function layPosts(t, dim, posts) {
  const fence = perm("minecraft:oak_fence");
  const lamp = perm("minecraft:lantern", { hanging: false });
  const w = lifeOf(t);
  for (const q of posts) {
    try {
      const g = dim.getBlock({ x: q.x, y: q.y - 1, z: q.z });
      const f = dim.getBlock(q);
      const l = dim.getBlock({ x: q.x, y: q.y + 1, z: q.z });
      if (!g || !f || !l || !NATURAL.has(g.typeId) || !f.isAir || !l.isAir || !w[q.id]) continue;
      f.setPermutation(fence);
      l.setPermutation(lamp);
      w[q.id] = [w[q.id][0], w[q.id][1] + packCells([q], t.x, t.z)];
    } catch {
      // unloaded meanwhile: one post fewer
    }
  }
  saveLife(t, w);
  t.lp = t.lvl;
  saveTown(t);
}

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
    // Natural kinds and wild plants (a flower bed looks like wild ground to the scan); anything else is man-made anyway.
    if (!NATURAL.has(block.typeId) && !WILD.has(block.typeId)) return;
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
//   /scriptevent realm:town_test {"action":"add|spot|finish|remove|rebuild|protect|zones|dump|mayor_move|mayor_rename|remove_town|v1|scan|build_pause|census|residents_due", "player"?, "town"?, "project"?, "name"?, "spot"?, "on"?, "after"?}
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
        return tell(JSON.stringify({ town: t, progress: ALL.map((x) => [x.id, progressOf(t, x)]), placed: places ? [...places.keys()] : null, scanning: scanJob?.town ?? null, building: buildJob ? [buildJob.key, buildJob.phase] : null, cells: cellsOf(t)?.list.length ?? 0, residents: residentsOf(t), homes: homesOf(t), life: lifeOf(t), living: lifeJob ? [lifeJob.kind, lifeJob.id] : null, regions: Object.fromEntries(Object.entries(t.spots).flatMap(([id, sp]) => (byId.has(id) ? [[id, Object.values(regionOf(rectOf(footprint(/** @type {Project} */ (byId.get(id)), sp))))]] : []))) }));
      if (m.action === "scan") {
        findSpotsAgain(t, tell);
        if (!scanJob && get("autoSpots") === true && t.scan?.length) startScan(t);
        return;
      }
      if (m.action === "census") {
        censusAt.set(t.id, system.currentTick);
        census(t);
        return tell(`census of ${t.id}: ${JSON.stringify(residentsOf(t))}`);
      }
      if (m.action === "residents_due") {
        // Every family waiting to be replaced is due now (instead of after replaceMinutes).
        const rs = residentsOf(t);
        const now = world.getAbsoluteTime();
        for (const r of rs.r) if (r.d !== undefined) r.d = now;
        saveResidents(t, rs);
        return tell(`residents of ${t.id} due at ${now}`);
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
        if (isWork(p)) return tell("a house or the pen is built by the town itself (houses from level 2, the pen once the garden is built)");
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

// ---------------------------------------------------------------------------
// Residents (F39, residents.js): vanilla villagers that move into a town as it grows, 2 at the well, then one family
// per house. They are spawned with spawnFresh, tagged realm:resident, town:r:<town> and town:rid:<town>.<n>, named, and
// given the realm:town_resident group of town_bp's villager_v2 file (no bed, job site or bell is ever claimed; they
// stay near home). Event driven: a death marks the family for replacement; a census per town every 30 seconds, only
// while a player is in it, finds who is gone, strays and wanderers. Nothing runs per tick.
// ---------------------------------------------------------------------------

const RES_PREFIX = "town:r:";
const VILLAGER = "minecraft:villager_v2";
const RESIDENT_TAG = "realm:resident";
const RESIDENT_PROP = "realm:resident"; // the entity property town_bp's villager_v2 file adds; true once a resident
const CENSUS_TICKS = 600;
const MOVE_CLEAR = 24; // a family moves house only while no player is this close to its old or new home
const WATCHED = 16; // a resident strayed past HOME_LEASH is brought home only while no player is this close to it
const SPAWNS_PER_CENSUS = 2; // new families, replacements and moves at most per census
/** Each town's residents (town:r:<town>), cached; this pack is the only writer. @type {Map<string, import("./residents.js").Residents>} */
const resCache = new Map();
/** Tick of each town's last census; deleted to have the next check (5 s) count it at once. @type {Map<string, number>} */
const censusAt = new Map();
/** false once a spawned villager had no realm:resident property: another add-on's villager_v2 file wins over ours. */
let residentGate = true;
const tapSaid = new Map();

/** The project whose build is the well (its families' first home). */
const WELL_ID = PROJECTS.find((p) => p.build === "well")?.id;
const townTag = (/** @type {string} */ id) => `town:r:${id}`;
const replaceTicks = () => Math.max(5, Math.min(120, Math.floor(Number(get("replaceMinutes")) || 20))) * TICKS_PER_MINUTE;
const capWorld = () => Math.max(0, Math.min(40, Math.floor(Number(get("residentCapWorld")) || 0)));

/** @param {Town} t @returns {import("./residents.js").Residents} */
function residentsOf(t) {
  let rs = resCache.get(t.id);
  if (!rs) resCache.set(t.id, (rs = readResidents(readJson(RES_PREFIX + t.id))));
  return rs;
}

/** @param {Town} t @param {import("./residents.js").Residents} rs */
function saveResidents(t, rs) {
  resCache.set(t.id, rs);
  world.setDynamicProperty(RES_PREFIX + t.id, JSON.stringify(rs));
}

/** Is a home (the well, or house_<n>) built in this town? @param {Town} t @param {string} h */
function homeBuilt(t, h) {
  const id = h === "well" ? WELL_ID : h;
  const p = id ? byId.get(id) : undefined;
  return !!p && !!t.spots[p.id] && progressOf(t, p).built === 1;
}

/** Each slot's home now (residents.js homesFor). @param {Town} t */
function homesOf(t) {
  const slots = slotCount(t.lvl, homeBuilt(t, "well"), CONFIG.residentsPerLevel, CONFIG.residentCapTown);
  return homesFor(slots, (h) => homeBuilt(t, h));
}

/** Where a home's family stands, or the town center when the home has no spot. @param {Town} t @param {string | undefined} h @param {number} slot */
function anchorOf(t, h, slot) {
  const s = h ? t.spots[h === "well" ? (WELL_ID ?? "") : h] : undefined;
  return s ? homeAt(/** @type {string} */ (h), s, slot) : { x: t.x, y: t.y, z: t.z };
}

/** @param {Dimension} dim @param {Vector3} v */
function isLoaded(dim, v) {
  try {
    return !!dim.getBlock(v);
  } catch {
    return false;
  }
}

/** A place to stand at or near v (feet and head free, ground below), as a block center; undefined when there is none or it isn't loaded. @param {Dimension} dim @param {Vector3} v */
function standAt(dim, v) {
  for (const dy of [0, 1, -1, 2, -2, 3]) {
    try {
      const feet = dim.getBlock({ x: v.x, y: v.y + dy, z: v.z });
      const head = dim.getBlock({ x: v.x, y: v.y + dy + 1, z: v.z });
      const below = dim.getBlock({ x: v.x, y: v.y + dy - 1, z: v.z });
      if (!feet || !head || !below) return undefined;
      if (feet.isAir && head.isAir && !below.isAir && !below.isLiquid) return { x: v.x + 0.5, y: v.y + dy, z: v.z + 0.5 };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Moves the mobs and dropped items inside a build's box to just outside it, before blocks go in (O80): a build used to
 * wall in a resident that stood there (it suffocated), and a pet or a dropped item would fare no better. Players are
 * waited for instead ("Step off the spot"). Paintings, leash knots and other entities without health stay. Each goes to
 * the nearest side with room to stand; one with no room anywhere near stays (the next tick tries again).
 * @param {Dimension} dim @param {Box} box
 */
function clearMobs(dim, box) {
  /** @type {import("@minecraft/server").Entity[]} */
  let ents;
  try {
    ents = dim.getEntities({ location: { x: box.min.x, y: box.min.y, z: box.min.z }, volume: { x: box.max.x - box.min.x + 1, y: box.max.y - box.min.y + 1, z: box.max.z - box.min.z + 1 } });
  } catch {
    return;
  }
  for (const e of ents) {
    try {
      if (e.typeId === "minecraft:player" || (e.typeId !== "minecraft:item" && !e.getComponent("minecraft:health"))) continue;
      const { x, y, z } = e.location;
      const sides = [
        { x: box.min.x - 1, z: Math.floor(z), d: x - box.min.x },
        { x: box.max.x + 1, z: Math.floor(z), d: box.max.x + 1 - x },
        { x: Math.floor(x), z: box.min.z - 1, d: z - box.min.z },
        { x: Math.floor(x), z: box.max.z + 1, d: box.max.z + 1 - z },
      ].sort((a, b) => a.d - b.d);
      for (const side of sides) {
        const to = standAt(dim, { x: side.x, y: Math.floor(y), z: side.z });
        if (!to) continue;
        e.teleport(to, { dimension: dim });
        break;
      }
    } catch {
      // gone or unloaded meanwhile
    }
  }
}

/** Drops what a villager carries (its inventory) where it stands, before it is removed. @param {import("@minecraft/server").Entity} e */
function dropCarried(e) {
  const inv = e.getComponent("minecraft:inventory")?.container;
  if (!inv) return;
  for (let k = 0; k < inv.size; k++) {
    const item = inv.getItem(k);
    if (!item) continue;
    e.dimension.spawnItem(item, e.location); // first: if it throws, the item stays with the villager, which isn't removed
    inv.setItem(k, undefined);
  }
}

/** Takes our tags off a villager (it stays, an ordinary villager that keeps its name). @param {import("@minecraft/server").Entity | undefined} e @param {string} town */
function untagResident(e, town) {
  if (!e) return;
  try {
    for (const tag of e.getTags()) if (tag === RESIDENT_TAG || tag === townTag(town) || tag.startsWith(`town:rid:${town}.`)) e.removeTag(tag);
  } catch {
    // unloaded meanwhile: the next census tries again
  }
}

/**
 * Spawns one family at its home: a vanilla villager, named, with its home's look, the realm:town_resident group and our
 * tags (C6, C25). Undefined when there is no place to stand, the spawn failed, or villager_v2 isn't town_bp's (another
 * add-on's file wins): then the villager is removed again before it gets a tag, and residents stop.
 * @param {Town} t @param {Dimension} dim @param {import("./residents.js").Residents} rs @param {number} slot @param {string} h @param {string} name
 * @returns {import("./residents.js").Resident | undefined}
 */
function spawnResident(t, dim, rs, slot, h, name) {
  const at = standAt(dim, anchorOf(t, h, slot));
  if (!at) return undefined;
  const look = lookFor(h, slot, (home) => /** @type {any} */ (byId.get(home))?.job);
  /** @type {import("@minecraft/server").Entity} */
  let e;
  try {
    e = spawnFresh(dim, VILLAGER, at, { spawnEvent: "minecraft:spawn_from_village", fresh: true });
  } catch (err) {
    console.warn(`[town] resident: ${err}`);
    return undefined;
  }
  let ours = false;
  try {
    ours = e.getProperty(RESIDENT_PROP) !== undefined; // defined only by town_bp's villager_v2 file
  } catch {
    // treated as not ours
  }
  if (!ours) {
    try {
      e.remove();
    } catch {
      // gone already
    }
    if (residentGate) tellOps("§c[Town Projects] Residents can't move in: another add-on defines villagers (minecraft:villager_v2), so town villagers would claim players' beds. Disable residents, or remove that add-on.");
    residentGate = false;
    return undefined;
  }
  const i = rs.n++;
  try {
    e.nameTag = name;
    e.triggerEvent(lookEvent(look)); // first: a profession's group brings its own dweller component back
    e.triggerEvent("realm:become_resident"); // last, so its dweller (no beds, job sites or bells) is the one in force
    e.addTag(RESIDENT_TAG);
    e.addTag(townTag(t.id));
    e.addTag(ridTag(t.id, i));
  } catch (err) {
    console.warn(`[town] resident: ${err}`);
    try {
      e.remove();
    } catch {
      // gone already
    }
    return undefined;
  }
  return { s: slot, i, n: name, h, e: e.id, p: look };
}

/** Names living residents use, in the world and in this town. @param {Town} t */
function namesInUse(t) {
  const all = new Set();
  const own = new Set();
  for (const x of allTowns().values())
    for (const r of residentsOf(x).r)
      if (r.d === undefined) {
        all.add(r.n);
        if (x.id === t.id) own.add(r.n);
      }
  return { all, own };
}

/** New families each town may get now under residentCapWorld (residents.js allocate); `rs` is town t's census so far. @param {Town} t @param {import("./residents.js").Residents} rs */
function roomByTown(t, rs) {
  return allocate(
    [...allTowns().values()].map((x) => ({ id: x.id, lvl: x.lvl, at: x.at, living: livingOf(x.id === t.id ? rs : residentsOf(x)), slots: homesOf(x).length })),
    capWorld(),
  );
}

/**
 * One town's census (every CENSUS_TICKS while a player is in it): one getEntities by tag, then reconcile (gone,
 * strays, wanderers), then at most SPAWNS_PER_CENSUS new families, replacements and moves.
 * @param {Town} t
 */
function census(t) {
  if (get("residents") !== true || !residentGate) return;
  const dim = world.getDimension(t.dim);
  const center = { x: t.x, y: t.y, z: t.z };
  if (!isLoaded(dim, center)) return;
  let rs = residentsOf(t);
  const homes = homesOf(t);
  if (!rs.r.length && !homes.some(Boolean)) return; // no home yet: nothing to look for
  /** @type {import("@minecraft/server").Entity[]} */
  let ents;
  try {
    ents = dim.getEntities({ type: VILLAGER, tags: [townTag(t.id)] });
  } catch {
    return;
  }
  const now = world.getAbsoluteTime();
  const found = [];
  for (const e of ents) {
    try {
      found.push({ id: e.id, rid: ridOf(t.id, e.getTags()), x: e.location.x, z: e.location.z });
    } catch {
      // unloaded meanwhile
    }
  }
  // A player within WATCHED of a stray: it isn't brought home before their eyes (the next census tries again).
  const near = world.getAllPlayers().filter((pl) => pl.dimension.id === t.dim).map((pl) => pl.location);
  const watched = (/** @type {number} */ x, /** @type {number} */ z) => near.some((v) => Math.hypot(v.x - x, v.z - z) <= WATCHED);
  const res = reconcile({ rs, town: t.id, found, loaded: (r) => isLoaded(dim, anchorOf(t, r.h, r.s)), center, radius: get("townRadius"), now, replaceTicks: replaceTicks(), home: (r) => (r.h ? anchorOf(t, r.h, r.s) : undefined), leash: HOME_LEASH, watched });
  rs = res.rs;
  let changed = res.changed;
  const entity = new Map(ents.map((e) => [e.id, e]));
  for (const id of res.untag) untagResident(entity.get(id), t.id);
  for (const { id, s } of res.teleport) {
    const e = entity.get(id);
    const rec = rs.r.find((x) => x.s === s);
    const to = standAt(dim, anchorOf(t, rec?.h, s));
    try {
      if (!e || !to || e.getComponent("minecraft:leashable")?.isLeashed || e.getComponent("minecraft:riding")) continue; // a player leads it: leave it
      e.teleport(to, { dimension: dim });
    } catch {
      // unloaded meanwhile
    }
  }
  // A resident whose group didn't take (the event came before its spawn finished): again.
  for (const r of rs.r) {
    const e = r.e && r.d === undefined ? entity.get(r.e) : undefined;
    try {
      if (e && e.getProperty(RESIDENT_PROP) !== true) e.triggerEvent("realm:become_resident");
    } catch {
      // fine
    }
  }
  const todo = plan(rs, homes, roomByTown(t, rs).get(t.id) ?? 0, now);
  if (todo.drop.length) {
    rs = { ...rs, r: rs.r.filter((x) => !todo.drop.includes(x.s)) };
    changed = true;
  }
  let budget = SPAWNS_PER_CENSUS;
  /** @type {string[]} */
  const arrived = [];
  for (const sp of todo.spawn) {
    if (budget <= 0) break;
    const names = namesInUse(t);
    for (const x of rs.r) if (x.d === undefined) names.own.add(x.n);
    const name = pickName(CONFIG.residentNames, names.all, names.own);
    const rec = spawnResident(t, dim, rs, sp.s, sp.h, name);
    if (!rec) continue;
    rs = addNew({ ...rs, r: [...rs.r.filter((x) => x.s !== sp.s), rec].sort((a, b) => a.s - b.s) }, name);
    resCache.set(t.id, rs); // namesInUse sees the new name
    arrived.push(name);
    budget--;
    changed = true;
  }
  for (const mv of todo.move) {
    if (budget <= 0) break;
    const rec = rs.r.find((x) => x.s === mv.s);
    const old = rec?.e ? entity.get(rec.e) : undefined;
    if (!rec || !old) continue; // not loaded: it moves when it is
    const to = anchorOf(t, mv.h, mv.s);
    let from;
    try {
      from = old.location;
    } catch {
      continue;
    }
    const near = world.getAllPlayers().some((pl) => pl.dimension.id === t.dim && [from, to].some((v) => Math.hypot(pl.location.x - v.x, pl.location.z - v.z) <= MOVE_CLEAR));
    if (near) continue;
    const moved = spawnResident(t, dim, rs, mv.s, mv.h, rec.n);
    if (!moved) continue;
    untagResident(old, t.id);
    try {
      dropCarried(old); // what it picked up (a farmer's crops) stays where it stood
      old.remove(); // the same family, now at its new home
    } catch {
      // stays an ordinary villager without our tags
    }
    rs = { ...rs, r: rs.r.map((x) => (x.s === mv.s ? moved : x)) };
    budget--;
    changed = true;
  }
  if (changed) {
    saveResidents(t, rs);
    refreshBoard(t); // the resident count and the newest names
  }
  if (!arrived.length) return;
  for (const name of arrived) {
    const msg = `§aA new family moved into ${t.n}: ${name}.`;
    for (const pl of world.getAllPlayers()) if (pl.dimension.id === t.dim && Math.hypot(pl.location.x - t.x, pl.location.z - t.z) <= get("townRadius")) pl.sendMessage(msg);
  }
  storyAdd(t, arrived.length === 1 ? `A new family moved in (${arrived[0]})` : `${arrived.length} new families moved in`);
  saveTown(t);
  lifeNews(t, `fam${rs.n}`);
}

/** On the build check (every 100 ticks): the census of one town with a player in it, when its time has come. @param {Player[]} players */
function residentTick(players) {
  if (get("residents") !== true || !residentGate) return;
  const now = system.currentTick;
  for (const t of allTowns().values()) {
    if (now - (censusAt.get(t.id) ?? -CENSUS_TICKS) < CENSUS_TICKS || !playerIn(players, t)) continue;
    censusAt.set(t.id, now);
    census(t);
    return; // one town a check
  }
}

const GONE_KEY = "town:gone";
const GONE_MAX = 64;
/** Ids of removed towns whose residents may still be out in unloaded ground (O77), newest last. @returns {string[]} */
function goneTowns() {
  const v = readJson(GONE_KEY);
  return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(-GONE_MAX) : [];
}
/** @param {string[]} ids */
function saveGone(ids) {
  world.setDynamicProperty(GONE_KEY, ids.length ? JSON.stringify(ids.slice(-GONE_MAX)) : undefined);
}

/**
 * A removed town's resident moves away (O77, D78): what it carries drops where it stands, then it is removed, so no
 * villager, tag or override group of a town that is gone stays behind, and none can claim a player's bed later.
 * @param {import("@minecraft/server").Entity} e
 */
function moveAway(e) {
  try {
    dropCarried(e);
    e.remove();
  } catch (err) {
    console.warn(`[town] a resident of a removed town: ${err}`);
  }
}

/** A removed town's residents move away: those loaded now, the rest when their ground loads (town:gone). @param {Town} t */
function dropResidents(t) {
  resCache.delete(t.id);
  censusAt.delete(t.id);
  world.setDynamicProperty(RES_PREFIX + t.id, undefined);
  saveGone([...goneTowns().filter((x) => x !== t.id), t.id]);
  try {
    for (const e of world.getDimension(t.dim).getEntities({ type: VILLAGER, tags: [townTag(t.id)] })) moveAway(e);
  } catch {
    // fine: an unloaded one moves away when its ground loads (or when tapped)
  }
}

/** The town a resident belongs to, from its tags. @param {import("@minecraft/server").Entity} e */
const residentTown = (e) => e.getTags().find((tag) => tag.startsWith("town:r:"))?.slice(7);

/** Is `town` a removed town (listed in town:gone, and not added again)? @param {string | undefined} town */
const isGone = (town) => !!town && !allTowns().has(town) && goneTowns().includes(town);

// A removed town's resident that was in unloaded ground: it moves away as soon as its ground loads.
world.afterEvents.entityLoad.subscribe(({ entity }) => {
  try {
    if (entity.typeId !== VILLAGER || !entity.hasTag(RESIDENT_TAG)) return;
    const town = residentTown(entity);
    if (isGone(town)) system.run(() => entity.isValid && moveAway(entity));
  } catch {
    // unloaded again meanwhile
  }
});

// A resident died: a new family replaces it after replaceMinutes (in-game time).
world.afterEvents.entityDie.subscribe(
  ({ deadEntity }) => {
    try {
      const id = deadEntity.id;
      for (const t of allTowns().values()) {
        const rs = residentsOf(t);
        const rec = rs.r.find((x) => x.e === id && x.d === undefined);
        if (!rec) continue;
        rec.d = world.getAbsoluteTime() + replaceTicks();
        delete rec.e;
        delete rec.m;
        saveResidents(t, rs);
        return;
      }
    } catch (e) {
      console.warn(`[town] resident died: ${e}`);
    }
  },
  { entityTypes: [VILLAGER] },
);

// Trading (residentsTrade, default Disabled: it would bypass the Crowns economy): a tap on a resident is canceled.
world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  if (ev.cancel) return;
  const e = ev.target;
  if (e.typeId !== VILLAGER || get("residentsTrade") === true || !e.hasTag(RESIDENT_TAG)) return;
  const town = residentTown(e);
  const t = town ? allTowns().get(town) : undefined;
  if (!t) {
    // Its town was removed while it was far away: it moves away now (an unknown town: an ordinary villager from now on).
    if (isGone(town)) {
      ev.cancel = true;
      system.run(() => e.isValid && moveAway(e));
    } else system.run(() => town && untagResident(e, town));
    return;
  }
  ev.cancel = true;
  const player = ev.player;
  const name = e.nameTag;
  system.run(() => {
    if (!player.isValid || system.currentTick - (tapSaid.get(player.id) ?? -200) < 200) return;
    tapSaid.set(player.id, system.currentTick);
    player.sendMessage(`§7${name || "This villager"} lives in ${t.n} and doesn't trade.`);
  });
});

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
