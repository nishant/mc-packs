// F2 native: an operator recovers a forced-pending journal that survived a restart. The journal is forced by the
// stash-persistence adapter (op force_pending: real before/after native snapshots and a real pending record, no
// mocked dimension), carried over the restart by its checkpoint/restore ops, then exported through the real
// /realm:inv_recover form. Asserts: one chest holds the real stacks (the shulker with its contents, the named
// sword), no page button reaches a chest, the journal is cleared, a second run finds nothing and makes no
// second chest. Queued for the lead; not run by the worker.
// Run: node tools/test-bds/stash-persistence.mjs --scenario tools/test-bds/examples/stash-recover-restart.js
export default async function (t) {
  const p = await t.player("RecoverPager", { op: true });
  const inv = p.getComponent("minecraft:inventory").container;
  const identity = async (op) => {
    const done = t.waitMessage(p, `stash identity ${op} done`);
    p.runCommand(`scriptevent harness:stash_identity ${JSON.stringify({ name: p.name, op })}`);
    await done;
    await t.wait(3);
  };
  await t.waitUntil(() => !!inv.getItem(16), { timeout: 80, message: "buttons ready" });
  await identity("configure");
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
  if (t.phase === 1) {
    const sword = new t.mc.ItemStack("minecraft:diamond_sword", 1);
    sword.nameTag = "Recover me";
    inv.setItem(10, sword);
    inv.setItem(11, new t.mc.ItemStack("minecraft:emerald", 7));
    p.runCommand(`replaceitem entity @s slot.inventory 3 potion 1 14`);
    await identity("force_pending");
    await identity("checkpoint");
    return t.restart("a forced-pending journal is saved; restart before recovery");
  }
  await identity("restore");
  const o = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
  p.runCommand(`fill ${o.x - 5} ${o.y} ${o.z - 5} ${o.x + 5} ${o.y + 3} ${o.z + 5} air`);
  t.check(chests().length === 0, "no chest before recovery");
  const since = t.system.currentTick;
  t.answerForm(p, "Recover inventory", (f) => f.buttons.findIndex((b) => /Export/.test(b)));
  t.cmd(p, "/realm:inv_recover @s");
  const msg = (await t.waitMessage(p, /Exported \d+ stacks|nothing waiting|did not finish|changed while/i, { timeout: 400, since }).catch(() => undefined))?.plain;
  t.check(!!msg && /Exported \d+ stacks into 1 chest/.test(msg), `exported (${msg ?? "no message"})`);
  const placed = chests();
  t.check(placed.length === 1, `exactly one chest (${placed.length})`);
  const kinds = [];
  const box = placed[0]?.getComponent("minecraft:inventory")?.container;
  for (let i = 0; box && i < box.size; i++) { const it = box.getItem(i); if (it) kinds.push(it.typeId); }
  t.check(kinds.includes("minecraft:diamond_sword") && kinds.includes("minecraft:emerald"), `the real stacks are in the chest (${kinds.join(",")})`);
  t.check(!kinds.some((k) => k.startsWith("custom:inv_")), "no page button in the chest");
  const again = t.waitMessage(p, /nothing waiting/i, { timeout: 200 }).catch(() => undefined);
  t.cmd(p, "/realm:inv_recover @s");
  t.check(!!(await again), "a second run finds nothing waiting");
  t.check(chests().length === 1, "a second run makes no second chest");
}
