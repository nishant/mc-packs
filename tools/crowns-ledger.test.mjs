// Crowns audit ledger and daily pay limit (audit O30), through the real pack: pay, give, the limit and the audit list.
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

const T0 = Date.UTC(2026, 9, 19, 23, 59, 0);
const DAY = 86400000;

function scoreboard() {
  const scores = new Map();
  const identities = new Map();
  const obj = {
    getScore: (p) => scores.get(p.id),
    addScore(p, n) {
      scores.set(p.id, (scores.get(p.id) ?? 0) + n);
      return scores.get(p.id);
    },
    getScores: () => [...scores].map(([id, score]) => ({ participant: { id, type: "Player", displayName: id }, score })),
  };
  return { getObjective: () => obj, addObjective: () => obj, scores, identities };
}

async function world({ cfg, ledger } = {}) {
  const sim = createSim();
  if (cfg) sim.props.set("crowns:cfg", JSON.stringify(cfg));
  if (ledger !== undefined) sim.props.set("crowns:ledger", ledger);
  await sim.load("crowns_bp");
  const sb = scoreboard();
  sim.server.world.scoreboard = sb;
  sim.boot();
  const give = (p, n) => sb.getObjective().addScore(p, n);
  return { sim, sb, give, bal: (p) => sb.scores.get(p.id) ?? 0, ledger: () => JSON.parse(sim.props.get("crowns:ledger") ?? "[]") };
}

let realNow;
test.beforeEach(() => {
  realNow = Date.now;
  Date.now = () => T0;
});
test.afterEach(() => {
  Date.now = realNow;
});

test("O30: a successful pay is one ledger entry and a failed pay is none", async () => {
  const w = await world();
  const a = w.sim.join("Ann");
  const b = w.sim.join("Bob");
  w.give(a, 100);
  w.sim.run("realm:crowns_pay", a, [b], 30);
  w.sim.run("realm:crowns_pay", a, [b], 500); // more than she has
  w.sim.run("realm:crowns_pay", a, [a], 5); // herself
  assert.equal(w.bal(a), 70);
  assert.equal(w.bal(b), 30);
  const l = w.ledger();
  assert.equal(l.length, 1);
  assert.deepEqual(l[0].slice(1), ["p", "Ann", "Bob", 30]);
  assert.equal(l[0][0], T0);
});

test("O30: the ledger keeps the last 200 and stays under 32,767 UTF-8 bytes with long multibyte names", async () => {
  const w = await world({ cfg: { dailyPayLimit: 0 } });
  const name = "\u00e9".repeat(40);
  const a = w.sim.join(name);
  const b = w.sim.join("\u20ac".repeat(40));
  w.give(a, 1_000_000);
  for (let i = 1; i <= 230; i++) w.sim.run("realm:crowns_pay", a, [b], i);
  const text = w.sim.props.get("crowns:ledger");
  assert.ok(Buffer.byteLength(text, "utf8") < 32767, `bytes ${Buffer.byteLength(text, "utf8")}`);
  const l = JSON.parse(text);
  assert.ok(l.length <= 200 && l.length >= 100, `kept ${l.length}`);
  assert.equal(l.at(-1)[4], 230, "the newest is last");
  assert.equal(w.bal(b), (230 * 231) / 2, "every payment moved its funds");
});

test("O30: the daily limit counts only successful pays, refuses the one that would pass it with no funds moved, and resets on the next UTC day", async () => {
  const w = await world({ cfg: { dailyPayLimit: 1000 } });
  const a = w.sim.join("Ann");
  const b = w.sim.join("Bob");
  w.give(a, 5000);
  w.sim.run("realm:crowns_pay", a, [b], 600);
  w.sim.run("realm:crowns_pay", a, [b], 500); // 1,100 > 1,000
  assert.equal(w.bal(a), 4400);
  assert.equal(w.bal(b), 600);
  assert.match(a.messages.at(-1), /400/);
  w.sim.run("realm:crowns_pay", a, [b], 9999); // too much: refused before the limit counts it
  w.sim.run("realm:crowns_pay", a, [b], 400);
  assert.equal(w.bal(b), 1000);
  w.sim.run("realm:crowns_pay", a, [b], 1);
  assert.equal(w.bal(b), 1000, "at the limit");
  assert.equal(w.ledger().length, 2);
  Date.now = () => T0 + 61_000; // 00:00:01 UTC the next day
  w.sim.run("realm:crowns_pay", a, [b], 1000);
  assert.equal(w.bal(b), 2000);
  assert.equal(w.ledger().length, 3);
});

test("O30: a limit of 0 is no limit, and the limit is per sender", async () => {
  const w = await world({ cfg: { dailyPayLimit: 0 } });
  const a = w.sim.join("Ann");
  const b = w.sim.join("Bob");
  w.give(a, 100000);
  w.sim.run("realm:crowns_pay", a, [b], 90000);
  assert.equal(w.bal(b), 90000);
  const w2 = await world({ cfg: { dailyPayLimit: 100 } });
  const c = w2.sim.join("Cy");
  const d = w2.sim.join("Di");
  w2.give(c, 500);
  w2.give(d, 500);
  w2.sim.run("realm:crowns_pay", c, [d], 100);
  w2.sim.run("realm:crowns_pay", d, [c], 100);
  assert.equal(w2.bal(c), 500);
  assert.equal(w2.ledger().length, 2);
});

test("O30: the default limit is on and applies to an existing world with no saved settings", async () => {
  const w = await world();
  const a = w.sim.join("Ann");
  const b = w.sim.join("Bob");
  w.give(a, 1_000_000);
  w.sim.run("realm:crowns_pay", a, [b], 100000);
  w.sim.run("realm:crowns_pay", a, [b], 100000);
  w.sim.run("realm:crowns_pay", a, [b], 100000);
  assert.ok(w.bal(b) <= 250000 && w.bal(b) >= 100000, `paid ${w.bal(b)}`);
});

test("O30: gives are recorded once per batch, with the amount that actually applied, and a no-op give records nothing", async () => {
  const w = await world();
  const op = w.sim.join("Op", { op: true });
  const a = w.sim.join("Ann");
  const b = w.sim.join("Bob");
  w.sim.run("realm:crowns_give", op, [a], 50);
  assert.deepEqual(w.ledger().at(-1).slice(1), ["g", "Op", "Ann", 50]);
  w.sim.run("realm:crowns_give", op, [a, b], 10);
  const batch = w.ledger().at(-1);
  assert.equal(batch[1], "g");
  assert.equal(batch[3], "2 players");
  assert.equal(batch[4], 20);
  const n = w.ledger().length;
  w.sim.run("realm:crowns_give", op, [b], -999); // takes only what Bob has
  assert.equal(w.bal(b), 0);
  assert.equal(w.ledger().at(-1)[4], -10);
  w.sim.run("realm:crowns_give", op, [b], -5); // Bob has none: nothing happened
  assert.equal(w.ledger().length, n + 1);
});

test("O30: old and unknown ledger data survive: extra fields are kept and bad entries or a corrupt value start clean", async () => {
  const old = JSON.stringify([[1, "p", "X", "Y", 5, "future"], "junk", [2, "g"]]);
  const w = await world({ ledger: old });
  const a = w.sim.join("Ann");
  const b = w.sim.join("Bob");
  w.give(a, 10);
  w.sim.run("realm:crowns_pay", a, [b], 5);
  const l = w.ledger();
  assert.equal(l.length, 2);
  assert.deepEqual(l[0], [1, "p", "X", "Y", 5, "future"]);
  const bad = await world({ ledger: "{not json" });
  const c = bad.sim.join("Cy");
  const d = bad.sim.join("Di");
  bad.give(c, 10);
  bad.sim.run("realm:crowns_pay", c, [d], 5);
  assert.equal(bad.ledger().length, 1);
});

test("O30: /realm:crowns_audit lists the newest entries for an operator and refuses a de-opped one", async () => {
  const w = await world();
  const op = w.sim.join("Op", { op: true });
  const a = w.sim.join("Ann");
  const b = w.sim.join("Bob");
  w.give(a, 100);
  w.sim.run("realm:crowns_pay", a, [b], 30);
  w.sim.run("realm:crowns_audit", op);
  const f = await w.sim.nextForm();
  assert.match(f.form.bodyText, /Ann/);
  assert.match(f.form.bodyText, /Bob/);
  assert.match(f.form.bodyText, /30/);
  assert.doesNotMatch(f.form.bodyText, /[^\x20-\x7e\n\u00a7]/);
  w.sim.answer({ canceled: true });
  op.commandPermissionLevel = 0;
  w.sim.run("realm:crowns_audit", op);
  await w.sim.settle();
  assert.equal(w.sim.pending.length, 0);
});
