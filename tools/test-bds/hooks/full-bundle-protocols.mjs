// Stages the genuine 67-member Realm Bundle for examples/full-bundle-protocols.js.
//   node tools/bundle.mjs --all
//   node tools/test-bds/hooks/full-bundle-protocols.mjs --from dist/realm_bundle.mcpack --out <stage>
// Do not use `npm run bundle -- --all` from PowerShell: npm does not receive --all.
// This runs tools/test-bds/hooks/events-bundle.mjs <scratch> --inject <unpacked dir> (not the scripts-only default).
// Then the printed run.mjs --bundle command. suite.mjs does not stage --bundle headers; run the printed command.
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { stageFullBundleProtocols } from "../full-bundle-protocols.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const help = `usage: node tools/test-bds/hooks/full-bundle-protocols.mjs --from <mcpack|dir> --out <dir>

Build the genuine Realm Bundle first. From PowerShell use Node directly, not npm:
  node tools/bundle.mjs --all
  node tools/bundle.mjs --resources

--from is that .mcpack, or the folder unzipped from it. This hook unpacks an .mcpack with
tools/test-bds/lib/unzip.mjs, then runs:
  node tools/test-bds/hooks/events-bundle.mjs <scratch> --inject <unpacked dir>
so entities, items, features and the rest of the pack data stay. The scripts-only
events-bundle default is refused.

It then imports a private callback-replay tap relay before the packs. Production handlers
are not edited. The scenario labels callback-replay separately from native engine emissions.

Then:
  node tools/test-bds/run.mjs --quiet --flat --bundle <out>/realm_bundle --scenario tools/test-bds/examples/full-bundle-protocols.js --timeout 1200
`;

let values;
try {
  values = parseArgs({ options: { from: { type: "string" }, out: { type: "string" }, help: { type: "boolean", short: "h", default: false } } }).values;
} catch (e) {
  console.error(String(e.message));
  console.error(help);
  process.exit(64);
}
if (values.help) {
  console.log(help);
  process.exit(0);
}
if (!values.from || !values.out) {
  console.error(help);
  process.exit(64);
}
try {
  const report = stageFullBundleProtocols({ from: resolve(values.from), outDir: resolve(values.out), repoRoot });
  console.log(`staged ${report.packDir}`);
  console.log(`members ${report.members.length} entities ${report.counts.entities} items ${report.counts.items} features ${report.counts.features} recipes ${report.counts.recipes} spawn_rules ${report.counts.spawnRules}`);
  console.log(`preserved ${report.preserved} source files besides scripts/main.js; added ${report.added} harness files`);
  console.log(report.command);
} catch (e) {
  console.error(String(e.message || e));
  process.exit(1);
}
