// Welcome Message (audit O43, owner design 2026-10-19): one default welcome for every world, the Realm included:
// a story synopsis, one line per installed pack's feature, where to go next. One scrolling form with section
// labels and one Close button. The Realm's old saved welcome (Old Tobin and Mara, house rules) is replaced once;
// an operator's own text always wins.
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

const S = "\u00a7";
const LEGACY_BODY =
  `Hey ${S}b{player}${S}r, glad you're here!\n\n${S}l${S}6== The Story ==${S}r\nA sleepy harbor town keeps an old secret. Tap ${S}bOld Tobin${S}r or ${S}bMara${S}r in town to begin ${S}eThe Lantern and the Hollow${S}r.\n\n${S}l${S}6== Rules ==${S}r\n${S}7-${S}r Be kind, no griefing\n${S}7-${S}r Have fun`;
const LEGACY = JSON.stringify({ title: `${S}l${S}6Welcome to the Realm!`, body: LEGACY_BODY, button: `${S}lLet's go!` });

async function world(seed = {}) {
  const sim = createSim();
  for (const [k, v] of Object.entries(seed)) sim.props.set(k, v);
  await sim.load("welcome_bp");
  sim.boot();
  sim.game.emit("world.after.worldLoad", {});
  return sim;
}

/**
 * Answers the pack's installed-packs ping the way the other packs do. With npc_bp installed, Townsfolk also answers
 * realm:npc_places_ping with the placed townsfolk (`placed`, by default Old Tobin and Mara).
 */
function installedPacks(sim, packs, placed = ["tobin", "mara"]) {
  const sys = sim.server.system;
  const orig = sys.sendScriptEvent;
  sys.sendScriptEvent = (id, message) => {
    orig(id, message);
    if (id === "realm:help_ping") for (const p of packs) orig("realm:help_pong", p);
    if (id === "realm:npc_places_ping" && packs.includes("npc_bp")) sendPlaces(sim, placed, orig);
  };
}

/** Townsfolk's realm:npc_places list (one part, or parts 0 when nobody is placed). */
function sendPlaces(sim, ids, send = sim.server.system.sendScriptEvent) {
  const folk = ids.map((id, i) => ({ id, n: id, dim: "minecraft:overworld", x: i, z: 0 }));
  send("realm:npc_places", JSON.stringify({ part: 1, parts: folk.length ? 1 : 0, folk }));
}

async function joinAndRead(sim, name = "Pat", props = {}) {
  const p = sim.join(name);
  for (const [k, v] of Object.entries(props)) p.setDynamicProperty(k, v);
  sim.game.emit("world.after.playerSpawn", { player: p, initialSpawn: true });
  const w = await sim.nextForm(600);
  return { p, form: w.form };
}

/** The visible text of a default form: its labels in order, one string. */
const labels = (form) => form.parts.filter((p) => p.kind === "label").map((p) => p.text);
const text = (form) => labels(form).join("\n");
const headings = (form) => labels(form).filter((t) => t.startsWith(`${S}l${S}6`));

const ALL = ["saga_bp", "npc_bp", "help_bp", "settings_bp", "quests_bp", "expedition_bp", "bounty_bp", "skills_bp", "crowns_bp", "claims_bp", "calendar_bp", "party_bp", "mail_bp", "map_bp", "stats_bp", "journal_bp"];

test("O43: a new player gets the popup: a title, section labels, one Close button, no header", async () => {
  const sim = await world();
  installedPacks(sim, ALL);
  const { form } = await joinAndRead(sim);
  assert.equal(form.titleText, `${S}l${S}6Welcome!`);
  assert.deepEqual(form.parts.filter((p) => p.kind === "header"), [], "never .header()");
  assert.deepEqual(form.buttons, [`${S}lClose`], "one Close button");
  assert.deepEqual(headings(form), [`${S}l${S}6The World`, `${S}l${S}6What You Can Do`, `${S}l${S}6Where To Go Next`], "synopsis, features, next, in order");
  assert.equal(sim.props.has("welcome:settings"), false, "generated text is never saved");
});

test("O43: the default is the same in every world: a fresh one, an older one, the Realm's", async () => {
  const forms = [];
  for (const seed of [{}, { "stats:p:abc": "{}", "crowns:p:abc": "5" }, { "welcome:settings": LEGACY, "welcome:revision": 2 }]) {
    const sim = await world(seed);
    installedPacks(sim, ALL);
    const { form } = await joinAndRead(sim);
    forms.push(JSON.stringify([form.titleText, form.parts, form.buttons]));
  }
  assert.equal(forms[1], forms[0]);
  assert.equal(forms[2], forms[0]);
});

test("O43: only installed packs' features are listed", async () => {
  const sim = await world();
  installedPacks(sim, ["claims_bp", "skills_bp"]);
  const { form } = await joinAndRead(sim);
  const t = text(form);
  assert.match(t, /realm:claim/);
  assert.match(t, /realm:skills/);
  assert.doesNotMatch(t, /realm:calendar|realm:crowns|realm:mail|realm:map|realm:quests/);
  assert.doesNotMatch(t, /realm:help|realm:prefs|realm:saga/, "a command of an absent pack is not offered");
  assert.doesNotMatch(t, /Old Tobin|Mara|harbor|bell/, "no story without Story Questlines");
  assert.match(t, /realm:welcome_edit/);
});

test("O43: a minimal install (only this pack) lists no features and claims no other pack", async () => {
  const sim = await world();
  installedPacks(sim, []);
  const { form } = await joinAndRead(sim);
  assert.equal(headings(form).length, 2);
  assert.doesNotMatch(text(form), /What You Can Do|realm:(?!welcome_edit)/);
});

test("O43: with the story installed it says where to begin; story log, prefs and help are named", async () => {
  const sim = await world();
  installedPacks(sim, ALL);
  const t = text((await joinAndRead(sim)).form);
  assert.match(t, /Old Tobin/);
  assert.match(t, /Mara/);
  assert.match(t, /realm:help/);
  assert.match(t, /realm:prefs/);
  assert.match(t, /realm:saga.*story log/);
  const noNpc = await world();
  installedPacks(noNpc, ["saga_bp"]);
  const t2 = text((await joinAndRead(noNpc)).form);
  assert.doesNotMatch(t2, /Old Tobin|Mara/, "townsfolk are only named when their pack is installed");
  assert.match(t2, /realm:saga/);
});

test("O43: no spoilers, plain ASCII, short enough to read in a minute and to fit the form", async () => {
  const sim = await world();
  installedPacks(sim, ALL);
  const form = (await joinAndRead(sim)).form;
  const t = text(form);
  assert.doesNotMatch(t, /act [ivx0-9]|choir|seal|comet|cult|villain|ending|twist|lantern night|gray/i);
  assert.doesNotMatch(t.replaceAll(S, ""), /[^\x20-\x7e\n]/, "only ASCII beside the section signs");
  const words = t.replace(/\u00a7./g, "").split(/\s+/).filter(Boolean).length;
  assert.ok(words <= 200, `${words} words read in under a minute`);
  assert.ok(t.length <= 1800, `${t.length} characters`);
  for (const part of labels(form)) assert.ok(part.length <= 700, "short paragraphs");
});

test("O43: the Realm's old saved welcome is replaced once, and the new player sees the default", async () => {
  const sim = await world({ "welcome:settings": LEGACY, "welcome:revision": 2 });
  installedPacks(sim, ALL);
  assert.equal(sim.props.get("welcome:migrated"), 1);
  assert.equal(sim.props.has("welcome:settings"), false, "nothing else was saved with it");
  assert.equal(sim.props.get("welcome:revision"), 3, "players who saw the old text see the new one");
  const { form } = await joinAndRead(sim);
  assert.equal(form.titleText, `${S}l${S}6Welcome!`);
  assert.doesNotMatch(text(form), /Rules|griefing/);
  assert.deepEqual(form.buttons, [`${S}lClose`]);
});

test("O43: the migration keeps every other saved field and the operator's own button and title", async () => {
  const saved = { title: "Hollow Bay", body: LEGACY_BODY, button: "Onward", showOnce: true, chat: true, extra: { keep: [1, 2] } };
  const sim = await world({ "welcome:settings": JSON.stringify(saved) });
  assert.deepEqual(JSON.parse(sim.props.get("welcome:settings")), { title: "Hollow Bay", button: "Onward", showOnce: true, chat: true, extra: { keep: [1, 2] } });
});

test("O43: false-positive controls: other saved welcomes are never touched", async () => {
  for (const saved of [
    { body: "Welcome to Old Tobin's Tavern server! Rules: be kind." },
    { body: "Tap Old Tobin to begin" },
    { body: "Mara and Old Tobin say hi in town" },
    { body: "Custom {player}", title: "My Realm" },
    { title: `${S}l${S}6Welcome to the Realm!` },
    { showOnce: true },
  ]) {
    const raw = JSON.stringify(saved);
    const sim = await world({ "welcome:settings": raw, "welcome:revision": 4 });
    assert.equal(sim.props.get("welcome:settings"), raw, raw);
    assert.equal(sim.props.get("welcome:revision"), 4, raw);
    assert.equal(sim.props.get("welcome:migrated"), 1, "checked once either way");
  }
  for (const raw of ["not json", "[1]", "null"]) {
    const sim = await world({ "welcome:settings": raw });
    assert.equal(sim.props.get("welcome:settings"), raw);
  }
});

test("O43: a welcome an operator saves after the migration survives a reload, even with the old words", async () => {
  const sim = await world({ "welcome:settings": LEGACY });
  assert.equal(sim.props.has("welcome:settings"), false);
  const mine = JSON.stringify({ body: "Tap Old Tobin or Mara in town to begin again, says the new owner" });
  sim.props.set("welcome:settings", mine);
  sim.game.emit("world.after.worldLoad", {});
  installedPacks(sim, ALL);
  const { form } = await joinAndRead(sim);
  assert.equal(sim.props.get("welcome:settings"), mine);
  assert.match(form.bodyText, /new owner/);
  assert.deepEqual(form.buttons, [`${S}lClose`]);
});

test("O43: operator-saved text survives and is shown as one body", async () => {
  const saved = JSON.stringify({ title: "My Realm", body: "Custom {player}" });
  const sim = await world({ "welcome:settings": saved, "welcome:revision": 3 });
  installedPacks(sim, ALL);
  const { form } = await joinAndRead(sim);
  assert.equal(form.titleText, "My Realm");
  assert.equal(form.bodyText, "Custom Pat");
  assert.equal(sim.props.get("welcome:settings"), saved);
});

test("O43: saving the editor untouched stores nothing", async () => {
  const sim = await world();
  installedPacks(sim, ["saga_bp"]);
  const op = sim.join("Op", { op: true });
  sim.run("realm:welcome_edit", op);
  const w = await sim.nextForm(600);
  assert.match(w.form.parts.find((p) => p.kind === "textField" && p.label === "Body, part 1").opts.defaultValue, /The World/);
  const values = w.form.parts.map((p) => (p.kind === "label" ? undefined : p.opts?.defaultValue ?? "")).filter((v) => v !== undefined);
  sim.answer({ formValues: values });
  await sim.settle();
  assert.equal(sim.props.has("welcome:settings"), false);
});

// F64 (N12): Townsfolk installed is not townsfolk placed. The start line names only the prologue givers who live
// somewhere (realm:npc_places), so a fresh world never sends players looking for Old Tobin and Mara.
test("F64: with Townsfolk installed but nobody placed, the welcome names no townsfolk; it follows placements", async () => {
  const sim = await world();
  installedPacks(sim, ALL, []);
  const t = text((await joinAndRead(sim, "Pat")).form);
  assert.doesNotMatch(t, /Old Tobin|Mara|Tap /, "nobody to tap yet");
  assert.match(t, /harbor/, "the story paragraph stays");
  sim.answer({ selection: 0 });
  sendPlaces(sim, ["reyes", "mara"]); // an operator places Mara (Townsfolk broadcasts every change)
  const t2 = text((await joinAndRead(sim, "Sam")).form);
  assert.match(t2, new RegExp(`Tap ${S}bMara${S}r in town to begin`));
  assert.doesNotMatch(t2, /Old Tobin/, "Old Tobin is not placed");
  sim.answer({ selection: 0 });
  sendPlaces(sim, ["tobin", "mara"]);
  const t3 = text((await joinAndRead(sim, "Lee")).form);
  assert.match(t3, new RegExp(`Tap ${S}bOld Tobin${S}r or ${S}bMara${S}r in town to begin ${S}eThe Lantern and the Hollow`));
  sim.answer({ selection: 0 });
  sendPlaces(sim, []);
  assert.doesNotMatch(text((await joinAndRead(sim, "Kim")).form), /Old Tobin|Mara/, "both removed again");
});

test("F64: a Townsfolk list sent in two parts is read whole", async () => {
  const sim = await world();
  installedPacks(sim, ALL, []);
  const send = sim.server.system.sendScriptEvent;
  send("realm:npc_places", JSON.stringify({ part: 1, parts: 2, folk: [{ id: "reyes" }] }));
  send("realm:npc_places", JSON.stringify({ part: 2, parts: 2, folk: [{ id: "tobin" }] }));
  // The join's own ping gets "nobody placed" from this fixture, so read the broadcast before it: skip the ping.
  const sys = sim.server.system;
  const wrapped = sys.sendScriptEvent;
  sys.sendScriptEvent = (id, m) => (id === "realm:npc_places_ping" ? undefined : wrapped(id, m));
  const t = text((await joinAndRead(sim)).form);
  assert.match(t, /Old Tobin/);
  assert.doesNotMatch(t, /Mara/);
});

// F64 (N10): the migration keeps what it takes out, so an operator's edits around the old sentence are not lost.
test("F64: the migration keeps a copy of the old body; the first operator is told once; Restore brings it back", async () => {
  const sim = await world({ "welcome:settings": LEGACY, "welcome:revision": 2 });
  installedPacks(sim, ALL);
  assert.equal(sim.props.has("welcome:settings"), false, "the default shows");
  const kept = JSON.parse(sim.props.get("welcome:legacy"));
  assert.deepEqual(kept, { body: LEGACY_BODY, title: `${S}l${S}6Welcome to the Realm!`, button: `${S}lLet's go!` });

  const op = sim.join("Op", { op: true });
  sim.game.emit("world.after.playerSpawn", { player: op, initialSpawn: true });
  await sim.nextForm(600);
  sim.answer({ selection: 0 });
  await sim.settle();
  assert.equal(op.messages.filter((m) => /copy is kept/.test(m)).length, 1, "told once");
  const op2 = sim.join("Op2", { op: true });
  sim.game.emit("world.after.playerSpawn", { player: op2, initialSpawn: true });
  await sim.nextForm(600);
  sim.answer({ selection: 0 });
  await sim.settle();
  assert.equal(op2.messages.filter((m) => /copy is kept/.test(m)).length, 0, "only the first operator");
  const pat = sim.join("Pat");
  sim.game.emit("world.after.playerSpawn", { player: pat, initialSpawn: true });
  await sim.nextForm(600);
  sim.answer({ selection: 0 });
  await sim.settle();
  assert.equal(pat.messages.filter((m) => /copy is kept/.test(m)).length, 0, "never a player");

  sim.run("realm:welcome", op);
  const menu = await sim.nextForm(600);
  const idx = menu.form.buttons.findIndex((b) => /Old welcome/.test(b));
  assert.ok(idx > 0, "an Old welcome button for operators");
  sim.answer({ selection: idx });
  const page = await sim.nextForm(600);
  assert.match(page.form.bodyText, /Be kind, no griefing/, "the kept text is shown");
  sim.answer({ selection: 0 });
  await sim.settle();
  assert.deepEqual(JSON.parse(sim.props.get("welcome:settings")), JSON.parse(LEGACY));
  assert.equal(sim.props.has("welcome:legacy"), false, "the copy is used up");
  assert.equal(sim.props.get("welcome:migrated"), 1, "never migrated again");
  const { form } = await joinAndRead(sim, "Sam");
  assert.match(form.bodyText, /Be kind, no griefing/);
  assert.equal(form.titleText, `${S}l${S}6Welcome to the Realm!`);
});

test("F64: Delete the copy forgets it; players never get the Old welcome button; a de-opped operator can't use it", async () => {
  const sim = await world({ "welcome:settings": JSON.stringify({ body: LEGACY_BODY, title: "Mine" }) });
  installedPacks(sim, ALL);
  assert.deepEqual(JSON.parse(sim.props.get("welcome:legacy")), { body: LEGACY_BODY }, "only what was taken out");
  assert.deepEqual(JSON.parse(sim.props.get("welcome:settings")), { title: "Mine" });

  const pat = sim.join("Pat");
  sim.run("realm:welcome", pat);
  const w = await sim.nextForm(600);
  assert.deepEqual(w.form.buttons, [`${S}lClose`], "a player goes straight to the message");
  sim.answer({ selection: 0 });

  const op = sim.join("Op", { op: true });
  sim.run("realm:welcome", op);
  let menu = await sim.nextForm(600);
  sim.answer({ selection: menu.form.buttons.findIndex((b) => /Old welcome/.test(b)) });
  await sim.nextForm(600);
  op.commandPermissionLevel = 0;
  sim.answer({ selection: 1 });
  await sim.settle();
  assert.equal(sim.props.has("welcome:legacy"), true, "refused after de-op");
  op.commandPermissionLevel = 2;
  sim.run("realm:welcome", op);
  menu = await sim.nextForm(600);
  sim.answer({ selection: menu.form.buttons.findIndex((b) => /Old welcome/.test(b)) });
  await sim.nextForm(600);
  sim.answer({ selection: 1 });
  await sim.settle();
  assert.equal(sim.props.has("welcome:legacy"), false);
  assert.deepEqual(JSON.parse(sim.props.get("welcome:settings")), { title: "Mine" }, "nothing else changed");
  sim.run("realm:welcome", op);
  menu = await sim.nextForm(600);
  assert.equal(menu.form.buttons.some((b) => /Old welcome/.test(b)), false, "no button without a copy");
});

test("F64: Restore keeps a title or button saved after the migration", async () => {
  const sim = await world({ "welcome:settings": LEGACY, "welcome:revision": 2 });
  installedPacks(sim, ALL);
  sim.props.set("welcome:settings", JSON.stringify({ title: "Newer title" })); // an operator's later edit
  const op = sim.join("Op", { op: true });
  sim.run("realm:welcome", op);
  const menu = await sim.nextForm(600);
  sim.answer({ selection: menu.form.buttons.findIndex((b) => /Old welcome/.test(b)) });
  await sim.nextForm(600);
  sim.answer({ selection: 0 });
  await sim.settle();
  const saved = JSON.parse(sim.props.get("welcome:settings"));
  assert.equal(saved.title, "Newer title", "the later title stays");
  assert.equal(saved.body, LEGACY_BODY, "the old body is back");
  assert.equal(saved.button, `${S}lLet's go!`, "the old button, with no newer one saved, is back");
});

// F64 (N11): the retired welcome:profile key is deleted, also in worlds that migrated before this fix.
test("F64: the retired welcome:profile key is deleted on load", async () => {
  for (const seed of [{ "welcome:profile": "realm" }, { "welcome:profile": "realm", "welcome:migrated": 1 }]) {
    const sim = await world(seed);
    assert.equal(sim.props.has("welcome:profile"), false, JSON.stringify(seed));
  }
});
