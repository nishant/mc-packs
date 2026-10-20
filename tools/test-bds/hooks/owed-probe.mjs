// Test hook for the owed-store migration scenarios (owed-legacy-restart.js, owed-legacy-consumers.js): copies packs and
// adds a harness-only probe to each, so a scenario can seed and read the pack's own dynamic properties (they belong to
// the add-on that wrote them, so the separate test add-on can't) and hand a player the pack's own join payment.
// The probe uses no code of the pack, only raw dynamic properties and the pack's own playerSpawn listeners, so the same
// recipe works on a tree from before the owed stores existed (the second argument): there, a scenario fails at its
// first migration check (no per-player key, no index), which is what the migration added.
//
// scripts/harness_owed_probe.js is imported right after diag.js (or first, on a tree without it). It remembers every
// world.afterEvents.playerSpawn listener the pack subscribes and answers the console-only script event
// `harness:owed_probe` { id, base, seed?, rekey?, join?, dump? } in this order:
//   seed:  { [playerId]: value }  writes the old one-property layout, the property `<base>` itself (the legacy shape)
//   rekey: [fromId, playerName]   moves the new-layout entry `<base>:<fromId>` to the named player's id, index too
//                                  (a simulated player gets a new id every spawn, so a test id is handed over this way)
//   join:  playerName              runs the pack's playerSpawn listeners for that player with initialSpawn true,
//                                  the way the game does when the player joins
//   dump:  true                    reports { keys, index, values, legacy } of `<base>`
// and answers `harness:owed_report` { id, base, folder, ... } (always under 2048 characters; `values` is cut first).
//   node tools/test-bds/hooks/owed-probe.mjs <out dir> <pack,pack,...> [source repository]
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [out, list, from] = process.argv.slice(2);
if (!out || !list) throw new Error("usage: owed-probe.mjs <out dir> <pack,pack,...> [source repository]");
const root = from ? resolve(from) : join(import.meta.dirname, "..", "..", "..");
if (existsSync(out)) throw new Error(`fixture output already exists: ${out}`);
mkdirSync(out, { recursive: true });

const probe = (/** @type {string} */ folder) => `// Harness only (tools/test-bds/hooks/owed-probe.mjs); never shipped.
import { ScriptEventSource, system, world } from "@minecraft/server";

const FOLDER = ${JSON.stringify(folder)};
const spawnListeners = [];
const spawnSignal = world.afterEvents.playerSpawn;
const spawnSubscribe = spawnSignal.subscribe;
spawnSignal.subscribe = function (callback, ...rest) {
  if (typeof callback === "function") spawnListeners.push(callback);
  return spawnSubscribe.call(this, callback, ...rest);
};

const parse = (raw) => {
  if (typeof raw !== "string") return raw ?? null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

function dump(base) {
  const keys = world.getDynamicPropertyIds().filter((k) => k === base || k.startsWith(base + ":") || k === base + "_idx").sort();
  const index = parse(world.getDynamicProperty(base + "_idx"));
  const values = {};
  for (const k of keys) if (k.startsWith(base + ":")) values[k.slice(base.length + 1)] = parse(world.getDynamicProperty(k));
  return { keys, index, values, legacy: parse(world.getDynamicProperty(base)) };
}

function reply(body) {
  let text = JSON.stringify(body);
  if (text.length >= 2000 && body.values) text = JSON.stringify({ ...body, values: { cut: Object.keys(body.values).length } });
  if (text.length >= 2000) text = JSON.stringify({ id: body.id, base: body.base, folder: FOLDER, error: "report too long " + text.length });
  system.sendScriptEvent("harness:owed_report", text);
}

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message, sourceType }) => {
    if (id !== "harness:owed_probe" || sourceType !== ScriptEventSource.Server) return;
    let q;
    try {
      q = JSON.parse(message);
    } catch {
      return;
    }
    if (!q || typeof q.base !== "string" || q.folder !== FOLDER) return;
    const base = q.base;
    try {
      if (q.seed && typeof q.seed === "object") world.setDynamicProperty(base, JSON.stringify(q.seed));
      if (Array.isArray(q.rekey)) {
        const [fromId, name] = q.rekey;
        const player = world.getPlayers({ name })[0];
        if (!player) throw new Error("rekey: no player " + name);
        const raw = world.getDynamicProperty(base + ":" + fromId);
        if (raw !== undefined) {
          world.setDynamicProperty(base + ":" + player.id, raw);
          world.setDynamicProperty(base + ":" + fromId, undefined);
          const index = parse(world.getDynamicProperty(base + "_idx"));
          if (Array.isArray(index)) world.setDynamicProperty(base + "_idx", JSON.stringify(index.map((x) => (x === fromId ? player.id : x))));
        }
      }
      if (typeof q.join === "string") {
        const player = world.getPlayers({ name: q.join })[0];
        if (!player) throw new Error("join: no player " + q.join);
        for (const listener of spawnListeners) listener({ player, initialSpawn: true });
      }
      reply({ id: q.id, base, folder: FOLDER, listeners: spawnListeners.length, ...(q.dump ? dump(base) : {}) });
    } catch (e) {
      reply({ id: q.id, base, folder: FOLDER, error: String(e) });
    }
  },
  { namespaces: ["harness"] },
);
`;

for (const folder of list.split(",").map((s) => s.trim()).filter(Boolean)) {
  const src = join(root, "packs", folder);
  if (!existsSync(join(src, "manifest.json"))) throw new Error(`no pack ${folder} in ${root}`);
  const dest = join(out, folder);
  cpSync(src, dest, { recursive: true });
  writeFileSync(join(dest, "scripts", "harness_owed_probe.js"), probe(folder));
  const mainFile = join(dest, "scripts", "main.js");
  const lines = readFileSync(mainFile, "utf8").split("\n");
  const diag = lines.findIndex((l) => /^import\s+["']\.\/diag\.js["'];?\s*$/.test(l));
  lines.splice(diag + 1, 0, 'import "./harness_owed_probe.js";');
  writeFileSync(mainFile, lines.join("\n"));
}
console.log(`wrote ${out} (${list} with the owed-store probe${from ? `, from ${root}` : ""})`);
