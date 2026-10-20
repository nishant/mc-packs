// Do two chests placed with Block.setType next to each other pair into a double chest?
export default async function (t) {
  const p = await t.player("Op");
  await t.wait(20);
  const d = p.dimension;
  const o = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
  // the first two spots exportPending's ring search picks (r=1, dx=-1, dz=-1 then dz=0)
  const a = { x: o.x - 1, y: o.y, z: o.z - 1 };
  const b = { x: o.x - 1, y: o.y, z: o.z };
  d.getBlock(a).setType("minecraft:chest");
  const boxA = d.getBlock(a).getComponent("minecraft:inventory").container;
  for (let i = 0; i < 27; i++) boxA.setItem(i, new t.mc.ItemStack("minecraft:stone", 1));
  d.getBlock(b).setType("minecraft:chest");
  const sizeNow = d.getBlock(b).getComponent("minecraft:inventory").container.size;
  await t.wait(5);
  const sizeA = d.getBlock(a).getComponent("minecraft:inventory").container.size;
  const sizeB = d.getBlock(b).getComponent("minecraft:inventory").container.size;
  t.log(`sizes: B right after setType ${sizeNow}, A after 5 ticks ${sizeA}, B after 5 ticks ${sizeB}`);
  const boxB = d.getBlock(b).getComponent("minecraft:inventory").container;
  for (let i = 0; i < 27; i++) boxB.setItem(i, new t.mc.ItemStack("minecraft:dirt", 1));
  let stone = 0, dirt = 0;
  const all = d.getBlock(a).getComponent("minecraft:inventory").container;
  for (let i = 0; i < all.size; i++) { const it = all.getItem(i); if (it?.typeId === "minecraft:stone") stone++; if (it?.typeId === "minecraft:dirt") dirt++; }
  t.log(`after writing 27 dirt into B slots 0-26: A view has stone=${stone} dirt=${dirt}`);
  t.check(stone === 27, `chest A kept its 27 stone (${stone})`);
}
