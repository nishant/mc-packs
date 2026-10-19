// Story data indexes and each player's saved progress: flags, requirements, which chapter is
// current, and the list of chapters a player is working on. Imports only util.js and the stories.
import { world } from "@minecraft/server";
import { STORIES } from "./stories.js";
import { FAVORS, HOSTILES, WANDER_TEMPLATES } from "./stories/index.js";
import { PACK, hash, itemName, npcName, send, strangerNames } from "./util.js";

/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("./types.js").Story} Story */
/** @typedef {import("./types.js").Chapter} Chapter */
/** @typedef {import("./types.js").Objective} Objective */
/** @typedef {import("./types.js").Page} Page */
/** @typedef {import("./types.js").Choice} Choice */
/** @typedef {import("./types.js").Requires} Requires */
/** @typedef {import("./types.js").When} When */
/** @typedef {import("./types.js").Favor} Favor */
/** @typedef {import("./types.js").Reward} Reward */
/** @typedef {import("./types.js").WanderTemplate} WanderTemplate */
/** @typedef {import("./types.js").HostileWanderer} HostileWanderer */

/**
 * One story's saved state. Kept compact: a finished story drops its progress (`a`, `cur`, `o`, `t`,
 * `h`, `x`) and keeps what other stories and the log read (`dn`, `f`, `ch`, `fin`).
 * @typedef {object} StoryState
 * @property {string[]} dn ids of the finished chapters
 * @property {number} [a] 1 = the current chapter was accepted and its objectives count
 * @property {string} [cur] the chapter id `o` belongs to
 * @property {number[]} [o] progress of each objective of `cur`, by index in the chapter
 * @property {number} [t] when the current chapter was accepted (the tracker follows the latest)
 * @property {Record<string, string>} f the story's own flags
 * @property {Record<string, string>} ch chapter id (or "<chapter>#<objective index>" for a meet, "<chapter>@" for intro choices) -> choice id
 * @property {number} [fin] when the story was finished
 * @property {number} [h] 1 = a hint was bought for the current chapter
 * @property {Record<string, number>} [x] per-objective extras: "<i>" (inspect clues found as bits, wait start), "t<i>" (timer start)
 */
/**
 * A daily favor's saved state, per NPC.
 * @typedef {{ id: string, d: number, a?: number, o?: number[], x?: Record<string, number>, c?: number, t?: number, h?: number }} FavorState
 */
/**
 * @typedef {object} Saga
 * @property {Record<string, StoryState>} s
 * @property {Record<string, string>} [g] player-wide flags and counters (keys without the "g:")
 * @property {string[]} [cx] codex entry ids, in the order found
 * @property {Record<string, FavorState>} [fv] daily favors by NPC id
 * @property {WanderState} [wv] the player's live wanderer encounter (a Stranger's one-off, or a hostile's fight)
 * @property {number} [wn] Strangers' one-offs finished
 * @property {string} [tr] the story id of the quest the player picked to track ("fv:<npc>" a favor, "wv:..." a wanderer's job)
 * @property {string[]} [ut] story ids the player stopped tracking (Stop tracking): kept off the tracker and the Minimap until tracked again
 */
/**
 * A wanderer encounter (Wanderers of the Wilds): who, where they were met, the one-off picked for it and,
 * once accepted, its progress (the same fields as a favor's).
 * @typedef {object} WanderState
 * @property {string} w the encounter id (`realm:wander_spawn` wid); the NPC is `w_<w>`
 * @property {string} ar archetype
 * @property {string} nm the stranger's name
 * @property {string} [hk] hostile kind: the encounter is a disguise
 * @property {{ d: string, x: number, y: number, z: number }} at where they stood
 * @property {number} m when they were met (ms)
 * @property {string} [tp] the template picked (`h:<kind>` for a hostile's fight)
 * @property {{ item?: string, count?: number }} [p] its params
 * @property {number} [a] 1 = accepted
 * @property {number[]} [o]
 * @property {Record<string, number>} [x]
 * @property {number} [t]
 * @property {number} [h]
 * @property {number} [c]
 * @property {number} [g] 1 = the wanderer left (an accepted one-off finishes without them)
 * @property {number} [tn] 1 = a hostile turned: the fight is on
 */
/**
 * A chapter the player is working on. Daily favors are entries too, with a made-up story whose id
 * starts with "fv:" and `fav` set to the NPC id.
 * Wanderer one-offs are entries too: story id "wv:<template>", `fav` the stranger's NPC id and `wv` the encounter id.
 * A party quest (the main-story chapter a party mate is on, helped by a player who is past it or hasn't accepted it)
 * is an entry too, with `pq` set: its state lives in memory only, and its progress goes to the mates (party.js). Its
 * steps apply (`when`) by the flags of a mate on the chapter (`sg`), not the helper's own.
 * @typedef {{ story: Story, chapter: Chapter, index: number, st: StoryState | FavorState | WanderState, fav?: string, wv?: string, pq?: boolean, sg?: Saga }} Entry
 */

export const PROP_PLAYER = "saga:p";
const SAVE_LIMIT = 30000; // dynamic property strings hold up to 32767 characters

// ---------------------------------------------------------------------------
// Story indexes
// ---------------------------------------------------------------------------

/** Main story first (by act, the prologue as act 0), then side questlines in file order. */
export const ORDERED = [...STORIES].sort((a, b) => {
  const ka = a.kind === "main" ? 0 : 1;
  const kb = b.kind === "main" ? 0 : 1;
  if (ka !== kb) return ka - kb;
  if (ka === 0) return (a.act ?? 0) - (b.act ?? 0);
  return 0;
});

export const storyById = new Map(STORIES.map((s) => [s.id, s]));

/** Codex entries from every chapter's reward (and favors'), by id. @type {Map<string, { title: string, text: string, story: string }>} */
export const codexById = new Map();
for (const s of STORIES)
  for (const c of s.chapters) {
    const cx = c.reward?.codex;
    if (cx && !codexById.has(cx.id)) codexById.set(cx.id, { title: cx.title, text: cx.text, story: s.title });
  }
for (const f of FAVORS) {
  const cx = f.reward?.codex;
  if (cx && !codexById.has(cx.id)) codexById.set(cx.id, { title: cx.title, text: cx.text, story: "Daily favors" });
}

/** Favor templates by NPC id. @type {Map<string, Favor[]>} */
export const favorsByNpc = new Map();
for (const f of FAVORS) {
  if (!f || typeof f.npc !== "string" || !f.objective) continue;
  const list = favorsByNpc.get(f.npc) ?? [];
  list.push(f);
  favorsByNpc.set(f.npc, list);
}

/** Made-up story and chapter for a favor template, so favors reuse the objective machinery. @type {Map<string, { story: Story, chapter: Chapter }>} */
const favorShapes = new Map();
/** @param {Favor} f */
export function favorShape(f) {
  let shape = favorShapes.get(f.id);
  if (!shape) {
    /** @type {Chapter} */
    const chapter = { id: f.id, title: f.label, npc: f.npc, intro: [f.lines?.[0] ?? f.label], objectives: [f.objective], outro: [f.lines?.[1] ?? "Thank you!"], reward: f.reward };
    /** @type {Story} */
    const story = { id: `fv:${f.npc}`, title: `Daily favor for ${npcName(f.npc)}`, short: "Favor", giver: f.npc, kind: "side", chapters: [chapter] };
    shape = { story, chapter };
    favorShapes.set(f.id, shape);
  }
  return shape;
}

/** Today's UTC day number. */
export const today = () => Math.floor(Date.now() / 86400000);

/** The favor an NPC offers this player today: a deterministic pick from its templates. @param {string} playerId @param {string} npc @param {number} day */
export function favorOfDay(playerId, npc, day) {
  const list = favorsByNpc.get(npc);
  if (!list?.length) return undefined;
  let h = 0x811c9dc5;
  for (const ch of `${playerId}|${npc}|${day}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return list[h % list.length];
}

/** @param {string} id */
export const favorById = (id) => FAVORS.find((f) => f.id === id);

// ---------------------------------------------------------------------------
// Wanderers of the Wilds: one-offs built from templates, per encounter
// ---------------------------------------------------------------------------

export const templateById = new Map(WANDER_TEMPLATES.map((t) => [t.id, t]));
export const hostileById = new Map(HOSTILES.map((h) => [h.id, h]));
/** Champion tags of hostile wanderers and stranger fights: per encounter, so two at once never share one. */
export const WANDER_CHAMPION = /^realm:saga:wh(c)?_[a-z0-9]{1,16}$/;

/**
 * Fills a template's placeholders: `{name}`, `{item}`, `{count}` in text; whole values "{item}" (the id),
 * "{count}" (the number), "{npc}" (the stranger's NPC id) and `at: "wanderer"` (where they stood).
 * @param {any} v @param {{ name: string, item?: string, count?: number, npc: string, at: { dim: string, x: number, z: number } }} c @returns {any}
 */
export function fill(v, c) {
  if (typeof v === "string") {
    if (v === "{item}") return c.item ?? "minecraft:stick";
    if (v === "{count}") return c.count ?? 1;
    if (v === "{npc}") return c.npc;
    return v.split("{name}").join(c.name).split("{item}").join(c.item ? itemName(c.item) : "").split("{count}").join(String(c.count ?? 1));
  }
  if (Array.isArray(v)) return v.map((x) => fill(x, c));
  if (v && typeof v === "object") {
    /** @type {Record<string, any>} */
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = k === "at" && x === "wanderer" ? { ...c.at } : k === "requires" ? x : fill(x, c);
    if (v.at === "wanderer" && !v.mark) out.mark = `where you met ${c.name}`;
    return out;
  }
  return v;
}

/** Built shapes, by encounter and template. @type {Map<string, { story: Story, chapter: Chapter }>} */
const wanderShapes = new Map();

/**
 * The made-up story and chapter of a wanderer encounter's one-off (or a hostile's fight), or undefined when
 * its template is gone.
 * @param {WanderState} wv @returns {{ story: Story, chapter: Chapter } | undefined}
 */
export function wanderShape(wv) {
  if (!wv.tp) return undefined;
  const key = `${wv.w}|${wv.tp}|${wv.p?.item ?? ""}|${wv.p?.count ?? ""}`;
  const npc = `w_${wv.w}`;
  strangerNames.set(npc, wv.nm);
  const hit = wanderShapes.get(key);
  if (hit) return hit;
  const ctx = { name: wv.nm, item: wv.p?.item, count: wv.p?.count, npc, at: { dim: wv.at.d, x: Math.floor(wv.at.x), z: Math.floor(wv.at.z) } };
  /** @type {Chapter | undefined} */
  let chapter;
  if (wv.tp.startsWith("h:")) {
    const h = hostileById.get(/** @type {any} */ (wv.tp.slice(2)));
    if (!h) return undefined;
    const tag = `realm:saga:${h.id === "spy" ? "whc" : "wh"}_${wv.w.replace(/[^a-z0-9]/g, "").slice(0, 16)}`;
    chapter = {
      id: `h_${h.id}`,
      title: h.title,
      npc,
      intro: [h.reveal],
      objectives: [{ type: "defeat", label: `Defeat ${h.champion.name}`, champion: { ...h.champion, tag }, at: ctx.at, mark: "where it turned", radius: 48 }],
      outro: fill(h.outro, ctx),
      reward: h.reward,
      hint: `${h.champion.name} is where ${wv.nm} stood. Fight it there, or come back: it waits.`,
    };
  } else {
    const t = templateById.get(wv.tp);
    if (!t) return undefined;
    chapter = { id: t.id, title: fill(t.label, ctx), npc, intro: fill(t.intro, ctx), objectives: fill(t.objectives, ctx), outro: fill(t.outro, ctx), reward: t.reward, hint: fill(t.hint, ctx) };
  }
  /** @type {Story} */
  const story = { id: `wv:${wv.tp}`, title: chapter.title, short: wv.hk ? "Ambush" : "Stranger", giver: npc, kind: "wander", chapters: [chapter] };
  const shape = { story, chapter };
  if (wanderShapes.size > 64) wanderShapes.clear();
  wanderShapes.set(key, shape);
  return shape;
}

/**
 * Picks a stranger's one-off for this encounter: a template for their archetype whose requirements hold,
 * and its params, seeded by the encounter id (the same pick every time).
 * @param {Saga} saga @param {WanderState} wv @param {Player} player @returns {{ tp: string, p: { item?: string, count?: number } } | undefined}
 */
export function pickTemplate(saga, wv, player) {
  const list = WANDER_TEMPLATES.filter((t) => t.archetypes.includes(wv.ar) && requires(t.requires, saga, "", player).ok);
  if (!list.length) return undefined;
  const t = list[hash(`${wv.w}|t`) % list.length];
  /** @type {{ item?: string, count?: number }} */
  const p = {};
  if (t.params?.item?.length) p.item = t.params.item[hash(`${wv.w}|i`) % t.params.item.length];
  if (t.params?.count) {
    const [a, b] = t.params.count;
    p.count = a + (hash(`${wv.w}|c`) % (Math.max(a, b) - a + 1));
  }
  return { tp: t.id, p };
}

// ---------------------------------------------------------------------------
// Saved progress (cached per player, saved a few seconds after a change)
// ---------------------------------------------------------------------------

/** @type {Map<string, Saga>} */
const cache = new Map();
/** Players whose progress changed since the last save. @type {Map<string, Player>} */
const dirty = new Map();
/** Bumped when a player's chapters or flags change, so cached entries are rebuilt. @type {Map<string, number>} */
const versions = new Map();

/** @param {unknown} v */
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/** Fills in missing fields, so a damaged or older save can't break anything. @param {any} st @returns {StoryState} */
function tidy(st) {
  if (!Array.isArray(st.dn)) st.dn = [];
  st.dn = st.dn.filter((/** @type {unknown} */ x) => typeof x === "string");
  if (st.o !== undefined && !Array.isArray(st.o)) st.o = [];
  if (!isObj(st.f)) st.f = {};
  if (!isObj(st.ch)) st.ch = {};
  if (st.x !== undefined && !isObj(st.x)) delete st.x;
  return st;
}

/** @param {Player} player @returns {Saga} */
export function sagaOf(player) {
  let saga = cache.get(player.id);
  if (saga) return saga;
  // A player who already left (an operator's menu outlived them): their property can't be read, and caching an
  // empty save under their id would hide their progress when they come back (forget() ran when they left).
  if (!player.isValid) return { s: {} };
  try {
    const raw = player.getDynamicProperty(PROP_PLAYER);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : undefined;
    if (isObj(parsed) && isObj(parsed.s)) {
      saga = /** @type {Saga} */ (parsed);
      for (const [id, st] of Object.entries(saga.s)) {
        if (!isObj(st)) delete saga.s[id];
        else tidy(st);
      }
      if (saga.g !== undefined && !isObj(saga.g)) delete saga.g;
      if (saga.cx !== undefined && !Array.isArray(saga.cx)) delete saga.cx;
      if (saga.fv !== undefined && !isObj(saga.fv)) delete saga.fv;
      if (saga.tr !== undefined && typeof saga.tr !== "string") delete saga.tr;
      if (saga.ut !== undefined && (!Array.isArray(saga.ut) || saga.ut.some((x) => typeof x !== "string"))) delete saga.ut;
      if (saga.wv !== undefined && (!isObj(saga.wv) || typeof saga.wv.w !== "string" || !isObj(saga.wv.at))) delete saga.wv;
    }
  } catch {
    console.warn(`[saga] ${PROP_PLAYER} of ${player.name} is corrupt; starting over`);
  }
  saga ??= { s: {} };
  cache.set(player.id, saga);
  return saga;
}

/** UTF-8 size of a string (the safe measure for a dynamic property: no more than 32,767). @param {string} s */
function byteLength(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4; // a surrogate pair
      i++;
    } else n += 3;
  }
  return n;
}

/**
 * The save as JSON, kept under SAVE_LIMIT: past it, drop (in this order) the "stopped tracking" list, finished daily
 * favors (oldest first), then the oldest codex entries. Stories, choices, flags, progress and any field this version
 * doesn't know are never touched. @param {Saga} saga
 */
function trimSave(saga) {
  let json = JSON.stringify(saga);
  if (byteLength(json) <= SAVE_LIMIT) return json;
  if (saga.ut) {
    delete saga.ut;
    json = JSON.stringify(saga);
  }
  if (byteLength(json) > SAVE_LIMIT && saga.fv) {
    const old = Object.entries(saga.fv)
      .filter(([, fs]) => !fs?.a || fs.c)
      .sort((a, b) => (a[1]?.d ?? 0) - (b[1]?.d ?? 0));
    for (const [npc] of old) {
      delete saga.fv[npc];
      json = JSON.stringify(saga);
      if (byteLength(json) <= SAVE_LIMIT) break;
    }
  }
  if (byteLength(json) > SAVE_LIMIT && saga.cx?.length) {
    // Binary search for how many of the newest codex entries still fit.
    const all = saga.cx;
    let lo = 0;
    let hi = all.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      saga.cx = all.slice(all.length - mid);
      if (byteLength(JSON.stringify(saga)) <= SAVE_LIMIT) lo = mid;
      else hi = mid - 1;
    }
    saga.cx = all.slice(all.length - lo);
    json = JSON.stringify(saga);
  }
  return json;
}

/** Bytes left before the save hits SAVE_LIMIT, after trimming nothing. @param {Saga} saga */
export function saveRoom(saga) {
  return SAVE_LIMIT - byteLength(JSON.stringify(saga));
}

/**
 * Would the save still fit with codex entry `id` added, after the trim flush() is allowed to do (the "stopped tracking" list,
 * finished favors, the oldest codex entries)? Works on a copy: the real save is untouched. The new entry is the newest, so it is the last the trim drops.
 * @param {Saga} saga @param {string} id
 */
export function codexFits(saga, id) {
  const copy = JSON.parse(JSON.stringify(saga));
  copy.cx = [...(copy.cx ?? []), id];
  const json = trimSave(copy);
  return byteLength(json) <= SAVE_LIMIT && copy.cx.includes(id);
}

/** Marks the player's progress to be saved (within a few seconds, or now). @param {Player} player @param {boolean} [now] */
export function markDirty(player, now = false) {
  dirty.set(player.id, player);
  if (now) flush(player.id);
}

/** The player's chapters or flags changed: rebuild their entries. @param {string} id */
export function invalidate(id) {
  versions.set(id, (versions.get(id) ?? 0) + 1);
}

/** @param {string} id */
export function flush(id) {
  const player = dirty.get(id);
  dirty.delete(id);
  const saga = cache.get(id);
  if (!player || !saga || !player.isValid) return;
  try {
    const json = trimSave(saga);
    if (byteLength(json) > SAVE_LIMIT) console.warn(`[saga] ${player.name}'s progress is ${byteLength(json)} bytes; it may not save`);
    player.setDynamicProperty(PROP_PLAYER, json);
  } catch (e) {
    console.warn(`[saga] save: ${e}`);
  }
}

export function flushAll() {
  for (const id of [...dirty.keys()]) flush(id);
}

/** Forgets a player's cached progress (after a reset, or when they leave). @param {string} id */
export function forget(id) {
  cache.delete(id);
  dirty.delete(id);
  entryCache.delete(id);
  invalidate(id);
}

/** The player's state for a story (made on first use). @param {Saga} saga @param {Story} story @returns {StoryState} */
export function stateOf(saga, story) {
  let st = saga.s[story.id];
  if (!isObj(st)) st = saga.s[story.id] = { dn: [], f: {}, ch: {} };
  return tidy(st);
}

// ---------------------------------------------------------------------------
// Installed packs (`pack:<folder>` flags)
// ---------------------------------------------------------------------------

/**
 * The packs that answered the last `realm:help_ping` scan (main.js scans shortly after world load and every
 * 10 minutes). `ready` is false until the first scan ends: until then every `pack:` flag reads "off".
 * @type {{ set: Set<string>, ready: boolean }}
 */
export const installed = { set: new Set([PACK]), ready: false };

/**
 * The Realm calendar from the last `realm:calendar` (Townsfolk, later Realm Calendar): live `cal:day`,
 * `cal:season` and `cal:festival` flags, never saved. Empty until the first broadcast.
 * @type {{ day?: string, season?: string, festival?: string }}
 */
export const calendar = {};

/** @param {When | undefined} when */
const readsPacks = (when) => !!when && Object.keys(when).some((k) => k.startsWith("pack:"));

/** Chapters with an objective that only exists with (or without) some pack. @type {WeakMap<Chapter, boolean>} */
const packGated = new WeakMap();

/**
 * Before the first scan has answered, a chapter whose objectives depend on `pack:` flags can't be finished
 * (an objective hidden by "off" would otherwise let it end early). @param {Chapter} chapter
 */
function packsPending(chapter) {
  if (installed.ready) return false;
  let gated = packGated.get(chapter);
  if (gated === undefined) packGated.set(chapter, (gated = chapter.objectives.some((o) => readsPacks(o.when))));
  return gated;
}

/** Does a story need the scan before it offers a chapter (a chapter's `when` reads a `pack:` flag)? @param {Story} story */
export const storyWaitsForPacks = (story) => !installed.ready && story.chapters.some((c) => readsPacks(c.when));

// ---------------------------------------------------------------------------
// Flags and requirements
// ---------------------------------------------------------------------------

/**
 * The value of a flag as a story sees it: `g:<name>` player-wide, `<story>.<flag>` (or
 * `<story>:<flag>`) another story's, otherwise the story's own.
 * @param {Saga} saga @param {string} storyId @param {string} key @returns {string | undefined}
 */
export function flagOf(saga, storyId, key) {
  if (key.startsWith("g:")) return saga.g?.[key.slice(2)];
  if (key.startsWith("pack:")) return installed.ready && installed.set.has(key.slice(5)) ? "on" : "off";
  if (key.startsWith("cal:")) return key === "cal:day" ? calendar.day : key === "cal:season" ? calendar.season : key === "cal:festival" ? calendar.festival : undefined;
  const dot = key.indexOf(".");
  if (dot > 0) return saga.s[key.slice(0, dot)]?.f?.[key.slice(dot + 1)];
  const colon = key.indexOf(":");
  if (colon > 0 && storyById.has(key.slice(0, colon))) return saga.s[key.slice(0, colon)]?.f?.[key.slice(colon + 1)];
  return saga.s[storyId]?.f?.[key];
}

/** Does one condition hold? `!x` not x, `>=n` / `<=n` numbers, else exact. @param {string | undefined} actual @param {string} want */
export function test(actual, want) {
  const w = String(want);
  if (w.startsWith(">=")) return Number(actual ?? 0) >= Number(w.slice(2));
  if (w.startsWith("<=")) return Number(actual ?? 0) <= Number(w.slice(2));
  if (w.startsWith("!")) return actual !== w.slice(1);
  return actual === w;
}

/** Does every key of `when` hold? @param {When | undefined} when @param {Saga} saga @param {string} storyId */
export const matches = (when, saga, storyId) => !when || Object.entries(when).every(([k, v]) => test(flagOf(saga, storyId, k), v));

/** Sets a flag the way a choice's `set` names it. @param {Saga} saga @param {string} storyId @param {string} key @param {string} value */
export function setFlag(saga, storyId, key, value) {
  if (key.startsWith("g:")) {
    saga.g ??= {};
    saga.g[key.slice(2)] = String(value);
    return;
  }
  const dot = key.indexOf(".");
  if (dot > 0) {
    const other = storyById.get(key.slice(0, dot));
    if (other) stateOf(saga, other).f[key.slice(dot + 1)] = String(value);
    return;
  }
  const s = saga.s[storyId];
  if (s) s.f[key] = String(value);
}

/** The Realm Calendar's festivals, for "come back during ..." (`cal:festival`). */
const FESTIVAL_NAMES = { hatchling_tide: "the Hatchling Tide (Thaw, Realm days 10-13)", midsummer_regatta: "the Midsummer Regatta (High Sun, days 34-37)", lantern_fair: "the Lantern Fair (Harvest, days 58-61)", long_night: "Starwright's Long Night (Long Dark, days 82-85)" };

/** Townsfolk affinity levels, for `g:aff_<npc>` (0 Stranger ... 4 Confidant). */
const AFF_LEVELS = ["Strangers", "Acquaintances", "Friends", "Close", "Confidants"];

/** Reputation with a guild, from the Guilds pack's scoreboard (0 without it). @param {Player} player @param {string} guild */
function repOf(player, guild) {
  try {
    return world.scoreboard.getObjective(`rep_${guild}`)?.getScore(player) ?? 0;
  } catch {
    return 0;
  }
}

/** @param {Saga} saga @param {Story} story */
export function finished(saga, story) {
  const st = saga.s[story.id];
  if (!st) return false;
  if (st.fin) return true;
  return st.dn.length > 0 && !currentChapter(saga, story);
}

/**
 * Whether `req` holds, and what is missing (as text for the log).
 * @param {Requires | undefined} req @param {Saga} saga @param {string} storyId @param {Player} [player]
 * @returns {{ ok: boolean, why: string[] }}
 */
export function requires(req, saga, storyId, player) {
  /** @type {string[]} */
  const why = [];
  if (!req) return { ok: true, why };
  for (const id of req.stories ?? []) {
    const s = storyById.get(id);
    if (!s || !finished(saga, s)) why.push(`finish ${s ? s.title : id}`);
  }
  for (const ref of req.chapters ?? []) {
    const [sid, cid] = ref.split("/");
    const s = storyById.get(sid);
    const st = saga.s[sid];
    const done = !!st && (st.dn.includes(cid) || (!!st.fin && !st.dn.length));
    if (!done) {
      const ch = s?.chapters.find((c) => c.id === cid);
      why.push(`finish ${ch ? `"${ch.title}"` : "a chapter"} of ${s ? s.title : sid}`);
    }
  }
  if (req.flags) {
    // Townsfolk affinity (`g:aff_<npc>`, from realm:affinity): say whom to befriend, not "choices".
    for (const [k, v] of Object.entries(req.flags)) {
      if (k.startsWith("g:aff_") && !test(flagOf(saga, storyId, k), v)) why.push(`become ${AFF_LEVELS[Number(String(v).replace(/[^0-9]/g, "")) || 3] ?? "Close"} with ${npcName(k.slice(6))} (Townsfolk)`);
      /** @type {Record<string, string>} */
      const fest = FESTIVAL_NAMES;
      if (k === "cal:festival" && !test(flagOf(saga, storyId, k), v)) why.push(`come back during ${fest[v] ?? "its festival"} (Realm Calendar)`);
    }
    if (!Object.entries(req.flags).filter(([k]) => !k.startsWith("g:aff_") && k !== "cal:festival").every(([k, v]) => test(flagOf(saga, storyId, k), v))) why.push("make different choices earlier in the story");
  }
  for (const [k, n] of Object.entries(req.minCount ?? {})) if (Number(flagOf(saga, storyId, k) ?? 0) < n) why.push("make different choices earlier in the story");
  for (const [guild, n] of Object.entries(req.rep ?? {})) {
    if (player && repOf(player, guild) < (n ?? 0)) why.push(`reach ${n} reputation with the ${guild.charAt(0).toUpperCase() + guild.slice(1)}`);
  }
  return { ok: why.length === 0, why: [...new Set(why)] };
}

/**
 * A choice: its flags, counters and the record of what was picked. Reputation is given by the caller.
 * @param {Saga} saga @param {Story} story @param {string} key where it was made (chapter id, "<chapter>#<i>", "<chapter>@") @param {Choice} choice
 */
export function applyChoice(saga, story, key, choice) {
  const st = stateOf(saga, story);
  for (const [k, v] of Object.entries(choice.set ?? {})) setFlag(saga, story.id, k, v);
  for (const [k, n] of Object.entries(choice.inc ?? {})) {
    const v = Number(flagOf(saga, story.id, k) ?? 0) + (Number(n) || 0);
    setFlag(saga, story.id, k, String(v));
  }
  st.ch[key] = choice.id;
}

// ---------------------------------------------------------------------------
// Chapters and objectives
// ---------------------------------------------------------------------------

/** @param {Chapter} chapter @param {Saga} saga @param {Story} story */
export const chapterApplies = (chapter, saga, story) => matches(chapter.when, saga, story.id);

/**
 * The chapter the player is on: the one accepted (even if its `when` changed since), else the first
 * unfinished chapter whose `when` matches. Undefined when the story is finished.
 * @param {Saga} saga @param {Story} story @returns {{ chapter: Chapter, index: number } | undefined}
 */
export function currentChapter(saga, story) {
  const st = saga.s[story.id];
  if (st?.fin) return undefined;
  if (st?.a && st.cur) {
    const index = story.chapters.findIndex((c) => c.id === st.cur);
    if (index >= 0 && !st.dn.includes(st.cur)) return { chapter: story.chapters[index], index };
  }
  const index = story.chapters.findIndex((c) => !st?.dn.includes(c.id) && chapterApplies(c, saga, story));
  return index < 0 ? undefined : { chapter: story.chapters[index], index };
}

/**
 * The packs a started story can't go on without: a `pack:<folder>` "on" in the story's `requires.flags` or in the
 * `when` of its current (or next) chapter, for a pack that is gone (removed after the story began). Also while a
 * chapter is accepted. [] before the first scan answered.
 * @param {Story} story @param {Saga} saga
 */
export function packsNeeded(story, saga) {
  const st = saga.s[story.id];
  if (!installed.ready || !st || st.fin || !(st.a || st.dn.length)) return [];
  const cur = story.chapters.find((c) => c.id === st.cur && !st.dn.includes(c.id)) ?? story.chapters.find((c) => !st.dn.includes(c.id));
  /** @type {Set<string>} */
  const out = new Set();
  for (const when of [story.requires?.flags, cur?.when])
    for (const [k, v] of Object.entries(when ?? {})) if (k.startsWith("pack:") && v === "on" && !installed.set.has(k.slice(5))) out.add(k.slice(5));
  return [...out];
}

/** "Chapter 3 of 9": the place among the chapters this player gets. @param {Saga} saga @param {Story} story @param {number} index */
export function chapterNumber(saga, story, index) {
  const st = saga.s[story.id];
  // In the order the player plays them: the chapters done so far, then this one, then the rest that apply now.
  const done = story.chapters.filter((c) => st?.dn.includes(c.id)).length;
  const here = story.chapters[index];
  const isDone = !!here && !!st?.dn.includes(here.id);
  const rest = story.chapters.filter((c, i) => i !== index && !st?.dn.includes(c.id) && chapterApplies(c, saga, story)).length;
  return { pos: isDone ? done : done + 1, total: done + rest + (isDone ? 0 : 1) };
}

/** What an objective counts up to. @param {Objective} obj */
export function target(obj) {
  switch (obj.type) {
    case "survive":
    case "vigil":
      return Math.max(1, obj.seconds ?? 60);
    case "inspect":
      return Math.max(1, obj.clues?.length ?? 1);
    case "defend":
      return Math.max(1, obj.waves?.length ?? 1);
    case "ride":
      return Math.max(1, obj.distance ?? 100);
    case "talk":
    case "reach":
    case "meet":
    case "stealth":
    case "escort":
    case "follow":
    case "answer":
    case "sleep":
    case "vision":
    case "wear":
    case "wait":
      return 1;
    default:
      return Math.max(1, obj.count ?? 1);
  }
}

/** Does this objective exist for the player now (its `when`)? @param {Entry} e @param {Objective} obj @param {Saga} saga */
export const objApplies = (e, obj, saga) => e.fav !== undefined || matches(obj.when, e.sg ?? saga, e.story.id);

/** @param {Entry} e @param {number} i */
export const progressOf = (e, i) => e.st.o?.[i] ?? 0;

/** Has objective i reached its own target? @param {Entry} e @param {number} i */
export const reached = (e, i) => progressOf(e, i) >= target(e.chapter.objectives[i]);

/**
 * The other members of objective i's "either" group (`or`) that are there for the player, or [] when it has none.
 * @param {Entry} e @param {number} i @param {Saga} saga
 */
export function orMates(e, i, saga) {
  const obj = e.chapter.objectives[i];
  if (!obj.or || obj.optional) return [];
  /** @type {number[]} */
  const out = [];
  e.chapter.objectives.forEach((o, k) => {
    if (k !== i && o.or === obj.or && !o.optional && objApplies(e, o, saga)) out.push(k);
  });
  return out;
}

/**
 * An objective's label as the log and tracker show it: "Optional: ...", or "Either: ..." / "Or: ..." in an
 * "either" group with another member there for the player.
 * @param {Entry} e @param {number} i @param {Saga} saga
 */
export function labelOf(e, i, saga) {
  const obj = e.chapter.objectives[i];
  const label = countdown(obj, progressOf(e, i));
  if (obj.optional) return `Optional: ${label}`;
  const mates = orMates(e, i, saga);
  if (mates.length) return `${mates.some((k) => k < i) ? "Or" : "Either"}: ${label}`;
  return label;
}

/**
 * An objective's label counting down while it is under way: with 6 of 12 done, "Defeat 12 drowned" reads "Defeat 6
 * more drowned" and "... with the wardens (12)" reads "... (6 left)". A label without its target number once gets
 * " (6 left)", with a unit for seconds, blocks, waves and clues. Not started or done: the label as written.
 * @param {Objective} obj @param {number} n
 */
export function countdown(obj, n) {
  const need = target(obj);
  if (need <= 1 || n <= 0 || n >= need) return obj.label;
  const left = need - n;
  const re = new RegExp(`(?<![\\w./])${need}(?![\\w./])`, "g");
  if ((obj.label.match(re)?.length ?? 0) === 1)
    return obj.label.replace(re, (m, at) => (obj.label[at - 1] === "(" && obj.label[at + m.length] === ")" ? `${left} left` : `${left} more`));
  const unit = /** @type {Record<string, string>} */ ({ survive: " s", vigil: " s", ride: " blocks", defend: " waves", inspect: " clues" })[obj.type] ?? "";
  return `${obj.label} (${left}${unit} left)`;
}

/** Is objective i done (or not there for this player, or another member of its "either" group is done)? @param {Entry} e @param {number} i @param {Saga} saga */
export function objDone(e, i, saga) {
  const obj = e.chapter.objectives[i];
  if (!objApplies(e, obj, saga)) return true;
  if (reached(e, i)) return true;
  // A member that was reached stays done even if its `when` stopped holding since (a pack missed one scan).
  return !!obj.or && !obj.optional && e.chapter.objectives.some((o, k) => k !== i && o.or === obj.or && !o.optional && reached(e, k));
}

/** Every required objective is done (optional ones don't count). @param {Entry} e @param {Saga} saga */
export const chapterDone = (e, saga) => !packsPending(e.chapter) && e.chapter.objectives.every((o, i) => o.optional || objDone(e, i, saga));

/** The first unfinished required objective (the "current step"), or -1. @param {Entry} e @param {Saga} saga */
export const currentStep = (e, saga) => e.chapter.objectives.findIndex((o, i) => !o.optional && !objDone(e, i, saga));

/**
 * Does objective i count now? Unfinished and there for the player, and in a `sequential` chapter
 * only the first unfinished one (with the rest of its "either" group). Optional objectives always count.
 * @param {Entry} e @param {number} i @param {Saga} saga
 */
export function active(e, i, saga) {
  if (objDone(e, i, saga)) return false;
  const obj = e.chapter.objectives[i];
  if (!e.chapter.sequential || obj.optional) return true;
  const step = currentStep(e, saga);
  return step === i || (!!obj.or && e.chapter.objectives[step]?.or === obj.or);
}

/** @type {Map<string, { v: number, list: Entry[] }>} */
const entryCache = new Map();

/**
 * What the party sync (party.js) says for a player in a party: the party's main-story chapter, and the party quest
 * entry they help with (when they don't have that chapter accepted themselves). Undefined out of a party.
 * @typedef {{ story: Story, chapter: Chapter, ghost?: Entry }} PartyView
 */
/** @type {Map<string, PartyView>} */
export const partyViews = new Map();
/** The list entries() returned for a player's own list and party view. @type {WeakMap<Entry[], { view: PartyView | undefined, list: Entry[] }>} */
const viewed = new WeakMap();

/**
 * Is this main-story chapter on hold for the player? In a party, only the party's chapter counts.
 * @param {string} playerId @param {Story} story @param {string | undefined} chapterId
 */
export function onHold(playerId, story, chapterId) {
  const view = partyViews.get(playerId);
  return !!view && story.kind === "main" && (view.story.id !== story.id || view.chapter.id !== chapterId);
}

/**
 * The chapters this player has accepted and is working on (or is ready to report back on), main story first, then
 * side stories, then daily favors. In a party, other main-story chapters than the party's wait (they aren't listed),
 * and the party quest is listed first when the player helps with it.
 * @param {Player} player @returns {Entry[]}
 */
export function entries(player) {
  const own = ownEntries(player);
  const view = partyViews.get(player.id);
  const hit = viewed.get(own);
  if (hit && hit.view === view) return hit.list;
  const list = view ? own.filter((e) => !onHold(player.id, e.story, e.chapter.id)) : own;
  if (view?.ghost && !list.some((e) => e.story.id === view.story.id)) list.unshift(view.ghost);
  viewed.set(own, { view, list });
  return list;
}

/** The player's own chapters, without the party view. @param {Player} player @returns {Entry[]} */
export function ownEntries(player) {
  const v = versions.get(player.id) ?? 0;
  const hit = entryCache.get(player.id);
  if (hit && hit.v === v) return hit.list;
  const saga = sagaOf(player);
  /** @type {Entry[]} */
  const list = [];
  for (const story of ORDERED) {
    const st = saga.s[story.id];
    if (!st || !st.a) continue;
    const cur = currentChapter(saga, story);
    if (!cur || st.cur !== cur.chapter.id) {
      // The stories changed under this player: the chapter they accepted is gone. Offer the next one again.
      st.a = 0;
      delete st.cur;
      delete st.o;
      delete st.x;
      markDirty(player);
      continue;
    }
    st.o ??= [];
    list.push({ story, chapter: cur.chapter, index: cur.index, st });
  }
  for (const [npc, fs] of Object.entries(saga.fv ?? {})) {
    if (!fs?.a || fs.c) continue;
    const f = favorById(fs.id);
    if (!f) {
      // The favor vanished from favors.js under this player: forget it, so the questgiver offers today's again.
      delete saga.fv?.[npc];
      markDirty(player);
      continue;
    }
    const { story, chapter } = favorShape(f);
    fs.o ??= [];
    list.push({ story, chapter, index: 0, st: fs, fav: npc });
  }
  const wv = saga.wv;
  if (wv?.a && !wv.c) {
    const shape = wanderShape(wv);
    if (!shape) {
      // Its template vanished under this player: forget the encounter.
      delete saga.wv;
      markDirty(player);
    } else {
      wv.o ??= [];
      list.push({ story: shape.story, chapter: shape.chapter, index: 0, st: wv, fav: `w_${wv.w}`, wv: wv.w });
    }
  }
  entryCache.set(player.id, { v, list });
  return list;
}

/** "story:chapter:i" @param {Entry} e @param {number} i */
export const objKey = (e, i) => `${e.story.id}:${e.chapter.id}:${i}`;

/**
 * The pages a player sees, after flags; `{player}` becomes their name.
 * @param {Page[] | undefined} pages @param {Saga} saga @param {string} storyId @param {string} [name]
 */
export const pagesFor = (pages, saga, storyId, name = "") =>
  (pages ?? []).flatMap((p) => (typeof p === "string" ? [p] : p && matches(p.when, saga, storyId) ? [p.text] : [])).map((t) => t.split("{player}").join(name));

/** Sends reputation (Guilds pack) for the entries whose `when` holds. @param {Player} player @param {import("./types.js").Rep[] | undefined} reps @param {Saga} saga @param {Story} story */
export function giveRep(player, reps, saga, story) {
  for (const r of reps ?? []) {
    if (matches(r.when, saga, story.id)) send("realm:rep_add", { player: player.id, guild: r.guild, amount: r.amount, reason: `Story: ${story.title}` });
  }
}
