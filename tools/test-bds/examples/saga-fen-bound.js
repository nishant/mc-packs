// Story Questlines, Act V: a player who bound Vesna in The Witch's Bargain (g:vesna = bound) gets the
// ally chapter "The Witch Who Must Come" (act5_lantern/fen_bound) from Moss and plays it through: the
// soul lantern, a vigil at Hollow Fen after dark, Vesna's dialogue and its choice, the report to Moss.
// Then The Long Night counts her as an ally: Reyes offers it (not "No One Is Coming"), the intro shows
// her on the rocks, the lighter defend applies and the task her song covers is gone. A player who freed
// her never sees fen_bound, and one who never met her still gets "No One Is Coming".
//   node tools/test-bds/run.mjs --quiet --only saga_bp --scenario tools/test-bds/examples/saga-fen-bound.js --timeout 600
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
  /** Talks to a townsfolk as the player and returns our offers (after a few ticks). */
  async function talk(p, npc) {
    const req = `r${++reqN}`;
    sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: p.id, npc, req }));
    await t.wait(4);
    return offers.filter((o) => o.m.req === req && o.m.pack === "saga_bp").map((o) => o.m);
  }
  const choose = (p, key) => sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ pack: "saga_bp", player: p.id, key }));
  const debug = (p, msg) => sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.name, ...msg }));
  /** Pages one at a time: answers Next until the last page, then `last` (a label or a function of the form). Returns every form seen. */
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

  const p = await t.player("Tester", { op: true });
  t.assert(t.cmd(p, "/realm:saga_place witch_hut").ok, "set the Fen where the player stands");
  await t.waitMessage(p, /Place "witch_hut"/, { since: t.tick });
  debug(p, { action: "finish", story: "act4_seals" });
  debug(p, { action: "jump", story: "act5_lantern", chapter: "fen_bound", flags: { "g:vesna": "bound", "g:quill": "exposed", "g:hollis": "lost" } });
  await t.wait(5);

  // Moss offers the new chapter to a player who bound Vesna.
  let got = await talk(p, "moss");
  let start = got.find((o) => o.key === "start:act5_lantern");
  t.assert(start, `Moss offers Act V (offers: ${JSON.stringify(got)})`);
  t.assert(start.label.includes("The Witch Who Must Come"), `the offer is fen_bound: ${start.label}`);
  let w = pages(p, "Accept");
  choose(p, "start:act5_lantern");
  let seen = await w;
  t.check(bodies(seen).includes("You bound her. Vesna."), "intro page 1");
  t.check(bodies(seen).includes("the dark has him"), "intro reads g:hollis = lost");
  await t.waitMessage(p, /Have a soul lantern/, { since: t.tick, timeout: 100 });

  // Vesna rises at once (the objectives count together) and talks; pick the mercy choice.
  seen = await pages(p, (f) => f.buttons.find((b) => /loosen/i.test(b)) ?? 0, 600);
  t.check(bodies(seen).includes("You called. I came."), "Vesna's first page");
  t.check(seen[seen.length - 1].buttons.length === 2, `two choices: ${seen[seen.length - 1].buttons}`);
  await pages(p, "OK");
  await t.waitMessage(p, /Face Vesna when she rises: done/i, { since: t.tick, timeout: 100 });

  p.giveItem(new t.mc.ItemStack("minecraft:soul_lantern", 1), true);
  await t.waitMessage(p, /soul lantern to call her with: done/i, { timeout: 100 });
  t.server("/time set 14000");
  await t.waitMessage(p, /Call Vesna's name over the water at Hollow Fen after dark: done/i, { timeout: 1400 });

  // Report to Moss: the outro reads the meet's choice and the one button sets g:fen and counts the ally.
  got = await talk(p, "moss");
  t.assert(got.some((o) => o.key === "end:act5_lantern"), `Moss takes the report (offers: ${JSON.stringify(got)})`);
  w = pages(p, (f) => f.buttons[0]);
  choose(p, "end:act5_lantern");
  seen = await w;
  t.check(bodies(seen).includes("The songbird promised"), "outro reads fen_call = promised");
  t.check(seen[seen.length - 1].buttons[0].includes("She'll sing"), `the ending button: ${seen[seen.length - 1].buttons}`);
  await pages(p, "OK");
  await t.waitMessage(p, /Chapter complete: The Witch Who Must Come/, { since: t.tick, timeout: 100 });

  // The Long Night, not "No One Is Coming": she is an ally now.
  got = await talk(p, "moss");
  t.check(!got.some((o) => o.key === "start:act5_lantern"), "Moss has nothing more to start");
  got = await talk(p, "reyes");
  start = got.find((o) => o.key === "start:act5_lantern");
  t.assert(start, `Reyes offers the next chapter (offers: ${JSON.stringify(got)})`);
  t.check(start.label.includes("The Long Night"), `next is The Long Night: ${start.label}`);
  const since = t.tick;
  w = pages(p, "Accept");
  choose(p, "start:act5_lantern");
  seen = await w;
  t.check(bodies(seen).includes("bound and called"), "Long Night intro shows Vesna on the rocks");
  await t.waitMessage(p, /Lantern Night: The Long Night/, { since, timeout: 100 });
  await t.wait(5);
  const lines = t.messages(p, { since }).map((m) => m.plain);
  t.check(lines.some((l) => /Hold the Lighthouse through four waves and keep Pip alive/.test(l)), "the lighter defend applies");
  t.check(!lines.some((l) => /Hold the Lighthouse alone/.test(l)), "no no-allies defend");
  t.check(!lines.some((l) => /witch's steam/.test(l)), "no task for the missing witch");
  t.check(lines.some((l) => /No smugglers guard the cliffs/.test(l)), "the task for the missing smugglers stays");

  // A player who freed Vesna never sees fen_bound; one who never met her gets "No One Is Coming".
  const f = await t.player("Freed");
  debug(f, { action: "finish", story: "act4_seals" });
  debug(f, { action: "jump", story: "act5_lantern", chapter: "fen_bound", flags: { "g:vesna": "free", "g:allies": "1", "g:quill": "exposed", "g:hollis": "lost" } });
  await t.wait(5);
  got = await talk(f, "moss");
  t.check(!got.some((o) => o.key === "start:act5_lantern"), `Moss offers a freed-Vesna player nothing: ${JSON.stringify(got)}`);
  got = await talk(f, "reyes");
  start = got.find((o) => o.key === "start:act5_lantern");
  t.check(!!start && start.label.includes("The Long Night"), `a freed-Vesna player goes on to The Long Night: ${start?.label}`);

  const n = await t.player("Nobody");
  debug(n, { action: "finish", story: "act4_seals" });
  debug(n, { action: "jump", story: "act5_lantern", chapter: "fen_bound", flags: { "g:quill": "exposed", "g:hollis": "lost" } });
  await t.wait(5);
  got = await talk(n, "moss");
  t.check(!got.some((o) => o.key === "start:act5_lantern"), "Moss offers a player who never met Vesna nothing");
  got = await talk(n, "reyes");
  start = got.find((o) => o.key === "start:act5_lantern");
  t.check(!!start && start.label.includes("No One Is Coming"), `no allies at all: No One Is Coming: ${start?.label}`);
}
