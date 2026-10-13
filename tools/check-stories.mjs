// Checks the Story Questlines content (packs/saga_bp/scripts/stories.js and stories/*.js) for what
// the engine relies on: known objective types and their fields, places, NPC ids, unique ids, champion
// tags, requirements, optional objectives, "either" groups, event objectives, sky requests and `pack:`
// flags. Flags read in a `when` or `requires.flags` that nothing sets are warnings.
// Runs as part of `npm run check`.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
const scripts = join(root, "packs", "saga_bp", "scripts");
const { STORIES, PLACES, NPC_NAMES } = await import(pathToFileURL(join(scripts, "stories.js")).href);
const { FAVORS } = await import(pathToFileURL(join(scripts, "stories", "index.js")).href);

/** @type {string[]} */
const errors = [];
/** @type {string[]} */
const warnings = [];

/** Sky event kinds an event objective counts (realm:sky_event), and those with a spot a `near` chase can go to. */
const SKY_KINDS = new Set(["meteor", "blood_moon", "harvest_moon", "rainbow", "storm_cell", "tornado", "aurora"]);
const SPOT_KINDS = new Set(["meteor", "rainbow", "storm_cell", "tornado"]);
/** What a story may ask the world-event packs for (realm:sky_request). */
const REQUEST_KINDS = new Set(["meteor", "blood_moon", "harvest_moon", "thunder", "rain", "shooting_star", "rainbow"]);
const TIERS = new Set(["easy", "normal", "hard", "nightmare"]);

const has = (/** @type {any} */ o) => !!(o && (o.place || o.at || o.offset));
const where = (/** @type {any} */ o) => has(o);
/** Required fields per objective type: a test and what it says when it fails. */
/** @type {Record<string, (o: any) => string | undefined>} */
const TYPES = {
  talk: (o) => (o.npc ? undefined : "needs npc"),
  reach: (o) => (where(o) || o.dim || o.belowY !== undefined || o.aboveY !== undefined ? undefined : "needs a location, dim, belowY or aboveY"),
  deliver: (o) => (!o.npc ? "needs npc" : !o.item && !o.name ? "needs item or name" : undefined),
  collect: (o) => (!o.item && !o.name ? "needs item or name" : undefined),
  defeat: (o) => (o.champion ? (/^realm:[\w:.-]{1,60}$/.test(o.champion.tag ?? "") && o.champion.mob && o.champion.name ? undefined : "champion needs mob, name and a tag starting with realm:") : undefined),
  interact: (o) => (o.blocks?.length ? undefined : "needs blocks"),
  survive: () => undefined,
  vigil: (o) => (where(o) ? undefined : "needs a location"),
  mine: () => undefined,
  fish: () => undefined,
  meet: (o) => (!o.who?.id || !o.who?.entity || !o.who?.name ? "needs who { id, name, entity }" : !where(o) ? "needs a location" : !o.pages?.length ? "needs pages" : undefined),
  inspect: (o) => (!where(o) ? "needs a location" : !o.clues?.length ? "needs clues" : o.clues.length > 30 ? "at most 30 clues" : undefined),
  stealth: (o) => (!where(o) ? "needs a location" : !o.guards?.mob ? "needs guards { mob, count }" : undefined),
  escort: (o) => (!o.who?.entity ? "needs who" : !has(o.to) ? "needs to" : undefined),
  lead: (o) => (!o.mob ? "needs mob" : !has(o.to) ? "needs to" : undefined),
  defend: (o) => (!where(o) ? "needs a location" : !o.waves?.length ? "needs waves" : undefined),
  follow: (o) => (has(o.to) ? undefined : "needs to"),
  answer: (o) => (!o.answers?.length ? "needs answers" : undefined),
  place: () => undefined,
  tend: (o) => (o.mobs?.length ? undefined : "needs mobs"),
  tame: (o) => (o.mobs?.length ? undefined : "needs mobs"),
  ride: (o) => (o.distance ? undefined : "needs distance"),
  sleep: () => undefined,
  vision: (o) => (o.scenes?.length ? undefined : "needs scenes"),
  wear: (o) => (!o.items?.length ? "needs items" : !["head", "chest", "legs", "feet"].includes(o.slot) ? "needs slot head/chest/legs/feet" : undefined),
  use: (o) => (o.item ? undefined : "needs item"),
  wait: (o) => (o.minutes || o.days ? undefined : "needs minutes or days"),
  event: (o) => {
    if (!o.events?.length && !o.quest) return "needs events or quest";
    for (const k of o.events ?? []) if (!SKY_KINDS.has(k)) return `unknown sky event "${k}" (${[...SKY_KINDS].join(", ")})`;
    if (o.quest) {
      if (typeof o.quest.pack !== "string" || !o.quest.pack) return "quest needs pack";
      if (!existsSync(join(root, "packs", o.quest.pack))) return `quest pack "${o.quest.pack}" isn't a folder in packs/`;
      if (o.quest.id !== undefined && (typeof o.quest.id !== "string" || o.quest.id.indexOf("*") !== o.quest.id.length - 1 && o.quest.id.includes("*"))) return "quest id must be text, with * only at the end";
      if (o.quest.minLevel !== undefined && typeof o.quest.minLevel !== "number") return "quest minLevel must be a number";
      if (o.quest.tier !== undefined && !TIERS.has(o.quest.tier)) return `quest tier must be one of ${[...TIERS].join(", ")}`;
      if (o.quest.gauntlet !== undefined && typeof o.quest.gauntlet !== "boolean") return "quest gauntlet must be true or false";
    }
    if (o.near !== undefined && (typeof o.near !== "number" || o.near <= 0)) return "near must be a number of blocks";
    if (o.near !== undefined && !(o.events ?? []).some((/** @type {string} */ k) => SPOT_KINDS.has(k))) return `near needs one of ${[...SPOT_KINDS].join(", ")} in events`;
    return undefined;
  },
};

/** Folders in packs/, for `pack:<folder>` flags and quest packs. */
const packFolder = (/** @type {string} */ f) => /^[a-z0-9_]+$/.test(f) && existsSync(join(root, "packs", f));

const storyIds = new Set(STORIES.map((/** @type {any} */ s) => s.id));
/** Flags something sets, as "g:<name>" or "<story>.<flag>". */
const setKeys = new Set();
/** Flags read, with where. @type {[string, string][]} */
const readKeys = [];

/** Canonical flag key as story `sid` names it. @param {string} sid @param {string} key */
function canon(sid, key) {
  if (key.startsWith("g:") || key.startsWith("pack:")) return key;
  const dot = key.indexOf(".");
  if (dot > 0 && storyIds.has(key.slice(0, dot))) return key;
  return `${sid}.${key}`;
}

/** @param {string} at @param {string} sid @param {any} choices */
function choicesOf(at, sid, choices) {
  const ids = new Set();
  for (const c of choices ?? []) {
    if (!c.id || !c.label) errors.push(`${at}: a choice needs id and label`);
    if (ids.has(c.id)) errors.push(`${at}: choice id "${c.id}" twice`);
    ids.add(c.id);
    for (const k of Object.keys(c.set ?? {})) setKeys.add(canon(sid, k));
    for (const k of Object.keys(c.inc ?? {})) setKeys.add(canon(sid, k));
    reqs(`${at} choice ${c.id}`, sid, c.requires);
    for (const r of c.rep ?? []) whens(`${at} choice ${c.id} rep`, sid, r.when);
    pages(`${at} choice ${c.id} reply`, sid, c.reply);
  }
}

/** @param {string} at @param {string} sid @param {any} when */
function whens(at, sid, when) {
  for (const k of Object.keys(when ?? {})) {
    if (k.startsWith("pack:")) {
      // Installed packs: "on" or "off", set by the realm:help_ping scan, never by a choice.
      if (!packFolder(k.slice(5))) errors.push(`${at}: "${k}": no folder "${k.slice(5)}" in packs/`);
      const v = String(when[k]).replace(/^!/, "");
      if (v !== "on" && v !== "off") errors.push(`${at}: "${k}" must be "on" or "off" (or "!on" / "!off")`);
      continue;
    }
    if (k.startsWith("g:aff_")) {
      // Townsfolk affinity (realm:affinity): a level 0-4, set by npc_bp, never by a choice.
      if (!NPC_NAMES[k.slice(6)]) errors.push(`${at}: "${k}": unknown NPC "${k.slice(6)}"`);
      if (!/^(>=|<=|!)?[0-4]$/.test(String(when[k]))) errors.push(`${at}: "${k}" must be a level 0-4 (">=3")`);
      continue;
    }
    if (k.startsWith("cal:")) {
      // The Realm calendar (realm:calendar), live like pack: flags.
      if (!["cal:day", "cal:season", "cal:festival"].includes(k)) errors.push(`${at}: "${k}": the calendar flags are cal:day, cal:season and cal:festival`);
      continue;
    }
    readKeys.push([canon(sid, k), at]);
  }
}

/** @param {string} at @param {any} req */
function skyOk(at, req) {
  if (!req || typeof req !== "object") return errors.push(`${at}: a sky request must be { kind, ... }`);
  if (!REQUEST_KINDS.has(req.kind)) errors.push(`${at}: unknown sky request kind "${req.kind}" (${[...REQUEST_KINDS].join(", ")})`);
  placeOk(at, req);
  if (req.on !== undefined && req.on !== "start" && req.on !== "done") errors.push(`${at}: sky on must be "start" or "done"`);
  if (req.burst !== undefined && req.kind !== "meteor") errors.push(`${at}: burst is for a meteor`);
  if ((req.minutes !== undefined || req.within !== undefined) && req.kind !== "thunder" && req.kind !== "rain") errors.push(`${at}: minutes and within are for thunder or rain`);
}

/** @param {string} at @param {string} sid @param {any} req */
function reqs(at, sid, req) {
  if (!req) return;
  for (const id of req.stories ?? []) if (!storyIds.has(id)) errors.push(`${at}: requires unknown story "${id}"`);
  for (const ref of req.chapters ?? []) {
    const [s, c] = String(ref).split("/");
    const story = STORIES.find((/** @type {any} */ x) => x.id === s);
    if (!story || !story.chapters.some((/** @type {any} */ ch) => ch.id === c)) errors.push(`${at}: requires unknown chapter "${ref}"`);
  }
  whens(at, sid, req.flags);
  whens(at, sid, req.minCount);
}

/** @param {string} at @param {string} sid @param {any} list */
function pages(at, sid, list) {
  for (const p of list ?? []) {
    if (typeof p === "string") continue;
    if (!p || typeof p.text !== "string") errors.push(`${at}: a page must be text or { text, when }`);
    else whens(at, sid, p.when);
  }
}

/** @param {string} at @param {string | undefined} npc */
function npcOk(at, npc) {
  if (npc !== undefined && !NPC_NAMES[npc]) errors.push(`${at}: unknown NPC "${npc}"`);
}

/** @param {string} at @param {any} w */
function placeOk(at, w) {
  if (w?.place && !PLACES[w.place]) errors.push(`${at}: unknown place "${w.place}"`);
}

/** @param {string} at @param {string} sid @param {any} o */
function objective(at, sid, o) {
  const check = TYPES[o?.type];
  if (!check) return errors.push(`${at}: unknown objective type "${o?.type}"`);
  if (!o.label) errors.push(`${at}: objective needs a label`);
  const why = check(o);
  if (why) errors.push(`${at} (${o.type}): ${why}`);
  npcOk(at, o.npc);
  for (const w of [o, o.from, o.to, o.spawnAt]) placeOk(at, w);
  whens(at, sid, o.when);
  if (o.choices) choicesOf(at, sid, o.choices);
  if (o.pages) pages(at, sid, o.pages);
  for (const k of Object.keys(o.set ?? {})) setKeys.add(canon(sid, k));
  if (o.set !== undefined && (typeof o.set !== "object" || Object.values(o.set).some((v) => typeof v !== "string"))) errors.push(`${at}: set must map flags to text`);
  if (o.bonus && !o.optional) errors.push(`${at}: bonus is only for an optional objective`);
  if (o.optional && o.or) errors.push(`${at}: an optional objective can't be in an "either" group (or)`);
  if (o.or !== undefined && (typeof o.or !== "string" || !o.or)) errors.push(`${at}: or must be a group id`);
  if (o.sky) {
    if (Array.isArray(o.sky)) errors.push(`${at}: an objective's sky is one request, not a list`);
    else skyOk(at, o.sky);
  }
  for (const c of o.clues ?? []) if (typeof c.dx !== "number" || typeof c.dz !== "number") errors.push(`${at}: a clue needs dx and dz`);
}

const ids = new Set();
for (const s of STORIES) {
  const at = `story ${s.id}`;
  if (ids.has(s.id)) errors.push(`${at}: id used twice`);
  ids.add(s.id);
  if (!s.title || !s.short || !s.giver || !Array.isArray(s.chapters)) errors.push(`${at}: needs title, short, giver and chapters`);
  if ((s.short ?? "").length > 18) warnings.push(`${at}: short "${s.short}" is longer than 18 characters`);
  if (s.kind !== undefined && !["main", "side", "heart"].includes(s.kind)) errors.push(`${at}: kind must be "main", "side" or "heart"`);
  if (s.kind === "heart" && !s.requires?.flags?.[`g:aff_${s.giver}`]) errors.push(`${at}: a heart story needs requires.flags { "g:aff_${s.giver}": ">=3" }`);
  npcOk(at, s.giver);
  reqs(at, s.id, s.requires);
  const cids = new Set();
  for (const c of s.chapters ?? []) {
    const cat = `${s.id}/${c.id}`;
    if (cids.has(c.id)) errors.push(`${cat}: chapter id used twice`);
    cids.add(c.id);
    if (!c.title || !Array.isArray(c.intro) || !Array.isArray(c.objectives) || !Array.isArray(c.outro)) errors.push(`${cat}: needs title, intro, objectives and outro`);
    if (!c.objectives?.length) warnings.push(`${cat}: no objectives`);
    if (!c.hint) warnings.push(`${cat}: no hint`);
    npcOk(cat, c.npc);
    npcOk(cat, c.end);
    whens(cat, s.id, c.when);
    pages(`${cat} intro`, s.id, c.intro);
    pages(`${cat} outro`, s.id, c.outro);
    choicesOf(`${cat} introChoices`, s.id, c.introChoices);
    choicesOf(`${cat} choices`, s.id, c.choices);
    for (const r of c.rep ?? []) whens(`${cat} rep`, s.id, r.when);
    (c.objectives ?? []).forEach((/** @type {any} */ o, /** @type {number} */ i) => objective(`${cat} objective ${i + 1}`, s.id, o));
    if (c.objectives?.length && c.objectives.every((/** @type {any} */ o) => o.optional)) errors.push(`${cat}: needs at least one objective that isn't optional`);
    /** @type {Map<string, number>} */
    const groups = new Map();
    for (const o of c.objectives ?? []) if (o.or && !o.optional) groups.set(o.or, (groups.get(o.or) ?? 0) + 1);
    for (const [g, n] of groups) if (n < 2) errors.push(`${cat}: "either" group "${g}" needs at least 2 objectives (has ${n})`);
    if (c.sky !== undefined) {
      if (!Array.isArray(c.sky)) errors.push(`${cat}: a chapter's sky is a list of requests`);
      else c.sky.forEach((/** @type {any} */ r, /** @type {number} */ k) => skyOk(`${cat} sky ${k + 1}`, r));
    }
  }
}

const favorIds = new Set();
for (const f of FAVORS) {
  const at = `favor ${f.id}`;
  if (favorIds.has(f.id)) errors.push(`${at}: id used twice`);
  favorIds.add(f.id);
  if (!f.label || !f.objective || !Array.isArray(f.lines) || f.lines.length < 2) errors.push(`${at}: needs label, objective and lines [intro, thanks]`);
  npcOk(at, f.npc);
  if (f.objective) objective(at, `fv:${f.npc}`, f.objective);
  if (f.objective?.optional || f.objective?.or) errors.push(`${at}: a favor's only objective can't be optional or in an "either" group`);
}

for (const [key, at] of readKeys) {
  if (setKeys.has(key)) continue;
  warnings.push(`${at}: flag "${key}" is read but never set by any choice`);
}

// ---------------------------------------------------------------------------
// Game ids: items, blocks and mobs must exist in this Minecraft version (a wrong id spawns nothing, so a
// champion, a wave or a story character never comes and the chapter can't be finished).
// ---------------------------------------------------------------------------

/** @type {any} */
let vanilla;
try {
  vanilla = await import("@minecraft/vanilla-data");
} catch {
  console.warn("check-stories: @minecraft/vanilla-data isn't installed: game ids not checked");
}
if (vanilla) {
  const known = {
    item: new Set(Object.values(vanilla.MinecraftItemTypes)),
    block: new Set(Object.values(vanilla.MinecraftBlockTypes)),
    entity: new Set(Object.values(vanilla.MinecraftEntityTypes)),
  };
  /** @param {"item" | "block" | "entity"} kind @param {unknown} id @param {string} at */
  const idOk = (kind, id, at) => {
    if (typeof id !== "string") return;
    if (!known[kind].has(id.includes(":") ? id : `minecraft:${id}`)) errors.push(`${at}: unknown ${kind} "${id}"`);
  };
  /** @param {any} o @param {string} at */
  const ids = (o, at) => {
    idOk("item", o.item, at);
    for (const x of o.items ?? []) idOk("item", x, at);
    idOk("item", o.disguise?.item, at);
    for (const x of o.blocks ?? []) idOk("block", x, at);
    for (const x of [...(o.mobs ?? []), o.mob, o.champion?.mob, o.who?.entity, o.ward?.entity, o.guards?.mob]) idOk("entity", x, at);
    for (const g of [o.champion?.adds, o.ambush, o.failSpawn, ...(o.waves ?? [])]) for (const x of g?.mobs ?? []) idOk("entity", x, at);
  };
  /** @param {any} r @param {string} at */
  const rewardIds = (r, at) => {
    for (const it of r?.items ?? []) idOk("item", it.item, `${at} reward`);
  };
  for (const s of STORIES)
    for (const c of s.chapters) {
      c.objectives.forEach((/** @type {any} */ o, /** @type {number} */ i) => {
        ids(o, `${s.id}/${c.id} objective ${i + 1}`);
        rewardIds(o.bonus, `${s.id}/${c.id} objective ${i + 1} bonus`);
      });
      rewardIds(c.reward, `${s.id}/${c.id}`);
    }
  for (const f of FAVORS) {
    if (f.objective) ids(f.objective, `favor ${f.id}`);
    rewardIds(f.reward, `favor ${f.id}`);
  }
}

// ---------------------------------------------------------------------------
// Prefabs: an interact objective at a place needs one of its blocks in the place's building, within reach
// ---------------------------------------------------------------------------

{
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(join(scripts, "prefabs.js"), "utf8").replace(/^import \{[^}]*\} from "@minecraft\/server";/m, "const BlockPermutation = {}; const LiquidType = {};");
  const { PREFABS, blueprint } = await import(`data:text/javascript,${encodeURIComponent(src)}`);
  /** @type {Record<string, any[]>} */
  const built = {};
  for (const name of Object.keys(PREFABS)) {
    built[name] = blueprint(name, { x: 0, y: 64, z: 0 }).entries.filter((/** @type {any} */ e) => e.k !== 2 && e.k !== 3); // not AIR or WATER
    if (vanilla) {
      const blocks = new Set(Object.values(vanilla.MinecraftBlockTypes));
      for (const id of new Set(built[name].map((/** @type {any} */ e) => e.b.id))) if (!blocks.has(id)) errors.push(`prefab ${name}: unknown block "${id}"`);
    }
  }
  /** @param {any} o @param {string} at */
  const reach = (o, at) => {
    if (o.type !== "interact" || !o.place || !built[o.place]) return;
    const r = o.radius ?? 8;
    if (!built[o.place].some((e) => o.blocks.includes(e.b.id) && Math.hypot(e.x, e.y, e.z) <= r)) errors.push(`${at}: no ${o.blocks.join("/")} within ${r} blocks of ${o.place}'s origin in its building`);
  };
  for (const s of STORIES) for (const c of s.chapters) c.objectives.forEach((/** @type {any} */ o, /** @type {number} */ i) => reach(o, `${s.id}/${c.id} objective ${i + 1}`));
  for (const f of FAVORS) if (f.objective) reach(f.objective, `favor ${f.id}`);
}

// ---------------------------------------------------------------------------
// Every path: walk each story through every combination of choices (and of the flags other stories set)
// and check that each chapter a player can reach has something to do, text to read and a way on.
// ---------------------------------------------------------------------------

{
  /** Canonical keys each story reads in a chapter or objective `when` or a requirement, and who sets what. */
  /** @type {Map<string, Set<string>>} */
  const reads = new Map();
  /** @type {Map<string, Set<string>>} key -> values set */
  const values = new Map();
  /** @type {Map<string, Set<string>>} key -> stories that set (or count) it */
  const setBy = new Map();
  /** @type {Set<string>} */
  const counters = new Set();
  /** @param {Map<string, Set<string>>} m @param {string} k @param {string} v */
  const put = (m, k, v) => (m.get(k) ?? m.set(k, new Set()).get(k))?.add(v);
  /** @param {string} sid @param {any} w */
  const read = (sid, w) => {
    for (const k of Object.keys(w ?? {})) put(reads, sid, canon(sid, k));
  };
  /** @param {string} sid @param {any[] | undefined} list */
  const scan = (sid, list) => {
    for (const c of list ?? []) {
      for (const [k, v] of Object.entries(c.set ?? {})) {
        put(values, canon(sid, k), String(v));
        put(setBy, canon(sid, k), sid);
      }
      for (const k of Object.keys(c.inc ?? {})) {
        counters.add(canon(sid, k));
        put(setBy, canon(sid, k), sid);
      }
      read(sid, c.requires?.flags);
      read(sid, c.requires?.minCount);
    }
  };
  for (const s of STORIES) {
    read(s.id, s.requires?.flags);
    for (const c of s.chapters) {
      read(s.id, c.when);
      scan(s.id, c.introChoices);
      scan(s.id, c.choices);
      for (const o of c.objectives) {
        read(s.id, o.when);
        scan(s.id, o.choices);
        if (o.set) scan(s.id, [{ set: o.set }]);
      }
    }
  }
  const relevant = new Set([...reads.values()].flatMap((x) => [...x]));
  /** @param {string | undefined} actual @param {string} want */
  const test = (actual, want) => {
    const w = String(want);
    if (w.startsWith(">=")) return Number(actual ?? 0) >= Number(w.slice(2));
    if (w.startsWith("<=")) return Number(actual ?? 0) <= Number(w.slice(2));
    if (w.startsWith("!")) return actual !== w.slice(1);
    return actual === w;
  };
  /** @param {any} when @param {Record<string, string>} F @param {string} sid */
  const holds = (when, F, sid) => !when || Object.entries(when).every(([k, v]) => test(F[canon(sid, k)], /** @type {string} */ (v)));
  /** Requirements on a choice: flags, counters, this story's chapters (other stories are assumed done). @param {any} req @param {Record<string, string>} F @param {string} sid @param {string[]} dn */
  const allowed = (req, F, sid, dn) =>
    !req ||
    (holds(req.flags, F, sid) &&
      Object.entries(req.minCount ?? {}).every(([k, n]) => Number(F[canon(sid, k)] ?? 0) >= Number(n)) &&
      (req.chapters ?? []).every((/** @type {string} */ ref) => !ref.startsWith(`${sid}/`) || dn.includes(ref.slice(sid.length + 1))));
  /** @param {Record<string, string>} F @param {string} sid @param {any} c */
  const pick = (F, sid, c) => {
    const G = { ...F };
    for (const [k, v] of Object.entries(c.set ?? {})) G[canon(sid, k)] = String(v);
    for (const [k, n] of Object.entries(c.inc ?? {})) G[canon(sid, k)] = String(Number(G[canon(sid, k)] ?? 0) + Number(n));
    return G;
  };
  /** @param {any[]} pages @param {Record<string, string>} F @param {string} sid */
  const shows = (pages, F, sid) => pages.some((p) => typeof p === "string" || holds(p.when, F, sid));
  /** @type {Map<string, Set<string>>} story -> chapters on every ending */
  const onEvery = new Map();
  /** @type {Set<string>} */
  const found = new Set();
  let paths = 0;
  for (const story of STORIES) {
    const sid = story.id;
    // Flags other stories set: every value (or none); counters 0 to the number of stories that add to them.
    // Installed packs: each `pack:` flag read is "off" or "on".
    const ext = [...(reads.get(sid) ?? [])].filter((k) => k.startsWith("pack:") || (!k.startsWith(`${sid}.`) && [...(setBy.get(k) ?? [])].some((x) => x !== sid)));
    /** @type {Record<string, string>[]} */
    let combos = [{}];
    for (const k of ext) {
      const vals = k.startsWith("pack:") ? ["off", "on"] : counters.has(k) ? Array.from({ length: Math.min(6, [...(setBy.get(k) ?? [])].filter((x) => x !== sid).length) + 1 }, (_, i) => (i ? String(i) : undefined)) : [undefined, ...(values.get(k) ?? [])];
      combos = combos.flatMap((c) => vals.map((v) => (v === undefined ? c : { ...c, [k]: v })));
    }
    /** @type {Set<string> | undefined} */
    let every;
    for (const start of combos) {
      const seen = new Set();
      /** @type {{ dn: string[], F: Record<string, string> }[]} */
      const stack = [{ dn: [], F: start }];
      while (stack.length) {
        const { dn, F } = /** @type {{ dn: string[], F: Record<string, string> }} */ (stack.pop());
        const key = `${dn.join(",")}|${JSON.stringify(Object.entries(F).filter(([k]) => relevant.has(k)).sort())}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ch = story.chapters.find((/** @type {any} */ c) => !dn.includes(c.id) && holds(c.when, F, sid));
        if (!ch) {
          paths++;
          every = every ? new Set([...every].filter((x) => dn.includes(x))) : new Set(dn);
          continue;
        }
        const at = `${sid}/${ch.id}`;
        const intro = (ch.introChoices ?? []).filter((/** @type {any} */ c) => allowed(c.requires, F, sid, dn));
        if (ch.introChoices?.length && !intro.length) found.add(`${at}: every intro choice is locked for some players`);
        for (const ic of intro.length ? intro : [undefined]) {
          const F1 = ic ? pick(F, sid, ic) : F;
          if (!shows(ch.intro, F1, sid)) found.add(`${at}: no intro page shows for some players`);
          let states = [F1];
          ch.objectives.forEach((/** @type {any} */ o, /** @type {number} */ i) => {
            states = states.flatMap((S) => {
              if (!holds(o.when, S, sid)) return [S];
              if (o.pages && !shows(o.pages, S, sid)) found.add(`${at} objective ${i + 1}: no page shows for some players`);
              const cs = (o.choices ?? []).filter((/** @type {any} */ c) => allowed(c.requires, S, sid, dn));
              if (o.choices?.length && !cs.length) found.add(`${at} objective ${i + 1}: every choice is locked for some players`);
              const after = cs.length ? cs.map((/** @type {any} */ c) => pick(S, sid, c)) : [S];
              // An optional objective's flags: done or not. An "either" member's: one way of the group is taken (below).
              return o.set && o.optional ? after.flatMap((A) => [A, pick(A, sid, o)]) : after;
            });
          });
          /** @type {Map<string, any[]>} */
          const eithers = new Map();
          for (const o of ch.objectives) if (o.or && !o.optional) eithers.set(o.or, [...(eithers.get(o.or) ?? []), o]);
          for (const members of eithers.values())
            states = states.flatMap((S) => {
              const here = members.filter((o) => holds(o.when, S, sid));
              return here.length ? here.map((o) => (o.set ? pick(S, sid, o) : S)) : [S];
            });
          for (const S of states) {
            if (!ch.objectives.some((/** @type {any} */ o) => !o.optional && holds(o.when, S, sid))) found.add(`${at}: no required objective applies for some players (flags ${JSON.stringify(S)})`);
            if (!shows(ch.outro, S, sid)) found.add(`${at}: no outro page shows for some players`);
            const outs = (ch.choices ?? []).filter((/** @type {any} */ c) => allowed(c.requires, S, sid, dn));
            if (ch.choices?.length && !outs.length) found.add(`${at}: every ending choice is locked for some players`);
            for (const oc of outs.length ? outs : [undefined]) stack.push({ dn: [...dn, ch.id], F: oc ? pick(S, sid, oc) : S });
          }
        }
        if (seen.size > 200000) {
          found.add(`${sid}: too many paths to walk`);
          stack.length = 0;
        }
      }
    }
    onEvery.set(sid, every ?? new Set());
  }
  for (const s of STORIES)
    for (const ref of s.requires?.chapters ?? []) {
      const [o, c] = String(ref).split("/");
      if (onEvery.has(o) && !onEvery.get(o)?.has(c)) found.add(`story ${s.id}: requires ${ref}, which some endings of ${o} skip (those players never get ${s.id})`);
    }
  // Stories that require each other (directly or around a loop) can never start.
  /** @param {string} id @param {string[]} trail */
  const loop = (id, trail) => {
    if (trail.includes(id)) return found.add(`stories require each other: ${[...trail, id].join(" -> ")}`);
    const s = STORIES.find((/** @type {any} */ x) => x.id === id);
    const next = [...(s?.requires?.stories ?? []), ...(s?.requires?.chapters ?? []).map((/** @type {string} */ r) => r.split("/")[0])];
    for (const n of new Set(next)) if (n !== id) loop(n, [...trail, id]);
  };
  for (const s of STORIES) loop(s.id, []);
  for (const f of found) errors.push(f);
  console.log(`check-stories: walked ${paths} endings through every choice`);
}

// The Kitchen's dishes and ingredients as objectives.js knows them (KITCHEN) must match the Cooking pack.
{
  const { readFileSync, existsSync } = await import("node:fs");
  const recipes = join(root, "packs", "cooking_bp", "scripts", "recipes.js");
  if (existsSync(recipes)) {
    const { DISHES, INGREDIENTS } = await import(pathToFileURL(recipes).href);
    const src = readFileSync(join(scripts, "objectives.js"), "utf8");
    /** @type {Map<string, string>} */
    const kitchen = new Map();
    for (const m of src.matchAll(/^\s+"([^"]+)": \{ item: "([^"]+)"(, rare: true)?(, ingredient: true)?/gm)) kitchen.set(m[1], `${m[2]}${m[3] ? " rare" : ""}${m[4] ? " ingredient" : ""}`);
    /** @param {string} name @param {string} want */
    const same = (name, want) => {
      const got = kitchen.get(name.toLowerCase());
      if (got !== want) errors.push(`objectives.js KITCHEN: "${name}" should be ${want} (has ${got ?? "nothing"}), as in cooking_bp/scripts/recipes.js`);
    };
    for (const d of DISHES) same(d.name, `${d.base}${d.tier === "rare" ? " rare" : ""}`);
    for (const i of INGREDIENTS) same(i.name, `${i.item} ingredient`);
  }
}

// Long pages are cut off or need scrolling in a Bedrock form.
{
  /** @param {string} at @param {any[] | undefined} list */
  const long = (at, list) => {
    for (const p of list ?? []) {
      const text = typeof p === "string" ? p : p?.text;
      if (typeof text === "string" && text.replace(/§./g, "").length > 450) warnings.push(`${at}: a page is ${text.replace(/§./g, "").length} characters (keep pages under 450)`);
    }
  };
  for (const s of STORIES)
    for (const c of s.chapters) {
      const at = `${s.id}/${c.id}`;
      long(`${at} intro`, c.intro);
      long(`${at} outro`, c.outro);
      for (const ch of [...(c.introChoices ?? []), ...(c.choices ?? [])]) long(`${at} reply`, ch.reply);
      for (const o of c.objectives) {
        long(`${at} pages`, o.pages);
        for (const ch of o.choices ?? []) long(`${at} reply`, ch.reply);
        long(`${at} clue`, (o.clues ?? []).map((/** @type {any} */ x) => x.text));
      }
    }
}

const seen = new Set();
for (const w of warnings) if (!seen.has(w)) seen.add(w);
for (const w of seen) console.warn(`check-stories: warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`check-stories: ${e}`);
  process.exit(1);
}
const chapters = STORIES.reduce((n, /** @type {any} */ s) => n + s.chapters.length, 0);
console.log(`check-stories: ${STORIES.length} stories, ${chapters} chapters, ${FAVORS.length} favors, ${readKeys.length} flag reads OK (${seen.size} warnings)`);
