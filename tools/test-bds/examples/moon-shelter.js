// F5/F35 native: during a Blood Moon, a shelter that appears without a player placing a block (Easy Building places
// through script, so do structures, /fill and pistons) is protected at once: no Blood Moon monster appears on it or
// next to it. The first minute of waves around the player warms whatever the pack remembers about the area; then
// /fill turns the whole ground of the spawn ring (16 to 32 blocks out) into oak planks, and for the next minute and a
// half every spot the waves try is next to player-made blocks. Fails before the fix (the per-cell "clear" cache,
// forgotten only on playerPlaceBlock, let waves spawn on the planks), passes after (each spot's 9 x 9 x 9 box is read
// when it is tried). With --profile it is also the measurement of the built check's cost during waves every 5 seconds.
//   node tools/test-bds/run.mjs --quiet --flat --only moon_bp --scenario tools/test-bds/examples/moon-shelter.js --timeout 900
export default async function (t) {
  const ann = await t.player("Ann", { op: true });
  const acks = new Set();
  t.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "realm:cfg_ack") acks.add(JSON.parse(message).id);
  }, { namespaces: ["realm"] });
  const cfg = { bloodChance: 0, harvestChance: 0, avoidSpawn: 0, "blood.spawnSeconds": 5, "blood.maxExtraPerPlayer": 24, "blood.maxExtraWorld": 0 };
  for (const [key, value] of Object.entries(cfg)) {
    t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: key, pack: "moon_bp", key, value }));
    await t.waitUntil(() => acks.has(key), { timeout: 40, message: `cfg ${key}` });
  }
  t.server("/difficulty normal");
  t.server("/gamerule domobspawning true");
  t.server("/gamemode survival Ann");
  t.server("/effect Ann resistance 600 255 true");
  const home = { x: 400, z: 400 };
  t.server(`/tp Ann ${home.x} -60 ${home.z}`);
  t.server(`/tickingarea add circle ${home.x} -60 ${home.z} 4 moon_shelter`);
  await t.seconds(3);
  const ground = Math.floor(ann.location.y) - 1;
  t.log(`Ann stands on y ${ground} at ${home.x}, ${home.z}`);
  t.server("/time set 13000");
  await t.seconds(2);
  let since = t.tick;
  t.assert(t.cmd(ann, "/realm:moon_set blood").ok, "moon_set blood ran");
  await t.waitMessage(ann, /Blood Moon rises/, { since, timeout: 100 });

  const dim = ann.dimension;
  const mobs = () => dim.getEntities({ tags: ["realm:moon_mob"] });
  /** Monsters seen each second, then cleared, so the per-player cap never stops a wave. Ann is put back on her spot
   * each second: monsters knock a simulated player around, and waves spawn up to 32 blocks from where she stands. */
  const sweep = (seen) => {
    t.server(`/tp Ann ${home.x} -60 ${home.z}`);
    for (const m of mobs()) {
      try {
        seen.push({ x: Math.floor(m.location.x), y: Math.floor(m.location.y), z: Math.floor(m.location.z) });
        m.remove();
      } catch {
        // gone
      }
    }
  };
  // Keep it night for the whole test.
  const before = [];
  for (let s = 0; s < 60; s++) {
    await t.seconds(1);
    sweep(before);
    if (s % 20 === 0) t.server("/time set 13000");
  }
  t.log(`waves before the shelter: ${before.length} monsters`);
  t.check(before.length >= 6, `Blood Moon waves spawn on open ground (${before.length} in 60 s)`);

  // The shelter appears by command: no playerPlaceBlock event. The ground of the whole ring becomes planks.
  const r = 36;
  t.log(`Ann is at ${Math.floor(ann.location.x)}, ${Math.floor(ann.location.z)} when the shelter appears`);
  t.server(`/fill ${home.x - r} ${ground} ${home.z - r} ${home.x + r} ${ground} ${home.z + r} oak_planks`);
  await t.seconds(1);
  sweep([]);
  const after = [];
  for (let s = 0; s < 90; s++) {
    await t.seconds(1);
    sweep(after);
    if (s % 20 === 0) t.server("/time set 13000");
  }
  t.log(`waves after the shelter: ${after.length} monsters${after.length ? ` at ${after.slice(0, 5).map((p) => `${p.x},${p.y},${p.z}`).join(" ")}` : ""}`);
  t.check(after.length === 0, `no Blood Moon monster appears on or next to the new shelter (${after.length} did)`);
  t.server("/tickingarea remove moon_shelter");
}
