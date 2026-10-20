// Test hook for tools/test-bds/examples/expedition-queue-restart.js: a copy of expedition_bp with a harness-only probe
// appended to its main.js (module scope, so it reads the pack's own saved line, which the separate test add-on can't).
// A simulated player gets a new id every spawn, so "the leader joins again after a restart" is played like this: the
// probe moves the line entry saved under the leader's earlier id onto their current id and runs the pack's own rejoin
// step (queueRejoined), as a real player's initial spawn would.
// The report reads only what any version of the pack has (its world property and, when they exist, the in-memory
// line), so the same recipe runs the code from before a fix (a source tree as the second argument).
// Script event `harness:exp_queue_probe` (console only):
//   { id, report: true }                          -> harness:exp_queue_report { id, saved, line, error? }
//   { id, rejoin: "<name>", from: "<earlier id>" } -> the same report after the rejoin
//   saved: [[leader id, name, ticks waited]] from expedition:queue; line: [[leader id, name, restored 0/1]] in memory
//   node tools/test-bds/hooks/expedition-queue-rejoin.mjs <out dir> [source repository]
import { appendFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const [out, from] = process.argv.slice(2);
if (!out) throw new Error("usage: expedition-queue-rejoin.mjs <out dir> [source repository]");
const root = from ? resolve(from) : join(import.meta.dirname, "..", "..", "..");
if (existsSync(out)) throw new Error(`fixture output already exists: ${out}`);
mkdirSync(out, { recursive: true });
cpSync(join(root, "packs", "expedition_bp"), join(out, "expedition_bp"), { recursive: true });
appendFileSync(join(out, "expedition_bp", "scripts", "main.js"), `
// Harness only (tools/test-bds/hooks/expedition-queue-rejoin.mjs); never shipped.
import { ScriptEventSource as ExpQueueProbeSource } from "@minecraft/server";
function expQueueProbeReport(qid) {
  const raw = world.getDynamicProperty("expedition:queue");
  let saved = [];
  try {
    const list = typeof raw === "string" ? JSON.parse(raw) : [];
    saved = Array.isArray(list) ? list.map((e) => [String(e?.i), String(e?.n), Number(e?.w) || 0]) : [];
  } catch (e) {
    saved = [["unreadable", String(e), 0]];
  }
  const line = typeof queue !== "undefined" ? queue.map((q) => [q.id, q.name, q.back !== undefined ? 1 : 0]) : null;
  return { id: qid, saved: saved.slice(0, 8), line: line ? line.slice(0, 8) : null };
}
system.afterEvents.scriptEventReceive.subscribe(
  (event) => {
    if (event.id !== "harness:exp_queue_probe" || event.sourceType !== ExpQueueProbeSource.Server) return;
    let q;
    try {
      q = JSON.parse(event.message);
      if (q.rejoin) {
        const player = world.getPlayers({ name: q.rejoin })[0];
        if (!player) throw new Error("no player " + q.rejoin);
        const entry = typeof queue !== "undefined" ? queue.find((x) => x.id === q.from) : undefined;
        if (!entry) throw new Error("no line entry for " + q.from);
        entry.id = player.id;
        if (typeof queueRejoined !== "function") throw new Error("no queueRejoined");
        queueRejoined(player);
      }
      system.sendScriptEvent("harness:exp_queue_report", JSON.stringify(expQueueProbeReport(q.id)));
    } catch (e) {
      system.sendScriptEvent("harness:exp_queue_report", JSON.stringify({ id: q?.id, error: String(e) }));
    }
  },
  { namespaces: ["harness"] },
);
`);
console.log(`wrote ${out} (expedition_bp with the line probe${from ? `, from ${root}` : ""})`);
