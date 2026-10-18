// Treasure Maps: a player who comes close to the end of the last leg (so the pack starts looking for a chest spot) and
// leaves before the search is done (flies on, teleports home) keeps the treasure where it was: the search saw only
// unloaded land, which is no reason to move the treasure ("the map's ink shifts") or hand it over washed up.
// Needs the same test copy of maps_bp as maps-cleanup.js (a 3-second cleanup and tools/test-bds/hooks/maps-rvtest.js):
//   mkdir -p /tmp/mc && rm -rf /tmp/mc/maps_bp && cp -r packs/maps_bp /tmp/mc/
//   sed -i 's/^const CLEAR_DELAY = 30000;/const CLEAR_DELAY = 3000;/' /tmp/mc/maps_bp/scripts/cleanup.js
//   grep -q '^const CLEAR_DELAY = 3000;' /tmp/mc/maps_bp/scripts/cleanup.js
//   cat tools/test-bds/hooks/maps-rvtest.js >> /tmp/mc/maps_bp/scripts/main.js
//   node tools/test-bds/run.mjs --quiet --packs /tmp/mc --scenario tools/test-bds/examples/maps-leave.js --timeout 600

export default async function (t) {
  const sys = t.mc.system;
  const dim = t.dimension;
  const inbox = { hunts: new Map(), ok: new Set() };
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "rvtest:hunts") {
      const m = JSON.parse(message);
      inbox.hunts.set(m.name, m.hunts);
    } else if (id === "rvtest:ok") inbox.ok.add(message);
  }, { namespaces: ["rvtest"] });
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
  let areaN = 0;
  async function load(x, z, r = 4) {
    const name = `ml_${++areaN}`;
    t.server(`/tickingarea add circle ${Math.floor(x)} 0 ${Math.floor(z)} ${r} ${name} true`);
    const top = await t.waitUntil(() => {
      const b = dim.getTopmostBlock({ x: Math.floor(x), z: Math.floor(z) });
      return b && b.typeId && b.location.y < 319 ? b : undefined;
    }, { timeout: 600, message: `land at ${Math.round(x)}, ${Math.round(z)}` });
    return { name, top };
  }

  const p = await t.player("Flyer", { op: true });
  t.assert(t.cmd(p, "/realm:maps_give Flyer").ok, "maps_give");
  await t.waitMessage(p, /first clue/i, { timeout: 60 });
  const base = (await hunts("Flyer"))[0];
  const home = { x: Math.round(p.location.x), y: Math.round(p.location.y), z: Math.round(p.location.z) };

  // Ends of the last leg on land around spawn, each tried once: arrive, wait a few ticks, leave.
  const delays = [2, 6, 10, 14, 18, 24];
  let moved = 0;
  let tried = 0;
  for (let k = 0; k < delays.length; k++) {
    const a = (k / delays.length) * Math.PI * 2;
    const spot = { x: Math.round(home.x + Math.cos(a) * 400), z: Math.round(home.z + Math.sin(a) * 400) };
    const hunt = { ...base, id: `L${k}`, leg: 1, pts: [{ x: home.x, z: home.z }, spot], tries: 0, near: undefined, chest: undefined, mark: undefined, nomark: undefined };
    await setHunts("Flyer", [hunt]);
    const since = t.tick;
    let area;
    try {
      area = await load(spot.x, spot.z);
    } catch (e) {
      t.log(`  ${spot.x}, ${spot.z} did not load: skipped`);
      continue;
    }
    p.teleport({ x: spot.x + 0.5, y: area.top.location.y + 1, z: spot.z + 20.5 });
    // The pack checks every second; once it starts, the search reads 300 blocks a second for several seconds.
    await t.wait(20 + delays[k]);
    const early = t.messages(p, { since }).some((m) => /grows warm|ink shifts|washed up/i.test(m.plain));
    t.server(`/tickingarea remove ${area.name}`);
    p.teleport({ x: home.x + 0.5, y: home.y, z: home.z + 0.5 });
    if (early) {
      t.log(`  ${spot.x}, ${spot.z}: settled before the player left (delay ${delays[k]})`);
      continue;
    }
    tried++;
    await t.seconds(15);
    const after = t.messages(p, { since }).filter((m) => /grows warm|ink shifts|washed up/i.test(m.plain)).map((m) => m.plain.slice(0, 60));
    const h = (await hunts("Flyer"))[0];
    const same = h && h.pts[1].x === spot.x && h.pts[1].z === spot.z;
    t.log(`  ${spot.x}, ${spot.z} (left after ${delays[k]} ticks): ${after.join(" | ") || "no message"}; spot ${same ? "kept" : "moved"}`);
    if (!same || after.some((s) => /ink shifts|washed up/i.test(s))) moved++;
  }
  t.log(`left mid-search ${tried} times; the treasure moved ${moved} times`);
  t.assert(tried > 0, "the player left mid-search at least once");
  t.check(moved === 0, "leaving mid-search never moves the treasure");

  // Coming back finishes the job: the chest is buried at the planned spot.
  const h = (await hunts("Flyer"))[0];
  if (h && !h.chest) {
    const sp = h.pts[1];
    const since = t.tick;
    const { top } = await load(sp.x, sp.z);
    p.teleport({ x: sp.x + 0.5, y: top.location.y + 1, z: sp.z + 20.5 });
    const m = await t.waitMessage(p, /grows warm|ink shifts|washed up/i, { since, timeout: 600 });
    t.log(`  back at ${sp.x}, ${sp.z}: ${m.plain.slice(0, 80)}`);
  }
}
