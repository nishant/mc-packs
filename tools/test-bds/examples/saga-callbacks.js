// Story Questlines: choices made earlier echo later. The Act IV council thanks the guild asked for at
// the end of Act III (act3_deep.keys), and Hollis's Act V chapter remembers how Lamp in the Window
// forgave him (hollis_faith.forgive). Checked by starting the chapters with those flags set and
// reading the dialogue pages.
//   node tools/test-bds/run.mjs --quiet --only saga_bp --scenario tools/test-bds/examples/saga-callbacks.js --timeout 400
export default async function (t) {
  const sys = t.system;
  /** @type {{ tick: number, m: any }[]} */
  const offers = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      try {
        if (id === "realm:npc_offer") offers.push({ tick: sys.currentTick, m: JSON.parse(message) });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  let reqN = 0;
  async function talk(p, npc) {
    const req = `r${++reqN}`;
    sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: p.id, npc, req }));
    await t.wait(4);
    return offers.filter((o) => o.m.req === req && o.m.pack === "saga_bp").map((o) => o.m);
  }
  const choose = (p, key) => sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ pack: "saga_bp", player: p.id, key }));
  const debug = (p, msg) => sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.name, ...msg }));
  async function pages(p, last, timeout = 300) {
    const seen = [];
    for (;;) {
      const f = await t.waitForm(p, { timeout });
      seen.push(f);
      if (f.buttons.some((b) => /^next$/i.test(b))) {
        f.answer("Next");
        continue;
      }
      f.answer(typeof last === "function" ? last(f) : last);
      return seen;
    }
  }
  const bodies = (seen) => seen.map((f) => String(f.body)).join("\n");

  // Act IV council: the miners stood with you at the end of Act III.
  const p = await t.player("Tester", { op: true });
  debug(p, { action: "finish", story: "act3_deep", flags: { keys: "miners", elsie: "forgive", "g:hollis": "saved", "g:quill": "trusted" } });
  await t.wait(5);
  let got = await talk(p, "elsie");
  let start = got.find((o) => o.key === "start:act4_seals");
  t.assert(start, `Elsie offers Act IV (offers: ${JSON.stringify(got)})`);
  let w = pages(p, "Accept");
  choose(p, "start:act4_seals");
  await w;
  await t.waitMessage(p, /The Three Seals: The Council at the Inn/, { since: t.tick, timeout: 100 });
  for (const npc of ["reyes", "tobin", "ida", "sol"]) await talk(p, npc);
  await t.waitMessage(p, /Ask Sol the Sky-reader to come to the council: done/i, { since: t.tick - 40, timeout: 100 });
  got = await talk(p, "elsie");
  t.assert(got.some((o) => o.key === "end:act4_seals"), `Elsie takes the report (offers: ${JSON.stringify(got)})`);
  w = pages(p, (f) => f.buttons.find((b) => /Tide Seal/.test(b)) ?? 0);
  choose(p, "end:act4_seals");
  let seen = await w;
  t.check(bodies(seen).includes("The miners are camped at the mine mouth"), "the council outro thanks the miners (act3_deep.keys)");
  t.check(!bodies(seen).includes("The wayfarers have horses"), "and not the wayfarers");
  await pages(p, "OK");
  await t.waitMessage(p, /Chapter complete: The Council at the Inn/, { since: t.tick, timeout: 100 });

  // Act V, A Lamp for the Lost: Hollis remembers "it wasn't you" from Lamp in the Window.
  debug(p, { action: "finish", story: "hollis_faith", flags: { forgive: "mercy" } });
  debug(p, { action: "finish", story: "act4_seals" });
  debug(p, { action: "jump", story: "act5_lantern", chapter: "chapel", flags: { "g:hollis": "saved", "g:quill": "trusted", "g:allies": "1" } });
  await t.wait(5);
  got = await talk(p, "hollis");
  start = got.find((o) => o.key === "start:act5_lantern");
  t.assert(start && start.label.includes("A Lamp for the Lost"), `Hollis offers his chapter: ${JSON.stringify(got)}`);
  w = pages(p, "Not now");
  choose(p, "start:act5_lantern");
  seen = await w;
  t.check(bodies(seen).includes("This morning I believed it"), "Hollis's intro reads hollis_faith.forgive = mercy");
  t.check(!bodies(seen).includes("Tomorrow night is the doing better"), "and not the iron line");
}
