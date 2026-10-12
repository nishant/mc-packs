// Story data indexes and each player's saved progress: flags, requirements, which chapter is
// current, and the list of chapters a player is working on. Imports only util.js and the stories.
import { world } from "@minecraft/server";
import { STORIES } from "./stories.js";
import { FAVORS } from "./stories/index.js";
import { npcName, send } from "./util.js";

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
 */
/**
 * A chapter the player is working on. Daily favors are entries too, with a made-up story whose id
 * starts with "fv:" and `fav` set to the NPC id.
 * @typedef {{ story: Story, chapter: Chapter, index: number, st: StoryState | FavorState, fav?: string }} Entry
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
    }
  } catch {
    console.warn(`[saga] ${PROP_PLAYER} of ${player.name} is corrupt; starting over`);
  }
  saga ??= { s: {} };
  cache.set(player.id, saga);
  return saga;
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
    let json = JSON.stringify(saga);
    if (json.length > SAVE_LIMIT) {
      // Too big: finished stories keep only their flags and choices.
      for (const st of Object.values(saga.s)) if (st.fin) st.dn = [];
      json = JSON.stringify(saga);
      if (json.length > SAVE_LIMIT) console.warn(`[saga] ${player.name}'s progress is ${json.length} characters; some may not save`);
    }
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
// Flags and requirements
// ---------------------------------------------------------------------------

/**
 * The value of a flag as a story sees it: `g:<name>` player-wide, `<story>.<flag>` (or
 * `<story>:<flag>`) another story's, otherwise the story's own.
 * @param {Saga} saga @param {string} storyId @param {string} key @returns {string | undefined}
 */
export function flagOf(saga, storyId, key) {
  if (key.startsWith("g:")) return saga.g?.[key.slice(2)];
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
function setFlag(saga, storyId, key, value) {
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
  if (req.flags && !matches(req.flags, saga, storyId)) why.push("make different choices earlier in the story");
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
export const objApplies = (e, obj, saga) => e.fav !== undefined || matches(obj.when, saga, e.story.id);

/** @param {Entry} e @param {number} i */
export const progressOf = (e, i) => e.st.o?.[i] ?? 0;

/** Is objective i done (or not there for this player)? @param {Entry} e @param {number} i @param {Saga} saga */
export function objDone(e, i, saga) {
  const obj = e.chapter.objectives[i];
  if (!objApplies(e, obj, saga)) return true;
  return progressOf(e, i) >= target(obj);
}

/** @param {Entry} e @param {Saga} saga */
export const chapterDone = (e, saga) => e.chapter.objectives.every((_, i) => objDone(e, i, saga));

/** The first unfinished objective (the "current step"), or -1. @param {Entry} e @param {Saga} saga */
export const currentStep = (e, saga) => e.chapter.objectives.findIndex((_, i) => !objDone(e, i, saga));

/**
 * Does objective i count now? Unfinished and there for the player, and in a `sequential` chapter
 * only the first unfinished one.
 * @param {Entry} e @param {number} i @param {Saga} saga
 */
export function active(e, i, saga) {
  if (objDone(e, i, saga)) return false;
  return !e.chapter.sequential || currentStep(e, saga) === i;
}

/** @type {Map<string, { v: number, list: Entry[] }>} */
const entryCache = new Map();

/**
 * The chapters this player has accepted and is working on (or is ready to report back on), main
 * story first, then side stories, then daily favors.
 * @param {Player} player @returns {Entry[]}
 */
export function entries(player) {
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
