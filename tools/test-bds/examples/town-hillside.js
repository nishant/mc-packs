// Town Projects, the terrain rule on a hillside (F37): terraces of 1 block every 4 rising to the east, a town on them,
// every project but the dock finished. The builds stand at more than one pad height (the town keeps its elevation),
// every apron joins the ground with steps of at most 1, no column is moved more than 3, and nothing outside the
// spots' regions changed (but for the town's lantern posts, townLife; its grass paths keep the ground's height).
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp --scenario tools/test-bds/examples/town-hillside.js --timeout 6000
export default async function (t) {
  const dim = t.dimension;
  const G = -61;
  const R = 70; // the area the hill covers
  const p = await t.player("Ann", { op: true, x: 0, z: 0, gameMode: "creative" });
  // No mobs: in the 20 minutes this runs, endermen on the plain pick up grass blocks (one did, outside every region).
  t.server("/gamerule domobspawning false");
  for (const [x, z] of [[0, 0], [-48, -48], [48, -48], [-48, 48], [48, 48]]) await t.loadArea(x, z, { radius: 4 });
  // Terraces: x from -R, one block higher every 4 blocks (up to 34 blocks over the plain at the east edge).
  for (let x = -R; x <= R; x += 4) {
    const h = Math.floor((x + R) / 4);
    if (h <= 0) continue;
    // loadArea waits for each area's center chunk only: the edges of the hill can take a few more ticks to load.
    await t.waitUntil(() => t.server(`/fill ${x} ${G} ${-R} ${Math.min(R, x + 3)} ${G + h - 1} ${R} dirt`).ok, { timeout: 400, interval: 10, message: `terrace ${x}` });
    t.server(`/fill ${x} ${G + h} ${-R} ${Math.min(R, x + 3)} ${G + h} ${R} grass_block`);
  }
  await t.wait(20);
  const top = (x, z) => {
    for (let y = G + 40; y >= G - 3; y--) {
      const b = dim.getBlock({ x, y, z });
      if (b && !b.isAir) return { y, id: b.typeId };
    }
    return undefined;
  };
  const before = new Map();
  const beforeId = new Map();
  for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) {
    const b = top(x, z);
    before.set(`${x},${z}`, b?.y);
    beforeId.set(`${x},${z}`, b?.id);
  }
  const center = top(0, 0).y + 1;
  p.teleport({ x: 0.5, y: center, z: 0.5 });
  await t.wait(10);
  const town = (action, extra = {}) => t.system.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", town: "hill", ...extra }));
  const dump = async () => {
    await t.wait(1); // a dump just before answered in this tick: never take its message for this one
    const since = t.tick;
    town("dump");
    return JSON.parse((await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 })).plain);
  };
  let since = t.tick;
  town("add", { name: "Hill" });
  await t.waitMessage(p, /Town Hill added/, { since, timeout: 60 });
  const built = (d, id) => d.progress.find(([x]) => x === id)?.[1].built === 1;
  for (const level of [1, 2, 3, 4]) {
    let d = await dump();
    const open = d.progress.filter(([id, pr]) => !pr.done && id !== "dock").map(([id]) => id);
    const scanFrom = t.tick;
    await t.waitUntil(async () => {
      d = await dump();
      return !d.town.scan;
    }, { timeout: 12000, interval: 100, message: `level ${level}: spots picked` });
    t.log(`level ${level}: spots picked in ${((t.tick - scanFrom) / 20).toFixed(0)} s`);
    // Every open project (the dock too: no water, so no good spot, but the level still rises).
    for (const id of open) town("finish", { project: id });
    if (level === 3) town("finish", { project: "dock" });
    await t.waitUntil(async () => {
      d = await dump();
      return Object.keys(d.town.spots).every((id) => built(d, id));
    }, { timeout: 3000, interval: 100, message: `level ${level}: built` });
  }
  const d = await dump();
  t.log("spots:", JSON.stringify(d.town.spots));
  t.check(d.town.nos?.includes("dock"), "the dock has no good spot (no water)");
  const pads = new Set(Object.values(d.town.spots).map((s) => s.y - 1));
  t.check(pads.size > 1, `more than one pad height (${[...pads].join(", ")})`);
  t.check(Object.values(d.town.spots).some((s) => s.lv), "some spots were leveled");
  const regions = Object.values(d.regions);
  const inRegion = (x, z) => regions.some(([x1, z1, x2, z2]) => x >= x1 && x <= x2 && z >= z1 && z <= z2);
  // Nothing outside the regions changed, but for the town's lantern posts (townLife: a fence and a lantern on the
  // ground beside a path; the paths themselves keep the ground's height).
  const posts = new Set();
  for (const v of Object.values(d.life ?? {}))
    for (let i = 0; i + 6 <= v[1].length; i += 6) {
      const r = Math.floor(parseInt(v[1].slice(i, i + 6), 36) / 512);
      posts.add(`${Math.floor(r / 2048) - 1024 + d.town.x},${(r % 2048) - 1024 + d.town.z}`);
    }
  let changed = 0;
  for (const [k, y] of before) {
    const [x, z] = k.split(",").map(Number);
    if (!inRegion(x, z) && !posts.has(k) && top(x, z)?.y !== y) {
      if (changed < 5) t.log(`changed outside: ${k}: ${beforeId.get(k)} at ${y} -> ${top(x, z)?.id} at ${top(x, z)?.y}`);
      changed++;
    }
  }
  t.check(changed === 0, `nothing outside the regions changed (${changed} columns did; ${posts.size} lantern posts left out)`);
  // Each apron (region minus footprint) joins the ground with steps of at most 1, and no column moved more than 3.
  const ground = (x, z) => {
    for (let y = G + 40; y >= G - 3; y--) {
      const id = dim.getBlock({ x, y, z })?.typeId;
      if (id === "minecraft:grass_block" || id === "minecraft:dirt") return y;
    }
  };
  for (const [id, [x1, z1, x2, z2]] of Object.entries(d.regions)) {
    for (let x = x1; x <= x2; x++)
      for (let z = z1; z <= z2; z++) {
        const edge = x === x1 || x === x2 || z === z1 || z === z2;
        if (!edge) continue;
        const g = ground(x, z);
        t.check(Math.abs(g - before.get(`${x},${z}`)) <= 3, `${id}: at most 3 at ${x},${z}`);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx >= x1 && nx <= x2 && nz >= z1 && nz <= z2) continue;
          if (inRegion(nx, nz)) continue;
          const changedHere = g !== before.get(`${x},${z}`);
          if (changedHere) t.check(Math.abs(g - ground(nx, nz)) <= 1, `${id}: the apron joins the ground at ${x},${z} (${g} vs ${ground(nx, nz)})`);
        }
      }
  }
}
