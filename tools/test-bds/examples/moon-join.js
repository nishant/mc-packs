// Blood Moon & Harvest Moon: a player who joins while one is up is told what's going on (the dusk announcement
// went out before they came), and that a Blood Moon's survivor reward is out of reach for them; nothing on an
// ordinary night.
//   node tools/test-bds/run.mjs --quiet --only moon_bp --scenario tools/test-bds/examples/moon-join.js --timeout 600
export default async function (t) {
  const ann = await t.player("Ann", { op: true });
  // Tonight (a full moon) must not roll a special moon of its own at dusk.
  const acks = new Set();
  t.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "realm:cfg_ack") acks.add(JSON.parse(message).id);
  }, { namespaces: ["realm"] });
  for (const key of ["bloodChance", "harvestChance"]) {
    t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: key, pack: "moon_bp", key, value: 0 }));
    await t.waitUntil(() => acks.has(key), { timeout: 40, message: `cfg ${key}` });
  }
  t.server("/time set 13000");
  await t.seconds(2);
  let since = t.tick;
  t.assert(t.cmd(ann, "/realm:moon_set blood").ok, "moon_set blood ran");
  t.log((await t.waitMessage(ann, /Blood Moon rises/, { since, timeout: 100 })).plain);

  since = t.tick;
  const bob = await t.player("Bob");
  const m = await t.waitMessage(bob, /Blood Moon is up/, { since, timeout: 100 });
  t.log(m.plain);
  t.check(/no survivor reward/.test(m.plain), "a late joiner hears there's no survivor reward for them");

  since = t.tick;
  t.assert(t.cmd(ann, "/realm:moon_set harvest").ok, "moon_set harvest ran");
  await t.waitMessage(ann, /Harvest Moon rises/, { since, timeout: 100 });
  since = t.tick;
  const cid = await t.player("Cid");
  t.log((await t.waitMessage(cid, /Harvest Moon is up/, { since, timeout: 100 })).plain);

  t.assert(t.cmd(ann, "/realm:moon_set normal").ok, "moon_set normal ran");
  await t.seconds(2);
  since = t.tick;
  const dan = await t.player("Dan");
  await t.seconds(4);
  const said = t.messages(dan, { since, pack: "moon_bp" });
  t.check(!said.length, `nothing for a joiner on an ordinary night (got ${said.map((x) => x.plain).join(" | ")})`);
}
