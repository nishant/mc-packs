// The stats ticker is each player's choice. This Realm allows it and defaults it on, so a new
// player sees it without toggling. /realm:stats and /realm:prefs write the same stats:pref key.
// A stored off stays off. Disallowing it for the realm hides it and does not erase that choice.
// Before 7dac598caa6dd6ee526506ebbcf4821a677ed64f: tickerDefaultOn is false, so Ann's first wait
// for an action-bar stat times out.
// Run with: node tools/test-bds/run.mjs --quiet --only stats_bp,settings_bp --scenario tools/test-bds/examples/stats-ticker-personal.js --timeout 300
export default async function (t) {
  const sys = t.system;
  /** @type {any[]} */
  const acks = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:cfg_ack") return;
      try {
        acks.push(JSON.parse(message));
      } catch {
        // not JSON
      }
    },
    { namespaces: ["realm"] }
  );
  t.echoActionBar = true;
  const ann = await t.player("Ann");
  const bob = await t.player("Bob", { x: ann.location.x + 3, z: ann.location.z });
  const stat = /Playtime|Deaths|Mob kills|Blocks mined|Distance/;
  const annLine = await t.waitMessage(ann, stat, { kind: "actionbar", pack: "stats_bp", timeout: 80 });
  t.log("Ann default", annLine.plain);
  t.check(ann.getDynamicProperty("stats:pref") === undefined, "showing the default does not write a choice");
  const bobLine = await t.waitMessage(bob, stat, { kind: "actionbar", pack: "stats_bp", timeout: 80 });
  t.log("Bob default", bobLine.plain);

  const menu = t.waitForm(ann);
  t.assert(t.cmd(ann, "/realm:stats").ok, "stats menu");
  (await menu).answer("Stats ticker");
  const again = await t.waitForm(ann, { timeout: 40 });
  again.answer(null);
  const off = await t.waitMessage(ann, /Stats ticker: Disabled/, { timeout: 40, pack: "stats_bp" });
  t.check(/Disabled/.test(off.plain), "the stats menu toggles her ticker off");
  const saved = JSON.parse(String(ann.getDynamicProperty("stats:pref") ?? "{}"));
  t.check(saved.ticker === false, `explicit off is stored (${ann.getDynamicProperty("stats:pref")})`);
  const quiet = t.tick;
  await t.wait(50);
  t.check(t.messages(ann, { kind: "actionbar", pack: "stats_bp", since: quiet + 25 }).filter((m) => stat.test(m.plain)).length === 0, "her ticker stays off");
  t.check(t.messages(bob, { kind: "actionbar", pack: "stats_bp", since: quiet }).some((m) => stat.test(m.plain)), "Bob still follows the realm default");

  const prefs = t.waitForm(ann);
  t.assert(t.cmd(ann, "/realm:prefs").ok, "prefs menu");
  const form = await prefs;
  t.log("prefs", form.elements?.map((e) => e.label).filter(Boolean).slice(0, 8));
  form.answer({ "Stats ticker above my hotbar": true });
  const savedNote = await t.waitForm(ann, { timeout: 80 });
  savedNote.answer("Done");
  await t.waitUntil(() => acks.some((a) => a.pack === "stats_bp" && a.key === "ticker" && a.ok), { timeout: 80, message: "prefs ack" });
  const back = await t.waitMessage(ann, stat, { kind: "actionbar", pack: "stats_bp", timeout: 80 });
  t.log("Ann after prefs on", back.plain);
  t.check(ann.getDynamicProperty("stats:pref") === undefined, "choosing the realm default clears the stored off");

  const prefsOff = t.waitForm(ann);
  t.cmd(ann, "/realm:prefs");
  (await prefsOff).answer({ "Stats ticker above my hotbar": false });
  const savedOff = await t.waitForm(ann, { timeout: 80 });
  savedOff.answer("Done");
  await t.waitUntil(() => {
    const raw = ann.getDynamicProperty("stats:pref");
    return typeof raw === "string" && JSON.parse(raw).ticker === false;
  }, { timeout: 80, message: "prefs stored off" });

  const lock = t.tick;
  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "lock", pack: "stats_bp", key: "tickerEnabled", value: false }));
  await t.waitUntil(() => acks.find((a) => a.id === "lock" && a.ok), { timeout: 40, message: "tickerEnabled ack" });
  await t.wait(50);
  t.check(t.messages(ann, { kind: "actionbar", pack: "stats_bp", since: lock + 20 }).filter((m) => stat.test(m.plain)).length === 0, "realm disallow hides Ann");
  t.check(t.messages(bob, { kind: "actionbar", pack: "stats_bp", since: lock + 20 }).filter((m) => stat.test(m.plain)).length === 0, "realm disallow hides Bob too");
  t.check(JSON.parse(String(ann.getDynamicProperty("stats:pref"))).ticker === false, "the disallow does not erase her off choice");

  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "unlock", pack: "stats_bp", key: "tickerEnabled", value: true }));
  await t.waitUntil(() => acks.find((a) => a.id === "unlock" && a.ok), { timeout: 40, message: "tickerEnabled on ack" });
  const bobBack = await t.waitMessage(bob, stat, { kind: "actionbar", pack: "stats_bp", timeout: 80 });
  t.log("Bob after allow", bobBack.plain);
  const still = t.tick;
  await t.wait(50);
  t.check(t.messages(ann, { kind: "actionbar", pack: "stats_bp", since: still }).filter((m) => stat.test(m.plain)).length === 0, "Ann's stored off still wins after the realm allows it again");
}
