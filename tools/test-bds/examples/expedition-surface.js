// Expeditions: someone standing where a dungeon is about to be built is moved out first, to the ground. In a flat world
// the ground (y -61) is below the dungeon, so "the surface above the site" wasn't found and the fallback was the world
// spawn as the game gives it, y 32767: Bob was dropped from the top of the sky. Now he's put on the ground under the
// box (and a world spawn with no fixed height is looked up on the ground).
// node tools/test-bds/run.mjs --quiet --flat --only expedition_bp --scenario tools/test-bds/examples/expedition-surface.js --timeout 600
export default async function (t) {
  t.formTimeout = 300;
  const ann = await t.player("Ann", { op: true });
  const sx = Math.floor(ann.location.x) + 300;
  const sz = Math.floor(ann.location.z);
  await t.loadArea(sx, sz, { radius: 4 });
  t.assert(t.cmd(ann, `/realm:expedition_site ${sx} ${sz}`).ok, "site");
  await t.waitMessage(ann, /site set/i, { timeout: 200 });
  // Bob stands on a little stone platform inside the dungeon's future box (y -41 and up).
  t.server(`/fill ${sx + 5} -42 ${sz + 5} ${sx + 7} -42 ${sz + 7} stone`);
  const bob = await t.player("Bob", { x: sx + 6, y: -41, z: sz + 6 });
  await t.wait(10);
  t.log(`Bob at ${Math.round(bob.location.x)}, ${Math.round(bob.location.y)}, ${Math.round(bob.location.z)}`);
  t.answerForm(ann, "Start an expedition", "Crypt", 0, "Start");
  t.cmd(ann, "/realm:expedition");
  await t.waitMessage(bob, /moved to the surface/i, { timeout: 1200 });
  await t.wait(5);
  const y = bob.location.y;
  t.log(`Bob moved to ${Math.round(bob.location.x)}, ${Math.round(y)}, ${Math.round(bob.location.z)}`);
  t.check(y > -64 && y < 320, `Bob is on the ground, not in the sky (y ${Math.round(y)})`);
  await t.waitUntil(async () => ((await state(t))?.phase === "active" ? true : undefined), { timeout: 1200, interval: 20, message: "run active" });
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
