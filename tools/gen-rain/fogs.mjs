// Generates packs/rain_rp/fogs/ and packs/rain_rp/biomes/: denser, gloomier rain fog for the overworld, a whiter,
// denser fog where it snows, plus the fogs Rain Extras pushes per player: storm fogs in thunderstorms, and a darker
// haze in rain and storms for Vibrant Visuals.
//
// A pack's fog file replaces the vanilla definition with the same identifier wholesale, so each override is a
// verbatim copy of the vanilla file (tools/gen-rain/vanilla/fogs/) with only `distance.weather` changed or added.
// Bedrock has one `weather` fog for rain and snowfall, so snow gets its own look per biome fog: the fogs of the
// biomes where it always snows (temperature below 0.15) get the snow fog, every other one the rain fog. Fogs that
// don't define `weather` fall through to minecraft:fog_default (rain fog). Groves and snowy slopes use
// minecraft:fog_default itself, shared with rainy biomes, so their client biome files (tools/gen-rain/vanilla/biomes/)
// are copied with only the fog identifier changed, to realm:fog_snow_default: fog_default with the snow fog.
//
//   node tools/gen-rain/fogs.mjs           write them
//   node tools/gen-rain/fogs.mjs --check   fail if the committed files differ, or an override changes more than the weather fog
//                                          (a client biome more than its fog identifier)
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { isDeepStrictEqual } from "node:util";

const root = join(import.meta.dirname, "..", "..");
const vanillaDir = join(import.meta.dirname, "vanilla", "fogs");
const vanillaBiomes = join(import.meta.dirname, "vanilla", "biomes");
const outDir = join(root, "packs", "rain_rp", "fogs");
const biomeOutDir = join(root, "packs", "rain_rp", "biomes");
const check = process.argv.includes("--check");

/** Rain fog, as fractions of the render distance (vanilla: 0.23 → 0.70, #666666). */
const RAIN = { start: 0.15, end: 0.55, color: "#5F6B79" };
/**
 * Snow fog: whiter and a little denser than the rain fog, but still a pale gray rather than white, so the white
 * flakes stand out against it (vanilla: the same 0.23 → 0.70, #666666 as rain).
 */
const SNOW = { start: 0.12, end: 0.5, color: "#A9B3BE" };
/**
 * Vanilla fogs of the biomes where it always snows. Most have no `weather` fog (it's added); fog_dry is shared by
 * frozen and jagged peaks and the legacy frozen ocean (snow) with the mutated desert and badlands plateaus, which
 * get no rain or snow at all.
 */
const SNOW_FOGS = new Set([
  "cold_beach_fog_setting.json", "cold_taiga_fog_setting.json", "cold_taiga_hills_fog_setting.json", "cold_taiga_mutated_fog_setting.json",
  "dry_fog_setting.json", "frozen_ocean_fog_setting.json", "frozen_river_fog_setting.json", "ice_mountains_fog_setting.json",
  "ice_plains_fog_setting.json", "ice_plains_spikes_fog_setting.json",
]);
/** fog_default with the snow fog, for the snowy biomes that use fog_default (their client biomes point here). */
const SNOW_DEFAULT = { file: "snow_default_fog_setting.json", from: "default_fog_setting.json", id: "realm:fog_snow_default" };
/** Biome fogs that keep their own weather color (only the density changes). */
const KEEP_COLOR = new Set(["pale_garden_fog_setting.json", "sulfur_cave_fog_setting.json"]);
/** Thunderstorm fogs, pushed per player by Rain Extras with /fog in three steps so the fog rolls in. Fancy and VV. */
const STORM = [
  { file: "rain_storm_1.json", id: "realm:rain_storm_1", start: 0.12, end: 0.48, color: "#59646F" },
  { file: "rain_storm_2.json", id: "realm:rain_storm_2", start: 0.1, end: 0.41, color: "#545D69" },
  { file: "rain_storm.json", id: "realm:rain_storm", start: 0.08, end: 0.35, color: "#4E5763" },
];

/**
 * Rain haze for Vibrant Visuals, pushed per player by Rain Extras in rain and thunder (two steps). VV ignores fog_color,
 * so its rain is a pale gray haze; this volumetric air fog is denser in the valleys (full at y ≤ 64, none above 256)
 * and absorbs about as much light as it scatters, so the haze reads darker and slightly blue. Only `volumetric` is set:
 * Fancy ignores it, and the storm fogs (which set only `distance`) layer on top of it unchanged.
 */
const GLOOM = [
  { file: "rain_gloom_1.json", id: "realm:rain_gloom_1", density: 0.04 },
  { file: "rain_gloom.json", id: "realm:rain_gloom", density: 0.08 },
];
const GLOOM_AIR = { scattering: [0.05, 0.056, 0.064], absorption: [0.05, 0.046, 0.038], g: 0.5, fullBelow: 64, noneAbove: 256 };

/**
 * Rewrites the numbers in the "weather" block of a fog file's text, keeping Mojang's formatting, or adds a weather
 * block at the top of "distance" (indented like its neighbors) when the vanilla fog has none.
 */
function patchWeather(/** @type {string} */ text, /** @type {string} */ name, /** @type {typeof RAIN} */ fog) {
  const block = /("weather"\s*:\s*\{)([^{}]*)(\})/;
  const m = text.match(block);
  if (!m) {
    const at = text.match(/("distance"\s*:\s*\{\r?\n)([ \t]*)/);
    if (!at) throw new Error(`${name}: no "distance" block`);
    const [nl, ind] = [at[1].endsWith("\r\n") ? "\r\n" : "\n", at[2]];
    const step = text.match(/\n([ \t]+)\S/)?.[1] ?? "  "; // the file's indent unit: its first indented line
    const lines = [`"fog_start": ${fog.start},`, `"fog_end": ${fog.end},`, `"fog_color": "${fog.color}",`, `"render_distance_type": "render"`];
    const weather = `${ind}"weather": {${nl}${lines.map((l) => ind + step + l).join(nl)}${nl}${ind}},${nl}`;
    return text.replace(at[0], at[1] + weather + ind);
  }
  let body = m[2]
    .replace(/("fog_start"\s*:\s*)[\d.]+/, `$1${fog.start}`)
    .replace(/("fog_end"\s*:\s*)[\d.]+/, `$1${fog.end}`);
  if (!KEEP_COLOR.has(name)) body = body.replace(/("fog_color"\s*:\s*)"#[0-9A-Fa-f]{6}"/, `$1"${fog.color}"`);
  return text.replace(block, `$1${body}$3`);
}

function storm(/** @type {typeof STORM[number]} */ s) {
  const fog = {
    format_version: "1.16.100",
    "minecraft:fog_settings": {
      description: { identifier: s.id },
      // Only the weather fog: in clear weather, underwater or in the Nether a leftover push changes nothing.
      distance: { weather: { fog_start: s.start, fog_end: s.end, fog_color: s.color, render_distance_type: "render" } },
    },
  };
  return JSON.stringify(fog, null, 2) + "\n";
}

function gloom(/** @type {typeof GLOOM[number]} */ s) {
  const fog = {
    format_version: "1.21.90",
    "minecraft:fog_settings": {
      description: { identifier: s.id },
      volumetric: {
        density: { air: { max_density: s.density, zero_density_height: GLOOM_AIR.noneAbove, max_density_height: GLOOM_AIR.fullBelow } },
        media_coefficients: { air: { scattering: GLOOM_AIR.scattering, absorption: GLOOM_AIR.absorption } },
        henyey_greenstein_g: { air: { henyey_greenstein_g: GLOOM_AIR.g } },
      },
    },
  };
  return JSON.stringify(fog, null, 2) + "\n";
}

/** @type {Map<string, string>} file name → contents */
const files = new Map();
const problems = [];
for (const name of readdirSync(vanillaDir).sort()) {
  const vanillaText = readFileSync(join(vanillaDir, name), "utf8");
  const fog = SNOW_FOGS.has(name) ? SNOW : RAIN;
  const text = patchWeather(vanillaText, name, fog);
  // Guard: nothing but distance.weather may differ from vanilla.
  const a = JSON.parse(vanillaText), b = JSON.parse(text);
  const w = b["minecraft:fog_settings"].distance.weather;
  delete a["minecraft:fog_settings"].distance.weather;
  delete b["minecraft:fog_settings"].distance.weather;
  if (!isDeepStrictEqual(a, b)) problems.push(`${name}: changes more than distance.weather`);
  if (w.fog_start !== fog.start || w.fog_end !== fog.end || w.render_distance_type !== "render") problems.push(`${name}: weather fog not patched`);
  if (!KEEP_COLOR.has(name) && w.fog_color !== fog.color) problems.push(`${name}: weather fog color not patched`);
  files.set(name, text);
}
for (const name of SNOW_FOGS) if (!files.has(name)) problems.push(`${name}: listed in SNOW_FOGS but missing from tools/gen-rain/vanilla/fogs`);
{
  // fog_default under its own identifier, with the snow fog.
  const vanillaText = readFileSync(join(vanillaDir, SNOW_DEFAULT.from), "utf8");
  const text = patchWeather(vanillaText, SNOW_DEFAULT.file, SNOW).replace(/("identifier"\s*:\s*)"minecraft:fog_default"/, `$1"${SNOW_DEFAULT.id}"`);
  const a = JSON.parse(vanillaText)["minecraft:fog_settings"], b = JSON.parse(text)["minecraft:fog_settings"];
  if (b.description.identifier !== SNOW_DEFAULT.id || b.distance.weather.fog_color !== SNOW.color) problems.push(`${SNOW_DEFAULT.file}: not patched`);
  delete a.distance.weather, delete b.distance.weather, delete a.description, delete b.description;
  if (!isDeepStrictEqual(a, b)) problems.push(`${SNOW_DEFAULT.file}: changes more than the identifier and distance.weather`);
  files.set(SNOW_DEFAULT.file, text);
}

/** @type {Map<string, string>} client biome file name → contents: the snowy biomes that use fog_default, pointed at the snow copy. */
const biomes = new Map();
for (const name of readdirSync(vanillaBiomes).sort()) {
  const vanillaText = readFileSync(join(vanillaBiomes, name), "utf8");
  const text = vanillaText.replace(/("fog_identifier"\s*:\s*)"minecraft:fog_default"/, `$1"${SNOW_DEFAULT.id}"`);
  const a = JSON.parse(vanillaText)["minecraft:client_biome"], b = JSON.parse(text)["minecraft:client_biome"];
  if (b.components["minecraft:fog_appearance"]?.fog_identifier !== SNOW_DEFAULT.id) problems.push(`biomes/${name}: fog identifier not patched`);
  delete a.components["minecraft:fog_appearance"], delete b.components["minecraft:fog_appearance"];
  if (!isDeepStrictEqual(a, b)) problems.push(`biomes/${name}: changes more than the fog identifier`);
  biomes.set(name, text);
}
for (const s of STORM) files.set(s.file, storm(s));
for (const s of GLOOM) files.set(s.file, gloom(s));
// Guard: the haze must set nothing but volumetric air fog, or it would override Fancy's rain fog for whoever has it pushed.
for (const s of GLOOM) {
  const f = JSON.parse(files.get(s.file))["minecraft:fog_settings"];
  if (Object.keys(f).join() !== "description,volumetric" || Object.values(f.volumetric).some((v) => Object.keys(v).join() !== "air")) problems.push(`${s.file}: may only set volumetric air fog`);
}

if (check) {
  for (const [dir, map, label] of /** @type {[string, Map<string, string>, string][]} */ ([[outDir, files, ""], [biomeOutDir, biomes, "biomes/"]])) {
    for (const [name, text] of map) {
      const file = join(dir, name);
      if (!existsSync(file) || readFileSync(file, "utf8") !== text) problems.push(`${label}${name}: out of date (run npm run gen:rain)`);
    }
    if (existsSync(dir)) for (const name of readdirSync(dir)) if (!map.has(name)) problems.push(`${label}${name}: not generated by fogs.mjs`);
  }
  if (problems.length) {
    console.error(`rain_rp fogs:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`rain_rp fogs match tools/gen-rain/fogs.mjs (${files.size} fogs, ${biomes.size} client biomes).`);
} else {
  if (problems.length) throw new Error(problems.join("\n"));
  mkdirSync(outDir, { recursive: true });
  for (const [name, text] of files) writeFileSync(join(outDir, name), text);
  mkdirSync(biomeOutDir, { recursive: true });
  for (const [name, text] of biomes) writeFileSync(join(biomeOutDir, name), text);
  console.log(`wrote ${files.size} fogs to ${relative(root, outDir)} and ${biomes.size} client biomes to ${relative(root, biomeOutDir)}`);
}
