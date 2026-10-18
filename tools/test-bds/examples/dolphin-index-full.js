// Dolphin Friends with many tamed dolphins: the index of tamed dolphins was one world property, and at about 320
// dolphins (34 players with 10 each here; any public server, sooner or later) it outgrew the 32,767 characters a
// property holds, so every new taming failed for everyone. Now it is one property per owner and taming keeps working.
// About 1 minute:
//   node tools/test-bds/run.mjs --quiet --only dolphin_bp --scenario tools/test-bds/examples/dolphin-index-full.js --timeout 400
export default async function (t) {
  t.server("/gamerule domobspawning false");
  const sys = t.mc.system;
  const acks = [];
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "realm:cfg_ack") acks.push(JSON.parse(message));
  }, { namespaces: ["realm"] });
  let n = 0;
  const set = async (key, value) => {
    const id = `dl${++n}`;
    sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id, pack: "dolphin_bp", key, value }));
    const ack = await t.waitUntil(() => acks.find((x) => x.id === id), { timeout: 40, message: `ack ${key}` });
    t.assert(ack.ok, `${key}=${value}`);
  };
  await set("tameChancePercent", 100);
  await set("maxPerPlayer", 10);

  const PLAYERS = 34;
  const EACH = 10;
  const first = await t.player("Tamer00", { op: true });
  const at = { x: Math.floor(first.location.x), y: Math.floor(first.location.y), z: Math.floor(first.location.z) };
  t.server(`/fill ${at.x - 4} ${at.y - 5} ${at.z - 4} ${at.x + 4} ${at.y - 1} ${at.z + 4} water`);
  await t.wait(5);
  const spot = { x: at.x + 0.5, y: at.y - 3, z: at.z + 0.5 };
  let tamed = 0;
  let failedAt = -1;
  for (let i = 0; i < PLAYERS; i++) {
    const p = i === 0 ? first : await t.player(`Tamer${String(i).padStart(2, "0")}`, { op: true, x: at.x, z: at.z });
    p.teleport(spot);
    const inv = p.getComponent("inventory").container;
    inv.setItem(p.selectedSlotIndex, new t.mc.ItemStack("minecraft:cod", 64));
    for (let k = 0; k < EACH; k++) {
      const d = t.dimension.spawnEntity("minecraft:dolphin", { x: spot.x + 1, y: spot.y, z: spot.z });
      const since = t.tick;
      t.cmd(p, "/scriptevent realm:dolphin_feed");
      await t.wait(1);
      if (t.messages(p, { since }).some((m) => /trusts you/.test(m.plain))) tamed++;
      else if (failedAt < 0) failedAt = i * EACH + k;
      d.remove(); // out of the way: it stays in the index (as one swimming far away would)
    }
    inv.setItem(p.selectedSlotIndex, undefined);
    p.teleport({ x: at.x + 10 + i, y: at.y + 2, z: at.z + 10 });
  }
  t.log(`tamed ${tamed} of ${PLAYERS * EACH}${failedAt >= 0 ? `; the first failure was taming #${failedAt + 1}` : ""}`);
  t.check(tamed === PLAYERS * EACH, `every taming worked (${tamed} of ${PLAYERS * EACH})`);
}
