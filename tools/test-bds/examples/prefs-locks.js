// Realm Settings 1.4.0: My preferences shows a preference the operators overrode as locked text (not a control),
// says Save applies changes, and closing with X says nothing was saved (with the way back).
//   node tools/test-bds/run.mjs --quiet --only settings_bp,hud_bp,map_bp --scenario tools/test-bds/examples/prefs-locks.js --timeout 600
export default async function (t) {
  const sys = t.system;
  const p = await t.player("Ann", { op: true });
  let n = 0;
  const acks = [];
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "realm:cfg_ack") acks.push(JSON.parse(message));
  }, { namespaces: ["realm"] });
  const set = async (pack, key, value, player) => {
    const id = `pl${++n}`;
    sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id, pack, key, value, player: player?.id }));
    const ack = await t.waitUntil(() => acks.find((a) => a.id === id), { timeout: 40, message: `ack ${pack}.${key}` });
    t.assert(ack.ok, `${pack}.${key} = ${value}`);
  };
  await t.wait(40);
  await set("hud_bp", "enabled", false);

  // 1. The coordinates HUD is off for the realm: its three preferences are locked text; the minimap's are switches.
  let next = t.waitForm(p, { timeout: 200 });
  t.assert(t.cmd(p, "/realm:prefs").ok, "/realm:prefs ran");
  let f = await next;
  const text = JSON.stringify(f);
  t.check(/Changes apply when you press/.test(text), "says Save applies the changes");
  const locked = (text.match(/Locked by the operators: Coordinates HUD is Disabled for the whole realm/g) ?? []).length;
  t.check(locked === 3, `the 3 Coordinates HUD preferences are locked (${locked})`);
  const toggles = (f.elements ?? []).filter((c) => c.kind === "toggle").map((c) => c.label);
  t.check(!toggles.includes("Coordinates HUD") && toggles.includes("Compass strip"), `no switch for a locked preference, switches for the rest (${toggles.slice(0, 4).join(", ")}...)`);

  // 2. Closed with X: "Nothing was saved", Back reopens the preferences.
  next = t.waitForm(p, { timeout: 100 });
  f.answer(null);
  const told = await next;
  t.check(/Nothing was saved/.test(JSON.stringify(told)), "closing with X says nothing was saved");
  next = t.waitForm(p, { timeout: 100 });
  told.answer(0);
  f = await next;
  t.check(/My preferences/.test(JSON.stringify(f)), "Back to my preferences opens them again");
  f.answer(null);
  await t.waitForm(p, { timeout: 100 }).then((x) => x.answer(1));

  // 3. Back on for the realm: the HUD's preferences are switches again.
  await set("hud_bp", "enabled", true);
  next = t.waitForm(p, { timeout: 200 });
  t.cmd(p, "/realm:prefs");
  f = await next;
  t.check(!/Locked by the operators: Coordinates HUD/.test(JSON.stringify(f)) && (f.elements ?? []).some((c) => c.kind === "toggle" && c.label === "Coordinates HUD"), "unlocked again when the operators turn it back on");
  f.answer(null);
  await t.waitForm(p, { timeout: 100 }).then((x) => x.answer(1));

}
