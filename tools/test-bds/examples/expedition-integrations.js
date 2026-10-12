// Expeditions with the packs it talks to (Champions, Crowns, Guilds, Journal, Relics, Quests, Bounties, Coordinates HUD,
// Mob Health): a Hard Gauntlet's elite hall asks the Champions pack for one champion per wave (never one of each), the
// boss is killed, and the rewards (Crowns, Warden reputation, the Journal page, a relic at relicChance 1, the quest)
// arrive once each.
// node tools/test-bds/run.mjs --quiet --flat --only expedition_bp,elite_bp,crowns_bp,guilds_bp,journal_bp,relics_bp,quests_bp,bounty_bp,hud_bp,mobhp_bp --scenario tools/test-bds/examples/expedition-integrations.js --timeout 900
const cfg = (t, key, value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `t${key}`, pack: "expedition_bp", key, value }));
export default async function (t) {
  t.formTimeout = 400;
  cfg(t, "gauntletRooms", 10);
  cfg(t, "boonEvery", 3);
  cfg(t, "relicChance", 1); // capped at 50%
  const p = await t.player("Ann", { op: true, gameMode: "creative" });
  const sx = Math.floor(p.location.x) + 300;
  const sz = Math.floor(p.location.z);
  await t.loadArea(sx, sz, { radius: 4 });
  t.assert(t.cmd(p, `/realm:expedition_site ${sx} ${sz}`).ok, "site");
  await t.waitMessage(p, /site set/i, { timeout: 200 });
  const events = [];
  t.system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (["realm:quest_done", "realm:rep_add", "realm:relic_give", "realm:champion_spawn"].includes(ev.id)) events.push(ev.id);
    if (ev.id === "realm:journal" && ev.message.includes("expedition_")) events.push(ev.id); // (the relic's own page comes from the Relics pack)
  });
  t.answerForm(p, "Start a Gauntlet", "Crypt", 2, "Start the Gauntlet");
  t.cmd(p, "/realm:expedition");
  let st = await t.waitUntil(async () => { const s = await state(t); return s?.phase === "active" ? s : undefined; }, { timeout: 1200, interval: 20, message: "active" });
  // Simulated players don't load chunks: only the dungeon's ticking area does, and for a moment after it's added
  // entity queries (and /kill) can miss the mobs in it. Give it time to settle before the fights.
  await t.wait(100);
  let champWaves = 0;
  for (let guard = 0; guard < 40; guard++) {
    st = await state(t);
    if (st.phase !== "active") break;
    const rm = st.rm;
    const entry = rm.doors.find((d) => d[0] === "back" && d[3] === 0);
    const [u, v] = entry ? onSide("back", entry[1], rm.r) : [0, 0];
    if (rm.kind !== "entry") p.teleport(local(rm, u, v + 1, 1));
    if (rm.kind === "elite" && champWaves === 0) {
      let since = t.tick;
      for (let w = 0; w < 6 && (await state(t)).room === rm.i; w++) {
        await t.waitMessage(p, new RegExp(`Wave ${w + 1} of`), { timeout: 200, since });
        await t.wait(10);
        await t.waitUntil(() => t.dimension.getEntities({ tags: ["realm:exp_mob"] }).length > 0, { timeout: 100, interval: 5, message: "the wave's mobs" });
        await t.wait(10);
        const champs = t.dimension.getEntities({ tags: ["realm:exp_mob"] }).filter((e) => e.hasTag("realm:champion") || e.hasTag("realm:exp_champ"));
        if (champs.length !== 1) t.log(`player ${JSON.stringify(p.location)} room ${JSON.stringify(rm.c)} state room ${(await state(t)).room}; exp mobs: ${t.dimension.getEntities({ tags: ["realm:exp_mob"] }).map((e) => `${e.typeId} ${Math.round(e.location.x)},${Math.round(e.location.y)},${Math.round(e.location.z)}`).join("; ")}; msgs ${t.messages(p, { since }).map((m) => m.plain).join(" | ")}`);
        if (champs.length !== 1) t.log(`all near: ${t.dimension.getEntities({ location: p.location, maxDistance: 40 }).filter((e) => e.typeId !== "minecraft:player").map((e) => `${e.typeId}[${e.getTags().join(" ")}] ${e.nameTag ?? ""} d=${Math.round(Math.hypot(e.location.x - p.location.x, e.location.z - p.location.z))}`).join("; ")}`);
        t.log(`wave ${w + 1}: ${champs.map((e) => `${e.typeId}${e.hasTag("realm:champion") ? " (Champions pack)" : " (own)"}`).join(", ")}`);
        t.check(champs.length === 1, `one champion in wave ${w + 1} (${champs.length})`);
        champWaves++;
        since = t.tick;
        t.server("/kill @e[tag=realm:exp_mob]");
        await t.wait(60);
      }
      continue;
    }
    if (rm.kind === "boon") {
      const form = await t.waitForm(p, { timeout: 100, title: "boon" });
      form.answer(0);
      await t.waitMessage(p, /everyone has chosen/i, { timeout: 100 });
      continue;
    }
    if (rm.kind === "boss") {
      await t.wait(60);
      for (let k = 0; k < 10 && (await state(t))?.phase === "active"; k++) { t.server("/kill @e[tag=realm:exp_mob]"); await t.wait(20); }
      break;
    }
    t.system.sendScriptEvent("realm:expedition_debug", JSON.stringify({ skip: true }));
    await t.wait(15);
  }
  st = await state(t);
  t.assert(st.phase === "finishing", `finishing (${st.phase})`);
  await t.wait(60);
  const count = (id) => events.filter((x) => x === id).length;
  t.log(`events: ${JSON.stringify(Object.fromEntries(["realm:quest_done", "realm:rep_add", "realm:journal", "realm:relic_give", "realm:champion_spawn"].map((id) => [id, count(id)])))}`);
  for (const id of ["realm:quest_done", "realm:rep_add", "realm:journal"]) t.check(count(id) === 1, `${id} once (${count(id)})`);
  t.check(count("realm:relic_give") <= 1, `realm:relic_give at most once (${count("realm:relic_give")}; the chance is capped at 50%)`);
  t.check(champWaves >= 2, `champion waves (${champWaves})`);
  const others = t.messages(p).filter((m) => m.pack !== "expedition_bp" && m.kind === "chat").map((m) => `${m.pack}: ${m.plain}`);
  t.log(others.slice(-8).join(" / "));
  t.cmd(p, "/realm:expedition_leave");
  await t.waitUntil(async () => (await state(t))?.phase === "none", { timeout: 600, interval: 20, message: "run over" });
}
// shared helpers (pasted into each scenario: scenarios can't import)
async function state(t, room, slot) {
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
  t.system.sendScriptEvent("realm:expedition_debug", JSON.stringify({ ...(room === undefined ? {} : { room }), ...(slot === undefined ? {} : { slot }) }));
  return Promise.race([done, t.wait(40).then(() => undefined)]);
}
const local = (rm, u, v, y) => {
  const f = rm.fwd;
  const ac = { x: -f.z, z: f.x };
  return { x: Math.floor(rm.c.x) + ac.x * u + f.x * v + 0.5, y: rm.c.y + (y - 1), z: Math.floor(rm.c.z) + ac.z * u + f.z * v + 0.5 };
};
const onSide = (side, a, d) => (side === "back" ? [a, -d] : side === "fwd" ? [a, d] : side === "left" ? [-d, a] : [d, a]);
