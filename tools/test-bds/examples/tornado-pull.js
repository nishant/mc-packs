// Tornadoes: an operator spawns one 40 blocks ahead, a cow and a dropped item near the funnel are pulled in
// (the cow gets Slow Falling, the item moves), players within 150 blocks are warned, the menu answers where it
// is, and "End the tornado" stops it with the all-clear for everyone who was warned.
// node tools/test-bds/run.mjs --quiet --only tornado_bp --scenario tools/test-bds/examples/tornado-pull.js --timeout 300
export default async function (t) {
  const p = await t.player("Chaser", { op: true });
  const here = p.location;
  // Look north: the tornado forms 40 blocks north of the player. Load that ground first.
  const tx = here.x, tz = here.z - 40;
  const { top } = await t.loadArea(tx, tz, { radius: 3 });
  p.lookAtLocation({ x: tx, y: top.location.y + 1, z: tz });
  await t.wait(5);
  t.assert(t.cmd(p, "/realm:tornado_spawn").ok, "/realm:tornado_spawn ran");
  const warn = await t.waitMessage(p, /Tornado! \d+m to the/, { timeout: 100 });
  t.log(`warning: ${warn.plain}`);

  // Where the funnel is (the pack reports it on the next /realm:tornado_info and in the menu).
  const infoP = t.waitForm(p, { timeout: 100 });
  t.assert(t.cmd(p, "/realm:tornado").ok, "/realm:tornado ran");
  const menu = await infoP;
  t.log(`menu "${menu.title}": ${menu.buttons.join(" | ")}`);
  t.check(menu.buttons.some((b) => /Where is the tornado/.test(b)), "menu has Where is the tornado?");
  t.check(menu.buttons.some((b) => /End the tornado/.test(b)), "menu offers End the tornado to an operator");
  menu.answer("Where is the tornado");
  const where = await t.waitMessage(p, /Tornado! \d+m to the/, { timeout: 60 });
  t.log(`where: ${where.plain}`);

  // A cow and a dropped item 4 blocks from the funnel (inside pullRadius 12) are pulled: the cow gets Slow Falling
  // (the pack gives it to every mob it moves), the item moves.
  const cow = t.dimension.spawnEntity("minecraft:cow", { x: tx + 4, y: top.location.y + 1, z: tz });
  const item = t.dimension.spawnItem(new t.mc.ItemStack("minecraft:stick", 1), { x: tx - 4, y: top.location.y + 1, z: tz });
  const itemAt = { ...item.location };
  await t.wait(40);
  t.check(cow.isValid && !!cow.getEffect("slow_falling"), "a cow near the funnel is pulled (has Slow Falling)");
  const moved = item.isValid ? Math.hypot(item.location.x - itemAt.x, item.location.z - itemAt.z) : -1;
  t.log(`item moved ${moved.toFixed(2)} blocks`);
  t.check(moved > 0.5, "a dropped item near the funnel moves");

  // A second player within 150 blocks is warned too, and gets the all-clear when the operator ends it from the menu.
  const w = await t.player("Watcher", { x: here.x + 30, z: here.z });
  await t.waitMessage(w, /Tornado! \d+m to the/, { timeout: 60 });
  const menu2P = t.waitForm(p, { timeout: 100 });
  t.assert(t.cmd(p, "/realm:tornado").ok, "/realm:tornado ran again");
  const menu2 = await menu2P;
  const since = t.tick;
  menu2.answer("End the tornado");
  await t.waitMessage(p, /tornado is gone/i, { timeout: 60, since });
  await t.waitMessage(w, /tornado has died down/i, { timeout: 60, since });
  t.check(t.messages(w).filter((m) => /died down/.test(m.plain)).length === 1, "the all-clear comes once");
  await t.wait(20);
  const infoP2 = t.waitForm(p, { timeout: 100 });
  t.assert(t.cmd(p, "/realm:tornado").ok, "/realm:tornado ran a third time");
  const menu3 = await infoP2;
  t.check(/No tornado right now/.test(menu3.body), `after ending, the menu says no tornado (body: ${menu3.body.slice(0, 60)})`);
  menu3.answer(null);
}
