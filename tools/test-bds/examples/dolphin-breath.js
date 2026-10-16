// Dolphin Friends: a rider gets Water Breathing while on a tamed dolphin (topped up) and loses it about 3 s after
// getting off; a potion's longer one is left alone. Then a ridden dolphin with no input holds still: its own swimming
// stops (the realm:dolphin_ridden group sets its movement to 0) and comes back once the rider is off.
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

  // 4. Ridden without input: no swimming of its own (a simulated rider can't use the move stick).
  const uw = () => d.getComponent("minecraft:underwater_movement")?.currentValue;
  d.teleport({ x: at.x + 30.5, y: at.y - 3, z: at.z + 0.5 });
  p.teleport({ x: at.x + 30.5, y: at.y - 3, z: at.z + 1.5 });
  await t.wait(10);
  t.assert(d.getComponent("minecraft:rideable").addRider(p), "on again, in open water");
  await t.waitUntil(() => uw() === 0, { timeout: 40, message: "the ridden dolphin's own swimming is off" });
  const start = { ...d.location };
  await t.seconds(8);
  const moved = Math.hypot(d.location.x - start.x, d.location.z - start.z);
  t.log(`moved ${moved.toFixed(2)} blocks in 8 s with no input`);
  t.check(moved < 1.5, `stays put with no input (${moved.toFixed(2)} blocks)`);
  const br = () => d.getComponent("minecraft:breathable");
  t.check(br()?.breathesWater === true && br()?.breathesAir === true, "a ridden dolphin breathes water too (it can't swim up for air)");
  d.getComponent("minecraft:rideable").ejectRider(p);
  await t.wait(30);
  t.log(`after getting off: underwater movement ${uw()}, movement ${d.getComponent("minecraft:movement")?.currentValue}`);
  t.check(Math.abs((uw() ?? 0) - 0.15) < 0.001, "swims on its own again after the rider is off (its usual 0.15)");
  t.check(br()?.breathesWater === false && br()?.breathesAir === true, "off: it breathes air only again, like a vanilla dolphin");
  // Disabling the pack while someone rides: the dolphin swims on its own again.
  t.assert(d.getComponent("minecraft:rideable").addRider(p), "on once more");
  await t.waitUntil(() => uw() === 0, { timeout: 40, message: "ridden again" });
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `t_off_${t.tick}`, pack: "dolphin_bp", key: "enabled", value: false }));
  await t.wait(40);
  t.check(Math.abs((uw() ?? 0) - 0.15) < 0.001, `disabled: its own swimming is back (${uw()})`);
}
