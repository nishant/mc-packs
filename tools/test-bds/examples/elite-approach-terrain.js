// Champions: the approach over ordinary terrain. Nine lanes 120 blocks apart, each with its own
// survival player and a zombie champion 40 blocks east of them, with something in between: nothing,
// two 1-block steps up, two trees, a field of plants and snow layers, a short wall, a long wall,
// a pocket (the champion stands in a U of wall open away from the player), a river and a 4-block
// cliff. The champions get Slowness 255 so only the approach moves them (no daylight or AI walking).
// Every lane but the river and the cliff must bring its champion within 14 blocks in 80 s; the river
// and the cliff (by design: no water, no drops of more than 3) are only logged.
// Run: node tools/test-bds/run.mjs --quiet --flat --only elite_bp --scenario tools/test-bds/examples/elite-approach-terrain.js --timeout 600
export default async function (t) {
  t.server("/time set noon");
  t.server("/gamerule domobspawning false");
  t.server("/gamerule dodaylightcycle false");
  const sp = t.world.getDefaultSpawnLocation();
  const X0 = Math.floor(sp.x) + 0;
  const fill = (a, b, block) => t.server(`/fill ${a.x} ${a.y} ${a.z} ${b.x} ${b.y} ${b.z} ${block}`);

  /** @type {{ name: string, must: boolean, build: (X: number, y: number, z: number) => void, champY?: number, playerY?: number }[]} */
  const lanes = [
    { name: "open", must: true, build: () => {} },
    {
      name: "two steps up",
      must: true,
      playerY: 2,
      build: (X, y, z) => {
        fill({ x: X - 6, y, z: z - 10 }, { x: X + 22, y, z: z + 10 }, "grass_block");
        fill({ x: X - 6, y: y + 1, z: z - 10 }, { x: X + 14, y: y + 1, z: z + 10 }, "grass_block");
      },
    },
    {
      name: "trees",
      must: true,
      build: (X, y, z) => {
        for (const [tx, tz] of [[X + 20, z], [X + 16, z + 1]]) {
          fill({ x: tx - 2, y: y + 2, z: tz - 2 }, { x: tx + 2, y: y + 4, z: tz + 2 }, "oak_leaves");
          fill({ x: tx - 1, y: y + 5, z: tz - 1 }, { x: tx + 1, y: y + 5, z: tz + 1 }, "oak_leaves");
          fill({ x: tx, y, z: tz }, { x: tx, y: y + 4, z: tz }, "oak_log");
        }
      },
    },
    {
      name: "plants and snow",
      must: true,
      build: (X, y, z) => {
        const bands = [["short_grass", 4, 10], ["poppy", 11, 14], ["snow_layer", 15, 22], ["wildflowers", 23, 26], ["brown_mushroom", 27, 29], ["fern", 30, 34]];
        for (const [b, a, c] of bands) fill({ x: X + a, y, z: z - 6 }, { x: X + c, y, z: z + 6 }, b);
      },
    },
    { name: "short wall", must: true, build: (X, y, z) => fill({ x: X + 20, y, z: z - 3 }, { x: X + 20, y: y + 1, z: z + 3 }, "stone") },
    { name: "long wall", must: true, build: (X, y, z) => fill({ x: X + 20, y, z: z - 16 }, { x: X + 20, y: y + 1, z: z + 16 }, "stone") },
    {
      name: "pocket",
      must: true,
      build: (X, y, z) => {
        fill({ x: X + 36, y, z: z - 4 }, { x: X + 36, y: y + 1, z: z + 4 }, "stone");
        fill({ x: X + 36, y, z: z - 4 }, { x: X + 44, y: y + 1, z: z - 4 }, "stone");
        fill({ x: X + 36, y, z: z + 4 }, { x: X + 44, y: y + 1, z: z + 4 }, "stone");
      },
    },
    {
      name: "river",
      must: false,
      build: (X, y, z) => fill({ x: X + 18, y: y - 2, z: z - 40 }, { x: X + 22, y: y - 1, z: z + 40 }, "water"),
    },
    {
      name: "cliff",
      must: false,
      champY: 4,
      build: (X, y, z) => fill({ x: X + 25, y, z: z - 30 }, { x: X + 52, y: y + 3, z: z + 30 }, "grass_block"),
    },
  ];

  const runs = [];
  for (let i = 0; i < lanes.length; i++) {
    const lane = lanes[i];
    const z = Math.floor(sp.z) + i * 120;
    const p = await t.player(`Lane${i}`, { x: X0 + 20, z });
    p.setGameMode(t.mc.GameMode.Survival);
    const y = Math.floor(p.location.y);
    lane.build(X0, y, z);
    await t.wait(2);
    p.teleport({ x: X0 + 0.5, y: y + (lane.playerY ?? 0), z: z + 0.5 });
    p.addEffect("resistance", 20 * 300, { amplifier: 255, showParticles: false });
    const tag = `realm:test_lane${i}`;
    t.system.sendScriptEvent("realm:champion_spawn", JSON.stringify({ x: X0 + 40.5, y: y + (lane.champY ?? 0), z: z + 0.5, mob: "minecraft:zombie", trait: "shielded", tag }));
    runs.push({ lane, p, tag, z });
  }
  for (const r of runs) {
    r.e = await t.waitUntil(() => t.dimension.getEntities({ tags: [r.tag] })[0], { timeout: 100, message: `${r.lane.name}: champion spawned` });
    r.e.addEffect("slowness", 20 * 300, { amplifier: 255, showParticles: false });
    r.d0 = Math.hypot(r.e.location.x - r.p.location.x, r.e.location.z - r.p.location.z);
    r.best = r.d0;
  }
  for (let s = 0; s < 80; s++) {
    await t.seconds(1);
    for (const r of runs) {
      if (!r.e.isValid) continue;
      const d = Math.hypot(r.e.location.x - r.p.location.x, r.e.location.z - r.p.location.z);
      r.best = Math.min(r.best, d);
      if (r.reached === undefined && d <= 14) r.reached = s + 1;
    }
  }
  for (const r of runs) {
    const at = r.e.isValid ? r.e.location : undefined;
    const where = at ? `x ${(at.x - X0).toFixed(1)}, y ${(at.y - Math.floor(r.p.location.y)).toFixed(1)}, z ${(at.z - r.z).toFixed(1)}` : "gone";
    t.log(`${r.lane.name}: ${r.d0.toFixed(1)} -> closest ${r.best.toFixed(1)} blocks, ${r.reached ? `within 14 after ${r.reached} s` : "never within 14"} (now at ${where})`);
    if (r.lane.must) t.check(r.best <= 14, `${r.lane.name}: the champion got within 14 blocks (closest ${r.best.toFixed(1)})`);
  }
}
