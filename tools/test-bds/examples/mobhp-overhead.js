// Mob Health "Above the mob" and its fallbacks. Run with
//   node tools/test-bds/run.mjs --quiet --only mobhp_bp --scenario tools/test-bds/examples/mobhp-overhead.js --timeout 300
// Checks: the health becomes the mob's name tag and comes off after holdTicks; a second player hitting it sees
// the mob's own name in a box; named mobs and players keep their names (the box instead, also when the realm
// default isn't a box); a killing blow writes no name and shows "defeated" in the box; two players overhead on one mob;
// a mob that changes dimension mid-display; a restart mid-display (phase 2).
const MARK = "§s§2§r";

export default async function (t) {
  const sys = t.mc.system;
  const acks = [];
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "realm:cfg_ack") acks.push(JSON.parse(message));
  }, { namespaces: ["realm"] });
  let n = 0;
  async function set(key, value, player) {
    const id = `mh${++n}`;
    sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id, pack: "mobhp_bp", key, value, player: player?.id }));
    const ack = await t.waitUntil(() => acks.find((x) => x.id === id), { timeout: 40, message: `ack ${key}` });
    t.check(ack.ok, `${key}=${value}`);
  }
  const dim = t.dimension;
  const tagged = (e) => e.getTags().includes("mobhp_tag");
  const find = (tag, d = dim) => d.getEntities({ tags: [tag] })[0];

  if (t.phase === 2) {
    // The cow hit just before the restart: its health name must be gone.
    await t.loadArea(163, 170);
    const cow = await t.waitUntil(() => find("rv_restart"), { timeout: 200, message: "the cow from before the restart" });
    await t.wait(10);
    t.check(cow.nameTag === "" && !tagged(cow), `after the restart: name "${cow.nameTag}", tagged ${tagged(cow)}`);
    return;
  }

  const a = await t.player("Alice", { op: true });
  const b = await t.player("Bob", { x: 166, z: 170 });
  const at = (p, dx = 2) => ({ x: p.location.x + dx, y: p.location.y, z: p.location.z });
  const boxes = (p, since) => t.messages(p, { kind: "title", since }).filter((m) => m.text === MARK);
  // Hurt-immunity lasts 10 ticks, and entityHurt arrives after the tick: wait for both.
  const hit = async (mob, p, amount = 1) => {
    mob.applyDamage(amount, { cause: "entityAttack", damagingEntity: p });
    await t.wait(2);
  };
  const gap = () => t.wait(10);
  await set("where", "overhead", a);
  await set("where", "right1", b);

  // Overhead, then off after 40 ticks.
  const cow = dim.spawnEntity("minecraft:cow", at(a));
  await t.wait(2);
  await hit(cow, a);
  t.check(/^§f9\/10 /.test(cow.nameTag) && tagged(cow), `overhead name: "${cow.nameTag}"`);
  // Bob hits it while it shows: his box names the cow, not the health.
  let since = t.tick;
  await gap();
  since = t.tick;
  await hit(cow, b);
  const mb = await t.waitUntil(() => boxes(b, since)[0], { timeout: 10, message: "Bob's box" });
  t.check(/Cow  §f8\/10/.test(mb.subtitle), `Bob's box: ${mb.subtitle.slice(6, 40)}`);
  t.check(/^§f9\/10/.test(cow.nameTag), "Bob's hit (box) leaves Alice's name tag alone");
  await t.wait(45);
  t.check(cow.nameTag === "" && !tagged(cow), `name off after the hold: "${cow.nameTag}"`);

  // Two players overhead on one mob.
  await set("where", "overhead", b);
  await gap();
  await hit(cow, a);
  await t.wait(20);
  await hit(cow, b);
  t.check(/^§f6\/10/.test(cow.nameTag), `second player's hit updates it: "${cow.nameTag}"`);
  await t.wait(30);
  t.check(/^§f6\/10/.test(cow.nameTag), "still showing 30 ticks after the second hit");
  await t.wait(15);
  t.check(cow.nameTag === "" && !tagged(cow), "off after the last hit's hold");
  await set("where", "right1", b);

  // A named mob keeps its name: the realm's box instead; also when the realm default is overhead or hotbar.
  const named = dim.spawnEntity("minecraft:cow", at(a, -2));
  named.nameTag = "Bessie";
  await t.wait(2);
  for (const realm of ["right1", "overhead", "hotbar", "left2"]) {
    await set("showAt", realm);
    await gap();
    since = t.tick;
    await hit(named, a);
    const m = await t.waitUntil(() => boxes(a, since)[0], { timeout: 10, message: `box for a named mob (realm ${realm})` });
    t.check(named.nameTag === "Bessie", `named mob keeps its name (realm ${realm})`);
    t.check(m.subtitle.includes("Bessie"), `box shows Bessie (realm ${realm})`);
  }
  await set("showAt", "right1");

  // Players (with players enabled).
  await set("players", true);
  since = t.tick;
  b.applyDamage(1, { cause: "entityAttack", damagingEntity: a });
  const mp = await t.waitUntil(() => boxes(a, since)[0], { timeout: 10, message: "box for a player" });
  t.check(mp.subtitle.includes("Bob") && b.nameTag === "Bob", `player's health in the box, name kept ("${b.nameTag}")`);

  // A killing blow: no name tag, 0/x in the box.
  const doomed = dim.spawnEntity("minecraft:chicken", at(a, 3));
  await t.wait(2);
  since = t.tick;
  let nameAtDeath = "?";
  const sub = t.mc.world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
    if (deadEntity.id === doomed.id) try { nameAtDeath = deadEntity.nameTag; } catch { nameAtDeath = "(gone)"; }
  });
  await hit(doomed, a, 50);
  const mk = await t.waitUntil(() => boxes(a, since)[0], { timeout: 10, message: "box for the killing blow" });
  t.world.afterEvents.entityDie.unsubscribe(sub);
  t.check(/Chicken  §7defeated/.test(mk.subtitle), `killing blow box says defeated: ${mk.subtitle.slice(6, 40)}`);
  t.check(!/\d+\/\d+/.test(nameAtDeath), `no health name on the dying mob ("${nameAtDeath}")`);

  // A mob that unloads mid-display is untagged by entityLoad when it loads again; not tested here: on this
  // harness a script-spawned mob in a chunk that unloads is gone when the chunk loads again (with or without the pack).

  // A mob that changes dimension mid-display.
  const nether = t.world.getDimension("nether");
  const carol = await t.player("Carol", { dimension: "nether", x: 0, z: 0 });
  t.log(`Carol in the nether at ${Math.round(carol.location.x)} ${Math.round(carol.location.y)} ${Math.round(carol.location.z)}`);
  const traveler = dim.spawnEntity("minecraft:cow", at(a, -3));
  traveler.addTag("rv_dim");
  await t.wait(2);
  await hit(traveler, a);
  t.check(tagged(traveler), "traveler shows the health");
  try {
    traveler.teleport({ x: carol.location.x + 1.5, y: carol.location.y, z: carol.location.z }, { dimension: nether });
  } catch (e) {
    t.log(`teleport: ${e}`);
  }
  await t.wait(80);
  const there = find("rv_dim", nether) ?? find("rv_dim");
  t.check(!!there, "found the traveler");
  t.log(`traveler: old handle valid ${traveler.isValid}, same id ${there?.id === traveler.id}`);
  if (there) t.check(there.nameTag === "" && !tagged(there), `after changing dimension: "${there.nameTag}", tagged ${tagged(there)}, in ${there.dimension.id}`);

  // A restart mid-display.
  const last = dim.spawnEntity("minecraft:cow", at(a, 1));
  last.addTag("rv_restart");
  await t.wait(2);
  await hit(last, a);
  t.check(tagged(last), "restart cow shows the health");
  await t.wait(2);
  t.restart("restart with a health name showing");
}
