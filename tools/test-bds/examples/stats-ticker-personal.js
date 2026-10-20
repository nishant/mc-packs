// The stats ticker is each player's choice. This Realm allows it and defaults it on, so a new
// player sees it without toggling. /realm:stats and /realm:prefs write the same stats:pref key.
// A stored off stays off. Disallowing it for the realm hides it and does not erase that choice.
// Before 7dac598caa6dd6ee526506ebbcf4821a677ed64f: tickerDefaultOn is false, so Ann's first wait
// for an action-bar stat times out.
// Player properties are read by a console-only hook inside Stats, not from the separate test add-on.
//   mkdir -p /tmp/stats-personal
//   node tools/test-bds/hooks/stats-prefs.mjs /tmp/stats-personal/packs
//   node tools/test-bds/run.mjs --quiet --packs /tmp/stats-personal/packs --only stats_bp,settings_bp --scenario tools/test-bds/examples/stats-ticker-personal.js --timeout 300
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
  const defaultsAt = t.tick;
  const ann = await t.player("Ann");
  const bob = await t.player("Bob", { x: ann.location.x + 3, z: ann.location.z });
  let probeId = 0;
  const probe = async (player) => {
    const id = `pref_${++probeId}`;
    const prefix = `stats pref ${id} `;
    const reply = t.waitMessage(player, new RegExp(`^stats pref ${id} `), { timeout: 80 });
    await t.console(`scriptevent harness:stats_pref_ping ${JSON.stringify({ id, name: player.name })}`);
    return JSON.parse((await reply).plain.slice(prefix.length));
  };
  const stat = /Playtime|Deaths|Mob kills|Blocks mined|Distance/;
  const annLine = await t.waitMessage(ann, stat, { kind: "actionbar", pack: "stats_bp", timeout: 80, since: defaultsAt });
  t.log("Ann default", annLine.plain);
  t.check((await probe(ann)).pref === null, "showing the default does not write a choice");
  const bobLine = await t.waitMessage(bob, stat, { kind: "actionbar", pack: "stats_bp", timeout: 80, since: defaultsAt });
  t.log("Bob default", bobLine.plain);

  const toggleAt = t.tick;
  const menu = t.waitForm(ann);
  t.assert(t.cmd(ann, "/realm:stats").ok, "stats menu");
  (await menu).answer("Stats ticker");
  const again = await t.waitForm(ann, { timeout: 40 });
  again.answer(null);
  const off = await t.waitMessage(ann, /Stats ticker: Disabled/, { timeout: 40, pack: "stats_bp", since: toggleAt });
  t.check(/Disabled/.test(off.plain), "the stats menu toggles her ticker off");
  const saved = JSON.parse(String((await probe(ann)).pref ?? "{}"));
  t.check(saved.ticker === false, `explicit off is stored (${JSON.stringify(saved)})`);
  const quiet = t.tick;
  await t.wait(50);
  t.check(t.messages(ann, { kind: "actionbar", pack: "stats_bp", since: quiet + 25 }).filter((m) => stat.test(m.plain)).length === 0, "her ticker stays off");
  t.check(t.messages(bob, { kind: "actionbar", pack: "stats_bp", since: quiet }).some((m) => stat.test(m.plain)), "Bob still follows the realm default");

  const prefsOnAt = t.tick;
  const prefs = t.waitForm(ann);
  t.assert(t.cmd(ann, "/realm:prefs").ok, "prefs menu");
  const form = await prefs;
  t.log("prefs", form.elements?.map((e) => e.label).filter(Boolean).slice(0, 8));
  form.answer({ "Stats ticker above my hotbar": true });
  const savedNote = await t.waitForm(ann, { timeout: 80 });
  savedNote.answer("Done");
  await t.waitUntil(() => acks.some((a) => a.pack === "stats_bp" && a.key === "ticker" && a.ok), { timeout: 80, message: "prefs ack" });
  const back = await t.waitMessage(ann, stat, { kind: "actionbar", pack: "stats_bp", timeout: 80, since: prefsOnAt });
  t.log("Ann after prefs on", back.plain);
  t.check(JSON.parse(String((await probe(ann)).pref)).ticker === true, "an explicit on is stored even when it matches the default");
  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "default_off", pack: "stats_bp", key: "tickerDefaultOn", value: false }));
  await t.waitUntil(() => acks.find((a) => a.id === "default_off" && a.ok), { timeout: 40, message: "default off ack" });
  t.check((await probe(ann)).ticker === true, "Ann's explicit on survives a later default off");
  t.check((await probe(bob)).ticker === false, "Bob with no saved choice follows the default off");
  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "default_on", pack: "stats_bp", key: "tickerDefaultOn", value: true }));
  await t.waitUntil(() => acks.find((a) => a.id === "default_on" && a.ok), { timeout: 40, message: "default on ack" });
  t.check((await probe(bob)).ticker === true, "Bob follows the default on again");

  const prefsOff = t.waitForm(ann);
  t.cmd(ann, "/realm:prefs");
  (await prefsOff).answer({ "Stats ticker above my hotbar": false });
  const savedOff = await t.waitForm(ann, { timeout: 80 });
  savedOff.answer("Done");
  const storedOff = await probe(ann);
  t.assert(typeof storedOff.pref === "string" && JSON.parse(storedOff.pref).ticker === false, "prefs stored off inside its owning add-on");

  const lock = t.tick;
  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "lock", pack: "stats_bp", key: "tickerEnabled", value: false }));
  await t.waitUntil(() => acks.find((a) => a.id === "lock" && a.ok), { timeout: 40, message: "tickerEnabled ack" });
  await t.wait(50);
  t.check(t.messages(ann, { kind: "actionbar", pack: "stats_bp", since: lock + 20 }).filter((m) => stat.test(m.plain)).length === 0, "realm disallow hides Ann");
  t.check(t.messages(bob, { kind: "actionbar", pack: "stats_bp", since: lock + 20 }).filter((m) => stat.test(m.plain)).length === 0, "realm disallow hides Bob too");
  t.check(JSON.parse(String((await probe(ann)).pref)).ticker === false, "the disallow does not erase her off choice");

  const unlockAt = t.tick;
  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "unlock", pack: "stats_bp", key: "tickerEnabled", value: true }));
  await t.waitUntil(() => acks.find((a) => a.id === "unlock" && a.ok), { timeout: 40, message: "tickerEnabled on ack" });
  const bobBack = await t.waitMessage(bob, stat, { kind: "actionbar", pack: "stats_bp", timeout: 80, since: unlockAt });
  t.log("Bob after allow", bobBack.plain);
  const still = t.tick;
  await t.wait(50);
  t.check(t.messages(ann, { kind: "actionbar", pack: "stats_bp", since: still }).filter((m) => stat.test(m.plain)).length === 0, "Ann's stored off still wins after the realm allows it again");
}
