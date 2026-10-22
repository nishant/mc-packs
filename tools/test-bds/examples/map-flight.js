// Minimap terrain while flying: a player teleported 3 blocks a tick over ground that changes (a sand band built
// ahead of them) sees the sand on the radar within a few ticks of arriving and few unknown cells while moving, and
// a second player standing under a roof (cave terrain) never changes what the first one sees of the same dimension.
//   node tools/test-bds/run.mjs --quiet --flat --only map_bp,hud_rp --scenario tools/test-bds/examples/map-flight.js --timeout 900
const g = (n) => String.fromCodePoint(0xf300 + n);
// ADAPTED to the native radar but NOT RUN (CI pending). The radar draws sampled columns as F4/F5 palette glyphs (shade-dependent), not
// the old fixed F3 sand/cave glyphs, so sand and roofs are asserted through raw canonical samples (map_debug "detail_raw": resolution 2,
// ODD anchors sampleCoord(v, 2) = floor(v / 2) * 2 + 1, { kind, y, valid, source }) and the viewer's store. Native OW viewers under a roof
// use the shared SURFACE store (there is no private cave layer to isolate any more); the roof is a valid upper-surface sample.
// Unknown (unsampled) cells are Q_EMPTY (F338) inside the 797-cell circle; the 33x33 square's corners are Q_OUTSIDE (F3FF).
// The old bars scale with the circle: 150 of 441 cells = 270 of 797 (34%).
const EMPTY = g(0x38);
const count = (s, glyph) => [...(s ?? "")].filter((c) => c === glyph).length;
const sc = (v) => Math.floor(v / 2) * 2 + 1; // terrain.sampleCoord(v, 2): always an odd canonical anchor

// Bounded realm:map_state packets arrive as {player,channel:'state',v:1,chunk:{id,index,total,text}}; join them inline (test packs cannot import runtime modules).
const mapStateParts = new Map();
function reassembleMapState(message, now = 0) {
  for (const [k, e] of mapStateParts) if (now - e.at > 200) mapStateParts.delete(k);
  const d = JSON.parse(message),
    c = d && d.chunk;
  if (!c) return d;
  if (d.channel !== "state" || d.v !== 1 || !Number.isInteger(c.total) || c.total < 1 || c.total > 12 || !Number.isInteger(c.index) || c.index < 0 || c.index >= c.total || typeof c.text !== "string") throw Error("bad map state packet");
  const key = `${d.player ?? ""}:${c.id}`;
  let e = mapStateParts.get(key);
  if (!e) {
    if (mapStateParts.size >= 16) mapStateParts.delete(mapStateParts.keys().next().value);
    e = { total: c.total, parts: new Array(c.total), got: 0, at: now };
    mapStateParts.set(key, e);
  }
  if (e.total !== c.total || e.parts[c.index] !== undefined) {
    mapStateParts.delete(key);
    throw Error("bad map state packet");
  }
  e.parts[c.index] = c.text;
  if (++e.got < e.total) return undefined;
  mapStateParts.delete(key);
  return JSON.parse(e.parts.join(""));
}

export default async function (t) {
  // These checks describe the Minimap with the time it had before its 1 ms budget (October 2026): budgetLevel high
  // gives it exactly those budgets, the same code with more time a tick. Its cost at normal is perf-soak's to measure.
  await mapBudgetHigh(t);
  const sys = t.system;
  let last = {};
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:map_state") return;
      try {
        const m = reassembleMapState(message, sys.currentTick);
        if (m === undefined) return;
        last[m.player] = m;
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  /** Raw canonical samples (<= 4 points, resolution 2) of a viewer's store, polled until every one is a known valid column. */
  const rawOf = async (p, points, message, ok = () => true) => {
    let m;
    for (let i = 0; i < 60; i++) {
      m = undefined;
      const sub = sys.afterEvents.scriptEventReceive.subscribe(({ id, message: s }) => {
        if (id !== "realm:map_state") return;
        try {
          const j = reassembleMapState(s, sys.currentTick);
          if (j === undefined) return;
          if (j.player === p.id && Array.isArray(j.samples) && j.profile) m = j;
        } catch {}
      }, { namespaces: ["realm"] });
      sys.sendScriptEvent("realm:map_debug", JSON.stringify({ player: p.id, action: "detail_raw", points }));
      await t.waitUntil(() => m, { timeout: 30, message: `detail_raw for ${message}` });
      sys.afterEvents.scriptEventReceive.unsubscribe(sub);
      if (m.samples.every((s) => s?.valid === true) && ok(m)) return m;
      await t.wait(10);
    }
    t.log(`raw samples at failure: ${JSON.stringify(m)}`);
    t.fail(`${message}: samples never became valid/expected`);
  };
  const radarOf = async (p, points) => {
    const since = t.tick;
    last[p.id] = undefined;
    const at = p.location;
    // Default resolution 2, always on the odd canonical anchor of the requested block (a block and its anchor neighbor are one column).
    const samples = (points ?? [-24, 24].flatMap((dx) => [-24, 24].map((dz) => [dx, dz]))).map(([dx, dz]) => ({ x: sc(at.x + dx), z: sc(at.z + dz) }));
    sys.sendScriptEvent("realm:map_debug", JSON.stringify({ player: p.id, action: "state", samples }));
    await t.waitUntil(() => last[p.id] !== undefined, { timeout: 20, message: "realm:map_state" });
    return last[p.id].radar ?? "";
  };
  await t.server("/gamerule domobspawning false");
  const a = await t.player("Flier", { op: true, x: 0, z: 0, gameMode: "creative" });
  const b = await t.player("Caver", { op: true, x: 0, z: 100, gameMode: "creative" });
  // The radar defaults OFF: opt both viewers in AFTER spawn (realm:cfg_set + ACK); terrain colors and north up, the new defaults.
  for (const who of [a, b]) {
    for (const [key, value] of [["radar", true], ["terrain", true], ["radarNorthUp", true]]) {
      const id = `flight_${who.id}_${key}`;
      let ack;
      const sub = sys.afterEvents.scriptEventReceive.subscribe(({ id: eid, message }) => {
        if (eid !== "realm:cfg_ack") return;
        try {
          const m = JSON.parse(message);
          if (m.id === id) ack = m;
        } catch {}
      }, { namespaces: ["realm"] });
      sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id, pack: "map_bp", key, value, player: who.id }));
      await t.waitUntil(() => ack, { timeout: 100, message: `cfg_ack for ${key}` });
      sys.afterEvents.scriptEventReceive.unsubscribe(sub);
      t.check(ack.ok === true, `${who.name} ${key} = ${value} acknowledged`);
    }
  }
  await t.loadArea(0, 100, { radius: 4 }); // Keep the entire stationary radar loaded after the flier leaves.
  await t.wait(60);

  // Roof over Caver, high enough to count as roofed terrain.
  await t.server("/fill -8 -45 92 8 -45 108 stone");
  await t.wait(60);
  await radarOf(b);
  // Native OW roof = SURFACE intent: the roofed viewer shares the surface store and its upper roof column is a valid sample.
  const roofRead = await rawOf(b, [[1, 101], [-7, 93]], "the roof over Caver");
  t.check(roofRead.store.endsWith("|surface") && roofRead.samples.every((s) => s.kind === "stone" && s.y === -45), `the roofed player reads the shared surface store with a valid upper roof (${roofRead.store}, ${roofRead.samples.map((s) => `${s.kind}@${s.y}`).join(",")})`);

  // Flier flies east over ground that changes: a sand band is built ahead once they are on the way.
  let unknownWorst = 0;
  for (let x = 0; x <= 30; x += 3) {
    a.teleport({ x, y: -60, z: 0 });
    await t.wait(1);
  }
  await t.server("/tickingarea add 60 -61 -20 100 -61 20 sandarea");
  await t.wait(40);
  await t.server("/fill 60 -61 -20 100 -61 20 sand");
  for (let x = 33; x <= 75; x += 3) {
    a.teleport({ x, y: -60, z: 0 });
    await t.wait(1);
    unknownWorst = Math.max(unknownWorst, count(await radarOf(a), EMPTY));
  }
  await t.wait(6);
  const ra = await radarOf(a);
  t.log(`flier radar: ${count(ra, EMPTY)} unknown; worst unknown while flying ${unknownWorst} of 797`);
  const hist = {};
  for (const c of ra) hist[(c.codePointAt(0) - 0xf300).toString(16)] = (hist[(c.codePointAt(0) - 0xf300).toString(16)] ?? 0) + 1;
  t.log(`glyph histogram ${JSON.stringify(hist)} pos ${JSON.stringify(a.location)}`);
  // Six distinct canonical anchors under and around the flier (6 blocks apart, so always different columns), read 4 + 2 raw (4 a request).
  const probes = [[-6, 0], [0, 0], [6, 0], [12, 0], [0, 6], [0, -6]];
  const at75 = a.location;
  const probeAnchors = probes.map(([dx, dz]) => [sc(at75.x + dx), sc(at75.z + dz)]);
  t.check(new Set(probeAnchors.map((q) => q.join(","))).size === 6 && probeAnchors.every(([x, z]) => Math.abs(x) % 2 === 1 && Math.abs(z) % 2 === 1), "the six probes are distinct odd canonical anchors");
  const probeKinds = [
    ...(await rawOf(a, probes.slice(0, 4).map(([dx, dz]) => [at75.x + dx, at75.z + dz]), "sand probes 1-4")).samples,
    ...(await rawOf(a, probes.slice(4).map(([dx, dz]) => [at75.x + dx, at75.z + dz]), "sand probes 5-6")).samples,
  ].map((s) => `${s.kind}@${s.y}`);
  const sandRead = await radarOf(a);
  const unknownNow = count(sandRead, EMPTY);
  t.check(probeKinds.every((k) => k === "sand@-61"), `the sand built ahead is sampled under the flier a few ticks after arriving (all 6 probes sand at y -61: ${probeKinds.join(",")})`);
  t.check(797 - unknownNow >= 797 - 270, `genuine coverage under the flier: at least ${797 - 270} of 797 cells known (${797 - unknownNow}; the old bar was 150 of 441 unknown, the same share)`);
  t.check(unknownWorst <= 270, `few unknown cells while flying fast (${unknownWorst} of 797 at worst; the old bar was 150 of 441, the same share)`);
  t.check(String(last[a.id].terrain?.store).endsWith("|surface"), `the roofed player's cave layer never becomes the flier's store (${last[a.id].terrain?.store})`);
  await radarOf(b);
  const farRead = await rawOf(b, [[1, 101], [-7, 93]], "the roof over Caver again");
  t.check(farRead.store.endsWith("|surface") && farRead.samples.every((s) => s.kind === "stone" && s.y === -45), "the flier's sand is not drawn for the player far away under the roof; its own roof stays the valid upper sample");

  // Reach the real cache cap through native flight, then stop beneath a roof: detail must not churn forever. How long
  // that takes depends on the scanner's reading budget and the machine (about 2200 ticks at budgetLevel high), so the
  // flight goes on until the store is full, looked at every 200 ticks, for at most 6600 ticks.
  let area;
  for (let i = 0; i < 6600; i++) {
    if (i >= 2000 && i % 200 === 0) {
      await radarOf(a);
      if (last[a.id].terrain.surface.columns >= 6000) break;
    }
    const x = 0.1 + (i + 1) * 3.2;
    if (i % 10 === 0) {
      const next = await t.loadArea(x, 300, { radius: 4 });
      if (area) await t.server(`/tickingarea remove ${area}`);
      area = next.name;
    }
    a.teleport({ x, y: 128, z: 300 }, { rotation: { x: 0, y: 270 } });
    await t.wait(1);
  }
  await radarOf(a);
  t.log(`native saturated surface ${JSON.stringify(last[a.id].terrain.surface)}`);
  // There is no fine 1-block working set any more: the cap is the 6000 canonical 2-block columns.
  t.check(last[a.id].terrain.surface.columns === 6000, `native flight saturates the 6000 canonical column cap (${last[a.id].terrain.surface.columns})`);
  const x = Math.floor(a.location.x);
  await t.server(`/fill ${x - 8} 63 292 ${x + 8} 63 308 stone`);
  await t.server(`/fill ${x - 8} 80 292 ${x + 8} 80 308 stone`);
  a.teleport({ x: x + 0.1, y: 64, z: 300 }, { rotation: { x: 0, y: 270 } });
  await t.wait(130); // The existing surface sample refreshes within100 ticks after a command-built roof.
  await radarOf(a);
  // Native OW roof = surface intent: roof 80 over player 64 is read as the surface roof (y 80), not a private layer.
  const capRoof = await rawOf(a, [[x + 1, 301]], "the saturated roof over the stopped flier");
  t.check(capRoof.store.endsWith("|surface") && capRoof.samples[0].kind === "stone" && capRoof.samples[0].y === 80, `saturated native cache keeps the roof 80 over player 64 as the valid surface sample (${capRoof.store}, ${capRoof.samples[0].kind}@${capRoof.samples[0].y})`);
  await radarOf(b);
  t.log(`stationary native misses: flier=${last[a.id].terrain.misses}, caver=${last[b.id].terrain.misses}`);
  t.check(last[a.id].terrain.misses === 0 && last[b.id].terrain.misses === 0, "stationary cost excludes legitimate unloaded-chunk retries");
  // The 2200-tick flight plus setup crosses the other viewer's intentional 2400-tick freshness boundary.
  // Observe that age refresh explicitly before measuring idle eviction churn; keep both viewers scanning.
  // How long the flight takes in ticks depends on t.loadArea (since F73 it waits for the whole area and 20 ticks
  // more, 220 times here), so a flight that ran past the boundary has seen one refresh already: wait for the
  // next cohort to come of age (at most one more 2400-tick period) instead of assuming where the flight ended.
  const aged = () => last[b.id].terrain.samples.filter((s) => s.data && sys.currentTick - s.data.tick >= 2300);
  for (let i = 0; i < 520 && !aged().length; i++) {
    await t.wait(5);
    await radarOf(b);
  }
  const expiring = aged();
  t.log(`Caver coarse sample ages before idle: ${last[b.id].terrain.samples.map((s) => s.data ? sys.currentTick - s.data.tick : "missing").join(",")}`);
  t.check(expiring.length > 0, "long flight reaches the stationary caver's existing age-refresh cohort");
  const refreshed = () => expiring.every((old) => last[b.id].terrain.samples.some((s) => s.x === old.x && s.z === old.z && s.data?.tick > old.data.tick));
  // map_bp reads a column again once it is older than SCAN_MAX_AGE (2400 ticks), found by the stale scan whose key
  // changes every STALE_EVERY (200) ticks: from age 2300 that is at most 100 + 200 ticks, plus a scan. A fixed 48 polls
  // (about 290 ticks) only held while the cohort was first seen past 2300; now it is seen at 2300 itself.
  const refreshBy = sys.currentTick + (2400 - 2300) + 200 + 40;
  while (sys.currentTick < refreshBy && !refreshed()) {
    await t.wait(5);
    await radarOf(b);
  }
  t.check(refreshed(), "old coarse samples actually refresh before the steady idle window");
  await t.wait(12);
  await radarOf(b);
  t.log(`Caver coarse sample ages after refresh: ${last[b.id].terrain.samples.map((s) => s.data ? sys.currentTick - s.data.tick : "missing").join(",")}`);
  sys.sendScriptEvent("realm:map_debug", JSON.stringify({ player: a.id, action: "cost" }));
  await t.wait(2);
  await t.wait(50);
  await radarOf(a);
  const cost = last[a.id].cost;
  t.log(`saturated stop: ${cost.scanReads} real reads/${cost.scanTicks} ticks, scanner ${cost.scanMs}ms (${(cost.scanMs / Math.max(1, cost.scanTicks)).toFixed(3)}ms/tick), redraw ${cost.turnMs}ms/${cost.turnTicks}ticks, periodic ${cost.ms}ms; peak ${cost.scanPeak}`);
  t.check(cost.scanReads <= 4, "saturated stationary native viewers do not keep rereading their fine detail");
  // One shared 96-operation ledger of real native attempts across all viewers; the per-viewer 48 cap no longer exists.
  t.check(cost.scanPeak <= 96, `saturated native flight and roof stop stay inside the shared 96-operation ledger (peak ${cost.scanPeak})`);
}

// The Minimap at budgetLevel high (scenarios can't import: pasted where needed).
async function mapBudgetHigh(t) {
  let ack;
  const sub = t.system.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:cfg_ack") return;
      try {
        const m = JSON.parse(message);
        if (m.id === "mapbudget") ack = m;
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "mapbudget", pack: "map_bp", key: "budgetLevel", value: "high" }));
  await t.waitUntil(() => ack, { timeout: 60, message: "budgetLevel high was set" });
  t.system.afterEvents.scriptEventReceive.unsubscribe(sub);
  t.assert(ack.ok, `budgetLevel high: ${ack.error ?? "ok"}`);
}
