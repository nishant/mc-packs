// Parties 1.2.0 + Coordinates HUD 1.3.0: with the Coordinates HUD on, the Party HUD's line goes under the coordinates
// (realm:hud_line) instead of taking the action bar every 2 seconds, which paused the coordinates for good.
//   node tools/test-bds/run.mjs --quiet --only hud_bp,party_bp --scenario tools/test-bds/examples/party-hud-coords.js --timeout 600
export default async function (t) {
  const sys = t.system;
  const ann = await t.player("Ann", { op: true, x: 163, z: 170 });
  const bob = await t.player("Bob", { x: 165, z: 170 });
  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "h1", pack: "hud_bp", key: "on", value: true, player: ann.id }));
  let since = t.tick;
  t.assert(t.cmd(ann, "/realm:party_invite Bob").ok, "invite ran");
  await t.waitMessage(bob, /Ann invited you/, { since });
  t.assert(t.cmd(bob, "/realm:party_accept").ok, "accept ran");
  await t.wait(200);
  since = t.tick;
  await t.wait(200);
  const bars = t.messages(ann, { since }).filter((m) => m.kind === "actionbar");
  t.log(`Ann's bar: ${JSON.stringify(bars.at(-1)?.text)}`);
  t.check(bars.length > 0 && bars.every((m) => m.pack === "hud_bp"), `only the Coordinates HUD writes Ann's bar (${[...new Set(bars.map((m) => m.pack))]})`);
  t.check(bars.some((m) => /X -?\d+ {2}Y -?\d+ {2}Z -?\d+/.test(m.text.replace(/§./g, "")) && /\| {2}Bob .*hp/.test(m.text.replace(/§./g, ""))), "the coordinates and the party line in one line");
  const bobBars = t.messages(bob, { since }).filter((m) => m.kind === "actionbar");
  t.check(bobBars.some((m) => m.pack === "party_bp" && /Ann/.test(m.text)), "without the Coordinates HUD, the Party HUD still uses the bar");
}
