// Dolphin Friends: a rider gets Water Breathing while on a tamed dolphin (topped up) and loses it about 3 s after
// getting off; a potion's longer one is left alone. Then the water drag that steering pushes against: a simulated
// rider can't use the move stick, so this repeats the pack's steer() push (WATER_KEEP 0.8) on the dolphin and checks
// it reaches the default top speed of 7 blocks per second (the old push topped out near 6 whatever maxSpeed said).
// About 1 minute:
//   node tools/test-bds/run.mjs --quiet --timeout 600 --only dolphin_bp --scenario tools/test-bds/examples/dolphin-breath.js
export default async function (t) {
  t.server("/gamerule domobspawning false");
  const p = await t.player("Tester", { op: true });
  const at = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
  await t.loadArea(at.x + 40, at.z, { radius: 4 });
  t.server(`/fill ${at.x - 4} ${at.y - 6} ${at.z - 4} ${at.x + 60} ${at.y - 1} ${at.z + 4} water`);
  await t.wait(10);
  const d = t.dimension.spawnEntity("minecraft:dolphin", { x: at.x + 1.5, y: at.y - 3, z: at.z + 0.5 });
  p.teleport({ x: at.x + 0.5, y: at.y - 3, z: at.z + 0.5 });
  const inv = p.getComponent("inventory").container;
  inv.setItem(p.selectedSlotIndex, new t.mc.ItemStack("minecraft:cod", 64));
  let tamed = false;
  for (let i = 0; i < 40 && !tamed; i++) {
    const since = t.tick;
    t.cmd(p, "/scriptevent realm:dolphin_feed");
    await t.wait(2);
    tamed = t.messages(p, { since }).some((m) => /trusts you/.test(m.plain));
  }
  t.assert(tamed, "the dolphin was tamed");
  inv.setItem(p.selectedSlotIndex, undefined);
  const wb = () => p.getEffect("water_breathing")?.duration ?? 0;

  // 1. Riding: Water Breathing, kept up for as long as you ride.
  t.check(wb() === 0, "no Water Breathing before riding");
  t.assert(d.getComponent("minecraft:rideable").addRider(p), "the player is on the dolphin");
  await t.waitUntil(() => wb() > 0, { timeout: 30, message: "Water Breathing while riding" });
  await t.seconds(5);
  t.check(wb() > 0, `still breathing after 5 s of riding (${wb()} ticks left)`);
  // 2. Off: it runs out within about 3 s.
  d.getComponent("minecraft:rideable").ejectRider(p);
  await t.wait(5);
  t.check(wb() > 0 && wb() <= 60, `a short one left after getting off (${wb()} ticks)`);
  await t.seconds(4);
  t.check(wb() === 0, `gone 4 s later (${wb()} ticks)`);
  // 3. A potion's 3 minutes stay 3 minutes.
  p.addEffect("water_breathing", 3600, { amplifier: 0 });
  t.assert(d.getComponent("minecraft:rideable").addRider(p), "back on");
  await t.seconds(2);
  t.check(wb() > 3500, `the potion's Water Breathing is kept (${wb()} ticks)`);
  d.getComponent("minecraft:rideable").ejectRider(p);
  p.removeEffect("water_breathing");
  p.teleport({ x: at.x, y: at.y + 2, z: at.z });
  await t.wait(5);

  // 4. The drag steering pushes against: steer()'s push, forward along +x, with the defaults (7 b/s, 1.2 b/s per tick).
  d.teleport({ x: at.x + 1.5, y: at.y - 3, z: at.z + 0.5 });
  d.clearVelocity();
  await t.wait(10);
  const max = 7 / 20, accel = 1.2 / 20, KEEP = 0.8;
  const speeds = [];
  for (let i = 0; i < 60; i++) {
    const v = d.getVelocity();
    const dv = { x: max - v.x, y: -v.y, z: -v.z };
    const len = Math.hypot(dv.x, dv.y, dv.z);
    const k = Math.min(1, accel / len);
    const goal = { x: v.x + dv.x * k, y: v.y + dv.y * k, z: v.z + dv.z * k };
    d.applyImpulse({ x: goal.x / KEEP - v.x, y: goal.y / KEEP - v.y, z: goal.z / KEEP - v.z });
    await t.wait(1);
    const w = d.getVelocity();
    speeds.push(Math.hypot(w.x, w.z) * 20);
  }
  const top = speeds.slice(-20).reduce((a, b) => a + b, 0) / 20;
  t.log(`speed after 1, 5, 10 ticks: ${[0, 4, 9].map((i) => speeds[i].toFixed(1)).join(", ")} b/s; held ${top.toFixed(2)} b/s`);
  t.check(top > 6.3 && top < 7.7, `holds about 7 blocks per second (${top.toFixed(2)})`);
}
