// Rain Extras: the game's rain is muffled under a roof only once the roof has been overhead for about 2 seconds, so
// walking under an awning, through a doorway or past a lamp's arm doesn't cut the rain and bring it back a second
// later. Needs a copy of rain_bp with a test hook (/stopsound isn't relayed):
//   mkdir -p /tmp/rr && rm -rf /tmp/rr/rain_bp && cp -r packs/rain_bp /tmp/rr/
//   cat >> /tmp/rr/rain_bp/scripts/main.js <<'HOOK'
//   const __stops = new Map();
//   const __run = Player.prototype.runCommand;
//   Player.prototype.runCommand = function (cmd) {
//     if (cmd === "stopsound @s ambient.weather.rain") __stops.set(this.name, (__stops.get(this.name) ?? 0) + 1);
//     return __run.call(this, cmd);
//   };
//   system.afterEvents.scriptEventReceive.subscribe(({ id }) => {
//     if (id === "rrtest:stops") system.sendScriptEvent("rrtest:stops_r", JSON.stringify(Object.fromEntries(__stops)));
//   }, { namespaces: ["rrtest"] });
//   HOOK
//   node tools/test-bds/run.mjs --quiet --packs /tmp/rr --scenario tools/test-bds/examples/rain-roof.js --timeout 400
export default async function (t) {
  const sys = t.mc.system;
  let stops;
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "rrtest:stops_r") stops = JSON.parse(message);
  }, { namespaces: ["rrtest"] });
  const count = async (name) => {
    stops = undefined;
    sys.sendScriptEvent("rrtest:stops", "{}");
    await t.waitUntil(() => stops, { timeout: 40, message: "the hook answered" });
    return stops[name] ?? 0;
  };
  const p = await t.player("Walker");
  const dim = t.dimension;
  const f = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
  const roof = (block) => dim.getBlock({ x: f.x, y: f.y + 3, z: f.z })?.setType(block);
  t.server("/weather rain 6000");
  await t.seconds(4);
  t.check((await count("Walker")) === 0, "outdoors in the rain: the game's rain plays");
  // A roof overhead for half a second (an awning walked under): the rain keeps playing.
  roof("minecraft:oak_planks");
  await t.wait(10);
  roof("minecraft:air");
  await t.seconds(3);
  t.check((await count("Walker")) === 0, "a moment under a roof doesn't cut the rain");
  // Under the roof for good: muffled within about 3 seconds.
  roof("minecraft:oak_planks");
  await t.seconds(4);
  const n = await count("Walker");
  t.check(n > 0, `under a roof: the game's rain is muffled (${n} stops)`);
  roof("minecraft:air");
  await t.seconds(2);
  const m = await count("Walker");
  await t.seconds(2);
  t.check((await count("Walker")) === m, "back outdoors: the rain plays again");
}
