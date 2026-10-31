// F2/F4 native: an operator recovers a forced-pending journal across a restart, and only what the player no longer
// carries is exported. The journal is forced by the stash-persistence adapter (op force_pending: real before/after
// native snapshots and a real pending record, no mocked dimension). The player then loses most of the before-image
// (keeps one gold stack whole and 3 of the 7 emeralds), so 32 of its 33 stacks are missing: two chests. The first
// export runs the real exporter with one chest write failing natively part way (op export_fail: 27 stacks in the
// first chest, 2 in the second, then a throw). The journal (plan, spots, placed stacks) and the inventory are carried
// over the restart by the adapter's checkpoint/restore ops. After the restart someone takes a stack out of the first
// chest and the player picks up more gold; the real /realm:inv_recover form then finishes the export.
// Asserts: the taken stack is not put back, every other planned stack is in a chest exactly once (32 - 1), the kept
// gold and the 3 kept emeralds are not copied (4 emeralds exported), the named sword keeps its name, lore and
// damage, no page button reaches a chest, the journal is cleared, and a further run finds nothing and makes no
// third chest.
//   node tools/test-bds/stash-persistence.mjs --scenario tools/test-bds/examples/stash-recover-restart.js
export default async function (t) {
  const p = await t.player("RecoverPager", { op: true });
  const inv = p.getComponent("minecraft:inventory").container;
  const identity = async (op, extra = {}) => {
    const done = t.waitMessage(p, new RegExp(`stash identity ${op} done`));
    p.runCommand(`scriptevent harness:stash_identity ${JSON.stringify({ name: p.name, op, ...extra })}`);
    await done;
    await t.wait(3);
  };
  await t.waitUntil(() => !!inv.getItem(16), { timeout: 80, message: "buttons ready" });
  await identity("configure");
  const BUTTONS = [15, 16, 17];
  const chests = () => {
    const d = p.dimension;
    const out = [];
    const o = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
    for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
      const b = d.getBlock({ x: o.x + dx, y: o.y, z: o.z + dz });
      if (b?.typeId === "minecraft:chest") out.push(b);
    }
    return out;
  };
  const stacksIn = (block) => {
    const box = block?.getComponent("minecraft:inventory")?.container;
    return Array.from({ length: box?.size ?? 0 }, (_, i) => box.getItem(i)).filter(Boolean);
  };
  if (t.phase === 1) {
    const o = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
    p.runCommand(`fill ${o.x - 5} ${o.y} ${o.z - 5} ${o.x + 5} ${o.y + 3} ${o.z + 5} air`);
    t.check(chests().length === 0, "no chest before recovery");
    for (let s = 0; s < 36; s++) {
      if (BUTTONS.includes(s) || s === 3 || s === 10 || s === 11) continue;
      inv.setItem(s, new t.mc.ItemStack(s % 2 ? "minecraft:iron_ingot" : "minecraft:gold_ingot", s + 1));
    }
    const sword = new t.mc.ItemStack("minecraft:diamond_sword", 1);
    sword.nameTag = "Recover me";
    sword.setLore(["Native recovery metadata"]);
    sword.getComponent("minecraft:durability").damage = 19;
    inv.setItem(10, sword);
    inv.setItem(11, new t.mc.ItemStack("minecraft:emerald", 7));
    p.runCommand(`replaceitem entity @s slot.hotbar 3 potion 1 14`);
    await t.wait(2);
    await identity("force_pending");
    // The player loses everything but the gold in slot 0 and 3 of the 7 emeralds.
    for (let s = 0; s < 36; s++) if (!BUTTONS.includes(s) && s !== 0 && s !== 11) inv.setItem(s, undefined);
    inv.setItem(11, new t.mc.ItemStack("minecraft:emerald", 3));
    await t.wait(2);
    const failed = t.waitMessage(p, /stash export_fail /, { timeout: 100 });
    await identity("export_fail", { failAt: 30 });
    const report = JSON.parse((await failed).plain.replace(/^.*stash export_fail /, ""));
    t.check(report.fired, "the injected chest write failure fired");
    t.check(!report.ok && /did not finish/.test(report.message), `the first export stopped part way (${report.message})`);
    t.check(report.out?.x?.length === 32, `the plan holds the 32 missing stacks (${report.out?.x?.length})`);
    t.check(report.out?.f?.length === 29, `the 29 placed stacks are recorded (${report.out?.f?.length})`);
    t.check(chests().length === 2, `two chests after the partial export (${chests().length})`);
    await identity("checkpoint");
    return t.restart("a partial export of a pending journal is saved; restart before the re-run");
  }
  await identity("restore");
  const before = chests();
  t.check(before.length === 2, `both chests survived the restart (${before.length})`);
  const full = before.find((b) => stacksIn(b).length === 27);
  t.check(!!full, "the first chest holds its 27 stacks");
  const fullBox = full?.getComponent("minecraft:inventory")?.container;
  const taken = fullBox?.getItem(0);
  fullBox?.setItem(0, undefined);
  t.check(!!taken, "someone takes the first stack out of the first chest");
  // A started export keeps its journaled plan, whatever the player picks up meanwhile.
  inv.setItem(1, new t.mc.ItemStack("minecraft:iron_ingot", 64));
  const since = t.system.currentTick;
  t.answerForm(p, (f) => f.buttons.findIndex((b) => /Export/.test(b)));
  t.cmd(p, "/realm:inv_recover @s");
  const msg = (await t.waitMessage(p, /Exported \d+ stacks|nothing waiting|did not finish|changed while|could not be read/i, { timeout: 400, since }).catch(() => undefined))?.plain;
  t.check(!!msg && /Exported 32 stacks into 2 chest/.test(msg), `the re-run finished the export (${msg ?? "no message"})`);
  const placed = chests();
  t.check(placed.length === 2, `still exactly two chests (${placed.length})`);
  const all = placed.flatMap(stacksIn);
  t.check(all.length === 31, `every planned stack is in a chest once, minus the one taken (${all.length})`);
  t.check(!fullBox?.getItem(0), "the taken stack was not put back");
  const kinds = all.map((item) => item.typeId);
  const sword = all.find((item) => item.typeId === "minecraft:diamond_sword");
  t.check(sword?.nameTag === "Recover me" && sword.getLore().join() === "Native recovery metadata" &&
    sword.getComponent("minecraft:durability").damage === 19, "native sword name, lore and damage survived the pending journal and restart");
  t.check(all.filter((item) => item.typeId === "minecraft:emerald").reduce((n, item) => n + item.amount, 0) === 4, "exactly the 4 emeralds the player no longer had");
  t.check(!all.some((item) => item.typeId === "minecraft:gold_ingot" && item.amount === 1), "the gold stack the player kept is not copied");
  t.check(kinds.includes("minecraft:potion"), "the native potion was exported too");
  t.check(!kinds.some((k) => k.startsWith("custom:inv_")), "no page button in a chest");
  const again = t.waitMessage(p, /nothing waiting/i, { timeout: 200 }).catch(() => undefined);
  t.cmd(p, "/realm:inv_recover @s");
  t.check(!!(await again), "a further run finds nothing waiting");
  t.check(chests().length === 2, "a further run makes no third chest");
}
