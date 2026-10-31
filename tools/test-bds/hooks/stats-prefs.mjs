import { appendFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const [out, from] = process.argv.slice(2);
if (!out) throw new Error("usage: stats-prefs.mjs <new output directory> [source repository]");
const root = from ? resolve(from) : join(import.meta.dirname, "..", "..", "..");
if (existsSync(out)) throw new Error(`fixture output already exists: ${out}`);
mkdirSync(out, { recursive: true });
for (const pack of ["stats_bp", "settings_bp"]) cpSync(join(root, "packs", pack), join(out, pack), { recursive: true });
appendFileSync(join(out, "stats_bp", "scripts", "main.js"), `
import { ScriptEventSource as StatsTestSource } from "@minecraft/server";
system.afterEvents.scriptEventReceive.subscribe((event) => {
  if (event.id !== "harness:stats_pref_ping" || event.sourceType !== StatsTestSource.Server) return;
  try {
    const q = JSON.parse(event.message);
    if (typeof q.id !== "string" || !/^[a-z0-9_-]{1,60}$/.test(q.id)) throw new Error("invalid probe id");
    const player = world.getAllPlayers().find((p) => p.name === q.name);
    if (!player?.isValid) throw new Error("probe player missing");
    player.sendMessage("stats pref " + q.id + " " + JSON.stringify({
      pref: player.getDynamicProperty("stats:pref") ?? null,
      ticker: getFor(player, "ticker") === true,
      allowed: get("tickerEnabled") === true,
      defaultOn: get("tickerDefaultOn") === true,
    }));
  } catch (e) {
    console.error("[stats-test] " + e);
  }
}, { namespaces: ["harness"] });
`);
console.log(`wrote ${out} (Stats preferences are read inside their owning add-on)`);
