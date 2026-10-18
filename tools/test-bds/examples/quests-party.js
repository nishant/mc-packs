// Daily Quests: a mob a party mate defeats nearby counts for your Defeat quests too (the Parties pack's
// `realm_party:<code>` tag, set here directly); a player outside the party, or a mate too far away, gets nothing.
// node tools/test-bds/run.mjs --quiet --only quests_bp --scenario tools/test-bds/examples/quests-party.js --timeout 300
export default async function (t) {
  const ann = await t.player("Ann");
  const s = ann.location;
  const bob = await t.player("Bob", { x: s.x + 3, z: s.z });
  const cat = await t.player("Cat", { x: s.x - 3, z: s.z });
  const dan = await t.player("Dan", { x: s.x + 200, z: s.z });
  for (const p of [ann, bob, dan]) p.addTag("realm_party:TEST");
  for (const p of [ann, bob, cat, dan]) await t.console(`scriptevent realm:quests_test ${JSON.stringify({ player: p.name, ids: ["kill_zombies", "mine_coal"] })}`);
  await t.wait(5);

  const progressOf = async (p) => {
    const menu = t.waitForm(p);
    t.cmd(p, "/realm:quests");
    const form = await menu;
    form.answer(null);
    // Under way the label counts down ("Defeat 8 more zombies"), so match both forms.
    const m = /Defeat (?:10|\d+ more) zombies[\s\S]*?(\d+)\/10/.exec(`${form.body} ${form.buttons.join(" ")}`.replace(/§./g, ""));
    return m ? Number(m[1]) : -1;
  };

  const kill = () => {
    const z = t.dimension.spawnEntity("minecraft:zombie", { x: ann.location.x + 1, y: ann.location.y, z: ann.location.z + 1 });
    z.applyDamage(500, { cause: t.mc.EntityDamageCause.entityAttack, damagingEntity: ann });
  };
  kill();
  kill();
  await t.wait(10);

  const a = await progressOf(ann);
  const b = await progressOf(bob);
  const c = await progressOf(cat);
  const d = await progressOf(dan);
  t.log(`progress: Ann ${a}, Bob ${b}, Cat ${c}, Dan ${d}`);
  t.check(a === 2, `the killer counts both (${a})`);
  t.check(b === 2, `a party mate 3 blocks away shares them (${b})`);
  t.check(c === 0, `a player outside the party gets nothing (${c})`);
  t.check(d === 0, `a party mate 200 blocks away gets nothing (${d})`);
}
