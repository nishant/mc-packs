// Checks the Story Questlines content (packs/saga_bp/scripts/stories.js and stories/*.js) for what
// the engine relies on: known objective types and their fields, places, NPC ids, unique ids, champion
// tags, requirements. Flags read in a `when` or `requires.flags` that nothing sets are warnings.
// Runs as part of `npm run check`.
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
};

const storyIds = new Set(STORIES.map((/** @type {any} */ s) => s.id));
/** Flags something sets, as "g:<name>" or "<story>.<flag>". */
const setKeys = new Set();
/** Flags read, with where. @type {[string, string][]} */
const readKeys = [];

/** Canonical flag key as story `sid` names it. @param {string} sid @param {string} key */
function canon(sid, key) {
  if (key.startsWith("g:")) return key;
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
  for (const k of Object.keys(when ?? {})) readKeys.push([canon(sid, k), at]);
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
  for (const c of o.clues ?? []) if (typeof c.dx !== "number" || typeof c.dz !== "number") errors.push(`${at}: a clue needs dx and dz`);
}

const ids = new Set();
for (const s of STORIES) {
  const at = `story ${s.id}`;
  if (ids.has(s.id)) errors.push(`${at}: id used twice`);
  ids.add(s.id);
  if (!s.title || !s.short || !s.giver || !Array.isArray(s.chapters)) errors.push(`${at}: needs title, short, giver and chapters`);
  if ((s.short ?? "").length > 18) warnings.push(`${at}: short "${s.short}" is longer than 18 characters`);
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
}

for (const [key, at] of readKeys) {
  if (setKeys.has(key)) continue;
  warnings.push(`${at}: flag "${key}" is read but never set by any choice`);
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
