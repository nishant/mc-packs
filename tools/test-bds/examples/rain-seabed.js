// Rain Extras: a player in water over a sandy bottom (a sea, a river, a pool) gets the storm fog in a thunderstorm,
// like anyone outdoors; one standing on dry sand (a desert) doesn't. getTopmostBlock skips water, so before the fix
// the sand under the water counted as desert. The storm only starts once Rain's own lookup (the hook runs its topmost()
// and dryGround()) has called the pool's sand a seabed and the walker's sand dry ground for a full update: the first
// native runs measured the walker 20 ticks after building his sand and saw one push. Needs a copy of rain_bp with a
// test hook (/fog isn't relayed; the hook also keeps what Rain read at each storm fog push):
//   mkdir -p /tmp/rn && rm -rf /tmp/rn/rain_bp && cp -r packs/rain_bp /tmp/rn/
//   cat >> /tmp/rn/rain_bp/scripts/main.js <<'HOOK'
//   const __fogs = new Map(), __trail = [];
//   const __look = (p) => {
//     try {
//       const f = p.location, here = topmost(p.dimension, f.x, f.z, { lookups: 1 });
//       return here ? { here: here.typeId, y: here.location.y, feetY: f.y, dry: dryGround(here, f) } : { here: null, feetY: f.y };
//     } catch (e) { return { error: String(e) }; }
//   };
//   const __run = Player.prototype.runCommand;
//   Player.prototype.runCommand = function (cmd) {
//     if (/^fog @s push realm:rain_storm/.test(cmd)) {
//       __fogs.set(this.name, (__fogs.get(this.name) ?? 0) + 1);
//       if (__trail.length < 12) __trail.push({ tick: system.currentTick, name: this.name, ...__look(this) });
//     }
//     return __run.call(this, cmd);
//   };
//   system.afterEvents.scriptEventReceive.subscribe(({ id }) => {
//     if (id === "rntest:fogs") system.sendScriptEvent("rntest:fogs_r", JSON.stringify({ fogs: Object.fromEntries(__fogs), trail: __trail }));
//     if (id === "rntest:look") system.sendScriptEvent("rntest:look_r", JSON.stringify(Object.fromEntries(world.getAllPlayers().map((p) => [p.name, __look(p)]))));
//   }, { namespaces: ["rntest"] });
//   HOOK
//   node tools/test-bds/run.mjs --quiet --packs /tmp/rn --scenario tools/test-bds/examples/rain-seabed.js --timeout 400
export default async function (t) {
  const sys = t.mc.system;
  let fogs, looks;
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "rntest:fogs_r") fogs = JSON.parse(message);
    else if (id === "rntest:look_r") looks = JSON.parse(message);
  }, { namespaces: ["rntest"] });
  const sp = t.world.getDefaultSpawnLocation();
  const dim = t.dimension;
  const swimmer = await t.player("Swimmer", { x: sp.x + 20, z: sp.z });
  const walker = await t.player("Walker", { x: sp.x - 20, z: sp.z });
  const put = (x, y, z, type) => {
    const block = dim.getBlock({ x, y, z });
    if (!block) t.fail(`the fixture block ${x} ${y} ${z} (${type}) is not loaded`);
    block.setType(type);
  };
  // A pool 5 x 5, 3 deep, with a sand bottom, around the swimmer; a patch of sand under the walker.
  const s = { x: Math.floor(swimmer.location.x), y: Math.floor(swimmer.location.y), z: Math.floor(swimmer.location.z) };
  for (let dx = -3; dx <= 3; dx++)
    for (let dz = -3; dz <= 3; dz++)
      for (let dy = -4; dy <= 2; dy++) {
        const edge = Math.abs(dx) === 3 || Math.abs(dz) === 3;
        const type = dy === -4 ? "minecraft:sand" : dy >= 0 ? "minecraft:air" : edge ? "minecraft:stone" : "minecraft:water";
        put(s.x + dx, s.y + dy, s.z + dz, type);
      }
  swimmer.teleport({ x: s.x + 0.5, y: s.y - 2, z: s.z + 0.5 });
  const w = { x: Math.floor(walker.location.x), y: Math.floor(walker.location.y), z: Math.floor(walker.location.z) };
  // Sand with nothing on it, like a desert's: a plant left on the new sand would top the column until it pops off.
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) {
      put(w.x + dx, w.y - 1, w.z + dz, "minecraft:sand");
      for (let dy = 0; dy <= 3; dy++) put(w.x + dx, w.y + dy, w.z + dz, "minecraft:air");
    }

  // The storm starts when Rain's own lookup agrees with the fixture, and has for longer than one update of each player
  // (every 20 ticks): the swimmer's sand is a seabed (not dry, below his feet), the walker's sand is dry ground.
  const STEADY_TICKS = 25;
  const show = (v) => (!v ? "no answer" : v.error ? `error=${v.error}` : `here=${v.here ?? "none"} y=${v.y ?? "-"} feetY=${v.feetY} dry=${v.dry ?? "-"}`);
  const reads = (name) => {
    const p = name === "Swimmer" ? swimmer : walker;
    try {
      return dim.getTopmostBlock({ x: Math.floor(p.location.x), z: Math.floor(p.location.z) })?.typeId;
    } catch (e) {
      return `unreadable (${e})`;
    }
  };
  const ready = (v) => {
    const a = v?.Swimmer, b = v?.Walker;
    return !!a && !!b && /sand/.test(a.here ?? "") && a.dry === false && a.y < Math.floor(a.feetY) && /sand/.test(b.here ?? "") && b.dry === true;
  };
  let last, since;
  const settled = async () => {
    looks = undefined;
    sys.sendScriptEvent("rntest:look", "");
    last = await t.waitUntil(() => looks, { timeout: 20, message: "the hook answered rntest:look" });
    if (!ready(last)) return (since = undefined);
    since ??= t.tick;
    return t.tick - since >= STEADY_TICKS;
  };
  const begun = t.tick;
  try {
    await t.waitUntil(settled, { timeout: 300, interval: 5 });
  } catch {
    t.fail(
      `the fixture was not ready ${t.tick - begun} ticks after it was built (a seabed under the swimmer, dry sand under the walker): ` +
        ["Swimmer", "Walker"].map((n) => `${n}: Rain's own verdict ${show(last?.[n])}; the scenario reads ${reads(n)}`).join("; "),
    );
  }
  t.log(`fixture ready after ${t.tick - begun} ticks: Swimmer ${show(last.Swimmer)}; Walker ${show(last.Walker)}`);
  t.log(`swimmer in water: ${swimmer.isInWater}, top under them: ${dim.getTopmostBlock({ x: s.x, z: s.z })?.typeId}`);
  t.server("/weather thunder");
  await t.seconds(20); // the storm fog's first step comes at once, the last after 12 s
  fogs = undefined;
  await t.console("scriptevent rntest:fogs {}");
  await t.waitUntil(() => fogs, { timeout: 60, message: "the hook answered" });
  t.log(JSON.stringify(fogs.fogs));
  const pushes = (name) => fogs.fogs[name] ?? 0;
  const first = fogs.trail.find((p) => p.name === "Walker");
  t.check(pushes("Swimmer") > 0, `the swimmer over a sandy bottom gets the storm fog (${pushes("Swimmer")} pushes)`);
  t.check(pushes("Walker") === 0, `the walker on dry sand doesn't (${pushes("Walker")} pushes${first ? `; the first at tick ${first.tick}, when Rain read ${show(first)}` : ""})`);
}
