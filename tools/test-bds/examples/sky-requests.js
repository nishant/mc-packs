// Story requests (realm:sky_request, as Story Questlines sends them) to the world-event packs: a meteor that breaks
// apart in the sky (breaking no blocks), tonight's Blood Moon, a planned thunderstorm in the almanac's forecast, a
// shooting star for a player and those near them, and a rainbow. Each pack ignores malformed requests, requests while
// its Story events setting is disabled, and requests inside its rate limit.
// node tools/test-bds/run.mjs --quiet --only meteor_bp,moon_bp,weather_bp,night_bp,rainbow_bp --scenario tools/test-bds/examples/sky-requests.js --timeout 900
export default async function (t) {
  const sky = [];
  const moons = [];
  const plans = [];
  const acks = new Set();
  t.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "realm:sky_event") sky.push({ tick: t.tick, ...JSON.parse(message) });
    else if (id === "realm:moon") moons.push({ tick: t.tick, ...JSON.parse(message) });
    else if (id === "realm:weather_plan") plans.push({ tick: t.tick, ...JSON.parse(message) });
    else if (id === "realm:cfg_ack") acks.add(JSON.parse(message).id);
  }, { namespaces: ["realm"] });
  let n = 0;
  const cfg = async (pack, key, value) => {
    const id = `c${n++}`;
    t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id, pack, key, value }));
    await t.waitUntil(() => acks.has(id), { timeout: 60, message: `cfg ${pack} ${key}` });
  };
  const ask = (req) => t.system.sendScriptEvent("realm:sky_request", typeof req === "string" ? req : JSON.stringify({ from: "saga_bp", reason: "test:ch1", ...req }));
  /** Nothing matching `pattern` arrives within `ticks`. */
  const quiet = async (p, pattern, ticks, what) => {
    const since = t.tick;
    await t.wait(ticks);
    const got = t.messages(p, { since }).filter((m) => pattern.test(m.plain));
    t.check(!got.length, `${what} (got: ${got.map((m) => m.plain).join(" | ")})`);
  };

  // No random events of their own during the test.
  await cfg("meteor_bp", "chance", 0);
  await cfg("meteor_bp", "warningSeconds", 10);
  await cfg("moon_bp", "bloodChance", 0);
  await cfg("moon_bp", "harvestChance", 0);
  await cfg("rainbow_bp", "chance", 0);
  t.server("/time set 1000");
  const p = await t.player("Ann", { op: true, gameMode: "creative" });
  await t.waitUntil(() => t.world.gameRules.doWeatherCycle === false, { timeout: 200, message: "the almanac runs the weather" });
  t.assert(t.cmd(p, "/realm:weather_set clear 60").ok, "clear skies for the test");
  await t.seconds(2);

  // ---- Meteor ----
  const mx = Math.floor(p.location.x) + 150, mz = Math.floor(p.location.z);
  const { top } = await t.loadArea(mx, mz, { radius: 1 });
  const before = top ? `${top.typeId}@${top.location.y}` : "none";
  ask('{"kind":"meteor","x":1');
  ask({ kind: "meteor", x: "1", z: 2 });
  ask({ kind: "meteor", x: mx, z: mz, dim: "minecraft:nether" });
  ask({ kind: "meteor", x: mx, z: mz, burst: "yes" });
  await quiet(p, /meteor/i, 40, "malformed meteor requests are ignored");
  await cfg("meteor_bp", "storyEvents", false);
  ask({ kind: "meteor", x: mx, z: mz, burst: true });
  await quiet(p, /meteor/i, 40, "no story meteor while Story events is disabled");
  await cfg("meteor_bp", "storyEvents", true);
  let since = t.tick;
  ask({ kind: "meteor", x: mx, z: mz, burst: true });
  t.log((await t.waitMessage(p, /meteor is streaking across the sky/, { since, timeout: 60 })).plain);
  const ev = await t.waitUntil(() => sky.find((e) => e.kind === "meteor" && e.tick >= since), { timeout: 20, message: "realm:sky_event meteor" });
  t.check(ev.x === mx && ev.z === mz, `the meteor aims at the requested spot (${ev.x}, ${ev.z})`);
  ask({ kind: "meteor", x: mx + 40, z: mz });
  await t.waitMessage(p, /broke apart high in the sky/, { since, timeout: 400 });
  t.check(t.messages(p, { since }).filter((m) => /meteor is (falling|streaking)/.test(m.plain)).length === 1, "a second request while one falls is ignored");
  await t.seconds(4);
  const after = t.dimension.getTopmostBlock({ x: mx, z: mz });
  const now = after ? `${after.typeId}@${after.location.y}` : "none";
  t.check(now === before, `the burst broke no blocks (top block ${before} -> ${now})`);
  since = t.tick;
  ask({ kind: "meteor", x: mx, z: mz + 30 });
  await quiet(p, /meteor is (falling|streaking)/, 40, "a second story meteor within 10 minutes is ignored");

  // ---- Weather Almanac ----
  const lastPlan = () => plans.at(-1);
  await cfg("weather_bp", "storyEvents", false);
  let pc = plans.length;
  ask({ kind: "thunder", minutes: 6, within: 8 });
  await t.wait(30);
  t.check(!plans.slice(pc).some((x) => x.next?.some((s) => s.weather === "Thunder" && s.at - Date.now() < 8 * 60000)), "no planned thunder while Story events is disabled");
  await cfg("weather_bp", "storyEvents", true);
  pc = plans.length;
  ask({ kind: "thunder", minutes: 500 });
  ask({ kind: "thunder", within: 0 });
  ask({ kind: "thunder", dim: "minecraft:the_end" });
  await t.wait(30);
  t.check(plans.length === pc, `malformed weather requests are ignored (${plans.length - pc} plans sent)`);
  const asked = Date.now();
  ask({ kind: "thunder", minutes: 6, within: 8 });
  await t.waitUntil(() => plans.length > pc, { timeout: 40, message: "the almanac replans after the thunder request" });
  const plan = lastPlan();
  const storm = plan.next.find((s) => s.weather === "Thunder");
  t.assert(storm, `the plan has a thunderstorm (${JSON.stringify(plan).slice(0, 200)})`);
  const startsIn = (storm.at - asked) / 60000;
  t.check(plan.now === "Clear" && startsIn > 0 && startsIn <= 8.05, `the thunderstorm starts within 8 minutes (in ${startsIn.toFixed(2)})`);
  const after1 = plan.next[plan.next.indexOf(storm) + 1];
  const len = after1 ? (after1.at - storm.at) / 60000 : NaN;
  t.check(Math.abs(len - 6) < 0.05, `it lasts 6 minutes (${len.toFixed(2)})`);
  t.log(`thunder planned in ${startsIn.toFixed(2)} min for ${len.toFixed(2)} min`);
  pc = plans.length;
  ask({ kind: "rain", minutes: 6, within: 8 });
  await t.wait(30);
  t.check(plans.length === pc, "a second weather request within 20 minutes is ignored");
  const formP = t.waitForm(p, { timeout: 100 });
  t.cmd(p, "/realm:weather_forecast");
  const form = await formP;
  t.check(/Thunderstorm in \d+ min/.test(form.body), `the forecast shows it (${form.body.split("\n")[0]})`);
  form.answer(0);

  // ---- Moon: requested in the day, rises at nightfall ----
  await cfg("moon_bp", "storyEvents", false);
  ask({ kind: "blood_moon" });
  await t.wait(20);
  await cfg("moon_bp", "storyEvents", true);
  ask({ kind: "harvest_moon", extra: 1, player: 5 }); // bad player field: ignored
  ask({ kind: "blood_moon" });
  ask({ kind: "harvest_moon" }); // tonight is already chosen
  await t.wait(20);
  since = t.tick;
  t.server("/time set 13000");
  const moon = await t.waitUntil(() => moons.find((m) => m.tick >= since && m.state !== "normal"), { timeout: 100, message: "realm:moon at nightfall" });
  t.check(moon.state === "blood", `tonight is a Blood Moon (${moon.state})`);
  await t.waitMessage(p, /Blood Moon rises/, { since, timeout: 60 });
  since = t.tick;
  ask({ kind: "harvest_moon" });
  await t.wait(40);
  t.check(!moons.some((m) => m.tick >= since && m.state === "harvest"), "a harvest moon request during a Blood Moon is ignored");

  // ---- Shooting star (night, clear sky) ----
  const bob = await t.player("Bob", { x: p.location.x + 20, z: p.location.z, gameMode: "creative" });
  const cy = await t.player("Cy", { x: p.location.x + 300, z: p.location.z, gameMode: "creative" });
  await cfg("night_bp", "storyEvents", false);
  ask({ kind: "shooting_star", player: p.id });
  ask({ kind: "shooting_star" });
  await t.wait(30);
  await cfg("night_bp", "storyEvents", true);
  since = t.tick;
  ask({ kind: "shooting_star", player: p.id });
  t.log((await t.waitMessage(p, /shooting star crosses the sky/, { since, timeout: 60 })).plain);
  await t.waitMessage(bob, /shooting star crosses the sky/, { since, timeout: 20 });
  await t.wait(20);
  const stars = (who) => t.messages(who, { since: since - 70 }).filter((m) => /shooting star/.test(m.plain)).length;
  t.check(stars(p) === 1, `one star for Ann (disabled and malformed requests ignored): ${stars(p)}`);
  t.check(stars(cy) === 0, "Cy, 300 blocks away, doesn't get it");
  ask({ kind: "shooting_star", player: p.id });
  await quiet(p, /shooting star/, 40, "a second star for Ann within a minute is ignored");

  // ---- Rainbow ----
  await cfg("rainbow_bp", "storyEvents", false);
  since = t.tick;
  ask({ kind: "rainbow", player: p.id });
  ask({ kind: "rainbow", player: "nobody" });
  await t.wait(30);
  t.check(!sky.some((e) => e.kind === "rainbow"), "no rainbow while Story events is disabled (or for an unknown player)");
  await cfg("rainbow_bp", "storyEvents", true);
  since = t.tick;
  ask({ kind: "rainbow", player: p.id });
  const rb = await t.waitUntil(() => sky.find((e) => e.kind === "rainbow" && e.tick >= since), { timeout: 40, message: "realm:sky_event rainbow" });
  t.log(`rainbow end at ${rb.x}, ${rb.z} (${Math.round(Math.hypot(rb.x - p.location.x, rb.z - p.location.z))} blocks from Ann)`);
  await t.waitMessage(p, /A rainbow!/, { since, timeout: 20 });
  ask({ kind: "rainbow", player: bob.id });
  await t.wait(30);
  t.check(sky.filter((e) => e.kind === "rainbow").length === 1, "a second rainbow while one is up is ignored");
}
