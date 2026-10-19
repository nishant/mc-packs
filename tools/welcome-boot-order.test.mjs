// O43: the default welcome in a real bundle: Chest Finder and Welcome run in one world (one property store, folder
// order). Chest Finder's start-up marker (find:mig) no longer decides anything: a new world and an older one get the
// same default, and two joins inside one ask window agree.
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

const S = "\u00a7";

async function bundleWorld(seed = {}) {
  const sim = createSim();
  for (const [k, v] of Object.entries(seed)) sim.props.set(k, v);
  await sim.load("find_bp");
  await sim.load("welcome_bp");
  sim.boot();
  sim.game.emit("world.after.worldLoad", {});
  return sim;
}

function ping(sim, packs) {
  const counter = { pings: 0 };
  const sys = sim.server.system;
  const orig = sys.sendScriptEvent;
  sys.sendScriptEvent = (id, message) => {
    orig(id, message);
    if (id === "realm:help_ping") {
      counter.pings++;
      for (const p of packs) orig("realm:help_pong", p);
    }
  };
  return counter;
}

const text = (form) => form.parts.filter((p) => p.kind === "label").map((p) => p.text).join("\n");

async function firstForm(sim) {
  const p = sim.join("Pat");
  sim.game.emit("world.after.playerSpawn", { player: p, initialSpawn: true });
  return (await sim.nextForm(600)).form;
}

test("O43: a new bundle world and an older one show the same default, whatever Chest Finder saved first", async () => {
  const texts = [];
  for (const seed of [{}, { "stats:legacy": "x" }, { "mystery:key": "1" }]) {
    const sim = await bundleWorld(seed);
    assert.equal(sim.props.get("find:mig"), 1, "Chest Finder saved its marker before Welcome, as in the bundle order");
    ping(sim, ["saga_bp", "claims_bp"]);
    const form = await firstForm(sim);
    texts.push(text(form));
    assert.deepEqual(form.buttons, [`${S}lClose`]);
  }
  assert.equal(texts[1], texts[0]);
  assert.equal(texts[2], texts[0]);
  assert.match(texts[0], /realm:saga/);
  assert.match(texts[0], /realm:claim/);
});

test("O43: the Realm's old saved welcome and an operator's later text, in a bundle world", async () => {
  const legacy = JSON.stringify({ body: `Tap ${S}bOld Tobin${S}r or ${S}bMara${S}r in town to begin` });
  const sim = await bundleWorld({ "welcome:settings": legacy, "welcome:revision": 1 });
  assert.equal(sim.props.has("welcome:settings"), false);
  const mine = JSON.stringify({ body: "Saved after" });
  sim.props.set("welcome:settings", mine);
  sim.game.emit("world.after.worldLoad", {});
  assert.equal(sim.props.get("welcome:settings"), mine);
});

test("O43: two joins inside one ask window both get the complete list, from one ask", async () => {
  const sim = await bundleWorld();
  const counter = ping(sim, ["saga_bp", "claims_bp"]);
  const a = sim.join("Ann");
  sim.game.emit("world.after.playerSpawn", { player: a, initialSpawn: true });
  sim.step(3);
  const b = sim.join("Bob");
  sim.game.emit("world.after.playerSpawn", { player: b, initialSpawn: true });
  const texts = [];
  for (let i = 0; i < 2; i++) {
    const w = await sim.nextForm(600);
    texts.push(text(w.form));
    sim.answer({ canceled: false, selection: 0 });
  }
  assert.equal(texts[1].replace("Bob", "Ann"), texts[0], "the two joins agree");
  assert.match(texts[0], /realm:saga/);
  assert.match(texts[0], /realm:claim/);
  assert.equal(counter.pings, 1, "one ask for both joins");
  assert.equal(sim.props.has("welcome:settings"), false);
});
