// Copies tools/prune-shared.js (the inactive-player pruning rules) into every pack that takes part, as
// scripts/prune.js: party, nick and titles. Packs never import each other, so each keeps its own copy; this keeps the
// copies the same.
//
//   node tools/sync-prune.mjs                 refresh every copy
//   node tools/sync-prune.mjs some_bp ...     also add the file to these packs
//   node tools/sync-prune.mjs --check         fail if a copy is stale or missing (for npm run check)
import { syncCopies } from "./lib/shared-copy.mjs";

syncCopies({
  shared: "prune-shared.js",
  file: "prune.js",
  tool: "sync-prune.mjs",
  label: "Prune helper",
  check: process.argv.includes("--check"),
  add: process.argv.slice(2).filter((a) => !a.startsWith("--")),
  expect: ["nick_bp", "party_bp", "titles_bp"],
});
