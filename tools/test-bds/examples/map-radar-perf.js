// Performance soak for the Minimap with the radar on (map_bp): perf-soak.js leaves the optional radar off, so the
// terrain scanner, its planner and the radar's terrain pictures never run there. Here every player turns the radar on
// (the `radar` preference, as /realm:prefs does) and plays one of three parts, by turns: standing still, walking
// (4.3 blocks a second) or flying (teleported `fly` blocks a tick, 20 blocks a second by default), each in a lane of
// their own so every mover needs new columns all the time. The window is long enough for the shared surface store to
// reach its cap (6,000 columns, 1,200 per player online up to 48,000) and for the standing radars' first circle to
// come due for its 2-minute re-read, so both at-cap planning (HUD-29) and the re-read (HUD-30) are measured. Phases
// for the profile JSON: fill (first 20 s), cap (to 110 s), refresh (110 to 140 s, the standing re-read), late (the
// rest). Meant for run.mjs --profile, and reports perf-workload like perf-soak.js:
//   node tools/test-bds/run.mjs --quiet --flat --no-relay --profile --only map_bp --scenario tools/test-bds/examples/map-radar-perf.js --arg players=10 --arg seconds=150 --timeout 3000
// Arguments (--arg key=value): players (default 10), seconds (default 150), fly (blocks a tick, default 1), lane
// (blocks between players, default 96).
export default async function (t) {
  const a = t.args;
  const N = Math.max(3, Number(a.players ?? 10));
  const SECONDS = Math.max(30, Number(a.seconds ?? 150));
  const FLY = Math.max(0.3, Number(a.fly ?? 1));
  const LANE = Math.max(80, Number(a.lane ?? 96));
  const WALK = 4.3 / 20;
  const sys = t.system;
  const spawn = t.world.getDefaultSpawnLocation();
  const X0 = Math.floor(spawn.x) - Math.floor((N * LANE) / 2), Z0 = Math.floor(spawn.z);
  t.server("/gamerule sendcommandfeedback false");
  t.server("/gamerule domobspawning false");
  t.server("/time set day");

  // Replies from map_bp: preference acks and debug state (single-packet actions only: lab, cost, detail).
  const replies = [];
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id !== "realm:map_state" && id !== "realm:cfg_ack") return;
    try { const m = JSON.parse(message); if (m && !m.chunk) replies.push({ id, m, tick: sys.currentTick }); } catch { /* not ours */ }
    if (replies.length > 400) replies.splice(0, 200);
  }, { namespaces: ["realm"] });
  const send = (id, m) => sys.sendScriptEvent(id, JSON.stringify(m));
  const ask = async (m, match) => {
    const since = sys.currentTick;
    send("realm:map_debug", m);
    try {
      await t.waitUntil(() => replies.some((e) => e.id === "realm:map_state" && e.tick >= since && match(e.m)), { timeout: 40, message: "map debug " + m.action });
    } catch { return undefined; }
    return replies.filter((e) => e.id === "realm:map_state" && e.tick >= since && match(e.m)).at(-1).m;
  };
  const lab = () => ask({ action: "lab" }, (m) => !!m.counters);

  // Bedrock allows 10 ticking areas: the harness adds one per spawn, so remove them after each spawn (as perf-soak.js).
  const cleared = new Set();
  const clearAreas = () => {
    const raw = t.world.getDynamicProperty("harness:tickingAreas");
    const areas = raw === undefined ? [] : JSON.parse(raw);
    for (const area of areas) {
      const key = `${area.dimension}|${area.name}`;
      if (cleared.has(key) || !/^harness_\d+_\d+$/.test(area.name)) continue;
      t.world.getDimension(area.dimension).runCommand(`tickingarea remove "${area.name}"`);
      cleared.add(key);
    }
  };

  const KINDS = ["stand", "walk", "fly"];
  /** @type {{ p: any, kind: string, x: number, y: number, z: number }[]} */
  const players = [];
  const t0 = t.tick;
  for (let i = 0; i < N; i++) {
    const kind = KINDS[i % 3], x = X0 + i * LANE + 0.5;
    for (let attempt = 0; attempt < 3; attempt++) {
      clearAreas();
      await t.wait(1);
      try {
        const p = await t.player(`Radar${String(i + 1).padStart(3, "0")}`, { x, z: Z0 + attempt * 7, op: i === 0, gameMode: "creative", settle: 2 });
        const l = p.location;
        players.push({ p, kind, x, y: l.y, z: l.z });
        break;
      } catch (e) {
        t.log(`could not spawn player ${i + 1} (try ${attempt + 1}): ${e}`);
      }
    }
    clearAreas();
  }
  const made = players.length;
  const count = (k) => players.filter((s) => s.kind === k).length;
  const kinds = { land: made, water: 0, nether: 0, groups: made, stand: count("stand"), walk: count("walk"), fly: count("fly") };
  t.log(`spawned ${made}/${N} players in ${((t.tick - t0) / 20).toFixed(0)} s: ${kinds.stand} standing, ${kinds.walk} walking, ${kinds.fly} flying ${FLY} blocks a tick`);
  const declared = { players: N, seconds: SECONDS, fly: FLY, lane: LANE };
  const spawnGameSeconds = (t.tick - t0) / 20;
  t.report("perf-workload", { schema: 1, declared, spawned: made, spawnGameSeconds, kinds });
  t.assert(made === N, `all ${N} declared players spawned (${made} did)`);

  // Everyone turns the radar on (terrain colors are on by default), like the switch in /realm:prefs.
  let request = 0;
  const asked = [];
  for (const s of players) {
    const id = "radarperf_" + ++request;
    asked.push(id);
    send("realm:cfg_set", { id, pack: "map_bp", player: s.p.id, key: "radar", value: true });
  }
  await t.waitUntil(() => asked.every((id) => replies.some((e) => e.id === "realm:cfg_ack" && e.m.id === id)), { timeout: 200, message: "radar preference acks" });
  const refused = asked.filter((id) => replies.find((e) => e.id === "realm:cfg_ack" && e.m.id === id)?.m.ok !== true);
  t.assert(refused.length === 0, `every player's radar preference was saved (${refused.length} refused)`);
  // The standing radars read their first circle here, before the window (about 25 ticks each at the scan ceiling).
  await t.wait(100);
  let reading = 0;
  for (const s of players) {
    const d = await ask({ player: s.p.id, action: "detail" }, (m) => m.player === s.p.id && !!m.detail);
    if (d && d.detail.fullCircleSampled > 0) reading++;
  }
  t.check(reading === made, `every radar has terrain read around it before the window (${reading}/${made})`);

  // The soak: movers step every tick; one presence sample a second; the store's size every 5 s.
  const valid = (p) => { try { return p.isValid; } catch { return false; } };
  await ask({ player: players[0].p.id, action: "cost" }, (m) => !!m.cost); // resets the cost and queue counters
  const labAtStart = await lab();
  const start = t.tick;
  const phaseAt = [["fill", 0], ["cap", 20], ["refresh", 110], ["late", 140]].filter(([, s]) => s < SECONDS);
  const phases = phaseAt.map(([name, s], i) => ({ name, startTick: start + s * 20, endTick: start + Math.min(SECONDS, phaseAt[i + 1]?.[1] ?? SECONDS) * 20 }));
  let samples = 0, minValid = Infinity, steps = 0, capAt = null, peakCols = 0, sampledAt = -Infinity, sizedAt = -Infinity;
  const sizes = [];
  while (t.tick - start < SECONDS * 20) {
    await t.wait(1);
    const k = t.tick - start;
    for (const s of players) {
      if (s.kind === "stand") continue;
      s.z += s.kind === "walk" ? WALK : FLY;
      try { s.p.teleport({ x: s.x, y: s.y, z: s.z }, { rotation: { x: 0, y: 0 } }); steps++; } catch { /* gone: counted below */ }
    }
    if (k - sampledAt >= 20) {
      sampledAt = k;
      let validNow = 0;
      for (const s of players) if (valid(s.p)) validNow++;
      samples++;
      minValid = Math.min(minValid, validNow);
    }
    if (k - sizedAt >= 100) {
      sizedAt = k;
      const l = await lab();
      if (l?.cache) {
        const cap = l.cache.cap ?? Math.max(6000, Math.min(48000, made * 1200));
        peakCols = Math.max(peakCols, l.cache.native);
        sizes.push(`${Math.round(k / 20)}s ${l.cache.native}`);
        if (capAt === null && l.cache.native >= cap) capAt = Math.round(k / 20);
      }
    }
  }
  const end = t.tick;
  const queue = (await ask({ action: "queue" }, (m) => !!m.queue))?.queue ?? {};
  const cost = await ask({ player: players[0].p.id, action: "cost" }, (m) => !!m.cost); // also resets the queue counters
  const labAtEnd = await lab();
  const alive = players.filter((s) => valid(s.p)).length;
  const ticks = end - start;
  const c = cost?.cost ?? {};
  const d = (key) => (labAtEnd?.counters?.[key] ?? 0) - (labAtStart?.counters?.[key] ?? 0);
  t.log(`soak done: ${SECONDS} s, ${alive}/${N} players, ${steps} steps; store ${sizes.join(", ")}; peak ${peakCols} columns, at its cap from ${capAt === null ? "never" : capAt + " s"}`);
  t.log(`radar work over the window: ${c.scanReads ?? "?"} reads, scanner ${c.scanMs ?? "?"} ms (planning ${c.scanPlanMs ?? "?"} ms), ${d("planned")} full plans, ${d("rolled")} rolled, ${c.rebuilds ?? "?"} picture rebuilds, ${c.turnSends ?? "?"} titles`);
  const q = (key) => queue[key] ?? "?";
  t.log(`scanner time over the window (ms): retries ${q("candidateRetryMs")}, plans ${q("planForMs")}, viewer checks ${q("viewerPruneMs")}, reads ${q("dispatchMs")}, cleanup ${q("cleanupMs")}; ${q("nativeAttempt")} read operations (${q("nativeMiss")} missed), ${q("admissionVisited")} picks looked at, ${q("rangeSkips")} out of range, ${q("deferredPlans")} plans deferred, longest queue ${q("remainingPeak")}; rolled tails ${d("rollTail")}, entered ${d("rollEntered")}`);
  t.report("perf-workload", {
    schema: 1, declared, spawned: made, spawnGameSeconds, kinds,
    soak: { startTick: start, endTick: end, ticks, seconds: ticks / 20 },
    retention: { samples, minValid: samples ? minValid : 0, endValid: alive },
    phases,
    radar: { steps, peakCols, capAt, sizes, scanReads: c.scanReads, scanMs: c.scanMs, scanPlanMs: c.scanPlanMs, planned: d("planned"), rolled: d("rolled"), rollTail: d("rollTail"), queue, rebuilds: c.rebuilds, turnSends: c.turnSends, stores: labAtEnd?.cache?.stores },
  });
  t.check(samples > 0 && minValid === N && alive === N, `all ${N} players stayed in the world for the whole ${SECONDS} s soak`);
  t.check(ticks >= SECONDS * 20, `the steady window ran its full ${SECONDS} s (${(ticks / 20).toFixed(1)} s)`);
}
