// Expeditions: climbing rooms (shafts, climbing puzzles) have no ladder to the top, a fall in one drifts down
// with Slow Falling instead of hurting, and no phantoms are ever spawned (Spider Nest's flyers were all phantoms,
// which circle into a corner in a closed room). Spider Nest at Nightmare 7 (tall rooms and a shaft, which had a
// ladder below tier 10), played room by room with realm:expedition_debug {skip}.
// node tools/test-bds/run.mjs --quiet --flat --only expedition_bp --scenario tools/test-bds/examples/expedition-climb.js --timeout 900
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
  t.answerForm(p, "Start an expedition", "Spider Nest", 9, "Start");
  t.cmd(p, "/realm:expedition");
  let st = await t.waitUntil(async () => { const s = await state(t); return s?.phase === "active" ? s : undefined; }, { timeout: 1200, interval: 20, message: "run active" });
  t.log(`level ${st.level}, ${st.n} rooms`);
  await t.wait(20);
  // 1. No ladder anywhere in a climbing room.
  const rooms = await allRooms(t, st.n + st.sides.length);
  let climbs = 0;
  for (const rm of rooms) {
    if (!rm || (rm.kind !== "shaft" && rm.pz?.type !== "parkour")) continue;
    climbs++;
    let ladders = 0;
    let ledges = 0;
    for (let u = -rm.r; u <= rm.r; u++) for (let v = -rm.r; v <= rm.r; v++) for (let y = 1; y <= rm.h; y++) {
      const id = t.dimension.getBlock(local(rm, u, v, y))?.typeId ?? "";
      if (id === "minecraft:ladder") ladders++;
      else if (y > 2 && Math.max(Math.abs(u), Math.abs(v)) >= rm.r - 1 && !(Math.abs(u) === rm.r && Math.abs(v) === rm.r) && id !== "minecraft:air" && !/lantern|sign|button/.test(id)) ledges++;
    }
    t.log(`room ${rm.i} ${rm.kind}${rm.pz ? " " + rm.pz.type : ""}: h ${rm.h}, ${ledges} ledge blocks, ${ladders} ladder blocks`);
    t.check(ladders === 0, `room ${rm.i} (${rm.kind}) has no ladder (${ladders})`);
    t.check(ledges >= rm.h / 2, `room ${rm.i} (${rm.kind}) has ledges to climb (${ledges})`);
  }
  t.check(climbs >= 1, `a climbing room to look at (${climbs})`);
  // 2. Play through: no phantoms, and a fall in the shaft doesn't hurt.
  p.addEffect("resistance", 20000, { amplifier: 4, showParticles: false });
  p.addEffect("regeneration", 20000, { amplifier: 4, showParticles: false });
  const types = new Set();
  const look = () => {
    for (const e of t.dimension.getEntities({ tags: ["realm:exp_mob"] })) types.add(e.typeId);
  };
  let falls = 0;
  let guard = 0;
  while (guard++ < 60) {
    st = await state(t);
    if (!st || st.phase !== "active") break;
    const rm = st.rm;
    const entry = rm.doors.find((d) => d[0] === "back" && d[3] === 0);
    const [u, v] = entry ? onSide("back", entry[1], rm.r) : [0, 0];
    if (rm.kind !== "entry") p.teleport(local(rm, u, v, 1));
    await t.wait(20);
    if (rm.kind === "shaft") {
      p.removeEffect("resistance");
      p.removeEffect("regeneration");
      await t.wait(5);
      const hp = p.getComponent("minecraft:health");
      hp.resetToMaxValue();
      const before = hp.currentValue;
      p.teleport(local(rm, 2, 1, 14));
      let slow = false;
      for (let k = 0; k < 60; k++) {
        await t.wait(2);
        if (p.getEffect("slow_falling")) slow = true;
      }
      const after = hp.currentValue;
      t.log(`shaft fall from 13 blocks: health ${before} -> ${after}, slow falling ${slow}, now ${(p.location.y - (rm.c.y)).toFixed(1)} above the floor`);
      t.check(after >= before, `a fall in the shaft doesn't hurt (${before} -> ${after})`);
      t.check(slow, "slow falling caught the fall");
      falls++;
      p.addEffect("resistance", 20000, { amplifier: 4, showParticles: false });
      p.addEffect("regeneration", 20000, { amplifier: 4, showParticles: false });
    }
    if ((rm.kind === "combat" || rm.kind === "elite" || rm.kind === "shaft") && rm.h >= 10) {
      for (let k = 0; k < 6; k++) {
        await t.wait(20);
        look();
      }
    }
    if (rm.kind === "trap") {
      p.teleport(rm.zone);
      await t.waitMessage(p, /made it through/i, { timeout: 100 });
      continue;
    }
    if (rm.kind === "boss") {
      look();
      break;
    }
    t.system.sendScriptEvent("realm:expedition_debug", JSON.stringify({ skip: true }));
    await t.wait(10);
  }
  t.log(`dungeon mobs seen: ${[...types].join(", ")}`);
  t.check(falls >= 1, `fell in a shaft (${falls})`);
  t.check(!types.has("minecraft:phantom"), "no phantoms in the dungeon");
  t.cmd(p, "/realm:expedition_leave");
  await t.waitUntil(async () => { const s = await state(t); return s?.phase === "none" && s.pending === 0 ? s : undefined; }, { timeout: 900, interval: 20, message: "reset" });
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
