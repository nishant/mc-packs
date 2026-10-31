// Chest Finder mark: only the searcher gets the direction line, and the pack asks the action bar
// to wait (realm:actionbar, steady 25) while it shows. A note holds the line. A new search replaces
// the mark. Timeout, death and leave stop the requests. The harness does not relay spawnParticle, so
// this is not proof the arrow is obvious against chests and signs; that needs the owner.
// Before 7dac598caa6dd6ee526506ebbcf4821a677ed64f: no find_bp realm:actionbar, and the action bar
// never says "blocks".
// Run with: node tools/test-bds/run.mjs --quiet --flat --only find_bp --scenario tools/test-bds/examples/find-marker.js --timeout 300
// The private index lists only containers the searcher placed or opened, and a simulated player's open fires no
// interact event, so the fixture's searchers place their containers (native playerPlaceBlock, as saga-content-replacements).
async function place(t, p, loc, type) {
  const ground = { x: loc.x, y: loc.y - 1, z: loc.z };
  const home = { x: p.location.x, y: p.location.y, z: p.location.z };
  const inv = p.getComponent("minecraft:inventory").container;
  let used;
  // A simulated player places one block every few ticks: stand beside the ground and retry within the 40 ticks.
  for (let k = 0; k < 5 && t.dimension.getBlock(loc).typeId !== type; k++) {
    inv.setItem(p.selectedSlotIndex, new t.mc.ItemStack(type, 1));
    p.teleport({ x: ground.x + 0.5, y: ground.y + 1, z: ground.z - 1.5 }, { dimension: t.dimension });
    await t.wait(3);
    used = p.useItemInSlotOnBlock(p.selectedSlotIndex, ground, t.mc.Direction.Up);
    await t.wait(5);
    p.stopInteracting();
  }
  const got = t.dimension.getBlock(loc).typeId;
  t.log(`place ${type} at ${loc.x},${loc.y},${loc.z}: use=${used} got=${got} player=${p.location.x.toFixed(1)},${p.location.y.toFixed(1)},${p.location.z.toFixed(1)}`);
  p.teleport(home, { dimension: t.dimension });
  t.assert(got === type, `${p.name} placed ${type}`);
}
export default async function (t) {
  const sys = t.system;
  /** @type {{ tick: number, m: any }[]} */
  const reqs = [];
  /** @type {any[]} */
  const acks = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      try {
        if (id === "realm:actionbar") reqs.push({ tick: sys.currentTick, m: JSON.parse(message) });
        else if (id === "realm:cfg_ack") acks.push(JSON.parse(message));
      } catch {
        // not JSON
      }
    },
    { namespaces: ["realm"] }
  );

  const seeker = await t.player("Seeker", { gameMode: "survival" });
  const bystander = await t.player("Bystander", { x: seeker.location.x + 4, z: seeker.location.z + 1, gameMode: "survival" });
  const dim = t.dimension;
  const chest = { x: Math.floor(seeker.location.x) + 2, y: Math.floor(seeker.location.y), z: Math.floor(seeker.location.z) + 2 };
  const barrel = { x: chest.x + 3, y: chest.y, z: chest.z };
  const theirs = { x: Math.floor(bystander.location.x), y: Math.floor(bystander.location.y), z: Math.floor(bystander.location.z) + 4 };
  await place(t, seeker, chest, "minecraft:chest");
  await place(t, seeker, barrel, "minecraft:barrel");
  await place(t, bystander, theirs, "minecraft:chest");
  dim.getBlock(theirs).getComponent("minecraft:inventory").container.setItem(0, new t.mc.ItemStack("minecraft:diamond", 1));
  dim.getBlock(chest).getComponent("minecraft:inventory").container.setItem(0, new t.mc.ItemStack("minecraft:diamond", 4));
  dim.getBlock(barrel).getComponent("minecraft:inventory").container.setItem(0, new t.mc.ItemStack("minecraft:emerald", 2));

  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "hs", pack: "find_bp", key: "highlightSeconds", value: 8 }));
  await t.waitUntil(() => acks.find((a) => a.id === "hs" && a.ok), { timeout: 40, message: "highlightSeconds ack" });

  t.echoActionBar = true;
  const since = t.tick;
  const menu = t.waitForm(seeker);
  t.assert(t.cmd(seeker, "/realm:find diamond").ok, "find diamond");
  const form = await menu;
  t.log("results", form.buttons);
  t.check(form.buttons.length === 1, "only the searcher's own chest is listed, not the bystander's");
  form.answer(0);
  const marked = await t.waitMessage(seeker, /marked for/, { timeout: 80, pack: "find_bp" });
  t.check(/Chest/.test(marked.plain), "chat names the container for the searcher only");
  const guide = await t.waitMessage(seeker, /blocks/, { kind: "actionbar", pack: "find_bp", timeout: 40 });
  t.log("guide", guide.plain);
  t.check(/\d+ blocks (N|NE|E|SE|S|SW|W|NW)/.test(guide.plain), "direction and distance on the action bar");
  t.check(!/diamond/i.test(guide.plain), "the bar does not repeat the item");
  await t.wait(15);
  const mine = reqs.filter((r) => r.m.from === "find_bp" && r.m.player === seeker.id);
  t.check(mine.length >= 1 && mine.every((r) => r.m.steady === 25 && r.m.ticks === 30), `finder requests steady 25 for 30 ticks (${mine.length})`);
  t.check(reqs.filter((r) => r.m.from === "find_bp").every((r) => r.m.player === seeker.id), "finder requests name only the searcher");
  const leaked = t.messages(bystander, { since }).filter((m) => /marked for|blocks (N|NE|E|SE|S|SW|W|NW)/.test(m.plain));
  t.check(leaked.length === 0, "bystander gets no mark chat and no direction line");

  const noteAt = t.tick;
  sys.sendScriptEvent("realm:actionbar", JSON.stringify({ player: seeker.id, ticks: 40, from: "test_bp" }));
  await t.wait(30);
  const during = t.messages(seeker, { kind: "actionbar", pack: "find_bp", since: noteAt + 2 }).filter((m) => m.tick < noteAt + 30);
  t.check(during.length === 0, "the guide waits while a note holds the bar");
  t.check(reqs.some((r) => r.tick >= noteAt && r.m.from === "find_bp" && r.m.steady === 25), "the guide keeps announcing its rank during the note");

  const again = t.waitForm(seeker);
  t.assert(t.cmd(seeker, "/realm:find emerald").ok, "find emerald");
  (await again).answer(0);
  const next = await t.waitMessage(seeker, /Barrel/, { kind: "actionbar", pack: "find_bp", timeout: 80 });
  t.check(/blocks/.test(next.plain), `replacement guide: ${next.plain}`);

  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "hs2", pack: "find_bp", key: "highlightSeconds", value: 3 }));
  await t.waitUntil(() => acks.find((a) => a.id === "hs2" && a.ok), { timeout: 40, message: "short highlight ack" });
  const shortMenu = t.waitForm(seeker);
  t.assert(t.cmd(seeker, "/realm:find diamond").ok, "find diamond again");
  (await shortMenu).answer(0);
  await t.waitMessage(seeker, /marked for/, { timeout: 40 });
  const stopAt = t.tick;
  await t.wait(80);
  t.check(reqs.filter((r) => r.m.from === "find_bp" && r.tick > stopAt + 70).length === 0, "the request stops after the highlight expires");

  const live = t.waitForm(seeker);
  t.assert(t.cmd(seeker, "/realm:find emerald").ok, "mark before death");
  (await live).answer(0);
  await t.waitMessage(seeker, /marked for/, { timeout: 40 });
  const died = t.tick;
  seeker.applyDamage(1000, { cause: t.mc.EntityDamageCause.override });
  await t.wait(30);
  t.check(reqs.filter((r) => r.m.from === "find_bp" && r.tick > died + 15).length === 0, "death stops the marker requests");

  const leaving = t.waitForm(bystander);
  t.assert(t.cmd(bystander, "/realm:find diamond").ok, "bystander marks a chest");
  (await leaving).answer(0);
  await t.waitMessage(bystander, /marked for/, { timeout: 40, pack: "find_bp" });
  const left = t.tick;
  bystander.disconnect();
  await t.wait(30);
  t.check(reqs.filter((r) => r.m.from === "find_bp" && r.m.player === bystander.id && r.tick > left + 10).length === 0, "leave stops the marker");

  if (seeker.isValid) {
    const dimMenu = t.waitForm(seeker);
    t.cmd(seeker, "/realm:find emerald");
    (await dimMenu).answer(0);
    await t.waitMessage(seeker, /marked for/, { timeout: 40 });
    const moved = t.tick;
    let leftOverworld = false;
    try {
      seeker.teleport({ x: 8.5, y: 80, z: 8.5 }, { dimension: t.world.getDimension("nether") });
      await t.wait(20);
      leftOverworld = !seeker.isValid || String(seeker.dimension.id).includes("nether");
      t.log("after teleport", seeker.isValid ? seeker.dimension.id : "invalid");
    } catch (e) {
      t.log("nether teleport failed", String(e));
    }
    await t.wait(15);
    t.check(leftOverworld, "dimension cleanup needs the player to enter the nether");
    t.check(reqs.filter((r) => r.m.from === "find_bp" && r.m.player === seeker.id && r.tick > moved + 20).length === 0, "dimension change stops the marker requests");
  } else t.check(false, "seeker was not valid for the dimension cleanup");
}
