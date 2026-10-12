// Expeditions: two parties in two runs at once (slots 2). Ann (Easy) and Bob (Normal Gauntlet with Fixed loadout)
// start together, each gets its own box, a third player is turned away, both are played to the boss (rooms skipped),
// both bosses fall in the same tick, each finishes once (one leaderboard entry and one payout each), and both
// boxes are filled in.
// node tools/test-bds/run.mjs --quiet --flat --only expedition_bp --scenario tools/test-bds/examples/expedition-two.js --timeout 900
const cfg = (t, key, value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `t${key}`, pack: "expedition_bp", key, value }));
export default async function (t) {
  t.formTimeout = 400;
  cfg(t, "slots", 2);
  cfg(t, "gauntletRooms", 10);
  const ann = await t.player("Ann", { op: true });
  const sx = Math.floor(ann.location.x) + 300;
  const sz = Math.floor(ann.location.z);
  await t.loadArea(sx, sz, { radius: 4 });
  await t.loadArea(sx + 132, sz, { radius: 4 });
  t.assert(t.cmd(ann, `/realm:expedition_site ${sx} ${sz}`).ok, "site");
  await t.waitMessage(ann, /site set/i, { timeout: 200 });
  const bob = await t.player("Bob", { x: Math.floor(ann.location.x) + 60, z: sz });
  const cid = await t.player("Cid", { x: Math.floor(ann.location.x) - 60, z: sz });
  bob.getComponent("minecraft:inventory").container.setItem(0, new t.mc.ItemStack("minecraft:emerald", 9));
  t.answerForm(ann, "Start an expedition", "Crypt", 0, "Start");
  t.answerForm(bob, "Start a Gauntlet", "Spider Nest", 1, "Fixed loadout", "Start the Gauntlet");
  t.cmd(ann, "/realm:expedition");
  t.cmd(bob, "/realm:expedition");
  const both = await t.waitUntil(async () => {
    const a = await state(t, undefined, 0);
    const b = await state(t, undefined, 1);
    return a?.phase === "active" && b?.phase === "active" ? [a, b] : undefined;
  }, { timeout: 1500, interval: 20, message: "both active" });
  const [a, b] = both;
  t.log(`slot 0: ${a.members} at ${a.o.x},${a.o.z} size ${a.size}; slot 1: ${b.members} at ${b.o.x},${b.o.z} size ${b.size}`);
  t.check(a.id !== b.id && a.o.x !== b.o.x, "two runs in two boxes");
  t.check(a.o.x + a.size <= b.o.x || b.o.x + b.size <= a.o.x, "the boxes don't overlap");
  const crowns0 = { Ann: score(t, ann), Bob: score(t, bob) };
  // A third player is turned away while both slots are taken.
  const since = t.tick;
  t.answerForm(cid, "Start an expedition", "Crypt", 0, "Back");
  t.cmd(cid, "/realm:expedition");
  const f = await t.waitForm(cid, { timeout: 100, title: "Crypt" }).catch(() => undefined);
  await t.wait(20);
  t.log(`Cid sees: ${t.forms(cid).map((x) => `${x.title}: ${x.body?.slice(-120)}`).join(" / ")}`);
  t.check(t.forms(cid).some((x) => /in progress/i.test(x.body ?? "")), "the third player is told the runs are full");
  // Play both to the boss.
  for (const [slot, p] of [[0, ann], [1, bob]]) {
    for (let guard = 0; guard < 30; guard++) {
      const st = await state(t, undefined, slot);
      const rm = st.rm;
      const entry = rm.doors.find((d) => d[0] === "back" && d[3] === 0);
      const [u, v] = entry ? onSide("back", entry[1], rm.r) : [0, 0];
      if (rm.kind !== "entry") p.teleport(local(rm, u, v + 1, 1));
      if (rm.kind === "boss") break;
      if (rm.kind === "boon") {
        const form = await t.waitForm(p, { timeout: 100, title: "boon" });
        form.answer(0);
        await t.waitMessage(p, /everyone has chosen/i, { timeout: 100 });
        continue;
      }
      t.system.sendScriptEvent("realm:expedition_debug", JSON.stringify({ skip: true, slot }));
      await t.wait(15);
    }
  }
  await t.waitUntil(() => t.dimension.getEntities({ tags: ["realm:exp_mob"] }).filter((e) => e.nameTag).length >= 2, { timeout: 300, interval: 10, message: "both bosses" });
  t.server("/kill @e[tag=realm:exp_mob]");
  await t.waitUntil(async () => (await state(t, undefined, 0))?.phase === "finishing" && (await state(t, undefined, 1))?.phase === "finishing", { timeout: 400, interval: 20, message: "both finishing" });
  await t.wait(20);
  const done = t.messages(undefined, { kind: "broadcast" }).filter((m) => /cleared the/.test(m.plain)).map((m) => m.plain);
  t.log(done.join(" / "));
  t.check(done.length === 2, `each run finished once (${done.length})`);
  const paid = { Ann: score(t, ann) - crowns0.Ann, Bob: score(t, bob) - crowns0.Bob };
  t.log(`crowns paid: ${JSON.stringify(paid)}`);
  t.check(paid.Ann > 0 && paid.Bob > 0, "both paid");
  t.cmd(ann, "/realm:expedition_leave");
  t.cmd(bob, "/realm:expedition_leave");
  await t.waitMessage(bob, /own items are back/i, { timeout: 300 });
  await t.waitUntil(async () => { const s = await state(t); return s?.runs === 0 && s.pending === 0 ? s : undefined; }, { timeout: 900, interval: 20, message: "both reset" });
  for (const [st, who] of [[a, "Ann"], [b, "Bob"]]) {
    const e = (st.rm.c);
    t.check(t.dimension.getBlock({ x: Math.floor(e.x), y: e.y, z: Math.floor(e.z) })?.typeId === "minecraft:deepslate", `${who}'s box filled in`);
  }
  t.check(!t.server("/tickingarea remove realm_exp_0").ok && !t.server("/tickingarea remove realm_exp_1").ok, "no dungeon ticking areas");
}
function score(t, p) {
  try {
    return t.world.scoreboard.getObjective("crowns")?.getScore(p) ?? 0;
  } catch {
    return 0;
  }
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
