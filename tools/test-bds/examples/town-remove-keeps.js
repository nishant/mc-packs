// Town Projects, Remove spot never overwrites a player's block (O79, owner rule F37), even of a kind the build uses:
// only the blocks the build changed go back, and only where they are still what it put there (or air). At a leveled
// automatic spot: a player's dirt on the leveled apron and cobblestone and an oak fence above the well stay, a ring
// stone a player mined gets its ground back, and every other block of the region is restored.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp --scenario tools/test-bds/examples/town-remove-keeps.js --timeout 3000
export default async function (t) {
  const dim = t.dimension;
  const G = -61;
  t.server("/gamerule domobspawning false"); // a flat world's slimes push players about (O80)
  const p = await t.player("Ann", { op: true, x: 0, z: 0, gameMode: "creative" });
  await t.loadArea(0, 0, { radius: 4, whole: true });
  // The slope of town-terrain-restore.js: one block every 3 blocks to the east, so the well's spot is leveled.
  const failed = [];
  const fill = (cmd) => t.server(cmd).ok || failed.push(cmd);
  for (let x = -45; x <= 45; x += 3) {
    const h = Math.max(-2, Math.floor((x + 45) / 3) - 15);
    if (h > 0) fill(`/fill ${x} ${G} -32 ${x + 2} ${G + h} 31 dirt`);
    else if (h < 0) fill(`/fill ${x} ${G + h + 1} -32 ${x + 2} ${G} 31 air`);
    if (h !== 0) fill(`/fill ${x} ${G + h} -32 ${x + 2} ${G + h} 31 grass_block`);
  }
  t.assert(!failed.length, `the slope is built (${failed.length} fills failed: ${failed[0]})`);
  await t.wait(20);
  const town = (action, extra = {}) => t.system.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", town: "keep", ...extra }));
  const dump = async () => {
    await t.wait(1);
    const since = t.tick;
    town("dump");
    return JSON.parse((await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 })).plain);
  };
  p.teleport({ x: 0.5, y: G + 2, z: 0.5 });
  let since = t.tick;
  town("add", { name: "Keep" });
  await t.waitMessage(p, /Town Keep added/, { since, timeout: 60 });
  let d;
  await t.waitUntil(async () => (d = await dump()).town.spots.well, { timeout: 6000, interval: 100, message: "the well's spot" });
  const s = d.town.spots.well;
  t.log("well:", JSON.stringify(s));
  t.check(typeof s.lv === "string" && /[0-6]/.test(s.lv), "a leveled spot");
  const [x1, z1, x2, z2] = d.regions.well;
  const y1 = Math.max(-64, s.y - 7);
  const y2 = s.y + 5;
  const id = (x, y, z) => dim.getBlock({ x, y, z })?.typeId;
  const snap = () => {
    const out = new Map();
    for (let x = x1; x <= x2; x++) for (let z = z1; z <= z2; z++) for (let y = y1; y <= y2; y++) out.set(`${x},${y},${z}`, id(x, y, z));
    return out;
  };
  const before = snap();
  town("finish", { project: "well" });
  await t.waitUntil(async () => (await dump()).progress.find(([pid]) => pid === "well")[1].built === 1, { timeout: 1200, interval: 40, message: "built" });
  const after = snap();
  // The footprint: the blocks the well itself covers (its slab roof, 3 above the spot).
  const roof = [...after].filter(([k, v]) => v === "minecraft:oak_slab").map(([k]) => k.split(",").map(Number));
  t.assert(roof.length === 25, `the well's roof is up (${roof.length} slabs)`);
  const fx = [Math.min(...roof.map((r) => r[0])), Math.max(...roof.map((r) => r[0]))];
  const fz = [Math.min(...roof.map((r) => r[2])), Math.max(...roof.map((r) => r[2]))];
  const inFp = (x, z) => x >= fx[0] && x <= fx[1] && z >= fz[0] && z <= fz[1];
  const AIR = "minecraft:air";
  // A player's blocks, in blocks the build left alone (air before and after).
  /** @type {[number, number, number, string][]} */
  const mine = [];
  // On the apron, right on the ground: first choice where the leveling changed the ground below (a block the plan
  // cuts down to air: a kind the build uses there), else any.
  const free = [];
  for (const [k, v] of after) {
    const [x, y, z] = k.split(",").map(Number);
    if (inFp(x, z) || v !== AIR || y - 1 < y1) continue;
    const below = after.get(`${x},${y - 1},${z}`);
    if (below === AIR || below === undefined) continue;
    free.push({ x, y, z, changed: s.lv.includes("3") && before.get(k) !== AIR ? 2 : before.get(`${x},${y - 1},${z}`) !== below ? 1 : 0 });
  }
  free.sort((a, b) => b.changed - a.changed);
  if (free[0]) mine.push([free[0].x, free[0].y, free[0].z, "dirt"]);
  t.log("apron block:", JSON.stringify(free[0]));
  const top = s.y + 4;
  mine.push([fx[0] + 1, top, fz[0] + 1, "cobblestone"], [fx[0] + 2, top, fz[0] + 2, "oak_fence"]);
  t.assert(mine.length === 3, "a free block on the leveled apron");
  for (const [x, y, z, b] of mine) {
    t.assert(after.get(`${x},${y},${z}`) === AIR, `${x},${y},${z} is free`);
    t.assert(t.server(`/setblock ${x} ${y} ${z} ${b}`).ok, `a player's ${b} at ${x},${y},${z}`);
  }
  // A ring stone of the well a player mined: the ground goes back there.
  const ring = [...after].find(([k, v]) => v === "minecraft:cobblestone" && Number(k.split(",")[1]) === s.y)?.[0].split(",").map(Number);
  t.assert(ring, "a ring stone");
  t.assert(t.server(`/setblock ${ring[0]} ${ring[1]} ${ring[2]} air`).ok, "the ring stone mined");
  t.log("player's blocks:", JSON.stringify(mine), "mined:", ring.join(","));
  await t.wait(5);
  since = t.tick;
  town("remove", { project: "well" });
  await t.waitMessage(p, /taken away/, { since, timeout: 60 });
  await t.wait(5);
  for (const [x, y, z, b] of mine) t.check(id(x, y, z) === `minecraft:${b}`, `the player's ${b} at ${x},${y},${z} stays (${id(x, y, z)})`);
  const skip = new Set(mine.map(([x, y, z]) => `${x},${y},${z}`));
  const left = [];
  for (const [k, v] of before) {
    if (skip.has(k)) continue;
    const now = id(...k.split(",").map(Number));
    if (now !== v) left.push(`${k}: ${v} -> ${now}`);
  }
  if (left.length) t.log("not restored:", left.slice(0, 8).join(" | "));
  t.check(left.length === 0, `every other block of the region is back, the mined ring stone's ground too (${left.length} differ)`);
}
