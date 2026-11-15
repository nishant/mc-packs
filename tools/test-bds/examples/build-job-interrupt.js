// Easy Building: a build that spans ticks and is interrupted (C17, W7a). A test copy of build_bp gets
// tools/test-bds/hooks/build-place-probe.js, which hands the unchanged placeBlocks a box and can send the player to the
// Nether or kill them in the same tick. The suite runs these:
//   mkdir -p /tmp/bji && rm -rf /tmp/bji/build_bp /tmp/bji/build_rp && cp -r packs/build_bp packs/build_rp /tmp/bji/
//   cat tools/test-bds/hooks/build-place-probe.js >> /tmp/bji/build_bp/scripts/main.js
//   node tools/test-bds/run.mjs --quiet --flat --packs /tmp/bji --only build_bp,build_rp --scenario tools/test-bds/examples/build-job-interrupt.js --timeout 900
// 1. Dimension change while a 16,000-block build is being read: nothing is built in either dimension and there is
//    nothing to undo.
// 2. Undo while a 16,000-block build is being written (64 a tick): the undo stops the rest of the writes, so the box
//    ends empty (before, the remaining writes went on after the undo and left most of the box built); redo builds it
//    all, a second undo empties it again.
// 3. Survival, undo while a 60-block row is written: every stone comes back (written ones by the undo, unwritten ones by the
//    stopped writes) and none stays in the world.
// 4. Survival, death while a 2,000-block build is being read: nothing is charged or built.
export default async function (t) {
  const { ItemStack, GameMode } = t.mc;
  await t.loadArea(20, 20, { radius: 4 });
  const p = await t.player("Interrupter", { x: 0, z: 0, gameMode: "creative", op: true });
  const ow = t.world.getDimension("minecraft:overworld");
  const inv = p.getComponent("minecraft:inventory").container;
  const Y = Math.floor(p.location.y);
  const stone = () => {
    let n = 0;
    for (let i = 0; i < inv.size; i++) { const it = inv.getItem(i); if (it?.typeId === "minecraft:stone") n += it.amount; }
    return n;
  };
  const countIn = (from, size) => {
    let n = 0;
    for (let x = 0; x < size.x; x++) for (let y = 0; y < size.y; y++) for (let z = 0; z < size.z; z++) {
      try { if (ow.getBlock({ x: from.x + x, y: from.y + y, z: from.z + z })?.typeId === "minecraft:stone") n++; } catch {}
    }
    return n;
  };
  let report;
  t.system.afterEvents.scriptEventReceive.subscribe((e) => {
    if (e.id === "realm:build_place_test_report") report = JSON.parse(e.message);
  }, { namespaces: ["realm"] });
  const build = async (from, size, then) => {
    report = undefined;
    t.system.sendScriptEvent("realm:build_place_test", JSON.stringify({ player: p.id, from, size, typeId: "minecraft:stone", then }));
    return (await t.waitUntil(() => report, { timeout: 600, message: "placeBlocks report" })).placed;
  };
  const undoBar = async (cmd) => {
    const since = t.tick;
    t.assert(t.cmd(p, cmd).ok, `${cmd} ran`);
    const m = await t.waitMessage(p, /eb\.(undo|redo)\./, { since, kind: "actionbar", pack: "build_bp", timeout: 600 });
    return m.plain;
  };

  // 1. Dimension change while reading.
  const boxA = { x: 5, y: Y, z: 5 }, sizeA = { x: 40, y: 10, z: 40 };
  const placedA = await build(boxA, sizeA, "nether");
  await t.wait(80);
  const inBoxA = countIn(boxA, sizeA);
  t.log(`1. dimension change while reading: placeBlocks took ${placedA}, ${inBoxA} stone in the box`);
  t.check(placedA === 0 && inBoxA === 0, `a build interrupted by a dimension change while it is read builds nothing (${placedA} taken, ${inBoxA} built)`);
  p.teleport({ x: 0.5, y: Y, z: 0.5 }, { dimension: ow });
  await t.wait(20);
  const nothing = await undoBar("/realm:build_undo");
  t.check(/undo\.nothing/.test(nothing), `and leaves nothing to undo (${nothing})`);

  // 2. Undo while writing, then redo and undo again.
  const placedB = await build(boxA, sizeA);
  t.assert(placedB === 16000, `the 40x10x40 box was accepted (${placedB})`);
  await t.wait(40);
  const before = countIn(boxA, sizeA);
  await undoBar("/realm:build_undo");
  await t.wait(400);
  const afterUndo = countIn(boxA, sizeA);
  t.log(`2. undo while writing: ${before} written when undone, ${afterUndo} left 20 s later`);
  t.check(before > 0 && before < 16000, `the undo came while the box was being written (${before} of 16000)`);
  t.check(afterUndo === 0, `undo while the build is still written empties the box for good (${afterUndo} left)`);
  await undoBar("/realm:build_redo");
  await t.waitUntil(() => countIn(boxA, { x: 40, y: 1, z: 40 }) === 1600 && ow.getBlock({ x: 44, y: Y + 9, z: 44 })?.typeId === "minecraft:stone",
    { timeout: 1200, interval: 20, message: "the redo is written" });
  await t.wait(40);
  const afterRedo = countIn(boxA, sizeA);
  t.check(afterRedo === 16000, `redo builds the whole box (${afterRedo})`);
  await undoBar("/realm:build_undo");
  await t.wait(500);
  t.check(countIn(boxA, sizeA) === 0, `a second undo empties it again (${countIn(boxA, sizeA)} left)`);

  // 3. Survival: undo while a row is written; every stone comes back.
  p.setGameMode(GameMode.Survival);
  for (let i = 0; i < inv.size; i++) inv.setItem(i, undefined);
  for (let i = 0; i < 3; i++) inv.setItem(i, new ItemStack("minecraft:stone", 64));
  const had = stone();
  const row = { x: 50, y: Y, z: -10 }, rowSize = { x: 1, y: 1, z: 60 };
  const placedC = await build(row, rowSize);
  t.assert(placedC === 60, `the 60-block row was accepted (${placedC})`);
  await t.wait(3);
  await undoBar("/realm:build_undo");
  await t.wait(200);
  const rowLeft = countIn(row, rowSize);
  t.log(`3. survival undo while writing: ${rowLeft} stone left in the row, ${stone()} of ${had} in the inventory`);
  t.check(rowLeft === 0, `no stone stays in the world after the undo (${rowLeft})`);
  t.check(stone() === had, `every stone came back (${stone()} of ${had})`);

  // 4. Survival: death while reading.
  for (let i = 0; i < inv.size; i++) inv.setItem(i, new ItemStack("minecraft:stone", 64));
  const boxD = { x: 55, y: Y, z: 0 }, sizeD = { x: 20, y: 5, z: 20 };
  const placedD = await build(boxD, sizeD, "kill");
  await t.wait(40);
  try { p.respawn(); } catch {}
  await t.wait(40);
  const inBoxD = countIn(boxD, sizeD);
  t.log(`4. death while reading: placeBlocks took ${placedD}, ${inBoxD} built`);
  t.check(placedD === 0 && inBoxD === 0, `a build interrupted by death while it is read builds nothing (${placedD} taken, ${inBoxD} built)`);
}
