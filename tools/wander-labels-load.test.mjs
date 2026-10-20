// Wanderers of the Wilds' label sync (packs/wander_bp/scripts/main.js: updateLabels, entityById, labelObservers), run
// for real against a counting fake world (O3/O2: wander_bp's label loop was its biggest cost, 0.115 ms/tick at 40
// players and 0.304 at 100). Every 2 ticks it looked up every wanderer with world.getEntity and synced all of them,
// even the ones nobody was near. Now a handle is kept while it stays valid, and between the once-a-second full passes
// only wanderers with a player within LABEL_HOT are synced, so a near one keeps its 2-tick sync (and the label
// module's resend timing) while far ones cost one sync a second. The counts are native lookups and synced labels,
// not milliseconds. Run against the old file with WANDER_MAIN=<path> to see the before numbers fail.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const file = process.env.WANDER_MAIN ?? path.join(import.meta.dirname, "..", "packs", "wander_bp", "scripts", "main.js");
const text = fs.readFileSync(file, "utf8");
const source = ts.createSourceFile("main.js", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const FUNCS = new Set(["entityById", "updateLabels", "labelObservers"]);
const VARS = /\b(handles|LABEL_REACH|LABEL_HOT|LABEL_FULL_EVERY|LABEL_QUERY_PLAYERS|LABEL_QUERY_TARGETS|onlineN|onlineAt|labelRun|hotLabels|labelDims) = /;
/** @type {string[]} */
const parts = [];
for (const node of source.statements) {
  if (ts.isFunctionDeclaration(node) && FUNCS.has(node.name?.text ?? "")) parts.push(node.getText(source));
  if (ts.isVariableStatement(node) && VARS.test(node.getText(source))) parts.push(node.getText(source).replace(/^const /, "var ").replace(/^let /, "var "));
}
assert.ok(parts.some((p) => p.includes("function updateLabels")), "the test runs the actual updateLabels");

const OVERWORLD = "minecraft:overworld";

/** A fake world with wanderers at `spots` and players at `players` (all in the overworld). */
function setup(spots, playerSpots) {
  const counts = { getEntity: 0, synced: /** @type {Record<string, number>} */ ({}), syncs: 0 };
  const dim = { id: OVERWORLD, getPlayers: (o) => players.filter((p) => Math.hypot(p.location.x - o.location.x, p.location.z - o.location.z) <= o.maxDistance), getEntities: () => [] };
  const entities = new Map();
  const live = {};
  spots.forEach((s, i) => {
    const e = { id: `e${i}`, isValid: true, location: { x: s.x, y: 64, z: s.z }, dimension: dim };
    entities.set(e.id, e);
    live[`w${i}`] = { w: `w${i}`, n: `Wanderer ${i}`, e: e.id };
  });
  const players = playerSpots.map((s, i) => ({ id: `p${i}`, location: { x: s.x, y: 64, z: s.z }, dimension: dim }));
  const ctx = {
    ready: true,
    live,
    camps: {},
    NAMED_BY_ID: new Map(),
    DIMENSIONS: [OVERWORLD],
    LABEL_OBSERVER_RANGE: 36,
    GameMode: { Spectator: "Spectator" },
    system: { currentTick: 0 },
    wandererLabel: (wid, n) => n,
    wandererMarker: (k) => `§r${k}`,
    world: {
      getEntity: (id) => {
        counts.getEntity++;
        return entities.get(id);
      },
      getDimension: () => dim,
      getPlayers: () => [...players],
      getAllPlayers: () => [...players],
    },
    nameLabels: {
      sync(targets, observers) {
        counts.syncs++;
        if (typeof observers === "function") observers();
        for (const t of targets) counts.synced[t.id] = (counts.synced[t.id] ?? 0) + 1;
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(`${parts.join("\n")}\nthis.run = () => updateLabels();`, ctx);
  return { ctx, counts, entities, players, live };
}

test("100 label runs (200 ticks): a near wanderer is synced every run, far ones once a second, each looked up once", () => {
  // One player at 0,0; one wanderer 10 blocks away, five 300+ blocks away.
  const s = setup([{ x: 10, z: 0 }, ...[1, 2, 3, 4, 5].map((k) => ({ x: 300 * k, z: 0 }))], [{ x: 0, z: 0 }]);
  for (let i = 0; i < 100; i++) s.ctx.run();
  assert.equal(s.counts.syncs, 100, "the label module still runs every 2 ticks");
  assert.equal(s.counts.synced["road:w0"], 100, "the near wanderer is synced on every run (resend timing kept)");
  for (const k of [1, 2, 3, 4, 5]) assert.ok(s.counts.synced[`road:w${k}`] <= 10, `far wanderer ${k} synced ${s.counts.synced[`road:w${k}`]} times, at most once a second`);
  assert.ok(s.counts.getEntity <= 6, `world.getEntity called ${s.counts.getEntity} times for 6 wanderers`);
});

test("a far wanderer a player walks up to is synced every run from the next full pass on", () => {
  const s = setup([{ x: 500, z: 0 }], [{ x: 0, z: 0 }]);
  for (let i = 0; i < 20; i++) s.ctx.run();
  const before = s.counts.synced["road:w0"];
  s.players[0].location = { x: 470, y: 64, z: 0 };
  for (let i = 0; i < 10; i++) s.ctx.run(); // within one second the full pass sees the player
  const at = s.counts.synced["road:w0"];
  for (let i = 0; i < 10; i++) s.ctx.run();
  assert.equal(s.counts.synced["road:w0"] - at, 10, "near now: synced on every run");
  assert.ok(at > before, "the full pass picked it up");
});

test("an unloaded or removed wanderer's handle is looked up again and the new one used", () => {
  const s = setup([{ x: 5, z: 0 }], [{ x: 0, z: 0 }]);
  for (let i = 0; i < 5; i++) s.ctx.run();
  const looked = s.counts.getEntity;
  s.entities.get("e0").isValid = false; // unloaded: the old handle is dead
  const again = { id: "e0", isValid: true, location: { x: 5, y: 64, z: 0 }, dimension: s.entities.get("e0").dimension };
  s.entities.set("e0", again);
  s.ctx.run();
  assert.equal(s.counts.getEntity, looked + 1, "looked up again once");
  for (let i = 0; i < 5; i++) s.ctx.run();
  assert.equal(s.counts.getEntity, looked + 1, "then the new handle is kept");
});
