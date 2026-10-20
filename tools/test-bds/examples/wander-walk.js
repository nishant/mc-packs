// Wanderers of the Wilds (wander_bp): wanderers walk. A Stranger pilgrim is a villager dressed as a cleric that
// strolls, is pulled back past the 12-block tether, and stands still while you talk; a tap opens the wanderer's
// menu, never trades (a real villager next to it still gets the tap); zombies and lightning can't make it a zombie
// villager or a witch; a traveler is a wandering trader without its llamas, spawned again if it vanishes nearby;
// a drowned sailor dressed as a fisherman drops its disguise into a fight; Hob's camp villager comes back after a restart
// and a stray walker is swept.
//   node tools/test-bds/run.mjs --quiet --only wander_bp,saga_bp,relics_bp --scenario tools/test-bds/examples/wander-walk.js --timeout 900
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
  const sdebug = (m) => sys.sendScriptEvent("realm:saga_debug", JSON.stringify(m));
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
  const spawnFor = async (p, opts) => {
    const since = t.tick;
    // Facing each way in turn until there's a spot to stand on ahead.
    for (const yaw of [0, 90, 180, 270, 45, 135, 225, 315]) {
      p.teleport(p.location, { rotation: { x: 0, y: yaw } });
      await t.wait(2);
      wdebug({ player: p.id, action: "spawn", ...opts });
      await t.wait(10);
      if (of("realm:wander_spawn", (m) => m.player === p.id, since).length) break;
    }
    await t.waitUntil(() => of("realm:wander_spawn", (m) => m.player === p.id, since).length > 0, { timeout: 60, message: `someone appears (${JSON.stringify(opts)})` });
    const m = of("realm:wander_spawn", (m) => m.player === p.id, since)[0];
    await t.waitUntil(() => ents(`wander:k:${m.wid}`).length === 1, { timeout: 40, message: "their entity" });
    return { m, e: ents(`wander:k:${m.wid}`)[0] };
  };
  const X = 1500, Z = 1500;

  if (t.phase === 2) {
    const p = await t.player("Back", { op: true, x: X, z: Z });
    await t.loadArea(X, Z, { radius: 3 });
    await t.wait(60);
    t.check(ents("wander:k:stray").length === 0, "the stray walker (a villager) was swept at load");
    sdebug({ player: p.id, action: "jump", story: "w_hob_tales", chapter: "mule" });
    await t.waitUntil(() => of("realm:wander_state", (m) => m.player === p.id && m.ch.hob === "o").length > 0, { timeout: 400, message: "Back is on Hob's chain" });
    sys.sendScriptEvent("realm:place_ping", "{}");
    await t.waitUntil(() => of("realm:place_ready", (m) => m.wid === "hob" && m.state === "built").length > 0, { timeout: 200, message: "Hob's camp still built" });
    const camp = of("realm:place_ready", (m) => m.wid === "hob" && m.state === "built").at(-1);
    // The phase-1 ticking areas are removed at the restart and a simulated player loads no chunks: load the camp.
    await t.loadArea(camp.x, camp.z, { radius: 2 });
    p.teleport({ x: camp.x + 3, y: camp.y + 1, z: camp.z });
    await t.waitUntil(() => ents("wander:c:hob").length === 1, { timeout: 400, message: "Hob is at his camp after the restart" });
    await t.wait(5);
    const hob = ents("wander:c:hob")[0];
    t.check(hob.typeId === "minecraft:villager_v2" && hob.matches({ families: ["toolsmith"] }), `Hob is a toolsmith villager after the restart (${hob.typeId})`);
    t.pass("phase 2");
    return;
  }

  t.server("/difficulty hard");
  await t.loadArea(X, Z, { radius: 4 });
  const p = await t.player("Tester", { op: true, x: X, z: Z });
  // The zombie and the lightning below are for the wanderer: on hard they could kill Tester standing next to it, and a
  // dead player gets no story dialog (Story Questlines' exclusive()), so Hob's chain could never be accepted.
  p.addEffect("resistance", 20000, { amplifier: 255, showParticles: false });
  p.addEffect("fire_resistance", 20000, { amplifier: 0, showParticles: false });
  await t.wait(20);
  p.teleport({ x: X + 0.5, y: p.location.y, z: Z + 0.5 }, { rotation: { x: 0, y: 0 } });
  await t.waitUntil(() => of("realm:wander_state", (m) => m.player === p.id).length > 0, { timeout: 300, message: "saga sends realm:wander_state" });

  // --- A pilgrim Stranger: a villager in a cleric's look, protected, walking.
  let { m: s1, e: v } = await spawnFor(p, { archetype: "pilgrim", stranger: true });
  await t.wait(5);
  t.log("pilgrim:", s1.name, v.typeId, v.nameTag);
  t.check(v.typeId === "minecraft:villager_v2", "a pilgrim Stranger is a villager");
  t.check(v.matches({ families: ["cleric"] }), "dressed as a cleric");
  t.check(!v.hasComponent("minecraft:is_baby"), "an adult");
  t.check(!!v.getEffect("resistance") && v.getEffect("resistance").amplifier >= 4, "Resistance V");
  t.check(v.hasTag("realm:npc") && v.hasTag("realm:npc_owner:wander_bp"), "tagged as ours");
  const home = { x: s1.x, y: s1.y, z: s1.z };
  p.teleport({ x: home.x + 6, y: home.y + 1, z: home.z }); // near, so the chunk ticks
  let moved = 0;
  await t.waitUntil(
    () => {
      const l = v.location;
      moved = Math.max(moved, Math.hypot(l.x - home.x, l.z - home.z));
      return moved > 1;
    },
    // Up to 2 minutes: a villager in its morning wander schedule can stand still for over a minute before its first
    // stroll (measured: 5 to 1395 ticks for ours, 35 to 1230 for a plain villager with the same name and effects).
    { timeout: 2400, interval: 5, message: "the villager walks on its own" },
  );
  t.log(`walked ${moved.toFixed(1)} blocks from its spot`);

  // Tether: 20 blocks out, back within a second.
  v.teleport({ x: home.x + 20, y: home.y + 2, z: home.z });
  await t.waitUntil(() => Math.hypot(v.location.x - home.x, v.location.z - home.z) <= 12.5, { timeout: 30, message: "pulled back past the tether" });
  // Water: pulled out too.
  t.server(`/fill ${Math.floor(home.x) + 3} ${home.y - 1} ${Math.floor(home.z)} ${Math.floor(home.x) + 3} ${home.y} ${Math.floor(home.z)} water`);
  v.teleport({ x: Math.floor(home.x) + 3.5, y: home.y, z: Math.floor(home.z) + 0.5 });
  await t.wait(2);
  await t.waitUntil(() => !v.isInWater, { timeout: 30, message: "out of the water" });

  // A tap: our menu, the villager stands still while it's open.
  const formP = t.waitForm(p, { timeout: 200 });
  wdebug({ player: p.id, action: "tap", wid: s1.wid });
  const f1 = await formP;
  t.check(f1.pack === "wander_bp" && f1.title.includes(s1.name.split(" ")[0]), `the wanderer's menu opens (${f1.pack}: ${f1.title})`);
  t.check((v.getEffect("slowness")?.amplifier ?? 0) >= 200, "stands still while you talk");
  f1.answer(null);
  await t.wait(5);
  t.check(!v.getEffect("slowness"), "walks again after");

  // A real tap with an item in hand: canceled for ours (no trade, afterEvents never fire), not for a real villager.
  const real = t.dimension.spawnEntity("minecraft:villager_v2", { x: p.location.x - 2, y: p.location.y, z: p.location.z });
  real.triggerEvent("minecraft:become_farmer");
  /** @type {string[]} */
  const tapped = [];
  t.world.afterEvents.playerInteractWithEntity.subscribe(({ target }) => tapped.push(target.id));
  let before = 0;
  t.world.beforeEvents.playerInteractWithEntity.subscribe(() => before++);
  p.giveItem(new t.mc.ItemStack("minecraft:stick", 1), true);
  await t.wait(2);
  v.teleport({ x: p.location.x + 1.5, y: p.location.y, z: p.location.z });
  v.addEffect("slowness", 60, { amplifier: 255 });
  real.addEffect("slowness", 60, { amplifier: 255 });
  await t.wait(2);
  const tapForm = t.waitForm(p, { timeout: 60 }).catch(() => undefined);
  const okOurs = p.interactWithEntity(v);
  const okReal = p.interactWithEntity(real);
  await t.wait(5);
  t.log(`interactWithEntity ours=${okOurs} real=${okReal}, beforeEvents ${before}, afterEvents: ${JSON.stringify(tapped)}`);
  if (before > 0) {
    t.check(tapped.includes(real.id), "a real villager's tap goes through (it can trade)");
    t.check(!tapped.includes(v.id), "our villager's tap is canceled (no trade screen)");
    const tf = await tapForm;
    t.check(!!tf && tf.pack === "wander_bp", "...and opens our menu");
    if (tf) tf.answer(null);
  } else {
    t.log("simulated taps fire no interact events here: checked through the debug tap above");
    // A menu the tap opened anyway (the test pack loads after wander_bp, which canceled it) is closed, so it doesn't
    // hold the wanderer's per-player lock for the shim's 60 seconds.
    const tf = await tapForm;
    if (tf) tf.answer(null);
  }
  real.remove();

  // Zombies can't hurt it or make a zombie villager of it.
  const zombie = t.dimension.spawnEntity("minecraft:zombie", { x: v.location.x + 1, y: v.location.y, z: v.location.z });
  zombie.addEffect("fire_resistance", 2000, { showParticles: false }); // it's morning: don't let it burn up mid-test
  for (let i = 0; i < 6; i++) {
    try {
      v.applyDamage(8, { cause: t.mc.EntityDamageCause.entityAttack, damagingEntity: zombie });
    } catch {}
    await t.wait(10);
  }
  await t.seconds(5); // and let the zombie go at it
  t.check(v.isValid && v.typeId === "minecraft:villager_v2", "still a villager after a zombie's attacks");
  t.check(v.getComponent("minecraft:health").currentValue >= 20, "at full health");
  t.check(t.dimension.getEntities({ type: "minecraft:zombie_villager_v2", location: v.location, maxDistance: 16 }).length === 0, "no zombie villager");
  if (zombie.isValid) zombie.remove();

  // Lightning: the witch it would become is removed and the wanderer comes back.
  const oldId = v.id;
  t.server(`/summon lightning_bolt ${v.location.x} ${v.location.y} ${v.location.z}`);
  await t.waitUntil(() => !v.isValid, { timeout: 60, message: "lightning turns the villager" });
  await t.waitUntil(() => ents(`wander:k:${s1.wid}`).length === 1 && ents(`wander:k:${s1.wid}`)[0].id !== oldId, { timeout: 60, message: "the wanderer is spawned again after the lightning" });
  await t.wait(10);
  t.check(t.dimension.getEntities({ type: "minecraft:witch", location: home, maxDistance: 24 }).filter((w) => w.nameTag).length === 0, "no named witch left");
  v = ents(`wander:k:${s1.wid}`)[0];
  t.check(v.matches({ families: ["cleric"] }), "back as a cleric");
  t.cmd(p, "/realm:wander_clear");
  await t.waitUntil(() => ents(`wander:k:${s1.wid}`).length === 0, { timeout: 60, message: "wander_clear removes the walker" });

  p.teleport({ x: X + 0.5, y: (await t.loadArea(X, Z, { radius: 2 })).top.y + 1, z: Z + 0.5 }, { rotation: { x: 0, y: 0 } });
  await t.wait(20);
  // --- A traveler: a wandering trader, no llamas; it stays (or comes back) with the player 40 blocks off.
  const { m: s2, e: tr } = await spawnFor(p, { archetype: "traveler", stranger: true });
  t.check(tr.typeId === "minecraft:wandering_trader", `a traveler is a wandering trader (${tr.typeId})`);
  await t.wait(10);
  t.check(t.dimension.getEntities({ type: "minecraft:trader_llama", location: tr.location, maxDistance: 16 }).length === 0, "its llamas are removed");
  p.teleport({ x: s2.x + 40, y: s2.y + 30, z: s2.z });
  p.addEffect("slow_falling", 2000, { showParticles: false });
  await t.seconds(20);
  t.check(ents(`wander:k:${s2.wid}`).length === 1, "the trader is still there (or back) with the player 40 blocks away");
  t.check(of("realm:wander_gone", (m) => m.wid === s2.wid).length === 0, "and hasn't left");
  t.cmd(p, "/realm:wander_clear");
  await t.waitUntil(() => ents(`wander:k:${s2.wid}`).length === 0, { timeout: 60, message: "the trader leaves" });

  // --- A drowned sailor in disguise: a fisherman villager that drops its disguise into a fight.
  sdebug({ player: p.id, action: "finish", story: "drowned_bell" });
  sdebug({ player: p.id, action: "finish", story: "last_map" });
  await t.waitUntil(() => of("realm:wander_state", (m) => m.player === p.id && m.h.includes("sailor")).length > 0, { timeout: 200, message: "hostiles allowed after the prologue" });
  p.teleport({ x: X + 0.5, y: (await t.loadArea(X, Z, { radius: 2 })).top.y + 1, z: Z + 0.5 }, { rotation: { x: 0, y: 0 } });
  await t.wait(40);
  const { m: h, e: spy } = await spawnFor(p, { archetype: "pilgrim", hostile: "sailor" });
  await t.wait(5);
  t.check(spy.typeId === "minecraft:villager_v2" && spy.matches({ families: ["fisherman"] }), "the sailor is a fisherman villager");
  p.teleport({ x: h.x + 2, y: h.y, z: h.z });
  await t.wait(10);
  let since = t.tick;
  wdebug({ player: p.id, action: "accuse", wid: h.wid });
  await t.waitUntil(() => of("realm:wander_turn", (m) => m.wid === h.wid, since).length > 0, { timeout: 60, message: "the sailor turns" });
  await t.waitUntil(() => ents(`wander:k:${h.wid}`).length === 0, { timeout: 40, message: "the villager is gone" });
  await t.waitUntil(() => ents(`realm:saga:wh_${h.wid}`).length > 0, { timeout: 300, message: "the fighter spawns" });
  for (const e of [...ents(`realm:saga:wh_${h.wid}`), ...ents("saga:add")]) e.remove();
  await t.wait(20);

  // --- Hob's camp: a villager (toolsmith look) that walks within his tether.
  await t.wait(200); // past the cooldown rules (the debug spawn skips them anyway)
  // Back to the loaded middle first: the sailor's spot can be near the edge of the loaded area, and a simulated
  // player loads no chunks, so every spot ahead of it could be unloaded ("no spot to stand on ahead").
  p.teleport({ x: X + 0.5, y: (await t.loadArea(X, Z, { radius: 2 })).top.y + 1, z: Z + 0.5 }, { rotation: { x: 0, y: 0 } });
  await t.wait(20);
  t.assert((p.getComponent("minecraft:health")?.currentValue ?? 0) > 0, "Tester is alive for Hob's talk");
  const { m: hm } = await spawnFor(p, { named: "hob" });
  t.check(hm.wid === "hob", `Hob appears (${hm.wid})`);
  await t.wait(10);
  t.check(ents("wander:k:hob")[0]?.typeId === "minecraft:villager_v2", "Hob on the road is a villager");
  await talk(p, "hob", "Hob's Tall Tales");
  await walk(p, "Accept");
  await t.waitUntil(() => of("realm:place_ready", (m) => m.wid === "hob" && m.state === "built").length > 0, { timeout: 600, message: "Hob's camp is built" });
  const camp = of("realm:place_ready", (m) => m.wid === "hob" && m.state === "built").at(-1);
  p.teleport({ x: camp.x + 3, y: camp.y + 1, z: camp.z });
  await t.waitUntil(() => ents("wander:c:hob").length === 1, { timeout: 400, message: "Hob stands at his camp" });
  await t.wait(5); // the look applies a tick after the spawn
  const hob = ents("wander:c:hob")[0];
  t.log("camp Hob:", hob.typeId, hob.getComponent("minecraft:variant")?.value, JSON.stringify(hob.getComponent("minecraft:type_family")?.getTypeFamilies()));
  t.check(hob.typeId === "minecraft:villager_v2" && hob.matches({ families: ["toolsmith"] }), "camp Hob is a toolsmith villager");
  // Removed somehow (a kill): he comes back.
  hob.kill();
  await t.waitUntil(() => ents("wander:c:hob").length === 1 && ents("wander:c:hob")[0].id !== hob.id, { timeout: 200, message: "Hob comes back to his camp after being killed" });

  // A stray villager of ours for the sweep, then restart.
  const stray = t.dimension.spawnEntity("minecraft:villager_v2", { x: X + 0.5, y: p.location.y, z: Z + 4.5 });
  stray.addTag("realm:npc_owner:wander_bp");
  stray.addTag("wander:k:stray");
  await t.wait(40);
  t.restart("restart: sweep and camps with walkers");
}
