// Expeditions: every difficulty tier's dungeon builds and can be walked. Runs Easy, Normal, Hard and Nightmare 1, 3, 5,
// 8, 10, 12, 15, 17 and 20 (each in another dungeon) and a Nightmare 20 Gauntlet, checks each build with the floor walk
// (every room reachable on foot until a shaft's high exit), then leaves and waits for the box to be filled in.
// node tools/test-bds/run.mjs --quiet --flat --only expedition_bp --scenario tools/test-bds/examples/expedition-tiers.js --timeout 900
const DUNGEONS = ["Crypt", "Drowned Vault", "Frost Hollow", "Nether Forge", "Sculk Depths", "Pillager Keep", "Spider Nest", "Ender Spire"];
export default async function (t) {
  t.formTimeout = 400;
  const p = await t.player("Tester", { op: true });
  const sx = Math.floor(p.location.x) + 300;
  const sz = Math.floor(p.location.z);
  await t.loadArea(sx, sz, { radius: 4 });
  t.assert(t.cmd(p, `/realm:expedition_site ${sx} ${sz}`).ok, "site");
  await t.waitMessage(p, /site set/i, { timeout: 200 });
  t.answerForm(p, "Operator tools", "Unlock every tier");
  t.cmd(p, "/realm:expedition");
  await t.waitMessage(p, /every tier/i, { timeout: 100 });
  const levels = [0, 1, 2, 3, 5, 7, 10, 12, 14, 17, 19, 22, -22];
  let k = 0;
  for (const L of levels) {
    const long = L < 0;
    const lvl = Math.abs(L);
    const d = DUNGEONS[k++ % DUNGEONS.length];
    const label = `${long ? "Gauntlet " : ""}${d} L${lvl}`;
    if (long) t.answerForm(p, "Start a Gauntlet", d, lvl, "Start the Gauntlet");
    else t.answerForm(p, "Start an expedition", d, lvl, "Start");
    t.cmd(p, "/realm:expedition");
    const st = await t.waitUntil(async () => { const s = await state(t); return s?.phase === "active" ? s : undefined; }, { timeout: 1200, interval: 20, message: `${label} active` });
    t.check(st.level === lvl, `${label}: level ${st.level}`);
    await t.wait(20);
    await checkBuild(t, st, label);
    t.cmd(p, "/realm:expedition_leave");
    await t.waitUntil(async () => { const s = await state(t); return s?.phase === "none" && s.pending === 0 ? s : undefined; }, { timeout: 900, interval: 20, message: `${label} reset` });
    await t.wait(10);
  }
  t.check(t.dimension.getEntities({ tags: ["realm:exp_mob"] }).length === 0, "no dungeon mobs left");
}
// shared helpers (pasted into each scenario: scenarios can't import)
const PASS = /air|bars|sign|button|plate|ladder|lever|web|fire|lantern|torch|water|carpet|chain/;
async function state(t, room) {
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
  t.system.sendScriptEvent("realm:expedition_debug", JSON.stringify(room === undefined ? {} : typeof room === "object" ? room : { room }));
  return Promise.race([done, t.wait(40).then(() => undefined)]);
}
const local = (rm, u, v, y) => {
  const f = rm.fwd;
  const ac = { x: -f.z, z: f.x };
  return { x: Math.floor(rm.c.x) + ac.x * u + f.x * v + 0.5, y: rm.c.y + (y - 1), z: Math.floor(rm.c.z) + ac.z * u + f.z * v + 0.5 };
};
const onSide = (side, a, d) => (side === "back" ? [a, -d] : side === "fwd" ? [a, d] : side === "left" ? [-d, a] : [d, a]);
/** BFS over the box at feet level from a world spot; returns a Set of "x,z" */
function worldWalk(t, st, from) {
  const dim = t.dimension;
  const y = st.o.y + 1;
  const seen = new Set();
  const ok = (x, z) => {
    if (x < st.o.x || z < st.o.z || x >= st.o.x + st.size || z >= st.o.z + st.size) return false;
    for (const dy of [0, 1]) {
      const b = dim.getBlock({ x, y: y + dy, z });
      if (!b) return false;
      if (!(b.isAir || b.isLiquid || PASS.test(b.typeId))) return false;
    }
    return true;
  };
  const q = [[Math.floor(from.x), Math.floor(from.z)]];
  seen.add(`${q[0][0]},${q[0][1]}`);
  while (q.length) {
    const [x, z] = q.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${z + dz}`;
      if (seen.has(k) || !ok(x + dx, z + dz)) continue;
      seen.add(k);
      q.push([x + dx, z + dz]);
    }
  }
  return seen;
}
async function allRooms(t, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push((await state(t, i))?.rm);
  return out;
}
/** Checks every room's build: the floor walk reaches each room until a shaft's high exit. */
async function checkBuild(t, st, label) {
  const total = st.sides.length + st.n;
  const rooms = await allRooms(t, total);
  const entry = rooms[0];
  const start = local(entry, 0, 0, 1);
  const seen = worldWalk(t, st, start);
  let reachedUntil = -1;
  const shapes = {};
  for (let i = 0; i < rooms.length; i++) {
    const rm = rooms[i];
    if (!rm) { t.check(false, `${label} room ${i} state`); continue; }
    shapes[rm.shape] = (shapes[rm.shape] ?? 0) + 1;
    let any = false;
    for (let u = -rm.r; u <= rm.r && !any; u++) for (let v = -rm.r; v <= rm.r && !any; v++) {
      const w = local(rm, u, v, 1);
      if (seen.has(`${Math.floor(w.x)},${Math.floor(w.z)}`)) any = true;
    }
    if (any && i < st.n && reachedUntil === i - 1) reachedUntil = i;
    // A room after a shaft is reached through the chute: don't count it.
    const prevShaft = i > 0 && rooms[i - 1]?.kind === "shaft";
    if (!any && !prevShaft && i < st.n && !rooms.slice(0, i).some((x) => x?.kind === "shaft")) t.check(false, `${label}: room ${i} (${rm.kind} ${rm.shape} r${rm.r}) not reachable on foot`);
  }
  t.log(`${label}: ${st.n} path rooms + ${st.sides.length} side, box ${st.size}, cell ${st.cell}; walkable cells ${seen.size}; reached rooms 0..${reachedUntil}; shapes ${JSON.stringify(shapes)}`);
  return rooms;
}
