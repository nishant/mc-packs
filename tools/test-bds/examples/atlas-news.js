// Atlas of the Realm, town news: a cleared Choir Cairn is Townsfolk gossip (realm:gossip kind "atlas_site"), at most
// one piece per in-game hour from the pack: a second cairn cleared right after sends none, and Townsfolk keeps one.
//   node tools/test-bds/run.mjs --quiet --flat --only atlas_bp,npc_bp --scenario tools/test-bds/examples/atlas-news.js --timeout 600
export default async function (t) {
  const sys = t.system;
  /** @type {{ id: string, m: any, tick: number }[]} */
  const ev = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!["realm:atlas_state", "realm:quest_done", "realm:gossip", "realm:npc_gossip"].includes(id)) return;
      try {
        ev.push({ id, m: JSON.parse(message), tick: sys.currentTick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id, f = () => true, since = 0) => ev.filter((e) => e.id === id && e.tick >= since && f(e.m)).map((e) => e.m);
  const dbg = (m) => sys.sendScriptEvent("realm:atlas_debug", JSON.stringify(m));
  const state = async (p, action = "state") => {
    const since = sys.currentTick;
    dbg({ player: p.id, action });
    await t.waitUntil(() => of("realm:atlas_state", (m) => m.player === p.id, since).length > 0, { timeout: 40, message: `atlas_state ${action}` });
    return of("realm:atlas_state", (m) => m.player === p.id, since).at(-1);
  };
  const buildAt = async (p, slot) => {
    await t.loadArea(slot.x, slot.z, { radius: 3 });
    p.teleport({ x: slot.x + 30.5, y: -60, z: slot.z + 0.5 });
    for (let i = 0; i < 40; i++) {
      const st = await state(p);
      if (st.near.find((r) => r.key === slot.key && r.s === 1)) break;
      await t.wait(20);
    }
    const st = await state(p);
    const r = st.near.find((r) => r.key === slot.key && r.s === 1);
    t.assert(r, `site ${slot.key} built`);
    return r;
  };
  const clear = async (p, slot) => {
    const cairn = await buildAt(p, slot);
    p.teleport({ x: cairn.x + 0.5, y: cairn.y + 1, z: cairn.z + 6.5 });
    await t.wait(20);
    const since = t.tick;
    dbg({ player: p.id, action: "break", key: slot.key });
    await t.waitMessage(p, /Beat its three keepers/, { timeout: 60, since });
    dbg({ player: p.id, action: "kill", key: slot.key });
    await t.waitUntil(() => of("realm:quest_done", (m) => m.id === `atlas:cairn:${slot.key}`).length === 1, { timeout: 200, message: `cairn ${slot.key} cleared` });
    await t.wait(5);
  };

  await t.loadArea(2000, 2000, { radius: 2 });
  const p = await t.player("Tester", { op: true, x: 2000, z: 2000 });
  await t.seconds(15); // the pack waits for zones, claims and places after load
  const info = await state(p, "slots");
  t.assert(info.slots.length >= 2, "2-4 slots per region");
  const [a, b] = info.slots;
  dbg({ action: "prefer", key: a.key, kind: "cairn" });
  dbg({ action: "prefer", key: b.key, kind: "cairn" });

  await clear(p, a);
  const g = of("realm:gossip", (m) => m.kind === "atlas_site");
  t.log("gossip:", JSON.stringify(g));
  t.check(g.length === 1 && g[0].player === p.id, "gossip about the cleared cairn");
  await clear(p, b);
  t.check(of("realm:gossip", (m) => m.kind === "atlas_site").length === 1, "no second site gossip within the hour");

  sys.sendScriptEvent("realm:npc_debug", JSON.stringify({ action: "gossip" }));
  await t.waitUntil(() => of("realm:npc_gossip").length > 0, { timeout: 60, message: "npc_gossip answer" });
  t.check(of("realm:npc_gossip").at(-1).kinds.atlas_site === 1, "Townsfolk remembers one cleared cairn");
}
