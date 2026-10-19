import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const read = (p) => readFileSync(new URL(`../packs/saga_bp/scripts/${p}`, import.meta.url), "utf8");
const data = read("data.js");
const objectives = read("objectives.js");
const slice = (src, from, to) => {
  const a = src.indexOf(from);
  assert.ok(a >= 0, `has ${from}`);
  return src.slice(a, src.indexOf(to, a)).replaceAll("export ", "");
};

const save = runInNewContext(
  `const SAVE_LIMIT = 30000;\n${slice(data, "function byteLength", "/** Marks the player's progress")}\n({ byteLength, trimSave, saveRoom })`,
  {},
);

const codex = (n) => Array.from({ length: n }, (_, i) => `codex_entry_${i}`);
const favors = (n, done) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`npc${i}`, { id: `f${i}`, d: i, a: 1, c: done ? 1 : undefined, o: [1, 2, 3] }]));
const story = (i) => ({ dn: ["a", "b"], fin: 1, f: { k: "☃ ünï ✓".repeat(3) }, ch: { c: "x" }, x: { unknown: i }, o: [1, 2] });
const maxed = () => ({
  s: Object.fromEntries(Array.from({ length: 59 }, (_, i) => [`story${i}`, story(i)])),
  g: { choice: "日本語のテキスト".repeat(20), mystery: { keep: true } },
  cx: codex(900),
  fv: { ...favors(120, true), active: { id: "now", d: 999, a: 1, o: [0] } },
  ut: Array.from({ length: 40 }, (_, i) => `wv:${"é".repeat(40)}${i}`),
  future: { field: [1, 2, 3] },
});

test("a maxed multibyte save is trimmed under the limit, in bytes", () => {
  const saga = maxed();
  assert.ok(save.byteLength(JSON.stringify(saga)) > 30000, "the fixture is over the limit");
  const json = save.trimSave(saga);
  assert.ok(save.byteLength(json) <= 30000, `${save.byteLength(json)} bytes`);
  assert.ok(json.length <= 30000);
});

test("trimming drops only ut, finished favors and codex order: everything else survives", () => {
  const saga = maxed();
  const before = JSON.parse(JSON.stringify(saga));
  const out = JSON.parse(save.trimSave(saga));
  assert.deepEqual(out.s, before.s, "story choices, flags, progress and unknown story fields");
  assert.deepEqual(out.g, before.g, "player-wide flags");
  assert.deepEqual(out.future, before.future, "unknown top-level fields");
  assert.equal(out.fv.active.id, "now", "an active favor is never trimmed");
});

test("a save under the limit is untouched", () => {
  const saga = { s: { a: story(1) }, cx: codex(5), ut: ["x"] };
  const copy = JSON.parse(JSON.stringify(saga));
  assert.deepEqual(JSON.parse(save.trimSave(saga)), copy);
});

test("no room left once trimming cannot make space: new codex entries are refused", () => {
  const huge = { s: Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`s${i}`, story(i)])), cx: [] };
  assert.ok(save.saveRoom(huge) < 100);
  assert.ok(save.saveRoom({ s: {} }) > 20000);
});

const champion = runInNewContext(`${slice(objectives, "const sessionChampions", "/** Every dimension's")}\n({ sessionChampions, staleChampion, trackChampion })`, {
  CHAMPION_TAG: "saga:champion",
});
const ent = (id, tags) => ({ id, hasTag: (t) => tags.includes(t) });

test("a saga champion loaded later that this session did not spawn is stale; ours and other entities are not", () => {
  champion.trackChampion(ent("mine", ["saga:champion"]));
  assert.equal(champion.staleChampion(ent("mine", ["saga:champion"])), false);
  assert.equal(champion.staleChampion(ent("old", ["saga:champion"])), true);
  assert.equal(champion.staleChampion(ent("other", ["something"])), false);
});
