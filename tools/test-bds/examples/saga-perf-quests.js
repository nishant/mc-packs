// Story Questlines under load: many simulated players, each with two quests going (The Drowned Bell and The
// Cartographer's Last Map), so the tracker, the quest box, the Minimap target and the per-second objective loop all
// run for everyone. Meant for run.mjs --profile; it fails unless exactly the declared players spawned, each shows both quests in saga's quest box and all stay for the whole window (reported as saga-quest-workload), and counts how many
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
  /** @type {Map<string, Set<string>>} the quests each player's saga quest box has listed */
  const boxes = new Map();
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id !== "realm:side" && id !== "realm:track") return;
    try {
      const m = JSON.parse(message);
      if (id === "realm:side" && m.from !== "saga") return;
      msgs.push({ tick: sys.currentTick, id, player: m.player, text: String(m.text ?? m.label ?? "") });
      if (id === "realm:side" && m.slot === "quest") {
        const seen = boxes.get(m.player) ?? new Set();
        for (const q of ["Drowned Bell", "Last Map"]) if (String(m.text ?? "").includes(q)) seen.add(q);
        boxes.set(m.player, seen);
      }
    } catch {}
  }, { namespaces: ["realm"] });
  const clearedAreas = new Set();
  const clearAreas = () => {
    const raw = t.world.getDynamicProperty("harness:tickingAreas");
    const areas = raw === undefined ? [] : JSON.parse(raw);
    if (!Array.isArray(areas)) throw new Error("The harness ticking-area list is not an array");
    for (const area of areas) {
      const key = `${area.dimension}|${area.name}`;
      if (clearedAreas.has(key)) continue;
      if (!/^harness_\d+_\d+$/.test(area.name) || !["minecraft:overworld", "minecraft:nether", "minecraft:the_end"].includes(area.dimension))
        throw new Error("Refusing to remove an area not owned by the harness");
      const result = t.world.getDimension(area.dimension).runCommand(`tickingarea remove "${area.name}"`);
      if (!(result.successCount > 0)) throw new Error(`Could not remove fixture area ${area.name}`);
      clearedAreas.add(key);
    }
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
    throw new Error(`${key}: no final form after 20 pages`);
  };
  const players = [];
  const side = Math.ceil(Math.sqrt(N));
  const spots = Array.from({ length: N }, (_, i) => ({ x: SX + (i % side) * SPREAD, z: SZ + Math.floor(i / side) * SPREAD }));
  // F73/F75: an area removed while its outer chunks still load leaves them unloadable for the rest of the run, and
  // removing each player's own area 2 ticks after it spawned did that ("spawned 5 of 10 declared players"). So one
  // radius-2 loader per 64-block tile of the grid (it always covers the tile), each loaded whole; the players spawn
  // under them (area: false) and the loaders go once everyone has settled.
  const tiles = new Map();
  for (const s of spots) {
    const kx = Math.floor((s.x - SX) / 64), kz = Math.floor((s.z - SZ) / 64);
    tiles.set(`${kx},${kz}`, { x: SX + kx * 64 + 32, z: SZ + kz * 64 + 32 });
  }
  await Promise.all([...tiles.values()].map((c) => t.loadArea(c.x, c.z, { radius: 2, whole: true, timeout: 1200 }).catch((e) => t.log(`grid loader: ${e}`))));
  for (let i = 0; i < N; i++) {
    try {
      players.push(await t.player(`Saga${String(i + 1).padStart(2, "0")}`, { ...spots[i], op: i === 0, settle: 1, area: false, timeout: 100 }));
    } catch (e) {
      t.log(`could not spawn player ${i + 1}: ${e}`);
    }
  }
  await t.wait(10);
  clearAreas();
  const failures = [];
  const report = (extra) => t.report("saga-quest-workload", { schema: 1, declared: N, spawned: players.length, retained, quested, seconds: SECONDS, startGameTick, endGameTick, windowTicks: endGameTick - startGameTick, minValid, failures, ...extra });
  let retained = 0, quested = 0, startGameTick = 0, endGameTick = 0, minValid = 0;
  if (players.length !== N) {
    failures.push(`spawned ${players.length} of ${N} declared players`);
    report({});
    t.assert(false, failures[0]);
  }
  // Two quests each: accepted in parallel, a few players at a time. A failed accept is kept, not swallowed.
  const acceptErrors = new Map();
  for (let k = 0; k < players.length; k += 8) {
    const batch = players.slice(k, k + 8);
    await Promise.all(batch.map(async (p) => {
      try {
        await choose(p, "tobin", "start:drowned_bell");
        await t.wait(5);
        await choose(p, "mara", "start:last_map");
      } catch (e) {
        acceptErrors.set(p.name, String(e));
        t.log(`${p.name}: ${e}`);
      }
    }));
  }
  // Proof of two real quests: saga's own quest box (realm:side, slot quest) lists every quest a player has going.
  const both = () => players.filter((p) => boxes.get(p.id)?.has("Drowned Bell") && boxes.get(p.id)?.has("Last Map"));
  for (let k = 0; k < 20 && both().length < players.length; k++) await t.wait(10);
  quested = both().length;
  for (const p of players) {
    if (acceptErrors.has(p.name)) failures.push(`${p.name} accept failed: ${acceptErrors.get(p.name)}`);
    else if (!both().includes(p)) failures.push(`${p.name} never showed both quests in the quest box`);
  }
  t.log(`${quested}/${players.length} players with both quests`);
  const start = t.tick;
  startGameTick = start;
  minValid = players.length;
  const rnd = (n) => Math.floor(Math.random() * n);
  while (t.tick - start < SECONDS * 20) {
    await t.wait(20);
    minValid = Math.min(minValid, players.filter((p) => { try { return p.isValid; } catch { return false; } }).length);
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
  endGameTick = t.tick;
  retained = players.filter((p) => { try { return p.isValid; } catch { return false; } }).length;
  if (minValid !== N || retained !== N) failures.push(`players retained: fewest ${minValid}, at the end ${retained} of ${N}`);
  if (endGameTick - startGameTick < SECONDS * 20) failures.push(`window ran ${endGameTick - startGameTick} of ${SECONDS * 20} ticks`);
  report({});
  t.check(failures.length === 0, `saga quest workload held: ${failures.length ? failures.slice(0, 5).join("; ") : `${N} players, 2 quests each, ${SECONDS} s`}`);  const window = msgs.filter((m) => m.tick >= start);
  const per = (id) => window.filter((m) => m.id === id).length / Math.max(1, players.length) / SECONDS;
  t.log(`saga sent ${window.filter((m) => m.id === "realm:side").length} realm:side and ${window.filter((m) => m.id === "realm:track").length} realm:track in ${SECONDS} s: ${per("realm:side").toFixed(3)} side and ${per("realm:track").toFixed(3)} track per player per second`);
  const boxed = new Set(window.filter((m) => m.id === "realm:side" && /Drowned Bell|Last Map/.test(m.text)).map((m) => m.player));
  t.log(`players whose quest box was drawn: ${boxed.size}/${players.length}`);
}
