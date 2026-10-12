// Safe Zones: an operator adds a zone from the menu (name and radius form, preview, confirm), the pack announces
// its list with realm:zones, players can add their own once playersCreate is on (one each, radius up to 64), and
// a list of 25 zones with long names is sent in several parts, each under 2048 characters, also after a restart.
// node tools/test-bds/run.mjs --quiet --only zones_bp --scenario tools/test-bds/examples/zones-flow.js --timeout 420
export default async function (t) {
  const lists = [];
  t.system.afterEvents.scriptEventReceive.subscribe((e) => {
    if (e.id === "realm:zones") lists.push({ len: e.message.length, msg: JSON.parse(e.message) });
  }, { namespaces: ["realm"] });
  const ours = () => lists.filter((l) => l.msg.src === "zones");
  const p = await t.player("Op", { op: true });
  if (t.phase === 1) {
    // Add "Home", radius 64, from the menu.
    t.answerForm(p, "Add a safe zone here", { Name: "Home", Radius: 64 });
    t.assert(t.cmd(p, "/realm:zones").ok, "/realm:zones ran");
    await t.waitMessage(p, /outline of Home shows around you/, { timeout: 100 });
    const confirm = await t.waitForm(p, { timeout: 200 });
    t.log(`confirm "${confirm.title}": ${confirm.buttons.join(" | ")}`);
    t.check(/Create this safe zone/.test(confirm.title), "the confirm form opens after the preview");
    confirm.answer("Create it");
    const added = await t.waitMessage(p, /Safe zone added/, { timeout: 60 });
    t.log(added.plain);
    await t.waitUntil(() => ours().some((l) => l.msg.zones.length === 1 && l.msg.zones[0].name === "Home" && l.msg.zones[0].r === 64), { timeout: 40, message: "realm:zones sent with Home" });

    // The menu says where you stand is protected; Show outline writes the action bar.
    t.echoActionBar = true;
    t.answerForm(p, "Safe zones", "Home", "Show outline");
    t.assert(t.cmd(p, "/realm:zones").ok, "/realm:zones ran again");
    await t.waitMessage(p, /Home: You're inside/, { kind: "actionbar", timeout: 100 });
    const main = t.forms(p).find((f) => f.title.includes("Safe Zones") && f.body.includes("protected"));
    t.check(!!main, "the menu says the spot is protected by Home");

    // A second zone can't take the same name: the form reopens with a free one.
    t.answerForm(p, "Add a safe zone here", { Name: "Home", Radius: 16 }, (f) => (t.log(`name form reopened: ${JSON.stringify(f.elements).slice(0, 160)}`), null));
    t.assert(t.cmd(p, "/realm:zones").ok, "/realm:zones ran (duplicate name)");
    await t.waitMessage(p, /already a safe zone called Home/, { timeout: 100 });

    // Players can add their own once playersCreate is on: one each, radius up to 64.
    const v = await t.player("Villager", { x: p.location.x + 20, z: p.location.z + 20 });
    const vMenuP = t.waitForm(v, { timeout: 100 });
    t.cmd(v, "/realm:zones");
    const vMenu = await vMenuP;
    t.check(!vMenu.buttons.some((b) => /Add a safe zone/.test(b)), "a player can't add a zone while playersCreate is off");
    vMenu.answer(null);
    t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "zt1", pack: "zones_bp", key: "playersCreate", value: true }));
    await t.wait(10);
    t.answerForm(v, "Add a safe zone here", (f) => {
      const slider = f.elements.find((e) => /Radius/.test(e.label ?? ""));
      t.log(`player radius slider: ${JSON.stringify(slider)}`);
      t.check(slider && slider.max === 64, "a player's radius slider goes up to 64");
      return { Name: "Camp", Radius: 64 };
    });
    t.assert(t.cmd(v, "/realm:zones").ok, "/realm:zones for a player with playersCreate on");
    const vConfirm = await t.waitForm(v, { timeout: 250, title: "Create this safe zone" });
    vConfirm.answer("Create it");
    await t.waitMessage(v, /Safe zone added/, { timeout: 60 });
    await t.waitUntil(() => ours().some((l) => l.msg.zones.some((z) => z.name === "Camp")), { timeout: 40, message: "realm:zones sent with Camp" });
    t.answerForm(v, (f) => (t.check(!f.buttons.some((b) => /Add a safe zone/.test(b)), "a player with their one zone gets no Add button"), null));
    t.assert(t.cmd(v, "/realm:zones").ok, "/realm:zones for the player again");
    await t.wait(20);

    // 23 more zones with the longest names (25 in all): the list must be split for the 2048-character limit.
    // The preview's confirm menu takes 6 s; running /realm:zones again offers "Create <name>" at once.
    for (let i = 1; i <= 23; i++) {
      const name = `Zone number ${i} abcdefghijk`.slice(0, 24);
      t.answerForm(p, "Add a safe zone here", { Name: name, Radius: 512 });
      t.assert(t.cmd(p, "/realm:zones").ok, `/realm:zones (${name})`);
      await t.waitMessage(p, /outline of .* shows around you/, { timeout: 100 });
      t.answerForm(p, `Create ${name}`);
      t.assert(t.cmd(p, "/realm:zones").ok, `/realm:zones again (${name})`);
      await t.waitMessage(p, /Safe zone added/, { timeout: 100 });
    }
    lists.length = 0;
    t.system.sendScriptEvent("realm:zones_ping", "{}");
    await t.waitUntil(() => ours().length >= 2 && ours().every((l) => l.msg.parts === ours().length), { timeout: 100, message: "all parts of the zones list" });
    const total = ours().reduce((n, l) => n + l.msg.zones.length, 0);
    t.log(`${ours().length} parts, ${total} zones, longest part ${Math.max(...ours().map((l) => l.len))} characters`);
    t.check(total === 25, "all 25 zones are sent");
    t.check(ours().every((l) => l.len < 2048), "every part is under 2048 characters");
    t.restart("25 zones saved, restarting");
  }
  // Phase 2: the full list comes in parts after a ping, and the menu counts them.
  lists.length = 0;
  t.system.sendScriptEvent("realm:zones_ping", "{}");
  await t.waitUntil(() => ours().length >= 2 && ours().every((l) => l.msg.parts === ours().length), { timeout: 100, message: "all parts of the zones list after the restart" });
  const total = ours().reduce((n, l) => n + l.msg.zones.length, 0);
  t.log(`after the restart: ${ours().length} parts, ${total} zones`);
  t.check(total === 25, "all 25 zones survive the restart");
  t.answerForm(p, (f) => (t.check(f.buttons.some((b) => /Safe zones \(25\)/.test(b)), "the menu counts 25 zones"), null));
  t.assert(t.cmd(p, "/realm:zones").ok, "/realm:zones with 25 zones");
  await t.wait(20);
}
