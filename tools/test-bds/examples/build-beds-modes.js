// O47: beds in every Easy Building shape mode on a real server. Each mode: a real first click sets the bed anchor
// (native useItemInSlotOnBlock), then the unchanged main.confirmPlacement runs through the test-only bridge (once for a
// 2-click mode, twice for a 3-click mode), like build-beds.js. Every bed block that lands must have its other half,
// survival is charged one bed item per bed, and the anchor is used up. Not physical or second-input acceptance.
//   node tools/test-bds/build-beds.mjs --scenario tools/test-bds/examples/build-beds-modes.js
// Optional: --arg modes=line,cube to run a subset.
const ALL = ["line", "wall", "floor", "diagonal_line", "diagonal_wall", "slope_floor", "cube", "circle", "cylinder", "sphere", "semicircle", "cone"];
const THREE = new Set(["diagonal_wall", "slope_floor", "cube", "cylinder", "cone"]);

export default async function (t) {
  const { ItemStack } = t.mc;
  const modes = t.args.modes ? String(t.args.modes).split(",") : ALL;
  await t.loadArea(0, 0, { radius: 3 });
  const p = await t.player("BedModes", { x: 2, z: 2, gameMode: "survival", op: true });
  const dim = p.dimension;
  const floor = Math.floor(p.location.y) - 1;
  const inv = () => p.getComponent("inventory").container;
  const beds = () => {
    const c = inv();
    let n = 0;
    for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === "minecraft:bed") n += c.getItem(i).amount;
    return n;
  };
  const refill = () => {
    const c = inv();
    for (let i = 0; i < c.size; i++) c.setItem(i, new ItemStack("minecraft:bed", 1));
  };
  const waitEvent = async (id, match) => {
    let got;
    const sub = t.system.afterEvents.scriptEventReceive.subscribe((e) => {
      if (e.id !== id) return;
      const m = JSON.parse(e.message);
      if (match(m)) got = m;
    }, { namespaces: ["realm"] });
    try { return await t.waitUntil(() => got, { timeout: 80, message: id }); }
    finally { t.system.afterEvents.scriptEventReceive.unsubscribe(sub); }
  };
  const audit = (box) => {
    let feet = 0, heads = 0;
    const orphans = [];
    const step = { 0: [0, 1], 1: [-1, 0], 2: [0, -1], 3: [1, 0] };
    for (let x = box.x1; x <= box.x2; x++) for (let y = box.y1; y <= box.y2; y++) for (let z = box.z1; z <= box.z2; z++) {
      const b = dim.getBlock({ x, y, z });
      if (b?.typeId !== "minecraft:bed") continue;
      const s = b.permutation.getAllStates();
      const head = s.head_piece_bit === true;
      if (head) heads++; else feet++;
      const [dx, dz] = step[s.direction] ?? [0, 0];
      const sign = head ? -1 : 1;
      const o = dim.getBlock({ x: x + dx * sign, y, z: z + dz * sign });
      const os = o?.typeId === "minecraft:bed" ? o.permutation.getAllStates() : null;
      if (!os || os.head_piece_bit === head || os.direction !== s.direction) orphans.push(`${x},${y},${z}`);
    }
    return { feet, heads, orphans };
  };

  for (let k = 0; k < modes.length; k++) {
    const mode = modes[k];
    const ox = 2 + k * 24;
    await t.loadArea(ox + 6, 6, { radius: 2 });
    t.server(`/fill ${ox - 2} ${floor + 1} -2 ${ox + 14} ${floor + 14} 14 air`);
    t.server(`/fill ${ox - 2} ${floor} -2 ${ox + 14} ${floor} 14 stone`);
    refill();
    p.selectedSlotIndex = 0;
    t.system.sendScriptEvent("realm:build_mode_test", JSON.stringify({ player: p.id, mode }));
    const set = await waitEvent("realm:build_mode_test_report", (m) => m.player === p.id);
    t.assert(set.mode === mode, `${mode}: mode set`);
    p.teleport({ x: ox + 0.5, y: floor + 1, z: -1.5 });
    await t.wait(4);
    const first = { x: ox + 2, y: floor, z: 2 };
    p.lookAtBlock(first);
    const since = t.tick;
    p.useItemInSlotOnBlock(0, first, t.mc.Direction.Up);
    await t.waitMessage(p, /anchor[ _]set/i, { since, kind: "actionbar", timeout: 100 });
    p.stopUsingItem();
    p.stopInteracting();
    t.check(beds() === 36, `${mode}: setting the anchor keeps every bed item`);
    await t.wait(6);
    const confirm = async (fallback) => {
      t.system.sendScriptEvent("realm:build_pipeline_test", JSON.stringify({ player: p.id, mode, fallback }));
      return waitEvent("realm:build_pipeline_test_report", (m) => m.player === p.id);
    };
    const far = { x: ox + 6, y: floor + 1, z: 5 };
    p.lookAtBlock({ x: far.x, y: floor, z: far.z });
    if (THREE.has(mode)) {
      const r = await confirm(far);
      t.assert(r.secondAnchor, `${mode}: the second click locked the footprint`);
      await t.wait(6);
      p.lookAtBlock({ x: far.x, y: floor + 3, z: far.z });
      await confirm({ x: far.x, y: floor + 3, z: far.z });
    } else {
      await confirm(far);
    }
    await t.wait(60);
    const a = audit({ x1: ox - 2, x2: ox + 14, y1: floor + 1, y2: floor + 14, z1: -2, z2: 14 });
    const charged = 36 - beds();
    t.log(`${mode}: ${a.feet} beds, ${a.heads} heads, ${charged} items charged, orphans ${a.orphans.length}`);
    t.check(a.orphans.length === 0, `${mode}: every bed has both halves (${a.orphans.slice(0, 4).join(" ")})`);
    t.check(a.feet >= 1 && a.feet === a.heads, `${mode}: at least one whole bed placed`);
    t.check(charged === a.feet, `${mode}: one item charged per bed (${charged} for ${a.feet})`);
  }
}
