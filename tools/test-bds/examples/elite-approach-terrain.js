// Champions: the approach over ordinary terrain. Eight lanes 120 blocks apart, each with its own
// survival player and a zombie champion 30 blocks east of them, with something in between:
// two 1-block steps up, two trees, a field of plants and snow layers, a short wall, a long wall, a
// pocket (the champion stands in a U of wall open away from the player), a river and a 4-block cliff.
// The champions get Slowness 255 so only the approach moves them (no daylight hunt or AI walking).
// Every lane but the river and the cliff must bring its champion within 14 blocks in 80 s; the river
// and the cliff can't be crossed (by design: no water, no drop of more than 3), so there the champion
// must stay within 33 blocks: a champion more than about 32 blocks from every player may despawn (its
// name tag set by a script doesn't keep it; past about 44 it goes at once), so a detour that leads
// away could lose it.
// Before the fix (1.3.0) the trees and both walls stopped their champion for good with its body
// against the obstacle (17.8 blocks away), the pocket's never got out (26.8), and a 1-block step
// stopped it too whenever its center hadn't reached the step's column when its body touched it.
// Run: node tools/test-bds/run.mjs --quiet --flat --only elite_bp --scenario tools/test-bds/examples/elite-approach-terrain.js --timeout 600
export default async function (t) {
  t.server("/time set noon");
  t.server("/gamerule domobspawning false");
  t.server("/gamerule dodaylightcycle false");
  const sp = t.world.getDefaultSpawnLocation();
  const X0 = Math.floor(sp.x);
  const C = 30; // the champion's start, east of the player
  const fill = (a, b, block) => t.server(`/fill ${a.x} ${a.y} ${a.z} ${b.x} ${b.y} ${b.z} ${block}`);

  /** @type {{ name: string, must: boolean, build: (X: number, y: number, z: number) => void, champY?: number, playerY?: number, wide?: boolean }[]} */
  const lanes = [
    {
      name: "two steps up",
      must: true,
      playerY: 2,
      build: (X, y, z) => {
        fill({ x: X - 6, y, z: z - 10 }, { x: X + 18, y, z: z + 10 }, "grass_block");
        fill({ x: X - 6, y: y + 1, z: z - 10 }, { x: X + 12, y: y + 1, z: z + 10 }, "grass_block");
      },
    },
    {
      name: "trees",
      must: true,
      build: (X, y, z) => {
        for (const [tx, tz] of [[X + 17, z], [X + 13, z + 1]]) {
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
        const bands = [["short_grass", 4, 8], ["poppy", 9, 12], ["snow_layer", 13, 19], ["wildflowers", 20, 23], ["brown_mushroom", 24, 26], ["fern", 27, 31]];
        for (const [b, a, c] of bands) fill({ x: X + a, y, z: z - 6 }, { x: X + c, y, z: z + 6 }, b);
      },
    },
    { name: "short wall", must: true, build: (X, y, z) => fill({ x: X + 17, y, z: z - 3 }, { x: X + 17, y: y + 1, z: z + 3 }, "stone") },
    { name: "long wall", must: true, build: (X, y, z) => fill({ x: X + 17, y, z: z - 16 }, { x: X + 17, y: y + 1, z: z + 16 }, "stone") },
    {
      name: "pocket",
      must: true,
      build: (X, y, z) => {
        fill({ x: X + 26, y, z: z - 4 }, { x: X + 26, y: y + 1, z: z + 4 }, "stone");
        fill({ x: X + 26, y, z: z - 4 }, { x: X + 33, y: y + 1, z: z - 4 }, "stone");
        fill({ x: X + 26, y, z: z + 4 }, { x: X + 33, y: y + 1, z: z + 4 }, "stone");
      },
    },
    { name: "river", must: false, wide: true, build: (X, y, z) => fill({ x: X + 15, y: y - 2, z: z - 40 }, { x: X + 19, y: y - 1, z: z + 40 }, "water") },
    { name: "cliff", must: false, wide: true, champY: 4, build: (X, y, z) => fill({ x: X + 20, y, z: z - 30 }, { x: X + 44, y: y + 3, z: z + 30 }, "grass_block") },
  ];

  const runs = [];
  t.world.beforeEvents.entityRemove.subscribe(({ removedEntity: e }) => {
    try {
      const r = runs.find((x) => e.hasTag(x.tag));
      if (r) t.log(`${r.lane.name}: champion removed at x ${(e.location.x - X0).toFixed(1)}, y ${(e.location.y - r.y).toFixed(1)}, z ${(e.location.z - r.z).toFixed(1)}`);
    } catch {
      // gone already
    }
  });
  for (let i = 0; i < lanes.length; i++) {
    const lane = lanes[i];
    const z = Math.floor(sp.z) + i * 120;
    // A detour along the river or the cliff goes further sideways than the player's ticking area reaches.
    if (lane.wide) await t.loadArea(X0 + 17, z, { radius: 4 });
    const p = await t.player(`Lane${i}`, { x: X0 + 17, z });
    p.setGameMode(t.mc.GameMode.Survival);
    const y = Math.floor(p.location.y);
    lane.build(X0, y, z);
    await t.wait(2);
    p.teleport({ x: X0 + 0.5, y: y + (lane.playerY ?? 0), z: z + 0.5 });
    p.addEffect("resistance", 20 * 300, { amplifier: 255, showParticles: false });
    const tag = `realm:test_lane${i}`;
    t.system.sendScriptEvent("realm:champion_spawn", JSON.stringify({ x: X0 + C + 0.5, y: y + (lane.champY ?? 0), z: z + 0.5, mob: "minecraft:zombie", trait: "shielded", tag }));
    runs.push({ lane, p, tag, z, y });
  }
  for (const r of runs) {
    r.e = await t.waitUntil(() => t.dimension.getEntities({ tags: [r.tag] })[0], { timeout: 100, message: `${r.lane.name}: champion spawned` });
    r.e.addEffect("slowness", 20 * 300, { amplifier: 255, showParticles: false });
    r.d0 = Math.hypot(r.e.location.x - r.p.location.x, r.e.location.z - r.p.location.z);
    r.best = r.d0;
    r.worst = r.d0;
  }
  for (let s = 0; s < 80; s++) {
    await t.seconds(1);
    for (const r of runs) {
      if (!r.e.isValid) {
        r.goneAt ??= s;
        continue;
      }
      const d = Math.hypot(r.e.location.x - r.p.location.x, r.e.location.z - r.p.location.z);
      r.best = Math.min(r.best, d);
      r.worst = Math.max(r.worst, d);
      if (r.reached === undefined && d <= 14) r.reached = s + 1;
    }
  }
  for (const r of runs) {
    const at = r.e.isValid ? r.e.location : undefined;
    const where = at ? `x ${(at.x - X0).toFixed(1)}, y ${(at.y - r.y).toFixed(1)}, z ${(at.z - r.z).toFixed(1)}` : `gone after ${r.goneAt} s`;
    t.log(`${r.lane.name}: ${r.d0.toFixed(1)} -> closest ${r.best.toFixed(1)}, farthest ${r.worst.toFixed(1)} blocks, ${r.reached ? `within 14 after ${r.reached} s` : "never within 14"} (now at ${where})`);
    t.check(r.goneAt === undefined, `${r.lane.name}: the champion is still there`);
    if (r.lane.must) t.check(r.best <= 14, `${r.lane.name}: the champion got within 14 blocks (closest ${r.best.toFixed(1)})`);
    else t.check(r.worst <= 33, `${r.lane.name}: the champion stayed within 33 blocks (farthest ${r.worst.toFixed(1)})`);
  }
}
