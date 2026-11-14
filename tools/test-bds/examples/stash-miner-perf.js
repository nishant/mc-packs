// Quick Stack & Sort, Expansive Inventory: miners on a nearly full page (W9, BSE-27). A few players (`miners`, default 2)
// stand on page 2 holding 22 full stacks of stone, a cobblestone stack with room and one free slot, with a full hotbar,
// and pick something up every `every` ticks (default 5: four pickups a second, a fast pickaxe): mostly cobblestone,
// which tops up their own stack, and every fourth pickup a new kind (dirt, andesite, gravel, diorite) that takes the free
// slot. Auto-store routes each arrival to page 1. Every other player stands still (the quiet players of perf-soak.js).
// Meant for run.mjs --profile; reports perf-workload with the steady window, and checks at the end that every item a
// miner picked up is on one of their pages exactly once (none lost, none doubled):
//   node tools/test-bds/run.mjs --quiet --no-relay --profile --only stash_bp --scenario tools/test-bds/examples/stash-miner-perf.js --arg players=10 --arg seconds=60 --timeout 1500
// The measurement: --arg players=40 --arg seconds=120 --timeout 3000 (and players=10).
// Arguments (--arg key=value): players (default 10), seconds (default 60), miners (default 2), every (ticks between a
// miner's pickups, default 5), group (players per group, default 5), spread (blocks between groups, default 48).
export default async function (t) {
  const a = t.args;
  const N = Math.max(1, Number(a.players ?? 10));
  const SECONDS = Math.max(10, Number(a.seconds ?? 60));
  const MINERS = Math.min(N, Math.max(1, Number(a.miners ?? 2)));
  const EVERY = Math.max(1, Number(a.every ?? 5));
  const GROUP = Math.max(1, Number(a.group ?? 5));
  const SPREAD = Math.max(16, Number(a.spread ?? 48));
  const { ItemStack } = t.mc;
  const STORAGE = [9, 10, 11, 12, 13, 14, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];
  const OTHERS = ["minecraft:dirt", "minecraft:andesite", "minecraft:gravel", "minecraft:diorite"];
  const spawn = t.world.getDefaultSpawnLocation();
  const SX = spawn.x === 0 && spawn.z === 0 ? 163 : spawn.x, SZ = spawn.z === 0 && spawn.x === 0 ? 170 : spawn.z;
  t.server("/gamerule sendcommandfeedback false");
  t.server("/gamerule domobspawning false");
  const setAuto = async (/** @type {boolean} */ value) => {
    t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `miner-perf-${value}-${t.tick}`, pack: "stash_bp", key: "autoStore", value }));
    await t.wait(3);
  };
  await setAuto(false);

  // Bedrock allows 10 ticking areas: the harness adds one per spawn, so remove them after each spawn (as perf-soak.js).
  const cleared = new Set();
  const clearAreas = () => {
    const raw = t.world.getDynamicProperty("harness:tickingAreas");
    const areas = raw === undefined ? [] : JSON.parse(raw);
    for (const area of areas) {
      const key = `${area.dimension}|${area.name}`;
      if (cleared.has(key) || !/^harness_\d+_\d+$/.test(area.name)) continue;
      t.world.getDimension(area.dimension).runCommand(`tickingarea remove "${area.name}"`);
      cleared.add(key);
    }
  };
  const rnd = (n) => Math.floor(Math.random() * n);
  const groupSpot = (g) => {
    const ring = Math.ceil(Math.sqrt(g + 1));
    return { x: SX + ((g % ring) - ring / 2) * SPREAD, z: SZ + (Math.floor(g / ring) - ring / 2) * SPREAD };
  };

  /** @type {any[]} */
  const players = [];
  const t0 = t.tick;
  for (let i = 0; i < N; i++) {
    const c = groupSpot(Math.floor(i / GROUP));
    for (let attempt = 0; attempt < 3; attempt++) {
      clearAreas();
      await t.wait(1);
      try {
        players.push(await t.player(`Miner${String(i + 1).padStart(3, "0")}`, { x: c.x + rnd(9) - 4 + attempt * 7, z: c.z + rnd(9) - 4, op: i < MINERS, settle: 2 }));
        break;
      } catch (e) {
        t.log(`could not spawn player ${i + 1} (try ${attempt + 1}): ${e}`);
      }
    }
    clearAreas();
  }
  const made = players.length;
  t.log(`spawned ${made}/${N} players in ${((t.tick - t0) / 20).toFixed(0)} s, ${MINERS} of them miners`);
  const declared = { players: N, seconds: SECONDS, miners: MINERS, every: EVERY, group: GROUP, spread: SPREAD };
  const kinds = { land: made, water: 0, nether: 0, groups: Math.ceil(N / GROUP), miners: MINERS };
  const spawnGameSeconds = (t.tick - t0) / 20;
  t.report("perf-workload", { schema: 1, declared, spawned: made, spawnGameSeconds, kinds });
  t.assert(made === N, `all ${N} declared players spawned (${made} did)`);

  // The miners: page 2 with 22 x 64 stone, 10 cobblestone and one free slot; torches fill the hotbar.
  const miners = players.slice(0, MINERS).map((p) => {
    const inv = p.getComponent("minecraft:inventory").container;
    return { p, inv, pageNow: () => Number(/Page (\d+)\//.exec(inv.getItem(16)?.nameTag ?? "")?.[1] ?? 0), got: /** @type {Record<string, number>} */ ({}), refused: 0 };
  });
  for (const m of miners) {
    t.cmd(m.p, "/gamemode survival");
    await t.waitUntil(() => m.inv.getItem(16)?.typeId === "custom:inv_menu", { timeout: 200, message: `${m.p.name}'s pages ready` });
    m.inv.setItem(17, undefined);
    await t.waitUntil(() => m.pageNow() === 2, { timeout: 100, message: `${m.p.name} on page 2` });
    await t.wait(5);
    for (const s of STORAGE.slice(0, 22)) m.inv.setItem(s, new ItemStack("minecraft:stone", 64));
    m.inv.setItem(STORAGE[22], new ItemStack("minecraft:cobblestone", 10));
    for (let s = 0; s < 9; s++) m.inv.setItem(s, new ItemStack("minecraft:torch", 1 + s));
    await t.wait(5);
  }
  await t.wait(40);
  await setAuto(true);
  await t.wait(40);

  // The soak: every miner picks something up every EVERY ticks; the rest stand still.
  const valid = (p) => { try { return p.isValid; } catch { return false; } };
  const start = t.tick;
  let samples = 0, minValid = Infinity, pickups = 0, n = 0;
  let nextSample = start + 20;
  while (t.tick - start < SECONDS * 20) {
    await t.wait(EVERY);
    n++;
    const id = n % 4 === 0 ? OTHERS[(n / 4) % OTHERS.length] : "minecraft:cobblestone";
    for (const m of miners) {
      if (!valid(m.p)) continue;
      try {
        // A pickup that finds no room stays on the ground, as in the game: it is not counted as picked up.
        const left = m.inv.addItem(new ItemStack(id, 1));
        if (left) m.refused++;
        else {
          m.got[id] = (m.got[id] ?? 0) + 1;
          pickups++;
        }
      } catch { /* a miner in an odd state: the count below shows it */ }
    }
    if (t.tick >= nextSample) {
      nextSample += 20;
      samples++;
      minValid = Math.min(minValid, players.filter(valid).length);
    }
  }
  const end = t.tick;
  const alive = players.filter(valid).length;
  const ticks = end - start;
  t.log(`soak done: ${SECONDS} s, ${alive}/${N} players, ${pickups} pickups by ${MINERS} miners, ${miners.reduce((s, m) => s + m.refused, 0)} found no room`);
  t.report("perf-workload", {
    schema: 1, declared, spawned: made, spawnGameSeconds, kinds,
    soak: { startTick: start, endTick: end, ticks, seconds: ticks / 20 },
    retention: { samples, minValid: samples ? minValid : 0, endValid: alive },
    pickups,
  });
  t.check(samples > 0 && minValid === N && alive === N, `all ${N} players stayed in the world for the whole ${SECONDS} s soak`);
  t.check(ticks >= SECONDS * 20, `the steady window ran its full ${SECONDS} s (${(ticks / 20).toFixed(1)} s)`);

  // Nothing lost or doubled: every page of every miner, counted after the last pickup has had time to be stored.
  await t.wait(60);
  await setAuto(false);
  for (const m of miners) {
    /** @type {Record<string, number>} */
    const have = {};
    const total = 5;
    for (let step = 0; step < total; step++) {
      for (let s = 0; s < 36; s++) {
        const it = m.inv.getItem(s);
        if (it && !it.typeId.startsWith("custom:")) have[it.typeId] = (have[it.typeId] ?? 0) + (s < 9 ? 0 : it.amount);
      }
      const want = (m.pageNow() % total) + 1;
      m.inv.setItem(17, undefined);
      await t.waitUntil(() => m.pageNow() === want, { timeout: 100, message: `${m.p.name} on page ${want}` });
      await t.wait(4);
    }
    const expect = { "minecraft:stone": 22 * 64, "minecraft:cobblestone": 10 + (m.got["minecraft:cobblestone"] ?? 0) };
    for (const k of OTHERS) if (m.got[k]) expect[k] = m.got[k];
    t.log(`${m.p.name}: picked up ${JSON.stringify(m.got)}, pages hold ${JSON.stringify(have)}`);
    for (const [k, v] of Object.entries(expect)) t.check(have[k] === v, `${m.p.name}'s pages hold ${v} ${k} (${have[k] ?? 0})`);
    for (const k of Object.keys(have)) t.check(k in expect || k === "minecraft:torch", `${m.p.name}'s pages hold only what they had and picked up (${k})`);
  }
}
