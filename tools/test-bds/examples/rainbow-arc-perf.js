// UTL-02 measurement: players (default 10, --arg players=N: 10 and 40 are the measured counts) stand 15 to 35 blocks
// from a rainbow's end for 120 s (--arg seconds), so the little rainbow over the pot of gold is drawn the whole time
// (it is drawn while an unfound pot has a player within 96 blocks). Nobody comes within 3 blocks, so the pot stays
// unfound. Profile it before and after (rainbow_bp's ms/tick and slowest tick: the arc's spawnParticle calls):
//   node tools/test-bds/run.mjs --quiet --no-relay --profile --profile-json tools/test-bds/logs/rainbow-arc-perf.json --only rainbow_bp --scenario tools/test-bds/examples/rainbow-arc-perf.js --timeout 3000
export default async function (t) {
  const { system } = t.mc;
  /** @type {any} */ let ev;
  /** @type {any[]} */ const pots = [];
  system.afterEvents.scriptEventReceive.subscribe((e) => {
    if (e.id === "realm:sky_event") {
      const m = JSON.parse(e.message);
      if (m.kind === "rainbow") ev = m;
    } else if (e.id === "realm:rainbow_pot") pots.push(JSON.parse(e.message));
  });
  const op = await t.player("Ann", { op: true, gameMode: "creative" });
  t.assert(t.cmd(op, "/realm:rainbow_now").ok, "/realm:rainbow_now ran");
  await t.waitUntil(() => ev, { timeout: 100, message: "the rainbow's sky_event" });
  t.log(`end at ${ev.x}, ${ev.z}`);
  const s = op.location;
  const dx = ev.x + 0.5 - s.x, dz = ev.z + 0.5 - s.z, D = Math.hypot(dx, dz) || 1;
  // A spot 25 blocks short of the end, on the side the operator came from; everyone stands around it.
  const hx = ev.x + 0.5 - (dx / D) * 25, hz = ev.z + 0.5 - (dz / D) * 25;
  const { top } = await t.loadArea(hx, hz, { radius: 3 });
  op.teleport({ x: hx, y: (top?.y ?? 70) + 1, z: hz });
  await t.loadArea(ev.x, ev.z, { radius: 2 });
  const players = Math.max(1, Number(t.args?.players ?? 10) || 10);
  for (let i = 0; i < players - 1; i++) {
    // 15 to 35 blocks from the end: in the arc's 96 blocks, never within the 3 that find the pot.
    const a = (i / Math.max(1, players - 1)) * Math.PI - Math.PI / 2 + Math.atan2(-dz, -dx);
    const r = 15 + (i % 5) * 5;
    await t.player(`R${i}`, { x: ev.x + 0.5 + Math.cos(a) * r, z: ev.z + 0.5 + Math.sin(a) * r, settle: 1 });
  }
  // The chest is placed once someone is within 40 blocks (a job over a few seconds), or the pot is marked missed.
  await t.seconds(10);
  const seconds = Math.max(10, Number(t.args?.seconds ?? 120) || 120);
  t.log(`holding ${players} players near the pot for ${seconds} s`);
  await t.seconds(seconds);
  const last = pots[pots.length - 1];
  t.check(last && last.x !== undefined, `the pot is still up and unfound: ${JSON.stringify(last)}`);
}
