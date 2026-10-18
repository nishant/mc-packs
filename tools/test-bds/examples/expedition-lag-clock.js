// Expeditions: the run clock and time limit count game time, so a lagging server doesn't eat the party's time.
// The test pack makes every tick take about 60 ms more (about 9 TPS). Before, the clock ran on the wall clock: after
// 20 game seconds the bar already showed about 0:45, and a 17-minute limit was over after about 7 minutes of play.
// node tools/test-bds/run.mjs --quiet --flat --only expedition_bp --scenario tools/test-bds/examples/expedition-lag-clock.js --timeout 600
export default async function (t) {
  t.formTimeout = 300;
  t.echoActionBar = false;
  const ann = await t.player("Ann", { op: true });
  const sx = Math.floor(ann.location.x) + 300;
  const sz = Math.floor(ann.location.z);
  await t.loadArea(sx, sz, { radius: 4 });
  t.assert(t.cmd(ann, `/realm:expedition_site ${sx} ${sz}`).ok, "site");
  await t.waitMessage(ann, /site set/i, { timeout: 200 });
  t.answerForm(ann, "Start an expedition", "Crypt", 0, "Start");
  t.cmd(ann, "/realm:expedition");
  await t.waitUntil(async () => ((await state(t))?.phase === "active" ? true : undefined), { timeout: 1200, interval: 20, message: "run active" });
  // Lag: every tick busy-waits 60 ms in the test pack.
  const lag = t.system.runInterval(() => {
    const until = Date.now() + 60;
    while (Date.now() < until);
  }, 1);
  const t0 = t.tick;
  const w0 = Date.now();
  await t.wait(400);
  t.system.clearRun(lag);
  const game = (t.tick - t0) / 20;
  const wall = (Date.now() - w0) / 1000;
  const bars = t.messages(ann, { kind: "actionbar" }).map((m) => m.plain).filter((m) => /\d+:\d\d\/\d+:00/.test(m));
  const last = bars[bars.length - 1] ?? "";
  const m = last.match(/(\d+):(\d\d)\/(\d+):00/);
  const shown = m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  t.log(`${game} game s in ${wall.toFixed(1)} wall s; the bar shows ${m?.[0]} (${shown} s)`);
  t.check(wall > game * 1.5, `the server lagged (${wall.toFixed(1)} s for ${game} game s)`);
  t.check(shown <= game + 6, `the run clock counts game time (${shown} s shown after ${game} game s)`);
  t.cmd(ann, "/realm:expedition_leave");
  await t.waitUntil(async () => { const s = await state(t); return s?.runs === 0 && s.pending === 0 ? s : undefined; }, { timeout: 900, interval: 20, message: "reset" });
}
// shared helpers (pasted into each scenario: scenarios can't import)
async function state(t, slot) {
  const parts = [];
  let want = 0;
  const done = new Promise((res) => {
    const sub = t.system.afterEvents.scriptEventReceive.subscribe((ev) => {
      if (ev.id !== "realm:expedition_state") return;
      const m = JSON.parse(ev.message);
      parts[m.part] = m.data;
      want = m.parts;
      if (parts.filter((x) => x !== undefined).length === want) {
        t.system.afterEvents.scriptEventReceive.unsubscribe(sub);
        res(JSON.parse(parts.join("")));
      }
    });
  });
  t.system.sendScriptEvent("realm:expedition_debug", JSON.stringify(slot === undefined ? {} : { slot }));
  return Promise.race([done, t.wait(40).then(() => undefined)]);
}
