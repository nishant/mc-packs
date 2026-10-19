// W10 O53: a playerless champion is kept, and Bea's greeting is the nameless news line, never an empty {name}.
// A playerless caravan still names its place. Not run by the author.
//   node tools/test-bds/run.mjs --quiet --only npc_bp --scenario tools/test-bds/examples/w10-npc-nameless.js --timeout 300
export default async function (t) {
  const sys = t.system;
  /** @type {Set<string>} */
  const acks = new Set();
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id === "realm:cfg_ack") acks.add(JSON.parse(message).id);
    },
    { namespaces: ["realm"] },
  );
  const spawn = t.world.getDefaultSpawnLocation();
  const { top } = await t.loadArea(spawn.x, spawn.z, { radius: 3 });
  const y = (top?.y ?? 70) + 1;
  const p = await t.player("Ann", { op: true, x: spawn.x + 30, y, z: spawn.z + 30 });
  await t.wait(40);
  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "g1", pack: "npc_bp", key: "gossipChance", value: 100 }));
  await t.waitUntil(() => acks.has("g1"), { timeout: 40, message: "cfg gossipChance" });
  t.assert(t.cmd(p, "/realm:npc_add bea").ok, "npc_add bea");
  t.assert(t.cmd(p, "/realm:npc_add tobin").ok, "npc_add tobin");
  await t.wait(10);

  sys.sendScriptEvent("realm:gossip", JSON.stringify({ kind: "champion", place: "The Beast" }));
  await t.wait(5);
  const champ = t.waitForm(p, { timeout: 80 });
  sys.sendScriptEvent("realm:npc_debug", JSON.stringify({ player: p.id, action: "tap", npc: "bea" }));
  const f = await champ;
  t.log("bea:", JSON.stringify(f.body.slice(0, 240)));
  t.check(f.body.includes("Something's going on in town. Everyone's talking about it."), "nameless news line");
  t.check(!f.body.includes("{name}") && !f.body.includes(" cut down"), "no empty name");
  f.answer(null);

  sys.sendScriptEvent("realm:gossip", JSON.stringify({ kind: "caravan", place: "the docks" }));
  await t.wait(5);
  const caravan = t.waitForm(p, { timeout: 80 });
  sys.sendScriptEvent("realm:npc_debug", JSON.stringify({ player: p.id, action: "tap", npc: "tobin" }));
  const g = await caravan;
  t.log("tobin:", JSON.stringify(g.body.slice(0, 240)));
  t.check(/the docks/.test(g.body) && !g.body.includes("{name}"), "caravan still names the place");
  t.check(!g.body.includes("Something's going on"), "caravan is not replaced by the nameless line");
  g.answer(null);
}
