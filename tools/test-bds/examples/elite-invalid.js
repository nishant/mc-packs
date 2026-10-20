// Champions, O58: no "[elite] InvalidEntityError" when champions or candidate mobs stop existing while the pack still
// holds them (removed, killed, unloaded with their chunk), in every path that holds an entity across a tick: the
// conversion a tick after a spawn, the aura and approach round robins, the hurt and hit handlers, the Stormcaller's
// strikes, the 5-second recount and the arrival and announcement of a requested champion.
// Run with --strict: a caught error the pack logs as a warning fails the run, which is what O58 is about (the guards
// from 6f85410; before them these paths logged "InvalidEntityError ... dimension" warnings). The checks below make
// sure every stress really happened.
// The conversion a tick after a spawn needs the mob removed after elite_bp's entitySpawn handler scheduled it and before
// that timeout fires. A scenario can't time that from its own script context, so a harness-only probe in a copy of
// elite_bp (tools/test-bds/hooks/elite-remove.mjs) removes chosen spawns in the pack's own flush, after its handler. The
// probe uses nothing of the guards, so the same recipe runs the code from before them (6f85410^ as its second argument,
// where the same-tick removals of stress 1a reach the unguarded spawn handler) or a copy without convert()'s guard.
//   mkdir -p /tmp/elite-invalid
//   node tools/test-bds/hooks/elite-remove.mjs /tmp/elite-invalid/packs
//   node tools/test-bds/run.mjs --quiet --strict --flat --packs /tmp/elite-invalid/packs --only elite_bp --scenario tools/test-bds/examples/elite-invalid.js --timeout 900
export default async function (t) {
  const dim = t.dimension;
  const cfg = (key, value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `i_${key}_${t.tick}`, pack: "elite_bp", key, value }));
  t.server("/gamerule doMobSpawning false");
  t.server("/time set midnight");
  t.server("/gamerule doDaylightCycle false");
  const p = await t.player("Bait", { x: 0, z: 0, gameMode: "survival" });
  p.addEffect("resistance", 20000, { amplifier: 255, showParticles: false });
  p.addEffect("regeneration", 20000, { amplifier: 5, showParticles: false });
  cfg("chance", 0.25);
  cfg("bloodMoonMultiplier", 4);
  cfg("maxAlivePerPlayer", 0);
  cfg("maxAliveNearby", 0);
  t.system.sendScriptEvent("realm:moon", JSON.stringify({ state: "blood" }));
  await t.wait(10);
  const y = Math.floor(p.location.y);
  const champions = (tag) => dim.getEntities({ tags: [tag ?? "realm:champion"] });
  let n = 0;
  const request = (x, z, trait) => {
    const tag = `realm:o58_${++n}`;
    t.system.sendScriptEvent("realm:champion_spawn", JSON.stringify({ x: x + 0.5, y, z: z + 0.5, mob: "minecraft:zombie", trait, tag }));
    return tag;
  };

  const reports = new Map();
  t.system.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "harness:elite_remove_report") return;
      try {
        const r = JSON.parse(message);
        reports.set(r.id, r);
      } catch {}
    },
    { namespaces: ["harness"] },
  );
  let seq = 0;
  /** Sends a console script event to the probe in elite_bp and waits for its report. */
  const probe = async (event, payload) => {
    const id = `e${++seq}`;
    await t.console(`scriptevent harness:${event} ${payload(id)}`);
    return t.waitUntil(() => reports.get(id), { timeout: 60, message: `the spawn remover in elite_bp answered ${event}` });
  };

  // 1a. A night spawn removed in the same tick by the scenario: the pack's spawn handler finds it gone (or, if it ran
  // first, the conversion a tick later does).
  let spawned = 0;
  for (let i = 0; i < 10; i++) {
    const e = dim.spawnEntity("minecraft:zombie", { x: -29.5 + i * 6, y, z: -30.5 });
    if (e.isValid) spawned++;
    e.remove();
    await t.wait(2);
  }
  t.check(spawned === 10, `the same-tick spawns were made and removed (${spawned} of 10)`);
  // 1b. A night spawn removed after elite_bp's handler scheduled its conversion (chance 0.25 x 4 on a blood moon = every
  // spawn), before that timeout fires: the conversion a tick later finds it gone. The probe removes them in the pack's
  // own flush and counts the ones it removed while they were still valid.
  // Within the simulated player's loaded chunks (spawnEntity throws in an unloaded one), away from the later crowds.
  const box = { x0: -40, x1: 40, z0: 30, z1: 41 };
  const armed = await probe("elite_arm", (id) => JSON.stringify({ id, box, n: 20 }));
  t.assert(armed.armed === 20, "the spawn remover is armed");
  for (let i = 0; i < 20; i++) {
    dim.spawnEntity("minecraft:zombie", { x: -37.5 + (i % 10) * 8, y, z: 32.5 + Math.floor(i / 10) * 6 });
    await t.wait(2);
  }
  const done = await probe("elite_report", (id) => id);
  t.check(done.removed === 20, `the probe removed every spawn after the pack's handler, while still valid (${done.removed} of 20)`);
  t.check(dim.getEntities({ type: "minecraft:zombie" }).length === 0, "none of those spawns is left");

  // 2. A requested champion removed right after it arrives (arrival effects and the announcement run on it).
  let removedOnArrival = 0;
  for (let i = 0; i < 10; i++) {
    const tag = request(6 + i, 6, "shielded");
    // The first tick it is there (script events can arrive a tick later than sent).
    for (let w = 0; w < 5 && champions(tag).length === 0; w++) await t.wait(1);
    for (const e of champions(tag)) {
      e.remove();
      removedOnArrival++;
    }
    await t.wait(1);
  }
  t.check(removedOnArrival >= 8, `requested champions were removed right after they arrived (${removedOnArrival} of 10)`);

  // 3. A crowd near the player (aura within 64 blocks, approach within 48): removed and killed one by one between runs.
  const crowd = [];
  for (let i = 0; i < 24; i++) crowd.push(request(10 + (i % 6) * 4, 14 + Math.floor(i / 6) * 4, ["stormcaller", "frostbound", "vampiric", "splitting", "shielded"][i % 5]));
  await t.wait(40);
  const made = crowd.filter((tag) => champions(tag).length).length;
  t.check(made >= 20, `the crowd of champions is there (${made} of 24)`);
  for (const [i, tag] of crowd.entries()) {
    for (const e of champions(tag)) {
      if (i % 3 === 0) e.remove();
      else if (i % 3 === 1) e.kill();
      else {
        // The hurt and hit handlers: the player hits it, then it is gone before the next tick.
        try {
          p.teleport({ x: e.location.x - 1.5, y: e.location.y, z: e.location.z }, { dimension: dim, facingLocation: e.location });
          p.attackEntity(e);
        } catch {}
        e.remove();
      }
    }
    await t.wait(3 + (i % 4));
  }
  p.teleport({ x: 0.5, y, z: 0.5 }, { dimension: dim });

  // 4. Stormcallers near the player, removed while their next strike is scheduled.
  const storm = [];
  for (let i = 0; i < 6; i++) storm.push(request(8 + i * 3, -8, "stormcaller"));
  await t.wait(200);
  for (const tag of storm) for (const e of champions(tag)) e.remove();
  await t.wait(60);

  // 5. Champions far away whose chunks unload: the aura, approach and the 5-second recount still hold them.
  const far = { x: 400, z: 400 };
  const area = await t.loadArea(far.x, far.z, { radius: 2 });
  const farY = area.top.location.y + 1;
  const farTags = [];
  for (let i = 0; i < 6; i++) {
    const tag = `realm:o58_far_${i}`;
    t.system.sendScriptEvent("realm:champion_spawn", JSON.stringify({ x: far.x + 0.5 + i * 2, y: farY, z: far.z + 0.5, mob: "minecraft:zombie", tag }));
    farTags.push(tag);
  }
  await t.wait(20);
  t.check(farTags.filter((tag) => champions(tag).length).length >= 5, "the far champions were made");
  // The player stands by them for the aura and approach, then leaves and the chunks unload under the pack.
  p.teleport({ x: far.x - 20.5, y: farY, z: far.z + 0.5 }, { dimension: dim });
  await t.wait(60);
  p.teleport({ x: 0.5, y, z: 0.5 }, { dimension: dim });
  t.server(`/tickingarea remove ${area.name}`);
  await t.wait(400);
  t.check(farTags.every((tag) => champions(tag).length === 0), "the far champions are unloaded (no longer reachable)");

  // 6. A last crowd for the recount to see, then all of it gone at once.
  const last = [];
  for (let i = 0; i < 8; i++) last.push(request(-10 - i * 3, 10, undefined));
  await t.wait(40);
  // Splitting champions leave copies when killed: a second sweep takes those.
  t.server('/kill @e[tag="realm:champion"]');
  await t.wait(40);
  t.server('/kill @e[tag="realm:champion"]');
  await t.wait(200);
  t.check(champions().length === 0, `every champion is gone (${champions().length})`);
}
