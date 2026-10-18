// Townsfolk gossip intake (Hearth & Hearsay) stays bounded on a busy server: at most 4 pieces of one kind (the oldest
// of that kind go first, so one busy pack can't push out every other piece), gossipMax (24) in all; town news with
// no player is kept; news about the same player and place within 30 minutes is one piece (a champion and the
// bounty on it), and the same kind about the same player too.
//   node tools/test-bds/run.mjs --quiet --only npc_bp --scenario tools/test-bds/examples/npc-news.js --timeout 300
export default async function (t) {
  const sys = t.system;
  /** @type {any[]} */
  const dumps = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id === "realm:npc_gossip") dumps.push(JSON.parse(message));
    },
    { namespaces: ["realm"] },
  );
  const dump = async () => {
    const n = dumps.length;
    sys.sendScriptEvent("realm:npc_debug", JSON.stringify({ action: "gossip" }));
    await t.waitUntil(() => dumps.length > n, { timeout: 60, message: "npc_gossip answer" });
    return dumps.at(-1);
  };
  const say = (m) => sys.sendScriptEvent("realm:gossip", JSON.stringify(m));
  await t.player("Ann", { op: true });
  await t.wait(40);

  // Ten champions by ten different (offline) players: four kept, the newest.
  for (let i = 0; i < 10; i++) say({ kind: "champion", player: `-100${i}`, name: `Hunter${i}`, place: `Beast${i}` });
  await t.wait(5);
  let d = await dump();
  t.log(JSON.stringify(d));
  t.check(d.kinds.champion === 4, `four champion pieces kept (${d.kinds.champion})`);
  t.check(d.last.at(-1)[1] === "Hunter9" && !d.last.some((x) => x[1] === "Hunter5"), "the newest kept, the oldest dropped");

  // Town news without a player.
  say({ kind: "caravan", place: "Market Square" });
  await t.wait(5);
  d = await dump();
  t.check(d.kinds.caravan === 1 && d.last.at(-1)[2] === "Market Square", "town news without a player is kept");

  // The bounty on Hunter9's champion replaces the champion piece about the same player and place.
  say({ kind: "bounty", player: "-1009", name: "Hunter9", place: "Beast9" });
  await t.wait(5);
  d = await dump();
  t.check(d.kinds.bounty === 1 && d.kinds.champion === 3, `champion and bounty on the same beast are one piece (${JSON.stringify(d.kinds)})`);
  // The same kind about the same player replaces the older piece.
  say({ kind: "bounty", player: "-1009", name: "Hunter9", place: "Beast99" });
  await t.wait(5);
  d = await dump();
  t.check(d.kinds.bounty === 1, "a second bounty by the same player within 30 minutes replaces the first");

  // Twelve kinds x 4 pieces: gossipMax (24) in all.
  for (let k = 0; k < 12; k++) for (let i = 0; i < 4; i++) say({ kind: `test_${k}`, player: `-20${k}${i}`, name: `P${k}${i}` });
  await t.wait(10);
  d = await dump();
  t.check(d.count === 24, `at most gossipMax pieces (${d.count})`);
}
