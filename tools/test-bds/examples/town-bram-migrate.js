// Town Projects + Townsfolk, an existing world (F36): towns saved before mayors (the test hook "v1" makes the records
// look that way and forgets their mayors), Mayor Bram placed in the younger town. After a restart, Bram keeps the town
// nearest his post, the other town gets its own mayor when a player comes near it, and spots, progress, levels and
// protection are exactly as before.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp,npc_bp --scenario tools/test-bds/examples/town-bram-migrate.js --timeout 900
export default async function (t) {
  const sys = t.system;
  /** @type {{ id: string, m: any, tick: number }[]} */
  const events = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!["realm:npc_offer", "realm:npc_talk", "realm:npc_mayor_ack", "realm:npc_places"].includes(id)) return;
      try {
        events.push({ id, m: JSON.parse(message), tick: t.tick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id, since = 0) => events.filter((e) => e.id === id && e.tick >= since).map((e) => e.m);
  const npcs = (id) => t.dimension.getEntities({ type: "minecraft:npc", tags: [`realm:npc_id:${id}`] });
  const p = await t.player("Ann", { op: true, x: 0, z: 0 });
  // Automatic spots would pick spots for the towns while Ann is in them: this scenario is about mayors only.
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "nospots", pack: "town_bp", key: "autoSpots", value: false }));
  await t.wait(40);
  const town = (action, extra = {}) => sys.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", ...extra }));
  const dump = async (id) => {
    const since = t.tick;
    town("dump", { town: id });
    const m = await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 });
    return JSON.parse(m.plain);
  };
  /** What must not change: everything but the mayor fields. */
  const kept = (d) => JSON.stringify({ ...d.town, v: undefined, m: undefined, mn: undefined, progress: d.progress });

  if (t.phase === 1) {
    let since = t.tick;
    town("add", { name: "Riverside" });
    await t.waitMessage(p, /Town Riverside added/, { since, timeout: 60 });
    const { top } = await t.loadArea(300, 0);
    p.teleport({ x: 300.5, y: top.y + 1, z: 0.5 });
    await t.wait(20);
    t.assert(t.cmd(p, "/realm:npc_add bram").ok, "npc_add bram (in the younger town)");
    await t.wait(10);
    since = t.tick;
    town("add", { name: "Oakfield" });
    await t.waitMessage(p, /Town Oakfield added/, { since, timeout: 60 });
    await t.wait(20);
    // Progress and spots to keep: Riverside's well finished (no spot yet), Oakfield's notice board spot set, Oakfield unprotected.
    since = t.tick;
    town("finish", { town: "riverside", project: "well", donors: 2 });
    await t.waitMessage(p, /Riverside finished its Well/, { since, timeout: 60 });
    town("spot", { town: "oakfield", project: "notice_board", spot: { x: 306, y: top.y + 1, z: 6, f: 2 } });
    town("protect", { town: "oakfield", on: false });
    await t.wait(10);
    since = t.tick;
    town("v1");
    await t.waitUntil(() => of("realm:npc_mayor_ack", since).some((m) => m.id === "mayor:oakfield" && m.op === "remove" && m.ok), { timeout: 60, message: "Oakfield's mayor forgotten" });
    await t.wait(220); // two build intervals: nothing is migrated while held
    const before = { riverside: await dump("riverside"), oakfield: await dump("oakfield") };
    t.check(!before.riverside.town.m && !before.oakfield.town.v, "both towns look saved before mayors");
    t.world.setDynamicProperty("harness:before", JSON.stringify({ riverside: kept(before.riverside), oakfield: kept(before.oakfield) }));
    await t.wait(20);
    t.restart("v1 towns saved, restarting");
  }

  const before = JSON.parse(String(t.world.getDynamicProperty("harness:before")));
  // Load + 100 ticks: realm:npc_places; then the next interval migrates.
  let riverside;
  for (let i = 0; i < 20; i++) {
    riverside = await dump("riverside");
    if (riverside.town.v === 2) break;
    await t.wait(20);
  }
  const oakfield = await dump("oakfield");
  t.log("after:", JSON.stringify({ riverside: [riverside.town.m, riverside.town.mn], oakfield: [oakfield.town.m, oakfield.town.mn] }));
  t.check(oakfield.town.v === 2 && oakfield.town.m === "bram" && !oakfield.town.mn, "Bram keeps the town nearest his post");
  t.check(riverside.town.v === 2 && riverside.town.m === "mayor:riverside" && /^Mayor /.test(riverside.town.mn ?? ""), "the other town gets its own mayor");
  t.check(kept(riverside) === before.riverside, "Riverside's spots, progress and level unchanged");
  t.check(kept(oakfield) === before.oakfield, "Oakfield's spots, progress, level and protection unchanged");
  // Ann is in Riverside: its mayor is made within a build interval or two.
  await t.waitUntil(() => npcs("mayor:riverside").length === 1, { timeout: 400, message: "Riverside's mayor arrives" });
  const [mayor] = npcs("mayor:riverside");
  t.check(Math.hypot(mayor.location.x - 0.5, mayor.location.z - 0.5) <= 4, "at the town's center");
  t.check(!of("realm:npc_places").some((m) => m.folk?.some((f) => f.id === "mayor:oakfield")), "no mayor of its own for Bram's town");
  // Bram, tapped from Riverside (its mayor placed now): his own town only.
  await t.loadArea(300, 0);
  await t.wait(40);
  const since = t.tick;
  const form = t.waitForm(p, { timeout: 100 });
  sys.sendScriptEvent("realm:npc_debug", JSON.stringify({ action: "tap", npc: "bram", player: "Ann" }));
  const f = await form;
  const req = of("realm:npc_talk", since).find((m) => m.npc === "bram")?.req;
  const keys = of("realm:npc_offer", since).filter((m) => m.req === req && m.pack === "town_bp").map((m) => m.key);
  f.answer("Goodbye");
  t.check(JSON.stringify(keys) === JSON.stringify(["town:oakfield"]), `Bram offers Oakfield (${JSON.stringify(keys)})`);
}
