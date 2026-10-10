import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, GameMode, ItemStack, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, getFor } from "./settings.js";
import { NPC_NAMES, PLACES, STORIES } from "./stories.js";

/** @typedef {import("./stories.js").Story} Story */
/** @typedef {import("./stories.js").Chapter} Chapter */
/** @typedef {import("./stories.js").Objective} Objective */
/** @typedef {import("./stories.js").Page} Page */
/** @typedef {import("./stories.js").Rep} Rep */
/** @typedef {import("./stories.js").Reward} Reward */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

// Each player's stories are one player property, "saga:p" -> JSON { s: { <story id>: StoryState } }.
// Chapters are saved by id: the current chapter is the first one not in `dn`, so editing stories.js
// (adding a chapter, reordering) never leaves a player pointing at a chapter that isn't there.
const PROP_PLAYER = "saga:p";
const PROP_PLACES = "saga:places"; // world: { <name>: { dim, x, y, z, by } }
const PROP_WEATHER = "saga:weather"; // world: overworld weather at the last change; scripts can't read the weather
const OVERWORLD = "minecraft:overworld";
const PACK = "saga_bp";
const LOOP_TICKS = 20; // the player loop runs once a second; the tracker every TRACKER_RUNS runs
const TRACKER_RUNS = 2;
const HINT_MS = 600000; // operator hints: at most every 10 minutes per place
const CHAMPION_TAG = "saga:champion"; // champions this pack spawned itself (no Champions pack)
const PLACED_MEMORY = 2000;

/**
 * @typedef {object} StoryState
 * @property {string[]} dn ids of the finished chapters
 * @property {number} a 1 = the current chapter was accepted and its objectives count
 * @property {string} [cur] the chapter id `o` belongs to
 * @property {number[]} o progress of each objective of `cur`
 * @property {number} t when the current chapter was accepted (the tracker follows the latest)
 * @property {Record<string, string>} f flags set by choices
 * @property {Record<string, string>} ch chapter id -> choice id picked there
 * @property {number} [fin] when the story was finished
 */
/** @typedef {{ s: Record<string, StoryState> }} Saga */
/** @typedef {{ story: Story, chapter: Chapter, index: number, st: StoryState }} Entry a chapter the player is working on */
/** @typedef {{ dim: string, x: number, y?: number, z: number, label: string }} Loc */
/** @typedef {{ dim: string, x: number, y: number, z: number, by?: string }} SavedPlace */

const storyById = new Map(STORIES.map((s) => [s.id, s]));

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** "minecraft:iron_ingot" -> "Iron Ingot". @param {string} id */
const itemName = (id) =>
  id
    .replace(/^minecraft:/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** @param {string} id */
const npcName = (id) => NPC_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);

/** @param {string} dim */
const dimName = (dim) => (dim === "minecraft:nether" ? "Nether" : dim === "minecraft:the_end" ? "End" : "Overworld");

/** @param {string} id @returns {Player | undefined} */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);

/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;

/** @param {{ x: number, z: number }} a @param {{ x: number, z: number }} b */
const across = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** "NE" for a step of dx east, dz south. @param {number} dx @param {number} dz */
function compass(dx, dz) {
  const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360 + 22.5) % 360;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.floor(deg / 45) % 8];
}

/** Sends a script event to other packs; nobody listening is fine. @param {string} id @param {object} msg */
function send(id, msg) {
  try {
    system.sendScriptEvent(id, JSON.stringify(msg));
  } catch (e) {
    console.warn(`[saga] ${id}: ${e}`);
  }
}

/** Does every flag in `when` have that value? @param {Record<string, string> | undefined} when @param {Record<string, string>} flags */
const matches = (when, flags) => !when || Object.entries(when).every(([k, v]) => flags[k] === v);

/** The pages a player sees, after flags. @param {Page[] | undefined} pages @param {Record<string, string>} flags */
const pagesFor = (pages, flags) =>
  (pages ?? []).flatMap((p) => (typeof p === "string" ? [p] : matches(p.when, flags) ? [p.text] : []));

// ---------------------------------------------------------------------------
// Crowns (the crowns scoreboard, shared with the Crowns pack)
// ---------------------------------------------------------------------------

function crownsObjective() {
  try {
    return world.scoreboard.getObjective("crowns") ?? world.scoreboard.addObjective("crowns", "Crowns");
  } catch {
    return world.scoreboard.getObjective("crowns"); // another pack added it this tick
  }
}

/** @param {Player} p @param {number} n @returns {boolean} */
function addCrowns(p, n) {
  try {
    const obj = crownsObjective();
    if (!obj) return false;
    obj.addScore(p, Math.floor(n));
    return true;
  } catch (e) {
    console.warn(`[saga] crowns: ${e}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Saved progress (cached per player)
// ---------------------------------------------------------------------------

/** @type {Map<string, Saga>} */
const cache = new Map();

/** @param {Player} player @returns {Saga} */
function sagaOf(player) {
  let saga = cache.get(player.id);
  if (saga) return saga;
  try {
    const raw = player.getDynamicProperty(PROP_PLAYER);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : undefined;
    if (parsed && typeof parsed.s === "object" && parsed.s && !Array.isArray(parsed.s)) {
      saga = /** @type {Saga} */ (parsed);
      // Drop story states that aren't objects and fill in missing lists, so a damaged save can't break the loop.
      for (const [id, st] of Object.entries(saga.s)) {
        if (!st || typeof st !== "object") delete saga.s[id];
        else {
          if (!Array.isArray(st.dn)) st.dn = [];
          if (!Array.isArray(st.o)) st.o = [];
          if (!st.f || typeof st.f !== "object") st.f = {};
          if (!st.ch || typeof st.ch !== "object") st.ch = {};
        }
      }
    }
  } catch {
    console.warn(`[saga] ${PROP_PLAYER} of ${player.name} is corrupt; starting over`);
  }
  saga ??= { s: {} };
  cache.set(player.id, saga);
  return saga;
}

/** Saves the player's stories (small: a few hundred characters). @param {Player} player */
function markDirty(player) {
  const saga = cache.get(player.id);
  if (!saga || !player.isValid) return;
  try {
    player.setDynamicProperty(PROP_PLAYER, JSON.stringify(saga));
  } catch (e) {
    console.warn(`[saga] save: ${e}`);
  }
}

/** The player's state for a story (made on first use). @param {Saga} saga @param {Story} story @returns {StoryState} */
function stateOf(saga, story) {
  let st = saga.s[story.id];
  if (!st || typeof st !== "object") st = saga.s[story.id] = { dn: [], a: 0, o: [], t: 0, f: {}, ch: {} };
  st.dn ??= [];
  st.o ??= [];
  st.f ??= {};
  st.ch ??= {};
  return st;
}

/** The chapter the player is on, or undefined when the story is finished. @param {Story} story @param {StoryState | undefined} st */
function currentChapter(story, st) {
  const index = story.chapters.findIndex((c) => !st?.dn.includes(c.id));
  return index < 0 ? undefined : { chapter: story.chapters[index], index };
}

/** @param {Story} story @param {StoryState | undefined} st */
const finished = (story, st) => !!st && !currentChapter(story, st);

/** What an objective counts up to. @param {Objective} obj */
const target = (obj) => (obj.type === "talk" || obj.type === "reach" ? 1 : obj.type === "survive" ? Math.max(1, obj.seconds ?? 60) : Math.max(1, obj.count ?? 1));

/** @param {Chapter} chapter @param {StoryState} st */
const chapterDone = (chapter, st) => chapter.objectives.every((obj, i) => (st.o[i] ?? 0) >= target(obj));

/** The chapters this player has accepted and is working on (or is ready to report back on). @param {Player} player @returns {Entry[]} */
function entries(player) {
  const saga = sagaOf(player);
  /** @type {Entry[]} */
  const out = [];
  for (const story of STORIES) {
    const st = saga.s[story.id];
    if (!st || !st.a) continue;
    const cur = currentChapter(story, st);
    if (!cur || st.cur !== cur.chapter.id) {
      // stories.js changed under this player: the chapter they accepted is gone. Offer the next one again.
      st.a = 0;
      st.o = [];
      st.cur = undefined;
      markDirty(player);
      continue;
    }
    out.push({ story, chapter: cur.chapter, index: cur.index, st });
  }
  return out;
}

/** Progress counts for this player now. @param {Player} player */
function counting(player) {
  if (!player.isValid || get("enabled") !== true) return false;
  try {
    if (get("skipCreative") === true && player.getGameMode() === GameMode.Creative) return false;
  } catch {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

/** @type {Record<string, SavedPlace> | undefined} */
let places;

/** @returns {Record<string, SavedPlace>} */
function placesOf() {
  if (places) return places;
  try {
    const raw = world.getDynamicProperty(PROP_PLACES);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : {};
    places = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {}; // world not loaded yet, or corrupt: try again next time
  }
  return /** @type {Record<string, SavedPlace>} */ (places);
}

/** @param {string} name @param {SavedPlace} spot */
function setPlace(name, spot) {
  const next = { ...placesOf(), [name]: spot };
  world.setDynamicProperty(PROP_PLACES, JSON.stringify(next));
  places = next;
}

/** @param {string} name */
const placeLabel = (name) => PLACES[name] ?? name;

/**
 * Where an objective is: a location, the name of a place nobody has set yet (a string), or
 * undefined when it has no location.
 * @param {Objective} obj @returns {Loc | string | undefined}
 */
function locate(obj) {
  if (obj.place) {
    const p = placesOf()[obj.place];
    return p ? { dim: p.dim, x: p.x, y: p.y, z: p.z, label: placeLabel(obj.place) } : obj.place;
  }
  if (obj.at) return { dim: obj.at.dim ?? OVERWORLD, x: obj.at.x, z: obj.at.z, label: obj.mark ?? obj.label };
  if (obj.offset) {
    let spawn = { x: 0, z: 0 };
    try {
      spawn = world.getDefaultSpawnLocation();
    } catch {
      // keep 0, 0
    }
    return { dim: OVERWORLD, x: Math.floor(spawn.x) + obj.offset.x, z: Math.floor(spawn.z) + obj.offset.z, label: obj.mark ?? obj.label };
  }
  return undefined;
}

/** Default radius per objective type. @param {Objective} obj */
const radiusOf = (obj) => obj.radius ?? (obj.type === "interact" ? 8 : obj.type === "defeat" ? 32 : obj.type === "survive" ? 48 : 16);

/** "NE 240m", "here" or "in the Nether" from the player to a location. @param {Player} player @param {Loc} loc @param {number} radius */
function bearing(player, loc, radius) {
  if (player.dimension.id !== loc.dim) return `in the ${dimName(loc.dim)}`;
  const p = player.location;
  const d = across(p, loc);
  if (d <= radius) return "here";
  return `${compass(loc.x - p.x, loc.z - p.z)} ${Math.round(d)}m`;
}

/** Tick until which another note owns a player's actionbar: the tracker waits. @type {Map<string, number>} */
const holdUntil = new Map();

/** Last hint per place name. @type {Map<string, number>} */
const hinted = new Map();

/** Tells operators online that `player` needs place `name` (rate limited). @param {Player} player @param {string} name @param {Story} story */
function hintOps(player, name, story) {
  if (get("opHints") !== true) return;
  const now = Date.now();
  if (now - (hinted.get(name) ?? -Infinity) < HINT_MS) return;
  for (const op of world.getAllPlayers()) {
    if (!isOp(op)) continue;
    hinted.set(name, now); // only once an operator was actually told
    op.sendMessage(`§e[Story] ${player.name} needs the place "${name}" (${placeLabel(name)}) for ${story.title}. Stand there and run /realm:saga_place ${name}`);
  }
}

/** Unset places among the unfinished objectives of a chapter. @param {Entry} e */
function missingPlaces(e) {
  /** @type {string[]} */
  const out = [];
  e.chapter.objectives.forEach((obj, i) => {
    if ((e.st.o[i] ?? 0) >= target(obj)) return;
    const loc = locate(obj);
    if (typeof loc === "string" && !out.includes(loc)) out.push(loc);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/**
 * Sets or adds progress on one objective; tells the player when it's done, and when the chapter is.
 * @param {Player} player @param {Entry} e @param {number} i @param {number} n @param {boolean} [absolute] set to n instead of adding
 */
function bump(player, e, i, n, absolute = false) {
  const obj = e.chapter.objectives[i];
  const need = target(obj);
  const before = e.st.o[i] ?? 0;
  if (before >= need) return false;
  const after = Math.max(0, Math.min(need, absolute ? Math.floor(n) : before + n));
  if (after === before) return false;
  e.st.o[i] = after;
  markDirty(player);
  if (after >= need) {
    player.sendMessage(`§a[Story] ${obj.label}: done.`);
    player.playSound("random.orb", { pitch: 1.2, volume: 0.6 });
    if (chapterDone(e.chapter, e.st)) {
      const to = e.chapter.end ?? e.chapter.npc ?? e.story.giver;
      player.sendMessage(`§6[Story] ${e.story.title}: chapter ${e.index + 1} is done. Go back to ${npcName(to)}.`);
      player.playSound("random.levelup", { pitch: 1.3, volume: 0.6 });
    }
  } else if (need >= 4 && obj.type !== "collect" && obj.type !== "deliver") {
    // A note above the hotbar at each quarter, like Daily Quests.
    const step = need / 4;
    if (Math.floor(before / step) !== Math.floor(after / step)) {
      send("realm:actionbar", { player: player.id, ticks: 40, from: PACK });
      holdUntil.set(player.id, system.currentTick + 40);
      player.onScreenDisplay.setActionBar(`§b${e.story.short}: §f${obj.label} ${after}/${need}${obj.type === "survive" ? " s" : ""}`);
    }
  }
  return true;
}

/**
 * Adds progress to every objective `amountFor` gives an amount for, in the chapters the player is
 * working on. Returns the "story:chapter:index" keys of the objectives that matched (done or not),
 * so party mates on the same chapter can share exactly those.
 * @param {Player} player
 * @param {(obj: Objective, e: Entry, i: number) => number} amountFor
 * @param {Set<string>} [only] limit to these objectives
 */
function advance(player, amountFor, only) {
  /** @type {Set<string>} */
  const keys = new Set();
  if (!counting(player)) return keys;
  for (const e of entries(player)) {
    e.chapter.objectives.forEach((obj, i) => {
      const key = `${e.story.id}:${e.chapter.id}:${i}`;
      if (only && !only.has(key)) return;
      const n = amountFor(obj, e, i);
      if (n <= 0) return;
      keys.add(key);
      bump(player, e, i, n);
    });
  }
  return keys;
}

/** Party mates (Parties pack) close enough to share progress. @param {Player} player */
function mates(player) {
  if (get("partyShare") !== true) return [];
  const tag = player.getTags().find((t) => t.startsWith("realm_party:"));
  if (!tag) return [];
  const range = get("partyRange");
  const dim = player.dimension.id;
  const at = player.location;
  return world.getAllPlayers().filter((p) => {
    if (p.id === player.id || p.dimension.id !== dim || !p.hasTag(tag)) return false;
    const l = p.location;
    return Math.hypot(l.x - at.x, l.y - at.y, l.z - at.z) <= range;
  });
}

/**
 * Gives the same progress to party mates on the same chapters, on the objectives in `keys` (each
 * mate once: `credited`).
 * @param {Player} player @param {Set<string>} keys @param {(obj: Objective, e: Entry, i: number) => number} amountFor @param {Set<string>} credited
 */
function share(player, keys, amountFor, credited) {
  if (!keys.size) return;
  for (const mate of mates(player)) {
    if (credited.has(mate.id)) continue;
    credited.add(mate.id);
    advance(mate, amountFor, keys);
  }
}

// ---------------------------------------------------------------------------
// Weather (overworld): the stable API can't read it, so remember the last change
// ---------------------------------------------------------------------------

let weather = "Clear";
world.afterEvents.weatherChange.subscribe(({ dimension, newWeather }) => {
  if (dimension !== OVERWORLD) return;
  weather = newWeather;
  try {
    world.setDynamicProperty(PROP_WEATHER, newWeather);
  } catch (e) {
    console.warn(`[saga] ${e}`);
  }
});

world.afterEvents.worldLoad.subscribe(() => {
  try {
    const saved = world.getDynamicProperty(PROP_WEATHER);
    if (saved === "Rain" || saved === "Thunder") weather = saved;
  } catch (e) {
    console.warn(`[saga] ${e}`);
  }
  // Champions this pack spawned itself don't outlive a restart: the next visit asks for a new one.
  for (const id of [OVERWORLD, "minecraft:nether", "minecraft:the_end"]) {
    try {
      for (const ent of world.getDimension(id).getEntities({ tags: [CHAMPION_TAG] })) ent.remove();
    } catch (e) {
      console.warn(`[saga] cleanup: ${e}`);
    }
  }
  checkStories();
});

/** Nothing over the player's head (the sky can see them). @param {Player} player */
function outdoors(player) {
  try {
    const at = player.location;
    const top = player.dimension.getTopmostBlock({ x: Math.floor(at.x), z: Math.floor(at.z) });
    // Tall grass or a flower at your feet is fine; a block 2 over your feet is a roof.
    return !top || top.location.y <= Math.floor(at.y) + 1;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Champions (Champions pack, or our own fallback)
// ---------------------------------------------------------------------------

/** Champion tag -> time (ms) it may be asked for again. @type {Map<string, number>} */
const championNext = new Map();
/** Champion tags our stories use. */
const championTags = new Set(STORIES.flatMap((s) => s.chapters.flatMap((c) => c.objectives.map((o) => o.champion?.tag ?? ""))).filter(Boolean));

/** Asks for the story champion when the player comes close to its place. @param {Player} player @param {Objective} obj */
function championNear(player, obj) {
  const champ = obj.champion;
  if (!champ) return;
  const loc = locate(obj);
  if (!loc || typeof loc === "string" || player.dimension.id !== loc.dim) return;
  if (across(player.location, loc) > radiusOf(obj)) return;
  const now = Date.now();
  if ((championNext.get(champ.tag) ?? 0) > now) return;
  const dim = player.dimension;
  const at = { x: loc.x + 0.5, y: loc.y ?? player.location.y, z: loc.z + 0.5 };
  if (championAlive(champ.tag, dim)) {
    championNext.set(champ.tag, now + 10000);
    return;
  }
  championNext.set(champ.tag, now + get("championRetrySeconds") * 1000);
  send("realm:champion_spawn", { dim: loc.dim, x: at.x, y: at.y, z: at.z, mob: champ.mob, trait: champ.trait, name: champ.name, tag: champ.tag });
  if (champ.warn) player.sendMessage(`§c[Story] ${champ.warn}`);
  // No Champions pack? Spawn a tougher named mob ourselves, so the story can still be finished.
  system.runTimeout(() => {
    try {
      if (get("championFallback") !== true || championAlive(champ.tag, dim)) return;
      const mob = dim.spawnEntity(champ.mob, at);
      mob.nameTag = `§c${champ.name}`;
      mob.addTag(CHAMPION_TAG);
      mob.addTag(champ.tag);
      const long = 20000000; // as long as the game allows: the mob is removed on the next restart anyway
      mob.addEffect("health_boost", long, { amplifier: 4, showParticles: false });
      mob.addEffect("resistance", long, { amplifier: 1, showParticles: false });
      mob.addEffect("strength", long, { amplifier: 1, showParticles: false });
      mob.addEffect("regeneration", 100, { amplifier: 4, showParticles: false }); // fill up the boosted health
    } catch (e) {
      console.warn(`[saga] champion fallback: ${e}`);
    }
  }, 60);
}

/**
 * Is a champion with this tag loaded anywhere in the dimension? (Not only near its place: a drowned
 * can swim a long way, and a second one must not come while it's alive.)
 * @param {string} tag @param {import("@minecraft/server").Dimension} dim
 */
function championAlive(tag, dim) {
  try {
    return dim.getEntities({ tags: [tag] }).length > 0;
  } catch {
    return false;
  }
}

/**
 * A story champion died: credit the killer, the helpers and their party mates on that objective.
 * @param {string} tag @param {string[]} ids @param {Vector3 | undefined} at @param {string | undefined} dim
 */
function championSlain(tag, ids, at, dim) {
  /** @param {Objective} obj */
  const amountFor = (obj) => (obj.type === "defeat" && obj.champion?.tag === tag ? 1 : 0);
  /** @type {Set<string>} */
  const credited = new Set();
  /** @type {Player[]} */
  const players = [];
  for (const id of ids) {
    const p = online(id);
    if (p && !credited.has(p.id)) {
      credited.add(p.id);
      players.push(p);
    }
  }
  // Everyone close by working on it counts as a helper, so a shared fight is never lost.
  if (at && dim) {
    for (const p of world.getAllPlayers()) {
      if (credited.has(p.id) || p.dimension.id !== dim) continue;
      const l = p.location;
      if (Math.hypot(l.x - at.x, l.y - at.y, l.z - at.z) > 32) continue;
      credited.add(p.id);
      players.push(p);
    }
  }
  for (const p of players) share(p, advance(p, amountFor), amountFor, credited);
}

// ---------------------------------------------------------------------------
// Events that count
// ---------------------------------------------------------------------------

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  try {
    if (deadEntity instanceof Player) return;
    let tags = /** @type {string[]} */ ([]);
    let at;
    let dim;
    try {
      tags = deadEntity.getTags();
      at = deadEntity.location;
      dim = deadEntity.dimension.id;
    } catch {
      // gone already
    }
    const killer = damageSource.damagingEntity;
    if (tags.includes(CHAMPION_TAG)) {
      const tag = tags.find((t) => championTags.has(t));
      if (tag) championSlain(tag, killer instanceof Player ? [killer.id] : [], at, dim);
      return;
    }
    if (!(killer instanceof Player)) return;
    const type = deadEntity.typeId;
    /** @param {Objective} obj */
    const amountFor = (obj) => (obj.type === "defeat" && !obj.champion && (!obj.mobs?.length || obj.mobs.includes(type)) ? 1 : 0);
    const credited = new Set([killer.id]);
    share(killer, advance(killer, amountFor), amountFor, credited);
  } catch (e) {
    console.warn(`[saga] ${e}`);
  }
});

/** Blocks players placed lately, "dim:x,y,z": breaking one again isn't mining. @type {Set<string>} */
const placed = new Set();
/** @param {string} dim @param {Vector3} p */
const spot = (dim, p) => `${dim}:${p.x},${p.y},${p.z}`;

world.afterEvents.playerPlaceBlock.subscribe(({ block }) => {
  try {
    const key = spot(block.dimension.id, block.location);
    placed.delete(key);
    placed.add(key);
    if (placed.size > PLACED_MEMORY) placed.delete(/** @type {string} */ (placed.values().next().value));
  } catch {
    // ignore
  }
});

world.afterEvents.playerBreakBlock.subscribe(({ player, block, brokenBlockPermutation }) => {
  try {
    if (placed.delete(spot(block.dimension.id, block.location))) return;
    const id = brokenBlockPermutation.type.id;
    advance(player, (obj) => (obj.type === "mine" && (!obj.blocks?.length || obj.blocks.includes(id)) ? 1 : 0));
  } catch (e) {
    console.warn(`[saga] ${e}`);
  }
});

/** A tap or a hit on a block counts for interact objectives. @param {Player} player @param {import("@minecraft/server").Block} block */
function interacted(player, block) {
  const type = block.typeId;
  const dim = block.dimension.id;
  const b = block.location;
  advance(player, (obj) => {
    if (obj.type !== "interact" || !obj.blocks?.includes(type)) return 0;
    const loc = locate(obj);
    if (!loc || typeof loc === "string") return obj.place ? 0 : 1; // no place given: anywhere counts
    if (loc.dim !== dim) return 0;
    const d = loc.y === undefined ? across(b, loc) : Math.hypot(b.x - loc.x, b.y - loc.y, b.z - loc.z);
    return d <= radiusOf(obj) ? 1 : 0;
  });
}

world.afterEvents.playerInteractWithBlock.subscribe(({ player, block, isFirstEvent }) => {
  if (!isFirstEvent) return;
  try {
    interacted(player, block);
  } catch (e) {
    console.warn(`[saga] ${e}`);
  }
});

/** Tick of each player's last counted hit: holding the button down is one strike, not many. @type {Map<string, number>} */
const lastHit = new Map();

// "Strike the bell": most players hit it rather than use it, so a hit counts like a tap.
world.afterEvents.entityHitBlock.subscribe(({ damagingEntity, hitBlock }) => {
  if (!(damagingEntity instanceof Player)) return;
  try {
    const now = system.currentTick;
    if (now - (lastHit.get(damagingEntity.id) ?? -100) < 6) return;
    lastHit.set(damagingEntity.id, now);
    interacted(damagingEntity, hitBlock);
  } catch (e) {
    console.warn(`[saga] ${e}`);
  }
});

/** Does the player have an unfinished objective of this type? @param {Player} player @param {Objective["type"]} type */
function wants(player, type) {
  return entries(player).some((e) => e.chapter.objectives.some((obj, i) => obj.type === type && (e.st.o[i] ?? 0) < target(obj)));
}

// Fishing, as Daily Quests does it: a hook belongs to the player nearest to where it appears, and an
// item that appears where a hook just was is that player's catch.
/** @type {Map<string, { hook: import("@minecraft/server").Entity, owner: Player, dim: string, at: Vector3, seen: number }>} */
const hooks = new Map();

world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  try {
    if (entity.typeId === "minecraft:fishing_hook") {
      const [owner] = entity.dimension.getPlayers({ location: entity.location, maxDistance: 4, closest: 1 });
      if (owner && wants(owner, "fish")) hooks.set(entity.id, { hook: entity, owner, dim: entity.dimension.id, at: entity.location, seen: system.currentTick });
      return;
    }
    if (entity.typeId !== "minecraft:item" || !hooks.size) return;
    const stack = entity.getComponent("minecraft:item")?.itemStack;
    if (!stack) return;
    const at = entity.location;
    for (const [id, h] of hooks) {
      if (h.dim !== entity.dimension.id) continue;
      if (Math.abs(h.at.x - at.x) > 3 || Math.abs(h.at.y - at.y) > 3 || Math.abs(h.at.z - at.z) > 3) continue;
      hooks.delete(id);
      const type = stack.typeId;
      const amount = stack.amount;
      if (h.owner.isValid) advance(h.owner, (obj) => (obj.type === "fish" && (!obj.items?.length || obj.items.includes(type)) ? amount : 0));
      break;
    }
  } catch (e) {
    console.warn(`[saga] ${e}`);
  }
});

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
}, 2);

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

/** @param {Player} player @param {string} item */
function countItem(player, item) {
  let n = 0;
  try {
    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) return 0;
    for (let i = 0; i < inv.size; i++) {
      const stack = inv.getItem(i);
      if (stack?.typeId === item) n += stack.amount;
    }
  } catch (e) {
    console.warn(`[saga] ${e}`);
  }
  return n;
}

/** Takes up to `max` of an item; renamed items are never taken. Returns how many were taken. @param {Player} player @param {string} item @param {number} max */
function takeItem(player, item, max) {
  let taken = 0;
  try {
    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) return 0;
    for (let i = 0; i < inv.size && taken < max; i++) {
      const stack = inv.getItem(i);
      if (!stack || stack.typeId !== item || stack.nameTag) continue;
      const k = Math.min(stack.amount, max - taken);
      if (k >= stack.amount) inv.setItem(i, undefined);
      else {
        stack.amount -= k;
        inv.setItem(i, stack);
      }
      taken += k;
    }
  } catch (e) {
    console.warn(`[saga] take ${item}: ${e}`);
  }
  return taken;
}

/** Gives an item stack by stack; what doesn't fit drops at the player's feet. Returns true if some dropped. @param {Player} player @param {string} item @param {number} amount */
function giveItem(player, item, amount) {
  let dropped = false;
  let left = Math.max(1, Math.floor(amount));
  const inv = player.getComponent("minecraft:inventory")?.container;
  const max = new ItemStack(item, 1).maxAmount;
  while (left > 0) {
    const stack = new ItemStack(item, Math.min(max, left));
    left -= stack.amount;
    const rest = inv ? inv.addItem(stack) : stack;
    if (rest) {
      player.dimension.spawnItem(rest, player.location);
      dropped = true;
    }
  }
  return dropped;
}

// ---------------------------------------------------------------------------
// The player loop: reach, survive, collect, champions, operator hints, the tracker
// ---------------------------------------------------------------------------

let runs = 0;
system.runInterval(() => {
  runs++;
  if (get("enabled") !== true) return;
  const tracking = runs % TRACKER_RUNS === 0;
  /** Players already given survive time this run (themselves or as a party mate). @type {Set<string>} */
  const survived = new Set();
  /** @type {Player[]} */
  const stormy = [];
  for (const player of world.getAllPlayers()) {
    try {
      const list = entries(player);
      if (!list.length) continue;
      for (const e of list) for (const name of missingPlaces(e)) hintOps(player, name, e.story);
      if (counting(player)) {
        // Reach: standing within the radius. Party mates on the same chapter get it too.
        /** @param {Objective} obj @param {Entry} _e @param {number} _i */
        const reachHere = (obj, _e, _i) => {
          if (obj.type !== "reach") return 0;
          const loc = locate(obj);
          return loc && typeof loc !== "string" && loc.dim === player.dimension.id && across(player.location, loc) <= radiusOf(obj) ? 1 : 0;
        };
        const reached = advance(player, reachHere);
        if (reached.size) share(player, reached, (obj) => (obj.type === "reach" ? 1 : 0), new Set([player.id]));
        // Collect: what's in the inventory now.
        for (const e of list) {
          e.chapter.objectives.forEach((obj, i) => {
            if (obj.type === "collect" && obj.item && (e.st.o[i] ?? 0) < target(obj)) bump(player, e, i, countItem(player, obj.item), true);
          });
        }
        // Champions: ask for one when the player comes near its place.
        for (const e of list) {
          e.chapter.objectives.forEach((obj, i) => {
            if (obj.champion && (e.st.o[i] ?? 0) < target(obj)) championNear(player, obj);
          });
        }
        if (weather === "Thunder" && player.dimension.id === OVERWORLD && wants(player, "survive") && outdoors(player)) stormy.push(player);
      }
      if (tracking && getFor(player, "tracker") === true) track(player, list);
    } catch (e) {
      console.warn(`[saga] ${e}`);
    }
  }
  // Survive: a second of storm watch for everyone out in it, then the same for party mates who
  // weren't (each player once).
  const seconds = LOOP_TICKS / 20;
  /** @type {[Player, Set<string>][]} */
  const watched = [];
  for (const player of stormy) {
    /** @param {Objective} obj */
    const here = (obj) => {
      if (obj.type !== "survive") return 0;
      if (!obj.place && !obj.at && !obj.offset) return seconds;
      const loc = locate(obj);
      return loc && typeof loc !== "string" && loc.dim === player.dimension.id && across(player.location, loc) <= radiusOf(obj) ? seconds : 0;
    };
    const keys = advance(player, here);
    if (!keys.size) continue;
    survived.add(player.id);
    watched.push([player, keys]);
  }
  for (const [player, keys] of watched) share(player, keys, (obj) => (obj.type === "survive" ? seconds : 0), survived);
}, LOOP_TICKS);

/** The tracker: where to go for the latest chapter with a place to be. @param {Player} player @param {Entry[]} list */
function track(player, list) {
  // Another pack's note (a quest, a bounty, mob health) is showing: don't write over it.
  if (system.currentTick < (holdUntil.get(player.id) ?? 0)) return;
  const sorted = [...list].sort((a, b) => b.st.t - a.st.t);
  for (const e of sorted) {
    /** @type {string | undefined} */
    let text;
    let best = Infinity;
    e.chapter.objectives.forEach((obj, i) => {
      if ((e.st.o[i] ?? 0) >= target(obj)) return;
      const loc = locate(obj);
      if (loc === undefined) return;
      if (typeof loc === "string") {
        if (best === Infinity && !text) text = `§7ask an operator to set place ${loc}`;
        return;
      }
      // The nearest spot in the player's dimension first.
      const d = loc.dim === player.dimension.id ? across(player.location, loc) : 1e9;
      if (d < best) {
        best = d;
        text = `§f${loc.label} ${bearing(player, loc, radiusOf(obj))}`;
      }
    });
    if (!text) continue;
    send("realm:actionbar", { player: player.id, ticks: 50, from: PACK });
    player.onScreenDisplay.setActionBar(`§b${e.story.short}: ${text}`);
    return;
  }
}

// ---------------------------------------------------------------------------
// Townsfolk: offers, talk and deliver objectives
// ---------------------------------------------------------------------------

/**
 * What a story offers this player at this NPC: start a chapter, report back, or a reminder.
 * @param {Player} player @param {Story} story @param {string} npc @returns {{ key: string, label: string } | undefined}
 */
function offerFor(player, story, npc) {
  const st = sagaOf(player).s[story.id];
  const cur = currentChapter(story, st);
  if (!cur) return undefined;
  const { chapter, index } = cur;
  const starter = chapter.npc ?? story.giver;
  const ender = chapter.end ?? starter;
  const second = index > 0 ? `\n§8Chapter ${index + 1}: ${chapter.title}` : "";
  if (!st || !st.a || st.cur !== chapter.id) {
    return starter === npc ? { key: `start:${story.id}`, label: `Story: ${story.title}${second}` } : undefined;
  }
  if (chapterDone(chapter, st) && ender === npc) return { key: `end:${story.id}`, label: `Story: ${story.title}\n§8Chapter ${index + 1} done: report back` };
  if (starter === npc || ender === npc) return { key: `info:${story.id}`, label: `Story: ${story.title}\n§8Chapter ${index + 1}: ${chapter.title}` };
  return undefined;
}

/** realm:npc_talk: count talk and deliver objectives, then answer with our offers. @param {any} msg */
function onTalk(msg) {
  if (typeof msg.player !== "string" || typeof msg.npc !== "string") return;
  if (get("enabled") !== true) return;
  const player = online(msg.player);
  if (!player) return;
  const npc = msg.npc;
  if (counting(player)) {
    for (const e of entries(player)) {
      e.chapter.objectives.forEach((obj, i) => {
        if (obj.npc !== npc) return;
        if (obj.type === "talk") bump(player, e, i, 1);
        if (obj.type === "deliver" && obj.item) {
          const need = target(obj) - (e.st.o[i] ?? 0);
          if (need <= 0) return;
          const got = takeItem(player, obj.item, need);
          const name = itemName(obj.item);
          if (got > 0) {
            player.sendMessage(`§e[Story] You give ${npcName(npc)} ${got} ${name} (${(e.st.o[i] ?? 0) + got}/${target(obj)}).`);
            bump(player, e, i, got);
          } else player.sendMessage(`§7[Story] ${npcName(npc)} still needs ${need} ${name}. Renamed items are never taken.`);
        }
      });
    }
  }
  if (typeof msg.req !== "string") return;
  for (const story of STORIES) {
    const offer = offerFor(player, story, npc);
    if (offer) send("realm:npc_offer", { req: msg.req, pack: PACK, key: offer.key, label: offer.label, order: CONFIG.offerOrder });
  }
}

/** realm:npc_choose: the player picked one of our offers. @param {any} msg */
function onChoose(msg) {
  if (msg.pack !== PACK || typeof msg.player !== "string" || typeof msg.key !== "string") return;
  const player = online(msg.player);
  if (!player) return;
  const [kind, id] = msg.key.split(":");
  const story = storyById.get(id ?? "");
  if (!story) return;
  const run = kind === "start" ? startChapter : kind === "end" ? endChapter : kind === "info" ? chapterInfo : undefined;
  if (run) run(player, story).catch((e) => console.warn(`[saga] ${e}`));
}

// ---------------------------------------------------------------------------
// Dialogues
// ---------------------------------------------------------------------------

/** Players in one of our dialogues: one at a time. @type {Set<string>} */
const busy = new Set();

/** Shows a form, retrying while the player is busy (another menu just closed). @param {Player} player @param {ActionFormData} form */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await new Promise((r) => system.runTimeout(() => r(undefined), 10));
  }
  return undefined;
}

/**
 * Pages one at a time with "Next"; the last page has `buttons`. Returns the button picked on the
 * last page, or -1 when the player closed it.
 * @param {Player} player @param {string} title @param {string} header @param {string[]} pages @param {string[]} buttons
 */
async function dialog(player, title, header, pages, buttons) {
  const list = pages.length ? pages : [""];
  for (let i = 0; i < list.length; i++) {
    const last = i === list.length - 1;
    const form = new ActionFormData().title(title).body(`${header}\n\n${list[i]}`);
    for (const b of last ? buttons : ["Next"]) form.button(b);
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined) return -1;
    if (last) return res.selection;
  }
  return -1;
}

/** "Chapter 2 of 6: The Drowned Choir" @param {Story} story @param {number} index */
const chapterHeader = (story, index) => `§7Chapter ${index + 1} of ${story.chapters.length}: ${story.chapters[index].title}§r`;

/** Runs a dialogue unless the player is already in one. @param {Player} player @param {() => Promise<void>} fn */
async function exclusive(player, fn) {
  if (busy.has(player.id)) return;
  busy.add(player.id);
  try {
    await fn();
  } finally {
    busy.delete(player.id);
  }
}

/** The intro of the next chapter, and accepting it. @param {Player} player @param {Story} story */
function startChapter(player, story) {
  return exclusive(player, async () => {
    const saga = sagaOf(player);
    const st = stateOf(saga, story);
    const cur = currentChapter(story, st);
    if (!cur || (st.a && st.cur === cur.chapter.id)) return;
    const pick = await dialog(player, story.title, chapterHeader(story, cur.index), pagesFor(cur.chapter.intro, st.f), ["Accept", "Not now"]);
    if (pick !== 0 || !player.isValid) return;
    // Check again: the form was open for a while.
    const again = currentChapter(story, st);
    if (!again || again.chapter.id !== cur.chapter.id || (st.a && st.cur === cur.chapter.id)) return;
    st.a = 1;
    st.cur = cur.chapter.id;
    st.o = cur.chapter.objectives.map(() => 0);
    st.t = Date.now();
    markDirty(player);
    player.sendMessage(`§6[Story] ${story.title}, chapter ${cur.index + 1}: ${cur.chapter.title}`);
    for (const obj of cur.chapter.objectives) player.sendMessage(`§e - ${obj.label}`);
    player.sendMessage("§7See your progress with /realm:saga");
    player.playSound("random.orb", { pitch: 0.8, volume: 0.7 });
    const e = { story, chapter: cur.chapter, index: cur.index, st };
    for (const name of missingPlaces(e)) {
      player.sendMessage(`§c[Story] This chapter needs the place "${placeLabel(name)}", which isn't set yet: ask an operator to set place ${name}.`);
      hintOps(player, name, story);
    }
  });
}

/** Objective lines with progress, for the log and reminders. @param {Player} player @param {Chapter} chapter @param {StoryState} st */
function objectiveLines(player, chapter, st) {
  return chapter.objectives.map((obj, i) => {
    const n = st.o[i] ?? 0;
    const need = target(obj);
    if (n >= need) return `§a[Done] ${obj.label}§r`;
    let line = `§e- ${obj.label}§r`;
    if (need > 1) line += ` §f${n}/${need}${obj.type === "survive" ? " s" : ""}`;
    const loc = locate(obj);
    if (typeof loc === "string") line += `\n  §c(ask an operator to set place ${loc})`;
    else if (loc) line += ` §7(${bearing(player, loc, radiusOf(obj))})`;
    if (obj.type === "survive" && weather !== "Thunder") line += "\n  §7Wait for a thunderstorm.";
    return `${line}§r`;
  });
}

/** A reminder from the NPC mid-chapter: objectives, and the intro again. @param {Player} player @param {Story} story */
function chapterInfo(player, story) {
  return exclusive(player, async () => {
    const st = stateOf(sagaOf(player), story);
    const cur = currentChapter(story, st);
    if (!cur || !st.a) return;
    const body = [chapterHeader(story, cur.index), "", ...objectiveLines(player, cur.chapter, st)].join("\n");
    const res = await show(player, new ActionFormData().title(story.title).body(body).button("Hear it again").button("OK"));
    if (!res || res.canceled || res.selection !== 0) return;
    await dialog(player, story.title, chapterHeader(story, cur.index), pagesFor(cur.chapter.intro, st.f), ["OK"]);
  });
}

/** The outro, the choice, the rewards. @param {Player} player @param {Story} story */
function endChapter(player, story) {
  return exclusive(player, async () => {
    const st = stateOf(sagaOf(player), story);
    const cur = currentChapter(story, st);
    if (!cur || !st.a || st.cur !== cur.chapter.id || !chapterDone(cur.chapter, st)) return;
    const { chapter, index } = cur;
    const choices = chapter.choices ?? [];
    const buttons = choices.length ? choices.map((c) => c.label) : [index === story.chapters.length - 1 ? "Finish the story" : "Finish the chapter"];
    const pick = await dialog(player, story.title, chapterHeader(story, index), pagesFor(chapter.outro, st.f), buttons);
    if (pick < 0 || !player.isValid) return;
    // Check again before paying out: the form was open for a while.
    const again = currentChapter(story, st);
    if (!again || again.chapter.id !== chapter.id || !st.a || !chapterDone(chapter, st)) return;
    const choice = choices[pick];
    if (choice) {
      Object.assign(st.f, choice.set ?? {});
      st.ch[chapter.id] = choice.id;
      giveRep(player, choice.rep, st.f, story);
    }
    giveRep(player, chapter.rep, st.f, story);
    st.dn.push(chapter.id);
    st.a = 0;
    st.cur = undefined;
    st.o = [];
    const next = currentChapter(story, st);
    if (!next) st.fin = Date.now();
    markDirty(player);
    const got = reward(player, chapter.reward, story);
    player.sendMessage(`§a[Story] Chapter complete: ${chapter.title}!${got ? ` §7Reward: ${got}` : ""}`);
    send("realm:quest_done", { player: player.id, pack: PACK, id: `${story.id}:${chapter.id}`, label: `${story.title}: ${chapter.title}`, kind: "story" });
    if (next) {
      const who = next.chapter.npc ?? story.giver;
      player.sendMessage(`§e[Story] Next: talk to ${npcName(who)} for chapter ${next.index + 1}, ${next.chapter.title}.`);
      player.playSound("random.levelup", { pitch: 1, volume: 0.8 });
    } else {
      player.sendMessage(`§6[Story] Story complete: ${story.title}!`);
      player.playSound("random.levelup", { pitch: 0.7, volume: 1 });
    }
    if (choice?.reply?.length) await dialog(player, story.title, chapterHeader(story, index), pagesFor(choice.reply, st.f), ["OK"]);
  });
}

/** @param {Player} player @param {Rep[] | undefined} reps @param {Record<string, string>} flags @param {Story} story */
function giveRep(player, reps, flags, story) {
  for (const r of reps ?? []) {
    if (matches(r.when, flags)) send("realm:rep_add", { player: player.id, guild: r.guild, amount: r.amount, reason: `Story: ${story.title}` });
  }
}

/** Gives a chapter's reward; returns what this pack gave itself, e.g. "5 levels, 2 Golden Apple". @param {Player} player @param {Reward | undefined} r @param {Story} story */
function reward(player, r, story) {
  if (!r) return "";
  /** @type {string[]} */
  const given = [];
  try {
    if (r.levels && r.levels > 0) {
      player.addLevels(r.levels);
      given.push(`${r.levels} level${r.levels === 1 ? "" : "s"}`);
    }
  } catch (e) {
    console.warn(`[saga] levels: ${e}`);
  }
  for (const it of r.items ?? []) {
    try {
      const dropped = giveItem(player, it.item, it.amount);
      given.push(`${it.amount} ${itemName(it.item)}${dropped ? " (some dropped at your feet: your inventory is full)" : ""}`);
    } catch (e) {
      console.warn(`[saga] reward ${it.item}: ${e}`);
    }
  }
  if (r.crowns && r.crowns > 0 && addCrowns(player, r.crowns)) player.sendMessage(`§6+${r.crowns} Crowns §7(Story: ${story.title})`);
  // These belong to other packs, which tell the player themselves (nothing happens without them).
  if (r.relic) send("realm:relic_give", { player: player.id, relic: r.relic });
  if (r.title) send("realm:title_unlock", { player: player.id, title: r.title, from: PACK });
  if (r.journal) send("realm:journal", { player: player.id, page: "story", entry: r.journal.entry, label: r.journal.label });
  return given.join(", ");
}

// ---------------------------------------------------------------------------
// The story log (/realm:saga)
// ---------------------------------------------------------------------------

/** @param {Story} story @param {StoryState} st */
function choicesMade(story, st) {
  /** @type {string[]} */
  const out = [];
  for (const c of story.chapters) {
    const id = st.ch[c.id];
    const choice = id ? c.choices?.find((x) => x.id === id) : undefined;
    if (choice) out.push(`${c.title}: ${choice.label}`);
  }
  return out;
}

/** One story's lines in the log. @param {Player} player @param {Story} story @param {StoryState | undefined} st */
function storyLines(player, story, st) {
  const cur = currentChapter(story, st);
  if (!st || (!st.a && !st.dn.length)) {
    if (!cur) return [];
    return [`§f${story.title}§r`, `§7Talk to ${npcName(story.giver)} to begin.`];
  }
  if (!cur) {
    const made = choicesMade(story, st);
    return [`§a${story.title} (finished)§r`, ...made.map((m) => `§7You chose: ${m}`)];
  }
  const lines = [`§e${story.title}§r`, chapterHeader(story, cur.index)];
  if (!st.a || st.cur !== cur.chapter.id) lines.push(`§7Talk to ${npcName(cur.chapter.npc ?? story.giver)} to begin it.`);
  else {
    lines.push(...objectiveLines(player, cur.chapter, st));
    if (chapterDone(cur.chapter, st)) lines.push(`§6All done: go back to ${npcName(cur.chapter.end ?? cur.chapter.npc ?? story.giver)}.`);
  }
  for (const m of choicesMade(story, st)) lines.push(`§7You chose: ${m}`);
  return lines;
}

/** @param {Player} player */
async function showLog(player) {
  const saga = sagaOf(player);
  entries(player); // tidies chapters that vanished from stories.js
  /** @type {string[]} */
  const going = [];
  /** @type {string[]} */
  const available = [];
  /** @type {string[]} */
  const done = [];
  /** @type {Story[]} */
  const open = [];
  for (const story of STORIES) {
    const st = saga.s[story.id];
    const lines = storyLines(player, story, st);
    if (!lines.length) continue;
    if (finished(story, st)) done.push(lines.join("\n"));
    else if (!st || (!st.a && !st.dn.length)) available.push(lines.join("\n"));
    else {
      going.push(lines.join("\n"));
      open.push(story);
    }
  }
  /** @type {string[]} */
  const parts = [];
  if (get("enabled") !== true) parts.push("§cStories are paused by an operator: nothing counts for now.§r");
  if (going.length) parts.push("§lIn progress§r", ...going);
  if (available.length) parts.push("§lAvailable§r", ...available);
  if (done.length) parts.push("§lFinished§r", ...done);
  if (!parts.length) parts.push("No stories yet.");
  const form = new ActionFormData().title("§lStory Log").body(parts.join("\n\n"));
  for (const story of open) form.button(`Read: ${story.title}`);
  form.button("Close");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  const story = open[res.selection];
  if (!story) return;
  // Read the current chapter's intro again, and what happened so far.
  await exclusive(player, async () => {
    const st = stateOf(saga, story);
    const cur = currentChapter(story, st);
    if (!cur) return;
    const pages = st.a && st.cur === cur.chapter.id ? pagesFor(cur.chapter.intro, st.f) : ["You haven't started this chapter yet."];
    await dialog(player, story.title, chapterHeader(story, cur.index), pages, ["OK"]);
  });
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const PLACE_NAMES = Object.keys(PLACES);

/** Which stories use a place, for the operators' list. @param {string} name */
const usedBy = (name) => STORIES.filter((s) => s.chapters.some((c) => c.objectives.some((o) => o.place === name))).map((s) => s.title);

/** What players must find at a place (blocks they tap or hit there), for the operator setting it. @param {string} name */
function placeNeeds(name) {
  /** @type {string[]} */
  const out = [];
  for (const s of STORIES)
    for (const c of s.chapters)
      for (const o of c.objectives) {
        if (o.place !== name || o.type !== "interact" || !o.blocks?.length) continue;
        const what = o.blocks.map(itemName).join(" or ");
        out.push(`${s.title} needs a ${what} within ${radiusOf(o)} blocks of this spot: players strike it (${o.label}). Place one if there isn't one.`);
      }
  return out;
}

/** @param {Player} player */
function listPlaces(player) {
  const saved = placesOf();
  const names = [...new Set([...PLACE_NAMES, ...Object.keys(saved)])];
  const lines = names.map((n) => {
    const p = saved[n];
    const where = p ? `§a${p.x} ${p.y} ${p.z} in the ${dimName(p.dim)}${p.by ? ` (set by ${p.by})` : ""}` : "§cnot set";
    const users = usedBy(n);
    return `§e${n}§r (${placeLabel(n)}): ${where}${users.length ? ` §7- ${users.join(", ")}` : ""}`;
  });
  player.sendMessage(`§6Story places:§r\n${lines.join("\n")}\n§7Set one where you stand: /realm:saga_place <name>`);
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerEnum("realm:saga_place_name", PLACE_NAMES);
  customCommandRegistry.registerCommand(
    {
      name: "realm:saga",
      description: "Story Questlines: your story log: chapters, objectives and choices",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => showLog(player).catch((e) => console.warn(`[saga] ${e}`)));
      return { status: CustomCommandStatus.Success };
    },
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:saga_place",
      description: "Story Questlines (operators): set a story place where you stand, or list them",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      optionalParameters: [{ name: "realm:saga_place_name", type: CustomCommandParamType.Enum }],
    },
    (origin, name) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => {
        try {
          if (typeof name !== "string" || !name) return listPlaces(player);
          const l = player.location;
          const spot = { dim: player.dimension.id, x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z), by: player.name };
          setPlace(name, spot);
          player.sendMessage(`§a[Story] Place "${name}" (${placeLabel(name)}) set to ${spot.x} ${spot.y} ${spot.z} in the ${dimName(spot.dim)}.`);
          for (const need of placeNeeds(name)) player.sendMessage(`§e[Story] ${need}`);
          hinted.delete(name);
        } catch (e) {
          console.warn(`[saga] place: ${e}`);
          player.sendMessage("§c[Story] Couldn't save the place.");
        }
      });
      return { status: CustomCommandStatus.Success };
    },
  );
  customCommandRegistry.registerCommand(
    {
      name: "realm:saga_reset",
      description: "Story Questlines (operators): reset a player's stories, choices and progress",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "player", type: CustomCommandParamType.PlayerSelector }],
    },
    (origin, targets) => {
      const list = Array.isArray(targets) ? targets.filter((t) => t instanceof Player) : [];
      if (!list.length) return { status: CustomCommandStatus.Failure, message: "No player matched." };
      const by = origin.initiator ?? origin.sourceEntity;
      system.run(() => {
        for (const p of list) {
          try {
            cache.delete(p.id);
            p.setDynamicProperty(PROP_PLAYER, undefined);
            p.sendMessage("§e[Story] Your stories were reset by an operator.");
          } catch (e) {
            console.warn(`[saga] reset: ${e}`);
          }
        }
        if (by instanceof Player) by.sendMessage(`§a[Story] Reset the stories of ${list.map((p) => p.name).join(", ")}.`);
      });
      return { status: CustomCommandStatus.Success };
    },
  );
});

// ---------------------------------------------------------------------------
// Script events and housekeeping
// ---------------------------------------------------------------------------

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:npc_talk" && id !== "realm:npc_choose" && id !== "realm:champion_slain" && id !== "realm:actionbar") return;
    /** @type {any} */
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    try {
      if (id === "realm:actionbar") {
        if (msg.from !== PACK && typeof msg.player === "string" && typeof msg.ticks === "number" && msg.ticks > 0)
          holdUntil.set(msg.player, system.currentTick + Math.min(200, msg.ticks));
      } else if (id === "realm:npc_talk") onTalk(msg);
      else if (id === "realm:npc_choose") onChoose(msg);
      else if (typeof msg.tag === "string" && championTags.has(msg.tag)) {
        const ids = [msg.player, ...(Array.isArray(msg.helpers) ? msg.helpers : [])].filter((x) => typeof x === "string");
        const at = [msg.x, msg.y, msg.z].every((n) => typeof n === "number") ? { x: msg.x, y: msg.y, z: msg.z } : undefined;
        championSlain(msg.tag, ids, at, typeof msg.dim === "string" ? msg.dim : undefined);
      }
    } catch (e) {
      console.warn(`[saga] ${id}: ${e}`);
    }
  },
  { namespaces: ["realm"] },
);

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  cache.delete(playerId);
  busy.delete(playerId);
  holdUntil.delete(playerId);
  lastHit.delete(playerId);
});

/** Warns in the content log about mistakes in stories.js, once at start. */
function checkStories() {
  const ids = new Set();
  for (const s of STORIES) {
    if (ids.has(s.id)) console.warn(`[saga] stories.js: story id "${s.id}" is used twice`);
    ids.add(s.id);
    const chapterIds = new Set();
    for (const c of s.chapters) {
      if (chapterIds.has(c.id)) console.warn(`[saga] stories.js: ${s.id} has chapter id "${c.id}" twice`);
      chapterIds.add(c.id);
      for (const o of c.objectives) {
        if (o.place && !PLACES[o.place]) console.warn(`[saga] stories.js: ${s.id}/${c.id} uses place "${o.place}", which isn't in PLACES`);
        if ((o.type === "talk" || o.type === "deliver") && !o.npc) console.warn(`[saga] stories.js: ${s.id}/${c.id}: a ${o.type} objective needs an npc`);
        if ((o.type === "deliver" || o.type === "collect") && !o.item) console.warn(`[saga] stories.js: ${s.id}/${c.id}: a ${o.type} objective needs an item`);
        if (o.champion && !o.place && !o.at && !o.offset) console.warn(`[saga] stories.js: ${s.id}/${c.id}: a champion needs a place`);
        if (o.champion && !/^realm:[\w:.-]{1,60}$/.test(o.champion.tag)) console.warn(`[saga] stories.js: ${s.id}/${c.id}: champion tag "${o.champion.tag}" must start with "realm:" (the Champions pack ignores other tags)`);
      }
    }
  }
}

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "saga_bp");
  },
  { namespaces: ["realm"] },
);
