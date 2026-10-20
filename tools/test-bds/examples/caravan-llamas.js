// Merchant Caravan: the pack llamas don't rubber-band (F42). They used to be teleported back the moment they were more
// than 10 blocks from the caravan, so a grazing llama walked out, jumped back and walked out again. Now one that
// wanders past 5 blocks from its spot is slowed and turned back, and only one past 10 is teleported (to a free spot
// near its own). For 5 minutes every tick each llama's place is read and every jump of more than 2 blocks in one tick
// counts as a snap-back; then one is carried 20 blocks off and must come back near its spot within 3 seconds.
//   node tools/test-bds/run.mjs --quiet --flat --only caravan_bp,crowns_bp --scenario tools/test-bds/examples/caravan-llamas.js --timeout 1000
export default async function (t) {
  t.server("/difficulty peaceful");
  t.server("/gamerule dodaylightcycle false");
  t.server("/time set 1000");
  const spawn = t.world.getDefaultSpawnLocation();
  const { top } = await t.loadArea(spawn.x, spawn.z, { radius: 3 });
  const y = (top?.location?.y ?? top?.y ?? 70) + 1;
  const p = await t.player("Ann", { op: true, x: spawn.x + 12, y, z: spawn.z + 12 });
  const cfg = (key, value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `c_${key}`, pack: "caravan_bp", key, value }));
  cfg("stayMinutes", 30);
  await t.wait(5);
  const since = t.tick;
  t.assert(t.cmd(p, "/realm:caravan_call").ok, "caravan_call ran");
  await t.waitMessage(p, /caravan has arrived/, { since, timeout: 100 });
  const llamas = () => t.dimension.getEntities({ tags: ["realm:caravan_llama"] });
  await t.waitUntil(() => llamas().length >= 2, { timeout: 600, interval: 20, message: "the pack llamas come" });
  const trader0 = t.dimension.getEntities({ tags: ["realm:caravan_trader:0"] })[0];
  t.assert(trader0, "trader 0 stands at the caravan's spot");
  const s = trader0.location;
  const home = { x: s.x, z: s.z - 3 };

  const TICKS = 5 * 60 * 20;
  /** @type {Map<string, { x: number, y: number, z: number }>} */
  const last = new Map();
  let snaps = 0;
  let samples = 0;
  let max = 0;
  let list = llamas();
  for (let i = 0; i < TICKS; i++) {
    await t.wait(1);
    if (i % 100 === 0) list = llamas();
    for (const e of list) {
      if (!e.isValid) continue;
      const l = e.location;
      const prev = last.get(e.id);
      if (prev && Math.hypot(l.x - prev.x, l.y - prev.y, l.z - prev.z) > 2) {
        snaps++;
        t.log(`tick ${i}: a llama jumped from ${prev.x.toFixed(1)},${prev.z.toFixed(1)} to ${l.x.toFixed(1)},${l.z.toFixed(1)}`);
      }
      last.set(e.id, { x: l.x, y: l.y, z: l.z });
      samples++;
      max = Math.max(max, Math.hypot(l.x - home.x, l.z - home.z));
    }
  }
  t.log(`5 minutes: ${samples} llama samples, ${snaps} snap-backs, farthest ${max.toFixed(1)} blocks from their spot`);
  t.check(snaps <= 1, `the llamas don't rubber-band: ${snaps} snap-backs in 5 minutes`);
  t.check(max <= 13, `they stay with the caravan (farthest ${max.toFixed(1)} blocks)`);

  // The last resort still works: carried far off, a llama is back near its spot within 3 seconds.
  const llama = llamas()[0];
  llama.teleport({ x: home.x + 20, y: llama.location.y + 1, z: home.z });
  await t.waitUntil(() => Math.hypot(llama.location.x - home.x, llama.location.z - home.z) <= 4, { timeout: 60, message: "a llama 20 blocks off is brought back near its spot" });
  t.pass("llamas stay with the caravan");
}
