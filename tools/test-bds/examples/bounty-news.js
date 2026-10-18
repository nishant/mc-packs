// Bounty Board, town news: a claimed champion bounty is Townsfolk gossip (kind "bounty", the champion's name as the
// place) and the title "Bounty Hunter" (Titles tells the player once). Townsfolk keeps one piece for the kill: the
// bounty gossip replaces Champions' "champion" gossip about the same player and champion. A second claim within the
// in-game hour sends no second piece of gossip. Kills are reported the way Champions does (realm:champion_slain).
//   node tools/test-bds/run.mjs --quiet --flat --only bounty_bp,elite_bp,npc_bp,titles_bp --scenario tools/test-bds/examples/bounty-news.js --timeout 600
export default async function (t) {
  const sys = t.system;
  /** @type {{ id: string, m: any, tick: number }[]} */
  const ev = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!["realm:bounty_targets", "realm:gossip", "realm:title_unlock", "realm:npc_gossip"].includes(id)) return;
      try {
        ev.push({ id, m: JSON.parse(message), tick: sys.currentTick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id, f = () => true, since = 0) => ev.filter((e) => e.id === id && e.tick >= since && f(e.m)).map((e) => e.m);
  t.server("/time set noon");
  t.server("/gamerule doDaylightCycle false");
  const X = 900, Z = 900;
  await t.loadArea(X, Z, { radius: 3 });
  const p = await t.player("Tester", { op: true, x: X, z: Z });
  await t.wait(20);
  const y = Math.floor(p.location.y);
  t.dimension.getBlock({ x: X + 2, y, z: Z })?.setType("minecraft:lectern");
  p.lookAtBlock({ x: X + 2, y, z: Z });
  await t.wait(5);
  let since = t.tick;
  t.assert(t.cmd(p, "/realm:bounty_board").ok, "bounty_board ran");
  await t.waitUntil(() => of("realm:bounty_targets", (m) => m.targets.length === 2, since).length > 0, { timeout: 200, message: "today's 2 champion targets" });
  const [A, B] = of("realm:bounty_targets", (m) => m.targets.length === 2, since).at(-1).targets;

  // Champions' own gossip about the kill, then the kill report.
  since = t.tick;
  sys.sendScriptEvent("realm:gossip", JSON.stringify({ kind: "champion", player: p.id, place: A.name }));
  await t.wait(2);
  sys.sendScriptEvent("realm:champion_slain", JSON.stringify({ tag: `realm:bounty:${A.id}`, player: p.id, helpers: [], dim: "minecraft:overworld", x: A.x, y: 70, z: A.z }));
  await t.waitMessage(p, /claimed the bounty/, { since, timeout: 60 });
  await t.waitMessage(p, /New title unlocked: Bounty Hunter/, { since, timeout: 60 });
  const g = of("realm:gossip", (m) => m.kind === "bounty");
  t.log("bounty gossip:", JSON.stringify(g));
  t.check(g.length === 1 && g[0].player === p.id && g[0].place === A.name.replace(/§./g, ""), "gossip about the claim, with the champion's name");

  since = t.tick;
  sys.sendScriptEvent("realm:champion_slain", JSON.stringify({ tag: `realm:bounty:${B.id}`, player: p.id, helpers: [], dim: "minecraft:overworld", x: B.x, y: 70, z: B.z }));
  await t.waitMessage(p, /claimed the bounty/, { since, timeout: 60 });
  await t.wait(10);
  t.check(of("realm:gossip", (m) => m.kind === "bounty").length === 1, "no second bounty gossip within the hour");
  t.check(of("realm:title_unlock", (m) => m.title === "Bounty Hunter").length === 2, "the title is sent with each claim");
  t.check(t.messages(p, { pack: "titles_bp" }).filter((m) => /New title unlocked: Bounty Hunter/.test(m.plain)).length === 1, "the player is told about the title once");

  sys.sendScriptEvent("realm:npc_debug", JSON.stringify({ action: "gossip" }));
  await t.waitUntil(() => of("realm:npc_gossip").length > 0, { timeout: 60, message: "npc_gossip answer" });
  const store = of("realm:npc_gossip").at(-1);
  t.log("townsfolk gossip:", JSON.stringify(store));
  t.check(store.kinds.bounty === 1 && !store.kinds.champion, "Townsfolk keeps one piece for the kill (the bounty)");
}
