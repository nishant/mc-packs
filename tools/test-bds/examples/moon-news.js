// Blood Moon & Harvest Moon, town news: a Blood Moon survived to a natural dawn is one piece of Townsfolk gossip
// (realm:gossip kind "blood_moon" about one survivor, n = how many survived), not one per survivor.
//   node tools/test-bds/run.mjs --quiet --only moon_bp,npc_bp --prop difficulty=peaceful --scenario tools/test-bds/examples/moon-news.js --timeout 600
export default async function (t) {
  /** @type {{ id: string, m: any }[]} */
  const events = [];
  const acks = new Set();
  t.system.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id === "realm:cfg_ack") acks.add(JSON.parse(message).id);
      if (id !== "realm:gossip" && id !== "realm:npc_gossip") return;
      try {
        events.push({ id, m: JSON.parse(message) });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id) => events.filter((e) => e.id === id).map((e) => e.m);
  const ann = await t.player("Ann", { op: true });
  for (const key of ["bloodChance", "harvestChance"]) {
    t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: key, pack: "moon_bp", key, value: 0 }));
    await t.waitUntil(() => acks.has(key), { timeout: 40, message: `cfg ${key}` });
  }
  t.server("/time set 13000");
  await t.seconds(2);
  const players = [ann, await t.player("Bob"), await t.player("Cid")];
  let since = t.tick;
  t.assert(t.cmd(ann, "/realm:moon_set blood").ok, "moon_set blood ran");
  await t.waitMessage(ann, /Blood Moon rises/, { since, timeout: 100 });
  await t.seconds(2);
  // Just before dawn (23000): the night runs out on its own.
  t.server("/time set 22900");
  since = t.tick;
  await t.waitMessage(ann, /You survived the Blood Moon/, { since, timeout: 300 });
  await t.wait(10);
  const g = of("realm:gossip").filter((m) => m.kind === "blood_moon");
  t.log("gossip:", JSON.stringify(g));
  t.check(g.length === 1, `one piece of gossip for three survivors (${g.length})`);
  t.check(g[0]?.n === 3 && players.some((p) => p.id === g[0]?.player), "about one survivor, n = 3");

  t.system.sendScriptEvent("realm:npc_debug", JSON.stringify({ action: "gossip" }));
  await t.waitUntil(() => of("realm:npc_gossip").length > 0, { timeout: 60, message: "npc_gossip answer" });
  t.check(of("realm:npc_gossip").at(-1).kinds.blood_moon === 1, "Townsfolk remembers one");
}
