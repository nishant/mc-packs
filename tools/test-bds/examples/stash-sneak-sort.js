// Quick Stack & Sort sneak-tap, and Land Claims and chest locks, in one add-on (stash_bp, claims_bp). An empty-hand sneak-tap on a container
// sorts it at once; a tool in the hand opens the menu; someone else's locked container, or one in someone else's claim, stays closed
// whichever of the two packs listens first. Two things the harness can't do on its own, so this runs against a hand-made test copy
// (tools/test-bds/hooks/stash-sneak-sort.mjs):
// - A simulated player's empty-hand tap fires no playerInteractWithBlock event, and its other taps arrive with isFirstEvent false. The copy
//   carries a tap relay: the script event harness:tap hands one real event object (empty hand or a wooden pickaxe, isFirstEvent true) to
//   every before-listener the packs registered, in registration order, or reversed (Land Claims listening after Quick Stack & Sort).
// - Bedrock stops delivering a canceled event to later packs but not to later listeners of the same pack, so the order only matters in one
//   bundle, which the copy is (claims_bp, then stash_bp, as in the Realm Bundle).
//   mkdir -p /tmp/stashtap && node tools/test-bds/hooks/stash-sneak-sort.mjs /tmp/stashtap
//   node tools/test-bds/run.mjs --quiet --flat --packs /tmp/stashtap --scenario tools/test-bds/examples/stash-sneak-sort.js --timeout 420
// Before the fix (stash_bp at 7dac598c) this fails: an empty hand opened the menu instead of sorting ("sorted at once"), and with Land Claims
// reversed a visitor's tap sorted the chest in Owner's claim ("reversed claims: no sort"), got a menu ("reversed claims: no menu"), and
// an empty hand on a locked chest showed the menu instead of "Locked by".
export default async function (t) {
  const { ItemStack } = t.mc;
  const dim = t.dimension;
  const MESS = [["minecraft:stone", 5], ["minecraft:dirt", 10], ["minecraft:stone", 7], ["minecraft:dirt", 3]];
  const UNSORTED = "stone:5,dirt:10,stone:7,dirt:3";
  const SORTED = "dirt:13,stone:12";

  let cfgId = 0;
  const cfg = (pack, key, value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `c${++cfgId}`, pack, key, value }));
  const owner = await t.player("Owner", { gameMode: "survival" });
  const base = { x: Math.floor(owner.location.x), y: Math.floor(owner.location.y), z: Math.floor(owner.location.z) };
  cfg("claims_bp", "enabled", true);
  await t.wait(3);
  t.answerForm(owner, "Claim this land");
  t.cmd(owner, "/realm:claim");
  t.log((await t.waitMessage(owner, /Claimed/, { timeout: 60 })).plain);

  // One chest inside the claim (radius 16) and one well outside it, both near their players.
  const inside = { x: base.x + 10, y: base.y, z: base.z + 3 };
  const free = { x: base.x - 24, y: base.y, z: base.z + 3 };
  await t.loadArea(free.x, free.z, { radius: 2 });
  const box = (at) => dim.getBlock(at).getComponent("minecraft:inventory").container;
  const fill = (at) => {
    dim.getBlock(at).setType("minecraft:chest");
    const c = box(at);
    for (let i = 0; i < c.size; i++) c.setItem(i, undefined);
    MESS.forEach(([id, n], i) => c.setItem(i, new ItemStack(id, n)));
  };
  const contents = (at) => {
    const c = box(at);
    const out = [];
    for (let i = 0; i < c.size; i++) {
      const it = c.getItem(i);
      if (it) out.push(`${it.typeId.replace("minecraft:", "")}:${it.amount}`);
    }
    return out.join(",");
  };
  fill(inside);
  fill(free);
  const visitor = await t.player("Visitor", { x: base.x + 22, z: base.z, gameMode: "survival" });
  owner.isSneaking = true;
  visitor.isSneaking = true;
  await t.wait(40); // the access-check hello at world load has been answered by now

  const results = [];
  t.system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id === "harness:tap_result") results.push(JSON.parse(ev.message));
  }, { namespaces: ["harness"] });
  let tapId = 0;
  /** One tap on a container: what every listener did to the event (the sort itself comes ticks later). */
  const tap = async (p, at, hand, options = {}) => {
    const id = ++tapId;
    t.system.sendScriptEvent("harness:tap", JSON.stringify({ id, player: p.name, ...at, hand, ...options }));
    await t.waitUntil(() => results.find((r) => r.id === id), { timeout: 40, message: `tap ${id} was dispatched` });
    const r = results.find((x) => x.id === id);
    t.assert(!r.error, `tap ${id}: no listener threw (${r.error})`);
    return r;
  };
  const bar = (p, since) => t.messages(p, { kind: "actionbar", since }).map((m) => m.plain);

  // 1. Realm default preference ("menu"): an empty hand sorts at once, with no menu in the way.
  let since = t.tick;
  const menu0 = t.waitForm(owner, { timeout: 40 }).catch(() => undefined);
  let r = await tap(owner, inside, "empty");
  await t.wait(12);
  t.check(r.cancel, "the empty-hand tap is taken (the chest doesn't open)");
  t.check(contents(inside) === SORTED, `sorted at once with an empty hand (${contents(inside)})`);
  t.check(bar(owner, since).some((m) => /Sorted 2 stacks/.test(m)), `the bar says Sorted 2 stacks (${bar(owner, since)})`);
  const shown0 = await menu0;
  t.check(!shown0, "no menu opened for the empty hand");
  shown0?.answer(null);
  await t.wait(25);

  // 2. A tool in hand opens the menu, and its Sort button sorts.
  fill(inside);
  const menu = t.waitForm(owner, { timeout: 60 }).catch(() => undefined);
  r = await tap(owner, inside, "pickaxe");
  const form = await menu;
  t.check(r.cancel && !!form, "a tool in hand opens the menu");
  t.check(!!form?.buttons.some((b) => /^Sort this chest/.test(b)), `the menu has Sort this chest (${form?.buttons})`);
  form?.answer("Sort this chest");
  await t.wait(15);
  t.check(contents(inside) === SORTED, `the menu's Sort button sorts (${contents(inside)})`);
  await t.wait(25);

  // 3. A visitor taps the chest in Owner's claim: Land Claims first (the bundle's order) refuses; so does the access check when it is last.
  fill(inside);
  since = t.tick;
  r = await tap(visitor, inside, "empty");
  await t.wait(20);
  t.check(r.cancel, "Land Claims refuses the visitor's tap");
  t.check(contents(inside) === UNSORTED, `claims first: the visitor sorted nothing (${contents(inside)})`);

  cfg("stash_bp", "sneakTap", "sort"); // what the first version of the fix would have been enough for: no menu, only the sort
  await t.wait(5);
  const menu3 = t.waitForm(visitor, { timeout: 50 }).catch(() => undefined);
  since = t.tick;
  r = await tap(visitor, inside, "empty", { reverse: true });
  await t.wait(45);
  t.check(contents(inside) === UNSORTED, `reversed claims: no sort (${contents(inside)})`);
  t.check(bar(visitor, since).some((m) => /isn't yours to open/.test(m)), `reversed claims: the visitor is told (${bar(visitor, since)})`);
  const shown3 = await menu3;
  t.check(!shown3, "reversed claims: no menu");
  shown3?.answer(null);
  await t.wait(25);
  r = await tap(owner, inside, "empty", { reverse: true });
  await t.wait(30);
  t.check(contents(inside) === SORTED, `reversed claims: the claim's owner still sorts it (${contents(inside)})`);
  await t.wait(25);

  cfg("stash_bp", "sneakTap", "menu");
  await t.wait(5);
  fill(inside);
  const shown4 = t.waitForm(visitor, { timeout: 50 }).catch(() => undefined);
  r = await tap(visitor, inside, "pickaxe", { reverse: true });
  const f4 = await shown4;
  t.check(!f4, "reversed claims, tool in hand: the visitor gets no menu (so no lock or sort in Owner's claim)");
  f4?.answer(null);
  await t.wait(25);

  // 4. A locked container: its owner sorts it, a visitor's tap does nothing and says who locked it.
  const lockMenu = t.waitForm(owner, { timeout: 60 });
  await tap(owner, free, "pickaxe");
  const lf = await lockMenu;
  t.assert(lf.buttons.some((b) => /^Lock this chest/.test(b)), `the menu offers Lock this chest (${lf.buttons})`);
  lf.answer("Lock this chest");
  await t.wait(40);
  since = t.tick;
  const menu5 = t.waitForm(visitor, { timeout: 40 }).catch(() => undefined);
  r = await tap(visitor, free, "empty");
  await t.wait(20);
  t.check(r.cancel, "a locked chest stays shut for the visitor");
  t.check(contents(free) === UNSORTED, `locked: nothing sorted for the visitor (${contents(free)})`);
  t.check(bar(visitor, since).some((m) => /Locked by Owner/.test(m)), `locked: the visitor sees who locked it (${bar(visitor, since)})`);
  const shown5 = await menu5;
  t.check(!shown5, "locked: an empty hand gets no menu");
  shown5?.answer(null);
  await t.wait(25);
  await tap(owner, free, "empty");
  await t.wait(20);
  t.check(contents(free) === SORTED, `the owner's empty hand sorts their locked chest (${contents(free)})`);
  await t.wait(25);

  // 5. A second tap inside the cooldown says so, and the chest is sorted once.
  cfg("stash_bp", "sneakTap", "sort");
  await t.wait(5);
  const smith = await t.player("Locksmith", { x: base.x - 22, z: base.z + 1, gameMode: "survival" });
  smith.isSneaking = true;
  const second = { x: base.x - 22, y: base.y, z: base.z + 3 };
  fill(second);
  since = t.tick;
  await tap(smith, second, "empty");
  await tap(smith, second, "empty");
  await t.wait(20);
  t.check(bar(smith, since).some((m) => /Too fast/.test(m)), `the second tap within a second says Too fast (${bar(smith, since)})`);
  t.check(contents(second) === SORTED, `and the chest is sorted once (${contents(second)})`);

  cfg("stash_bp", "sneakTap", "menu");
  cfg("claims_bp", "enabled", false);
}
