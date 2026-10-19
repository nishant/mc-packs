// Welcome Message defaults (audit O43): a world that never ran the Realm text gets a generic message built from
// the installed packs; a world that already has the Realm text (or any operator edit) keeps it.
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

async function world(seed = {}) {
  const sim = createSim();
  for (const [k, v] of Object.entries(seed)) sim.props.set(k, v);
  await sim.load("welcome_bp");
  sim.boot();
  sim.game.emit("world.after.worldLoad", {});
  return sim;
}

/** Answers the pack's installed-packs ping the way the other packs do. */
function installedPacks(sim, packs) {
  const sys = sim.server.system;
  const orig = sys.sendScriptEvent;
  sys.sendScriptEvent = (id, message) => {
    orig(id, message);
    if (id === "realm:help_ping") for (const p of packs) orig("realm:help_pong", p);
  };
}

async function joinAndRead(sim, name = "Pat", props = {}) {
  const p = sim.join(name);
  for (const [k, v] of Object.entries(props)) p.setDynamicProperty(k, v);
  sim.game.emit("world.after.playerSpawn", { player: p, initialSpawn: true });
  const w = await sim.nextForm(600);
  return { p, form: w.form };
}

test("O43: a fresh world gets a generic welcome built from the installed packs", async () => {
  const sim = await world();
  installedPacks(sim, ["saga_bp", "claims_bp", "skills_bp"]);
  const { form } = await joinAndRead(sim);
  assert.doesNotMatch(form.titleText + form.bodyText, /Old Tobin|Mara|Rules|drowned bell|Lantern|harbor/i);
  assert.match(form.bodyText, /realm:saga/);
  assert.match(form.bodyText, /realm:claim/);
  assert.doesNotMatch(form.bodyText, /realm:calendar|realm:crowns/, "packs that are not installed are not listed");
  assert.equal(sim.props.get("welcome:profile"), "generic");
  assert.equal(sim.props.has("welcome:settings"), false, "generated text is never saved");
});

test("O43: a new world stays generic when sibling packs write at load and at the first spawn", async () => {
  const sim = await world({ "atlas:origin": "{}", "weather:cycle": "1", "weather:plan": "{}", "weather:current": "{}", "expedition:migrated": 1 });
  installedPacks(sim, ["saga_bp"]);
  const p = sim.join("Pat");
  for (const k of ["titles:p:Pat", "titles:n:pat", "nick:g:pat", "mail:roster", "caravan:last", "milestones:p:Pat"]) sim.props.set(k, "x");
  sim.game.emit("world.after.playerSpawn", { player: p, initialSpawn: true });
  const w = await sim.nextForm(600);
  assert.doesNotMatch(w.form.bodyText, /Old Tobin/);
  assert.equal(sim.props.get("welcome:profile"), "generic");
});

test("O43: an older world with player data, even beside load-time keys, keeps the Realm text", async () => {
  const sim = await world({ "atlas:origin": "{}", "titles:p:abc": "{}" });
  installedPacks(sim, ["saga_bp"]);
  const { form } = await joinAndRead(sim);
  assert.match(form.bodyText, /Old Tobin/);
  assert.equal(sim.props.get("welcome:profile"), "realm");
});

test("O43: a world that already has data keeps the built-in Realm text, and says so once", async () => {
  const sim = await world({ "stats:p:abc": "{}", "crowns:p:abc": "5" });
  installedPacks(sim, ["saga_bp"]);
  const { form } = await joinAndRead(sim);
  assert.match(form.bodyText, /Old Tobin/);
  assert.match(form.bodyText, /== Rules ==/);
  assert.equal(sim.props.get("welcome:profile"), "realm");
});

test("O43: operator-saved text survives, on any profile, and is not rewritten", async () => {
  const saved = JSON.stringify({ title: "My Realm", body: "Custom {player}" });
  const sim = await world({ "welcome:settings": saved, "welcome:revision": 3 });
  installedPacks(sim, ["saga_bp"]);
  const { form } = await joinAndRead(sim);
  assert.equal(form.titleText, "My Realm");
  assert.equal(form.bodyText, "Custom Pat");
  assert.equal(sim.props.get("welcome:settings"), saved);
  assert.equal(sim.props.get("welcome:profile"), "realm");
});

test("O43: a saved profile is not decided again when other data appears later", async () => {
  const sim = await world({ "welcome:profile": "generic" });
  sim.props.set("stats:p:abc", "{}");
  installedPacks(sim, ["saga_bp"]);
  const { form } = await joinAndRead(sim);
  assert.doesNotMatch(form.bodyText, /Old Tobin/);
});

test("O43: saving the editor untouched on a generic world stores nothing", async () => {
  const sim = await world();
  installedPacks(sim, ["saga_bp"]);
  const op = sim.join("Op", { op: true });
  sim.run("realm:welcome_edit", op);
  const w = await sim.nextForm(600);
  assert.match(w.form.parts.find((p) => p.kind === "textField" && p.label === "Body, part 1").opts.defaultValue, /What's here/);
  const values = w.form.parts.map((p) => (p.kind === "label" ? undefined : p.opts?.defaultValue ?? "")).filter((v) => v !== undefined);
  sim.answer({ formValues: values });
  await sim.settle();
  assert.equal(sim.props.has("welcome:settings"), false);
});
