// F4 native: /realm:inv_recover counts worn armor and the offhand as carried, and lists a tool kept but used since
// apart as changed. The journal is forced by the stash-persistence adapter (op force_pending: real before/after native
// snapshots). After the forced failure the player puts the helmet on, the arrows in the offhand, keeps mining with the
// pickaxe (damage 10 -> 40) and loses the diamonds and the sword.
// Round 1, **Export to chests**: only the diamonds and the sword are exported (helmet, arrows and pickaxe are not
// copied), and the form lists the pickaxe as changed. Round 2 (a second forced journal, same changes):
// **Also export the changed items** exports the pickaxe too.
//   node tools/test-bds/stash-persistence.mjs --scenario tools/test-bds/examples/stash-recover-worn.js
export default async function (t) {
  const p = await t.player("RecoverWorn", { op: true });
  const inv = p.getComponent("minecraft:inventory").container;
  const worn = p.getComponent("minecraft:equippable");
  const identity = async (op, extra = {}) => {
    const done = t.waitMessage(p, new RegExp(`stash identity ${op} done`));
    p.runCommand(`scriptevent harness:stash_identity ${JSON.stringify({ name: p.name, op, ...extra })}`);
    await done;
    await t.wait(3);
  };
  await t.waitUntil(() => !!inv.getItem(16), { timeout: 80, message: "buttons ready" });
  await identity("configure");
  const BUTTONS = [15, 16, 17];
  const o = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
  p.runCommand(`fill ${o.x - 5} ${o.y} ${o.z - 5} ${o.x + 5} ${o.y + 3} ${o.z + 5} air`);
  const exported = () => {
    const d = p.dimension;
    const out = [];
    for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) {
      const b = d.getBlock({ x: o.x + dx, y: o.y, z: o.z + dz });
      if (b?.typeId !== "minecraft:chest") continue;
      const box = b.getComponent("minecraft:inventory")?.container;
      for (let i = 0; i < (box?.size ?? 0); i++) {
        const item = box.getItem(i);
        if (item) out.push(`${item.typeId.replace("minecraft:", "")}:${item.amount}`);
      }
    }
    return out.sort();
  };
  const round = async (button, label) => {
    for (let s = 0; s < 36; s++) if (!BUTTONS.includes(s)) inv.setItem(s, undefined);
    worn.setEquipment("Head", undefined);
    worn.setEquipment("Offhand", undefined);
    inv.setItem(0, new t.mc.ItemStack("minecraft:iron_helmet", 1));
    inv.setItem(1, new t.mc.ItemStack("minecraft:arrow", 16));
    const pick = new t.mc.ItemStack("minecraft:diamond_pickaxe", 1);
    pick.getComponent("minecraft:durability").damage = 10;
    inv.setItem(2, pick);
    inv.setItem(4, new t.mc.ItemStack("minecraft:diamond", 3));
    inv.setItem(5, new t.mc.ItemStack("minecraft:diamond_sword", 1));
    await t.wait(2);
    await identity("force_pending");
    // After the failure: the helmet goes on, the arrows into the offhand, the pickaxe is used; diamonds and sword are gone.
    worn.setEquipment("Head", inv.getItem(0));
    inv.setItem(0, undefined);
    worn.setEquipment("Offhand", inv.getItem(1));
    inv.setItem(1, undefined);
    const used = inv.getItem(2);
    used.getComponent("minecraft:durability").damage = 40;
    inv.setItem(2, used);
    inv.setItem(4, undefined);
    inv.setItem(5, undefined);
    await t.wait(2);
    t.check(worn.getEquipment("Head")?.typeId === "minecraft:iron_helmet" && worn.getEquipment("Offhand")?.typeId === "minecraft:arrow", `${label}: helmet and arrows are worn`);
    const before = exported();
    let body = "";
    t.answerForm(p, (f) => {
      body = f.body ?? "";
      return f.buttons.findIndex((b) => button.test(b));
    });
    const since = t.system.currentTick;
    t.cmd(p, "/realm:inv_recover @s");
    const msg = (await t.waitMessage(p, /Exported \d+ stacks|nothing waiting|did not finish|changed while|could not be read|nothing was exported/i, { timeout: 400, since }).catch(() => undefined))?.plain;
    t.check(/used, renamed, enchanted or dyed since/.test(body) && /Diamond pickaxe/i.test(body), `${label}: the form lists the used pickaxe as changed (${body.slice(0, 160)})`);
    const now = exported();
    const added = [...now];
    for (const k of before) added.splice(added.indexOf(k), 1);
    return { msg, added: added.sort() };
  };
  const first = await round(/^.*Export to chests/, "round 1");
  t.check(/Exported 2 stacks/.test(first.msg ?? ""), `round 1 exported the 2 lost stacks (${first.msg})`);
  t.check(JSON.stringify(first.added) === JSON.stringify(["diamond:3", "diamond_sword:1"]), `round 1: only the diamonds and the sword, nothing worn and not the kept pickaxe (${first.added})`);
  const second = await round(/Also export the changed items/, "round 2");
  t.check(/Exported 3 stacks/.test(second.msg ?? ""), `round 2 exported 3 stacks (${second.msg})`);
  t.check(JSON.stringify(second.added) === JSON.stringify(["diamond:3", "diamond_pickaxe:1", "diamond_sword:1"]), `round 2: the operator chose to export the changed pickaxe too (${second.added})`);
}
