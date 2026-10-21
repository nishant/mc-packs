// The per-player sweep spreader (tools/spread-shared.js, copied into packs as scripts/spread.js): every player is
// visited exactly once per round, `every` ticks apart, a fair share per run, and keeps their slot across rounds.
//   node --test tools/spread-shared.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { assignShares, spreadPlayers } from "./spread-shared.js";

/** A fake system/world: runInterval(cb, n) runs cb every n ticks of step(). */
function fakeGame() {
  const timers = [];
  let tick = 0;
  const players = [];
  const leaves = [];
  return {
    players,
    /** A player leaves: gone from the list, and the world's playerLeave event fires. */
    leave(p) {
      p.isValid = false;
      for (const cb of leaves) cb({ playerId: p.id });
    },
    get tick() {
      return tick;
    },
    system: { runInterval: (cb, n = 1) => timers.push({ cb, n, at: n }) - 1 },
    world: { getAllPlayers: () => players.filter((p) => p.isValid), afterEvents: { playerLeave: { subscribe: (cb) => leaves.push(cb) } } },
    step(n = 1) {
      for (let i = 0; i < n; i++) {
        tick++;
        for (const t of timers) if (tick >= t.at) (t.at += t.n), t.cb();
      }
    },
  };
}
const mk = (id) => ({ id, isValid: true });

test("assignShares: fair shares, stable slots, overflow moves to the emptiest share", () => {
  const ps = Array.from({ length: 40 }, (_, i) => mk(`p${i}`));
  const a = assignShares(new Map(), ps, 10);
  assert.deepEqual(a.shares.map((s) => s.length), Array(10).fill(4));
  const b = assignShares(a.slots, ps, 10);
  for (const p of ps) assert.equal(b.slots.get(p.id), a.slots.get(p.id), "a player keeps their slot");
  // Everyone in slot 0 leaves: the rest keep their slots, newcomers fill slot 0 first.
  const left = ps.filter((p) => a.slots.get(p.id) !== 0);
  const fresh = [mk("n1"), mk("n2")];
  const c = assignShares(a.slots, [...left, ...fresh], 10);
  for (const p of left) assert.equal(c.slots.get(p.id), a.slots.get(p.id));
  assert.equal(c.slots.get("n1"), 0);
  assert.equal(c.slots.get("n2"), 0);
  assert.ok(Math.max(...c.shares.map((s) => s.length)) <= Math.ceil(38 / 10));
});

test("spreadPlayers: each player once per round, every `every` ticks, at most ceil(n / parts) per run", () => {
  const g = fakeGame();
  for (let i = 0; i < 40; i++) g.players.push(mk(`p${i}`));
  /** @type {Map<string, number[]>} */
  const seen = new Map();
  let maxShare = 0;
  let starts = 0;
  spreadPlayers(g.system, g.world, {
    every: 20,
    parts: 10,
    start: (all) => {
      starts++;
      assert.equal(all.length, g.players.filter((p) => p.isValid).length);
    },
    visit: (share) => {
      maxShare = Math.max(maxShare, share.length);
      for (const p of share) seen.set(p.id, [...(seen.get(p.id) ?? []), g.tick]);
    },
  });
  g.step(200);
  assert.equal(starts, 10);
  assert.equal(maxShare, 4);
  for (const [, ticks] of seen) {
    assert.equal(ticks.length, 10);
    for (let i = 1; i < ticks.length; i++) assert.equal(ticks[i] - ticks[i - 1], 20, "the player's own cadence stays 20 ticks");
  }
});

test("spreadPlayers: a player who left mid-round is skipped; a newcomer joins the next round", () => {
  const g = fakeGame();
  for (let i = 0; i < 4; i++) g.players.push(mk(`p${i}`));
  const visits = [];
  spreadPlayers(g.system, g.world, { every: 20, parts: 4, visit: (share, at) => visits.push(...share.map((p) => `${at.round}:${at.part}:${p.id}`)) });
  g.step(5); // round 1, part 0 ran
  g.leave(g.players[3]);
  g.players.push(mk("new"));
  g.step(15);
  assert.ok(!visits.some((v) => v.endsWith(":p3")), "the leaver isn't visited");
  assert.ok(!visits.some((v) => v.endsWith(":new")), "the newcomer waits for the next round");
  g.step(20);
  assert.ok(visits.some((v) => v.startsWith("2:") && v.endsWith(":new")));
});

test("spreadPlayers: every must be a multiple of parts", () => {
  const g = fakeGame();
  assert.throws(() => spreadPlayers(g.system, g.world, { every: 20, parts: 3, visit() {} }));
});

test("spreadPlayers: a visit never reads isValid (on a handle kept from an earlier tick it makes the reads after it dear)", () => {
  const g = fakeGame();
  let reads = 0;
  for (let i = 0; i < 10; i++) {
    const p = { id: `p${i}`, valid: true };
    Object.defineProperty(p, "isValid", { get: () => (reads++, p.valid), set: (v) => (p.valid = v) });
    g.players.push(p);
  }
  let visited = 0;
  spreadPlayers(g.system, { getAllPlayers: () => g.players, afterEvents: g.world.afterEvents }, { every: 20, parts: 10, visit: (share) => (visited += share.length) });
  g.step(200);
  assert.equal(visited, 100);
  assert.equal(reads, 0, `${reads} isValid reads`);
});

test("spreadPlayers: an error in a visit is caught, and the next share still runs", () => {
  const g = fakeGame();
  for (let i = 0; i < 4; i++) g.players.push(mk(`p${i}`));
  const seen = [];
  const warn = console.warn;
  console.warn = () => {};
  try {
    spreadPlayers(g.system, g.world, { every: 20, parts: 4, visit: (share, at) => { if (at.part === 0) throw new Error("left"); seen.push(...share.map((p) => p.id)); } });
    g.step(20);
  } finally {
    console.warn = warn;
  }
  assert.equal(seen.length, 3);
});
