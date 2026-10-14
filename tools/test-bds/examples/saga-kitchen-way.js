// Story Questlines: without the Kitchen pack (cooking_bp), Bea's "Rations for the Wardens" (hearth_and_table) offers
// only "The old way": "The new kitchen" asks for dishes nobody could cook. (With every pack installed, both are.)
//   node tools/test-bds/run.mjs --quiet --only saga_bp --scenario tools/test-bds/examples/saga-kitchen-way.js --timeout 300
export default async function (t) {
  const sys = t.system;
  /** @type {any[]} */
  const offers = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      try {
        if (id === "realm:npc_offer") offers.push(JSON.parse(message));
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const p = await t.player("Cook", { op: true });
  await t.wait(140); // the installed-packs scan (realm:help_ping) is done 5 seconds after the world loads
  sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.id, action: "jump", story: "hearth_and_table", chapter: "rations" }));
  await t.wait(5);
  sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: p.id, npc: "bea", req: "k1" }));
  await t.wait(4);
  t.assert(offers.some((o) => o.req === "k1" && o.key === "start:hearth_and_table"), `Bea offers Hearth and Table (${JSON.stringify(offers.map((o) => o.key))})`);
  const last = (async () => {
    for (;;) {
      const f = await t.waitForm(p, { timeout: 200 });
      if (f.buttons.some((b) => /^next$/i.test(b))) f.answer("Next");
      else return f;
    }
  })();
  sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ pack: "saga_bp", player: p.id, key: "start:hearth_and_table" }));
  const f = await last;
  t.log("buttons:", JSON.stringify(f.buttons));
  t.check(!f.buttons.some((b) => /new kitchen/i.test(b)), "no \"The new kitchen\" without the Kitchen pack");
  t.check(f.buttons.some((b) => /old way/i.test(b)), "\"The old way\" is offered");
  f.answer(f.buttons.find((b) => /old way/i.test(b)) ?? 0);
  await t.waitMessage(p, /Hearth and Table: Rations for the Wardens/, { since: t.tick - 10, timeout: 100 });
}
