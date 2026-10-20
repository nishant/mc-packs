// Champions, O58: no "[elite] InvalidEntityError" when champions or candidate mobs stop existing while the pack still
// holds them (removed, killed, unloaded with their chunk), in every path that holds an entity across a tick: the
// conversion a tick after a spawn, the aura and approach round robins, the hurt and hit handlers, the Stormcaller's
// strikes, the 5-second recount and the arrival and announcement of a requested champion.
// Run with --strict: a caught error the pack logs as a warning fails the run, which is what O58 is about (the guards
// from 6f85410; before them these paths logged "InvalidEntityError ... dimension" warnings). The checks below only make
// sure every stress really happened.
//   node tools/test-bds/run.mjs --quiet --strict --flat --only elite_bp --scenario tools/test-bds/examples/elite-invalid.js --timeout 900
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

  // 1. A night spawn removed in the same tick: the conversion a tick later finds it gone.
  for (let i = 0; i < 20; i++) {
    const e = dim.spawnEntity("minecraft:zombie", { x: 20.5 + (i % 5) * 50, y, z: 60.5 + Math.floor(i / 5) * 50 });
    e.remove();
    await t.wait(2);
  }
  // 2. A requested champion removed right after it arrives (arrival effects and the announcement run on it).
  for (let i = 0; i < 10; i++) {
    const tag = request(6 + i, 6, "shielded");
    await t.wait(1);
    for (const e of champions(tag)) e.remove();
    await t.wait(1);
  }

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
