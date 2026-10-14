// Story Questlines named items: a name typed at an anvil on a phone keyboard (a curly apostrophe, extra spaces, any
// case) matches the name a story asks for. Elsie's "Sea-Kept Things" (inn_ghost, sea_kept) wants three things named
// for Lily.
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp --scenario tools/test-bds/examples/saga-anvil-name.js --timeout 300
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
  const p = await t.player("Namer", { op: true, gameMode: "survival" });
  await t.wait(20);
  sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.id, action: "jump", story: "inn_ghost", chapter: "sea_kept" }));
  await t.wait(5);
  sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: p.id, npc: "elsie", req: "n1" }));
  await t.wait(4);
  t.assert(offers.some((o) => o.req === "n1" && o.key === "start:inn_ghost"), `Elsie offers the chapter (${JSON.stringify(offers.map((o) => o.key))})`);
  const accept = (async () => {
    for (;;) {
      const f = await t.waitForm(p, { timeout: 200 });
      if (f.buttons.some((b) => /^next$/i.test(b))) f.answer("Next");
      else return f.answer(f.buttons.find((b) => /Accept/.test(b)) ?? 0);
    }
  })();
  sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ pack: "saga_bp", player: p.id, key: "start:inn_ghost" }));
  await accept;
  await t.wait(10);
  const since = t.tick;
  const inv = p.getComponent("minecraft:inventory").container;
  /** @param {string} id @param {string} name */
  const named = (id, name) => {
    const s = new t.mc.ItemStack(id, 1);
    s.nameTag = name;
    return s;
  };
  inv.setItem(1, named("minecraft:nautilus_shell", "Lily’s Shell")); // curly apostrophe
  inv.setItem(2, named("minecraft:amethyst_shard", "lily's  marble ")); // case and spaces
  inv.setItem(3, named("minecraft:paper", "Lily's Paper Star"));
  await t.waitMessage(p, /Lily's Shell: done/, { since, timeout: 100 });
  await t.waitMessage(p, /Lily's Marble: done/, { since, timeout: 100 });
  await t.waitMessage(p, /Lily's Paper Star: done/, { since, timeout: 100 });
}
