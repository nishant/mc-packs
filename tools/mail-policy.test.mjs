import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const { planSystemLetter, isSystem } = await import(pathToFileURL(resolve("packs/mail_bp/scripts/policy.js")).href);
const P = { systemInboxLimit: 20, systemLetterDays: 30, systemReserve: 1000, maxLetters: 5000 };
const NOW = 1_800_000_000_000;
const DAY = 86400000;

// Runs the plan the way mail_send does: delete what it says, then store the letter.
function deliver(store, to, now, id) {
  const plan = planSystemLetter(store.values(), to, now, P);
  for (const d of plan.drop) store.delete(d);
  if (plan.ok) store.set(id, { id, f: "", t: to, at: now, r: 0, di: 0 });
  return plan.ok;
}

test("mail_bp routes pack letters through the policy and the config has its options", () => {
  const main = readFileSync("packs/mail_bp/scripts/main.js", "utf8");
  assert.match(main, /planSystemLetter\(/);
  assert.doesNotMatch(main.slice(main.indexOf('"realm:mail_send"')), /letters\(\)\.size >= MAX_LETTERS\) return console\.warn\("\[mail\] mail_send/);
  const cfg = readFileSync("packs/mail_bp/scripts/config.js", "utf8");
  for (const k of ["systemInboxLimit", "systemLetterDays", "systemReserve"]) assert.match(cfg, new RegExp(`${k}:`));
});

test("400 absent players cannot fill the realm with pack letters", () => {
  const store = new Map();
  let id = 1;
  for (let round = 0; round < 50; round++) for (let p = 0; p < 400; p++) deliver(store, `p${p}`, NOW + round, id++);
  assert.ok(store.size <= 4000, `pack letters stop at 4000 (${store.size})`);
  // Each inbox keeps at most 20, so 400 players hold at most 8000: the reserve is what stops the rest.
  const per = new Map();
  for (const l of store.values()) per.set(l.t, (per.get(l.t) ?? 0) + 1);
  assert.ok(Math.max(...per.values()) <= 20);
});

test("a player letter is still accepted when pack letters hit their ceiling", () => {
  const store = new Map();
  for (let i = 0; i < 4000; i++) store.set(i, { id: i, f: "", t: `p${i % 400}`, at: NOW, r: 1, di: 0 });
  assert.equal(planSystemLetter(store.values(), "x", NOW, P).ok, false);
  assert.ok(store.size + 1 < P.maxLetters, "the send path's own 5000 check still has 1000 free");
});

test("a newer pack letter pushes out the oldest pack letter of that inbox, never a player letter", () => {
  const letters = [];
  for (let i = 1; i <= 20; i++) letters.push({ id: i, f: "", t: "a", at: NOW - 1000 + i, r: 0, di: 0 });
  for (let i = 100; i < 160; i++) letters.push({ id: i, f: "steve-id", t: "a", at: NOW - 5 * DAY, r: 0, di: 0 });
  const plan = planSystemLetter(letters, "a", NOW, P);
  assert.deepEqual(plan.drop, [1]);
  assert.ok(plan.ok);
});

test("pack letters older than the retention are dropped, player letters of any age are kept", () => {
  const letters = [
    { id: 1, f: "", t: "a", at: NOW - 31 * DAY, r: 0, di: 0 },
    { id: 2, f: "", t: "a", at: NOW - 29 * DAY, r: 0, di: 0 },
    { id: 3, f: "pid", t: "a", at: NOW - 900 * DAY, r: 0, di: 0 },
  ];
  assert.deepEqual(planSystemLetter(letters, "b", NOW, P).drop, [1]);
});

test("a legacy letter with no sent time is never treated as epoch 0 and expired", () => {
  const letters = [
    { id: 1, f: "", t: "a", r: 0, di: 0 },
    { id: 2, f: "", t: "a", at: 0, r: 0, di: 0 },
    { id: 3, f: "", t: "a", at: NaN, r: 0, di: 0 },
  ];
  assert.deepEqual(planSystemLetter(letters, "b", NOW, P).drop, []);
});

test("unknown sender types are not classified as pack letters", () => {
  assert.equal(isSystem({ f: "" }), true);
  assert.equal(isSystem({ f: "123" }), false);
  assert.equal(isSystem({ f: undefined }), false);
  assert.equal(isSystem({ f: null }), false);
  assert.equal(isSystem({}), false);
});
