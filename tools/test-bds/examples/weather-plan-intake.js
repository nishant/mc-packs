// A weather pack added in the middle of a storm learns it from the Weather Almanac (O57): Rain Extras, Storm Chasing,
// Regional Weather, Tornadoes, Night and Moon ask `realm:weather_ask` once the world has loaded (the Almanac answers all
// of them with one `realm:weather_plan`) and take `now` from the plan until a real weatherChange has come in.
// Phase 1: a 30-minute thunderstorm; every pack saves it from the weatherChange; the saved weather is then cleared,
// which is what a pack that was not installed (or had its data forgotten) looks like. Phase 2: after the restart the
// storm is still on and the packs know nothing: the plan names it (the probe counts the weatherChange events it saw, so
// a pack that learned it before any change learned it from the plan). A plan sent after a real change is not believed.
// Without weather_bp the packs have the saved weather and the next change, and nothing waits for the Almanac.
// The packs share one add-on in the test bundle, so its probe reads their saved weather.
//   mkdir -p /tmp/wpi && node tools/test-bds/hooks/events-bundle.mjs /tmp/wpi weather_bp,rain_bp,storm_bp,climate_bp,tornado_bp,night_bp,moon_bp
//   node tools/test-bds/run.mjs --quiet --packs /tmp/wpi --scenario tools/test-bds/examples/weather-plan-intake.js --timeout 900
// Without the Almanac (build the bundle without weather_bp, run the same command): the six packs, no answer to their ask.
//   node tools/test-bds/hooks/events-bundle.mjs /tmp/wpi rain_bp,storm_bp,climate_bp,tornado_bp,night_bp,moon_bp
export default async function (t) {
  const KEYS = ["rain", "storm", "climate", "tornado", "night", "moon"].map((p) => `${p}:weather`);
  /** @type {{ tick: number, id: string, m: any }[]} */
  const events = [];
  t.system.afterEvents.scriptEventReceive.subscribe(
    (/** @type {any} */ { id, message }) => {
      try {
        events.push({ tick: t.tick, id, m: JSON.parse(message || "null") });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (/** @type {string} */ id, from = 0) => events.filter((e) => e.id === id && e.tick >= from);
  /** The six packs' saved weather and how many weatherChange events the bundle has seen. */
  const read = async (/** @type {object} */ extra = {}) => {
    const at = events.length;
    t.system.sendScriptEvent("realm:probe_prop", JSON.stringify({ get: KEYS, ...extra }));
    await t.waitUntil(() => events.slice(at).some((e) => e.id === "realm:probe_props"), { timeout: 40, message: "probe_props" });
    return /** @type {{ values: Record<string, string | null>, weatherChanges: number }} */ (events.slice(at).find((e) => e.id === "realm:probe_props")?.m);
  };
  const allAre = (/** @type {Record<string, string | null>} */ v, /** @type {string | null} */ want) => KEYS.every((k) => v[k] === want);
  /** waitUntil for an async condition: polls every `interval` ticks. */
  const eventually = async (/** @type {() => Promise<boolean>} */ cond, /** @type {{ timeout: number, interval: number, message: string }} */ { timeout, interval, message }) => {
    const end = t.tick + timeout;
    while (!(await cond())) {
      t.assert(t.tick < end, `timed out: ${message}`);
      await t.wait(interval);
    }
  };
  const p = await t.player("Sky", { op: true });
  // Which packs this run has: every pack answers the diagnostics ping (nothing here touches the weather).
  const first = events.length;
  t.system.sendScriptEvent("realm:diag_ping", JSON.stringify({ id: "who" }));
  await t.wait(40);
  const almanac = events.slice(first).some((e) => e.id === "realm:diag_pong" && e.m?.id === "who" && e.m.pack === "weather_bp");
  t.log(`the Almanac is ${almanac ? "in" : "not in"} this run (phase ${t.phase})`);

  if (t.phase === 1) {
    if (almanac) t.assert(t.cmd(p, "/realm:weather_set thunder 30").ok, "/realm:weather_set thunder 30 ran");
    else t.server("/weather thunder 1000000");
    await eventually(async () => allAre((await read()).values, "Thunder"), { timeout: 300, interval: 20, message: "every weather pack saves the thunderstorm from the weatherChange" });
    t.assert(allAre((await read({ clear: KEYS })).values, "Thunder"), "(read just before clearing)");
    t.assert(allAre((await read()).values, null), "the saved weather is cleared: the packs know nothing of the storm that is still on");
    t.restart("storm on, packs without a saved weather");
  }

  // ---- Phase 2: the storm is on and nobody knows ----
  const begin = t.tick;
  let now = await read();
  t.log(`right after the restart: ${JSON.stringify(now)}`);
  if (almanac) {
    // The packs ask 100 ticks after the world has loaded and the Almanac answers once: all six take the storm from it.
    await eventually(async () => allAre((now = await read()).values, "Thunder"), { timeout: 400, interval: 20, message: "the plan names the storm to every pack" });
    t.log(`learned after ${t.tick - begin} ticks, ${now.weatherChanges} weatherChange events seen: ${JSON.stringify(now.values)}`);
    if (now.weatherChanges === 0) t.log("no weatherChange came in before they knew: they learned the storm from the plan");
    else t.log("the Almanac re-applied the weather on load, so a weatherChange may have taught them first; tools/weather-plan-intake.test.mjs covers the plan path alone");
    const plans = of("realm:weather_plan");
    t.log(`asks seen by the scenario: ${of("realm:weather_ask").length}; plan broadcasts: ${plans.length}`);
    t.check(plans.length <= 4, `the Almanac does not answer every pack's ask on its own (${plans.length} plan broadcasts in this window)`);
  } else {
    await t.wait(260);
    now = await read();
    t.log(`no Almanac, 260 ticks on: ${JSON.stringify(now)}`);
    t.check(allAre(now.values, null), "without an answer they have nothing of their own to go on yet, and nothing is waiting for one");
  }

  // ---- A real weatherChange wins over any later plan, and the native fallback works with or without the Almanac ----
  t.server("/weather clear");
  await eventually(async () => allAre((await read()).values, "Clear"), { timeout: 160, interval: 10, message: "every pack follows the weatherChange to clear" });
  t.system.sendScriptEvent("realm:weather_plan", JSON.stringify({ now: "Thunder", until: Date.now() + 600000, next: [] }));
  await t.wait(10);
  now = await read();
  t.check(allAre(now.values, "Clear"), `a plan after a real change is not believed (${JSON.stringify(now.values)})`);
}
