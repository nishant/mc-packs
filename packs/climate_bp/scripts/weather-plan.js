// Generated from tools/weather-plan-shared.js by node tools/sync-weather.mjs: edit that file, not this copy.
// What the Weather Almanac's realm:weather_plan says the overworld weather is right now, for the weather packs that
// keep the last weatherChange they saw (rain, storm, climate, tornado, night, moon): a pack added in the middle of a
// storm learns it from the plan (O57). Packs never import each other, so each keeps its own copy as
// scripts/weather-plan.js; node tools/sync-weather.mjs keeps the copies the same (tools/weather-plan-intake.test.mjs).

/** @typedef {import("@minecraft/server").WeatherType} WeatherType */

/** The game's WeatherType values (Clear, Rain, Thunder). */
const KINDS = ["Clear", "Rain", "Thunder"];

/** The overworld weather a realm:weather_plan names right now, or undefined (the Almanac is off, another dimension, garbage). @param {string} message @returns {WeatherType | undefined} */
export function planNow(message) {
  try {
    const m = JSON.parse(message);
    if (!m || m.off === true) return undefined;
    const dim = m.dim ?? m.dimension;
    if (typeof dim === "string" && dim.replace(/^minecraft:/, "") !== "overworld") return undefined;
    return KINDS.includes(m.now) ? /** @type {WeatherType} */ (m.now) : undefined;
  } catch {
    return undefined;
  }
}
