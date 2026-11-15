// Performance soak: many simulated players spread around the world for a few minutes, walking, looking
// around, sneaking, jumping and running a few common commands, so the packs do their usual per-player
// work. Meant for run.mjs --profile. A soak only counts as an N-player measurement when all N players
// spawned, all of them stayed in the world at every second of the soak, the declared water and Nether
// players were placed, and the full steady window ran: the scenario fails otherwise and reports
// {declared, spawned, retention, soak window} as `perf-workload`, which run.mjs puts into the profile JSON
// next to its acceptance verdict (lib/perf-acceptance.mjs).
//   node tools/test-bds/run.mjs --quiet --no-relay --profile --scenario tools/test-bds/examples/perf-soak.js --arg players=10 --arg seconds=120 --timeout 900
// Development comparisons use 10 and 40 players with 120 s windows; release validation uses 300 s (--arg seconds=300).
// Arguments (--arg key=value): players (default 10), seconds (default 120), group (players per
// group, default 5), spread (blocks between far groups, default 240), commands (seconds between one
// player's commands, default 45; 0 = none), water (players put in a pool, default 2), nether
// (players in the Nether, default 2), hud (1: the Coordinates HUD on for everyone, for the native realm:hud_state
// proof at 100 players, O6; run it with commands=0 so no /realm:hud toggles anyone off), wanderers (with
// wander_bp: this many wanderers made to appear next to every land group as the soak starts, default 0 = only the pack's own
// rolls; for measuring Wanderers of the Wilds' nameplate labels on every run, not only when a roll happens), probe (seconds between memory
// probes, default 0 = none: entity counts by type, scoreboard participants, structures and every pack's saved world
// data (realm:diag_ping bytes; each pack's storage is its own, so the scenario can't read it directly),
// logged and reported as `perf-probe`, for memory soaks with rss-soak.mjs; leave it off when profiling).
// With hud_bp in the run, every realm:hud_state is assembled by seq like Stats and Parties do: each message must
// stay under 2048 characters, and with hud=1 a complete list must name every player.
// The world is pinned (UTL-01, PIPE-04): time (default 6000, noon; -1 leaves the clock running) and weather (clear, rain,
// thunder, or none to leave it) are set with their cycles off before anything else, so every soak, the bundle's and the
// A/B soaks', measures the same daylight; both are read back at the start and the end of the steady window and reported
// as `world` in perf-workload.
// phases=1 (validate.yml's soaks, through suite.mjs --perf-arg) adds named phases that the profiler reports one by one
// (lib/profile-report.mjs): `empty` (20 s before the first player), `one` (30 s with player 1 alone), `ramp` (the other
// players joining), `steady` (the window above, the only one acceptance and the A/B judge), then `churn` (60 s: a leave
// and a rejoin every 5 s, two deaths and respawns, two players to the Nether and back, break and place loops on 4
// players, 20 summoned zombies killed each second for 20 s, /realm:help, /realm:prefs and /realm:config once each).
// Retention is judged on the steady window only; churned players are counted in `churn`, never against it.
// night=N (seconds, default 0; validate.yml's bundle-40) adds a `night` phase after that: midnight in a thunderstorm,
// the crowd doing what it did in the steady window (players get Resistance so the night's monsters don't kill them).
// Lengths: empty, one and churn (seconds) override the phase lengths.
// Layout: group 0 at the world spawn and group 1 30 blocks from it; the other groups on a ring of
// `spread`-block steps around spawn (so 200+ blocks apart). Water players stand in a 7x7 pool dug at
// group 1; Nether players stand in a cleared pocket at the spawn's Nether coordinates.
// Bedrock allows 10 ticking areas: the harness adds one per spawn, so this removes them after each
// spawn (the players keep their own chunks loaded).
export default async function (t) {
  const a = t.args;
  const N = Math.max(1, Number(a.players ?? 10));
  const SECONDS = Math.max(10, Number(a.seconds ?? 120));
  const GROUP = Math.max(1, Number(a.group ?? 5));
  const SPREAD = Math.max(50, Number(a.spread ?? 240));
  const CMD_EVERY = Math.max(0, Number(a.commands ?? 45));
  const PROBE_EVERY = Math.max(0, Number(a.probe ?? 0));
// Hotbar Refill: every `refill` seconds a land player's hotbar slot 0 is emptied and refill_bp/stash_bp are asked to
// refill it (rockets that sit on the first page, then a request nothing can answer, which the page index must refuse cheaply).
const REFILL_EVERY = Math.max(0, Number(a.refill ?? 20));
  const WATER = Math.min(N, Math.max(0, Number(a.water ?? 2)));
  const NETHER = Math.min(Math.max(0, N - WATER - 1), Math.max(0, Number(a.nether ?? 2)));
  const HUD = Number(a.hud ?? 0) > 0;
  const WANDERERS = t.packs.includes("wander_bp") ? Math.max(0, Number(a.wanderers ?? 0)) : 0;
  const over = t.world.getDimension("overworld");
  /** realm:hud_state assembled by seq: the lists completed, their largest size and parts, the longest message. */
  const hudState = { messages: 0, longest: 0, lists: 0, largest: 0, parts: 0, last: /** @type {string[]} */ ([]), seq: /** @type {Map<unknown, { parts: number, got: Map<number, string[]> }>} */ (new Map()) };
  const withHud = t.packs.includes("hud_bp");
  if (withHud) t.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id !== "realm:hud_state") return;
    hudState.messages++;
    hudState.longest = Math.max(hudState.longest, message.length);
    try {
      const m = JSON.parse(message);
      const parts = Number(m.parts ?? 1);
      const key = m.seq ?? "none";
      let at = hudState.seq.get(key);
      if (!at) hudState.seq.set(key, (at = { parts, got: new Map() }));
      at.got.set(Number(m.part ?? 1), Array.isArray(m.players) ? m.players : []);
      if (at.got.size < at.parts) return;
      hudState.seq.delete(key);
      const list = [...at.got.values()].flat();
      hudState.lists++;
      hudState.last = list;
      if (list.length >= hudState.largest) [hudState.largest, hudState.parts] = [list.length, at.parts];
    } catch (e) {
      t.log(`realm:hud_state not JSON: ${e}`);
    }
  }, { namespaces: ["realm"] });
  if (HUD && withHud) t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "soak_hud", pack: "hud_bp", key: "defaultOn", value: true }));
  const nether = t.world.getDimension("nether");
  const spawn = t.world.getDefaultSpawnLocation();
  const SX = spawn.x === 0 && spawn.z === 0 ? 163 : spawn.x, SZ = spawn.z === 0 && spawn.x === 0 ? 170 : spawn.z;
  t.server("/gamerule sendcommandfeedback false");
  t.server("/gamerule showcoordinates false");
  // The pinned world (UTL-01): the same daylight and weather in every soak.
  const TIME = a.time === undefined ? 6000 : Math.floor(Number(a.time));
  const WEATHER = ["clear", "rain", "thunder", "none"].includes(String(a.weather)) ? String(a.weather) : "clear";
  const PHASES = Number(a.phases ?? 0) > 0;
  const EMPTY_S = PHASES ? Math.max(0, Number(a.empty ?? 20)) : 0;
  const ONE_S = PHASES ? Math.max(0, Number(a.one ?? 30)) : 0;
  const CHURN_S = PHASES ? Math.max(0, Number(a.churn ?? 60)) : 0;
  const NIGHT_S = Math.max(0, Number(a.night ?? 0));
  const setWeather = (/** @type {string} */ w) => {
    t.server("/gamerule doweathercycle false");
    t.server(`/weather ${w} 1000000`);
  };
  if (Number.isFinite(TIME) && TIME >= 0) {
    t.server("/gamerule dodaylightcycle false");
    t.server(`/time set ${TIME}`);
  }
  if (WEATHER !== "none") setWeather(WEATHER);
  // Dimension.getWeather is not in the stable API this harness runs: the last weatherChange seen stands in for it.
  let weatherSeen = WEATHER === "none" ? "unknown" : `${WEATHER} (set)`;
  try { t.world.afterEvents.weatherChange.subscribe((/** @type {any} */ ev) => { if (ev.dimension === "minecraft:overworld" || ev.dimension === "overworld") weatherSeen = String(ev.newWeather); }); } catch (e) { /* no event */ }
  const weatherNow = () => { try { return String(over.getWeather()); } catch (e) { return weatherSeen; } };
  const worldNow = () => { let timeOfDay = -1; try { timeOfDay = t.world.getTimeOfDay(); } catch (e) { /* unknown */ } return { timeOfDay, weather: weatherNow() }; };
  t.log(`world pinned: time ${TIME >= 0 ? TIME : "running"}, weather ${WEATHER} (now ${JSON.stringify(worldNow())})`);
  /** Named windows the profiler reports one by one. @type {{ name: string, startTick: number, endTick: number, players: number }[]} */
  const phases = [];
  const phase = (/** @type {string} */ name, /** @type {number} */ startTick, /** @type {number} */ players) => {
    const ph = { name, startTick, endTick: t.tick, players };
    phases.push(ph);
    t.log(`phase ${name}: ${((ph.endTick - ph.startTick) / 20).toFixed(0)} s, ${players} players`);
  };
  // The empty world, the Realm's usual state: after the profiler's reset has landed, nobody in it.
  if (EMPTY_S) {
    await t.wait(40);
    const from = t.tick;
    await t.wait(EMPTY_S * 20);
    phase("empty", from, 0);
  }

  const clearedAreas = new Set();
  // Never remove a production pack's loader while preparing the simulated population.
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
    try { nether.runCommand("tickingarea remove soak_nether"); } catch (e) { /* optional scenario-owned pocket */ }
  };
  const rnd = (n) => Math.floor(Math.random() * n);
  const ringSpot = (k) => {
    // group k >= 2: k-1 steps of SPREAD on a square spiral (x, z, -x, -z, then 2x, ...)
    const i = k - 2, ring = 1 + Math.floor(i / 8), dir = i % 8;
    const dx = [1, 0, -1, 0, 1, -1, 1, -1][dir], dz = [0, 1, 0, -1, 1, 1, -1, -1][dir];
    return { x: SX + dx * ring * SPREAD, z: SZ + dz * ring * SPREAD };
  };
  const groupSpot = (g) => (g === 0 ? { x: SX, z: SZ } : g === 1 ? { x: SX + 30, z: SZ + 10 } : ringSpot(g));

  /** @type {{ p: any, name: string, home: {x:number, y:number, z:number}, dim: any, kind: string }[]} */
  const players = [];
  let t0 = t.tick;

  // F73: a ticking area removed while its chunks are still loading can leave them unloadable for the rest of the run
  // (a later area over them never loads them: "chunk at -74,412 did not load in 400 ticks"). So every loader here waits
  // until its whole circle can be read and stays until the players it serves have settled. One loader per group: its
  // players spawn together under it (area: false), WAVE groups at a time (the first wave also keeps the pool's and the
  // Nether pocket's loaders), within Bedrock's 10 ticking areas next to the production packs' own.
  const WAVE = 4, SETTLE = 10;
  const loadWhole = (x, z, opts = {}) => t.loadArea(x, z, { radius: 2, timeout: 1200, whole: true, ...opts });
  const name = (i) => `Soak${String(i + 1).padStart(2, "0")}`;
  // One player alone (phases=1): player 1 (the operator, group 0) joins first and plays alone for ONE_S seconds.
  /** @type {any} */
  let first = null;
  if (ONE_S) {
    const c = groupSpot(0);
    try {
      await loadWhole(c.x, c.z);
      first = await t.player(name(0), { x: c.x + rnd(9) - 4, z: c.z + rnd(9) - 4, dimension: "overworld", op: true, settle: 1, area: false, timeout: 100 });
    } catch (e) {
      t.log(`could not spawn ${name(0)} alone: ${e}`);
    }
    await t.wait(SETTLE);
    clearAreas();
    await t.wait(1);
    const from = t.tick;
    const home = first ? { x: Math.floor(first.location.x), y: Math.floor(first.location.y), z: Math.floor(first.location.z) } : null;
    for (let s = 0; s < ONE_S; s++) {
      await t.wait(20);
      try {
        if (home && Math.random() < 0.35) first.moveToLocation({ x: home.x + rnd(17) - 8 + 0.5, y: home.y, z: home.z + rnd(17) - 8 + 0.5 });
      } catch (e) { /* left already */ }
    }
    phase("one", from, first ? 1 : 0);
    t0 = t.tick;
  }
  // Water pool at group 1 (dug where the ground is, so it stays put).
  let pool = null;
  if (WATER) {
    const c = groupSpot(1);
    const { top } = await loadWhole(c.x + 20, c.z);
    const y = top.location.y;
    const x = Math.floor(c.x + 20), z = Math.floor(c.z);
    // 3 deep, but its stone floor stays in the world: in a flat world (grass at -61) a floor at y - 4 is below the
    // bottom, the water replaced the bedrock and a swimmer could sink into the void.
    const floor = Math.max(y - 4, (over.heightRange?.min ?? -64));
    t.server(`/fill ${x - 3} ${floor + 1} ${z - 4} ${x + 3} ${y + 3} ${z + 3} air`);
    t.server(`/fill ${x - 4} ${floor} ${z - 4} ${x + 4} ${floor} ${z + 4} stone`);
    t.server(`/fill ${x - 3} ${floor + 1} ${z - 3} ${x + 3} ${y} ${z + 3} water`);
    pool = { x, y: Math.max(y - 2, floor + 1), z };
  }
  // Nether pocket.
  let pocket = null;
  if (NETHER) {
    const x = Math.floor(SX / 8), z = Math.floor(SZ / 8);
    const ok = await loadWhole(x, z, { dimension: nether }).catch((e) => { t.log(`nether pocket: ${e}`); return false; });
    if (ok) {
      nether.runCommand(`fill ${x - 4} 64 ${z - 4} ${x + 4} 69 ${z + 4} air`);
      nether.runCommand(`fill ${x - 4} 63 ${z - 4} ${x + 4} 63 ${z + 4} netherrack`);
      pocket = { x, y: 64, z };
    }
  }

  let made = 0;
  const plan = [];
  for (let i = 0; i < N; i++) {
    let kind = "land", dim = over, spot, g = -1;
    if (i >= 1 && i <= WATER && pool) { kind = "water"; spot = { x: pool.x - 1 + i, y: pool.y, z: pool.z }; }
    else if (i > WATER && i <= WATER + NETHER && pocket) { kind = "nether"; dim = nether; spot = { x: pocket.x - 2 + (i - WATER), y: pocket.y, z: pocket.z }; }
    else {
      g = Math.floor(i / GROUP);
      const c = groupSpot(g);
      spot = { x: c.x + rnd(9) - 4, z: c.z + rnd(9) - 4 };
    }
    plan.push({ i, kind, dim, spot, g });
  }
  const spawned = new Array(N);
  if (first) {
    const l = first.location;
    spawned[0] = { p: first, name: name(0), home: { x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) }, dim: over, kind: "land" };
    made++;
  }
  const spawnOne = async ({ i, kind, dim, spot }) => {
    if (spawned[i]) return;
    // A spot that still cannot be read under its group's loader: try again a little further on, under a loader of its own.
    for (let attempt = 0; attempt < 3; attempt++) {
      const at = attempt && kind === "land" ? { ...spot, x: spot.x + attempt * 7, z: spot.z - attempt * 5 } : spot;
      try {
        if (attempt) await loadWhole(at.x, at.z, { dimension: dim });
        const p = await t.player(name(i), { ...at, dimension: kind === "nether" ? "nether" : "overworld", op: i === 0, settle: 1, area: false, timeout: attempt ? 400 : 100 });
        const l = p.location;
        spawned[i] = { p, name: name(i), home: { x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) }, dim, kind };
        made++;
        return;
      } catch (e) {
        t.log(`could not spawn ${name(i)} (${kind}, try ${attempt + 1}): ${e}`);
      }
    }
  };
  const groups = [...new Set(plan.filter((s) => s.kind === "land").map((s) => s.g))];
  for (let w = 0; w === 0 || w < groups.length; w += WAVE) {
    const wave = groups.slice(w, w + WAVE);
    await Promise.all(wave.map((g) => { const c = groupSpot(g); return loadWhole(c.x, c.z).catch((e) => t.log(`group ${g} loader: ${e}`)); }));
    await Promise.all(plan.filter((s) => wave.includes(s.g) || (w === 0 && s.kind !== "land")).map(spawnOne));
    // A simulated player holds the chunks around it from its first tick; the loaders go once the wave has settled.
    await t.wait(SETTLE);
    clearAreas();
    await t.wait(1);
  }
  t.log(`spawn waves: ${Math.max(1, Math.ceil(groups.length / WAVE))} of up to ${WAVE} groups, ${SETTLE} ticks to settle`);
  for (const s of spawned) if (s) players.push(s);
  t.log(`spawned ${made}/${N} players in ${((t.tick - t0) / 20).toFixed(0)} s (${players.filter((x) => x.kind === "water").length} in water, ${players.filter((x) => x.kind === "nether").length} in the Nether, ${Math.ceil(N / GROUP)} groups)`);
  const kinds = { land: players.filter((x) => x.kind === "land").length, water: players.filter((x) => x.kind === "water").length, nether: players.filter((x) => x.kind === "nether").length, groups: Math.ceil(N / GROUP) };
  const declared = { players: N, seconds: SECONDS, group: GROUP, spread: SPREAD, commands: CMD_EVERY, refill: REFILL_EVERY, water: WATER, nether: NETHER, time: TIME, weather: WEATHER, phases: PHASES, empty: EMPTY_S, one: ONE_S, churn: CHURN_S, night: NIGHT_S };
  const spawnGameSeconds = (t.tick - t0) / 20;
  if (PHASES) phase("ramp", t0, made);
  // The profile only counts as an N-player measurement when all N spawned (the old guard was `made > 0`): report what
  // happened first, so a short run is documented in the profile JSON, then fail.
  t.report("perf-workload", { schema: 1, declared, spawned: made, spawnGameSeconds, kinds });
  t.assert(made === N, `all ${N} declared players spawned (${made} did)`);

  const COMMANDS = [
    ["help_bp", "/realm:help"], ["stats_bp", "/realm:stats"], ["hud_bp", "/realm:hud"], ["quests_bp", "/realm:quests"],
    ["map_bp", "/realm:map"], ["party_bp", "/realm:party"], ["death_bp", "/realm:death"], ["weather_bp", "/realm:weather"],
    ["crowns_bp", "/realm:crowns_balance"], ["journal_bp", "/realm:journal"], ["goals_bp", "/realm:goals"], ["calendar_bp", "/realm:calendar"],
  ].filter(([pack]) => t.packs.includes(pack)).map(([, c]) => c);

  // Memory probes (probe=N): what the world holds that could grow, every N seconds of the soak.
  /** @type {any[]} */
  const probes = [];
  /** @type {Map<string, any>} */
  const pongs = new Map();
  if (PROBE_EVERY) {
    t.system.afterEvents.scriptEventReceive.subscribe((/** @type {any} */ ev) => {
      if (ev.id !== "realm:diag_pong") return;
      try { const m = JSON.parse(ev.message); if (String(m.id).startsWith("probe")) pongs.set(`${m.id}|${m.pack}`, m); } catch (e) { /* not ours */ }
    }, { namespaces: ["realm"] });
  }
  const probe = async (/** @type {number} */ sec) => {
    const id = `probe${sec}`;
    t.system.sendScriptEvent("realm:diag_ping", JSON.stringify({ id }));
    /** @type {Record<string, number>} */
    const types = {};
    let entities = 0;
    for (const d of ["overworld", "nether", "the_end"]) {
      for (const e of t.world.getDimension(d).getEntities()) { entities++; types[e.typeId] = (types[e.typeId] ?? 0) + 1; }
    }
    const sb = t.world.scoreboard;
    const objectives = sb.getObjectives();
    let scores = 0;
    for (const o of objectives) { try { scores += o.getScores().length; } catch (e) { /* removed */ } }
    await t.wait(20);
    /** @type {Record<string, number>} */
    const packBytes = {};
    for (const [k, m] of pongs) if (k.startsWith(`${id}|`)) { packBytes[m.pack] = m.bytes; pongs.delete(k); }
    const row = {
      sec, entities, types, objectives: objectives.length, participants: sb.getParticipants().length, scores,
      structures: t.world.structureManager.getWorldStructureIds().length, packBytes,
    };
    probes.push(row);
    const top = Object.entries(types).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, n]) => `${k.replace("minecraft:", "")} ${n}`).join(", ");
    t.log(`probe ${sec} s: ${entities} entities (${top}); ${row.objectives} objectives, ${row.participants} participants, ${scores} scores; ${row.structures} structures; ${Object.keys(packBytes).length} packs answered`);
  };

  // The soak itself: one decision per player per second; commands staggered across players.
  if (WANDERERS) {
    // One player of each land group asks for them (the debug spawn skips the roll and the distance rules).
    let asked = 0;
    for (const g of groups) {
      const s = plan.find((x) => x.g === g && x.kind === "land" && spawned[x.i]);
      if (!s) continue;
      for (let k = 0; k < WANDERERS; k++) {
        t.system.sendScriptEvent("realm:wander_debug", JSON.stringify({ player: spawned[s.i].p.id, action: "spawn", stranger: true, hostile: false }));
        asked++;
        await t.wait(2);
      }
    }
    await t.wait(20);
    t.log(`wanderers: asked for ${asked} (${WANDERERS} a land group)`);
  }
  const start = t.tick;
  const worldAtStart = worldNow();
  let refills = 0;
  if (REFILL_EVERY) for (const s of players) if (s.kind === "land") { try { t.cmd(s.p, "/give @s firework_rocket 64"); } catch (e) { /* left already */ } }
  let commands = 0, moves = 0, lastLog = start, samples = 0, minValid = Infinity, lastProbe = -1;
  const valid = (p) => { try { return p.isValid; } catch (e) { return false; } };
  /** One player's second: walk, look, sneak, jump or stop; then its refill and command turns when `busy` is on. */
  const step = (/** @type {any} */ s, /** @type {number} */ i, /** @type {number} */ sec, busy = true) => {
    const r = Math.random();
    try {
      if (s.kind === "land" && r < 0.35) {
        s.p.moveToLocation({ x: s.home.x + rnd(17) - 8 + 0.5, y: s.home.y, z: s.home.z + rnd(17) - 8 + 0.5 });
        moves++;
      } else if (r < 0.65) {
        const l = s.p.location;
        s.p.lookAtLocation({ x: l.x + rnd(21) - 10, y: l.y + rnd(5) - 2, z: l.z + rnd(21) - 10 });
      } else if (r < 0.75) {
        s.p.isSneaking = !s.p.isSneaking;
      } else if (r < 0.8) {
        s.p.jump();
      } else if (r < 0.85 && s.kind === "land") {
        s.p.stopMoving();
      }
    } catch (e) { /* a player in an odd spot: ignore */ }
    if (!busy) return;
    if (REFILL_EVERY && s.kind === "land" && (sec + i * 3) % REFILL_EVERY === 0) {
      try {
        s.p.getComponent("minecraft:inventory").container.setItem(0, undefined);
        t.system.sendScriptEvent("realm:refill_need", JSON.stringify({ player: s.p.id, slot: 0, id: refills % 2 ? "minecraft:pufferfish" : "minecraft:firework_rocket" }));
        refills++;
      } catch (e) { /* a player in an odd spot: ignore */ }
    }
    if (CMD_EVERY && COMMANDS.length && (sec + i * 7) % CMD_EVERY === 0) {
      t.cmd(s.p, COMMANDS[(sec + i) % COMMANDS.length]);
      commands++;
    }
  };
  while (t.tick - start < SECONDS * 20) {
    await t.wait(20);
    const sec = Math.floor((t.tick - start) / 20);
    let validNow = 0;
    for (let i = 0; i < players.length; i++) {
      const s = players[i];
      if (!valid(s.p)) continue;
      validNow++;
      step(s, i, sec);
    }
    samples++;
    minValid = Math.min(minValid, validNow);
    if (PROBE_EVERY && sec % PROBE_EVERY === 0 && sec !== lastProbe) { lastProbe = sec; await probe(sec); }
    if (t.tick - lastLog >= 1200) {
      lastLog = t.tick;
      t.log(`soak ${sec} s: ${players.filter((x) => valid(x.p)).length} players in the world, ${moves} walks, ${commands} commands`);
    }
  }
  const end = t.tick;
  const worldAtEnd = worldNow();
  if (PHASES) phase("steady", start, N);
  if (PROBE_EVERY) {
    if (lastProbe !== SECONDS) await probe(SECONDS);
    const a0 = probes[0], a1 = probes.at(-1);
    /** @type {Record<string, number>} */
    const grew = {};
    for (const [k, n] of Object.entries(a1.packBytes)) if (n - (a0.packBytes[k] ?? 0) !== 0) grew[k] = n - (a0.packBytes[k] ?? 0);
    /** @type {Record<string, number>} */
    const typesGrew = {};
    for (const k of new Set([...Object.keys(a0.types), ...Object.keys(a1.types)])) if ((a1.types[k] ?? 0) !== (a0.types[k] ?? 0)) typesGrew[k] = (a1.types[k] ?? 0) - (a0.types[k] ?? 0);
    t.log(`probe change ${a0.sec} -> ${a1.sec} s: entities ${a1.entities - a0.entities} ${JSON.stringify(typesGrew)}; participants ${a1.participants - a0.participants}; structures ${a1.structures - a0.structures}; per pack ${JSON.stringify(grew)}`);
    t.report("perf-probe", { first: a0, last: a1, typesGrew, packBytesGrew: grew });
  }
  // Retention and the HUD list are judged here, on the steady window: the phases after it take players out on purpose.
  const alive = players.filter((x) => valid(x.p)).length;
  t.log(`soak done: ${SECONDS} s, ${alive}/${N} players still in the world, ${moves} walks, ${commands} commands`);
  t.log(`world over the steady window: ${JSON.stringify(worldAtStart)} -> ${JSON.stringify(worldAtEnd)}${TIME >= 0 && Math.abs(worldAtEnd.timeOfDay - TIME) > 20 ? ` - NOT the pinned time ${TIME}: something moved the clock` : ""}`);
  const soakTicks = end - start;
  const world = { time: TIME, weather: WEATHER, start: worldAtStart, end: worldAtEnd };
  const workload = () => ({
    schema: 1, declared, spawned: made, spawnGameSeconds, kinds,
    soak: { startTick: start, endTick: end, ticks: soakTicks, seconds: soakTicks / 20 },
    retention: { samples, minValid: samples ? minValid : 0, endValid: alive },
    walks: moves, commands, world,
    ...(phases.length ? { phases } : {}),
    ...(churn ? { churn } : {}),
    ...(night ? { night } : {}),
  });
  /** @type {any} */
  let churn = null;
  /** @type {any} */
  let night = null;
  t.report("perf-workload", workload());
  let hudMissing = 0;
  if (withHud && HUD) {
    const ids = new Set(hudState.last);
    hudMissing = players.filter((x) => valid(x.p) && !ids.has(x.p.id)).length;
  }
  const hudAtEnd = { lists: hudState.lists, listed: hudState.last.length, parts: hudState.parts };

  // Churn (phases=1, PIPE-04): what the steady crowd never does, each on its own second so its slow tick shows.
  if (CHURN_S) {
    const from = t.tick;
    const { ItemStack, Direction } = t.mc;
    const op = players[0];
    const land = players.filter((s) => s.kind === "land" && s !== op);
    // No player has two parts that clash (a block loop's spot must stay where its player stands): two land players
    // die (3 s and 18 s) and travel (8 s to 13 s), the next four run the block loops (the operator stands in while
    // the crowd is small), and the leavers are the rest: spare land players, then the pool's and the Nether's.
    const dying = land.slice(0, 2), travelers = dying;
    const blockers = land.slice(2, 6);
    if (blockers.length < 4 && op) blockers.push(op);
    const roles = new Set([...blockers, ...dying, op]);
    const leavers = [...land.slice(6), ...players.filter((s) => s.kind !== "land")].filter((s) => !roles.has(s));
    churn = { seconds: CHURN_S, left: 0, rejoined: 0, rejoinFailed: 0, deaths: 0, respawns: 0, dimensionChanges: 0, placed: 0, broken: 0, mobsSummoned: 0, mobsKilled: 0, menus: /** @type {string[]} */ ([]), menuTicks: /** @type {number[]} */ ([]), minValid: Infinity, endValid: 0 };
    // The block loops run side by side near the spawn, under a ticking area of the soak's own for the phase: a
    // simulated player's own chunks were "not loaded and ticking" when its block events reached the packs (the first
    // W0c run). Each player stands 1.5 blocks off its spot (a block can't be placed where its player stands).
    const c0 = groupSpot(0), bx = Math.floor(c0.x) + 6, bz = Math.floor(c0.z) - 6;
    t.server(`/tickingarea add circle ${bx + 4} 0 ${bz} 1 soak_churn true`);
    await t.waitUntil(() => { try { return !!over.getTopmostBlock({ x: bx, z: bz }); } catch (e) { return false; } }, { timeout: 400 }).catch(() => t.log("churn: the block loops' area did not load in 400 ticks"));
    await t.wait(10);
    const spots = blockers.map((s, k) => {
      let y = Math.floor(s.home.y);
      try { y = (over.getTopmostBlock({ x: bx + 3 * k, z: bz })?.location.y ?? y - 1) + 1; } catch (e) { /* unloaded: the player's height */ }
      const at = { x: bx + 3 * k, y, z: bz };
      try {
        s.p.stopMoving();
        s.p.teleport({ x: at.x + 0.5, y: at.y, z: at.z - 1.5 }, { dimension: over });
        s.p.getComponent("minecraft:inventory").container.setItem(1, new ItemStack("minecraft:dirt", 64));
        t.server(`/setblock ${at.x} ${at.y} ${at.z} dirt`);
      } catch (e) { /* left already */ }
      return at;
    });
    /** @type {any} */
    let away = null;
    let leaveNext = 0;
    /** @type {any[]} */
    let mobs = [];
    const killMobs = () => {
      for (const e of mobs) { try { if (e.isValid) { e.kill(); churn.mobsKilled++; } } catch (err) { /* gone */ } }
      mobs = [];
    };
    const rejoin = async (/** @type {any} */ s) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt) await loadWhole(s.home.x, s.home.z, { dimension: s.dim });
          s.p = await t.player(s.name, { x: s.home.x, z: s.home.z, y: s.kind === "land" ? undefined : s.home.y, dimension: s.kind === "nether" ? "nether" : "overworld", settle: 1, area: false, timeout: 100 });
          churn.rejoined++;
          if (attempt) { await t.wait(SETTLE); clearAreas(); }
          return;
        } catch (e) {
          t.log(`churn: ${s.name} could not rejoin (try ${attempt + 1}): ${e}`);
        }
      }
      churn.rejoinFailed++;
    };
    const MENUS = [["help_bp", "/realm:help"], ["settings_bp", "/realm:prefs"], ["settings_bp", "/realm:config"]].filter(([pack]) => t.packs.includes(pack)).map(([, c]) => c);
    while (t.tick - from < CHURN_S * 20) {
      await t.wait(20);
      const sec = Math.floor((t.tick - from) / 20);
      // A leave and a join every 5 s: the player who left 5 s ago comes back, the next one goes.
      if (sec % 5 === 0 && leavers.length) {
        if (away) { await rejoin(away); away = null; }
        if (t.tick - from < (CHURN_S - 2) * 20) {
          const s = leavers[leaveNext++ % leavers.length];
          if (valid(s.p)) { try { s.p.disconnect(); churn.left++; away = s; } catch (e) { t.log(`churn: ${s.name} could not leave: ${e}`); } }
        }
      }
      // Two deaths, each respawned 2 s later.
      dying.forEach((s, k) => {
        const at = 3 + 15 * k;
        try {
          if (sec === at && valid(s.p)) { s.p.kill(); churn.deaths++; }
          if (sec === at + 2 && valid(s.p)) { s.p.respawn(); churn.respawns++; }
        } catch (e) { t.log(`churn: ${s.name} death or respawn: ${e}`); }
      });
      // Two players to the Nether pocket and back 5 s later.
      if (pocket && (sec === 8 || sec === 13)) {
        travelers.forEach((s, k) => {
          try {
            if (!valid(s.p)) return;
            if (sec === 8) s.p.teleport({ x: pocket.x + k + 0.5, y: pocket.y, z: pocket.z + 2.5 }, { dimension: nether });
            else s.p.teleport({ x: s.home.x + 0.5, y: s.home.y, z: s.home.z + 0.5 }, { dimension: over });
            churn.dimensionChanges++;
          } catch (e) { t.log(`churn: ${s.name} dimension change: ${e}`); }
        });
      }
      // Block break and place loops: break on odd seconds, place it back on even ones; counted when the world changed.
      blockers.forEach((s, k) => {
        const at = spots[k];
        try {
          if (!valid(s.p)) return;
          const id = over.getBlock(at)?.typeId;
          if (sec % 2) {
            if (id === "minecraft:dirt") {
              if (sec > 1) churn.placed++;
              s.p.lookAtBlock(at);
              s.p.breakBlock(at);
            }
          } else {
            try { s.p.stopBreakingBlock(); } catch (e) { /* not breaking */ }
            if (id === "minecraft:air") {
              churn.broken++;
              s.p.useItemInSlotOnBlock(1, { x: at.x, y: at.y - 1, z: at.z }, Direction.Up);
              t.system.runTimeout(() => { try { s.p.stopInteracting(); } catch (e) { /* gone */ } }, 5);
            }
          }
        } catch (e) { /* a player in an odd spot: ignore */ }
      });
      // A mob farm: 20 zombies summoned 10 blocks from group 0 each second for 20 s, each killed the second after.
      if (sec >= 20 && sec <= 40) {
        killMobs();
        if (sec < 40) {
          const c = groupSpot(0);
          for (let k = 0; k < 20; k++) {
            const x = c.x + 10 + (k % 5), z = c.z + Math.floor(k / 5) - 2;
            try {
              const y = (over.getTopmostBlock({ x, z })?.location.y ?? 63) + 1;
              mobs.push(over.spawnEntity("minecraft:zombie", { x: x + 0.5, y, z: z + 0.5 }));
              churn.mobsSummoned++;
            } catch (e) { /* unloaded */ }
          }
        }
      }
      // The three heavy menus, once each, 4 s apart (each form is canceled by the harness after 100 ticks); the tick of each
      // command goes into the report (menuTicks), so its slowest tick can be told from the others in the worst-ticks list.
      const m = (sec - 44) / 4;
      if (Number.isInteger(m) && m >= 0 && m < MENUS.length && valid(op.p)) { churn.menuTicks.push(t.tick); t.cmd(op.p, MENUS[m]); churn.menus.push(MENUS[m]); }
      let validNow = 0;
      for (let i = 0; i < players.length; i++) {
        const s = players[i];
        if (!valid(s.p)) continue;
        validNow++;
        if (!roles.has(s)) step(s, i, sec, false);
      }
      churn.minValid = Math.min(churn.minValid, validNow);
    }
    killMobs();
    t.server("/tickingarea remove soak_churn");
    if (away) { await rejoin(away); away = null; }
    for (const s of dying) { try { if (valid(s.p) && s.p.getComponent("minecraft:health")?.currentValue <= 0) { s.p.respawn(); churn.respawns++; } } catch (e) { /* alive */ } }
    churn.endValid = players.filter((x) => valid(x.p)).length;
    if (!Number.isFinite(churn.minValid)) churn.minValid = 0;
    phase("churn", from, churn.endValid);
    t.log(`churn: ${JSON.stringify(churn)}`);
    t.report("perf-workload", workload());
  }

  // Night in a thunderstorm (night=N, the 40-player bundle soak): the crowd as in the steady window.
  if (NIGHT_S) {
    t.server("/effect @a resistance 100000 255 true");
    t.server("/gamerule dodaylightcycle false");
    t.server("/time set 18000");
    setWeather("thunder");
    await t.wait(20);
    const from = t.tick;
    night = { seconds: NIGHT_S, start: worldNow(), end: null, minValid: Infinity };
    while (t.tick - from < NIGHT_S * 20) {
      await t.wait(20);
      const sec = Math.floor((t.tick - from) / 20);
      let validNow = 0;
      for (let i = 0; i < players.length; i++) {
        const s = players[i];
        if (!valid(s.p)) continue;
        validNow++;
        step(s, i, sec);
      }
      night.minValid = Math.min(night.minValid, validNow);
    }
    night.end = worldNow();
    if (!Number.isFinite(night.minValid)) night.minValid = 0;
    phase("night", from, players.filter((x) => valid(x.p)).length);
    t.log(`night: ${JSON.stringify(night)}`);
    t.report("perf-workload", workload());
  }

  t.check(samples > 0 && minValid === N && alive === N, `all ${N} players stayed in the world for the whole ${SECONDS} s soak (fewest at any second: ${samples ? minValid : 0}, at the end: ${alive})`);
  t.check(soakTicks >= SECONDS * 20, `the steady window ran its full ${SECONDS} s of game time (${(soakTicks / 20).toFixed(1)} s)`);
  if (churn) t.check(churn.rejoinFailed === 0 && churn.rejoined === churn.left, `every player who left in the churn phase came back (${churn.left} left, ${churn.rejoined} rejoined, ${churn.rejoinFailed} could not)`);
  if (withHud) {
    t.log(`realm:hud_state: ${hudState.messages} messages (longest ${hudState.longest} characters), ${hudState.lists} complete lists, the largest ${hudState.largest} players in ${hudState.parts} parts`);
    t.check(hudState.longest < 2048, `every realm:hud_state is under 2048 characters (${hudState.longest})`);
    if (HUD) t.check(hudAtEnd.lists > 0 && hudMissing === 0, `the last complete realm:hud_state of the steady window names every player in the world (${hudAtEnd.listed} listed, ${hudMissing} missing, ${hudAtEnd.parts} parts at most)`);
  }
}
