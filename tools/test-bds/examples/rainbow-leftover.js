// Rainbows: an empty pot chest whose pot expires while no one is near (its chunk unloaded) is removed when a
// player comes back, instead of staying in the world for good. potMinutes is set to 3, so this takes ~4 minutes.
// (It removes every ticking area, the harness's included, so the chest's chunk can unload.) Also checks that the
// realm:rainbow_pot broadcast for the Minimap moves to the chest's spot, and says {} once the pot expires.
//   node tools/test-bds/run.mjs --quiet --only rainbow_bp --scenario tools/test-bds/examples/rainbow-leftover.js --timeout 600
export default async function (t) {
  const sys = t.mc.system;
  const dim = t.dimension;
  /** @type {any} */ let ev;
  const acks = new Set();
  /** @type {any[]} */ const pots = [];
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "realm:sky_event") ev = JSON.parse(message);
    else if (id === "realm:rainbow_pot") pots.push(JSON.parse(message));
    else if (id === "realm:cfg_ack") acks.add(JSON.parse(message).id);
  }, { namespaces: ["realm"] });
  const p = await t.player("Ann", { op: true, gameMode: "creative" });
  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "pm", pack: "rainbow_bp", key: "potMinutes", value: 3 }));
  await t.waitUntil(() => acks.has("pm"), { timeout: 40, message: "potMinutes set" });
  /** @type {any} */ let chest;
  const scan = () => {
    for (let ox = -13; ox <= 13; ox++)
      for (let oz = -13; oz <= 13; oz++) {
        const tb = dim.getTopmostBlock({ x: ev.x + ox, z: ev.z + oz });
        if (!tb) continue;
        for (let y = tb.location.y; y > tb.location.y - 12; y--) {
          const b = dim.getBlock({ x: ev.x + ox, y, z: ev.z + oz });
          if (b?.typeId === "minecraft:chest") return (chest = b.location);
        }
      }
    return false;
  };
  const start = Date.now();
  t.assert(t.cmd(p, "/realm:rainbow_now").ok, "rainbow_now ran");
  await t.waitUntil(() => ev, { timeout: 60, message: "sky_event" });
  t.log(`end at ${ev.x}, ${ev.z}`);
  // Load the end (a ticking area, removed below) and clear a patch of grass there, so its chest has a safe spot;
  // then stand 30 blocks from it: the chest is placed within 40 blocks.
  const { top } = await t.loadArea(ev.x + 0.5, ev.z + 0.5, { radius: 2 });
  const y = Math.max(63, top?.y ?? 64);
  t.server(`/fill ${ev.x - 6} ${y - 4} ${ev.z - 6} ${ev.x + 6} ${y} ${ev.z + 6} grass_block`);
  t.server(`/fill ${ev.x - 6} ${y + 1} ${ev.z - 6} ${ev.x + 6} ${y + 30} ${ev.z + 6} air`);
  p.teleport({ x: ev.x + 30.5, y: y + 6, z: ev.z + 0.5 });
  for (let i = 0; i < 20 && !chest; i++) {
    await t.seconds(1);
    try {
      scan();
    } catch {
      // not loaded yet
    }
  }
  t.assert(chest, "pot chest placed");
  t.log(`chest at ${chest.x} ${chest.y} ${chest.z}`);
  await t.seconds(1);
  const at = pots[pots.length - 1];
  t.check(at?.x === chest.x && at?.z === chest.z, `rainbow_pot moved to the chest (${pots.length} sent, last ${JSON.stringify(at)})`);
  // Someone emptied it.
  dim.getBlock(chest)?.getComponent("minecraft:inventory")?.container?.clearAll();
  // Walk far away, and nothing else keeps it loaded: its chunk unloads.
  await t.console("tickingarea remove_all");
  p.teleport({ x: ev.x + 900.5, y: 140, z: ev.z + 0.5 });
  const unloaded = () => {
    try {
      return !dim.getBlock(chest);
    } catch {
      return true;
    }
  };
  await t.waitUntil(unloaded, { timeout: 1200, interval: 20, message: "the chest's chunk unloads" });
  t.log("the chest's chunk is unloaded");
  // The pot expires (3 minutes after it appeared) while no one is there.
  const left = start + 3 * 60000 + 8000 - Date.now();
  if (left > 0) await t.wait(Math.ceil(left / 50));
  t.check(unloaded(), "still unloaded when the pot expired");
  t.check(pots[pots.length - 1]?.x === undefined, `rainbow_pot {} once the pot expired: ${JSON.stringify(pots[pots.length - 1])}`);
  // Back: the empty chest goes once its chunk is loaded.
  await t.loadArea(chest.x + 0.5, chest.z + 0.5, { radius: 1 });
  p.teleport({ x: chest.x + 10.5, y: chest.y + 2, z: chest.z + 0.5 });
  t.check(!unloaded(), "the chest's chunk is loaded again");
  await t.seconds(4);
  const b = dim.getBlock(chest);
  t.log(`at the chest's spot now: ${b?.typeId}`);
  t.check(b?.typeId !== "minecraft:chest", "the empty pot chest was removed when a player came back");
}
