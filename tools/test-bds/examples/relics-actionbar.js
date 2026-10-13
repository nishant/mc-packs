// Relics: the Storm Meter readout (redrawn every second while held) is a steady line of the action bar protocol:
// it waits while another pack's note shows, and its own writes say `from: "relics_bp"`. Run with
//   node tools/test-bds/run.mjs --quiet --only relics_bp --scenario tools/test-bds/examples/relics-actionbar.js --timeout 300

export default async function (t) {
  const p = await t.player("Tester", { op: true });
  const since0 = t.tick;
  t.assert(t.cmd(p, "/realm:relics_give Tester storm_meter").ok, "relics_give ran");
  await t.waitMessage(p, /Storm Meter/i, { since: since0, timeout: 100 });
  p.selectedSlotIndex = 0;
  await t.waitMessage(p, /^Storm Meter:/, { kind: "actionbar", since: since0, timeout: 100 });
  t.log("the readout shows while held");

  // Another pack's note holds the bar for 100 ticks: the readout must not draw over it.
  const held = t.tick;
  t.server(`/scriptevent realm:actionbar ${JSON.stringify({ player: p.id, ticks: 100, from: "test_bp" })}`);
  await t.wait(90);
  const during = t.messages(p, { kind: "actionbar", pack: "relics_bp", since: held + 2 }).filter((m) => /^Storm Meter:/.test(m.plain));
  t.log(`readouts during another pack's note: ${during.length}`);
  t.check(during.length === 0, "the Storm Meter readout waits while another pack's note shows");

  // ...and comes back when the note ends.
  await t.waitMessage(p, /^Storm Meter:/, { kind: "actionbar", since: held + 100, timeout: 60 });
  t.log("the readout came back after the note");
}
