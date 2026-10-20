// Wanderers of the Wilds (wander_bp): a camp's wanderer doesn't rubber-band (F42). Hob's chain sets up his camp on
// open flat ground; then for 5 minutes of daytime (villagers stroll by day) every tick his place is read and every
// jump of more than 2 blocks in one tick (a teleport: walking covers well under 1) counts as a snap-back. Before the
// tether steered, he walked 12 blocks out, was teleported to the middle and walked out again, over and over; now he
// stays at the camp (within 6 blocks nearly all the time, never past the 12-block limit) with at most one snap.
// The pack's own counter (realm:wander_debug "tether") is checked too where it exists.
//   node tools/test-bds/run.mjs --quiet --flat --only wander_bp,saga_bp --scenario tools/test-bds/examples/wander-tether.js --timeout 1200
export default async function (t) {
  const sys = t.system;
  /** @type {{ id: string, m: any, tick: number }[]} */
  const ev = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!id.startsWith("realm:wander_") && id !== "realm:place_ready") return;
      try {
        ev.push({ id, m: JSON.parse(message), tick: sys.currentTick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id, f = () => true, since = 0) => ev.filter((e) => e.id === id && e.tick >= since && f(e.m)).map((e) => e.m);
  const wdebug = (m) => sys.sendScriptEvent("realm:wander_debug", JSON.stringify(m));
  const ents = (tag) => {
    try {
      return t.dimension.getEntities({ tags: [tag] });
    } catch {
      return [];
    }
  };
  const walk = async (p, final) => {
    for (let i = 0; i < 12; i++) {
      const f = await t.waitForm(p, { timeout: 200 });
      const b = f.buttons.find((x) => x.replace(/§./g, "").toLowerCase().includes(final.toLowerCase()));
      if (b !== undefined) {
        f.answer(b);
        return f;
      }
      f.answer("Next");
    }
    t.fail(`no "${final}" button`);
  };
  const talk = async (p, wid, label) => {
    const form = t.waitForm(p, { timeout: 200 });
    wdebug({ player: p.id, action: "tap", wid });
    const f = await form;
    f.answer(label);
    return f;
  };

  const X = 1500, Z = 1500;
  t.server("/difficulty peaceful");
  t.server("/gamerule dodaylightcycle false");
  t.server("/time set 1000"); // morning: villagers stroll
  await t.loadArea(X, Z, { radius: 4 });
  const p = await t.player("Tester", { op: true, x: X, z: Z });
  p.addEffect("resistance", 20000, { amplifier: 255, showParticles: false });
  await t.wait(20);
  p.teleport({ x: X + 0.5, y: p.location.y, z: Z + 0.5 }, { rotation: { x: 0, y: 0 } });
  await t.waitUntil(() => of("realm:wander_state", (m) => m.player === p.id).length > 0, { timeout: 300, message: "saga sends realm:wander_state" });

  // Hob appears and offers his chain; accepting it builds his camp near where he stood.
  let since = t.tick;
  for (const yaw of [0, 90, 180, 270]) {
    p.teleport(p.location, { rotation: { x: 0, y: yaw } });
    await t.wait(2);
    wdebug({ player: p.id, action: "spawn", named: "hob" });
    await t.wait(10);
    if (of("realm:wander_spawn", (m) => m.wid === "hob", since).length) break;
  }
  await t.waitUntil(() => of("realm:wander_spawn", (m) => m.wid === "hob", since).length > 0, { timeout: 60, message: "Hob appears" });
  await t.wait(10);
  await talk(p, "hob", "Hob's Tall Tales");
  await walk(p, "Accept");
  await t.waitUntil(() => of("realm:place_ready", (m) => m.wid === "hob" && m.state === "built").length > 0, { timeout: 600, message: "Hob's camp is built" });
  const camp = of("realm:place_ready", (m) => m.wid === "hob" && m.state === "built").at(-1);
  t.log("camp:", JSON.stringify(camp));
  await t.loadArea(camp.x, camp.z, { radius: 2 });
  p.teleport({ x: camp.x + 6, y: camp.y + 1, z: camp.z });
  await t.waitUntil(() => ents("wander:c:hob").length === 1, { timeout: 400, message: "Hob stands at his camp" });
  const home = { x: Math.floor(camp.x) + 0.5, y: Math.floor(camp.y), z: Math.floor(camp.z) + 0.5 };

  // Five minutes at the camp, read every tick.
  const TICKS = 5 * 60 * 20;
  let hob;
  let last;
  let snaps = 0;
  let samples = 0;
  let near = 0;
  let max = 0;
  for (let i = 0; i < TICKS; i++) {
    await t.wait(1);
    if (!hob || !hob.isValid) {
      hob = ents("wander:c:hob")[0];
      last = undefined;
      if (!hob) continue;
    }
    let l;
    try {
      l = hob.location;
    } catch {
      hob = undefined;
      continue;
    }
    if (last && Math.hypot(l.x - last.x, l.y - last.y, l.z - last.z) > 2) {
      snaps++;
      t.log(`tick ${i}: Hob jumped from ${last.x.toFixed(1)},${last.z.toFixed(1)} to ${l.x.toFixed(1)},${l.z.toFixed(1)}`);
    }
    last = { x: l.x, y: l.y, z: l.z };
    const d = Math.hypot(l.x - home.x, l.z - home.z);
    samples++;
    if (d <= 6) near++;
    max = Math.max(max, d);
  }
  t.log(`5 minutes: ${samples} samples, ${snaps} snap-backs, ${near} within 6 blocks, farthest ${max.toFixed(1)} blocks`);
  t.check(samples >= TICKS * 0.9, `Hob was at his camp the whole time (${samples} of ${TICKS} ticks)`);
  t.check(snaps <= 1, `no rubber-banding: ${snaps} snap-backs in 5 minutes`);
  t.check(near >= samples * 0.9, `Hob stays at his camp: ${near} of ${samples} ticks within 6 blocks`);
  t.check(max <= 12.5, `never past the 12-block limit (farthest ${max.toFixed(1)})`);

  // The pack's own counters, where the pack has them.
  since = t.tick;
  wdebug({ action: "tether" });
  await t.wait(10);
  const counters = of("realm:wander_tether", () => true, since).at(-1);
  if (counters) {
    t.log("tether counters:", JSON.stringify(counters));
    t.check((counters.camp?.snaps ?? 0) <= 1, `the camp tether teleported ${counters.camp?.snaps} times`);
  } else t.log("this wander_bp has no tether counters (realm:wander_tether)");
  t.pass("camp wanderer stays put");
}
