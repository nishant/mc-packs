import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { MORE_STORIES as STORIES } from "../packs/saga_bp/scripts/stories/index.js";

const data = readFileSync(new URL("../packs/saga_bp/scripts/data.js", import.meta.url), "utf8");
const between = (from, to) => {
  const a = data.indexOf(from);
  assert.ok(a >= 0, `data.js has ${from}`);
  return data.slice(a, data.indexOf(to, a)).replaceAll("export ", "");
};

const story = STORIES.find((s) => s.id === "hearth_and_table");
const hearts = story.chapters.find((c) => c.id === "hearts");
const gristle = hearts.objectives.map((o, i) => ({ o, i })).filter(({ o }) => o.champion?.tag === "realm:saga:gristle");
const collect = hearts.objectives.findIndex((o) => o.type === "collect" && o.name === "Champion's Heart");

// The engine's own "either" test (objDone), with `when` driven by a pack set.
function engine(packs) {
  const code = `${between("export function target", "/** Does this objective exist")}
const objApplies = (e, obj) => matches(obj.when);
const progressOf = (e, i) => e.st.o?.[i] ?? 0;
const reached = (e, i) => progressOf(e, i) >= target(e.chapter.objectives[i]);
${between("export function objDone", "/** Every required objective")}
({ objDone })`;
  const matches = (when) => !when || Object.entries(when).every(([k, v]) => (k.startsWith("pack:") ? (packs.has(k.slice(5)) ? "on" : "off") === v : false));
  return runInNewContext(code, { matches });
}
const entry = (o) => ({ story, chapter: hearts, st: { o } });
const both = new Set(["cooking_bp", "elite_bp"]);

test("both Gristle objectives and the heart collect are one 'either' group", () => {
  assert.equal(gristle.length, 2);
  const group = new Set([...gristle.map(({ o }) => o.or), hearts.objectives[collect].or]);
  assert.equal(group.size, 1);
  assert.ok([...group][0], "the group has an id");
});

test("a Gristle kill under one pack set still counts after the packs change", () => {
  const [a, b] = gristle.map(({ i }) => i);
  const kill = { [a]: 1 };
  // Killed with cooking missing, then cooking comes back with elite still off: the other Gristle step shows.
  const { objDone } = engine(new Set(["cooking_bp"]));
  assert.equal(objDone(entry(kill), b), true, "the kill is not asked for twice");
  // Killed, then both packs return: the 2-hearts step is not asked for again.
  const back = engine(both);
  assert.equal(back.objDone(entry(kill), collect), true, "the hearts step doesn't come back after the kill");
});

test("with no kill and no hearts the active step still needs doing", () => {
  const { objDone } = engine(new Set(["cooking_bp"]));
  assert.equal(objDone(entry({}), gristle[1].i), false);
});

// The real stories that need a pack (story.requires.flags): listening_deep (expedition_bp) and the_calling (skills_bp).
const needsFn = (installed) => runInNewContext(`${between("export function packsNeeded", "\n}\n")}\n}\n({ packsNeeded })`, { installed }).packsNeeded;
const byId = (id) => STORIES.find((s) => s.id === id);
const gone = { ready: true, set: new Set(["saga_bp"]) };

test("real stories: an accepted chapter of listening_deep and the_calling still names the missing pack", () => {
  const deep = byId("listening_deep");
  const calling = byId("the_calling");
  const accepted = (story) => ({ s: { [story.id]: { dn: [], a: 1, cur: story.chapters[0].id, o: [] } } });
  assert.deepEqual([...needsFn(gone)(deep, accepted(deep))], ["expedition_bp"]);
  assert.deepEqual([...needsFn(gone)(calling, accepted(calling))], ["skills_bp"]);
  const midway = { s: { the_calling: { dn: [calling.chapters[0].id], a: 0, o: [] } } };
  assert.deepEqual([...needsFn(gone)(calling, midway)], ["skills_bp"], "between chapters too");
});

test("real stories: nothing is claimed with the pack present, before the scan, or when not started or finished", () => {
  const deep = byId("listening_deep");
  const saga = { s: { listening_deep: { dn: [], a: 1, cur: deep.chapters[0].id, o: [] } } };
  assert.deepEqual([...needsFn({ ready: true, set: new Set(["expedition_bp"]) })(deep, saga)], []);
  assert.deepEqual([...needsFn({ ready: false, set: new Set() })(deep, saga)], [], "no claim before the first scan answered");
  assert.deepEqual([...needsFn(gone)(deep, { s: {} })], [], "never started");
  assert.deepEqual([...needsFn(gone)(deep, { s: { listening_deep: { dn: ["x"], fin: 1, o: [] } } })], [], "finished");
});

test("Current quests asks packsNeeded for every started story, not only when no chapter is on offer", () => {
  const ui = readFileSync(new URL("../packs/saga_bp/scripts/ui.js", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /e \|\| cur \? \[\] : packsNeeded/);
  assert.match(ui, /const needs = packsNeeded\(story, saga\);\n\s+const step = needs\.length/);
});

