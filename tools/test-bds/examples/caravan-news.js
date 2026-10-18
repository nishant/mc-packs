// Merchant Caravan, town news: a caravan arriving is Townsfolk gossip about nobody in particular (realm:gossip kind
// "caravan" with no player, the arrival spot as the place), which a townsfolk passes on in a greeting; a second
// caravan within the in-game hour sends none. Leaving goes through the pack's test hook (realm:caravan_test).
//   node tools/test-bds/run.mjs --quiet --only caravan_bp,npc_bp --scenario tools/test-bds/examples/caravan-news.js --timeout 600
export default async function (t) {
  const sys = t.system;
  /** @type {{ id: string, m: any }[]} */
  const events = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:gossip" && id !== "realm:npc_gossip") return;
      try {
        events.push({ id, m: JSON.parse(message) });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id) => events.filter((e) => e.id === id).map((e) => e.m);
  const spawn = t.world.getDefaultSpawnLocation();
  const { top } = await t.loadArea(spawn.x, spawn.z, { radius: 3 });
  const y = (top?.y ?? 70) + 1;
  const p = await t.player("Ann", { op: true, x: spawn.x + 30, y, z: spawn.z + 30 });
  await t.wait(40);
  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "g1", pack: "npc_bp", key: "gossipChance", value: 100 }));
  t.assert(t.cmd(p, "/realm:npc_add tobin").ok, "npc_add tobin");
  await t.wait(10);

  let since = t.tick;
  t.assert(t.cmd(p, "/realm:caravan_call").ok, "caravan_call ran");
  await t.waitMessage(p, /caravan has arrived/, { since, timeout: 100 });
  await t.wait(5);
  const g = of("realm:gossip").filter((m) => m.kind === "caravan");
  t.log("gossip:", JSON.stringify(g));
  t.check(g.length === 1 && g[0].player === undefined && g[0].place === "world spawn", "town gossip about the caravan, at world spawn");

  // Tobin passes it on.
  const form = t.waitForm(p, { timeout: 80 });
  sys.sendScriptEvent("realm:npc_debug", JSON.stringify({ player: p.id, action: "tap", npc: "tobin" }));
  const f = await form;
  t.log("greeting:", JSON.stringify(f.body.slice(0, 200)));
  t.check(/caravan/i.test(f.body) && /world spawn/.test(f.body), "Tobin's greeting is the caravan news");
  f.answer(null);

  since = t.tick;
  await t.console(`scriptevent realm:caravan_test {"action":"depart"}`);
  await t.wait(20);
  t.assert(t.cmd(p, "/realm:caravan_call").ok, "caravan_call ran again");
  await t.waitMessage(p, /caravan has arrived/, { since, timeout: 100 });
  await t.wait(5);
  t.check(of("realm:gossip").filter((m) => m.kind === "caravan").length === 1, "no second caravan gossip within the hour");
  sys.sendScriptEvent("realm:npc_debug", JSON.stringify({ action: "gossip" }));
  await t.waitUntil(() => of("realm:npc_gossip").length > 0, { timeout: 60, message: "npc_gossip answer" });
  t.check(of("realm:npc_gossip").at(-1).kinds.caravan === 1, "Townsfolk remembers one caravan");
}
