// Copies tools/gossip-shared.js (the town-news gate in front of realm:gossip) into every pack that sends gossip, as
// scripts/gossip.js. Packs never import each other, so each keeps its own copy; this keeps the copies the same.
//
//   node tools/sync-gossip.mjs                 refresh every copy
//   node tools/sync-gossip.mjs some_bp ...     also add the file to these packs
//   node tools/sync-gossip.mjs --check         fail if a copy is stale or missing (for npm run check)
import { syncCopies } from "./lib/shared-copy.mjs";

syncCopies({
  shared: "gossip-shared.js",
  file: "gossip.js",
  tool: "sync-gossip.mjs",
  label: "Gossip gate",
  check: process.argv.includes("--check"),
  add: process.argv.slice(2).filter((a) => !a.startsWith("--")),
  expect: ["atlas_bp", "bounty_bp", "calendar_bp", "caravan_bp", "elite_bp", "expedition_bp", "fishing_bp", "goals_bp", "guilds_bp", "maps_bp", "meteor_bp", "milestones_bp", "moon_bp", "relics_bp", "saga_bp", "skills_bp", "storm_bp", "tornado_bp", "town_bp"],
});
