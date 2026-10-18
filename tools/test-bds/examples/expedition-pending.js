// Expeditions: a dungeon box that couldn't be filled in (here: a restart mid-run while the world has its 10 ticking
// areas, so the box can't be loaded) keeps its slot closed. Before, it stayed closed until the next restart or an
// operator's /realm:expedition_reset, and players were told "An expedition is in progress ()" with no run listed.
// Now it's tried again every minute and when someone wants to start: once a ticking area is free, the box is filled
// in and the next run starts; meanwhile players are told the last dungeon is still being filled in.
// node tools/test-bds/run.mjs --quiet --flat --only expedition_bp --scenario tools/test-bds/examples/expedition-pending.js --timeout 900
export default async function (t) {
  t.formTimeout = 300;
  const spawn = t.world.getDefaultSpawnLocation();
  if (t.phase === 1) {
    const ann = await t.player("Ann", { op: true });
    const sx = Math.floor(ann.location.x) + 300;
    const sz = Math.floor(ann.location.z);
    await t.loadArea(sx, sz, { radius: 4 });
    t.assert(t.cmd(ann, `/realm:expedition_site ${sx} ${sz}`).ok, "site");
    await t.waitMessage(ann, /site set/i, { timeout: 200 });
    t.answerForm(ann, "Start an expedition", "Crypt", 0, "Start");
    t.cmd(ann, "/realm:expedition");
    await t.waitUntil(async () => ((await state(t))?.phase === "active" ? true : undefined), { timeout: 1200, interval: 20, message: "run active" });
    await t.wait(40);
    // Every ticking area goes (the dungeon's too), and ten others at world spawn take the world's whole allowance.
    t.server("/tickingarea remove_all");
    for (let k = 0; k < 10; k++) t.server(`/tickingarea add circle ${Math.floor(spawn.x) + k} 0 ${Math.floor(spawn.z)} 1 dummy_${k} true`);
    t.restart("restart mid-run with no ticking area left");
  }
  const p = await t.player("Bea", { op: true, x: Math.floor(spawn.x), z: Math.floor(spawn.z) });
  // The reset after the restart can't load the box (100 ticks, then a minute of waiting).
  await t.wait(1500);
  const st = await state(t);
  t.log(`after the restart: runs ${st?.runs}, pending ${st?.pending}`);
  t.assert(st?.pending === 1, "the box is still waiting to be filled in");
  t.check(t.messages(p).some((m) => /couldn't be loaded to fill it in/.test(m.plain)), "operators are told the box couldn't be loaded");
  // A ticking area is free again; someone wants to start.
  t.server("/tickingarea remove dummy_9");
  t.answerForm(p, "Start an expedition", "Crypt", 0, "Back");
  t.cmd(p, "/realm:expedition");
  await t.wait(60);
  const said = [...t.messages(p).map((m) => m.plain), ...t.forms(p).map((f) => f.body ?? "")].filter((m) => /in progress|being filled in/i.test(m));
  t.log(`told: ${said.join(" / ")}`);
  t.check(said.some((m) => /still being filled in/.test(m)), "the player is told the last dungeon is still being filled in");
  t.check(!said.some((m) => /in progress \(\)/.test(m)), "no empty 'in progress ()'");
  const reset = await t.waitUntil(async () => { const s = await state(t); return s?.pending === 0 ? s : undefined; }, { timeout: 1600, interval: 40, message: "box reset once a ticking area is free" }).catch(() => undefined);
  t.check(!!reset, "the box is filled in without a restart");
  if (!reset) return;
  t.answerForm(p, "Start an expedition", "Crypt", 0, "Start");
  t.cmd(p, "/realm:expedition");
  const next = await t.waitUntil(async () => ((await state(t))?.phase === "active" ? true : undefined), { timeout: 1200, interval: 20, message: "next run active" }).catch(() => undefined);
  t.check(!!next, "the next run starts");
  t.cmd(p, "/realm:expedition_leave");
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
