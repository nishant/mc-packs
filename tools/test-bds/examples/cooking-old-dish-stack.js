// F31: Kitchen dishes from before the `§8Dish: <name>` lore line stack with new servings again. When an old serving
// lands in a player's inventory, cooking_bp gives it the current lore (same item, amount and name; a line another pack
// appended, like a Silly Enchant, stays at the end), so it stacks with a freshly cooked one. Before the fix the old
// serving kept its old lore and never stacked.
//   node tools/test-bds/run.mjs --quiet --only cooking_bp --scenario tools/test-bds/examples/cooking-old-dish-stack.js --timeout 300
export default async function (t) {
  const p = await t.player("Cook");
  await t.wait(20);
  const inv = p.getComponent("inventory").container;
  const isChowder = (it) => (it?.nameTag ?? "").replace(/§./g, "").includes("Harbor Chowder");
  const total = () => {
    let n = 0;
    for (let i = 0; i < inv.size; i++) if (isChowder(inv.getItem(i))) n += inv.getItem(i).amount;
    return n;
  };
  await t.console(`scriptevent realm:dish_give ${JSON.stringify({ player: p.id, dish: "harbor_chowder", amount: 1 })}`);
  await t.waitUntil(() => total() === 1, { timeout: 60, message: "a new Harbor Chowder was given" });
  let fresh;
  for (let i = 0; i < inv.size; i++) if (isChowder(inv.getItem(i))) fresh = inv.getItem(i);
  const lore = fresh.getLore();
  t.log("new lore:", JSON.stringify(lore));
  t.assert(lore.some((l) => l.startsWith("§8Dish: ")), "a new serving carries the Dish line");
  const oldLore = lore.filter((l) => !l.startsWith("§8Dish: "));

  // An old serving (3) and an old one with a line another pack appended (2), put in by the test.
  const old = fresh.clone();
  old.amount = 3;
  old.setLore(oldLore);
  t.assert(!old.isStackableWith(fresh), "the old serving does not stack with the new one to begin with");
  const silly = fresh.clone();
  silly.amount = 2;
  silly.setLore([...oldLore, "§dSilly: Bouncy"]);
  inv.setItem(20, old);
  inv.setItem(21, silly);
  await t.wait(20);

  const a = inv.getItem(20);
  const b = inv.getItem(21);
  t.log("old serving now:", JSON.stringify(a?.getLore()), "silly one now:", JSON.stringify(b?.getLore()));
  t.check(!!a && a.amount === 3 && isChowder(a), `the old serving is still 3 Harbor Chowder (${a?.typeId} x${a?.amount})`);
  t.check(!!a && a.isStackableWith(fresh), "the old serving now stacks with a new one");
  t.check(!!b && b.amount === 2 && JSON.stringify(b.getLore()) === JSON.stringify([...lore, "§dSilly: Bouncy"]), `the appended line stays at the end (${JSON.stringify(b?.getLore())})`);
  t.check(total() === 6, `no serving was lost or copied (${total()} of 6)`);
}
