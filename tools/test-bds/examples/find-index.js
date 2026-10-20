// Chest Finder: the saved index across saves and a restart. Run with
//   node tools/test-bds/run.mjs --quiet --only find_bp --scenario tools/test-bds/examples/find-index.js --timeout 600
// Checks (phase 1 private index: the player placed both barrels; phase 2 first the private index after the restart,
// then world-wide mode, see below): a container read (by a search nearby), saved
// (a player leaving saves), changed, read and saved again is found after a restart with its new contents, from
// beyond the live scan radius, and a second container saved once is still there.
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
  const { ItemStack } = t.mc;
  const dim = t.dimension;
  if (t.phase === 1) {
    const p = await t.player("Opener");
    const at = (dx) => ({ x: Math.floor(p.location.x) + dx, y: Math.floor(p.location.y), z: Math.floor(p.location.z) + 2 });
    const a = at(0), b = at(3);
    for (const loc of [a, b]) await place(t, p, loc, "minecraft:barrel");
    const inv = (loc) => dim.getBlock(loc).getComponent("minecraft:inventory").container;
    inv(a).setItem(0, new ItemStack("minecraft:diamond", 3));
    inv(b).setItem(0, new ItemStack("minecraft:emerald", 5));
    t.world.setDynamicProperty("test:spots", JSON.stringify({ a, b }));
    async function scan() {
      const menu = t.waitForm(p);
      t.assert(t.cmd(p, "/realm:find diamond").ok, "find nearby");
      (await menu).answer(null);
      await t.wait(5);
    }
    await scan();
    const q = await t.player("Visitor", { x: a.x + 6, z: a.z });
    q.disconnect(); // a player leaving saves the index
    await t.wait(10);
    inv(a).setItem(0, new ItemStack("minecraft:diamond", 7));
    await scan();
    p.disconnect();
    await t.wait(10);
    t.restart("index saved twice");
    return;
  }
  const { a } = JSON.parse(String(t.world.getDynamicProperty("test:spots")));
  // A simulated player gets a new id on every spawn, so the owner's own finds cannot be shown after a restart here
  // (tools/find-private.test.mjs reloads the saved index with the same ids: owners and openers survive, strangers
  // still find nothing). What this half shows natively: the world is still private after the restart (the mode was
  // decided once and kept), so a stranger far from the barrels finds nothing and is told the index is private.
  const p = await t.player("Seeker", { x: a.x + 40, z: a.z });
  {
    const since = t.tick;
    /** @type {any} */
    let form;
    t.answerForm(p, (/** @type {any} */ f) => {
      form = f;
      return null;
    });
    t.assert(t.cmd(p, "/realm:find diamond").ok, "find diamond (private)");
    await t.waitUntil(() => form || t.messages(p, { since, kind: "chat" }).length, { timeout: 120, message: "a list or a chat answer" });
    await t.wait(5);
    const said = t.messages(p, { since, kind: "chat" }).map((m) => m.plain).join(" | ");
    t.log(`private after restart: form=${form ? JSON.stringify(form.buttons) : "none"} chat=${said}`);
    t.check(!form && /private/i.test(said), "after the restart the index is still private: a stranger finds nothing");
  }
  // Then the saved index itself, under the supported world-wide mode, switched on through the settings protocol and
  // acknowledged.
  const acks = [];
  t.system.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      try {
        if (id === "realm:cfg_ack") acks.push(JSON.parse(message));
      } catch {
        // not JSON
      }
    },
    { namespaces: ["realm"] }
  );
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "wide", pack: "find_bp", key: "privateIndex", value: false }));
  await t.waitUntil(() => acks.find((x) => x.id === "wide" && x.ok), { timeout: 40, message: "world-wide index ack" });
  for (const [query, want] of [["diamond", /7 Diamond/], ["emerald", /5 Emerald/]]) {
    const menu = t.waitForm(p);
    t.assert(t.cmd(p, `/realm:find ${query}`).ok, `find ${query}`);
    const form = await menu;
    t.log(query, form.buttons);
    t.check(form.buttons.length === 1 && want.test(form.buttons[0]), `${query}: the saved entry, as last seen`);
    form.answer(null);
    await t.wait(5);
  }
}
