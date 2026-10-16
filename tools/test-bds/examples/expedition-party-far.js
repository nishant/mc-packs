// Expeditions: the whole party is asked, wherever they are (partyRadius 0, the default). Ann starts an Easy run;
// Bea is 400 blocks away, Cal is in the Nether, Dee stands next to Ann and Eve, also near, says no. Bea, Cal and Dee
// get the Join popup and come along; Eve stays. After an operator reset each is back where they were, in their own
// dimension.
// node tools/test-bds/run.mjs --quiet --flat --only expedition_bp --scenario tools/test-bds/examples/expedition-party-far.js --timeout 600
export default async function (t) {
  t.formTimeout = 400;
  const ann = await t.player("Ann", { op: true });
  const ax = Math.floor(ann.location.x);
  const az = Math.floor(ann.location.z);
  const sx = ax + 300;
  await t.loadArea(sx, az, { radius: 4 });
  t.assert(t.cmd(ann, `/realm:expedition_site ${sx} ${az}`).ok, "site");
  await t.waitMessage(ann, /site set/i, { timeout: 200 });
  await t.loadArea(ax - 400, az, { radius: 1 });
  const bea = await t.player("Bea", { x: ax - 400, z: az });
  const cal = await t.player("Cal", { x: ax + 3, z: az });
  const dee = await t.player("Dee", { x: ax + 2, z: az });
  const eve = await t.player("Eve", { x: ax - 2, z: az });
  const nether = t.world.getDimension("nether");
  t.server("/execute in nether run tickingarea add circle 0 64 0 1 nethertest");
  await t.wait(40);
  t.server("/execute in nether run fill -2 63 -2 2 66 2 air");
  t.server("/execute in nether run fill -2 62 -2 2 62 2 netherrack");
  cal.teleport({ x: 0.5, y: 63, z: 0.5 }, { dimension: nether });
  await t.wait(20);
  t.check(cal.dimension.id === "minecraft:nether", `Cal is in the Nether (${cal.dimension.id})`);
  const home = new Map([bea, cal, dee].map((p) => [p.name, { d: p.dimension.id, x: p.location.x, z: p.location.z }]));
  for (const p of [ann, bea, cal, dee, eve]) p.addTag("realm_party:far1");
  for (const p of [bea, cal, dee]) t.answerForm(p, "Join");
  t.answerForm(eve, "Not this time");
  t.answerForm(ann, "Start an expedition", "Crypt", 0, "Start");
  const asked = t.waitMessage(ann, /Asking/, { timeout: 400 });
  t.cmd(ann, "/realm:expedition");
  const msg = await asked;
  t.log(msg.plain);
  for (const n of ["Bea", "Cal", "Dee", "Eve"]) t.check(msg.plain.includes(n), `${n} was asked`);
  const st = await t.waitUntil(async () => { const s = await state(t); return s?.phase === "active" ? s : undefined; }, { timeout: 1500, interval: 20, message: "run active" });
  await t.wait(40);
  for (const p of [ann, bea, cal, dee]) t.check(p.hasTag("realm_expedition"), `${p.name} is on the run`);
  t.check(!eve.hasTag("realm_expedition"), "Eve said no and stayed");
  t.check(cal.dimension.id === "minecraft:overworld", `Cal came over from the Nether (${cal.dimension.id})`);
  t.log(`members: ${JSON.stringify(st.members)}`);
  t.cmd(ann, "/realm:expedition_reset");
  await t.waitUntil(() => ![ann, bea, cal, dee].some((p) => p.hasTag("realm_expedition")) || undefined, { timeout: 600, interval: 20, message: "everyone out" });
  await t.wait(100);
  for (const p of [bea, cal, dee]) {
    const h = home.get(p.name);
    const d = Math.hypot(p.location.x - h.x, p.location.z - h.z);
    t.check(p.dimension.id === h.d && d < 3, `${p.name} back home in ${h.d} (${d.toFixed(1)} blocks off, now ${p.dimension.id})`);
  }
}

async function state(t) {
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
  t.system.sendScriptEvent("realm:expedition_debug", "{}");
  return Promise.race([done, t.wait(40).then(() => undefined)]);
}
