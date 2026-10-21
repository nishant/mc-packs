import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const R = await import(pathToFileURL(resolve("packs/map_bp/scripts/reset.js")).href);

const fakePlayer = (props) => {
  const sets = [];
  return {
    props,
    sets,
    getDynamicProperty: (k) => props[k],
    setDynamicProperty(k, v) {
      sets.push(k);
      if (v === undefined) delete props[k];
      else props[k] = v;
    },
  };
};

test("map_bp registers an operator-only confirmed map_reset and uses reset.js", () => {
  const main = readFileSync("packs/map_bp/scripts/main.js", "utf8");
  const at = main.indexOf('name: "realm:map_reset"');
  assert.ok(at > 0);
  const block = main.slice(at, at + 1800);
  assert.match(block, /CommandPermissionLevel\.GameDirectors/);
  assert.match(block, /isOp\(who\)/);
  assert.match(block, /confirmed\(confirm\)/);
  assert.match(main, /applyReset\(player\)/);
  assert.equal(R.PLAYER_GEN, "map:gen");
  assert.equal(R.WORLD_GEN, "map:reset");
  assert.deepEqual(R.CLEARED, ["map:wp", "map:marks"]);
  assert.match(main, /PROP_WP = "map:wp"/);
  assert.match(main, /PROP_MARKS = "map:marks"/);
});

test("only the word confirm runs a reset", () => {
  assert.equal(R.confirmed("confirm"), true);
  assert.equal(R.confirmed(" Confirm "), true);
  for (const v of [undefined, "", "yes", "confirmed", 1, null]) assert.equal(R.confirmed(v), false);
});

test("generations count up from missing or damaged values", () => {
  assert.equal(R.nextGeneration(undefined, 0), 1);
  assert.equal(R.nextGeneration(3, 0), 4);
  assert.equal(R.nextGeneration("x", 0), 1);
  assert.equal(R.nextGeneration(-4, 0), 1);
  assert.equal(R.nextGeneration(NaN, 0), 1);
});

test("a player is reset once per generation, offline players on their next join", () => {
  const p = fakePlayer({ "map:wp": '{"n":"x"}', "map:marks": "[]", "map:other": "keep", "other:thing": 5 });
  assert.equal(R.needsReset(0, undefined), false, "no reset has ever run");
  assert.equal(R.needsReset(1, undefined), true);
  assert.equal(R.resetPlayer(p, 1), true);
  assert.equal(p.props["map:gen"], 1);
  assert.equal(R.needsReset(1, p.props["map:gen"]), false, "applied once");
  assert.equal(p.props["map:other"], "keep");
  assert.equal(p.props["other:thing"], 5);
  assert.equal("map:wp" in p.props, false);
  p.props["map:marks"] = '[{"n":"new"}]'; // saved after the reset
  assert.equal(R.needsReset(1, p.props["map:gen"]), false);
  assert.equal(p.props["map:marks"], '[{"n":"new"}]', "newer data survives");
  assert.equal(R.needsReset(2, p.props["map:gen"]), true, "a second reset applies again");
});

test("the generation is recorded last, so a part-way failure is retried", () => {
  const p = fakePlayer({ "map:wp": "a", "map:marks": "b" });
  const order = [];
  const real = p.setDynamicProperty;
  p.setDynamicProperty = (k, v) => {
    order.push(k);
    if (k === "map:marks") throw new Error("crash");
    real(k, v);
  };
  assert.throws(() => R.resetPlayer(p, 1));
  assert.equal(p.props["map:gen"], undefined);
  assert.equal(R.needsReset(1, p.props["map:gen"]), true);
  p.setDynamicProperty = real;
  R.resetPlayer(p, 1);
  assert.equal(p.props["map:gen"], 1);
  assert.deepEqual(Object.keys(p.props).sort(), ["map:gen"]);
});

test("a form opened before a reset is stale, one opened after is not", () => {
  assert.equal(R.staleForm(0, 1), true);
  assert.equal(R.staleForm(1, 2), true);
  assert.equal(R.staleForm(2, 2), false);
  assert.equal(R.staleForm(undefined, 0), false);
});

test("a stale menu answer is dropped, so it can neither restore old marks nor wipe data saved after the reset", () => {
  const p = fakePlayer({ "map:marks": "old" });
  let world = 0;
  const menu = (openedAt, save) => (R.staleForm(openedAt, world) ? "dropped" : (save(), "saved"));
  const opened = world;
  world = R.nextGeneration(world);
  R.resetPlayer(p, world);
  p.setDynamicProperty("map:marks", "new");
  assert.equal(menu(opened, () => p.setDynamicProperty("map:marks", "old+edit")), "dropped");
  assert.equal(p.props["map:marks"], "new");
  assert.equal(menu(world, () => p.setDynamicProperty("map:marks", "new+edit")), "saved");
});

test("every map menu checks the reset generation after its form returns", () => {
  const src = readFileSync("packs/map_bp/scripts/main.js", "utf8").split("\n");
  const shows = src.map((l, i) => (/await show\(player, form\)/.test(l) ? i : -1)).filter((i) => i >= 0);
  assert.ok(shows.length >= 4);
  for (const i of shows) assert.match(src.slice(i, i + 3).join("\n"), /resetSince\(/, `line ${i + 1}`);
});
test("a reset after the world's generation was forgotten still reaches players saved at an earlier one", () => {
  const { nextGeneration, needsReset, resetPlayer } = R;
  const now = Date.UTC(2026, 9, 19);
  const g1 = nextGeneration(undefined, now);
  const player = { p: new Map([["map:wp", "x"]]), getDynamicProperty(k) { return this.p.get(k); }, setDynamicProperty(k, v) { if (v === undefined) this.p.delete(k); else this.p.set(k, v); } };
  resetPlayer(player, g1);
  const g2 = nextGeneration(undefined, now + 5000); // world property forgotten, then reset again
  assert.ok(g2 > g1);
  assert.equal(needsReset(g2, player.getDynamicProperty("map:gen")), true);
  assert.equal(nextGeneration(g2, now), g2 + 1, "same second: still strictly increasing");
  assert.equal(nextGeneration(7, now), Math.floor(now / 1000), "old small generations are passed");
});
// F16: after any reset, a brand-new player (nothing saved) is stamped with the generation silently; only a player
// whose destination or marked spots were really cleared is told.
test("a reset tells only players whose data it cleared; new players are stamped silently", async () => {
  const { createSim } = await import(pathToFileURL(resolve("tools/lib/pack-sim.mjs")).href);
  const sim = createSim();
  sim.props.set("map:reset", 1760000000);
  await sim.load("map_bp");
  sim.boot();
  const spawn = (name, props = {}) => {
    const p = sim.join(name);
    for (const [k, v] of Object.entries(props)) p.setDynamicProperty(k, v);
    sim.game.emit("world.after.playerSpawn", { player: p, initialSpawn: true });
    return p;
  };
  const told = (p) => p.messages.filter((m) => /reset everyone's destination/.test(m)).length;
  const fresh = spawn("New");
  assert.equal(told(fresh), 0, "a brand-new player is not told about an old reset");
  assert.equal(fresh.getDynamicProperty("map:gen"), 1760000000, "but is stamped with the current generation");
  const old = spawn("Old", { "map:marks": '[{"n":"Cave"}]', "map:gen": 5 });
  assert.equal(told(old), 1, "a player whose spots were cleared is told once");
  assert.equal(old.getDynamicProperty("map:marks"), undefined);
  const seen = spawn("Seen", { "map:marks": '[{"n":"Home"}]', "map:gen": 1760000000 });
  assert.equal(told(seen), 0);
  assert.equal(seen.getDynamicProperty("map:marks"), '[{"n":"Home"}]');
});
