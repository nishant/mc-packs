// Two steady lines of the action bar protocol on one player: Story Questlines' tracker above the hotbar and the
// Relics Storm Meter readout (held). Before ranks, the line drawn first kept the bar and the other waited for good.
// Now each redraw sends `steady` (tracker 20, Relics readouts 45): the readout takes the bar from the tracker, the
// tracker waits for it, and the tracker comes back once the meter is put away. A plain note still holds both.
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp,relics_bp --scenario tools/test-bds/examples/actionbar-steady.js --timeout 420
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
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const p = await t.player("Twoline", { op: true, gameMode: "survival" });
  await t.wait(20);
  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "at", pack: "saga_bp", key: "trackerAt", value: "hotbar", player: p.id }));
  const ack = await t.waitUntil(() => acks.find((x) => x.id === "at"), { timeout: 40, message: "ack trackerAt" });
  t.assert(ack.ok, `trackerAt=hotbar: ${ack.error ?? "ok"}`);

  // A chapter to track: Elsie's "Sea-Kept Things".
  sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.id, action: "jump", story: "inn_ghost", chapter: "sea_kept" }));
  await t.wait(5);
  sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: p.id, npc: "elsie", req: "n1" }));
  await t.wait(4);
  const accept = (async () => {
    for (;;) {
      const f = await t.waitForm(p, { timeout: 200 });
      if (f.buttons.some((b) => /^next$/i.test(b))) f.answer("Next");
      else return f.answer(f.buttons.find((b) => /Accept/.test(b)) ?? 0);
    }
  })();
  sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ pack: "saga_bp", player: p.id, key: "start:inn_ghost" }));
  await accept;
  const tracker = (since, until = Infinity) =>
    t.messages(p, { kind: "actionbar", pack: "saga_bp", since }).filter((m) => m.tick < until && /^Sea-Kept|:/.test(m.plain) && !/Sneak to skip/.test(m.plain));
  const meter = (since, until = Infinity) => t.messages(p, { kind: "actionbar", pack: "relics_bp", since }).filter((m) => m.tick < until && /^Storm Meter:/.test(m.plain));
  const start = t.tick;
  await t.waitUntil(() => tracker(start).length > 0, { timeout: 200, message: "the story tracker shows above the hotbar" });
  t.log(`tracker line: ${tracker(start).at(-1)?.plain}`);

  // The tracker holds the bar; now the player takes out the Storm Meter.
  const inv = p.getComponent("minecraft:inventory").container;
  inv.clearAll();
  const gave = t.tick;
  t.assert(t.cmd(p, "/realm:relics_give Twoline storm_meter").ok, "relics_give ran");
  p.selectedSlotIndex = 0;
  await t.wait(5);
  for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.typeId === "minecraft:spyglass" && i !== 0) inv.moveItem(i, 0, inv);
  p.selectedSlotIndex = 0;
  await t.wait(120);
  const readouts = meter(gave);
  const late = tracker(gave + 60, gave + 125);
  t.log(`with the meter held, 120 ticks: ${readouts.length} Storm Meter readouts, ${late.length} tracker lines after the first 60 ticks`);
  t.check(readouts.length >= 3, "the Storm Meter readout shows over the story tracker (higher rank)");
  t.check(late.length === 0, "the story tracker waits while the readout shows");
  t.check(
    reqs.some((r) => r.tick >= gave && r.m.from === "relics_bp" && r.m.steady === 45) && reqs.some((r) => r.m.from === "saga_bp" && r.m.steady === 20),
    "both steady lines send their rank",
  );

  // A plain note (no `steady`) still holds both.
  const noteAt = t.tick;
  sys.sendScriptEvent("realm:actionbar", JSON.stringify({ player: p.id, ticks: 80, from: "test_bp" }));
  await t.wait(75);
  t.log(`during an 80-tick note: ${meter(noteAt + 2, noteAt + 75).length} readouts, ${tracker(noteAt + 2, noteAt + 75).length} tracker lines`);
  t.check(meter(noteAt + 2, noteAt + 75).length === 0 && tracker(noteAt + 2, noteAt + 75).length === 0, "a note holds both steady lines");
  await t.waitUntil(() => meter(noteAt + 80).length > 0, { timeout: 60, message: "the readout comes back after the note" });

  // The meter goes away: the tracker gets the bar back once the readout's last request runs out.
  const away = t.tick;
  p.selectedSlotIndex = 4;
  await t.waitUntil(() => tracker(away).length > 0, { timeout: 120, message: "the tracker comes back after the meter is put away" });
  t.log(`the tracker came back ${tracker(away)[0].tick - away} ticks after the meter was put away`);
}
