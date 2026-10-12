// Weather Almanac: the almanac takes over the weather (doWeatherCycle off), /realm:weather_set starts a spell
// now, a vanilla /weather change is put back within a second or two, the forecast form and realm:weather_plan
// describe the spell, and the plan carries on after a restart with the same spell.
// node tools/test-bds/run.mjs --quiet --only weather_bp --scenario tools/test-bds/examples/weather-almanac.js --timeout 300
export default async function (t) {
  const plans = [];
  t.system.afterEvents.scriptEventReceive.subscribe((e) => {
    if (e.id === "realm:weather_plan") plans.push(JSON.parse(e.message));
  }, { namespaces: ["realm"] });
  const p = await t.player("Sky", { op: true });
  if (t.phase === 1) {
    await t.waitUntil(() => t.world.gameRules.doWeatherCycle === false, { timeout: 200, message: "the almanac turns doWeatherCycle off" });

    // The weatherChange event is what every weather pack listens to: record what it reports.
    const changes = [];
    t.world.afterEvents.weatherChange.subscribe((e) => changes.push({ tick: t.tick, dim: e.dimension, to: e.newWeather }));

    plans.length = 0;
    t.assert(t.cmd(p, "/realm:weather_set thunder 7").ok, "/realm:weather_set thunder 7 ran");
    await t.waitUntil(() => changes.some((c) => c.to === "Thunder"), { timeout: 60, message: "thunder starts" });
    t.log(`weatherChange reports dimension "${changes.at(-1).dim}"`);
    await t.waitUntil(() => plans.length > 0, { timeout: 40, message: "realm:weather_plan sent" });
    const plan = plans.at(-1);
    t.check(plan.now === "Thunder", `the plan's current spell is Thunder (${plan.now})`);
    const len = (plan.until - Date.now()) / 60000;
    t.check(len > 6.5 && len <= 7, `the spell lasts 7 minutes (${len.toFixed(2)})`);
    t.check(Array.isArray(plan.next) && plan.next.length > 0 && plan.next[0].at === plan.until, "the next spell starts when this one ends");

    // Vanilla /weather is put back by the almanac.
    changes.length = 0;
    t.server("/weather clear");
    await t.waitUntil(() => changes.some((c) => c.to === "Clear"), { timeout: 40, message: "/weather clear took" });
    await t.waitUntil(() => changes.some((c) => c.to === "Thunder"), { timeout: 60, message: "the almanac puts thunder back" });
    t.log(`put back after ${changes.find((c) => c.to === "Thunder").tick - changes.find((c) => c.to === "Clear").tick} ticks`);

    // The forecast form.
    const formP = t.waitForm(p, { timeout: 100 });
    t.assert(t.cmd(p, "/realm:weather_forecast").ok, "/realm:weather_forecast ran");
    const form = await formP;
    t.check(/Now: .*Thunderstorm/.test(form.body), `forecast says Thunderstorm now (${form.body.split("\n").slice(0, 3).join(" / ")})`);
    form.answer(0);

    // Bad input.
    t.check(!t.cmd(p, "/realm:weather_set rain 0").ok, "0 minutes is refused");
    t.check(!t.cmd(p, "/realm:weather_set rain 2000").ok, "2000 minutes is refused");
    t.restart("plan saved, restarting");
  }
  // Phase 2: the same spell carries on.
  await t.waitUntil(() => t.world.gameRules.doWeatherCycle === false, { timeout: 200, message: "doWeatherCycle still off after the restart" });
  t.system.sendScriptEvent("realm:weather_ask", "{}");
  await t.waitUntil(() => plans.length > 0, { timeout: 40, message: "realm:weather_plan answers realm:weather_ask" });
  t.check(plans.at(-1).now === "Thunder", `after the restart the current spell is still Thunder (${plans.at(-1).now})`);
  const formP = t.waitForm(p, { timeout: 100 });
  t.assert(t.cmd(p, "/realm:weather").ok, "/realm:weather ran (operator menu)");
  const menu = await formP;
  t.log(`menu "${menu.title}": ${menu.buttons.join(" | ")}`);
  t.check(menu.buttons.some((b) => /Set the weather/.test(b)), "operator menu offers Set the weather");
  menu.answer("Set the weather");
  const set = await t.waitForm(p, { timeout: 100 });
  t.log(`set form "${set.title}" elements: ${JSON.stringify(set.elements).slice(0, 300)}`);
  set.answer({ Weather: "Rain", "real minutes": 10 });
  await t.waitMessage(p, /Rain for 10 minutes starting now/, { timeout: 60 });
  await t.waitUntil(() => plans.at(-1).now === "Rain", { timeout: 40, message: "the plan now says Rain" });
}
