// Native water, material and sub-four-block structure regressions. No client pixels are asserted.
// node tools/test-bds/run.mjs --flat --strict --only map_bp,hud_rp --scenario tools/test-bds/examples/map-water-structures.js --timeout 600
// ADAPTED to the native radar but NOT RUN (CI pending). The radar is a 33x33 grid (797-cell circle, 2.25 blocks a cell, FOV 36, F4/F5
// palette glyphs), north up by default, and the canonical column is the 2-block anchor sampleCoord(v, 2) = floor(v / 2) * 2 + 1
// (always ODD): there is no fine 1-block detail, so every fixture below sits on its own distinct odd anchor and the probes
// request those odd coordinates, so the block actually under test (and no neighbor) is read. Raw samples come from
// realm:map_debug "detail_raw" (default resolution 2): { x, z, kind, y, depth, palette, valid, source }. Native OW viewers under a roof
// or diving use the shared SURFACE store (the old private cave layer is gone). Radar cells are only compared against the real
// F4/F5 glyph of the sample's actual `palette` (water shaded by its depth); no world tint RGB is guessed.
const g = (n) => String.fromCodePoint(0xf300 + n);
const sc = (v) => Math.floor(v / 2) * 2 + 1; // terrain.sampleCoord(v, 2)
// Pasted from map_bp purepalette.js / glyphs.js paletteGlyph (scenarios can't import): the glyph a native palette index draws as.
const shadeIndex = (index, d) => {
  const step = Math.max(-1, Math.min(1, d));
  const c = (v) => Math.max(0, Math.min(7, v + step));
  return (c((index >> 6) & 7) << 6) | (c((index >> 3) & 7) << 3) | c(index & 7);
};
const paletteGlyph = (index) => String.fromCharCode(0xf400 + index);
const isNativeGlyph = (ch) => ch !== undefined && ch.charCodeAt(0) >= 0xf400 && ch.charCodeAt(0) < 0xf600;
const EMPTY = g(0x38);
/** The F6-F8 overlay form of a legacy F3 marker (slot = its index in the 48-marker page): the plain glyph or its background-matched variant. */
const isMarker = (ch, legacy, slot) => ch === legacy || (ch !== undefined && ch.charCodeAt(0) >= 0xf600 && ch.charCodeAt(0) < 0xf900 && (ch.charCodeAt(0) - 0xf600) % 48 === slot);
// Bounded realm:map_state packets arrive as {player,channel:'state',v:1,chunk:{id,index,total,text}}; join them inline (test packs cannot import runtime modules).
const mapStateParts = new Map();
function reassembleMapState(message, now = 0) {
  for (const [k, e] of mapStateParts) if (now - e.at > 200) mapStateParts.delete(k);
  const d = JSON.parse(message),
    c = d && d.chunk;
  if (!c) return d;
  if (d.channel !== "state" || d.v !== 1 || !Number.isInteger(c.total) || c.total < 1 || c.total > 12 || !Number.isInteger(c.index) || c.index < 0 || c.index >= c.total || typeof c.text !== "string") throw Error("bad map state packet");
  const key = `${d.player ?? ""}:${c.id}`;
  let e = mapStateParts.get(key);
  if (!e) {
    if (mapStateParts.size >= 16) mapStateParts.delete(mapStateParts.keys().next().value);
    e = { total: c.total, parts: new Array(c.total), got: 0, at: now };
    mapStateParts.set(key, e);
  }
  if (e.total !== c.total || e.parts[c.index] !== undefined) {
    mapStateParts.delete(key);
    throw Error("bad map state packet");
  }
  e.parts[c.index] = c.text;
  if (++e.got < e.total) return undefined;
  mapStateParts.delete(key);
  return JSON.parse(e.parts.join(""));
}

// Fixtures: [name, anchor x, anchor z, kind, y, depth?] - every anchor is odd, distinct, and a column the 33x33 radar actually draws
// from a viewer standing at block (0, 0) (2.25-block cells skip some anchors such as -19, -1, 17).
const FIX = [
  ["shallow water", -9, 11, "water", -60, 1],
  ["deep water", 9, 11, "water", -56, 3],
  ["wooden bridge", -9, -3, "path", -54],
  ["sandstone roof", 11, -3, "sandstone", -52],
  ["thin slab roof", 1, 3, "path", -50],
  ["thin brick roof", 3, 3, "brick", -48],
  ["seagrass", 11, 11, "water", -56, 3],
  ["waterlogged slab", 15, 11, "path", -56],
  ["kelp", 19, 11, "water", -56, 3],
  ["flowing water", 15, 15, "water", -49, 1],
  ["crop", -9, -9, "crop", -57],
  ["dirt path", -15, -9, "path", -58],
  ["tree canopy", -17, -9, "forest", -54],
].map(([name, x, z, kind, y, depth]) => ({ name, x, z, kind, y, depth }));

export default async function (t) {
  // These checks describe the Minimap with the time it had before its 1 ms budget (October 2026): budgetLevel high
  // gives it exactly those budgets, the same code with more time a tick. Its cost at normal is perf-soak's to measure.
  await mapBudgetHigh(t);
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
  // Thin roofs on two DISTINCT canonical anchors (1,3) and (3,3); the 2-block cache can't tell blocks x=2 from x=3 apart.
  await t.server("/setblock 1 -50 3 oak_slab");
  await t.server("/setblock 3 -48 3 brick_block");
  await t.server("/setblock 11 -56 11 seagrass");
  await t.server("/setblock 19 -56 11 kelp");
  await t.server("/setblock 15 -56 11 oak_slab");
  dim.getBlock({ x: 15, y: -56, z: 11 }).setWaterlogged(true);
  await t.server("/fill 8 -50 12 20 -50 16 stone");
  await t.server("/fill 8 -49 12 20 -48 12 stone");
  await t.server("/fill 8 -49 16 20 -48 16 stone");
  await t.server("/fill 8 -49 12 8 -48 16 stone");
  await t.server("/setblock 10 -49 15 flowing_water");
  await t.server("/fill 0 -45 0 3 -45 1 glass"); // covers anchor (3,1) for the placement/removal check below
  await t.server("/fill 16 -57 16 20 -45 20 air");
  await t.server("/fill 16 -58 16 20 -58 20 stone");
  await t.server("/fill 16 -44 16 20 -44 20 brick_block");
  await t.server("/fill -12 -58 -12 -8 -58 -8 farmland");
  await t.server('/setblock -9 -57 -9 wheat ["growth"=7]');
  await t.server("/fill -16 -58 -12 -13 -58 -8 grass_path");
  await t.server('/fill -20 -54 -12 -17 -54 -8 oak_leaves ["persistent_bit"=true]');
  const flowering = ["minecraft:flowering_azalea_leaves", "minecraft:azalea_leaves_flowered"].find((id) => {
    try { t.mc.BlockPermutation.resolve(id); return true; } catch { return false; }
  });
  t.assert(flowering, "native flowering-azalea block type exists");
  // z = 3 is the canonical anchor row of these columns (a block at z = 2 would be read as anchor z = 3).
  for (const [x, id] of [[-3, "minecraft:azalea_leaves"], [-5, flowering]]) {
    dim.getBlock({ x, y: 80, z: 3 }).setPermutation(t.mc.BlockPermutation.resolve(id, { persistent_bit: true }));
    t.log(`native canopy ${id} at ${x},80,3`);
  }
  await t.waitUntil(() => Number(dim.getBlock({ x: 15, y: -49, z: 15 }).permutation.getState("liquid_depth")) > 0, { timeout: 120, message: "flowing-water front reaches the native sample" });
  const p = await t.player("River", { op: true, gameMode: "creative", x: 0.1, y: -44, z: 0.1 });

  for (const f of FIX) {
    const top = dim.getTopmostBlock({ x: f.x, z: f.z });
    const hit = dim.getBlockFromRay({ x: f.x + 0.5, y: 319, z: f.z + 0.5 }, { x: 0, y: -1, z: 0 }, { includeLiquidBlocks: true, includePassableBlocks: true, maxDistance: 383 });
    t.log(`${f.name}: top=${top?.typeId}@${top?.y}; fluidRay=${hit?.block.typeId}@${hit?.block.y}; depthState=${hit?.block.permutation.getState("liquid_depth")}`);
    if (f.name === "flowing water") t.check(Number(hit?.block.permutation.getState("liquid_depth")) > 0, "native flowing-water fixture has a non-source liquid depth");
  }

  let state;
  let rawState;
  const acks = [];
  t.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "realm:map_state") {
      try {
        const m = reassembleMapState(message, t.system.currentTick);
        if (m === undefined) return;
        if (Array.isArray(m.samples) && m.profile && !m.terrain) rawState = m; // a detail_raw reply
        else state = m;
      } catch {}
    }
    if (id === "realm:cfg_ack") try { acks.push(JSON.parse(message)); } catch {}
  }, { namespaces: ["realm"] });
  const radar = async (viewer = p) => {
    state = undefined;
    t.system.sendScriptEvent("realm:map_debug", JSON.stringify({ player: viewer.id, action: "state" }));
    await t.waitUntil(() => state && state.player === viewer.id, { timeout: 30, message: "map state" });
    return state.radar ?? "";
  };
  /** Up to 4 raw canonical samples (default resolution 2) of the viewer's own store, polled until every one is a valid known column. */
  const raw = async (viewer, points, message, { until = () => true, tries = 60 } = {}) => {
    let last;
    for (let i = 0; i < tries; i++) {
      rawState = undefined;
      t.system.sendScriptEvent("realm:map_debug", JSON.stringify({ player: viewer.id, action: "detail_raw", points }));
      await t.waitUntil(() => rawState && rawState.player === viewer.id, { timeout: 30, message: `detail_raw reply for ${message}` });
      last = rawState;
      if (last.samples.every((s) => s && s.valid === true) && until(last)) return last;
      await t.wait(10);
    }
    t.log(`raw samples at failure: ${JSON.stringify(last)}`);
    t.fail(`${message}: samples never became valid/expected`);
  };
  /** The radar cell (col,row) that draws canonical anchor (ax,az) for a viewer at block (tx,tz), north up, 2.25 blocks a cell. */
  const cellOf = (tx, tz, ax, az) => {
    let col = -1, row = -1;
    for (let i = 0; i < 33 && (col < 0 || row < 0); i++) {
      if (col < 0 && sc(tx + (i - 16) * 2.25) === ax) col = i;
      if (row < 0 && sc(tz + (i - 16) * 2.25) === az) row = i;
    }
    return col >= 0 && row >= 0 ? { col, row } : undefined;
  };
  const glyphOf = (cells, ax, az, tx = 0, tz = 0) => {
    const c = cellOf(tx, tz, ax, az);
    return c ? [...cells.split("\n")[c.row] ?? ""][c.col] : undefined;
  };
  const lines = (cells) => cells.split("\n");

  // The radar defaults OFF: a viewer is not drawn before the explicit per-player opt-in (the opt-in below is the only enabling).
  p.teleport({ x: 0.1, y: -44, z: 0.1 }, { rotation: { x: 0, y: 180 } });
  await t.wait(40);
  t.check((await radar()) === "", "the radar is OFF before the viewer opts in (radarDefault stays false)");
  /** Opt a viewer in AFTER spawn: radar on, terrain colors on, north up (the default); wait for each ACK. */
  const optIn = async (viewer) => {
    for (const [key, value] of [["radar", true], ["terrain", true], ["radarNorthUp", true]]) {
      const id = `water_${viewer.id}_${key}`;
      t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id, pack: "map_bp", key, value, player: viewer.id }));
      const ack = await t.waitUntil(() => acks.find((a) => a.id === id), { timeout: 100, message: `cfg_ack for ${key}` });
      t.check(ack.ok === true, `${viewer.name} ${key} = ${value} acknowledged`);
    }
  };
  await optIn(p);
  await t.wait(60);

  // --- Raw canonical samples of every fixture: kind, height, depth, palette, source, on odd distinct anchors (4 a request).
  const seen = new Map();
  for (let i = 0; i < FIX.length; i += 4) {
    const batch = FIX.slice(i, i + 4);
    const r = await raw(p, batch.map((f) => [f.x, f.z]), `fixtures ${batch.map((f) => f.name).join("/")}`);
    batch.forEach((f, k) => seen.set(f.name, r.samples[k]));
    t.check(r.store.endsWith("|surface"), `fixtures are read in the shared native surface store (${r.store})`);
  }
  for (const f of FIX) {
    const s = seen.get(f.name);
    t.check(Math.abs(s.x) % 2 === 1 && Math.abs(s.z) % 2 === 1 && s.x === f.x && s.z === f.z, `${f.name}: the sample is the odd canonical anchor ${f.x},${f.z} (got ${s.x},${s.z})`);
    t.check(s.valid === true && s.kind === f.kind && s.y === f.y, `${f.name}: kind ${f.kind} at y ${f.y} (got ${s.kind}@${s.y})`);
    if (f.depth !== undefined) t.check(s.depth === f.depth, `${f.name}: water depth ${f.depth} (got ${s.depth})`);
    t.check(Number.isInteger(s.palette) && s.palette >= 0 && s.palette < 512, `${f.name}: a real native palette index 0..511 (got ${s.palette})`);
    t.check(s.source !== "persisted", `${f.name}: read natively this session (source ${s.source})`);
  }
  t.check(seen.get("wooden bridge").kind !== "water" && seen.get("sandstone roof").kind === "sandstone", "the bridge and the sandstone roof show their visible roof, not water or natural sand");
  t.check(seen.get("thin slab roof").x !== seen.get("thin brick roof").x && seen.get("thin slab roof").y === -50 && seen.get("thin brick roof").y === -48, "the slab and the higher brick roof sit on distinct canonical anchors 1 and 3 and keep their own heights (no 1-block detail is claimed)");
  t.check(seen.get("waterlogged slab").kind === "path" && seen.get("waterlogged slab").depth === 0, "waterlogged slab keeps the visible built material, not its water");
  t.check(seen.get("seagrass").kind === "water" && seen.get("kelp").kind === "water" && seen.get("flowing water").kind === "water", "seagrass, kelp and flowing water keep their water surface");
  t.check(seen.get("crop").palette !== undefined && seen.get("dirt path").kind !== seen.get("crop").kind, "native crop rows are a crop column distinct from the dirt path");

  // --- The radar draws each fixture from the actual F4/F5 glyph of its own palette (water shaded by depth; solids by height).
  p.teleport({ x: 0.1, y: -44, z: 0.1 }, { rotation: { x: 0, y: 180 } });
  const cells = await radar();
  t.check(lines(cells).length === 33 && lines(cells).slice(0, 32).every((r) => [...r].length === 33), "the radar is 33 rows of 33 cells");
  for (const f of FIX) {
    const s = seen.get(f.name);
    const ch = glyphOf(cells, f.x, f.z);
    t.check(ch !== undefined, `${f.name}: canonical anchor ${f.x},${f.z} is drawn by a radar cell`);
    if (ch === undefined) continue;
    const shades = f.kind === "water" ? [f.depth <= 1 ? 1 : f.depth >= 3 ? -1 : 0] : [-1, 0, 1];
    t.check(isNativeGlyph(ch) && shades.some((d) => ch === paletteGlyph(shadeIndex(s.palette, d))), `${f.name}: radar cell is the F4/F5 glyph of its native palette ${s.palette} (cell ${ch?.codePointAt(0).toString(16)})`);
  }
  const brickGlyph = glyphOf(cells, 3, 3), slabGlyph = glyphOf(cells, 1, 3);
  t.check(brickGlyph !== undefined && slabGlyph !== undefined && isNativeGlyph(brickGlyph) && isNativeGlyph(slabGlyph), "slab and higher brick roof each draw their own native glyph at their own cells");

  const azaleas = await raw(p, [[-3, 3], [-5, 3]], "azalea canopy");
  t.check(azaleas.samples.every((s) => s.kind === "birch" && s.y === 80), "native flowering and ordinary azalea preserve their paired canopy material and height 80");

  // --- Roofed and diving viewers use the same SURFACE store as the first viewer (native OW under-roof = surface intent).
  const caver = await t.player("UnderRoof", { op: true, gameMode: "creative", x: 18.5, y: -57, z: 18.5 });
  await optIn(caver);
  await t.wait(80);
  let r = await raw(caver, [[19, 19]], "roof seen from underneath");
  t.check(r.store.endsWith("|surface"), `a roofed native viewer is on the shared surface store (${r.store})`);
  t.check(r.samples[0].kind === "brick" && r.samples[0].y === -44 && r.samples[0].valid === true, "the roofed viewer's upper roof sample is valid: brick at y -44");
  r = await raw(p, [[19, 19]], "roof seen by the first viewer");
  t.check(r.store.endsWith("|surface") && r.samples[0].kind === "brick" && r.samples[0].y === -44, "the second viewer's presence under the roof cannot overwrite the surface roof sample");
  const diver = await t.player("RiverDiver", { op: true, gameMode: "creative", x: 6.5, y: -59, z: 6.5 });
  await optIn(diver);
  await t.wait(12);
  r = await raw(diver, [[7, 7]], "deep water seen by the diver");
  t.check(r.store.endsWith("|surface") && r.samples[0].kind === "water", "a diving viewer shares the surface store and sees the water surface, not a solid roof");
  r = await raw(diver, [[19, 19]], "roof seen by the diver");
  t.check(r.store.endsWith("|surface") && r.samples[0].kind === "brick" && r.samples[0].y === -44, "roofed and diving viewers share SURFACE and the upper roof stays valid");
  await radar(diver);
  diver.disconnect();
  // The shared operation ledger counts real native attempts across every viewer: at most 96 together (the per-viewer 48 cap is gone).
  await radar(p);
  t.check(state.cost.scanPeak <= 96 && state.cost.scanReads > 0, `all real terrain queries and water depth reads share the 96-operation ledger (peak ${state.cost.scanPeak}, reads ${state.cost.scanReads})`);

  // --- Native placement and removal on the glass anchor (3,1) (glass fixture covers x 0..3, z 0..1).
  p.teleport({ x: 0.1, y: -44, z: 0.1 }, { rotation: { x: 0, y: 180 } });
  p.giveItem(new t.mc.ItemStack("minecraft:brick_block", 1), true);
  p.lookAtBlock({ x: 3, y: -45, z: 1 });
  p.useItemInSlotOnBlock(p.selectedSlotIndex, { x: 3, y: -45, z: 1 }, t.mc.Direction.Up);
  await t.waitUntil(() => dim.getBlock({ x: 3, y: -44, z: 1 }).typeId === "minecraft:brick_block", { timeout: 40, message: "native roof placement" });
  await raw(p, [[3, 1]], "native placement redraws the exact roof column", { until: (m) => m.samples[0].kind === "brick" && m.samples[0].y === -44, tries: 60 });
  const placed = await radar();
  const placedGlyph = glyphOf(placed, 3, 1);
  t.check(isNativeGlyph(placedGlyph), "native placement draws the anchor with a native palette glyph");
  p.breakBlock({ x: 3, y: -44, z: 1 });
  await t.waitUntil(() => dim.getBlock({ x: 3, y: -44, z: 1 }).isAir, { timeout: 40, message: "native roof removal" });
  await raw(p, [[3, 1]], "native removal redraws the underlying glass surface", { until: (m) => m.samples[0].kind === "path" && m.samples[0].y === -45, tries: 60 });

  // --- Compass and radar share one pose and destination. Radar is north up by default, so an eastward target is due east of the
  // center cell (col 16 + 20 / 2.25 = 25 on row 16) whatever the heading; the compass strip still follows the heading.
  const send = (id, m) => t.system.sendScriptEvent(id, JSON.stringify(m));
  send("realm:track", { player: p.id, label: "Roof ridge", dim: "minecraft:overworld", x: 20, z: 0 });
  send("realm:atlas_region", { player: p.id, name: "River fixture" });
  p.teleport({ x: 0.1, y: -44, z: 0.1 }, { rotation: { x: 0, y: 270 } });
  await t.wait(20);
  const east = await radar();
  t.check(state.pose?.north === true, "the radar keeps north up by default (radarNorthUp)");
  t.check(state.strip[12] === g(0x14), "compass destination bearing is straight ahead when facing east");
  const eastRows = lines(east).map((row) => [...row]);
  let star;
  eastRows.forEach((row, r) => row.forEach((ch, c) => { if (isMarker(ch, g(0x34), 36)) star = { r, c }; }));
  t.check(star && Math.abs(star.r - 16) <= 1 && Math.abs(star.c - 25) <= 1, `radar plots the destination due east on the north-up 33x33 grid (found ${JSON.stringify(star)}, expected row 16 / col 25)`);
  t.check(state.pose?.heading === 90 && state.target?.x === 20 && state.target?.dim === state.pose?.dim, "compass and radar share one emitted pose and destination snapshot");
  t.check(state.line2.includes("River fixture"), "shared compass readout retains the region contract");
  p.teleport({ x: 0.1, y: -20, z: 0.1 }, { rotation: { x: 0, y: 270 } });
  await t.wait(3);
  await radar();
  t.check(state.strip[12] === g(0x14) && state.pose?.y > -30, "vertical flight retains heading/target while refreshing the shared height");
  caver.teleport({ x: 18.5, y: -40, z: 18.5 });
  await t.wait(20);
  r = await raw(caver, [[19, 19]], "roof seen from above");
  t.check(r.store.endsWith("|surface") && r.samples[0].kind === "brick" && r.samples[0].y === -44, "rising above the roof stays on the surface with the same valid roof sample");
  caver.teleport({ x: 18.5, y: -57, z: 18.5 });
  await t.wait(20);
  r = await raw(caver, [[19, 19]], "roof seen again from underneath");
  t.check(r.store.endsWith("|surface") && r.samples[0].kind === "brick" && r.samples[0].y === -44, "descending under the roof still reads the same surface roof (no private cave layer)");
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
  t.check(!state.radar.split("").some((ch) => isMarker(ch, g(0x34), 36)) && state.line2.includes("Overworld"), "off-dimension destination is described, not plotted on the wrong radar");
  p.teleport({ x: 2000.5, y: 100, z: 2000.5 }, { dimension: dim, rotation: { x: 0, y: 270 } });
  await t.wait(12); // The dimension/marker pass is ten ticks; do not inspect the previous dimension's text.
  const unloaded = await radar();
  t.check(state.terrain.misses > 0 && unloaded.includes(EMPTY), "unloaded native columns remain unknown and pending, not made-up ground");
  await t.loadArea(2000, 2000);
  // Failed reads are tried again every few ticks and the scanner and the radar keep to their time budgets, so the
  // whole picture is back within two seconds of the area loading.
  await t.wait(40);
  const loaded = await radar();
  // Whole-string absence of Q_EMPTY is invalid: boundary anchors outside the exact read circle remain unknown by policy.
  // Keep the same40-tick recovery window and require genuine valid samples at four previously unread, eligible anchors.
  const recovered=await raw(p,[[2001,2001],[1993,2001],[2001,1993],[2009,2009]],"loaded-area native retries",{tries:1});
  t.check(recovered.samples.every(d=>d.valid===true&&d.source==="native"),"pending eligible native misses recover promptly after the area loads; no estimate is accepted as acquired terrain");
  await radar();
  t.log(`operation peak total=${state.cost.scanPeak}`);
}

// The Minimap at budgetLevel high (scenarios can't import: pasted where needed).
async function mapBudgetHigh(t) {
  let ack;
  const sub = t.system.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:cfg_ack") return;
      try {
        const m = JSON.parse(message);
        if (m.id === "mapbudget") ack = m;
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "mapbudget", pack: "map_bp", key: "budgetLevel", value: "high" }));
  await t.waitUntil(() => ack, { timeout: 60, message: "budgetLevel high was set" });
  t.system.afterEvents.scriptEventReceive.unsubscribe(sub);
  t.assert(ack.ok, `budgetLevel high: ${ack.error ?? "ok"}`);
}
