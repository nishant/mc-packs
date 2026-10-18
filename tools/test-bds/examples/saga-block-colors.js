// Story Questlines: "place" steps that name a kind of block count every color of it. Lamp in the Window's first step,
// "Put 12 glass blocks or panes back into the old chapel", counted only 8 stained glass colors and 6 pane colors, so
// gray glass a player placed did nothing (no message). Every stained glass block and pane counts now.
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp --scenario tools/test-bds/examples/saga-block-colors.js --timeout 300
export default async function (t) {
  const sys = t.system;
  const { ItemStack, Direction } = t.mc;
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
  const debug = (p, msg) => sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.name, ...msg }));
  const p = await t.player("Glazier", { op: true, gameMode: "survival" });
  await t.wait(140);
  t.assert(t.cmd(p, "/realm:saga_place old_chapel").ok, "the Old Chapel is where the player stands");
  await t.waitMessage(p, /Place "old_chapel"/, { since: t.tick - 5 });
  debug(p, { action: "finish", story: "act2_choir", flags: { "g:hollis": "saved" } });
  await t.wait(5);

  sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: p.id, npc: "hollis", req: "g1" }));
  await t.wait(4);
  t.assert(offers.some((o) => o.req === "g1" && o.key === "start:hollis_faith"), `Hollis offers Lamp in the Window (${JSON.stringify(offers.map((o) => o.key))})`);
  const accepted = (async () => {
    for (;;) {
      const f = await t.waitForm(p, { timeout: 200 });
      if (f.buttons.some((b) => /^next$/i.test(b))) f.answer("Next");
      else return f.answer("Accept");
    }
  })();
  sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ pack: "saga_bp", player: p.id, key: "start:hollis_faith" }));
  await accepted;
  await t.wait(20);

  // Gray glass blocks and lime panes on the ground around the player, until 12 are down.
  const at = { x: Math.floor(p.location.x), y: Math.floor(p.location.y) - 1, z: Math.floor(p.location.z) };
  const since = t.tick;
  let placed = 0;
  for (let dx = -3; dx <= 3 && placed < 12; dx++)
    for (let dz = -3; dz <= 3 && placed < 12; dz++) {
      if (Math.abs(dx) < 2 && Math.abs(dz) < 2) continue;
      const id = placed % 2 ? "minecraft:lime_stained_glass_pane" : "minecraft:gray_stained_glass";
      p.getComponent("minecraft:inventory").container.setItem(p.selectedSlotIndex, new ItemStack(id, 1));
      await t.wait(2);
      if (p.useItemInSlotOnBlock(p.selectedSlotIndex, { x: at.x + dx, y: at.y, z: at.z + dz }, Direction.Up)) placed++;
      await t.wait(3);
    }
  t.log(`placed ${placed}`);
  t.assert(placed === 12, "the player placed 12 blocks");
  const got = await t.waitMessage(p, /glass blocks or panes back into the old chapel: done/i, { since, timeout: 100 }).catch(() => undefined);
  t.check(!!got, `12 gray glass blocks and lime panes finish the step (${t.messages(p, { since }).map((m) => m.plain).filter(Boolean).join(" | ")})`);
}
