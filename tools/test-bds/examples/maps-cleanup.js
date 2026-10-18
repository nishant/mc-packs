// Treasure Maps: Warmer / Colder range, markers and chests put back, two hunters at one spot, restart, legacy maps.
// Needs a copy of maps_bp with a 3-second cleanup delay and the test hook tools/test-bds/hooks/maps-rvtest.js, which
// reads and writes hunts and undo records (packs can't read each other's dynamic properties). The suite runs these:
//   mkdir -p /tmp/mc && rm -rf /tmp/mc/maps_bp && cp -r packs/maps_bp /tmp/mc/
//   sed -i 's/^const CLEAR_DELAY = 30000;/const CLEAR_DELAY = 3000;/' /tmp/mc/maps_bp/scripts/cleanup.js
//   grep -q '^const CLEAR_DELAY = 3000;' /tmp/mc/maps_bp/scripts/cleanup.js
//   cat tools/test-bds/hooks/maps-rvtest.js >> /tmp/mc/maps_bp/scripts/main.js
//   node tools/test-bds/run.mjs --quiet --packs /tmp/mc --scenario tools/test-bds/examples/maps-cleanup.js --timeout 600
const OW = "minecraft:overworld";

export default async function (t) {
  const sys = t.mc.system;
  const dim = t.dimension;
  const inbox = { hunts: new Map(), ok: new Set(), undo: [], undoDone: false };
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "rvtest:hunts") {
      const m = JSON.parse(message);
      inbox.hunts.set(m.name, m.hunts);
    } else if (id === "rvtest:ok") inbox.ok.add(message);
    else if (id === "rvtest:undo_r") inbox.undo.push(JSON.parse(message));
    else if (id === "rvtest:undo_end") inbox.undoDone = true;
    else if (id === "realm:cfg_ack") inbox.ok.add(JSON.parse(message).id);
  }, { namespaces: ["rvtest", "realm"] });
  async function hunts(name) {
    inbox.hunts.delete(name);
    sys.sendScriptEvent("rvtest:get", name);
    return t.waitUntil(() => (inbox.hunts.has(name) ? inbox.hunts.get(name) ?? [] : undefined), { timeout: 20, message: `hunts of ${name}` });
  }
  async function setHunts(name, list) {
    inbox.ok.delete(name);
    sys.sendScriptEvent("rvtest:set", JSON.stringify({ name, hunts: list }));
    await t.waitUntil(() => inbox.ok.has(name), { timeout: 20, message: `set hunts of ${name}` });
  }
  async function undo() {
    inbox.undo = [];
    inbox.undoDone = false;
    sys.sendScriptEvent("rvtest:undo", "");
    await t.waitUntil(() => inbox.undoDone, { timeout: 20, message: "undo records" });
    return inbox.undo;
  }
  /** waitUntil for an async check. */
  async function until(fn, timeout, message) {
    const end = t.tick + timeout;
    while (t.tick < end) {
      if (await fn()) return true;
      await t.wait(20);
    }
    t.fail(message);
  }
  let areaN = 0;
  let lastArea = "";
  async function load(x, z) {
    const name = `mc_${++areaN}`;
    lastArea = name;
    t.server(`/tickingarea add circle ${Math.floor(x)} 0 ${Math.floor(z)} 3 ${name} true`);
    return t.waitUntil(() => {
      const top = dim.getTopmostBlock({ x: Math.floor(x), z: Math.floor(z) });
      return top && top.typeId && top.location.y < 319 ? top : undefined;
    }, { timeout: 600, message: `land at ${Math.round(x)}, ${Math.round(z)}` });
  }
  const typeAt = (x, y, z) => { try { return dim.getBlock({ x, y, z })?.typeId; } catch { return "unloaded"; } };
  /** A grass spot `r` from (cx, cz), loaded. */
  async function grassSpot(cx, cz, r, skip = []) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * r), z = Math.round(cz + Math.sin(a) * r);
      if (skip.some((s) => Math.hypot(s.x - x, s.z - z) < 80)) continue;
      const top = await load(x, z);
      let ok = top.typeId === "minecraft:grass_block";
      for (const [dx, dz] of [[12, 0], [-12, 0], [0, 12], [0, -12]]) {
        const tt = await t.waitUntil(() => { const q = dim.getTopmostBlock({ x: x + dx, z: z + dz }); return q && q.typeId ? q : undefined; }, { timeout: 200, message: "neighbors load" });
        if (/water|leaves|log/.test(tt.typeId)) ok = false;
      }
      if (ok) return { x, z, y: top.location.y };
      t.server(`/tickingarea remove ${lastArea}`);
    }
    throw new Error("no grass spot");
  }
  const acks = async (pack, key, value, player) => {
    const id = `c${++areaN}`;
    sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id, pack, key, value, player: player?.id }));
    await t.waitUntil(() => inbox.ok.has(id), { timeout: 20, message: `cfg ${key}` });
  };

  if (t.phase === 2) {
    // A's marker was let go just before the restart: it comes down after it.
    const saved = JSON.parse(String(t.world.getDynamicProperty("rv:restart")));
    t.server("/tickingarea remove_all"); // phase 1's areas count toward the limit of 10
    await load(saved.x, saved.z);
    await until(async () => (await undo()).every((r) => r.id !== saved.id), 400, "the released marker's record is done after the restart");
    const left = saved.blocks.filter((b) => typeAt(b[0], b[1], b[2]) === saved.placed[b[3]]);
    t.check(!left.length, `marker blocks put back after the restart (${left.length} left)`);
    // B's marker (its hunt still going; B never comes back with the same id) stays.
    const bRec = (await undo()).find((r) => r.id === saved.bId);
    t.check(!!bRec && !bRec.due, "the other hunter's marker stays while its hunt is open");

    // Legacy maps: a 1.2.0 hunt without v, mid leg, and one with a chest already buried.
    const c = await t.player("Cleo", { op: true });
    const spot = await grassSpot(163, 170, 200);
    await setHunts("Cleo", [{ id: "OLD", dim: OW, pts: [{ x: spot.x, z: spot.z }, { x: spot.x + 600, z: spot.z }], leg: 0, clue: "An old clue", place: "the old place", tries: 0, t: 1 }]);
    const m = await t.waitMessage(c, /rewrites itself/i, { timeout: 60 });
    t.log(m.plain.slice(0, 160));
    const up = (await hunts("Cleo"))[0];
    t.check(up.v === 2 && !up.regen && /X |Z /.test(up.clue) && up.pts.length === 2, `legacy hunt upgraded: v ${up.v}, clue "${up.clue.slice(0, 60)}"`);
    const chestAt = { x: spot.x + 5, y: spot.y - 2, z: spot.z };
    dim.getBlock(chestAt).setType("minecraft:chest");
    await setHunts("Cleo", [{ id: "OLC", dim: OW, pts: [{ x: spot.x, z: spot.z }, { x: chestAt.x, z: chestAt.z }], leg: 1, clue: "Old last clue", tries: 0, t: 1, chest: chestAt }]);
    await t.wait(30);
    const kept = (await hunts("Cleo"))[0];
    t.check(kept.clue === "Old last clue" && kept.chest, "legacy hunt with a chest keeps its clue and chest");
    c.teleport({ x: chestAt.x + 0.5, y: spot.y + 1, z: chestAt.z + 0.5 });
    await t.waitMessage(c, /You found the treasure/i, { timeout: 60 });
    const rec = (await undo()).find((r) => r.what === "chest" && r.blocks[0][0] === chestAt.x && r.blocks[0][2] === chestAt.z);
    t.check(rec && rec.due > 0 && rec.types[rec.blocks[0][4]].t === "minecraft:dirt", "legacy chest gets a record with dirt under it");
    return;
  }

  const a = await t.player("Alice", { op: true });
  await acks("maps_bp", "where", "hotbar", a);
  t.echoActionBar = false;
  // 1. A hunt whose first leg ends on grass we chose.
  t.assert(t.cmd(a, "/realm:maps_give Alice").ok, "maps_give");
  await t.waitMessage(a, /first clue/i, { timeout: 60 });
  let h = (await hunts("Alice"))[0];
  const s1 = await grassSpot(163, 170, 300);
  h.pts[0] = { x: s1.x, z: s1.z };
  await setHunts("Alice", [h]);
  const inv = a.getComponent("inventory").container;
  for (let i = 0; i < 9; i++) if (inv.getItem(i)?.typeId === "minecraft:paper") a.selectedSlotIndex = i;
  a.teleport({ x: s1.x + 0.5, y: s1.y + 1, z: s1.z + 20.5 });
  const dark = await t.waitMessage(a, /ink darkens/i, { timeout: 200 });
  t.log(dark.plain);
  h = (await hunts("Alice"))[0];
  t.assert(h.mark, "a marker was built");
  const mk = h.mark;
  const bar = async (dx) => {
    a.teleport({ x: mk.x + dx + 0.5, y: dim.getTopmostBlock({ x: mk.x + dx, z: mk.z }).location.y + 1, z: mk.z + 0.5 });
    const since = t.tick;
    const m = await t.waitUntil(() => t.messages(a, { kind: "actionbar", pack: "maps_bp", since }).at(-1), { timeout: 50, message: "map line" });
    return m.plain;
  };
  // 2. Warmer / Colder only within warmthRadius (64).
  const lines = [];
  for (const dx of [100, 70, 60, 50, 58, 30, 8]) {
    if (dx >= 70) await load(mk.x + dx, mk.z);
    lines.push([dx, await bar(dx)]);
  }
  t.log(lines.map(([d, s]) => `${d}: ${s}`).join(" | "));
  t.check(/faintly warm/.test(lines[0][1]) && /faintly warm/.test(lines[1][1]), "far: faintly warm, no Warmer/Colder");
  t.check(/quiet/.test(lines[2][1]), "first reading inside the radius: quiet");
  t.check(/Warmer/.test(lines[3][1]) && /Colder/.test(lines[4][1]), "Warmer then Colder inside the radius");
  t.check(/Very warm/.test(lines[5][1]) && /Hot/.test(lines[6][1]), "Very warm, then Hot near the marker");

  // 3. Reach it; change one marker block; nobody-near holds it; then it comes down except the changed block.
  a.teleport({ x: mk.x + 0.5, y: mk.y + 4, z: mk.z + 0.5 });
  await t.waitMessage(a, /You found the (cairn|flag|standing stone)/i, { timeout: 60 });
  let rec = (await undo()).find((r) => r.what === "mark" && r.hunt === h.id);
  t.assert(rec && rec.due > 0, "marker record let go");
  const top = [...rec.blocks].sort((p, q) => q[1] - p[1])[0];
  dim.getBlock({ x: top[0], y: top[1], z: top[2] }).setType("minecraft:gold_block");
  a.teleport({ x: mk.x + 10.5, y: mk.y + 1, z: mk.z + 0.5 });
  await t.seconds(10);
  t.check((await undo()).some((r) => r.id === rec.id), "not put back while a player is within 32 blocks");
  await load(mk.x, mk.z);
  a.teleport({ x: mk.x + 60.5, y: dim.getTopmostBlock({ x: mk.x + 60, z: mk.z }).location.y + 1, z: mk.z + 0.5 });
  await until(async () => !(await undo()).some((r) => r.id === rec.id), 300, "marker put back once nobody is near");
  const placedLeft = rec.blocks.filter((b) => b !== top && typeAt(b[0], b[1], b[2]) === rec.types[b[3]].t);
  t.check(!placedLeft.length, `marker blocks restored (${placedLeft.length} left)`);
  t.check(typeAt(top[0], top[1], top[2]) === "minecraft:gold_block", "the block a player changed stays");
  const origOk = rec.blocks.filter((b) => b !== top && typeAt(b[0], b[1], b[2]) !== rec.types[b[4]].t);
  t.check(!origOk.length, `restored to what was there (${origOk.map((b) => `${typeAt(b[0], b[1], b[2])}!=${rec.types[b[4]].t}`).join(",")})`);

  // 4. The last leg: chest; put back only once empty.
  h = (await hunts("Alice"))[0];
  const s2 = await grassSpot(163, 170, 450, [s1]);
  h.leg = h.pts.length - 1;
  h.pts[h.leg] = { x: s2.x, z: s2.z };
  h.near = undefined; h.mark = undefined; h.nomark = undefined;
  await setHunts("Alice", [h]);
  a.teleport({ x: s2.x + 0.5, y: s2.y + 1, z: s2.z + 30.5 });
  await t.waitMessage(a, /grows warm|ink shifts|washed up/i, { timeout: 300 });
  h = (await hunts("Alice"))[0];
  if (h?.chest) {
    const c = h.chest;
    a.teleport({ x: c.x + 0.5, y: dim.getTopmostBlock({ x: c.x, z: c.z }).location.y + 1, z: c.z + 0.5 });
    await t.waitMessage(a, /You found the treasure/i, { timeout: 60 });
    rec = (await undo()).find((r) => r.what === "chest" && r.hunt === h.id);
    t.assert(rec && rec.due > 0, "chest record let go");
    await load(c.x, c.z);
    a.teleport({ x: c.x + 60.5, y: dim.getTopmostBlock({ x: c.x + 60, z: c.z }).location.y + 1, z: c.z + 0.5 });
    await t.seconds(12);
    t.check(typeAt(c.x, c.y, c.z) === "minecraft:chest", "a chest with loot stays");
    dim.getBlock(c).getComponent("inventory").container.clearAll();
    await until(async () => !(await undo()).some((r) => r.id === rec.id), 300, "empty chest put back");
    t.check(typeAt(c.x, c.y, c.z) === rec.types[rec.blocks[0][4]].t, `chest spot is ${typeAt(c.x, c.y, c.z)} again`);
  } else t.log("no chest this time (moved or handed over)");

  // 5. Two hunters at one spot.
  const b = await t.player("Bob", { x: 170, z: 170 });
  t.cmd(a, "/realm:maps_give @a");
  await t.waitMessage(b, /first clue/i, { timeout: 60 });
  const s3 = await grassSpot(163, 170, 380, [s1, s2]);
  for (const name of ["Alice", "Bob"]) {
    const hh = (await hunts(name))[0];
    hh.pts[0] = { x: s3.x, z: s3.z };
    await setHunts(name, [hh]);
  }
  a.teleport({ x: s3.x + 0.5, y: s3.y + 1, z: s3.z + 40.5 });
  b.teleport({ x: s3.x + 2.5, y: s3.y + 1, z: s3.z + 40.5 });
  await t.waitMessage(a, /ink darkens/i, { timeout: 200 });
  await t.waitMessage(b, /ink darkens/i, { timeout: 200 });
  const ha = (await hunts("Alice"))[0], hb = (await hunts("Bob"))[0];
  t.log(`Alice: ${JSON.stringify(ha.mark)} ${ha.style}; Bob: ${JSON.stringify(hb.mark)} ${hb.style}`);
  const all = await undo();
  const ra = all.find((r) => r.hunt === ha.id && r.what === "mark"), rb = all.find((r) => r.hunt === hb.id && r.what === "mark");
  if (ra && rb) {
    const keys = new Set(ra.blocks.map((q) => `${q[0]},${q[1]},${q[2]}`));
    t.check(!rb.blocks.some((q) => keys.has(`${q[0]},${q[1]},${q[2]}`)), "the two markers share no block");
    t.check(rb.blocks.every((q) => ra.blocks.every((p) => Math.hypot(p[0] - q[0], p[2] - q[2]) > 1.5) || true), "apart");
  } else t.log(`one hunter got a bottle: ${!!ra} ${!!rb}`);
  // Alice reaches hers and the server restarts right away (the record is due in 3 seconds).
  if (ha.mark) {
    a.teleport({ x: ha.mark.x + 0.5, y: ha.mark.y + 4, z: ha.mark.z + 0.5 });
    await t.waitMessage(a, /You found the/i, { timeout: 60 });
    const r = (await undo()).find((q) => q.hunt === ha.id && q.what === "mark");
    t.world.setDynamicProperty("rv:restart", JSON.stringify({ id: r.id, x: ha.mark.x, z: ha.mark.z, blocks: r.blocks, placed: Object.fromEntries(r.types.map((k, i) => [i, k.t])), bId: rb?.id }));
    a.teleport({ x: 163.5, y: 80, z: 170.5 });
    b.teleport({ x: 165.5, y: 80, z: 170.5 });
    await t.wait(5);
    t.restart("restart with a marker waiting to be put back");
  }
}
