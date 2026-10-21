// Town Projects + Townsfolk, two towns (F36): Riverside (the first town) has Mayor Bram, placed in it; Oakfield gets
// its own mayor. Each mayor offers its own town wherever the player stands, never the other (both are placed), and
// opens that town's menu (the mayor's page: the story so far, each open project with why the town wants it, what the
// next level brings); progress stays per town.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp,npc_bp --scenario tools/test-bds/examples/town-two-towns.js --timeout 600
export default async function (t) {
  const sys = t.system;
  /** @type {{ id: string, m: any, tick: number }[]} */
  const events = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!["realm:npc_offer", "realm:npc_talk", "realm:npc_mayor_ack"].includes(id)) return;
      try {
        events.push({ id, m: JSON.parse(message), tick: t.tick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id, since = 0) => events.filter((e) => e.id === id && e.tick >= since).map((e) => e.m);
  t.server("/gamerule domobspawning false"); // a flat world spawns slimes by day; one killed a survival player mid-run (O80)
  const p = await t.player("Ann", { op: true, x: 0, z: 0 });
  await t.wait(40);
  const town = (action, extra = {}) => sys.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", ...extra }));
  const dump = async (id) => {
    await t.wait(1); // a dump just before answered in this tick: never take its message for this one
    const since = t.tick;
    town("dump", { town: id });
    const m = await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 });
    return JSON.parse(m.plain);
  };
  /** Taps an NPC as Ann and picks `pick` (a button label) or Goodbye; returns the offer keys and the next form. */
  const tap = async (npc, pick) => {
    await t.wait(12); // Townsfolk ignores a player's taps for 10 ticks after the last (TAP_COOLDOWN)
    const since = t.tick;
    const form = t.waitForm(p, { timeout: 100 });
    sys.sendScriptEvent("realm:npc_debug", JSON.stringify({ action: "tap", npc, player: "Ann" }));
    const f = await form;
    const req = of("realm:npc_talk", since).find((m) => m.npc === npc)?.req;
    const keys = of("realm:npc_offer", since).filter((m) => m.req === req && m.pack === "town_bp").sort((a, b) => a.order - b.order).map((m) => m.key);
    if (!pick) {
      f.answer("Goodbye");
      await t.wait(5);
      return { keys };
    }
    const next = t.waitForm(p, { timeout: 100 });
    f.answer(pick);
    const menu = await next;
    menu.answer("Close");
    await t.wait(5);
    return { keys, menu };
  };

  t.assert(t.cmd(p, "/realm:npc_add bram").ok, "npc_add bram");
  await t.wait(20);
  let since = t.tick;
  town("add", { name: "Riverside" });
  await t.waitMessage(p, /Town Riverside added/, { since, timeout: 60 });
  const { top } = await t.loadArea(300, 0);
  p.teleport({ x: 300.5, y: top.y + 1, z: 0.5 });
  await t.wait(20);
  since = t.tick;
  town("add", { name: "Oakfield" });
  await t.waitMessage(p, /Town Oakfield added/, { since, timeout: 60 });
  await t.waitUntil(() => of("realm:npc_mayor_ack", since).some((m) => m.id === "mayor:oakfield" && m.ok), { timeout: 60, message: "Oakfield's mayor made" });
  const riverside = (await dump("riverside")).town;
  const oakfield = (await dump("oakfield")).town;
  t.log("mayors:", riverside.m, oakfield.m, oakfield.mn);
  t.check(riverside.m === "bram" && oakfield.m === "mayor:oakfield", "Bram for the first town, Oakfield its own");
  await t.wait(40);

  // Each town's own projects.
  since = t.tick;
  town("finish", { town: "riverside", project: "well" });
  await t.waitMessage(p, /Riverside finished its Well/, { since, timeout: 60 });
  const rp = (await dump("riverside")).progress.find(([id]) => id === "well")[1];
  const op = (await dump("oakfield")).progress.find(([id]) => id === "well")[1];
  t.check(rp.done === 1 && op.done === 0, "Riverside's well is done, Oakfield's isn't");

  // From inside Oakfield, Bram offers Riverside only; Oakfield's mayor offers Oakfield only.
  let r = await tap("bram");
  t.log("Bram tapped from Oakfield:", JSON.stringify(r.keys));
  t.check(JSON.stringify(r.keys) === JSON.stringify(["town:riverside"]), "Bram: his own town, not the one the player is in (it has its mayor)");
  r = await tap("mayor:oakfield", "Town projects (Oakfield)");
  t.check(JSON.stringify(r.keys) === JSON.stringify(["town:oakfield"]), "Oakfield's mayor: Oakfield");
  t.check(/Oakfield/.test(r.menu.title), `Oakfield's menu opens (${r.menu.title})`);
  // The mayor's page (F38): Oakfield's own story, its open projects with their why, and the next level.
  const body = String(r.menu.body ?? "").replace(/§./g, "");
  t.log("Oakfield's page:", body.replace(/\n/g, " | ").slice(0, 400));
  t.check(/The story so far/.test(body) && /Founded by Ann/.test(body), "the story so far, from the day it was founded");
  t.check(!/The Well was finished/.test(body), "Riverside's well isn't in Oakfield's story");
  t.check(/Well - Fresh water, so families can move in/.test(body), "the open Well says why the town wants it");
  t.check(/Next, as a Village \(level 2\): new projects \(Lamp Posts, Garden Plot\)/.test(body), "what the next level brings");

  // From inside Riverside: still each its own.
  p.teleport({ x: 0.5, y: riverside.y, z: 0.5 });
  await t.wait(20);
  r = await tap("mayor:oakfield");
  t.check(JSON.stringify(r.keys) === JSON.stringify(["town:oakfield"]), "Oakfield's mayor from Riverside: Oakfield only (Bram is placed)");
  r = await tap("bram", "Town projects (Riverside)");
  t.check(JSON.stringify(r.keys) === JSON.stringify(["town:riverside"]) && /Riverside/.test(r.menu.title), "Bram opens Riverside");
  t.check(/The Well was finished/.test(String(r.menu.body ?? "").replace(/§./g, "")), "Riverside's story has its finished well");
}
