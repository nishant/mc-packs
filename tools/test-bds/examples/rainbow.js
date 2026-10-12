// Rainbow: force one, walk toward its end (logging positions), find the chest, claim the pot.
export default async function (t) {
  const { system } = t.mc;
  /** @type {any} */ let ev;
  system.afterEvents.scriptEventReceive.subscribe((e) => {
    if (e.id === "realm:sky_event") ev = JSON.parse(e.message);
  });
  const p = await t.player("Ann", { op: true, gameMode: "creative" });
  t.log(`start ${fmt(p.location)}`);
  const since = t.tick;
  t.assert(t.cmd(p, "/realm:rainbow_now").ok, "rainbow_now ran");
  const msg = await t.waitMessage(p, /A rainbow!/, { since, timeout: 100 });
  t.log(msg.plain);
  await t.waitUntil(() => ev, { timeout: 40, message: "sky_event" });
  t.log(`end at ${ev.x}, ${ev.z}`);
  const s = p.location;
  const dx = ev.x + 0.5 - s.x, dz = ev.z + 0.5 - s.z, D = Math.hypot(dx, dz);
  // Walk toward it in jumps; the end stays where it is (the chat said its direction from the start).
  for (const left of [D * 0.6, D * 0.3, 90, 60]) {
    const x = ev.x + 0.5 - (dx / D) * left, z = ev.z + 0.5 - (dz / D) * left;
    const { top } = await t.loadArea(x, z, { radius: 1 });
    p.teleport({ x, y: (top?.y ?? 70) + 1, z });
    await t.seconds(3);
    t.log(`at ${fmt(p.location)}: ${Math.round(Math.hypot(ev.x + 0.5 - p.location.x, ev.z + 0.5 - p.location.z))} blocks from the end`);
  }
  // A side view, then close: the chest is placed within 40 blocks.
  const { top } = await t.loadArea(ev.x + 0.5 - (dx / D) * 25, ev.z + 0.5 - (dz / D) * 25, { radius: 2 });
  p.teleport({ x: ev.x + 0.5 - (dx / D) * 25, y: (top?.y ?? 70) + 1, z: ev.z + 0.5 - (dz / D) * 25 });
  await t.loadArea(ev.x, ev.z, { radius: 2 });
  /** @type {any} */ let chest;
  const endTop = p.dimension.getTopmostBlock({ x: ev.x, z: ev.z });
  t.log(`end's top block: ${endTop?.typeId} at ${endTop && fmt(endTop.location)}`);
  const scan = () => {
    const dim = p.dimension;
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
  for (let i = 0; i < 15 && !scan(); i++) await t.seconds(1);
  if (chest) t.log(`chest at ${fmt(chest)} (${Math.round(Math.hypot(chest.x - ev.x, chest.z - ev.z))} from the end)`);
  else {
    t.log("no chest (no safe spot): the loot goes to the finder");
    chest = { x: ev.x - 1, y: (endTop?.location.y ?? 64) + 1, z: ev.z };
  }
  await t.seconds(3);
  const since2 = t.tick;
  p.setGameMode(t.mc.GameMode.Survival);
  p.teleport({ x: chest.x + 1.5, y: chest.y, z: chest.z + 0.5 });
  const found = await t.waitMessage(p, /found the pot of gold/, { since: since2, timeout: 100 });
  t.log(found.plain);
  await t.seconds(4);
}
const fmt = (/** @type {any} */ l) => `${Math.round(l.x)} ${Math.round(l.y)} ${Math.round(l.z)}`;
