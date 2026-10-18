// Story Questlines escorts walk: Pell's "Road to the Chapel" escort is a villager in a cleric's clothes (not an NPC),
// can't be hurt, follows the player's trail in short steps (no step longer than about a block, every 2 ticks) facing
// the way he goes, and arrives. Lightning turns a villager into a witch: the witch goes and Pell is back. After a
// restart no story villager is left over. (Simulated players' taps fire no interact events, so "no trading" is
// checked in code: saga cancels every interaction with an entity tagged saga:actor.)
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp,wander_bp --scenario tools/test-bds/examples/saga-escort.js --timeout 600
export default async function (t) {
  const sys = t.system;
  /** @type {{ id: string, m: any, tick: number }[]} */
  const ev = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!["realm:wander_spawn", "realm:wander_state", "realm:wander_hide", "realm:place_ready"].includes(id)) return;
      try {
        ev.push({ id, m: JSON.parse(message), tick: sys.currentTick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  /** @type {string[]} */
  const turned = [];
  t.world.afterEvents.entitySpawn.subscribe(({ entity, cause }) => {
    try {
      if (cause === "Transformed") turned.push(`${entity.typeId} ${entity.nameTag}`);
    } catch {}
  });
  const of = (id, f = () => true, since = 0) => ev.filter((e) => e.id === id && e.tick >= since && f(e.m)).map((e) => e.m);
  const wdebug = (m) => sys.sendScriptEvent("realm:wander_debug", JSON.stringify(m));
  const sdebug = (m) => sys.sendScriptEvent("realm:saga_debug", JSON.stringify(m));
  const pells = () =>
    t.dimension
      .getEntities({ tags: ["saga:actor"], type: "minecraft:villager_v2" })
      .filter((e) => t.dimension.getEntities({ type: "realm:saga_label", tags: [`realm:saga_label_id:${e.id}`] }).some((h) => h.nameTag === "§ePell the Pilgrim"));
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
  const X = 900, Z = 900;

  if (t.phase === 2) {
    await t.loadArea(X, Z, { radius: 4 });
    await t.player("Back", { op: true, x: X, z: Z });
    await t.wait(60);
    const left = t.dimension.getEntities({ type: "minecraft:villager_v2" }).filter((e) => e.hasTag("saga:actor") || e.nameTag === "§ePell the Pilgrim");
    t.check(left.length === 0, `no story villager left over after the restart (${left.length})`);
    t.pass("phase 2");
    return;
  }

  t.server("/time set noon");
  t.server("/gamerule doDaylightCycle false");
  t.server("/gamerule doMobSpawning false");
  await t.loadArea(X, Z, { radius: 4 });
  await t.loadArea(X + 48, Z, { radius: 3 });
  const p = await t.player("Tester", { op: true, x: X, z: Z });
  await t.wait(20);
  const gy = Math.floor(p.location.y);

  // The Old Chapel 48 blocks east (set by an operator), Pell's chain at "The Road to the Chapel", walking.
  p.teleport({ x: X + 48.5, y: gy, z: Z + 0.5 });
  await t.wait(5);
  t.cmd(p, "/realm:saga_place old_chapel");
  await t.wait(20);
  p.teleport({ x: X + 0.5, y: gy, z: Z + 0.5 }, { rotation: { x: 0, y: -90 } });
  sdebug({ player: p.id, action: "finish", story: "drowned_bell" });
  sdebug({ player: p.id, action: "jump", story: "w_pell_road", chapter: "chapel", flags: { way: "walk" } });
  await t.waitUntil(() => of("realm:wander_state", (m) => m.player === p.id && m.ch.pell === "o").length > 0, { timeout: 300, message: "Pell's next chapter waits" });
  let since = t.tick;
  wdebug({ player: p.id, action: "spawn", named: "pell" });
  await t.waitUntil(() => of("realm:wander_spawn", (m) => m.wid === "pell", since).length > 0, { timeout: 60, message: "Pell appears on the road" });
  await t.wait(10);
  const form = t.waitForm(p, { timeout: 200 });
  wdebug({ player: p.id, action: "tap", wid: "pell" });
  const f = await form;
  t.log("Pell offers:", JSON.stringify(f.buttons));
  f.answer(f.buttons.find((b) => /Chapel|Long Road/.test(b)) ?? 0);
  await walk(p, "Accept");

  // The escort copy waits at Pell's camp (made where they met).
  await t.waitUntil(() => of("realm:place_ready", (m) => m.wid === "pell" && m.state === "built").length > 0, { timeout: 400, message: "Pell's camp is up" });
  const camp = of("realm:place_ready", (m) => m.wid === "pell" && m.state === "built").at(-1);
  p.teleport({ x: camp.x + 6.5, y: gy, z: camp.z + 0.5 }, { rotation: { x: 0, y: -90 } });
  await t.waitUntil(() => pells().length === 1, { timeout: 400, message: "Pell (the story's copy) waits at his camp" });
  const pell = pells()[0];
  t.log("Pell is", pell.typeId, "at", JSON.stringify(pell.location));
  t.check(pell.typeId === "minecraft:villager_v2", "the escorted Pell is a villager");
  await t.waitUntil(() => pell.matches({ families: ["cleric"] }), { timeout: 60, message: "dressed as a cleric" });
  // Can't be hurt.
  try {
    pell.applyDamage(30);
  } catch {}
  await t.wait(5);
  const hp = pell.getComponent("minecraft:health");
  t.check(pell.isValid && hp && hp.currentValue >= hp.effectiveMax - 0.01, `Pell can't be hurt (health ${hp?.currentValue}/${hp?.effectiveMax})`);
  // The name-label helper resends the marker with one more "§r" now and then (a fresh packet for the client): both count.
  t.check(/^§r(?:§[0-9a-f]){10}§r(?:§r)?$/i.test(pell.nameTag), `Pell carries a unique invisible format-code marker (${JSON.stringify(pell.nameTag)})`);

  // Walk up to him, then east to the chapel at about walking pace; sample his position every 2 ticks.
  since = t.tick;
  p.teleport({ x: pell.location.x + 1.5, y: pell.location.y, z: pell.location.z });
  await t.waitMessage(p, /follows you/, { since, timeout: 100 });
  const start = { ...p.location };
  const goal = { x: X + 48.5, z: Z + 0.5 };
  const steps = Math.ceil(Math.hypot(goal.x - start.x, goal.z - start.z) / 0.4);
  /** @type {{ x: number, y: number, z: number, yaw: number }[]} */
  const seen = [];
  let lightning = false;
  for (let i = 1; i <= steps + 60; i++) {
    const k = Math.min(1, i / steps);
    p.teleport({ x: start.x + (goal.x - start.x) * k, y: gy, z: start.z + (goal.z - start.z) * k }, { rotation: { x: 0, y: -90 } });
    await t.wait(2);
    const now = pells()[0];
    if (now) seen.push({ ...now.location, yaw: now.getRotation().y });
    if (!lightning && i === Math.floor(steps / 2) && now) {
      // Lightning: a villager becomes a witch.
      // Also place a foreign adult villager 1.2m away with bare "§r": the lightning bolt transforms BOTH Pell and the
      // adjacent foreign villager at the same time. saga_bp must remove/respawn ONLY Pell (by his unique per-actor
      // format-code marker) and leave the adjacent 1.2m foreign "§r" witch untouched.
      lightning = true;
      const adjVillager = t.dimension.spawnEntity("minecraft:villager_v2", {
        x: now.location.x + 1.2,
        y: now.location.y,
        z: now.location.z,
      }, { spawnEvent: "minecraft:spawn_from_village" });
      adjVillager.triggerEvent("minecraft:become_cleric");
      adjVillager.nameTag = "§r";
      adjVillager.addEffect("resistance", 2000, { amplifier: 4, showParticles: false });
      adjVillager.addEffect("fire_resistance", 2000, { amplifier: 0, showParticles: false });
      t.server(`/summon lightning_bolt ${now.location.x + 0.6} ${now.location.y} ${now.location.z}`);
      await t.waitUntil(() => !now.isValid, { timeout: 60, message: "lightning turns the villager" });
      await t.wait(5);
      t.log("transformed:", JSON.stringify(turned));
      t.check(turned.some((x) => x.startsWith("minecraft:witch §r§7§a")), "the lightning made a witch of Pell with his actor marker");
      const foreignWitches = t.dimension.getEntities({ type: "minecraft:witch" }).filter((w) => w.nameTag === "§r");
      t.check(foreignWitches.length === 1, `adjacent 1.2m foreign §r witch is NOT removed by saga_bp (found ${foreignWitches.length})`);
      for (const w of foreignWitches) if (w.isValid) w.remove();
      if (adjVillager.isValid) adjVillager.remove();
      t.check(
        t.dimension.getEntities({ type: "minecraft:witch" }).filter((w) => w.nameTag === "§ePell the Pilgrim" || /^§r§7§a/.test(w.nameTag)).length === 0,
        "no witch named Pell stays",
      );
      await t.waitUntil(() => pells().length === 1 && pells()[0].typeId === "minecraft:villager_v2", { timeout: 60, message: "Pell is back after the lightning" });
    }
    if (t.messages(p, { since }).some((m) => /Pell the Pilgrim is safe/.test(m.plain))) break;
  }
  await t.waitMessage(p, /Pell the Pilgrim is safe/, { since, timeout: 200 });
  // Smooth: consecutive samples (2 ticks apart) never jump far; he faces east (yaw about -90) while walking.
  let big = 0;
  let moving = 0;
  let facing = 0;
  for (let i = 1; i < seen.length; i++) {
    const d = Math.hypot(seen[i].x - seen[i - 1].x, seen[i].z - seen[i - 1].z);
    if (d > 1.3 && d < 8) big++; // (8+: the respawn after the lightning)
    if (d > 0.05) {
      moving++;
      if (Math.abs(((seen[i].yaw + 90 + 540) % 360) - 180) < 30) facing++;
    }
  }
  t.log(`samples ${seen.length}, moving ${moving}, steps over 1.3 blocks ${big}, facing east ${facing}`);
  t.check(moving > 10, "Pell walked (many small steps)");
  t.check(big <= 1, "no step longer than about a block");
  t.check(facing >= moving * 0.8, "facing the way he walks");
  t.check(Math.hypot(seen.at(-1).x - goal.x, seen.at(-1).z - goal.z) <= 10, "he arrived at the chapel");

  t.check(of("realm:wander_hide", (m) => m.wid === "pell").length > 0, "the wanderer pack's own Pell is hidden while ours walks");
  // Restart while the story's Pell still stands there (he goes 5 s after arriving): he mustn't survive it.
  t.check(pells().length === 1, "Pell is still at the chapel");
  t.restart("restart: no leftover story villagers");
}
