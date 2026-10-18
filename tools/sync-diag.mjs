// Copies tools/diag-shared.js (pack diagnostics: script cost and saved data per pack, for /realm:diag) into
// every behavior pack with scripts as scripts/diag.js, with that pack's folder and manifest header.version
// filled in, and makes "./diag.js" the first import of each scripts/main.js. Packs never import each other,
// so each keeps its own copy. A version bump changes the copy: run this after bumping (help-catalog.mjs and
// gen-news.mjs do it themselves for the packs they bump).
//
//   node tools/sync-diag.mjs            refresh every copy
//   node tools/sync-diag.mjs --check    fail if a copy or an import is stale (part of npm run check)
import { syncDiag } from "./lib/diag-sync.mjs";

const check = process.argv.includes("--check");
const { problems, written, copies } = syncDiag({ check });
if (problems.length) {
  console.error(`Diagnostics helper problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(check ? `All ${copies} copies of scripts/diag.js are current.` : `${written ? `${written} files updated (bump those packs)` : "All up to date"}.`);
