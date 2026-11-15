// Performance of the townsfolk loop and name labels with a crowd: all 12 townsfolk placed in a square near the spawn
// (kept loaded by a ticking area) and many simulated players. Phase "near": the players walk in and out around them
// (in and out of the 20-block resend range), so the helper labels are spawned, moved, resent and removed. Phase
// "away": every player stands 300 blocks off, nobody near a townsfolk, while the townsfolk stay loaded: the cost of
// the half-second loop and the label sync with nobody to label (ENT-01, ENT-02). The window is reported as
// perf-workload with both phases. Meant for run.mjs --profile; it checks that every townsfolk has exactly one helper
// while players are near and that no helper is left once they all go far away.
//   node tools/test-bds/run.mjs --quiet --no-relay --profile --only npc_bp,build_rp --scenario tools/test-bds/examples/npc-labels-perf.js --arg players=40 --arg seconds=60 --timeout 900
// Arguments: players (default 20), seconds (each phase, default 60), mode (both | near | away, default both: which
// phases the window has; the A/B pairs in CI measure near and away on their own).
const IDS = ["mara", "tobin", "reyes", "elsie", "bram", "quill", "ida", "sol", "hollis", "moss", "wren", "bea"];

export default async function (t) {
  const N = Math.max(1, Number(t.args.players ?? 20));
  const SECONDS = Math.max(10, Number(t.args.seconds ?? 60));
  const MODE = String(t.args.mode ?? "both");
  t.check(["both", "near", "away"].includes(MODE), `mode is both, near or away (${MODE})`);
  t.server("/gamerule domobspawning false");
  const op = await t.player("Op", { op: true, gameMode: "creative" });
  const dim = t.dimension;
  const c = { x: Math.floor(op.location.x) + 0.5, z: Math.floor(op.location.z) + 0.5 };
  // The square stays loaded while everyone is away, as a town with a ticking area (or a player at the edge) would.
  await t.loadArea(c.x + 4, c.z + 3, { radius: 2 });
  for (let i = 0; i < IDS.length; i++) {
    const x = c.x + (i % 4) * 3, z = c.z + Math.floor(i / 4) * 3;
    const top = dim.getTopmostBlock({ x, z });
    op.teleport({ x, y: (top?.location.y ?? op.location.y) + 1, z });
    await t.wait(4);
    t.cmd(op, `/realm:npc_add ${IDS[i]}`);
    await t.wait(2);
  }
  const players = [op];
  for (let i = 1; i < N; i++) {
    const a = (i / N) * Math.PI * 2, r = 10 + (i % 3) * 6;
    players.push(await t.player(`Walker${String(i).padStart(2, "0")}`, { x: c.x + 4 + Math.cos(a) * r, z: c.z + 3 + Math.sin(a) * r }));
  }
  const labels = () => dim.getEntities({ type: "realm:npc_label" }).length;
  const townsfolk = () => dim.getEntities({ type: "minecraft:npc", tags: ["realm:npc"] }).length;
  await t.wait(40);
  t.log(`${players.length} players around ${IDS.length} townsfolk: ${labels()} helpers`);
  t.check(labels() === IDS.length, `one helper per townsfolk (${labels()})`);

  const valid = (p) => {
    try {
      return p.isValid;
    } catch {
      return false;
    }
  };
  /** @type {{ name: string, startTick: number, endTick: number }[]} */
  const phases = [];
  let samples = 0, minValid = Infinity, walks = 0;
  const sample = () => {
    samples++;
    minValid = Math.min(minValid, players.filter(valid).length);
  };
  const awaySpot = (i) => ({ x: c.x + 300 + (i % 8) * 6, y: 120, z: c.z + Math.floor(i / 8) * 6 });

  if (MODE !== "away") {
    const ph = { name: "near", startTick: t.tick, endTick: t.tick };
    phases.push(ph);
    const end = t.tick + SECONDS * 20;
    while (t.tick < end) {
      for (const p of players) {
        if (Math.random() < 0.3) {
          const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 26;
          try {
            p.moveToLocation({ x: c.x + 4 + Math.cos(a) * r, y: p.location.y, z: c.z + 3 + Math.sin(a) * r });
            walks++;
          } catch {
            // left
          }
        }
      }
      await t.wait(20);
      sample();
    }
    ph.endTick = t.tick;
    t.log(`near: ${walks} walks; ${labels()} helpers`);
    t.check(labels() <= IDS.length, `never more than one helper each (${labels()})`);
  }

  players.forEach((p, i) => p.teleport(awaySpot(i)));
  await t.wait(40);
  t.check(labels() === 0, `no helper left once everyone is far away (${labels()})`);
  if (MODE !== "near") {
    t.check(townsfolk() === IDS.length, `the townsfolk stay loaded while everyone is away (${townsfolk()})`);
    const ph = { name: "away", startTick: t.tick, endTick: t.tick };
    phases.push(ph);
    const end = t.tick + SECONDS * 20;
    while (t.tick < end) {
      players.forEach((p, i) => {
        if (Math.random() < 0.3) {
          const s = awaySpot(i);
          try {
            p.moveToLocation({ x: s.x + Math.random() * 10 - 5, y: p.location.y, z: s.z + Math.random() * 10 - 5 });
            walks++;
          } catch {
            // left
          }
        }
      });
      await t.wait(20);
      sample();
    }
    ph.endTick = t.tick;
    t.log(`away: ${labels()} helpers, ${townsfolk()} townsfolk loaded`);
    t.check(labels() === 0, `still no helper while everyone is away (${labels()})`);
  }
  const alive = players.filter(valid).length;
  const startTick = phases[0].startTick;
  t.report("perf-workload", {
    schema: 1,
    declared: { players: N, seconds: SECONDS },
    spawned: players.length,
    soak: { startTick, endTick: t.tick, ticks: t.tick - startTick, seconds: (t.tick - startTick) / 20 },
    retention: { samples, minValid: samples ? minValid : 0, endValid: alive },
    walks,
    commands: 0,
    phases,
  });
}
