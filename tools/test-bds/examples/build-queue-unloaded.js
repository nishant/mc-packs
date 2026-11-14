// Easy Building: blocks a survival player paid for are never lost to unloaded chunks (BSE-12). A test copy of build_bp
// gets tools/test-bds/hooks/build-place-probe.js, which hands the unchanged placeBlocks a 100-block row 2,000 blocks
// away. The suite runs these:
//   mkdir -p /tmp/bqu && rm -rf /tmp/bqu/build_bp /tmp/bqu/build_rp && cp -r packs/build_bp packs/build_rp /tmp/bqu/
//   cat tools/test-bds/hooks/build-place-probe.js >> /tmp/bqu/build_bp/scripts/main.js
//   node tools/test-bds/run.mjs --quiet --flat --packs /tmp/bqu --only build_bp,build_rp --scenario tools/test-bds/examples/build-queue-unloaded.js --timeout 600
// The world's ticking areas are all taken while the row is charged and queued, so no chunk loader can be added for 15 s;
// then they are freed. Before the fix every queued block was dropped after 200 tries (10 s) with no refund: nothing
// was placed and the 100 stone were gone. Now a block waits up to a minute for a loader, is placed once it can be,
// and is handed back if it is finally given up: placed + stone left = what the player had.
export default async function (t) {
  const { ItemStack } = t.mc;
  await t.loadArea(0, 0, { radius: 2 });
  const p = await t.player("Queuer", { x: 0, z: 0, gameMode: "survival", op: true });
  const inv = p.getComponent("minecraft:inventory").container;
  const stone = () => {
    let n = 0;
    for (let i = 0; i < inv.size; i++) { const it = inv.getItem(i); if (it?.typeId === "minecraft:stone") n += it.amount; }
    return n;
  };
  for (let i = 0; i < 3; i++) inv.setItem(i, new ItemStack("minecraft:stone", 64));
  const had = stone();
  const y = Math.floor(p.location.y);
  const from = { x: 2000, y, z: 0 };
  const LENGTH = 100;
  const ow = t.world.getDimension("minecraft:overworld");

  // Take every free ticking area (the world allows 10; the harness holds one).
  const fillers = [];
  for (let i = 0; i < 12; i++) {
    const name = `bqufill${i}`;
    let ok = false;
    try { ok = (ow.runCommand(`tickingarea add circle ${i * 3} ${y} 0 1 ${name}`)?.successCount ?? 0) > 0; } catch { ok = false; }
    if (!ok) break;
    fillers.push(name);
  }
  t.log(`took ${fillers.length} free ticking areas`);

  let report;
  const sub = t.system.afterEvents.scriptEventReceive.subscribe((e) => {
    if (e.id === "realm:build_place_test_report") report = JSON.parse(e.message);
  }, { namespaces: ["realm"] });
  t.system.sendScriptEvent("realm:build_place_test", JSON.stringify({ player: p.id, from, length: LENGTH, typeId: "minecraft:stone" }));
  await t.waitUntil(() => report, { timeout: 60, message: "placeBlocks report" });
  t.system.afterEvents.scriptEventReceive.unsubscribe(sub);
  t.log(`placeBlocks took ${report.placed} cells; stone ${had} -> ${stone()}`);
  t.assert(report.placed === LENGTH, `the whole row was accepted (${report.placed})`);
  t.check(stone() === had - LENGTH, `the player was charged for the row (${had - stone()})`);

  // 15 s with no loader possible, then free the areas again.
  await t.wait(300);
  for (const name of fillers) { try { ow.runCommand(`tickingarea remove ${name}`); } catch {} }
  t.log(`stone after 15 s without a loader: ${stone()}`);

  // Wait for the queue to place the row (or give it up), then look at the row.
  await t.wait(800);
  await t.loadArea(from.x + LENGTH / 2, 0, { radius: 4 });
  let placed = 0;
  for (let i = 0; i < LENGTH; i++) {
    try { if (ow.getBlock({ x: from.x + i, y, z: 0 })?.typeId === "minecraft:stone") placed++; } catch {}
  }
  const left = stone();
  t.log(`row: ${placed} of ${LENGTH} placed; stone left ${left} of ${had}`);
  t.check(placed + left === had, `every charged block was placed or handed back (${placed} placed + ${left} left, had ${had})`);
  t.check(placed === LENGTH, `the row was placed once a chunk loader could be added (${placed} of ${LENGTH})`);
}
