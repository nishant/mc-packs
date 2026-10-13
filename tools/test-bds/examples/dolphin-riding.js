// Dolphin Friends: a tamed dolphin is steered as soon as someone rides it (also when they got on
// without a tap), stops being steered when they get off, and is still tamed and rideable after a
// restart. Steering turns the dolphin to where its rider looks, which is what this checks.
// About 1.5 minutes (two phases):
//   node tools/test-bds/run.mjs --quiet --timeout 600 --only dolphin_bp --scenario tools/test-bds/examples/dolphin-riding.js
export default async function (t) {
  t.server("/gamerule domobspawning false");
  const p = await t.player("Tester", { op: true });
  const at = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
  const TAG = "t_dolphin";
  const yawOf = (e) => ((e.getRotation().y % 360) + 360) % 360;
  const near = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b)) < 3;
  /** Puts `p` on `d`, turns them twice and checks the dolphin turns with them. */
  const rideAndTurn = async (d, label) => {
    t.assert(d.getComponent("minecraft:rideable")?.addRider(p), `${label}: the player is on the dolphin`);
    for (const yaw of [90, -150]) {
      p.setRotation({ x: 0, y: yaw });
      const want = ((yaw % 360) + 360) % 360;
      await t.wait(8);
      t.check(near(yawOf(d), want), `${label}: the dolphin faces where the rider looks (${Math.round(yawOf(d))} vs ${want})`);
    }
    d.getComponent("minecraft:rideable").ejectRider(p);
    await t.wait(3);
    p.setRotation({ x: 0, y: 45 });
    await t.wait(8);
    t.check(!near(yawOf(d), 45), `${label}: not steered once the rider is off (${Math.round(yawOf(d))})`);
  };

  if (t.phase === 1) {
    // A pool to keep the dolphin wet.
    t.server(`/fill ${at.x - 4} ${at.y - 5} ${at.z - 4} ${at.x + 4} ${at.y - 1} ${at.z + 4} water`);
    await t.wait(5);
    const d = t.dimension.spawnEntity("minecraft:dolphin", { x: at.x + 1.5, y: at.y - 3, z: at.z + 0.5 });
    d.addTag(TAG);
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
    t.check(!!d.getComponent("minecraft:is_tamed") && !!d.getComponent("minecraft:rideable"), "tamed and rideable");
    inv.setItem(p.selectedSlotIndex, undefined);
    await rideAndTurn(d, "phase 1");
    t.restart("tamed, restarting");
    return;
  }
  await t.loadArea(at.x, at.z);
  const d = await t.waitUntil(() => t.dimension.getEntities({ type: "minecraft:dolphin", tags: [TAG] })[0], { timeout: 100, message: "the dolphin is still there" });
  t.check(!!d.getComponent("minecraft:is_tamed") && !!d.getComponent("minecraft:rideable"), "still tamed and rideable after the restart");
  p.teleport({ x: d.location.x - 1, y: d.location.y, z: d.location.z });
  await t.wait(3);
  await rideAndTurn(d, "phase 2");
}
