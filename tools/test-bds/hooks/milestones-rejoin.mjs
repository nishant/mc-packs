// Test hook for tools/test-bds/examples/w10-milestones-flag.js: a copy of milestones_bp with a harness-only probe appended
// to its main.js (module scope, so it reads the pack's own saved records the separate test add-on can't).
// A simulated player gets a new id every spawn, so "the same player joins again after a restart" is played like this: the
// probe moves the record saved under the player's earlier id onto their current id, drops the pack's in-memory copies
// (records cache, unsaved changes, this session's backfill set) as a fresh start would, and runs the pack's own join check.
// Nothing here uses the O53 flag, so the same recipe runs the code from before it (537cbaf, the second argument), where
// the check sends the old top tiers again.
// Script event `harness:milestones_probe` (console only):
//   { id, report: "<name>" }                      -> harness:milestones_report { id, player, tf, joins, name, error? }
//   { id, rejoin: "<name>", from: "<earlier id>" } -> the same report after the check
//   node tools/test-bds/hooks/milestones-rejoin.mjs <out dir> [source repository]
import { appendFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const [out, from] = process.argv.slice(2);
if (!out) throw new Error("usage: milestones-rejoin.mjs <out dir> [source repository]");
const root = from ? resolve(from) : join(import.meta.dirname, "..", "..", "..");
if (existsSync(out)) throw new Error(`fixture output already exists: ${out}`);
mkdirSync(out, { recursive: true });
cpSync(join(root, "packs", "milestones_bp"), join(out, "milestones_bp"), { recursive: true });
appendFileSync(join(out, "milestones_bp", "scripts", "main.js"), `
// Harness only (tools/test-bds/hooks/milestones-rejoin.mjs); never shipped.
import { ScriptEventSource as MilestonesProbeSource } from "@minecraft/server";
function milestonesProbeReport(qid, player) {
  flush([player.id]);
  const raw = world.getDynamicProperty(RECORD_PREFIX + player.id);
  const r = typeof raw === "string" ? JSON.parse(raw) : undefined;
  return { id: qid, player: player.id, name: r?.n ?? null, tf: r?.tf === 1 ? 1 : 0, joins: Number(r?.g?.joins) || 0, ...(r ? {} : { error: "missing" }) };
}
system.afterEvents.scriptEventReceive.subscribe(
  (event) => {
    if (event.id !== "harness:milestones_probe" || event.sourceType !== MilestonesProbeSource.Server) return;
    let q;
    try {
      q = JSON.parse(event.message);
      const name = q.report ?? q.rejoin;
      const player = world.getPlayers({ name })[0];
      if (!player) throw new Error("no player " + name);
      if (q.rejoin) {
        const raw = world.getDynamicProperty(RECORD_PREFIX + q.from);
        if (typeof raw !== "string") throw new Error("no saved record for " + q.from);
        world.setDynamicProperty(RECORD_PREFIX + player.id, raw);
        world.setDynamicProperty(RECORD_PREFIX + q.from, undefined);
        dirty.delete(player.id);
        dirty.delete(q.from);
        cache = undefined;
        backfilled.delete(player.id);
        check(player);
      }
      system.sendScriptEvent("harness:milestones_report", JSON.stringify(milestonesProbeReport(q.id, player)));
    } catch (e) {
      system.sendScriptEvent("harness:milestones_report", JSON.stringify({ id: q?.id, error: String(e) }));
    }
  },
  { namespaces: ["harness"] },
);
`);
console.log(`wrote ${out} (milestones_bp with the rejoin probe${from ? `, from ${root}` : ""})`);
