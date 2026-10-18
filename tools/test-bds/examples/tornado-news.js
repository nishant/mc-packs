// Tornadoes, town news: the first player shot out the top of a tornado is Townsfolk gossip (realm:gossip kind
// "tornado"); a second rider of the same tornado sends none (one piece per tornado, and per in-game hour).
// node tools/test-bds/run.mjs --quiet --only tornado_bp,npc_bp --scenario tools/test-bds/examples/tornado-news.js --timeout 300
export default async function (t) {
  /** @type {{ id: string, m: any }[]} */
  const events = [];
  t.system.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:gossip" && id !== "realm:npc_gossip") return;
      try {
        events.push({ id, m: JSON.parse(message) });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id) => events.filter((e) => e.id === id).map((e) => e.m);
  const p = await t.player("Chaser", { op: true });
  const here = p.location;
  const tx = here.x, tz = here.z - 40;
  const { top } = await t.loadArea(tx, tz, { radius: 3 });
  p.lookAtLocation({ x: tx, y: top.location.y + 1, z: tz });
  await t.wait(5);
  t.assert(t.cmd(p, "/realm:tornado_spawn").ok, "/realm:tornado_spawn ran");
  await t.waitMessage(p, /Tornado! \d+m to the/, { timeout: 100 });

  // Two players beside the funnel at once: both are spun up and shot out the top.
  const rider = await t.player("Rider", { x: tx + 3, z: tz, settle: 1 });
  const second = await t.player("Second", { x: tx - 3, z: tz, settle: 1 });
  await t.waitUntil(() => [rider, second].every((r) => r.isValid && !!r.getEffect("slow_falling")), { timeout: 300, message: "both are launched" });
  await t.wait(5);
  const g = of("realm:gossip").filter((m) => m.kind === "tornado");
  t.log("gossip:", JSON.stringify(g));
  t.check(g.length === 1 && [rider.id, second.id].includes(g[0].player), "one piece of gossip, about the first rider");

  t.system.sendScriptEvent("realm:npc_debug", JSON.stringify({ action: "gossip" }));
  await t.waitUntil(() => of("realm:npc_gossip").length > 0, { timeout: 60, message: "npc_gossip answer" });
  t.check(of("realm:npc_gossip").at(-1).kinds.tornado === 1, "Townsfolk remembers it");
}
