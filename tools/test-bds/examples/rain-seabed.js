// Rain Extras: a player in water over a sandy bottom (a sea, a river, a pool) gets the storm fog in a thunderstorm,
// like anyone outdoors; one standing on dry sand (a desert) doesn't. getTopmostBlock skips water, so before the fix
// the sand under the water counted as desert. Needs a copy of rain_bp with a test hook (/fog isn't relayed):
//   mkdir -p /tmp/rn && rm -rf /tmp/rn/rain_bp && cp -r packs/rain_bp /tmp/rn/
//   cat >> /tmp/rn/rain_bp/scripts/main.js <<'HOOK'
//   const __fogs = new Map();
//   const __run = Player.prototype.runCommand;
//   Player.prototype.runCommand = function (cmd) {
//     if (/^fog @s push realm:rain_storm/.test(cmd)) __fogs.set(this.name, (__fogs.get(this.name) ?? 0) + 1);
//     return __run.call(this, cmd);
//   };
//   system.afterEvents.scriptEventReceive.subscribe(({ id }) => {
//     if (id === "rntest:fogs") system.sendScriptEvent("rntest:fogs_r", JSON.stringify(Object.fromEntries(__fogs)));
//   }, { namespaces: ["rntest"] });
//   HOOK
//   node tools/test-bds/run.mjs --quiet --packs /tmp/rn --scenario tools/test-bds/examples/rain-seabed.js --timeout 400
export default async function (t) {
  const sys = t.mc.system;
  let fogs;
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "rntest:fogs_r") fogs = JSON.parse(message);
  }, { namespaces: ["rntest"] });
  const sp = t.world.getDefaultSpawnLocation();
  const dim = t.dimension;
  const swimmer = await t.player("Swimmer", { x: sp.x + 20, z: sp.z });
  const walker = await t.player("Walker", { x: sp.x - 20, z: sp.z });
  // A pool 5 x 5, 3 deep, with a sand bottom, around the swimmer; a patch of sand under the walker.
  const s = { x: Math.floor(swimmer.location.x), y: Math.floor(swimmer.location.y), z: Math.floor(swimmer.location.z) };
  for (let dx = -3; dx <= 3; dx++)
    for (let dz = -3; dz <= 3; dz++)
      for (let dy = -4; dy <= 2; dy++) {
        const edge = Math.abs(dx) === 3 || Math.abs(dz) === 3;
        const type = dy === -4 ? "minecraft:sand" : dy >= 0 ? "minecraft:air" : edge ? "minecraft:stone" : "minecraft:water";
        dim.getBlock({ x: s.x + dx, y: s.y + dy, z: s.z + dz })?.setType(type);
      }
  swimmer.teleport({ x: s.x + 0.5, y: s.y - 2, z: s.z + 0.5 });
  const w = { x: Math.floor(walker.location.x), y: Math.floor(walker.location.y), z: Math.floor(walker.location.z) };
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) dim.getBlock({ x: w.x + dx, y: w.y - 1, z: w.z + dz })?.setType("minecraft:sand");
  await t.wait(10);
  t.log(`swimmer in water: ${swimmer.isInWater}, top under them: ${dim.getTopmostBlock({ x: s.x, z: s.z })?.typeId}`);
  t.server("/weather thunder");
  await t.seconds(20); // the storm fog's first step comes at once, the last after 12 s
  fogs = undefined;
  await t.console("scriptevent rntest:fogs {}");
  await t.waitUntil(() => fogs, { timeout: 60, message: "the hook answered" });
  t.log(JSON.stringify(fogs));
  t.check((fogs.Swimmer ?? 0) > 0, `the swimmer over a sandy bottom gets the storm fog (${fogs.Swimmer ?? 0} pushes)`);
  t.check((fogs.Walker ?? 0) === 0, `the walker on dry sand doesn't (${fogs.Walker ?? 0} pushes)`);
}
