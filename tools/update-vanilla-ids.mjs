// Refresh tools/vanilla-ids from a local Mojang bedrock-samples checkout.
// Not part of npm run check. It never fetches, and check-ids must not import it.
//
//   node tools/update-vanilla-ids.mjs --samples <path-to-bedrock-samples>
//
// Then commit the regenerated particles.json, sounds.json, and SOURCE.json together.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const samplesArg = process.argv.indexOf("--samples");
const samples = samplesArg >= 0 ? process.argv[samplesArg + 1] : "";
if (!samples) {
  console.error("Pass --samples <local bedrock-samples checkout>. This script does not fetch.");
  process.exit(1);
}

const particles = [];
const particleDir = join(samples, "resource_pack", "particles");
for (const name of readdirSync(particleDir)) {
  if (!name.endsWith(".json")) continue;
  const text = readFileSync(join(particleDir, name), "utf8");
  for (const m of text.matchAll(/"identifier"\s*:\s*"([^"]+)"/g)) particles.push(m[1]);
}
const soundFile = join(samples, "resource_pack", "sounds", "sound_definitions.json");
const soundText = readFileSync(soundFile, "utf8");
const sounds = [...soundText.matchAll(/"((?:[a-z0-9_]+\.)+[a-z0-9_]+)"\s*:/g)].map((m) => m[1]);
const out = join(import.meta.dirname, "vanilla-ids");
writeFileSync(join(out, "particles.json"), `${JSON.stringify([...new Set(particles)].sort(), null, 2)}\n`);
writeFileSync(join(out, "sounds.json"), `${JSON.stringify([...new Set(sounds)].sort(), null, 2)}\n`);
const sourcePath = join(out, "SOURCE.json");
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
source.bedrockSamples.refreshedBy = "tools/update-vanilla-ids.mjs --samples <local checkout>";
source.note = "Identifier strings only. check-ids reads these files offline and must not fetch.";
writeFileSync(sourcePath, `${JSON.stringify(source, null, 2)}\n`);
console.log(`Pinned ${new Set(particles).size} particles and ${new Set(sounds).size} sounds from ${samples}.`);
console.log("Update SOURCE.json commit, version, and license by hand from that checkout. Do not copy sample code.");
