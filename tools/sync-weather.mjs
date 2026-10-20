// Copies tools/weather-plan-shared.js (reading the Weather Almanac's realm:weather_plan) into every weather pack that
// takes part, as scripts/weather-plan.js. Packs never import each other, so each keeps its own copy; this keeps the
// copies the same.
//
//   node tools/sync-weather.mjs                 refresh every copy
//   node tools/sync-weather.mjs some_bp ...     also add the file to these packs
//   node tools/sync-weather.mjs --check         fail if a copy is stale or missing (for npm run check)
import { syncCopies } from "./lib/shared-copy.mjs";

syncCopies({
  shared: "weather-plan-shared.js",
  file: "weather-plan.js",
  tool: "sync-weather.mjs",
  label: "Weather plan reader",
  check: process.argv.includes("--check"),
  add: process.argv.slice(2).filter((a) => !a.startsWith("--")),
  expect: ["climate_bp", "moon_bp", "night_bp", "rain_bp", "storm_bp", "tornado_bp"],
});
