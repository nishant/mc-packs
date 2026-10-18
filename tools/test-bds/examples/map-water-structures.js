// Native water, material and sub-four-block structure regressions. No client pixels are asserted.
// node tools/test-bds/run.mjs --flat --strict --only map_bp,hud_rp --scenario tools/test-bds/examples/map-water-structures.js --timeout 600
const g = (n) => String.fromCodePoint(0xf300 + n);
const WATER = [g(0xa9), g(0xb5), g(0xb6)];
const PATH = [g(0xb0), g(0xbd), g(0xbe)];
const SAND = [g(0xaa), g(0xb7), g(0xb8)];
const BRICK = [g(0xc9), g(0xce), g(0xcf)];

export default async function (t) {
  const dim = t.dimension;
  await t.server("/gamerule domobspawning false");
  await t.loadArea(0, 0);
  await t.server("/fill -24 -60 -24 24 -48 24 air");
  await t.server("/fill -24 -47 -24 24 -40 24 air");
  await t.server("/fill -28 -61 -28 28 -61 28 sand");
  await t.server("/fill -20 -60 -20 -5 -60 20 water");
  await t.server("/fill 5 -60 -20 20 -56 20 water");
  await t.server("/fill 5 -60 5 8 -50 8 water");
  await t.server("/fill -20 -54 -3 -5 -54 -1 oak_planks");
  await t.server("/fill 5 -52 -3 20 -52 -1 sandstone");
  await t.server("/setblock 2 -50 2 oak_slab");
  await t.server("/setblock 3 -48 2 brick_block");
  await t.server("/setblock 10 -56 10 seagrass");
  await t.server("/setblock 18 -56 10 kelp");
  await t.server("/setblock 14 -56 10 oak_slab");
  dim.getBlock({ x: 14, y: -56, z: 10 }).setWaterlogged(true);
  await t.server("/fill 8 -50 12 20 -50 16 stone");
  await t.server("/fill 8 -49 12 20 -48 12 stone");
  await t.server("/fill 8 -49 16 20 -48 16 stone");
  await t.server("/fill 8 -49 12 8 -48 16 stone");
  await t.server("/setblock 9 -49 14 flowing_water");
  await t.server("/fill 0 -45 0 3 -45 0 glass");
  await t.server("/fill 16 -57 16 20 -45 20 air");
  await t.server("/fill 16 -58 16 20 -58 20 stone");
  await t.server("/fill 16 -44 16 20 -44 20 brick_block");
  await t.server("/fill -12 -58 -12 -8 -58 -8 farmland");
  await t.server('/setblock -10 -57 -10 wheat ["growth"=7]');
  await t.server("/fill -16 -58 -12 -13 -58 -8 grass_path");
  await t.server('/fill -20 -54 -12 -17 -54 -8 oak_leaves ["persistent_bit"=true]');
  const flowering = ["minecraft:flowering_azalea_leaves", "minecraft:azalea_leaves_flowered"].find((id) => {
    try { t.mc.BlockPermutation.resolve(id); return true; } catch { return false; }
  });
  t.assert(flowering, "native flowering-azalea block type exists");
  for (const [x, id] of [[-3, "minecraft:azalea_leaves"], [-5, flowering]]) {
    dim.getBlock({ x, y: 80, z: 2 }).setPermutation(t.mc.BlockPermutation.resolve(id, { persistent_bit: true }));
    t.log(`native canopy ${id} at ${x},80,2`);
  }
  await t.waitUntil(() => Number(dim.getBlock({ x: 14, y: -49, z: 14 }).permutation.getState("liquid_depth")) > 0, { timeout: 120, message: "flowing-water front reaches the native sample" });
  const p = await t.player("River", { op: true, gameMode: "creative", x: 0.1, y: -44, z: 0.1 });

  for (const [name, x, z] of [["shallow", -10, 10], ["deep", 8, 10], ["bridge", -10, -2], ["sandstone roof", 10, -2], ["thin lower", 2, 2], ["thin upper", 3, 2], ["seagrass", 10, 10], ["kelp", 18, 10], ["waterlogged slab", 14, 10], ["flowing water", 14, 14]]) {
    const top = dim.getTopmostBlock({ x, z });
    const hit = dim.getBlockFromRay({ x: x + 0.5, y: 319, z: z + 0.5 }, { x: 0, y: -1, z: 0 }, { includeLiquidBlocks: true, includePassableBlocks: true, maxDistance: 383 });
    t.log(`${name}: top=${top?.typeId}@${top?.y}; fluidRay=${hit?.block.typeId}@${hit?.block.y}; depthState=${hit?.block.permutation.getState("liquid_depth")}`);
    if (name === "flowing water") t.check(Number(hit?.block.permutation.getState("liquid_depth")) > 0, "native flowing-water fixture has a non-source liquid depth");
  }

  let state;
  t.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "realm:map_state") state = JSON.parse(message);
  }, { namespaces: ["realm"] });
  const radar = async (viewer = p, samples = [{ x: 2, z: 2, resolution: 1 }, { x: 3, z: 2, resolution: 1 }, { x: 18, z: 18 }, { x: 2, z: 0, resolution: 1 }]) => {
    state = undefined;
    t.system.sendScriptEvent("realm:map_debug", JSON.stringify({ player: viewer.id, action: "state", samples }));
    await t.waitUntil(() => state, { timeout: 30, message: "map state" });
    return (state.radar ?? "").replace(/\n/g, "");
  };
  p.teleport({ x: 0.1, y: -44, z: 0.1 }, { rotation: { x: 0, y: 180 } });
  await t.wait(100);
  const cells = await radar();
  const at = (c, r) => cells[(r + 10) * 21 + c + 10];
  t.check(WATER.includes(at(-4, 4)), "shallow water over sand emits a blue water glyph");
  t.check(WATER.includes(at(3, 4)), "deep water over sand emits a blue water glyph");
  t.check(PATH.includes(at(-4, -1)), "wooden bridge shows its visible roof, not water or sand");
  t.check(!SAND.includes(at(4, -1)), "sandstone roof is not natural beach sand");
  t.check(PATH.includes(at(1, 1)), "one-block slab roof is sampled at its own world column");
  t.check(WATER.includes(at(4, 4)), "water plants retain their water surface");
  t.check(WATER.includes(at(7, 4)), "kelp retains its water surface");
  t.check(PATH.includes(at(6, 4)), "waterlogged slab keeps the visible built material");
  t.check(WATER.includes(at(6, 6)), "flowing water emits a water glyph");
  t.check(at(-4, -4) === g(0xd3), "native crop rows use their own green/gold field palette");
  t.check(PATH.includes(at(-6, -4)), "native dirt path is distinct from the field");
  t.check([g(0xad), g(0xb3), g(0xb4)].includes(at(-8, -4)), "visible tree canopy retains the forest palette");
  await radar(p, [{ x: -3, z: 2, resolution: 1 }, { x: -5, z: 2, resolution: 1 }]);
  t.check(state.terrain.samples.every((s) => s.data?.kind === "birch" && s.data.y === 80), "native flowering and ordinary azalea preserve their paired canopy material and height80");
  p.teleport({ x: 1.1, y: -44, z: 0.1 }, { rotation: { x: 0, y: 180 } });
  await t.wait(60);
  const next = await radar();
  t.log(`thin samples ${JSON.stringify(state.terrain)}; pos=${JSON.stringify(p.location)}; nextGlyph=${next[11 * 21 + 11]?.codePointAt(0).toString(16)}`);
  t.check(BRICK.includes(next[11 * 21 + 11]), "neighboring higher brick roof does not alias the slab within the same old 4x4 cache cell");
  t.check(next[11 * 21 + 11] === g(0xcf), "two-block higher brick roof receives real elevation highlight");
  const samples = state.terrain.samples;
  t.check(samples[0].data.y === -50 && samples[1].data.y === -48, "separate roof heights survive caching");
  const caver = await t.player("UnderRoof", { op: true, gameMode: "creative", x: 18.5, y: -57, z: 18.5 });
  await t.wait(80);
  await radar(caver);
  t.check(state.terrain.store.includes("|layer"), "roofed second viewer uses an isolated cave layer");
  await radar();
  t.check(state.terrain.store.endsWith("|surface") && state.terrain.samples[2].data.kind === "brick", "second viewer's cave floor cannot overwrite the surface roof");
  const diver = await t.player("RiverDiver", { op: true, gameMode: "creative", x: 6.5, y: -59, z: 6.5 });
  await t.wait(12);
  await radar(diver);
  t.check(state.terrain.store.endsWith("|surface"), "a deep fluid surface is not mistaken for a solid cave roof");
  diver.disconnect();
  t.check(state.cost.scanPeak <= 96 && state.cost.scanEachPeak <= 48 && state.cost.scanReads > 0, "all real terrain queries, roof probes and water depth reads share the unchanged 96/48 operation budget");

  p.teleport({ x: 0.1, y: -44, z: 0.1 }, { rotation: { x: 0, y: 180 } });
  p.giveItem(new t.mc.ItemStack("minecraft:brick_block", 1), true);
  p.lookAtBlock({ x: 2, y: -45, z: 0 });
  p.useItemInSlotOnBlock(p.selectedSlotIndex, { x: 2, y: -45, z: 0 }, t.mc.Direction.Up);
  await t.waitUntil(() => dim.getBlock({ x: 2, y: -44, z: 0 }).typeId === "minecraft:brick_block", { timeout: 40, message: "native roof placement" });
  p.teleport({ x: 0.1, y: -44, z: 0.1 }, { rotation: { x: 0, y: 180 } });
  await t.wait(30);
  const placed = await radar();
  t.check(BRICK.includes(placed[10 * 21 + 11]), "native placement invalidates and redraws the exact roof column");
  p.breakBlock({ x: 2, y: -44, z: 0 });
  await t.waitUntil(() => dim.getBlock({ x: 2, y: -44, z: 0 }).isAir, { timeout: 40, message: "native roof removal" });
  p.teleport({ x: 0.1, y: -44, z: 0.1 }, { rotation: { x: 0, y: 180 } });
  await t.wait(30);
  const removed = await radar();
  t.check(PATH.includes(removed[10 * 21 + 11]), "native removal redraws the underlying glass surface");
  const send = (id, m) => t.system.sendScriptEvent(id, JSON.stringify(m));
  send("realm:track", { player: p.id, label: "Roof ridge", dim: "minecraft:overworld", x: 20, z: 0 });
  send("realm:atlas_region", { player: p.id, name: "River fixture" });
  p.teleport({ x: 0.1, y: -44, z: 0.1 }, { rotation: { x: 0, y: 270 } });
  await t.wait(20);
  const east = await radar();
  t.check(state.strip[12] === g(0x14), "compass destination bearing is straight ahead when facing east");
  const star = east.indexOf(g(0x34));
  t.check(star >= 0 && Math.floor(star / 21) < 10 && Math.abs(star % 21 - 10) <= 1, "radar shares the same eastward destination and heading");
  t.check(state.pose?.heading === 90 && state.target?.x === 20 && state.target?.dim === state.pose?.dim, "compass and radar share one emitted pose and destination snapshot");
  t.check(state.line2.includes("River fixture"), "shared compass readout retains the region contract");
  p.teleport({ x: 0.1, y: -20, z: 0.1 }, { rotation: { x: 0, y: 270 } });
  await t.wait(3);
  await radar();
  t.check(state.strip[12] === g(0x14) && state.pose?.y > -30, "vertical flight retains heading/target while refreshing the shared height");
  caver.teleport({ x: 18.5, y: -40, z: 18.5 });
  await t.wait(20);
  await radar(caver);
  t.check(state.terrain.store.endsWith("|surface"), "rising above the roof immediately selects the surface instead of the cave");
  caver.teleport({ x: 18.5, y: -57, z: 18.5 });
  await t.wait(20);
  await radar(caver);
  t.check(state.terrain.store.includes("|layer"), "descending under the roof restores the isolated cave");
  t.assert(t.cmd(p, "/realm:compass").ok, "compass toggle runs");
  await t.wait(20);
  await radar();
  t.check(state.strip === "" && state.radar.length > 0, "compass off leaves radar independent");
  t.assert(t.cmd(p, "/realm:compass").ok && t.cmd(p, "/realm:minimap").ok, "independent toggles run");
  await t.wait(20);
  await radar();
  t.check(state.strip.length > 0 && state.radar === "", "radar off leaves compass independent");
  t.assert(t.cmd(p, "/realm:minimap").ok, "radar re-enabled");
  const nether = t.world.getDimension("nether");
  nether.runCommand("tickingarea add circle 0 100 0 2 map_fixture_nether");
  await t.wait(20);
  p.teleport({ x: 0.5, y: 100, z: 0.5 }, { dimension: nether, rotation: { x: 0, y: 270 } });
  await t.wait(30);
  await radar();
  t.check(state.pose?.dim === nether.id && state.strip[12] === g(0x04), "dimension change refreshes the shared pose and east compass heading");
  t.check(!state.radar.includes(g(0x34)) && state.line2.includes("Overworld"), "off-dimension destination is described, not plotted on the wrong radar");
  p.teleport({ x: 2000.5, y: 100, z: 2000.5 }, { dimension: dim, rotation: { x: 0, y: 270 } });
  await t.wait(12); // The dimension/marker pass is ten ticks; do not inspect the previous dimension's text.
  const unloaded = await radar();
  t.check(state.terrain.misses > 0 && unloaded.includes(g(0x38)), "unloaded native columns remain unknown and pending, not made-up ground");
  await t.loadArea(2000, 2000);
  // Failed reads are tried again every few ticks and the scanner and the radar keep to their time budgets, so the
  // whole picture is back within two seconds of the area loading.
  await t.wait(40);
  const loaded = await radar();
  t.check(!loaded.includes(g(0x38)), "pending native misses recover promptly after the area loads");
  t.log(`operation peaks total=${state.cost.scanPeak} each=${state.cost.scanEachPeak}`);
  t.log(`river glyphs shallow=${at(-4, 4)?.codePointAt(0).toString(16)} deep=${at(3, 4)?.codePointAt(0).toString(16)} roof=${at(4, -1)?.codePointAt(0).toString(16)}`);
}
