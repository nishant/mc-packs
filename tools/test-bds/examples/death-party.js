// Death Point: a player's party mates (the Parties pack's `realm_party:<code>` tag, set here directly) are told in
// chat where they died, with the distance and direction from each mate; players outside the party are not.
// node tools/test-bds/run.mjs --quiet --only death_bp --scenario tools/test-bds/examples/death-party.js --timeout 300
export default async function (t) {
  const ann = await t.player("Ann");
  const s = ann.location;
  const bob = await t.player("Bob", { x: s.x + 40, z: s.z });
  const cat = await t.player("Cat", { x: s.x - 3, z: s.z });
  ann.addTag("realm_party:TEST");
  bob.addTag("realm_party:TEST");
  await t.wait(5);

  const since = t.tick;
  ann.applyDamage(1000, { cause: t.mc.EntityDamageCause.override });
  const m = await t.waitMessage(bob, /\[Party\] Ann died at -?\d+, -?\d+, -?\d+ in the Overworld \((\d+) blocks (W|NW|SW) of you\)/, { since, timeout: 100 });
  t.log(m.plain);
  const n = Number(/\((\d+) blocks/.exec(m.plain)?.[1]);
  t.check(n >= 38 && n <= 42, `distance from Bob is about 40 (${n})`);
  await t.wait(20);
  t.check(!t.messages(cat, { since }).some((x) => /\[Party\]/.test(x.plain)), "Cat, outside the party, hears nothing");
  t.check(!t.messages(ann, { since }).some((x) => /\[Party\]/.test(x.plain)), "Ann isn't told about herself");
}
