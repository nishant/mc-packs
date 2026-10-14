// Rook's treasure race (maps_bp + saga_bp): Treasure Maps broadcasts each hunt's current leg (realm:map_leg, again on
// realm:map_leg_ping, `gone` when the hunt ends); on Rook's "The Map Room" chapter a race starts within 300 blocks
// of the player's last leg (realm:map_rival to the maps pack). Lost (time up): the chest pays half its Crowns. Won
// (found in time): full Crowns and the optional objective's bonus. Needs a one-leg copy of maps_bp:
//   S=/tmp/claude-maps-race && rm -rf $S && mkdir -p $S && cp -r packs/maps_bp packs/saga_bp packs/wander_bp $S/
//   sed -i 's/legsMin: 2,/legsMin: 1,/; s/legsMax: 4,/legsMax: 1,/' $S/maps_bp/scripts/config.js
//   node tools/test-bds/run.mjs --quiet --flat --packs $S --scenario tools/test-bds/examples/rook-map-race.js --timeout 600
export default async function (t) {
  const sys = t.system;
  /** @type {{ id: string, m: any, tick: number }[]} */
  const ev = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!["realm:map_leg", "realm:map_rival", "realm:wander_spawn", "realm:wander_state", "realm:quest_done"].includes(id)) return;
      try {
        ev.push({ id, m: JSON.parse(message), tick: sys.currentTick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id, f = () => true, since = 0) => ev.filter((e) => e.id === id && e.tick >= since && f(e.m)).map((e) => e.m);
  const wdebug = (m) => sys.sendScriptEvent("realm:wander_debug", JSON.stringify(m));
  const sdebug = (m) => sys.sendScriptEvent("realm:saga_debug", JSON.stringify(m));
  const cfg = (key, value) => sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `c_${key}`, pack: "maps_bp", key, value }));
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
  const standAt = async (p, x, z) => {
    const { top } = await t.loadArea(x, z, { radius: 2 });
    p.teleport({ x: x + 0.5, y: top.y + 1, z: z + 0.5 });
    await t.wait(10);
  };
  /** Gives a map, goes to its one leg, waits for the chest, stands on it. Returns the hunt id. */
  const hunt = async (p, beforeFind) => {
    let since = t.tick;
    t.assert(t.cmd(p, "/realm:maps_give @s").ok, "maps_give ran");
    await t.waitUntil(() => of("realm:map_leg", (m) => m.player === p.id && m.final === true, since).length > 0, { timeout: 60, message: "realm:map_leg: the hunt's only leg, final" });
    const leg = of("realm:map_leg", (m) => m.player === p.id && m.final === true, since).at(-1);
    t.log("leg:", JSON.stringify(leg));
    await t.waitUntil(() => of("realm:map_rival", (m) => m.player === p.id && m.hunt === leg.hunt, since).length > 0, { timeout: 60, message: "the race to the chest starts (realm:map_rival)" });
    await t.waitMessage(p, /Rook is after your treasure too!/, { since, timeout: 40 });
    await beforeFind?.();
    since = t.tick;
    await standAt(p, leg.x, leg.z);
    await t.waitMessage(p, /The map grows warm/, { since, timeout: 400 });
    await t.wait(30); // the leg is sent again with the chest's spot
    const chest = of("realm:map_leg", (m) => m.hunt === leg.hunt && !m.gone).at(-1);
    await standAt(p, chest.x, chest.z);
    await t.waitMessage(p, /You found the treasure/, { since, timeout: 200 });
    await t.waitUntil(() => of("realm:map_leg", (m) => m.hunt === leg.hunt && m.gone === true, since).length > 0, { timeout: 60, message: "the finished hunt is sent as gone" });
    return leg.hunt;
  };

  t.server("/time set noon");
  t.server("/gamerule doDaylightCycle false");
  for (const [k, v] of [["minDistance", 200], ["maxDistance", 200], ["crownsMin", 80], ["crownsMax", 80], ["price", 0]]) cfg(k, v);
  const X = 900, Z = 900;
  await t.loadArea(X, Z, { radius: 3 });
  const p = await t.player("Tester", { op: true, x: X, z: Z });
  await t.wait(20);

  // --- Rook's "The Map Room", accepted from Rook on the road.
  sdebug({ player: p.id, action: "jump", story: "w_rook_rival", chapter: "map" });
  await t.waitUntil(() => of("realm:wander_state", (m) => m.player === p.id && m.ch.rook === "o").length > 0, { timeout: 300, message: "Rook's next chapter waits" });
  let since = t.tick;
  wdebug({ player: p.id, action: "spawn", named: "rook" });
  await t.waitUntil(() => of("realm:wander_spawn", (m) => m.wid === "rook", since).length > 0, { timeout: 60, message: "Rook appears" });
  await t.wait(10);
  const form = t.waitForm(p, { timeout: 200 });
  wdebug({ player: p.id, action: "tap", wid: "rook" });
  const f = await form;
  t.log("Rook offers:", JSON.stringify(f.buttons));
  f.answer(f.buttons.find((b) => /Map Room|Wager/.test(b)) ?? 0);
  await walk(p, "Accept");
  await t.wait(20);

  // --- Hunt 1: the race runs out before the chest is found: half the Crowns.
  since = t.tick;
  await hunt(p, async () => {
    sys.sendScriptEvent("realm:map_leg_ping", "{}");
    const s2 = t.tick;
    await t.waitUntil(() => of("realm:map_leg", (m) => m.player === p.id && m.final === true, s2).length > 0, { timeout: 60, message: "realm:map_leg again on realm:map_leg_ping" });
    const s3 = t.tick;
    sdebug({ player: p.id, action: "race_expire" });
    await t.waitMessage(p, /Rook got to your treasure first/, { since: s3, timeout: 60 });
  });
  t.check(t.messages(p, { since }).some((m) => /Rook got here first/.test(m.plain)), "lost: Rook took his cut");
  t.check(t.messages(p, { since }).some((m) => /\+40 Crowns \(Treasure map\)/.test(m.plain)), "lost: the chest paid 40 of 80 Crowns");

  // --- Hunt 2: found in time: full Crowns, the race won, the optional objective's bonus.
  since = t.tick;
  await hunt(p);
  t.check(t.messages(p, { since }).some((m) => /\+80 Crowns \(Treasure map\)/.test(m.plain)), "won: the chest paid all 80 Crowns");
  t.check(!t.messages(p, { since }).some((m) => /Rook got here first/.test(m.plain)), "won: no cut");
  await t.waitMessage(p, /You beat Rook to your treasure/, { since, timeout: 60 });
  await t.waitMessage(p, /Bonus for "Optional: beat Rook to a treasure chest"/, { since, timeout: 60 });
}
