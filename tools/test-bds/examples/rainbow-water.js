// Rainbow end on water: the chest floats at the surface (never on the sea bed), the compass keeps it until found.
//   node tools/test-bds/run.mjs --quiet --only rainbow_bp --scenario tools/test-bds/examples/rainbow-water.js --timeout 600
export default async function (t) {
  const { system } = t.mc;
  const dim = t.dimension;
  /** @type {any} */ let ev;
  /** @type {any[]} */ const pots = [];
  system.afterEvents.scriptEventReceive.subscribe((e) => {
    if (e.id === "realm:sky_event") ev = JSON.parse(e.message);
    else if (e.id === "realm:rainbow_pot") pots.push(JSON.parse(e.message));
  });
  const p = await t.player("Ann", { op: true });
  const since = t.tick;
  t.assert(t.cmd(p, "/realm:rainbow_now").ok, "rainbow_now ran");
  await t.waitMessage(p, /A rainbow!/, { since, timeout: 100 });
  await t.waitUntil(() => ev, { timeout: 40, message: "sky_event" });
  const { top } = await t.loadArea(ev.x, ev.z, { radius: 3 });
  const gy = Math.floor(top.location?.y ?? top.y);
  t.log(`end ${ev.x} ${ev.z}, ground ${gy}`);
  const x1 = ev.x - 16, x2 = ev.x + 16, z1 = ev.z - 16, z2 = ev.z + 16;
  t.log(`above end: ${[1, 2, 5, 10, 16].map((k) => dim.getBlock({ x: ev.x, y: gy + k, z: ev.z })?.typeId).join(",")}`);
  const fill = (ya, yb, id) => {
    try {
      dim.fillBlocks(new t.mc.BlockVolume({ x: x1, y: ya, z: z1 }, { x: x2, y: yb, z: z2 }), id);
    } catch (e) {
      t.log(`fill ${id}: ${e}`);
    }
  };
  fill(gy + 1, gy + 14, "minecraft:air");
  fill(gy - 3, gy, "minecraft:water");
  fill(gy - 4, gy - 4, "minecraft:sand");
  await t.wait(10);
  t.log(`at end: ${dim.getBlock({ x: ev.x, y: gy, z: ev.z })?.typeId}, topmost ${dim.getTopmostBlock({ x: ev.x, z: ev.z })?.typeId}`);
  p.teleport({ x: ev.x + 20.5, y: gy + 1, z: ev.z + 0.5 });
  const pl = await t.waitUntil(() => {
    const last = pots[pots.length - 1];
    for (let dx = -16; dx <= 16; dx++) for (let dz = -16; dz <= 16; dz++) for (let y = gy - 4; y <= gy + 2; y++) {
      if (dim.getBlock({ x: ev.x + dx, y, z: ev.z + dz })?.typeId === "minecraft:chest") return { x: ev.x + dx, y, z: ev.z + dz, last };
    }
    return undefined;
  }, { timeout: 400, interval: 20, message: "chest placed" });
  t.log(`chest at ${pl.x} ${pl.y} ${pl.z}; compass ${JSON.stringify(pl.last)}`);
  t.check(pl.y === gy, `chest at the water's surface (${pl.y} vs ${gy})`);
  t.check(dim.getBlock({ x: pl.x, y: pl.y - 1, z: pl.z })?.typeId === "minecraft:water", "water under it");
  t.check(dim.getBlock({ x: pl.x, y: pl.y + 1, z: pl.z })?.isAir, "open sky over it");
  t.check(pl.last?.x === pl.x && pl.last?.z === pl.z, "compass on the chest");
  // Close, but not there: the marker stays.
  p.teleport({ x: pl.x + 8.5, y: gy + 1, z: pl.z + 0.5 });
  await t.seconds(4);
  t.check(pots[pots.length - 1]?.x === pl.x, "still on the compass 8 blocks away");
  const s2 = t.tick;
  p.teleport({ x: pl.x + 1.5, y: gy + 0.5, z: pl.z + 0.5 });
  await t.waitMessage(p, /found the pot of gold/, { since: s2, timeout: 80 });
  await t.seconds(1);
  t.check(pots[pots.length - 1]?.x === undefined, "off the compass once found");
}
