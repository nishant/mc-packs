// Story Questlines: "A Champion's Heart" with the Kitchen (cooking_bp) installed and Champions (elite_bp) absent:
// Grandmother Gristle stands in for the hearts. The player accepts the chapter from Bea (the jump only offers it),
// stands at the watchtower, a real Gristle kill finishes the step and Bea's report is the Gristle one (heart=gristle).
// Queued, not run: the one-line header command is the recipe.
//   node tools/test-bds/run.mjs --quiet --only saga_bp,cooking_bp --scenario tools/test-bds/examples/saga-gristle-kill.js --timeout 600
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
  /** Answers Next until the last page, then the button matching `last`; returns every page's body. */
  async function pages(p, last, timeout = 300) {
    /** @type {string[]} */
    const bodies = [];
    for (;;) {
      const f = await t.waitForm(p, { timeout });
      bodies.push(String(f.body ?? ""));
      if (f.buttons.some((b) => /^next$/i.test(b))) {
        f.answer("Next");
        continue;
      }
      f.answer(f.buttons.find((b) => last.test(b)) ?? f.buttons[0]);
      return bodies;
    }
  }

  const p = await t.player("Cook", { op: true });
  await t.wait(140); // the installed-packs scan (realm:help_ping) runs 5 seconds after the world loads

  debug(p, { action: "jump", story: "hearth_and_table", chapter: "hearts", flags: { way: "old" } });
  await t.wait(5);
  // The jump only offers the chapter: accept it from Bea.
  const offer = (await talk(p, "bea")).find((o) => o.key === "start:hearth_and_table");
  t.assert(!!offer, "Bea offers A Champion's Heart");
  const intro = pages(p, /^accept$/i);
  choose(p, "start:hearth_and_table");
  await intro;
  const since = t.tick;
  t.check(!!(await t.waitMessage(p, /Bring down Grandmother Gristle/, { since: since - 40, timeout: 100 }).catch(() => undefined)), "the Gristle step is listed with cooking on and elite off");

  t.assert(t.cmd(p, "/realm:saga_place watchtower").ok, "/realm:saga_place watchtower ran");
  await t.wait(5);
  const dim = p.dimension;
  const gristle = () => dim.getEntities({ tags: ["realm:saga:gristle"] });
  // Standing at the watchtower brings her out (the tracker's radius is 40).
  for (let i = 0; i < 120 && !gristle().length; i++) await t.wait(5);
  t.assert(gristle().length > 0, "Grandmother Gristle spawns with cooking on and elite off");
  const kill = t.tick;
  for (const e of gristle()) e.kill(); // everyone within 32 blocks of her counts, so the kill is credited to Cook
  await t.wait(20);
  t.check(t.messages(p, { since: kill }).some((m) => /Grandmother Gristle/.test(m.plain)), "the kill is announced");

  // The other steps of the chapter (storm and fish), then Bea takes the report: the Gristle ending, not the hearts one.
  for (const i of [1, 2]) debug(p, { action: "bump", story: "hearth_and_table", i, n: 100000 });
  await t.wait(10);
  const got = await talk(p, "bea");
  t.assert(got.some((o) => o.key === "end:hearth_and_table"), `Bea takes the report after the kill (${JSON.stringify(got.map((o) => o.key))})`);
  const outro = pages(p, /^finish/i);
  choose(p, "end:hearth_and_table");
  const bodies = (await outro).join("\n");
  t.check(/Grandmother Gristle's heart/.test(bodies) && !/Two hearts/.test(bodies), `the report is the Gristle one (heart=gristle): ${bodies.slice(0, 120)}`);
}
