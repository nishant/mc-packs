// Expeditions: with every dungeon taken (slots 1), a second leader queues through the real picker/preview.
// After the first box is reset, the queued expedition starts automatically without a second command.
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
  const queuedAt = t.tick;
  t.answerForm(bob, "Start an expedition", "Crypt", 0, "Wait for a dungeon");
  t.cmd(bob, "/realm:expedition");
  await t.waitMessage(bob, /number 1 of 1 in line/i, { timeout: 200, since: queuedAt });
  t.check((await state(t))?.members?.includes("Ann"), "the queued request does not replace the active run");
  const since = t.tick;
  t.cmd(ann, "/realm:expedition_leave");
  const next = await t.waitUntil(async () => {
    const s = await state(t);
    return s?.phase === "active" && s.members?.includes("Bob") ? s : undefined;
  }, { timeout: 2400, interval: 20, message: "Bob's queued expedition starts after the reset" });
  t.check(next.members.length === 1 && !next.members.includes("Ann"), "the new run belongs to Bob, not the previous leader");
  await t.wait(10);
  const told = t.messages(bob, { since }).map((m) => m.plain).filter((m) => /free/i.test(m));
  t.log(`Bob was told: ${told.join(" / ") || "nothing"}`);
  t.check(told.some((m) => /dungeon is free.*starting yours/i.test(m)), "the queued leader is told the automatic start is being attempted");
  t.check(!t.messages(ann, { since }).some((m) => /dungeon is free/.test(m.plain)), "nobody who didn't ask is told");
  t.cmd(bob, "/realm:expedition_leave");
  await t.waitUntil(async () => { const s = await state(t); return s?.runs === 0 && s.pending === 0 ? s : undefined; }, { timeout: 900, interval: 20, message: "Bob's run resets" });
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
