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
  `const SAVE_LIMIT = 30000;\n${slice(data, "function byteLength", "/** Marks the player's progress")}\n({ byteLength, trimSave, saveRoom, codexFits })`,
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

const grant = runInNewContext(`${slice(objectives, "/**\n * Adds a codex entry unless", "function crownsObjective")}\n({ grantCodex })`, {
  codexFits: save.codexFits,
  markDirty: () => (grant.dirty += 1),
  console: { warn() {} },
});
grant.dirty = 0;
const player = () => ({ name: "P", said: [], sendMessage(m) { this.said.push(m); } });
const nearFull = () => {
  const saga = { s: {}, g: { keep: "x" }, cx: [], ut: [] };
  let i = 0;
  while (save.saveRoom(saga) > 120) saga.s[`s${i++}`] = { dn: ["a"], f: { k: "v".repeat(40) }, ch: {}, x: { unknown: i } };
  return saga;
};

test("a nearly full save still takes a codex entry when the allowed trim makes room (old codex, finished favor, tracking list)", () => {
  const saga = nearFull();
  saga.cx = codex(40);
  saga.ut = ["wv:one", "wv:two"];
  assert.ok(save.saveRoom(saga) < 200, "the old check would have refused");
  const p = player();
  grant.grantCodex(p, saga, { id: "new_entry", title: "New" });
  assert.ok(saga.cx.includes("new_entry"), "added");
  assert.match(p.said[0], /New entry/);
  const out = JSON.parse(save.trimSave(saga));
  assert.ok(out.cx.includes("new_entry"), "the newest entry survives the flush trim");
  assert.deepEqual(out.s, saga.s, "stories untouched");
  assert.deepEqual(out.g, { keep: "x" }, "flags untouched");
});

test("over the limit even after the allowed trim: refused, and nothing in the save changes", () => {
  const saga = { s: Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`s${i}`, story(i)])), cx: codex(3), ut: ["wv:a"] };
  const before = JSON.stringify(saga);
  const p = player();
  grant.grantCodex(p, saga, { id: "new_entry", title: "New" });
  assert.equal(JSON.stringify(saga), before, "the real save is not trimmed or changed by the check");
  assert.match(p.said[0], /not added/);
});

// The real reward() -> grantCodex -> markDirty -> flush(), writing through player.setDynamicProperty.
const flow = runInNewContext(
  `const SAVE_LIMIT = 30000; const PROP_PLAYER = "saga:player";\n${slice(data, "const cache = new Map();", "export function flushAll")}\n${slice(objectives, "export function reward(", "function crownsObjective")}\n({ cache, reward, flush })`,
  { sagaOf: (p) => flow.cache.get(p.id), send() {}, giveItem() {}, plain: (s) => s, itemName: (s) => s, addCrowns: () => false, console: { warn() {} }, Math },
);

test("reward() with a codex entry on a nearly full save flushes a trimmed save under 30000 bytes that keeps the new entry", () => {
  const saga = nearFull();
  saga.cx = codex(40);
  saga.ut = ["wv:one", "wv:two"];
  const writes = [];
  const p = { id: "p1", name: "P", isValid: true, said: [], sendMessage(m) { this.said.push(m); }, setDynamicProperty: (k, v) => writes.push([k, v]) };
  flow.cache.set("p1", saga);
  flow.reward(p, { codex: { id: "new_entry", title: "New" } }, "test");
  flow.flush("p1");
  assert.equal(writes.length, 1);
  assert.ok(save.byteLength(writes[0][1]) <= 30000, `${save.byteLength(writes[0][1])} bytes`);
  const out = JSON.parse(writes[0][1]);
  assert.ok(out.cx.includes("new_entry"));
  assert.deepEqual(out.s, saga.s);
  assert.match(p.said[0], /New entry/);
});

test("a roomy save and a repeated entry behave as before", () => {
  const saga = { s: {}, cx: ["a"] };
  const p = player();
  grant.grantCodex(p, saga, { id: "b", title: "B" });
  grant.grantCodex(p, saga, { id: "b", title: "B" });
  assert.deepEqual(saga.cx, ["a", "b"]);
  assert.equal(p.said.length, 1);
});

test("main.js keeps checkStories in worldLoad and subscribes entityLoad at the top level", () => {
  const main = read("main.js");
  const wl = main.slice(main.indexOf("world.afterEvents.worldLoad.subscribe"));
  const body = wl.slice(0, wl.indexOf("\n});") + 4);
  assert.match(body, /checkStories\(\);/);
  assert.doesNotMatch(body, /entityLoad/);
  assert.match(main, /^world\.afterEvents\.entityLoad\.subscribe\(\(e\) => sweepLoadedChampion\(e\.entity\)\);/m);
});

// The session list is champions-session.js as it ships; staleChampion and the sweep come from objectives.js.
const session = await import(new URL("../packs/saga_bp/scripts/champions-session.js", import.meta.url).href);
const sliced = runInNewContext(`${slice(objectives, "/** A tagged champion that this session did not spawn", "/** Every dimension's")}\n({ staleChampion })`, {
  CHAMPION_TAG: "saga:champion",
  sessionChampion: session.sessionChampion,
});
const champion = { staleChampion: sliced.staleChampion, trackChampion: (e) => session.trackChampion(e.id) };
const ent = (id, tags) => ({ id, hasTag: (t) => tags.includes(t) });

test("a saga champion loaded later that this session did not spawn is stale; ours and other entities are not", () => {
  champion.trackChampion(ent("mine", ["saga:champion"]));
  assert.equal(champion.staleChampion(ent("mine", ["saga:champion"])), false);
  assert.equal(champion.staleChampion(ent("old", ["saga:champion"])), true);
  assert.equal(champion.staleChampion(ent("other", ["something"])), false);
});
