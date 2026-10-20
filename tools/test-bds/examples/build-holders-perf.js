// F7 / O48: Easy Building's cost with survival players who hold blocks but are not building (building off), the
// common case on a survival server. Before F7 every placeable block counted as a building tool, so these players kept
// the preview and mirror loops awake and their hands were read every tick. Each player holds dirt, cobblestone or a
// torch in slot 0, a sword in slot 1 and bread in slot 2; every second some look around, sneak, or switch hotbar slots
// (hand events). Run with the profiler, Easy Building alone, before and after:
//   node tools/test-bds/run.mjs --quiet --no-relay --profile --profile-json <out.json> --only build_bp,build_rp --scenario tools/test-bds/examples/build-holders-perf.js --arg players=40 --arg seconds=120 --timeout 3000
// Arguments: players (default 10), seconds (default 120), swaps (chance a player switches slots in a second, default 0.1).
export default async function (t) {
  const { ItemStack } = t.mc;
  const N = Math.max(1, Number(t.args.players ?? 10));
  const SECONDS = Math.max(10, Number(t.args.seconds ?? 120));
  const SWAPS = Math.min(1, Math.max(0, Number(t.args.swaps ?? 0.1)));
  const BLOCKS = ["minecraft:dirt", "minecraft:cobblestone", "minecraft:torch"];
  const rnd = (n) => Math.floor(Math.random() * n);
  const cleared = new Set();
  const clearOwned = () => {
    const raw = t.world.getDynamicProperty("harness:tickingAreas");
    const areas = raw === undefined ? [] : JSON.parse(raw);
    for (const area of areas) {
      const key = `${area.dimension}|${area.name}`;
      if (cleared.has(key) || !/^harness_\d+_\d+$/.test(area.name)) continue;
      t.world.getDimension(area.dimension).runCommand(`tickingarea remove "${area.name}"`);
      cleared.add(key);
    }
  };
  const players = [];
  for (let i = 0; i < N; i++) {
    clearOwned();
    const p = await t.player(`Holder${String(i + 1).padStart(2, "0")}`, { x: (i % 8) * 3, z: Math.floor(i / 8) * 3, gameMode: "survival", settle: 2 });
    const c = p.getComponent("minecraft:inventory").container;
    c.clearAll();
    c.setItem(0, new ItemStack(BLOCKS[i % BLOCKS.length], 64));
    c.setItem(1, new ItemStack("minecraft:iron_sword", 1));
    c.setItem(2, new ItemStack("minecraft:bread", 16));
    p.selectedSlotIndex = 0;
    players.push(p);
  }
  clearOwned();
  t.report("perf-workload", { schema: 1, declared: { players: N, seconds: SECONDS, swaps: SWAPS }, spawned: players.length });
  t.assert(players.length === N, `all ${N} holders spawned`);
  await t.wait(40);
  const start = t.tick;
  let swaps = 0, minValid = N, samples = 0;
  while (t.tick - start < SECONDS * 20) {
    await t.wait(20);
    let valid = 0;
    for (const p of players) {
      try {
        if (!p.isValid) continue;
        valid++;
        const r = Math.random();
        if (r < SWAPS) { p.selectedSlotIndex = rnd(3); swaps++; }
        else if (r < 0.6) { const l = p.location; p.lookAtLocation({ x: l.x + rnd(21) - 10, y: l.y + rnd(5) - 2, z: l.z + rnd(21) - 10 }); }
        else if (r < 0.7) p.isSneaking = !p.isSneaking;
        // Back to the block most of the time: the case F7 is about.
        if (p.selectedSlotIndex !== 0 && Math.random() < 0.5) { p.selectedSlotIndex = 0; swaps++; }
      } catch (e) { /* a player in an odd spot */ }
    }
    minValid = Math.min(minValid, valid);
    samples++;
  }
  const endValid = players.filter((p) => { try { return p.isValid; } catch (e) { return false; } }).length;
  const ticks = t.tick - start;
  t.report("perf-workload", {
    schema: 1, declared: { players: N, seconds: SECONDS, swaps: SWAPS }, spawned: players.length,
    soak: { startTick: start, endTick: t.tick, ticks, seconds: ticks / 20 }, retention: { samples, minValid, endValid }, slotSwaps: swaps,
  });
  t.log(`holders soak: ${N} players, ${SECONDS} s, ${swaps} slot switches, fewest in the world ${minValid}`);
  t.check(minValid === N && endValid === N, `all ${N} holders stayed for the whole soak (fewest ${minValid}, at the end ${endValid})`);
}
