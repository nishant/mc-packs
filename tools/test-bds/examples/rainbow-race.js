// Rainbows: forced rainbow, fixed end, restart, the race for the pot, a second player too late, a safe zone at the
// end, no spot at all; nothing drawn (no particles), and the realm:rainbow_pot broadcasts for the Minimap follow
// the pot (its spot while unfound, {} once found). Needs a copy of rainbow_bp with the test hook
// tools/test-bds/hooks/rainbow-rvtest.js (it counts particles per player and answers rvtest:pot with
// rvtest:pot_r {pot, counts, busy}; packs can't read each other's dynamic properties). The suite runs these:
//   mkdir -p /tmp/rb && rm -rf /tmp/rb/rainbow_bp && cp -r packs/rainbow_bp /tmp/rb/
//   cat tools/test-bds/hooks/rainbow-rvtest.js >> /tmp/rb/rainbow_bp/scripts/main.js
//   node tools/test-bds/run.mjs --quiet --packs /tmp/rb --scenario tools/test-bds/examples/rainbow-race.js --timeout 400

export default async function (t) {
  const sys = t.mc.system;
  const dim = t.dimension;
  const box = { r: undefined, acks: new Set() };
  /** realm:rainbow_pot messages so far @type {any[]} */
  const pots = [];
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "rvtest:pot_r") box.r = JSON.parse(message);
    else if (id === "realm:cfg_ack") box.acks.add(JSON.parse(message).id);
    else if (id === "realm:rainbow_pot") pots.push(JSON.parse(message));
  }, { namespaces: ["rvtest", "realm"] });
  const lastPot = () => pots[pots.length - 1];
  /** Pings for the Minimap's view of the pot and returns the answer. */
  async function ping() {
    const n = pots.length;
    sys.sendScriptEvent("realm:rainbow_ping", "");
    await t.waitUntil(() => pots.length > n, { timeout: 20, message: "rainbow_pot answer" });
    return lastPot();
  }
  const particles = (counts) => Object.values(counts ?? {}).reduce((a, b) => a + b, 0);
  async function state() {
    box.r = undefined;
    sys.sendScriptEvent("rvtest:pot", "");
    return t.waitUntil(() => box.r, { timeout: 20, message: "pot state" });
  }
  let n = 0;
  async function cfg(key, value) {
    const id = `rb${++n}`;
    sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id, pack: "rainbow_bp", key, value }));
    await t.waitUntil(() => box.acks.has(id), { timeout: 20, message: `cfg ${key}` });
  }
  const crowns = (p) => { try { return t.world.scoreboard.getObjective("crowns")?.getScore(p) ?? 0; } catch { return 0; } };
  async function goNear(x, z, back) {
    const { top } = await t.loadArea(x, z, { radius: 2 });
    return { x: x + 0.5, y: (top?.location?.y ?? top?.y ?? 70) + 1, z: z + 0.5, back };
  }
  const tp = (p, at) => p.teleport({ x: at.x, y: at.y, z: at.z });

  if (t.phase === 1) {
    const a = await t.player("Ann", { op: true });
    await cfg("durationSeconds", 30);
    const since = t.tick;
    t.assert(t.cmd(a, "/realm:rainbow_now").ok, "rainbow_now");
    t.log((await t.waitMessage(a, /A rainbow!/, { since, timeout: 60 })).plain);
    await t.seconds(3);
    const s0 = await state();
    const p0 = s0.pot;
    t.assert(p0 && !p0.placed, "a pot");
    t.log(`pot ${p0.x}, ${p0.z}; ${Math.round(Math.hypot(p0.x - a.location.x, p0.z - a.location.z))} blocks away`);
    t.check(p0.ang === undefined && p0.by === undefined && p0.ground === undefined, `no arc fields saved: ${JSON.stringify(p0)}`);
    t.check(particles(s0.counts) === 0, `nothing drawn: ${JSON.stringify(s0.counts)}`);
    t.check(lastPot()?.x === p0.x && lastPot()?.z === p0.z && lastPot()?.dim === "minecraft:overworld", `rainbow_pot when it appeared: ${JSON.stringify(lastPot())}`);
    // Walk halfway: the anchor doesn't move.
    tp(a, await goNear(Math.round((a.location.x + p0.x) / 2), Math.round((a.location.z + p0.z) / 2)));
    await t.seconds(3);
    const p1 = (await state()).pot;
    t.check(p1.x === p0.x && p1.z === p0.z && p1.id === p0.id, "end fixed while walking");
    t.world.setDynamicProperty("rv:pot", JSON.stringify(p1));
    t.restart("restart with a rainbow up");
    return;
  }

  const before = JSON.parse(String(t.world.getDynamicProperty("rv:pot")));
  const a = await t.player("Ann", { op: true });
  const home = { x: Math.floor(a.location.x), z: Math.floor(a.location.z) };
  const b = await t.player("Bea", { x: home.x + 3, z: home.z });
  await t.seconds(2);
  let s = await state();
  t.check(s.pot && s.pot.id === before.id && s.pot.x === before.x && s.pot.z === before.z, "the same pot after the restart");
  const p0 = s.pot;
  let m = await ping();
  t.check(m.x === p0.x && m.z === p0.z, `rainbow_pot after the restart: ${JSON.stringify(m)}`);
  // Still on the compass once the rainbow has faded (30 s after it appeared), until it's found.
  await t.waitUntil(() => Date.now() > p0.until + 2000, { timeout: 900, message: "rainbow fades" });
  m = await ping();
  t.check(m.x === p0.x && m.z === p0.z, `rainbow_pot after the rainbow faded: ${JSON.stringify(m)}`);

  // The race: Ann gets close (chest placed), then reaches it.
  tp(a, await goNear(p0.x + 20, p0.z));
  let placed;
  for (let i = 0; i < 20 && !placed; i++) {
    await t.seconds(1);
    s = await state();
    if (s.pot?.placed || s.pot?.missed) placed = s.pot;
  }
  t.assert(placed, "the chest is placed (or missed) within 40 blocks");
  t.log(`pot ${placed.placed ? `chest at ${placed.x} ${placed.y} ${placed.z}` : "missed (no spot)"}`);
  if (placed.placed) t.check(dim.getBlock({ x: placed.x, y: placed.y, z: placed.z })?.typeId === "minecraft:chest", "chest in the world");
  t.check(lastPot()?.x === placed.x && lastPot()?.z === placed.z, `rainbow_pot at the chest's spot: ${JSON.stringify(lastPot())}`);
  const ca = crowns(a), cb = crowns(b);
  let since = t.tick;
  tp(a, { x: placed.x + 1.5, y: (placed.y ?? 70) + 0.5, z: placed.z + 0.5 });
  await t.waitMessage(a, /Ann found the pot of gold/, { since, timeout: 60 });
  t.check(crowns(a) === ca + 50, `Ann +50 Crowns (${ca} -> ${crowns(a)})`);
  await t.seconds(1);
  t.check(lastPot()?.x === undefined, `rainbow_pot {} once found: ${JSON.stringify(lastPot())}`);
  t.check((await ping()).x === undefined, "ping after found: {}");
  // Bea, too late.
  since = t.tick;
  tp(b, { x: placed.x - 0.5, y: (placed.y ?? 70) + 0.5, z: placed.z + 0.5 });
  await t.seconds(4);
  t.check(crowns(b) === cb, "Bea gets no Crowns");
  t.check(!t.messages(undefined, { since }).some((m) => /found the pot of gold/.test(m.plain)), "no second finder");

  // A new rainbow replaces the found pot; the chest with loot stays.
  tp(a, await goNear(home.x, home.z));
  tp(b, { ...a.location, x: a.location.x + 2 });
  since = t.tick;
  t.assert(t.cmd(a, "/realm:rainbow_now").ok, "second rainbow_now");
  await t.waitMessage(a, /A rainbow!/, { since, timeout: 60 });
  const q = (await state()).pot;
  await t.seconds(1);
  t.check(lastPot()?.x === q.x && lastPot()?.z === q.z, `rainbow_pot for the second pot: ${JSON.stringify(lastPot())}`);
  if (placed.placed) {
    await t.loadArea(placed.x, placed.z, { radius: 1 });
    t.check(dim.getBlock({ x: placed.x, y: placed.y, z: placed.z })?.typeId === "minecraft:chest", "the old chest with loot stays");
  }
  // A safe zone over the new end: no chest inside it; the loot goes to the finder.
  sys.sendScriptEvent("realm:zones", JSON.stringify({ src: "rvtest", part: 1, parts: 1, zones: [{ dim: "minecraft:overworld", x: q.x, z: q.z, r: 30 }] }));
  await t.wait(2);
  tp(a, await goNear(q.x + 25, q.z));
  let r;
  for (let i = 0; i < 20 && !r; i++) {
    await t.seconds(1);
    s = await state();
    if (s.pot?.placed || s.pot?.missed) r = s.pot;
  }
  t.assert(r, "the pot settles");
  t.check(r.missed && !r.placed, `no chest inside the zone (placed ${r.placed}, at ${r.x} ${r.z})`);
  const invA = a.getComponent("inventory").container;
  const goldBefore = (() => { let k = 0; for (let i = 0; i < invA.size; i++) if (invA.getItem(i)?.typeId === "minecraft:gold_ingot") k += invA.getItem(i).amount; return k; })();
  since = t.tick;
  tp(a, { x: r.x + 0.5, y: (r.y ?? 70) + 0.2, z: r.z + 0.5 });
  await t.waitMessage(a, /found the pot of gold/, { since, timeout: 80 });
  let gold = 0;
  for (let i = 0; i < invA.size; i++) if (invA.getItem(i)?.typeId === "minecraft:gold_ingot") gold += invA.getItem(i).amount;
  t.check(gold > goldBefore, `loot straight into the inventory (${goldBefore} -> ${gold} gold ingots)`);
  t.check((await ping()).x === undefined, "no pot on the compass after the second find");
  t.check(particles((await state()).counts) === 0, "still nothing drawn");

  // A zone over everything near the player: no rainbow at all.
  sys.sendScriptEvent("realm:zones", JSON.stringify({ src: "rvtest", part: 1, parts: 1, zones: [{ dim: "minecraft:overworld", x: Math.round(a.location.x), z: Math.round(a.location.z), r: 400 }] }));
  await t.wait(2);
  since = t.tick;
  t.cmd(a, "/realm:rainbow_now");
  await t.waitMessage(a, /No spot for the rainbow's end/, { since, timeout: 40 });
  sys.sendScriptEvent("realm:zones", JSON.stringify({ src: "rvtest", part: 0, parts: 0, zones: [] }));
}
