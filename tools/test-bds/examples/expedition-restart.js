// Expeditions: a server restart at each phase of a run, then the world-side checks after it: the dungeon is filled in,
// no ticking area, no dungeon mobs, wolves or carts are left, and the slot takes a new run. Phases: (1) a Gauntlet with
// Fixed loadout, restarted with a sanctuary's boon pending; (2) mid-room with a wave alive; (3) the boss fight;
// (4) the treasure window with full chests (the leftovers must go into parcels); (5) right after entering a Fixed
// loadout Gauntlet; (6) the last checks. A simulated player comes back with a new id, so what waits for the old
// players (their stash, their parcels) is checked in the world, not handed back.
// node tools/test-bds/run.mjs --quiet --flat --only expedition_bp --scenario tools/test-bds/examples/expedition-restart.js --timeout 900
const K = "harness:exp_restart";
const load = (t) => JSON.parse(String(t.world.getDynamicProperty(K) ?? "{}"));
const save = (t, v) => t.world.setDynamicProperty(K, JSON.stringify(v));
const cfg = (t, key, value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `t${key}`, pack: "expedition_bp", key, value }));
const ids = (t, prefix) => t.world.structureManager.getWorldStructureIds().filter((x) => x.startsWith(prefix));

async function start(t, p, gauntlet, loadout) {
  if (gauntlet) t.answerForm(p, "Start a Gauntlet", "Crypt", (f) => f.buttons.findIndex((b) => b.startsWith("Easy")), ...(loadout ? ["Fixed loadout"] : []), "Start the Gauntlet");
  else t.answerForm(p, "Start an expedition", "Crypt", (f) => f.buttons.findIndex((b) => b.startsWith("Easy")), "Start");
  t.cmd(p, "/realm:expedition");
  return t.waitUntil(async () => { const s = await state(t); return s?.phase === "active" ? s : undefined; }, { timeout: 1200, interval: 20, message: "run active" });
}
/** Skips rooms until the run is in a room of this kind (the room woken up). */
async function goTo(t, p, kind) {
  for (let guard = 0; guard < 30; guard++) {
    const st = await state(t);
    const rm = st.rm;
    const entry = rm.doors.find((d) => d[0] === "back" && d[3] === 0);
    const [u, v] = entry ? onSide("back", entry[1], rm.r) : [0, 0];
    if (rm.kind !== "entry") p.teleport(local(rm, u, v + 1, 1));
    if (rm.kind === kind) return st;
    t.system.sendScriptEvent("realm:expedition_debug", JSON.stringify({ skip: true }));
    await t.wait(15);
  }
  t.fail(`no ${kind} room`);
}
async function verify(t, prev, label) {
  const st = await t.waitUntil(async () => { const s = await state(t); return s && s.pending === 0 && s.phase === "none" ? s : undefined; }, { timeout: 900, interval: 20, message: `${label}: box reset after the restart` });
  t.check(!!st, `${label}: reset`);
  t.check(!t.server("/tickingarea remove realm_exp_0").ok, `${label}: the dungeon's ticking area is gone`);
  await t.loadArea(prev.mx, prev.mz, { radius: 3 });
  await t.wait(30);
  const dim = t.dimension;
  t.check(dim.getEntities({ tags: ["realm:exp_mob"] }).length === 0, `${label}: no dungeon mobs`);
  t.check(dim.getEntities({ type: "minecraft:wolf" }).length === 0, `${label}: no wolves`);
  const carts = dim.getEntities({ type: "minecraft:chest_minecart" }).length;
  t.check(carts === 0, `${label}: no carts (${carts})`);
  const mid = dim.getBlock({ x: prev.mx, y: prev.my, z: prev.mz })?.typeId;
  t.check(mid === "minecraft:deepslate", `${label}: the entry room is filled in (${mid})`);
  for (const c of prev.chests ?? []) t.check(dim.getBlock(c)?.typeId === "minecraft:deepslate", `${label}: treasure chest at ${c.x},${c.y},${c.z} filled in`);
  t.check(dim.getEntities({ type: "minecraft:item", location: { x: prev.mx, y: prev.my, z: prev.mz }, maxDistance: 80 }).length === 0, `${label}: no items left lying around`);
  t.log(`${label}: stashes ${ids(t, "expedition:stash").join(",") || "none"}; parcels ${ids(t, "expedition:parcel").join(",") || "none"}`);
}
async function mark(t, st, extra = {}) {
  const entry = (await state(t, 0)).rm;
  save(t, { ...load(t), mx: Math.floor(entry.c.x), my: entry.c.y, mz: Math.floor(entry.c.z), ...extra });
}

export default async function (t) {
  t.formTimeout = 300;
  if (t.phase === 1) {
    cfg(t, "gauntletRooms", 10);
    cfg(t, "boonEvery", 3);
    const p = await t.player("P1", { op: true });
    p.getComponent("minecraft:inventory").container.setItem(4, new t.mc.ItemStack("minecraft:diamond", 7));
    const sx = Math.floor(p.location.x) + 300;
    const sz = Math.floor(p.location.z);
    await t.loadArea(sx, sz, { radius: 4 });
    t.assert(t.cmd(p, `/realm:expedition_site ${sx} ${sz}`).ok, "site");
    await t.waitMessage(p, /site set/i, { timeout: 200 });
    let st = await start(t, p, true, true);
    await mark(t, st);
    const form = t.waitForm(p, { timeout: 400, title: "boon" });
    st = await goTo(t, p, "boon");
    (await form).answer(null);
    await t.wait(20);
    st = await state(t);
    t.check(st.rm.kind === "boon" && st.active, "sanctuary pending");
    t.check(ids(t, "expedition:stash").length === 1, "stash saved");
    t.restart("restart with a sanctuary pending");
  }
  const prev = load(t);
  const p = await t.player(`P${t.phase}`, { op: true });
  p.getComponent("minecraft:inventory").container.setItem(4, new t.mc.ItemStack("minecraft:diamond", 7));
  if (t.phase === 2) {
    await verify(t, prev, "after the sanctuary");
    t.check(ids(t, "expedition:stash").length === 1, "P1's stash still saved for when they come back");
    await start(t, p, false);
    const st = await goTo(t, p, "combat");
    await t.waitUntil(async () => ((await state(t))?.alive ?? 0) > 0, { timeout: 200, interval: 10, message: "a wave" });
    await mark(t, st);
    t.restart("restart mid-room");
  }
  if (t.phase === 3) {
    await verify(t, prev, "mid-room");
    await start(t, p, false);
    const st = await goTo(t, p, "boss");
    await t.waitUntil(() => t.dimension.getEntities({ tags: ["realm:exp_mob"] }).length > 0, { timeout: 300, interval: 10, message: "the boss" });
    await mark(t, st);
    t.restart("restart in the boss fight");
  }
  if (t.phase === 4) {
    await verify(t, prev, "boss fight");
    let st = await start(t, p, false);
    await goTo(t, p, "boss");
    await t.wait(60);
    for (let k = 0; k < 10 && (await state(t))?.phase === "active"; k++) { t.server("/kill @e[tag=realm:exp_mob]"); await t.wait(20); }
    st = await state(t);
    t.assert(st.phase === "finishing", `finishing (${st.phase})`);
    const vault = (await state(t, st.n - 1)).rm;
    let items = 0;
    for (const c of vault.chests) {
      const box = t.dimension.getBlock(c)?.getComponent("minecraft:inventory")?.container;
      for (let k = 0; k < (box?.size ?? 0); k++) if (box.getItem(k)) items++;
    }
    t.log(`treasure: ${items} stacks in ${vault.chests.length} chest(s)`);
    t.check(items > 0, "treasure in the chests");
    save(t, { ...load(t), parcelsBefore: ids(t, "expedition:parcel").length, items });
    await mark(t, st, { chests: vault.chests });
    t.restart("restart in the treasure window");
  }
  if (t.phase === 5) {
    await verify(t, prev, "treasure window");
    const parcels = ids(t, "expedition:parcel").length;
    t.check(parcels > prev.parcelsBefore, `the treasure left went into a parcel (${prev.parcelsBefore} -> ${parcels})`);
    const st = await start(t, p, true, true);
    await t.wait(15);
    await mark(t, st, { chests: [] });
    t.restart("restart right after entering");
  }
  if (t.phase === 6) {
    await verify(t, prev, "entry");
    t.check(ids(t, "expedition:stash").length === 2, "P1's and P5's stashes are still saved");
    // The slot still works.
    const st = await start(t, p, false);
    t.check(st.phase === "active", "a new run starts after all that");
    t.cmd(p, "/realm:expedition_leave");
    await t.waitUntil(async () => (await state(t))?.phase === "none", { timeout: 600, interval: 20, message: "run over" });
  }
}
// shared helpers (pasted into each scenario: scenarios can't import)
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
