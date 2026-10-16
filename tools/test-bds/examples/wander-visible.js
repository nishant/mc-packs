// Wanderers of the Wilds (wander_bp): a traveler (a wandering trader) stays visible. Vanilla wandering traders drink
// a Potion of Invisibility whenever a zombie or illager comes within 6 blocks; ours vanished that way after a talk
// and an accepted request, leaving the name, sparkles and map dot. A plain trader next to it still drinks (the
// vanilla trigger fires here); ours never goes invisible, and one already invisible shows again within a second.
//   node tools/test-bds/run.mjs --quiet --only wander_bp,saga_bp --scenario tools/test-bds/examples/wander-visible.js --timeout 600
export default async function (t) {
  const sys = t.system;
  /** @type {{ id: string, m: any, tick: number }[]} */
  const ev = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!id.startsWith("realm:wander_")) return;
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
  const X = 900, Z = 900;

  await t.loadArea(X, Z, { radius: 3 });
  const p = await t.player("Tester", { op: true, x: X, z: Z });
  t.server("/difficulty normal");
  t.server("/time set 1000");
  await t.wait(20);
  p.teleport({ x: X + 0.5, y: p.location.y, z: Z + 0.5 }, { rotation: { x: 0, y: 0 } });
  await t.waitUntil(() => of("realm:wander_state", (m) => m.player === p.id).length > 0, { timeout: 300, message: "saga sends realm:wander_state" });

  // A traveler Stranger: talk, accept the request.
  let since = t.tick;
  for (const yaw of [0, 90, 180, 270]) {
    p.teleport(p.location, { rotation: { x: 0, y: yaw } });
    await t.wait(2);
    wdebug({ player: p.id, action: "spawn", archetype: "traveler", stranger: true });
    await t.wait(10);
    if (of("realm:wander_spawn", (m) => m.player === p.id, since).length) break;
  }
  await t.waitUntil(() => of("realm:wander_spawn", (m) => m.player === p.id, since).length > 0, { timeout: 60, message: "a stranger appears" });
  const s = of("realm:wander_spawn", (m) => m.player === p.id, since)[0];
  await t.waitUntil(() => ents(`wander:k:${s.wid}`).length === 1, { timeout: 40, message: "their entity" });
  const tr = ents(`wander:k:${s.wid}`)[0];
  t.check(tr.typeId === "minecraft:wandering_trader", `a traveler is a wandering trader (${tr.typeId})`);
  p.teleport({ x: s.x + 3, y: s.y, z: s.z });
  await t.wait(10);
  await talk(p, s.wid, "Request:");
  await walk(p, "Accept");
  await t.waitUntil(() => of("realm:wander_done", (m) => m.wid === s.wid && m.how === "accepted").length > 0, { timeout: 100, message: "the request is accepted" });
  t.check(!tr.getEffect("invisibility"), "visible after the talk and the accept");

  // A plain wandering trader beside it, and a zombie that can't hurt or burn, kept next to both.
  const plain = t.dimension.spawnEntity("minecraft:wandering_trader", { x: tr.location.x + 1.5, y: tr.location.y, z: tr.location.z });
  plain.addEffect("resistance", 4000, { amplifier: 4, showParticles: false });
  const z = t.dimension.spawnEntity("minecraft:zombie", { x: tr.location.x, y: tr.location.y, z: tr.location.z + 2 });
  z.addEffect("fire_resistance", 4000, { showParticles: false });
  z.addEffect("weakness", 4000, { amplifier: 250, showParticles: false });
  z.addEffect("slowness", 4000, { amplifier: 255, showParticles: false });
  let ours = 0;
  let theirs = 0;
  for (let i = 0; i < 40; i++) {
    try {
      if (z.isValid && tr.isValid) z.teleport({ x: tr.location.x, y: tr.location.y, z: tr.location.z + 2 });
      if (plain.isValid && tr.isValid && Math.hypot(plain.location.x - tr.location.x, plain.location.z - tr.location.z) > 3) plain.teleport({ x: tr.location.x + 1.5, y: tr.location.y, z: tr.location.z });
    } catch {}
    await t.wait(10);
    if (tr.isValid && tr.getEffect("invisibility")) ours++;
    if (plain.isValid && plain.getEffect("invisibility")) theirs++;
    if (theirs >= 3 && i >= 20) break;
  }
  t.log(`checks with invisibility: ours ${ours}, plain trader ${theirs}`);
  t.check(theirs > 0, "a plain wandering trader drinks invisibility with a zombie near (the vanilla trigger fired)");
  t.check(ours === 0, "our trader never goes invisible");
  t.check(tr.isValid && ents(`wander:k:${s.wid}`).length === 1, "and is still there");

  // Already invisible (a world saved that way): shows again within a second or two.
  if (z.isValid) z.remove();
  try {
    t.server(`/effect @e[tag=\"wander:k:${s.wid}\"] invisibility 120 0 true`);
  } catch {}
  await t.wait(5);
  t.log(`after /effect: invisible ${!!tr.getEffect("invisibility")}`);
  await t.waitUntil(() => !tr.getEffect("invisibility"), { timeout: 60, message: "an invisible wanderer shows again" });
  if (plain.isValid) plain.remove();
  t.cmd(p, "/realm:wander_clear");
  t.pass("visible");
}
