// Expeditions: with slots 2, the second dungeon is 132 blocks east of the site. A site 140 blocks west of world spawn
// passes the spawn check (124), but its second dungeon would sit right under spawn. Before, a second party got that
// box (dug under the spawn town); now that slot is never used: the second party is told an expedition is in
// progress, and setting the site says so.
// node tools/test-bds/run.mjs --quiet --flat --only expedition_bp --scenario tools/test-bds/examples/expedition-slot-spawn.js --timeout 600
const cfg = (t, key, value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `t${key}`, pack: "expedition_bp", key, value }));
export default async function (t) {
  t.formTimeout = 400;
  cfg(t, "slots", 2);
  const ann = await t.player("Ann", { op: true });
  const spawn = { x: Math.floor(ann.location.x) + 400, z: Math.floor(ann.location.z) };
  t.server(`/setworldspawn ${spawn.x} -60 ${spawn.z}`);
  const sx = spawn.x - 140;
  const sz = spawn.z;
  await t.loadArea(sx, sz, { radius: 4 });
  await t.loadArea(sx + 132, sz, { radius: 4 });
  t.assert(t.cmd(ann, `/realm:expedition_site ${sx} ${sz}`).ok, "site");
  await t.waitMessage(ann, /site set/i, { timeout: 200 });
  await t.wait(5);
  const notes = t.messages(ann).map((m) => m.plain).filter((m) => /Dungeon 2/.test(m));
  t.log(notes.join(" / "));
  t.check(notes.some((m) => /never used/.test(m)), "setting the site says dungeon 2 is too close to spawn");
  const bob = await t.player("Bob", { x: Math.floor(ann.location.x) + 4, z: sz });
  t.answerForm(ann, "Start an expedition", "Crypt", 0, "Start");
  t.cmd(ann, "/realm:expedition");
  await t.waitUntil(async () => ((await state(t, 0))?.phase === "active" ? true : undefined), { timeout: 1200, interval: 20, message: "first run active" });
  t.answerForm(bob, "Start an expedition", "Crypt", 0, "Start");
  t.cmd(bob, "/realm:expedition");
  await t.wait(200);
  const second = await state(t, 1);
  t.log(`slot 1: ${second?.phase}${second?.o ? ` at ${second.o.x}, ${second.o.z} size ${second.size}` : ""}`);
  if (second?.o) {
    const cx = second.o.x + second.size / 2;
    t.log(`second box center ${Math.round(Math.hypot(cx - spawn.x, second.o.z + second.size / 2 - spawn.z))} blocks from spawn`);
  }
  t.check(!second || second.phase === "none", "no second dungeon under world spawn");
  t.check(t.forms(bob).some((f) => /in progress/i.test(f.body ?? "")) || t.messages(bob).some((m) => /in progress/i.test(m.plain)), "the second party is told an expedition is in progress");
  const releaseAt = t.tick;
  t.cmd(ann, "/realm:expedition_leave");
  await t.waitMessage(bob, /dungeon is free now: starting yours/i, { since: releaseAt, timeout: 900 });
  await t.waitUntil(async () => (await state(t, 0))?.phase === "active", { timeout: 1200, interval: 20, message: "queued Bob starts in the safe first dungeon" });
  const queuedSecond = await state(t, 1);
  t.check(!queuedSecond || queuedSecond.phase === "none", "the queued run still never uses the dungeon under world spawn");
  t.assert(t.cmd(bob, "/realm:expedition_leave").ok, "Bob leaves his automatically started run");
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
