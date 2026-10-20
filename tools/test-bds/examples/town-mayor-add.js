// Town Projects + Townsfolk, a mayor per town (F36): the realm's first town has Mayor Bram (no new NPC); the next town
// added gets its own `mayor:<id>` NPC near its center, named from mayorNames, with the mayor role only. A tap on it
// offers its own town; from inside a town whose mayor isn't placed (the first town, Bram not placed) it offers that
// town too, after its own. Renaming reaches the NPC, it stays one of a kind, and removing the town removes it.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp,npc_bp --scenario tools/test-bds/examples/town-mayor-add.js --timeout 600
export default async function (t) {
  const sys = t.system;
  /** @type {{ id: string, m: any, tick: number }[]} */
  const events = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!["realm:npc_offer", "realm:npc_mayor_ack", "realm:npc_places", "realm:npc_talk"].includes(id)) return;
      try {
        events.push({ id, m: JSON.parse(message), tick: t.tick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id, since = 0) => events.filter((e) => e.id === id && e.tick >= since).map((e) => e.m);
  const npcs = (id) => t.dimension.getEntities({ type: "minecraft:npc", tags: [`realm:npc_id:${id}`] });
  const p = await t.player("Ann", { op: true, x: 0, z: 0 });
  await t.wait(40);
  const town = (action, extra = {}) => sys.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", ...extra }));
  const dump = async (id) => {
    const since = t.tick;
    town("dump", { town: id });
    const m = await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 });
    return JSON.parse(m.plain);
  };
  /** Taps an NPC as Ann; returns the offer keys and the menu's buttons. */
  const tap = async (npc) => {
    const since = t.tick;
    const form = t.waitForm(p, { timeout: 100 });
    sys.sendScriptEvent("realm:npc_debug", JSON.stringify({ action: "tap", npc, player: "Ann" }));
    const f = await form;
    const req = of("realm:npc_talk", since).find((m) => m.npc === npc)?.req;
    const keys = of("realm:npc_offer", since).filter((m) => m.req === req && m.pack === "town_bp").sort((a, b) => a.order - b.order).map((m) => m.key);
    const buttons = f.buttons.map((b) => String(b.text ?? b).replace(/§./g, ""));
    f.answer("Goodbye");
    await t.wait(5);
    return { keys, buttons, title: f.title };
  };

  // 1. The realm's first town: Mayor Bram's (no NPC is made for it).
  let since = t.tick;
  town("add", { name: "Elm" });
  await t.waitMessage(p, /Town Elm added/, { since, timeout: 60 });
  const elm = await dump("elm");
  t.log("elm:", JSON.stringify({ m: elm.town.m, v: elm.town.v, mn: elm.town.mn }));
  t.check(elm.town.m === "bram" && elm.town.v === 2 && !elm.town.mn, "the first town's mayor is Mayor Bram");
  await t.wait(20);
  t.check(npcs("mayor:elm").length === 0, "no town mayor NPC for Bram's town");

  // 2. A second town: its own mayor at its center.
  const { top } = await t.loadArea(300, 0);
  p.teleport({ x: 300.5, y: top + 1, z: 0.5 });
  await t.wait(20);
  since = t.tick;
  town("add", { name: "Riverside" });
  await t.waitMessage(p, /Town Riverside added/, { since, timeout: 60 });
  await t.waitUntil(() => of("realm:npc_mayor_ack", since).some((m) => m.id === "mayor:riverside" && m.op === "set"), { timeout: 60, message: "set acked" });
  const ack = of("realm:npc_mayor_ack", since).find((m) => m.id === "mayor:riverside");
  t.check(ack.ok === true, `Townsfolk made the mayor (${JSON.stringify(ack)})`);
  const rs = await dump("riverside");
  t.log("riverside:", JSON.stringify({ m: rs.town.m, v: rs.town.v, mn: rs.town.mn }));
  t.check(rs.town.m === "mayor:riverside" && rs.town.v === 2 && /^Mayor [A-Z][a-z]+$/.test(rs.town.mn ?? ""), "Riverside's own mayor, named from mayorNames");
  await t.waitUntil(() => npcs("mayor:riverside").length > 0, { timeout: 60, message: "the mayor NPC" });
  const [mayor] = npcs("mayor:riverside");
  const d = Math.hypot(mayor.location.x - 300.5, mayor.location.z - 0.5);
  t.check(d <= 4, `the mayor stands at the town's center (${d.toFixed(1)} blocks)`);
  t.check(mayor.hasTag("realm:npc_role:mayor") && !mayor.hasTag("realm:npc_role:questgiver"), "the mayor role only");
  await t.waitUntil(() => of("realm:npc_places").some((m) => m.folk?.some((f) => f.id === "mayor:riverside")), { timeout: 60, message: "listed in realm:npc_places" });

  // 3. A tap in Riverside: only Riverside (Elm has Bram, but the player isn't in Elm).
  let r = await tap("mayor:riverside");
  t.log("tap in Riverside:", JSON.stringify(r));
  t.check(JSON.stringify(r.keys) === JSON.stringify(["town:riverside"]), "its own town only");
  t.check(r.buttons.includes("Town projects (Riverside)") && !r.buttons.some((b) => b.includes("Elm")), "the menu's button");
  t.check(!r.buttons.some((b) => b.startsWith("Ask about") || b.startsWith("Give ")), "no affinity buttons for a town mayor");
  t.check(r.title.includes(rs.town.mn) && r.title.includes("of Riverside"), `the menu title (${r.title})`);

  // 4. From inside Elm (Bram not placed): Riverside first, then Elm as the fallback.
  p.teleport({ x: 0.5, y: elm.town.y, z: 0.5 });
  await t.wait(20);
  r = await tap("mayor:riverside");
  t.log("tap in Elm:", JSON.stringify(r.keys));
  t.check(JSON.stringify(r.keys) === JSON.stringify(["town:riverside", "town:elm"]), "own town first, then the town the player is in");

  // 5. Rename: the NPC's name follows.
  since = t.tick;
  town("mayor_rename", { town: "riverside", name: "Mayor Pip" });
  await t.waitUntil(() => of("realm:npc_places", since).some((m) => m.folk?.some((f) => f.id === "mayor:riverside" && f.n === "Mayor Pip")), { timeout: 60, message: "renamed" });
  t.check((await dump("riverside")).town.mn === "Mayor Pip", "saved name");

  // 6. One of a kind, then gone with its town.
  await t.wait(220); // an audit (every 10 s)
  t.check(npcs("mayor:riverside").length === 1, "still exactly one mayor");
  since = t.tick;
  town("remove_town", { town: "riverside" });
  await t.waitUntil(() => of("realm:npc_mayor_ack", since).some((m) => m.id === "mayor:riverside" && m.op === "remove" && m.ok), { timeout: 60, message: "remove acked" });
  await t.wait(10);
  t.check(npcs("mayor:riverside").length === 0, "the mayor went with the town");
  await t.waitUntil(() => of("realm:npc_places", since).length > 0 && !of("realm:npc_places", since).at(-1).folk?.some((f) => f.id === "mayor:riverside"), { timeout: 60, message: "not listed any more" });
}
