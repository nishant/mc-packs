// Acceptance for a perf-soak run: a profile only counts as a comparator for N players when the soak really had N
// players, kept them for the whole steady window, and the profile covers that window. The scenario reports what it
// saw (t.report("perf-workload", ...)); this module judges it. The soak's old guard was `made > 0`, which let a
// run that spawned 97 of 100 requested players be written up as a 100-player measurement.
export const WORKLOAD_SCHEMA = 1;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * @param {{ args?: Record<string, string>, workload?: any, profile?: any }} input
 * @returns {{ ok: boolean, reasons: string[], declared: any, observed: any }}
 */
export function evaluatePerf({ args = {}, workload, profile }) {
  const reasons = [];
  const w = workload;
  if (!w || w.schema !== WORKLOAD_SCHEMA) {
    return { ok: false, reasons: ["the scenario reported no perf-workload (not a perf-soak run, or an old soak without the population and window report)"], declared: null, observed: null };
  }
  const d = w.declared ?? {};
  const players = num(d.players);
  const seconds = num(d.seconds);
  if (players === null || seconds === null) reasons.push("the workload report does not declare players and seconds");
  if (args.players !== undefined && players !== null && Number(args.players) !== players) reasons.push(`--arg players=${args.players} but the soak declared ${players}`);
  if (args.seconds !== undefined && seconds !== null && Number(args.seconds) !== seconds) reasons.push(`--arg seconds=${args.seconds} but the soak declared ${seconds}`);

  if (players !== null) {
    if (w.spawned !== players) reasons.push(`population: spawned ${w.spawned} of the ${players} declared players`);
    const r = w.retention ?? {};
    if (r.minValid !== players) reasons.push(`retention: only ${r.minValid} of ${players} players were in the world at the worst second of the soak`);
    if (r.endValid !== players) reasons.push(`retention: ${r.endValid} of ${players} players were in the world at the end`);
    if (!(r.samples > 0)) reasons.push("retention: no per-second samples were taken");
    const wantWater = num(d.water), wantNether = num(d.nether);
    if (wantWater !== null && w.kinds?.water !== Math.min(players, wantWater)) reasons.push(`workload: ${w.kinds?.water} of ${Math.min(players, wantWater)} declared water players were placed in the pool`);
    if (wantNether !== null && w.kinds?.nether !== Math.min(Math.max(0, players - (w.kinds?.water ?? 0) - 1), wantNether)) reasons.push(`workload: ${w.kinds?.nether} Nether players, not the ${Math.min(Math.max(0, players - (w.kinds?.water ?? 0) - 1), wantNether)} declared`);
  }

  const soak = w.soak ?? {};
  if (seconds !== null) {
    if (!(soak.ticks >= seconds * 20)) reasons.push(`window: the steady soak ran ${soak.ticks} game ticks, not the ${seconds * 20} declared (${seconds} s)`);
  }
  if (profile) {
    const rows = Array.isArray(profile.packs) ? profile.packs : [];
    if (!rows.length) reasons.push("window: the profile has no per-pack rows");
    const early = rows.filter((x) => !(x.startTick <= soak.startTick));
    const late = rows.filter((x) => !(x.endTick >= soak.endTick));
    if (early.length) reasons.push(`window: ${early.length} pack profile(s) started after the soak began (first: ${early[0].pack})`);
    if (late.length) reasons.push(`window: ${late.length} pack profile(s) ended before the soak did (first: ${late[0].pack})`);
    if (profile.ticks < soak.ticks) reasons.push(`window: the profile has ${profile.ticks} ticks, fewer than the ${soak.ticks}-tick soak`);
  } else {
    reasons.push("window: no profile to check the window against");
  }
  return {
    ok: reasons.length === 0,
    reasons,
    declared: { players, seconds, group: d.group, spread: d.spread, commands: d.commands, water: d.water, nether: d.nether },
    observed: { spawned: w.spawned, spawnGameSeconds: w.spawnGameSeconds, retention: w.retention, kinds: w.kinds, soak, profileTicks: profile?.ticks },
  };
}

const SPAWNED = /spawned (\d+)\/(\d+) players in (\d+) s \((\d+) in water, (\d+) in the Nether, (\d+) groups\)/;
const SOAK_DONE = /soak done: (\d+) s, (\d+)\/(\d+) players still in the world/;

/**
 * Judges a soak that only has its log lines (a run before the workload report existed): population, the end-of-run
 * count against the SPAWNED count and the declared players, and the declared soak length. It cannot see retention
 * during the window, so a pass says so.
 * @param {string} text @param {{ players: number, seconds: number }} declared
 */
export function evaluateLegacyLog(text, declared) {
  const reasons = [];
  const spawn = SPAWNED.exec(text);
  const done = SOAK_DONE.exec(text);
  if (!spawn) reasons.push("no 'spawned N/M players' line");
  if (!done) reasons.push("no 'soak done' line");
  if (spawn) {
    if (Number(spawn[2]) !== declared.players) reasons.push(`the soak itself asked for ${spawn[2]} players, not the declared ${declared.players}`);
    if (Number(spawn[1]) !== declared.players) reasons.push(`population: spawned ${spawn[1]} of the ${declared.players} declared players`);
  }
  if (done) {
    if (Number(done[1]) < declared.seconds) reasons.push(`window: the soak ran ${done[1]} s of the declared ${declared.seconds} s`);
    if (spawn && Number(done[2]) !== Number(spawn[1])) reasons.push(`retention: ${done[2]} players at the end of ${spawn[1]} spawned`);
    // The old log compared the survivors with the players it had spawned (97/97), never with the declared 100.
    if (Number(done[2]) !== declared.players && !reasons.some((r) => r.startsWith("population"))) reasons.push(`retention: ${done[2]} players at the end of the declared ${declared.players}`);
  }
  return { ok: reasons.length === 0, reasons, evidence: "log lines only: retention during the window is not visible", declared };
}
