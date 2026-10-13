// Elytra HUD above the hotbar and the action bar protocol. Run with
//   node tools/test-bds/run.mjs --quiet --only elytra_bp --scenario tools/test-bds/examples/elytra-notes.js --timeout 600
// Checks: while gliding with the HUD above the hotbar, it redraws a few times a second and sends realm:actionbar
// with from "elytra_bp"; another pack's note (realm:actionbar, 60 ticks) is left on the bar until it runs out,
// while the HUD keeps asking steady lines to wait; a `background` request (the Party HUD) doesn't pause it.
export default async function (t) {
  const sys = t.mc.system;
  const reqs = [];
  const acks = [];
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    try {
      const m = JSON.parse(message);
      if (id === "realm:actionbar") reqs.push({ tick: sys.currentTick, m });
      else if (id === "realm:cfg_ack") acks.push(m);
    } catch {}
  }, { namespaces: ["realm"] });

  const a = await t.player("Glider");
  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "w1", pack: "elytra_bp", key: "where", value: "hotbar", player: a.id }));
  const ack = await t.waitUntil(() => acks.find((x) => x.id === "w1"), { timeout: 40, message: "ack where" });
  t.assert(ack.ok, `where=hotbar: ${ack.error ?? "ok"}`);

  a.getComponent("equippable").setEquipment(t.mc.EquipmentSlot.Chest, new t.mc.ItemStack("minecraft:elytra", 1));
  const ground = { ...a.location };
  async function glide() {
    a.teleport({ x: ground.x, y: ground.y + 150, z: ground.z });
    await t.wait(3);
    try { a.glide(); } catch (e) { t.log(`glide: ${e}`); }
    await t.wait(2);
    return a.isGliding;
  }
  t.assert(await glide(), "the simulated player glides");
  const bars = (since, until = Infinity) => t.messages(a, { kind: "actionbar", pack: "elytra_bp", since }).filter((m) => m.tick < until);

  let since = t.tick;
  await t.wait(20);
  t.log(`elytra lines in 20 ticks: ${bars(since).length}, e.g. ${bars(since).at(-1)?.plain}`);
  t.check(bars(since).length >= 3, "the HUD redraws while gliding");
  t.check(reqs.some((r) => r.tick >= since && r.m.from === "elytra_bp" && r.m.player === a.id), "it sends realm:actionbar from elytra_bp");

  // Another pack's note: left alone for its 60 ticks.
  if (!a.isGliding) await glide();
  const noteAt = t.tick;
  sys.sendScriptEvent("realm:actionbar", JSON.stringify({ player: a.id, ticks: 60, from: "durability_bp" }));
  a.onScreenDisplay.setActionBar("Your elytra is about to break");
  await t.wait(50);
  const during = bars(noteAt + 2, noteAt + 50);
  t.log(`elytra lines while the note lasts: ${during.length}, still gliding: ${a.isGliding}`);
  t.check(a.isGliding, "still gliding through the note");
  t.check(during.length === 0, "the note isn't drawn over while it lasts");
  t.check(reqs.some((r) => r.tick > noteAt + 2 && r.tick < noteAt + 50 && r.m.from === "elytra_bp"), "the HUD keeps holding the bar for steady lines meanwhile");
  await t.wait(25);
  t.log(`elytra lines after the note: ${bars(noteAt + 61).length}`);
  t.check(bars(noteAt + 61).length >= 1 || !a.isGliding, "the HUD comes back after the note");

  // A background steady line (the Party HUD) doesn't pause it.
  if (!a.isGliding) await glide();
  since = t.tick;
  sys.sendScriptEvent("realm:actionbar", JSON.stringify({ player: a.id, ticks: 50, from: "party_bp", background: true }));
  await t.wait(20);
  t.log(`elytra lines with a background request: ${bars(since + 2).length}`);
  t.check(bars(since + 2).length >= 2, "a background request doesn't pause the HUD");
}
