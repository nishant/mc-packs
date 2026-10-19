import assert from "node:assert/strict";
import test from "node:test";
import scenario from "./examples/saga-perf-quests.js";

/**
 * A stand-in for the harness: simulated players, the npc form chain (one "Accept" page per quest) and saga's
 * realm:side quest box. faults: spawnFail (player numbers that fail to spawn), acceptFail (player names whose accept
 * times out), noSecond (names whose box never lists the second quest), dropAt (name -> tick the player leaves).
 */
function run(args, faults = {}) {
  let tick = 0;
  const reports = [];
  const failed = [];
  let listener;
  const pending = new Map();
  const names = new Map();
  const lastKey = new Map();
  const emit = (player, text) => listener({ id: "realm:side", message: JSON.stringify({ player, from: "saga", slot: "quest", text }) });
  const t = {
    args,
    get tick() { return tick; },
    system: {
      get currentTick() { return tick; },
      afterEvents: { scriptEventReceive: { subscribe: (cb) => { listener = cb; } } },
      sendScriptEvent(id, message) {
        if (id !== "realm:npc_choose") return;
        const m = JSON.parse(message);
        lastKey.set(m.player, m.key);
        pending.get(m.player)?.({
          buttons: ["Accept"],
          answer: () => {
            const name = names.get(m.player);
            if (m.key === "start:drowned_bell") emit(m.player, "Drowned Bell: Choir");
            else if (!faults.noSecond?.includes(name)) emit(m.player, "Last Map: Ink\nDrowned Bell: Choir");
          },
        });
      },
    },
    world: { getDefaultSpawnLocation: () => ({ x: 163, y: 70, z: 170 }), getDimension: () => ({ runCommand() {} }) },
    server() {},
    log() {},
    report: (name, data) => reports.push({ name, data }),
    assert(ok, message) { if (!ok) throw new Error(message); },
    check(ok, message) { if (!ok) failed.push(message); },
    async wait(n) { tick += n; },
    waitForm(p) {
      return new Promise((resolve, reject) => {
        if (faults.acceptFail?.includes(p.name)) return reject(new Error("form timeout"));
        pending.set(p.id, resolve);
      });
    },
    async player(name) {
      const n = Number(name.slice(4));
      if (faults.spawnFail?.includes(n)) throw new Error("no spawn");
      const p = {
        id: `id-${name}`, name, location: { x: 0, y: 70, z: 0 }, moveToLocation() {}, lookAtLocation() {},
        get isValid() { return !(faults.dropAt?.[name] <= tick); },
      };
      names.set(p.id, name);
      return p;
    },
  };
  const done = scenario(t).then(() => ({ reports, failed, thrown: null }), (e) => ({ reports, failed, thrown: e }));
  return done;
}

const base = { players: "10", seconds: "10" };

test("a complete 10 player population passes with the whole workload reported", async () => {
  const r = await run(base);
  assert.equal(r.thrown, null);
  assert.deepEqual(r.failed, []);
  const d = r.reports.at(-1).data;
  assert.equal(r.reports.at(-1).name, "saga-quest-workload");
  assert.equal(d.declared, 10);
  assert.equal(d.spawned, 10);
  assert.equal(d.quested, 10);
  assert.equal(d.retained, 10);
  assert.equal(d.minValid, 10);
  assert.ok(d.endGameTick - d.startGameTick >= 200);
});

test("a partial spawn fails the scenario and keeps the numbers", async () => {
  const r = await run(base, { spawnFail: [4, 5, 6] });
  assert.match(String(r.thrown), /spawned 7 of 10/);
  const d = r.reports.at(-1).data;
  assert.equal(d.spawned, 7);
  assert.equal(d.declared, 10);
});

test("a failed quest accept fails, naming the player", async () => {
  const r = await run(base, { acceptFail: ["Saga03"] });
  assert.equal(r.thrown, null);
  assert.equal(r.failed.length, 1);
  assert.match(r.failed[0], /Saga03 accept failed/);
  assert.equal(r.reports.at(-1).data.quested, 9);
});

test("a player whose second quest never shows is not counted as questing", async () => {
  const r = await run(base, { noSecond: ["Saga07"] });
  assert.equal(r.failed.length, 1);
  assert.match(r.failed[0], /Saga07 never showed both quests/);
  assert.equal(r.reports.at(-1).data.quested, 9);
});

test("a player who leaves mid-window fails retention", async () => {
  const r = await run(base, { dropAt: { Saga02: 150 } });
  assert.equal(r.failed.length, 1);
  assert.match(r.failed[0], /retained: fewest 9, at the end 9 of 10/);
  assert.equal(r.reports.at(-1).data.minValid, 9);
});
