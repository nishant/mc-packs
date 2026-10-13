// Mob Health when one hit hurts many mobs at once (a sweep into a mob farm). Run with
//   node tools/test-bds/run.mjs --quiet --only mobhp_bp --scenario tools/test-bds/examples/mobhp-sweep.js --timeout 600
// Checks: 20 cows hurt by one player in the same tick draw the box once (one realm:side, one title), with the
// health of the last cow hit; above the hotbar, one line and one realm:actionbar.
export default async function (t) {
  const sys = t.mc.system;
  const sides = [];
  const bars = [];
  const acks = [];
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    try {
      const m = JSON.parse(message);
      if (id === "realm:side") sides.push({ tick: sys.currentTick, m });
      else if (id === "realm:actionbar") bars.push({ tick: sys.currentTick, m });
      else if (id === "realm:cfg_ack") acks.push(m);
    } catch {}
  }, { namespaces: ["realm"] });
  const p = await t.player("Hitter");
  const cows = [];
  for (let i = 0; i < 20; i++) cows.push(p.dimension.spawnEntity("minecraft:cow", { x: p.location.x + (i % 5) - 2, y: p.location.y, z: p.location.z + 3 + Math.floor(i / 5) }));
  await t.wait(10);

  async function sweep(label) {
    const since = t.tick;
    let hits = 0;
    cows.forEach((c, i) => {
      if (c.applyDamage(i === cows.length - 1 ? 3 : 1, { cause: t.mc.EntityDamageCause.entityAttack, damagingEntity: p })) hits++;
    });
    await t.wait(5);
    t.log(`${label}: ${hits} cows hurt in one tick`);
    return since;
  }

  let since = await sweep("box");
  const titles = t.messages(p, { kind: "title", pack: "mobhp_bp", since });
  const mine = sides.filter((s) => s.tick >= since && s.m.from === "mobhp");
  t.log(`titles ${titles.length}, realm:side ${mine.length}, last ${JSON.stringify(mine.at(-1)?.m.text)}`);
  t.check(titles.length === 1 && mine.length === 1, "the box is drawn once for the whole sweep");
  t.check(/Cow\s+§f7\/10/.test(mine.at(-1)?.m.text ?? ""), "it shows the last cow hit");

  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "h1", pack: "mobhp_bp", key: "where", value: "hotbar", player: p.id }));
  await t.waitUntil(() => acks.find((x) => x.id === "h1"), { timeout: 40, message: "ack where" });
  await t.wait(12); // past the cows' hurt cooldown
  since = await sweep("hotbar");
  const lines = t.messages(p, { kind: "actionbar", pack: "mobhp_bp", since });
  const reqs = bars.filter((b) => b.tick >= since && b.m.from === "mobhp_bp");
  t.log(`action bar lines ${lines.length}, requests ${reqs.length}, last ${JSON.stringify(lines.at(-1)?.plain)}`);
  t.check(lines.length === 1 && reqs.length === 1, "one line and one realm:actionbar for the whole sweep");
}
