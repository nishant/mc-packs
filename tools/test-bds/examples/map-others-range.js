// Minimap (map_bp): players outside your party show on the strip and the radar only within 128 blocks (the
// documented range, OTHERS_RANGE), not every online player in the dimension. A player 60 blocks north shows on the
// strip (a white dot) and as an arrow on the radar's edge; a player 300 blocks east shows nowhere, not even as an
// arrow at the strip's or the radar's edge. Party mates still show at any distance (a blue arrow).
//   node tools/test-bds/run.mjs --quiet --flat --only map_bp --scenario tools/test-bds/examples/map-others-range.js --timeout 300
const g = (n) => String.fromCodePoint(0xf300 + n);
const OTHER = [g(0x17), g(0x27), g(0x2f)]; // strip dot, left arrow, right arrow
const FRIEND = [g(0x37), ...Array.from({ length: 8 }, (_, i) => g(0x90 + i))]; // radar dot and edge arrows
const PARTY = [g(0x13), g(0x23), g(0x2b)];

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
  const p = await t.player("Looker", { op: true, x: 0, z: 0, gameMode: "creative" });
  const near = await t.player("Near", { x: 0, z: -60, gameMode: "creative" });
  const far = await t.player("Far", { x: 300, z: 0, gameMode: "creative", settle: 2 });
  stand(p, 0, 0); // facing north
  stand(near, 0, -60);
  stand(far, 300, 0);
  await t.wait(60);

  let st = await state(p);
  t.log(`strip ${[...(st.strip ?? "")].map((c) => c.codePointAt(0).toString(16)).join(" ")}`);
  t.check(count(st.strip, OTHER) === 1, `one other player on the strip: the one 60 blocks north (${count(st.strip, OTHER)})`);
  t.check([...(st.strip ?? "")][12] === OTHER[0], "the near player is a white dot where you face");
  t.check(count(st.radar, FRIEND) === 1, `one other player on the radar: the near one's edge arrow (${count(st.radar, FRIEND)})`);

  // Turn east, toward the far player: still nothing for them (300 blocks is beyond 128).
  stand(p, 0, 0, -90);
  await t.wait(30);
  st = await state(p);
  t.check(count(st.strip, OTHER) === 1, `facing the far player: only the near one, as an arrow at the strip's edge (${count(st.strip, OTHER)})`);
  t.check([...(st.strip ?? "")][12] !== OTHER[0], "no dot where you face for a player 300 blocks away");

  // A party mate shows at any distance: both get the same Parties tag (the minimap only reads the tag).
  p.addTag("realm_party:test");
  far.addTag("realm_party:test");
  await t.wait(40);
  st = await state(p);
  t.check(count(st.strip, PARTY) === 1, `the far party mate shows on the strip (${count(st.strip, PARTY)})`);
}
