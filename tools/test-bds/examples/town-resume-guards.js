// Town Projects, a half-done automatic build resumed after a restart keeps its guards (F37 review): Oakfield's well
// stops after 30 block changes (realm:town_test build_pause), a dirt block is put on its spot and marked as placed
// (realm:blocks_placed), the server restarts, and Ann stands on the spot. The resumed build waits ("Step off the
// spot") while she is there, finishes once she steps off, and leaves the marked dirt where it was.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp --scenario tools/test-bds/examples/town-resume-guards.js --timeout 4000
export default async function (t) {
  const dim = t.dimension;
  const G = -61;
  const p = await t.player("Ann", { op: true, x: 0, z: 0, gameMode: "creative" });
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "nolife", pack: "town_bp", key: "townLife", value: false }));
  const town = (action, extra = {}) => t.system.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", ...extra }));
  const dump = async () => {
    const since = t.tick;
    town("dump", { town: "oakfield" });
    return JSON.parse((await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 })).plain);
  };
  const built = async () => (await dump()).progress.find(([x]) => x === "well")[1].built === 1;
  if (t.phase === 1) {
    await t.loadArea(0, 0, { radius: 4 });
    // A gentle slope, so the well's spot is leveled.
    for (let x = -50; x <= 50; x += 3) {
      const h = Math.floor((x + 50) / 6) - 8;
      if (h > 0) t.server(`/fill ${x} ${G + 1} -50 ${x + 2} ${G + h} 50 dirt`);
      else if (h < 0) t.server(`/fill ${x} ${G + h + 1} -50 ${x + 2} ${G} 50 air`);
      t.server(`/fill ${x} ${G + h} -50 ${x + 2} ${G + h} 50 grass_block`);
    }
    await t.wait(20);
    p.teleport({ x: 0.5, y: G + 2, z: 0.5 });
    await t.wait(10);
    const since = t.tick;
    town("add", { name: "Oakfield" });
    await t.waitMessage(p, /Town Oakfield added/, { since, timeout: 60 });
    await t.waitUntil(async () => (await dump()).town.spots.well, { timeout: 2400, interval: 100, message: "the well's spot" });
    town("build_pause", { after: 30, town: "oakfield" });
    town("finish", { project: "well", town: "oakfield" });
    await t.waitUntil(async () => (await dump()).town.spots.well.bs === 1 && !(await dump()).building, { timeout: 1200, interval: 40, message: "paused with bs" });
    const s = (await dump()).town.spots.well;
    // A player's dirt on the spot, after the check: marked like a placed block.
    t.server(`/setblock ${s.x} ${s.y} ${s.z} dirt`);
    t.system.sendScriptEvent("realm:blocks_placed", JSON.stringify({ dim: "minecraft:overworld", box: [s.x, s.y, s.z, s.x, s.y, s.z] }));
    await t.wait(260); // the coalesced save of the placed cells
    t.world.setDynamicProperty("harness:spot", JSON.stringify(s));
    t.restart("restarting mid-build");
  }
  const s = JSON.parse(String(t.world.getDynamicProperty("harness:spot")));
  await t.loadArea(0, 0, { radius: 4 });
  // Ann on the spot: the resumed build waits for her.
  p.teleport({ x: s.x + 0.5, y: s.y + 1, z: s.z + 0.5 });
  const since = t.tick;
  await t.waitMessage(p, /Step off the spot/, { since, timeout: 600 });
  await t.wait(100);
  t.check(!(await built()), "nothing goes up while she stands on the spot");
  // Off the spot, still in the town: it finishes, around the marked dirt.
  p.teleport({ x: 0.5 - s.x, y: G + 12, z: 0.5 - s.z }); // the far side of the center
  await t.waitUntil(() => built(), { timeout: 1200, interval: 40, message: "the well resumed and finished" });
  t.check(dim.getBlock({ x: s.x, y: s.y, z: s.z })?.typeId === "minecraft:dirt", "the dirt a player placed after the check stays");
  t.check(!(await dump()).town.spots.well.bs, "bs cleared");
}
