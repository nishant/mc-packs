// Story Questlines under load: many simulated players, each with two quests going (The Drowned Bell and The
// Cartographer's Last Map), so the tracker, the quest box, the Minimap target and the per-second objective loop all
// run for everyone. Meant for run.mjs --profile; it checks only that the quest boxes were drawn and counts how many
// realm:side and realm:track messages saga sent per player per second (the bus every side-box pack listens to).
//   node tools/test-bds/run.mjs --quiet --no-relay --profile --only saga_bp,npc_bp,hud_bp --scenario tools/test-bds/examples/saga-perf-quests.js --arg players=10 --arg seconds=120 --timeout 3000
// Arguments (--arg key=value): players (default 10), seconds (default 120), spread (blocks between players, default 6).
export default async function (t) {
  const sys = t.system;
  const N = Math.max(1, Number(t.args.players ?? 10));
  const SECONDS = Math.max(10, Number(t.args.seconds ?? 120));
  const SPREAD = Math.max(2, Number(t.args.spread ?? 6));
  t.server("/gamerule sendcommandfeedback false");
  const spawn = t.world.getDefaultSpawnLocation();
  const SX = spawn.x === 0 && spawn.z === 0 ? 163 : spawn.x, SZ = spawn.z === 0 && spawn.x === 0 ? 170 : spawn.z;
  const send = (id, msg) => sys.sendScriptEvent(id, JSON.stringify(msg));
  /** @type {{ tick: number, id: string, player: string, text: string }[]} */
  const msgs = [];
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id !== "realm:side" && id !== "realm:track") return;
    try {
      const m = JSON.parse(message);
      if (id === "realm:side" && m.from !== "saga") return;
      msgs.push({ tick: sys.currentTick, id, player: m.player, text: String(m.text ?? m.label ?? "") });
    } catch {}
  }, { namespaces: ["realm"] });
  const clearAreas = () => {
    try { t.world.getDimension("overworld").runCommand("tickingarea remove_all"); } catch (e) { /* none */ }
  };
  const choose = async (p, npc, key) => {
    let next = t.waitForm(p, { timeout: 400 });
    send("realm:npc_choose", { player: p.id, npc, pack: "saga_bp", key });
    for (let k = 0; k < 20; k++) {
      const f = await next;
      const last = !f.buttons.includes("Next");
      if (!last) next = t.waitForm(p, { timeout: 400 });
      f.answer(last ? Math.max(0, f.buttons.findIndex((b) => /Accept|Finish/.test(b))) : "Next");
      if (last) return;
    }
  };
  const players = [];
  const side = Math.ceil(Math.sqrt(N));
  for (let i = 0; i < N; i++) {
    clearAreas();
    const x = SX + (i % side) * SPREAD, z = SZ + Math.floor(i / side) * SPREAD;
    try {
      players.push(await t.player(`Saga${String(i + 1).padStart(2, "0")}`, { x, z, op: i === 0, settle: 2 }));
    } catch (e) {
      t.log(`could not spawn player ${i + 1}: ${e}`);
    }
  }
  clearAreas();
  t.assert(players.length > 0, "players spawned");
  // Two quests each: accepted in parallel, a few players at a time.
  for (let k = 0; k < players.length; k += 8) {
    const batch = players.slice(k, k + 8);
    await Promise.all(batch.map(async (p) => {
      try {
        await choose(p, "tobin", "start:drowned_bell");
        await t.wait(5);
        await choose(p, "mara", "start:last_map");
      } catch (e) {
        t.log(`${p.name}: ${e}`);
      }
    }));
  }
  t.log(`${players.length} players with quests`);
  const start = t.tick;
  const rnd = (n) => Math.floor(Math.random() * n);
  while (t.tick - start < SECONDS * 20) {
    await t.wait(20);
    for (const p of players) {
      try {
        if (!p.isValid) continue;
        const r = Math.random();
        const l = p.location;
        if (r < 0.3) p.moveToLocation({ x: l.x + rnd(9) - 4 + 0.5, y: l.y, z: l.z + rnd(9) - 4 + 0.5 });
        else if (r < 0.6) p.lookAtLocation({ x: l.x + rnd(21) - 10, y: l.y, z: l.z + rnd(21) - 10 });
      } catch { /* ignore */ }
    }
  }
  const window = msgs.filter((m) => m.tick >= start);
  const per = (id) => window.filter((m) => m.id === id).length / Math.max(1, players.length) / SECONDS;
  t.log(`saga sent ${window.filter((m) => m.id === "realm:side").length} realm:side and ${window.filter((m) => m.id === "realm:track").length} realm:track in ${SECONDS} s: ${per("realm:side").toFixed(3)} side and ${per("realm:track").toFixed(3)} track per player per second`);
  const boxed = new Set(window.filter((m) => m.id === "realm:side" && /Drowned Bell|Last Map/.test(m.text)).map((m) => m.player));
  t.log(`players whose quest box was drawn: ${boxed.size}/${players.length}`);
  t.check(boxed.size >= Math.ceil(players.length * 0.8), `quest boxes drawn for most players (${boxed.size}/${players.length})`);
}
