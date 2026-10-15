// Party story: a party (the Parties pack's `realm_party:<code>` tag) works on one main-story chapter at a time.
// The party's chapter is the one of the online member who is furthest behind in the main story. Members on that
// chapter share its progress; members past it (or who haven't accepted it yet) help with a party quest entry that
// lives in memory only, and their own main story waits. Nothing anyone saved is ever taken back: leaving the party
// (or the others going offline) brings back the player's own story where they left it.
import { world } from "@minecraft/server";
import { ORDERED, active, currentChapter, finished, installed, objDone, ownEntries, partyViews, reached, requires, sagaOf, storyWaitsForPacks, target } from "./data.js";
import { bump } from "./objectives.js";
import { get } from "./settings.js";
import { npcName } from "./util.js";

/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("./data.js").Entry} Entry */
/** @typedef {import("./data.js").Saga} Saga */
/** @typedef {import("./data.js").PartyView} PartyView */
/** @typedef {import("./types.js").Story} Story */
/** @typedef {import("./types.js").Chapter} Chapter */
/** @typedef {import("./types.js").Objective} Objective */

export const PARTY_TAG = "realm_party:";
const MAIN = ORDERED.filter((s) => s.kind === "main");

/** The party tag a player carries, if any. @param {Player} player */
export const partyTag = (player) => player.getTags().find((t) => t.startsWith(PARTY_TAG));

/** Online party mates of a player (any distance, any dimension). @param {Player} player */
export function partyMates(player) {
  const tag = partyTag(player);
  return tag ? world.getAllPlayers().filter((p) => p.id !== player.id && p.hasTag(tag)) : [];
}

/**
 * Where the player is in the main story: the first unfinished main chapter, in story order (prologue first).
 * `why` is set when they can't start that story yet (what it needs, or a pack check still running): such a
 * member doesn't set the party's chapter.
 * @param {Saga} saga @param {Player} player
 * @returns {{ si: number, story: Story, chapter: Chapter, index: number, why?: string[] } | undefined}
 */
export function frontier(saga, player) {
  for (let si = 0; si < MAIN.length; si++) {
    const story = MAIN[si];
    if (finished(saga, story)) continue;
    const cur = currentChapter(saga, story);
    if (!cur) continue;
    const st = saga.s[story.id];
    /** @type {string[] | undefined} */
    let why;
    if (!st?.a && !st?.dn.length) {
      if (storyWaitsForPacks(story)) why = [];
      else {
        const req = requires(story.requires, saga, story.id, player);
        if (!req.ok) why = req.why;
      }
    }
    return { si, story, chapter: cur.chapter, index: cur.index, why };
  }
  return undefined;
}

/**
 * How an objective's progress is shared in a party: "add" (everyone's counts add up), "max" (time spent: the
 * furthest along), "done" (once one member did it, it's done for all), or undefined (each their own: items in
 * your own inventory).
 * @param {Objective} obj
 */
function modeOf(obj) {
  if (obj.type === "collect") return undefined;
  // Timed steps (each member's own clock) and races: only a finished one is shared.
  if (obj.race || obj.within) return "done";
  // Time spent, and distance ridden (two in one boat both ride it): whoever is furthest along.
  if (obj.type === "survive" || obj.type === "vigil" || obj.type === "ride") return "max";
  if (target(obj) <= 1) return "done";
  switch (obj.type) {
    case "defeat":
    case "mine":
    case "fish":
    case "deliver":
    case "place":
    case "tend":
    case "tame":
    case "interact":
    case "use":
    case "lead":
    case "event":
      return "add";
    default:
      return "done";
  }
}

/** Per party: the chapter being synced, its shared progress and what each member's state held after the last sync. @type {Map<string, { key: string, v: number[], last: WeakMap<object, number[]> }>} */
const synced = new Map();
/** What each player was last told about the party story. @type {Map<string, string>} */
const told = new Map();

/**
 * A party quest entry for a helper, starting at the furthest progress of the mates who have it.
 * @param {{ story: Story, chapter: Chapter, index: number }} at @param {Entry[]} real
 * @returns {Entry}
 */
function partyQuest(at, real) {
  const o = at.chapter.objectives.map((_, i) => Math.max(0, ...real.map((e) => e.st.o?.[i] ?? 0)));
  return { story: at.story, chapter: at.chapter, index: at.index, st: { dn: [], f: {}, ch: {}, a: 1, cur: at.chapter.id, o, t: Date.now() }, pq: true };
}

/** Names as "Ann", "Ann and Bob", "Ann, Bob and Cy". @param {string[]} names */
const listNames = (names) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * Once a second (main.js): works out every party's chapter, sets each member's view (data.js entries() reads it)
 * and shares the progress on it. Players out of a party (or alone online in theirs) get their own story back.
 */
export function partyTick() {
  /** @type {Map<string, Player[]>} */
  const groups = new Map();
  // Not before the first installed-packs scan: until then chapters that read `pack:` flags look different.
  if (get("partyStory") === true && get("enabled") === true && installed.ready) {
    for (const p of world.getAllPlayers()) {
      const tag = partyTag(p);
      if (!tag) continue;
      const list = groups.get(tag) ?? [];
      list.push(p);
      groups.set(tag, list);
    }
  }
  /** @type {Set<string>} */
  const seen = new Set();
  for (const [tag, members] of groups) {
    if (members.length < 2) continue;
    const where = members.map((p) => ({ p, f: frontier(sagaOf(p), p) }));
    /** @type {{ si: number, story: Story, chapter: Chapter, index: number } | undefined} */
    let at;
    // A member who can't start their next main story yet doesn't hold the party there: they help, and are told why.
    for (const { f } of where) if (f && !f.why && (!at || f.si < at.si || (f.si === at.si && f.index < at.index))) at = f;
    if (!at) continue; // everyone finished the main story, or nobody can go on with it: each their own
    const here = at;
    const key = `${here.story.id}/${here.chapter.id}`;
    /** @type {Map<string, Entry>} */
    const real = new Map();
    for (const { p } of where) {
      const e = ownEntries(p).find((x) => x.story.id === here.story.id && x.chapter.id === here.chapter.id);
      if (e) real.set(p.id, e);
    }
    const behind = where.filter(({ f }) => f && f.story === here.story && f.chapter === here.chapter).map(({ p }) => p.name);
    // A party quest's steps apply (`when`) as they do for a mate on the chapter.
    const lead = [...real.keys()].map((id) => members.find((p) => p.id === id)).find((p) => p);
    const leadSaga = lead ? sagaOf(lead) : undefined;
    /** @type {{ p: Player, e: Entry, saga: Saga }[]} */
    const parts = [];
    for (const { p, f } of where) {
      seen.add(p.id);
      const prev = partyViews.get(p.id);
      const same = !!prev && prev.story === here.story && prev.chapter === here.chapter;
      /** @type {Entry | undefined} */
      let ghost;
      if (!real.has(p.id) && real.size) ghost = same && prev?.ghost ? prev.ghost : partyQuest(here, [...real.values()]);
      if (ghost) ghost.sg = leadSaga;
      /** @type {PartyView} */
      const view = same && prev?.ghost === ghost ? /** @type {PartyView} */ (prev) : { story: here.story, chapter: here.chapter, ghost };
      partyViews.set(p.id, view);
      const e = real.get(p.id) ?? ghost;
      if (e) parts.push({ p, e, saga: e.sg ?? sagaOf(p) });
      const onIt = !!f && f.story === here.story && f.chapter === here.chapter;
      const needs = f?.why?.length ? ` First, for ${f.story.title}, you need to: ${f.why.join(", ")}.` : "";
      tell(p, `${key}|${onIt ? "on" : "help"}${needs}`, () => {
        const title = `${here.story.title}, "${here.chapter.title}"`;
        if (onIt) {
          const start = real.has(p.id) ? "" : ` Talk to ${npcName(here.chapter.npc ?? here.story.giver)} to start it.`;
          return `§b[Party] Party story: ${title}. Progress on it is shared with your party.${start}`;
        }
        return `§b[Party] Party story: ${title}, where ${listNames(behind)} ${behind.length > 1 ? "are" : "is"}. Help out: what you do for it counts for them. Your own story waits until the party catches up.${needs}`;
      });
    }
    if (real.size) share(tag, key, here.chapter, parts);
    else synced.delete(tag); // nobody has it accepted: when they do, the sharing starts from their own progress
  }
  for (const id of [...partyViews.keys()]) {
    if (seen.has(id)) continue;
    partyViews.delete(id);
    const p = world.getAllPlayers().find((x) => x.id === id);
    if (p) tell(p, "", () => "§7[Party] Your own story counts again.");
  }
  for (const tag of [...synced.keys()]) if (!groups.has(tag)) synced.delete(tag);
}

/** Tells a player about the party story when it changed for them. @param {Player} player @param {string} key @param {() => string} text */
function tell(player, key, text) {
  const before = told.get(player.id) ?? "";
  if (before === key) return;
  told.set(player.id, key);
  if (key || before) player.sendMessage(text());
}

/**
 * Shares the progress on the party's chapter among the members working on it (their own entry, or a helper's
 * party quest). Counts add up, time is the furthest along, and a step one member finished is finished for all.
 * Each member's own entry gets it through bump(), so they see the usual notes and get their own bonuses.
 * A step counts only for members it applies to (`when`, `or` groups, the current step of a sequential chapter): a
 * member who finished an "either" step one way never gets the other way's flags from a mate.
 * @param {string} tag @param {string} key @param {Chapter} chapter @param {{ p: Player, e: Entry, saga: Saga }[]} parts
 */
function share(tag, key, chapter, parts) {
  let s = synced.get(tag);
  if (!s || s.key !== key) {
    s = { key, v: chapter.objectives.map((_, i) => Math.max(0, ...parts.map(({ e }) => e.st.o?.[i] ?? 0))), last: new WeakMap() };
    synced.set(tag, s);
  }
  const state = s;
  chapter.objectives.forEach((obj, i) => {
    const mode = modeOf(obj);
    if (!mode) return;
    const need = target(obj);
    let g = state.v[i] ?? 0;
    // Gives: a member it applies to, and whose "either" group wasn't done another way. Takes: active() for them.
    const gives = parts.filter(({ e, saga }) => reached(e, i) || !objDone(e, i, saga));
    const takes = parts.filter(({ e, saga }) => active(e, i, saga));
    for (const { e } of gives) {
      const val = e.st.o?.[i] ?? 0;
      const last = state.last.get(e.st)?.[i];
      g = mode === "add" && last !== undefined ? g + (val - last) : Math.max(g, val);
    }
    g = Math.max(0, Math.min(need, g));
    state.v[i] = g;
    for (const { p, e } of gives) {
      const val = e.st.o?.[i] ?? 0;
      if (takes.some((x) => x.e === e) && val !== g && (mode !== "done" || g >= need) && p.isValid) bump(p, e, i, g, true);
      const arr = state.last.get(e.st) ?? [];
      arr[i] = e.st.o?.[i] ?? 0;
      state.last.set(e.st, arr);
    }
  });
}

/** A player left the world. @param {string} id */
export function partyForget(id) {
  partyViews.delete(id);
  told.delete(id);
}
