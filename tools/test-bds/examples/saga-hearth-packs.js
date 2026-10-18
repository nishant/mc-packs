// Story Questlines: Hearth and Table (Bea) can be finished without the Kitchen (cooking_bp) and Champions (elite_bp)
// packs. "A Champion's Heart" asked for 2 Champion's Hearts, which only drop when both are installed: now the story's
// own champion (Grandmother Gristle at the Ruined Watchtower) stands in for them. And a player who chose "The new
// kitchen" before the Kitchen pack was removed gets the old way's plain food instead of dishes nobody can cook.
//   node tools/test-bds/run.mjs --quiet --only saga_bp --scenario tools/test-bds/examples/saga-hearth-packs.js --timeout 400
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
  let reqN = 0;
  async function talk(p, npc) {
    const req = `r${++reqN}`;
    sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: p.id, npc, req }));
    await t.wait(4);
    return offers.filter((o) => o.req === req && o.pack === "saga_bp");
  }
  const choose = (p, key) => sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ pack: "saga_bp", player: p.id, key }));
  const debug = (p, msg) => sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.name, ...msg }));
  /** Answers Next until the last page, then `last`. */
  async function pages(p, last, timeout = 300) {
    for (;;) {
      const f = await t.waitForm(p, { timeout });
      if (f.buttons.some((b) => /^next$/i.test(b))) {
        f.answer("Next");
        continue;
      }
      f.answer(last);
      return f;
    }
  }
  async function accept(p, npc, title) {
    const got = await talk(p, npc);
    const start = got.find((o) => o.key === "start:hearth_and_table");
    t.assert(start && start.label.includes(title), `${npc} offers ${title} (${JSON.stringify(got.map((o) => o.label))})`);
    const w = pages(p, "Accept");
    choose(p, "start:hearth_and_table");
    await w;
    await t.waitMessage(p, new RegExp(`Hearth and Table: ${title}`), { since: t.tick - 20, timeout: 100 });
  }

  const p = await t.player("Cook", { op: true });
  await t.wait(140); // the installed-packs scan (realm:help_ping) runs 5 seconds after the world loads

  // 1. A Champion's Heart, with neither pack: the champion step replaces the hearts.
  debug(p, { action: "jump", story: "hearth_and_table", chapter: "hearts", flags: { way: "old" } });
  await t.wait(5);
  const since = t.tick;
  await accept(p, "bea", "A Champion's Heart");
  t.check(!!(await t.waitMessage(p, /Bring down Grandmother Gristle/, { since, timeout: 60 }).catch(() => undefined)), "the champion step is listed");
  for (const i of [1, 2, 4]) debug(p, { action: "bump", story: "hearth_and_table", i, n: 100000 });
  await t.wait(10);
  let got = await talk(p, "bea");
  t.check(got.some((o) => o.key === "end:hearth_and_table"), `Bea takes the report with no Champion's Heart (${JSON.stringify(got.map((o) => o.key))})`);

  // 2. Chowder for the Docks, new-kitchen player, no Kitchen pack: rabbit stews do.
  debug(p, { action: "jump", story: "hearth_and_table", chapter: "chowder", flags: { way: "kitchen" } });
  await t.wait(5);
  await accept(p, "bea", "Chowder for the Docks");
  debug(p, { action: "bump", story: "hearth_and_table", i: 0, n: 100 });
  p.giveItem(new t.mc.ItemStack("minecraft:rabbit_stew", 1), true);
  p.giveItem(new t.mc.ItemStack("minecraft:rabbit_stew", 1), true);
  await t.wait(10);
  got = await talk(p, "tobin");
  t.check(got.some((o) => o.key === "end:hearth_and_table"), `Tobin takes 2 rabbit stews from a new-kitchen player (${JSON.stringify(got.map((o) => o.key))})`);
}
