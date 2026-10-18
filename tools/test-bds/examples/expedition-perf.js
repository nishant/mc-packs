// Expeditions under load (for --profile): parties of 4 play Nightmare runs at the same time (slots 3), standing in
// each room while its waves come (Resistance keeps them alive), moving on every `room` seconds, while the other
// players idle at spawn. Checks only that every run stays active and its mobs stay under the cap.
//   node tools/test-bds/run.mjs --quiet --flat --only expedition_bp --scenario tools/test-bds/examples/expedition-perf.js --arg players=8 --arg seconds=30 --timeout 900
// For the audit's numbers add `--no-relay --profile` and `--arg players=40 --arg seconds=120 --timeout 1500`.
// Arguments: players (default 10), parties (default: as many full parties of 4 as fit, at most 3), level (default
// 12 = Nightmare 10), seconds (default 120, after every run is active), room (default 20).
const cfg = (t, key, value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `t${key}`, pack: "expedition_bp", key, value }));
const DUNGEONS = ["Crypt", "Pillager Keep", "Nether Forge"];
export default async function (t) {
  t.formTimeout = 600;
  const a = t.args;
  const N = Math.max(1, Number(a.players ?? 10));
  const parties = Math.max(1, Math.min(3, Number(a.parties ?? Math.max(1, Math.min(3, Math.floor(N / 4))))));
  const L = Number(a.level ?? 12);
  const SECONDS = Math.max(10, Number(a.seconds ?? 120));
  const ROOM = Math.max(5, Number(a.room ?? 20));
  t.server("/gamerule sendcommandfeedback false");
  cfg(t, "slots", 3);
  cfg(t, "timeLimitMinutes", 60);
  const first = await t.player("Lead1", { op: true });
  const sx = Math.floor(first.location.x) + 300;
  const sz = Math.floor(first.location.z);
  for (let s = 0; s < 3; s++) await t.loadArea(sx + s * 132, sz, { radius: 4 });
  t.assert(t.cmd(first, `/realm:expedition_site ${sx} ${sz}`).ok, "site");
  await t.wait(40);
  /** @type {any[][]} */
  const teams = [];
  let made = 1;
  for (let k = 0; k < parties && made + (k ? 1 : 0) <= N; k++) {
    const lead = k === 0 ? first : await t.player(`Lead${k + 1}`, { op: true, x: Math.floor(first.location.x) + k * 4, z: sz });
    if (k) made++;
    const team = [lead];
    for (let m = 1; m < 4 && made < N; m++) {
      team.push(await t.player(`P${k + 1}m${m}`, { x: Math.floor(first.location.x) + k * 4 + m, z: sz + 2 }));
      made++;
    }
    for (const p of team) p.addTag(`realm_party:perf${k}`);
    teams.push(team);
  }
  for (let i = made; i < N; i++) await t.player(`Idle${i}`, { x: Math.floor(first.location.x) - 20 + (i % 10) * 3, z: sz - 20 - Math.floor(i / 10) * 3 });
  t.server("/effect @a resistance 100000 255 true");
  t.server("/effect @a saturation 100000 10 true");
  for (const [k, team] of teams.entries()) {
    const lead = team[0];
    t.answerForm(lead, "Operator tools", "Unlock every tier");
    t.cmd(lead, "/realm:expedition");
    await t.wait(30);
    for (const p of team.slice(1)) t.answerForm(p, "Join");
    t.answerForm(lead, "Start an expedition", DUNGEONS[k], L, "Start");
    t.cmd(lead, "/realm:expedition");
    await t.waitUntil(async () => ((await state(t, k))?.phase === "active" ? true : undefined), { timeout: 1500, interval: 20, message: `run ${k} active` });
  }
  t.log(`${teams.length} runs active with ${teams.map((x) => x.length).join("+")} players, ${N - made} idle; level ${L}`);
  const t0 = t.tick;
  let next = 0;
  let maxAlive = 0;
  while (t.tick - t0 < SECONDS * 20) {
    if (t.tick - t0 >= next) {
      next += ROOM * 20;
      for (const [k, team] of teams.entries()) {
        let st = await state(t, k);
        if (!st || st.phase !== "active") continue;
        if (st.rm.kind !== "entry" && next > ROOM * 20) st = (await state(t, k, true)) ?? st;
        const c = st.rm.c;
        team.forEach((p, i) => p.isValid && p.teleport({ x: c.x + (i % 2) * 2 - 1, y: c.y, z: c.z + Math.floor(i / 2) * 2 - 1 }));
      }
    }
    for (const k of teams.keys()) {
      const st = await state(t, k);
      if (st) maxAlive = Math.max(maxAlive, st.alive ?? 0);
    }
    await t.wait(40);
  }
  const live = [];
  for (const k of teams.keys()) live.push((await state(t, k))?.phase);
  t.log(`after ${SECONDS} s: phases ${live.join(", ")}; most mobs alive in a run ${maxAlive}`);
  t.check(live.every((p) => p === "active" || p === "finishing"), "every run is still going");
  t.check(maxAlive <= 19, `mobs stay under the cap (${maxAlive})`);
}
// shared helpers (pasted into each scenario: scenarios can't import)
async function state(t, slot, skip = false) {
  const parts = [];
  let want = 0;
  const done = new Promise((res) => {
    const sub = t.system.afterEvents.scriptEventReceive.subscribe((ev) => {
      if (ev.id !== "realm:expedition_state") return;
      const m = JSON.parse(ev.message);
      parts[m.part] = m.data;
      want = m.parts;
      if (parts.filter((x) => x !== undefined).length === want) {
        t.system.afterEvents.scriptEventReceive.unsubscribe(sub);
        res(JSON.parse(parts.join("")));
      }
    });
  });
  t.system.sendScriptEvent("realm:expedition_debug", JSON.stringify({ slot, ...(skip ? { skip: true } : {}) }));
  return Promise.race([done, t.wait(40).then(() => undefined)]);
}
