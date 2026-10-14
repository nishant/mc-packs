// Rook's bounty race (bounty_bp + saga_bp + wander_bp): the Bounty Board broadcasts today's live champion targets
// (realm:bounty_targets, again on realm:bounty_targets_ping); on Rook's "Three Bounties" chapter a race starts when
// the player comes within 300 blocks of a target (realm:bounty_rival to the board); a target that falls in time wins
// the race and pays the full 100 Crowns, one that falls after the race was lost pays 50; the wanderer pack sends Rook
// to a player near a live target, and someone else far from every target. Kills are reported the way Champions does
// (realm:champion_slain), so no fight is needed.
//   node tools/test-bds/run.mjs --quiet --flat --only bounty_bp,elite_bp,saga_bp,wander_bp --scenario tools/test-bds/examples/rook-race.js --timeout 600
export default async function (t) {
  const sys = t.system;
  /** @type {{ id: string, m: any, tick: number }[]} */
  const ev = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!["realm:bounty_targets", "realm:bounty_rival", "realm:wander_spawn", "realm:wander_state", "realm:quest_done"].includes(id)) return;
      try {
        ev.push({ id, m: JSON.parse(message), tick: sys.currentTick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id, f = () => true, since = 0) => ev.filter((e) => e.id === id && e.tick >= since && f(e.m)).map((e) => e.m);
  const wdebug = (m) => sys.sendScriptEvent("realm:wander_debug", JSON.stringify(m));
  const sdebug = (m) => sys.sendScriptEvent("realm:saga_debug", JSON.stringify(m));
  const crowns = (p) => {
    try {
      return t.world.scoreboard.getObjective("crowns")?.getScore(p) ?? 0;
    } catch {
      return 0;
    }
  };
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
  /** Stands a player at (x, z) on the ground, its land loaded. */
  const standAt = async (p, x, z) => {
    const { top } = await t.loadArea(x, z, { radius: 2 });
    p.teleport({ x: x + 0.5, y: top.y + 1, z: z + 0.5 });
    await t.wait(10);
  };

  t.server("/time set noon");
  t.server("/gamerule doDaylightCycle false");
  const X = 900, Z = 900;
  await t.loadArea(X, Z, { radius: 3 });
  const p = await t.player("Tester", { op: true, x: X, z: Z });
  await t.wait(20);

  // --- A bounty board: today's two champion targets appear and are broadcast.
  const y = Math.floor(p.location.y);
  t.dimension.getBlock({ x: X + 2, y, z: Z })?.setType("minecraft:lectern");
  p.lookAtBlock({ x: X + 2, y, z: Z });
  await t.wait(5);
  let since = t.tick;
  t.assert(t.cmd(p, "/realm:bounty_board").ok, "bounty_board ran");
  await t.waitMessage(p, /Bounty board registered/, { since, timeout: 60 });
  await t.waitUntil(() => of("realm:bounty_targets", (m) => m.targets.length === 2, since).length > 0, { timeout: 200, message: "realm:bounty_targets lists today's 2 champion targets" });
  const targets = of("realm:bounty_targets", (m) => m.targets.length === 2, since).at(-1).targets;
  t.log("targets:", JSON.stringify(targets));
  t.check(targets.every((x) => x.id && x.name && x.dim === "minecraft:overworld" && Number.isFinite(x.x)), "each target has id, name, dim, x, z");
  t.check(JSON.stringify(of("realm:bounty_targets", (m) => m.targets.length === 2, since).at(-1)).length < 2048, "under 2048 characters");
  since = t.tick;
  sys.sendScriptEvent("realm:bounty_targets_ping", "{}");
  await t.waitUntil(() => of("realm:bounty_targets", (m) => m.targets.length === 2, since).length > 0, { timeout: 80, message: "sent again on realm:bounty_targets_ping" });

  // --- The wanderer pack: Rook comes to a player near a live target, someone else elsewhere.
  const spawn = t.world.getDefaultSpawnLocation();
  const [A, B] = [...targets].sort((a, b) => Math.hypot(b.x - spawn.x, b.z - spawn.z) - Math.hypot(a.x - spawn.x, a.z - spawn.z));
  const sam = await t.player("Sam", { x: X - 200, z: Z - 200 });
  const kim = await t.player("Kim", { x: X + 400, z: Z - 400 });
  await standAt(sam, A.x + 120, A.z);
  const far = (c) => Math.min(...targets.map((x) => Math.hypot(x.x - c.x, x.z - c.z)));
  const kimAt = [{ x: X + 900, z: Z + 900 }, { x: X - 900, z: Z + 900 }, { x: X + 900, z: Z - 900 }, { x: X - 900, z: Z - 900 }].sort((a, b) => far(b) - far(a))[0];
  await standAt(kim, kimAt.x, kimAt.z);
  t.check(targets.every((x) => Math.hypot(x.x - kim.location.x, x.z - kim.location.z) > 300), "Kim is far from every target");
  await t.waitUntil(() => of("realm:wander_state", (m) => m.player === sam.id).length > 0 && of("realm:wander_state", (m) => m.player === kim.id).length > 0, { timeout: 300, message: "saga's wander_state for Sam and Kim" });
  since = t.tick;
  wdebug({ player: sam.id, action: "roll" });
  wdebug({ player: kim.id, action: "roll" });
  await t.waitUntil(() => of("realm:wander_spawn", (m) => m.player === sam.id, since).length > 0, { timeout: 100, message: "someone meets Sam near the target" });
  const samMet = of("realm:wander_spawn", (m) => m.player === sam.id, since)[0];
  t.log("Sam met:", samMet.name, samMet.archetype);
  t.check(samMet.archetype === "rival", "near a live bounty target it's Rook (a rival)");
  await t.wait(20);
  const kimMet = of("realm:wander_spawn", (m) => m.player === kim.id, since)[0];
  t.log("Kim met:", kimMet?.name, kimMet?.archetype);
  t.check(!kimMet || kimMet.archetype !== "rival", "far from every target (and no bounty finished) it isn't Rook");
  t.cmd(p, "/realm:wander_clear");
  await t.wait(10);

  // --- Rook's "Three Bounties", accepted from Rook on the road.
  sdebug({ player: p.id, action: "jump", story: "w_rook_rival", chapter: "bounties" });
  await t.waitUntil(() => of("realm:wander_state", (m) => m.player === p.id && m.ch.rook === "o").length > 0, { timeout: 300, message: "Tester: Rook's next chapter waits" });
  since = t.tick;
  wdebug({ player: p.id, action: "spawn", named: "rook" });
  await t.waitUntil(() => of("realm:wander_spawn", (m) => m.wid === "rook", since).length > 0, { timeout: 60, message: "Rook appears" });
  await t.wait(10);
  const form = t.waitForm(p, { timeout: 200 });
  wdebug({ player: p.id, action: "tap", wid: "rook" });
  const f = await form;
  t.log("Rook offers:", JSON.stringify(f.buttons));
  f.answer(f.buttons.find((b) => /Three Bounties|Wager/.test(b)) ?? 0);
  await walk(p, "Accept");
  await t.waitMessage(p, /Beat Rook to 3 bounty champions/, { timeout: 100 });

  // --- Race 1: within 300 blocks of target A, Rook is on its trail; it falls in time: full pay.
  since = t.tick;
  await standAt(p, A.x + 150, A.z);
  await t.waitUntil(() => of("realm:bounty_rival", (m) => m.id === A.id && m.player === p.id, since).length > 0, { timeout: 100, message: "the race on A starts (realm:bounty_rival)" });
  const r1 = of("realm:bounty_rival", (m) => m.id === A.id, since)[0];
  t.check(Math.abs(r1.until - Date.now() - 300000) < 10000, "the race lasts 300 s");
  await t.waitMessage(p, /Rook is after .* too!/, { since, timeout: 40 });
  let before = crowns(p);
  since = t.tick;
  sys.sendScriptEvent("realm:champion_slain", JSON.stringify({ tag: `realm:bounty:${A.id}`, player: p.id, helpers: [], dim: "minecraft:overworld", x: A.x, y: 70, z: A.z }));
  await t.waitMessage(p, /You beat Rook to/, { since, timeout: 60 });
  await t.waitMessage(p, /\+100 Crowns/, { since, timeout: 60 });
  await t.wait(5);
  t.check(crowns(p) - before === 100, `race won: the bounty pays 100 (got ${crowns(p) - before})`);

  // --- Race 2: on target B, the time runs out: the bounty pays half when it falls.
  since = t.tick;
  await standAt(p, B.x + 150, B.z);
  await t.waitUntil(() => of("realm:bounty_rival", (m) => m.id === B.id && m.player === p.id, since).length > 0, { timeout: 100, message: "the race on B starts" });
  since = t.tick;
  sdebug({ player: p.id, action: "race_expire" });
  await t.waitMessage(p, /Rook got to .* first/, { since, timeout: 60 });
  t.check(of("realm:bounty_rival", (m) => m.id === B.id && m.until <= Date.now(), since).length > 0, "the board hears the race is over");
  before = crowns(p);
  since = t.tick;
  sys.sendScriptEvent("realm:champion_slain", JSON.stringify({ tag: `realm:bounty:${B.id}`, player: p.id, helpers: [], dim: "minecraft:overworld", x: B.x, y: 70, z: B.z }));
  await t.waitMessage(p, /\+50 Crowns .*Rook got there first/, { since, timeout: 60 });
  await t.wait(5);
  t.check(crowns(p) - before === 50, `race lost: the bounty pays 50 (got ${crowns(p) - before})`);
  t.check(!t.messages(p, { since }).some((m) => /You beat Rook/.test(m.plain)), "a lost race doesn't count");
  await t.waitUntil(() => of("realm:bounty_targets", (m) => m.targets.length === 0).length > 0, { timeout: 100, message: "no live targets left: the list says so" });
}
