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

test("a started story waits on a removed pack: the log says which one it needs", () => {
  const code = `${between("export function packsNeeded", "\n}\n")}\n}\n({ packsNeeded })`;
  const run = (installed, cur) => runInNewContext(code, { installed, currentChapter: () => cur, matches: () => true }).packsNeeded;
  const st = { dn: ["a"], a: false };
  const saga = { s: { story: st } };
  const waiting = { id: "story", chapters: [{ id: "a" }, { id: "b", when: { "pack:cooking_bp": "on", "pack:elite_bp": "on", "x": "1" } }] };
  const names = (installed) => [...run(installed, undefined)(waiting, saga)];
  assert.deepEqual(names({ ready: true, set: new Set(["saga_bp"]) }), ["cooking_bp", "elite_bp"]);
  assert.deepEqual(names({ ready: true, set: new Set(["cooking_bp"]) }), ["elite_bp"]);
  assert.deepEqual(names({ ready: false, set: new Set() }), [], "no claim before the first scan answered");
  assert.deepEqual([...run({ ready: true, set: new Set() }, { chapter: {} })(waiting, saga)], [], "a chapter that is available needs nothing");
});
