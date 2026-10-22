// Minimap (map_bp): champions (tag realm:champion) and a Choir siege's Singers (tag realm:siege_singer) show as the
// champion marker, a red dot in a bright orange ring, within 128 blocks: beyond the mob range, at the strip's edge when
// behind you and at the radar's edge when beyond it. They are never also drawn as an ordinary mob dot. The Singer's tag
// counts only while the Minimap knows of a siege in that dimension (realm:siege_marks).
//   node tools/test-bds/run.mjs --quiet --flat --only map_bp --scenario tools/test-bds/examples/map-champion.js --timeout 400
const g = (n) => String.fromCodePoint(0xf300 + n);
const S_CHAMP = g(0x74);
const L_CHAMP = g(0x72);
const R_CHAMP = g(0x73);
const Q_CHAMP = g(0x3d);
const MOB = [g(0x10), g(0x20), g(0x28), g(0x30)]; // strip dot, edge arrows, radar dot

export default async function (t) {
  const sys = t.system;
  const Y = -60;
  const ev = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:map_state") return;
      try {
        ev.push({ m: JSON.parse(message), tick: sys.currentTick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const send = (id, m) => sys.sendScriptEvent(id, JSON.stringify(m));
  const state = async (p) => {
    const since = t.tick;
    send("realm:map_debug", { player: p.id, action: "state" });
    await t.waitUntil(() => ev.some((e) => e.tick >= since && e.m.player === p.id), { timeout: 20, message: "realm:map_state" });
    return ev.filter((e) => e.tick >= since && e.m.player === p.id).at(-1).m;
  };
  const count = (s, list) => [...(s ?? "")].filter((c) => list.includes(c)).length;
  const stand = (p, x, z, yaw = 180) => p.teleport({ x: x + 0.5, y: Y, z: z + 0.5 }, { rotation: { x: 0, y: yaw } });

  await t.server("/gamerule domobspawning false");
  await t.server("/difficulty normal");
  await t.server("/time set midnight");
  await t.server("/gamerule dodaylightcycle false");
  await t.server("/tickingarea add circle 0 -60 0 4 champ_area");
  const p = await t.player("Looker", { op: true, x: 0, z: 0, gameMode: "creative" });
  stand(p, 0, 0); // facing north
  const dim = p.dimension;
  await t.waitUntil(() => {
    try {
      return dim.getBlock({ x: 0, y: Y - 1, z: -40 }) !== undefined;
    } catch {
      return false;
    }
  }, { timeout: 200, message: "the champion's chunk is loaded" });
  const spawn = (type, x, z, tag) => {
    const e = dim.spawnEntity(type, { x: x + 0.5, y: Y, z: z + 0.5 });
    e.nameTag = "Test"; // no despawning
    e.addEffect("slowness", 20000, { amplifier: 255, showParticles: false });
    e.addEffect("fire_resistance", 20000, { showParticles: false });
    if (tag) e.addTag(tag);
    return e;
  };

  // A champion 40 blocks north: beyond the 24-block mob range, inside 128 (farther, Bedrock despawns a mob a script
  // named: nobody is near).
  const champ = spawn("minecraft:zombie", 0, -40, "realm:champion");
  // An ordinary zombie 10 blocks east: a plain mob dot (radar only while facing north: it's 90 degrees off).
  spawn("minecraft:zombie", 10, 0);
  await t.wait(60);
  t.log(`champion valid ${champ.isValid}${champ.isValid ? ` at ${Math.round(champ.location.x)},${Math.round(champ.location.z)}` : ""}; tagged ${dim.getEntities({ tags: ["realm:champion"] }).length}`);
  let st = await state(p);
  t.log(`strip ${[...(st.strip ?? "")].map((c) => c.codePointAt(0).toString(16)).join(" ")}`);
  t.check([...(st.strip ?? "")][12] === S_CHAMP, "the champion is the ringed dot where you face, 40 blocks out (beyond the mob range)");
  t.check(count(st.radar, [Q_CHAMP]) === 1, `the champion is on the radar's edge (${count(st.radar, [Q_CHAMP])})`);
  t.check(count(st.radar, MOB) === 1, `the ordinary zombie is still a plain mob dot, and the champion isn't one too (${count(st.radar, MOB)})`);

  // Turn south: the champion is behind you, an arrow at the strip's edge.
  stand(p, 0, 0, 0);
  await t.wait(30);
  st = await state(p);
  t.check(count(st.strip, [L_CHAMP, R_CHAMP]) === 1, `behind you: a champion arrow at the strip's edge (${count(st.strip, [L_CHAMP, R_CHAMP])})`);
  t.check(count(st.strip, [S_CHAMP]) === 0, "and no dot");
  if (champ.isValid) champ.remove();

  // A Choir Singer 40 blocks west: hidden while no siege is known, the champion marker during one.
  stand(p, 0, 0, 90); // facing west
  spawn("minecraft:vindicator", -40, 0, "realm:siege_singer");
  await t.wait(40);
  st = await state(p);
  t.check(count(st.strip, [S_CHAMP, L_CHAMP, R_CHAMP]) === 0, "no siege known: a Singer tag alone shows nothing beyond the mob range");
  // The siege's star points at its circle, behind you, so it doesn't take the middle cell.
  send("realm:siege_marks", { dim: "minecraft:overworld", town: { n: "Testford", x: 0, z: 60 }, circles: [{ x: 60, z: 60 }] });
  await t.wait(40);
  st = await state(p);
  t.log(`strip ${[...(st.strip ?? "")].map((c) => c.codePointAt(0).toString(16)).join(" ")}`);
  t.check([...(st.strip ?? "")][12] === S_CHAMP, "during a siege the Singer is the ringed dot where you face");
  t.check(count(st.radar, [Q_CHAMP]) === 1, "and on the radar");
  send("realm:siege_marks", {});
  await t.server("/tickingarea remove champ_area");
}
