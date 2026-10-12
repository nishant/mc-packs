// Platypus: variants (summon events and the Perry message), a bite with Poison and Nausea after a
// hit, calming down after 15 seconds (a second hit restarts them), Creative players left alone and
// /realm:platypus. Run with --strict so content log errors in the JSON fail it. About 1.5 minutes:
//   node tools/test-bds/run.mjs --quiet --strict --only platypus_bp,platypus_rp --scenario tools/test-bds/examples/platypus.js
export default async function (t) {
  t.server("/time set noon");
  const p = await t.player("Tester", { op: true });
  const at = p.location;
  const fx = Math.floor(at.x), fy = Math.floor(at.y), fz = Math.floor(at.z);
  const plats = () => t.dimension.getEntities({ type: "realm:platypus" });
  const variant = (e) => e.getComponent("minecraft:variant")?.value;

  // 1. Summons: Perry and brown, and the Perry message.
  let since = t.tick;
  t.server(`/summon realm:platypus ${fx + 3} ${fy} ${fz} 0 0 realm:platypus_make_perry`);
  t.server(`/summon realm:platypus ${fx - 3} ${fy} ${fz} 0 0 realm:platypus_make_brown`);
  await t.wait(10);
  const all = plats();
  t.check(all.length === 2, `two platypuses (${all.length})`);
  const perry = all.find((e) => variant(e) === 1);
  const brown = all.find((e) => variant(e) === 0);
  t.check(perry && brown, `one Perry and one brown (${all.map(variant).join(",")})`);
  await t.waitMessage(p, /teal platypus in a brown fedora/, { since });
  const perryLines = t.messages(p, { since }).filter((m) => /fedora/.test(m.plain)).length;
  t.check(perryLines === 1, `one Perry message (${perryLines})`);

  // 2. Plain summons and eggs roll a variant (1 in 200 Perry): 60 of them, all variant 0 or 1.
  for (let i = 0; i < 60; i++) t.server(`/summon realm:platypus ${fx + 20} ${fy + 2} ${fz + 20}`);
  await t.wait(10);
  const rolled = plats().filter((e) => Math.abs(e.location.x - (fx + 20)) < 8);
  t.check(rolled.length === 60 && rolled.every((e) => variant(e) === 0 || variant(e) === 1), `60 rolled variants (${rolled.map(variant).join("")})`);
  for (const e of rolled) e.remove();

  // 3. /realm:platypus.
  since = t.tick;
  t.cmd(p, "/realm:platypus");
  const found = await t.waitMessage(p, /within 64 blocks/, { since });
  t.log(`find: ${t.messages(p, { since }).map((m) => m.plain).join(" / ")}`);
  t.check(/^2 platypuses within 64 blocks\. Nearest: \d+ blocks \w+/.test(found.plain), "the count and the nearest");

  // 4. A glass pen with the brown one and the player: hit it, it bites back, then calms down.
  perry.remove();
  const px = fx + 30, pz = fz;
  const { top } = await t.loadArea(px, pz);
  const gy = top.location.y + 1;
  t.server(`/fill ${px - 2} ${gy} ${pz - 2} ${px + 2} ${gy + 2} ${pz + 2} glass`);
  t.server(`/fill ${px - 1} ${gy} ${pz - 1} ${px + 1} ${gy + 2} ${pz + 1} air`);
  p.teleport({ x: px - 0.5, y: gy, z: pz + 0.5 }, { dimension: t.dimension });
  brown.teleport({ x: px + 1.5, y: gy, z: pz + 0.5 }, { dimension: t.dimension });
  t.server("/effect Tester health_boost 600 9 true");
  t.server("/effect Tester instant_health 1 9 true");
  await t.wait(10);
  /** @type {{ tick: number }[]} */
  const bites = [];
  t.world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource }) => {
    if (hurtEntity.id === p.id && damageSource.damagingEntity?.typeId === "realm:platypus") bites.push({ tick: t.tick });
  });
  t.check(!bites.length, "no bites before it's hit");
  await t.seconds(3);
  t.check(!bites.length, "passive: still no bites");
  p.lookAtEntity(brown);
  p.attackEntity(brown);
  const hitAt = t.tick;
  await t.waitUntil(() => bites.length > 0, { timeout: 200, message: "it bites back" });
  t.check(!!p.getEffect("nausea"), "the bite gives Nausea");
  t.check(!!p.getEffect("poison"), "the bite gives Poison");
  t.log(`first bite ${bites[0].tick - hitAt} ticks after the hit`);
  // Calm after 15 s: no bites from 18 s on (it may still be on its last attack at 15 s).
  await t.waitUntil(() => t.tick - hitAt > 20 * 18, { timeout: 500, interval: 20 });
  const n = bites.length;
  t.server("/effect Tester instant_health 1 9 true");
  await t.seconds(8);
  t.check(bites.length === n, `calm after 15 seconds (${bites.length - n} bites later)`);
  t.log(`${n} bites in the first 18 s`);

  // 5. A second hit 10 s into the anger restarts the 15 seconds (still biting at 20 s).
  const hits = [];
  t.world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource }) => {
    if (hurtEntity.id === brown.id && damageSource.damagingEntity?.id === p.id) hits.push(t.tick);
  });
  p.lookAtEntity(brown);
  p.attackEntity(brown);
  const hit2 = t.tick;
  await t.seconds(10);
  for (let i = 0; i < 10 && hits.length < 2; i++) {
    p.lookAtEntity(brown);
    p.attackEntity(brown);
    await t.wait(4);
  }
  t.check(hits.length >= 2, `both hits landed (${hits.map((h) => h - hit2).join(",")})`);
  await t.waitUntil(() => t.tick - hit2 > 20 * 21, { timeout: 600, interval: 20 });
  const late = bites.filter((b) => b.tick - hit2 > 20 * 16 && b.tick - hit2 <= 20 * 21).length;
  t.log(`bites 16-21 s after the first of two hits: ${late}`);
  t.check(late > 0, "a second hit restarts the anger");
  await t.seconds(20);

  // 6. Creative players are left alone.
  t.server("/gamemode creative Tester");
  await t.wait(5);
  const c0 = bites.length;
  p.lookAtEntity(brown);
  p.attackEntity(brown);
  await t.seconds(6);
  t.check(bites.length === c0, `no bites on a Creative player (${bites.length - c0})`);
  t.server("/gamemode survival Tester");
  await t.seconds(16);

  // Leads and name tags can't be tested here: a simulated player's interactWithEntity doesn't leash
  // even a cow. Check them in game.
}
