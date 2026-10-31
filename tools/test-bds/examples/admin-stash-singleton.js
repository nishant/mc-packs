// A genuine Realm Configuration tool hidden in a native inventory page must not duplicate its hotbar replacement.
// Run: node tools/test-bds/run.mjs --quiet --strict --only admin_bp,stash_bp --scenario tools/test-bds/examples/admin-stash-singleton.js
export default async function (t) {
  for (const pack of ["admin_bp", "stash_bp"]) t.assert(t.packs.includes(pack), `${pack} installed`);
  const p = await t.player("SingletonPager", { op: true });
  const inv = p.getComponent("minecraft:inventory").container;
  const plain = (s) => String(s ?? "").replace(/§./g, "");
  const slots = () => Array.from({ length: inv.size }, (_, s) => ({ s, item: inv.getItem(s) }));
  const page = () => Number(/Page (\d+)\//.exec(inv.getItem(16)?.nameTag ?? "")?.[1] ?? 0);
  await t.waitUntil(() => page() === 1 && slots().some(({ item }) => item?.typeId === "minecraft:nether_star" && plain(item.nameTag) === "Realm Configuration"), {
    timeout: 120, message: "page controls and initial genuine menu tool",
  });
  const original = slots().find(({ item }) => item?.typeId === "minecraft:nether_star" && plain(item.nameTag) === "Realm Configuration");
  const fingerprint = JSON.stringify(original.item.getLore().map(plain));
  const realTools = () => slots().filter(({ item }) => item?.typeId === "minecraft:nether_star" && JSON.stringify(item.getLore().map(plain)) === fingerprint);
  t.assert(original.s < 9, "initial genuine tool is in the shared hotbar");
  inv.swapItems(original.s, 22, inv);
  p.selectedSlotIndex = 0;
  await t.wait(4);
  t.assert(realTools().length === 1 && realTools()[0].s === 22, "sole genuine tool moved into page one");
  const go = async (button, destination) => {
    inv.setItem(button, undefined);
    await t.waitUntil(() => page() === destination, { timeout: 80, message: `native inventory page ${destination}` });
    await t.wait(4);
  };
  const controls = () => {
    for (const [slot, id] of [[15, "custom:inv_prev"], [16, "custom:inv_menu"], [17, "custom:inv_next"]]) {
      t.assert(inv.getItem(slot)?.typeId === id && inv.getItem(slot).amount === 1, `${id} remains in its distinct control slot`);
    }
  };
  await go(17, 2);
  t.assert(realTools().length === 0, "old genuine tool is inactive in a native page snapshot");
  t.assert(t.cmd(p, "/realm:admin_item").ok, "grant a replacement while the old copy is inactive");
  await t.waitUntil(() => realTools().length === 1 && realTools()[0].s === 0, { timeout: 40, message: "canonical replacement in selected hotbar slot" });
  await t.wait(4);

  const ordinary = new t.mc.ItemStack("minecraft:nether_star", 3);
  ordinary.nameTag = "Realm Configuration";
  ordinary.setLore(["A player souvenir."]);
  ordinary.lockMode = t.mc.ItemLockMode.inventory;
  inv.setItem(1, ordinary);
  const generic = new t.mc.ItemStack("minecraft:nether_star", 2);
  generic.nameTag = "Realm Configuration";
  generic.setLore(["Hold it in your hand and use it"]);
  generic.lockMode = t.mc.ItemLockMode.inventory;
  inv.setItem(2, generic);
  const gear = new t.mc.ItemStack("minecraft:diamond_sword");
  gear.nameTag = "Keep this locked sword";
  gear.lockMode = t.mc.ItemLockMode.inventory;
  gear.getComponent("minecraft:durability").damage = 27;
  inv.setItem(3, gear);
  const preserved = () => {
    t.assert(inv.getItem(1)?.amount === 3 && inv.getItem(1).getLore()[0] === "A player souvenir.", "ordinary same-title locked stars survive");
    t.assert(inv.getItem(2)?.amount === 2 && inv.getItem(2).getLore().length === 1, "generic shared-lore stars survive");
    const keptGear = inv.getItem(3);
    t.assert(keptGear?.nameTag === "Keep this locked sword" && keptGear.getComponent("minecraft:durability").damage === 27, "ordinary locked gear survives");
    controls();
  };
  await t.wait(6);
  preserved();
  await go(15, 1);
  await t.waitUntil(() => realTools().length === 1 && realTools()[0].s === 0 && !inv.getItem(22), {
    timeout: 12, message: "automatic page-restore reconciliation without a cleanup command",
  });
  t.assert(realTools()[0].item.amount === 1, "canonical carried replacement retained exactly once");
  preserved();
  await go(17, 2);
  await go(15, 1);
  t.assert(realTools().length === 1 && realTools()[0].s === 0 && !inv.getItem(22), "revisiting the saved page does not resurrect its removed duplicate");
  preserved();
  t.log("Native page snapshots, automatic duplicate cleanup, canonical hotbar retention, ordinary items and all three page controls verified.");
}
