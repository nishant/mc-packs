// node table.mjs <file.json> [<file.json> ...]  -> markdown table of per-pack ms/tick (whole run) + bundle steady
import fs from "fs";
const files = process.argv.slice(2);
const runs = files.map(f => JSON.parse(fs.readFileSync(f)));
const packs = new Set(); runs.forEach(r => r.packs.forEach(p => packs.add(p.pack)));
const val = (r, k) => r.packs.find(p => p.pack === k)?.msPerTick;
const rows = [...packs].sort((a, b) => (val(runs[0], b) ?? 0) - (val(runs[0], a) ?? 0));
console.log(`| pack | ${files.map(f => f.split("/").slice(-2).join("/").replace(".json", "")).join(" | ")} |`);
console.log(`|---|${files.map(() => "---:").join("|")}|`);
console.log(`| **bundle steady avg** | ${runs.map(r => r.bundle.steadyWindow?.avg?.toFixed(3) ?? "-").join(" | ")} |`);
console.log(`| bundle whole avg / p95 | ${runs.map(r => `${r.bundle.perTick.avg.toFixed(3)} / ${r.bundle.perTick.p95}`).join(" | ")} |`);
console.log(`| valid | ${runs.map(r => r.acceptance?.ok ?? "-").join(" | ")} |`);
for (const k of rows) console.log(`| ${k} | ${runs.map(r => val(r, k)?.toFixed(3) ?? "-").join(" | ")} |`);
