// Expeditions: with every dungeon taken (slots 1), a second party's leader is turned away and, once the first run is
// over and its box filled in, is told a dungeon is free. Before, they had to keep trying.
// node tools/test-bds/run.mjs --quiet --flat --only expedition_bp --scenario tools/test-bds/examples/expedition-queue.js --timeout 600
export default async function (t) {
  t.formTimeout = 300;
  const ann = await t.player("Ann", { op: true });
  const sx = Math.floor(ann.location.x) + 300;
  const sz = Math.floor(ann.location.z);
  await t.loadArea(sx, sz, { radius: 4 });
  t.assert(t.cmd(ann, `/realm:expedition_site ${sx} ${sz}`).ok, "site");
  await t.waitMessage(ann, /site set/i, { timeout: 200 });
  const bob = await t.player("Bob", { x: Math.floor(ann.location.x) + 4, z: sz });
  t.answerForm(ann, "Start an expedition", "Crypt", 0, "Start");
  t.cmd(ann, "/realm:expedition");
  await t.waitUntil(async () => ((await state(t))?.phase === "active" ? true : undefined), { timeout: 1200, interval: 20, message: "run active" });
  t.answerForm(bob, "Start an expedition");
  t.cmd(bob, "/realm:expedition");
  await t.waitMessage(bob, /in progress/i, { timeout: 100 });
  const since = t.tick;
  t.cmd(ann, "/realm:expedition_leave");
  await t.waitUntil(async () => { const s = await state(t); return s?.runs === 0 && s.pending === 0 ? s : undefined; }, { timeout: 900, interval: 20, message: "reset" });
  await t.wait(10);
  const told = t.messages(bob, { since }).map((m) => m.plain).filter((m) => /free/i.test(m));
  t.log(`Bob was told: ${told.join(" / ") || "nothing"}`);
  t.check(told.some((m) => /dungeon is free/.test(m)), "the waiting leader is told a dungeon is free");
  t.check(!t.messages(ann, { since }).some((m) => /dungeon is free/.test(m.plain)), "nobody who didn't ask is told");
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
