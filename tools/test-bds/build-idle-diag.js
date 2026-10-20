// O10: 40 idle players with empty hands, using the production diagnostics window, not the injected harness profiler.
// This measures the idle preview floor only, not active construction, client rendering or whole-bundle CPU.
// node tools/test-bds/run.mjs --quiet --flat --only build_bp,build_rp --scenario tools/test-bds/build-idle-diag.js --timeout 600
export default async function (t) {
  const declared = 40;
  const ticks = 1200;
  const players = [];
  const cleared = new Set();
  const clearOwned = () => {
    const raw = t.world.getDynamicProperty("harness:tickingAreas");
    const areas = raw === undefined ? [] : JSON.parse(raw);
    t.assert(Array.isArray(areas), "the fixture loader ledger is an array");
    for (const area of areas) {
      const key = `${area.dimension}|${area.name}`;
      if (cleared.has(key)) continue;
      t.assert(/^harness_\d+_\d+$/.test(area.name) && ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"].includes(area.dimension), "only owned fixture loaders are removed");
      const result = t.world.getDimension(area.dimension).runCommand(`tickingarea remove "${area.name}"`);
      t.assert(result.successCount > 0, `removed ${area.name}`);
      cleared.add(key);
    }
  };
  for (let i = 0; i < declared; i++) {
    clearOwned();
    const p = await t.player(`BuildIdle${String(i + 1).padStart(2, "0")}`, { x: (i % 8) * 2, z: Math.floor(i / 8) * 2, settle: 2 });
    p.getComponent("minecraft:inventory").container.clearAll();
    players.push(p);
  }
  clearOwned();
  await t.loadArea(8, 4, { radius: 2 });
  await t.wait(40);
  t.assert(players.length === declared && players.every((p) => p.isValid), "all 40 idle players spawned and stayed");
  const replies = [];
  const id = `build-idle:${t.tick}`;
  const listener = t.system.afterEvents.scriptEventReceive.subscribe(({ id: event, message }) => {
    if (event !== "realm:diag_pong") return;
    const reply = JSON.parse(message);
    if (reply.id === id && reply.pack === "build_bp") replies.push(reply);
  }, { namespaces: ["realm"] });
  const startTick = t.tick;
  let minValid = declared;
  t.system.sendScriptEvent("realm:diag_ping", JSON.stringify({ id, ticks }));
  for (let i = 0; i < ticks / 20; i++) {
    await t.wait(20);
    minValid = Math.min(minValid, players.filter((p) => p.isValid).length);
    t.assert(minValid === declared, "all 40 players remain during the complete idle window");
  }
  const reply = await t.waitUntil(() => replies[0], { timeout: 80, message: "production Build diagnostics after the full window" });
  t.system.afterEvents.scriptEventReceive.unsubscribe(listener);
  t.assert(reply.ticks >= ticks && Number.isFinite(reply.ms) && reply.calls > 0, "the production diagnostic reports a full counted window");
  t.assert(players.every((p) => p.isValid), "all 40 players remain at the diagnostic reply");
  const msPerTick = reply.ms / reply.ticks;
  t.report("build-idle-workload", {
    declared, spawned: players.length, minValid, startTick, endTick: t.tick,
    diagnosticTicks: reply.ticks, milliseconds: reply.ms, calls: reply.calls, msPerTick, top: reply.top,
    injectedHarnessProfiler: false, productionDiagnostics: true, activePreview: false,
  });
  t.check(msPerTick <= 0.15, `Build's idle preview floor stays within 0.15 ms/tick (${msPerTick})`);
}
