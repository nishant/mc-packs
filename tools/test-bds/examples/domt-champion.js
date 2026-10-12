// Deck of Many Things: The Champion makes a champion the player can see (with or without the
// Champions pack), if it vanishes right away the deck sends its own, and a quick kill isn't replaced. Run with --only domt_bp,elite_bp
// and with --only domt_bp.
export default async function (t) {
  const p = await t.player("Tester", { op: true });
  t.server("/time set noon");
  const champs = () => t.dimension.getEntities({ location: p.location, maxDistance: 24 }).filter((e) => (e.nameTag ?? "").includes("Deck's Champion"));
  const draw = async () => {
    const f1 = t.waitForm(p);
    t.cmd(p, "/realm:domt");
    (await f1).answer("Draw for a player");
    (await t.waitForm(p)).answer({ Card: "The Champion" });
  };
  // 1. A draw makes a champion the player can find.
  const since = t.tick;
  await draw();
  const c = await t.waitUntil(() => champs()[0], { timeout: 200, message: "a champion appeared" });
  const msg = await t.waitMessage(p, /blocks to the/, { since });
  t.log(`champion: ${c.typeId} at dy=${(c.location.y - p.location.y).toFixed(1)} dist=${Math.hypot(c.location.x - p.location.x, c.location.z - p.location.z).toFixed(1)} tags=${c.getTags().join("|")}; ${msg.plain}`);
  t.check(Math.abs(c.location.y - p.location.y) <= 3.5, "champion near the player's height");
  await t.seconds(4);
  t.check(c.isValid, "champion still there after 4 s");
  // 2. Something removes it right away: the deck sends its own.
  for (const e of champs()) e.remove();
  await t.seconds(2);
  const since2 = t.tick;
  await draw();
  await t.waitMessage(p, /blocks to the/, { since: since2 });
  const c2 = await t.waitUntil(() => champs()[0], { timeout: 200, message: "second champion appeared" });
  t.log(`removing ${c2.typeId}`);
  c2.remove();
  const back = await t.waitUntil(() => champs().find((e) => e.typeId === "minecraft:vindicator"), { timeout: 200, message: "the deck sent its own after removal" });
  t.log(`replacement: ${back.typeId} ${back.nameTag}`);
  await t.waitMessage(p, /slipped away/, { since: since2 });
  // 3. A champion killed at once is not replaced (no second champion for a quick kill).
  for (const e of champs()) e.remove();
  await t.seconds(2);
  const since3 = t.tick;
  await draw();
  await t.waitMessage(p, /blocks to the/, { since: since3 });
  const c3 = await t.waitUntil(() => champs()[0], { timeout: 200, message: "third champion appeared" });
  c3.kill();
  await t.seconds(5);
  t.check(!champs().length, "a killed champion is not replaced");
  t.check(!t.messages(p, { since: since3 }).some((m) => /slipped away/.test(m.plain)), "no 'slipped away' after a kill");
}
