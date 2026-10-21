// The harness-only probe hooks (tools/test-bds/hooks/owed-probe.mjs, milestones-rejoin.mjs, expedition-queue-rejoin.mjs, stash-loads.mjs, elite-remove.mjs, claims-taps.mjs) build
// test copies whose scripts parse, put the probe where it runs (right after diag.js, so it sees what the pack
// subscribes), leave the shipped packs alone, and work on a source tree given as their last argument (how a scenario
// is run on the code from before a fix).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..", "..");
const HOOKS = path.join(import.meta.dirname, "hooks");
const run = (/** @type {string[]} */ args) => execFileSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const parses = (/** @type {string} */ file) => execFileSync(process.execPath, ["--check", file], { encoding: "utf8" });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "probe-hooks-"));

test("owed-probe: the probe is imported right after diag.js in every listed pack, and the pack is otherwise unchanged", () => {
  const dir = tmp();
  try {
    const out = path.join(dir, "packs");
    const packs = ["relics_bp", "fishing_bp", "bounty_bp", "guilds_bp", "town_bp", "cooking_bp", "party_bp", "crowns_bp"];
    run([path.join(HOOKS, "owed-probe.mjs"), out, packs.join(",")]);
    for (const p of packs) {
      const main = fs.readFileSync(path.join(out, p, "scripts", "main.js"), "utf8").split("\n");
      assert.equal(main[0], 'import "./diag.js";', `${p}: diag.js stays first`);
      assert.equal(main[1], 'import "./harness_owed_probe.js";', `${p}: the probe comes right after`);
      const shipped = fs.readFileSync(path.join(ROOT, "packs", p, "scripts", "main.js"), "utf8").split("\n");
      assert.deepEqual([main[0], ...main.slice(2)], shipped, `${p}: nothing else changes`);
      parses(path.join(out, p, "scripts", "harness_owed_probe.js"));
      const probe = fs.readFileSync(path.join(out, p, "scripts", "harness_owed_probe.js"), "utf8");
      assert.match(probe, /ScriptEventSource\.Server/, "console only");
      assert.match(probe, /namespaces: \["harness"\]/, "never a realm: listener (it must not carry the diag protocol)");
      assert.ok(!fs.readFileSync(path.join(ROOT, "packs", p, "scripts", "main.js"), "utf8").includes("harness_owed_probe"), `${p}: the shipped pack has no probe`);
    }
    assert.throws(() => run([path.join(HOOKS, "owed-probe.mjs"), out, "relics_bp"]), "an existing output folder is refused");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("owed-probe: a source tree without diag.js gets the probe first", () => {
  const dir = tmp();
  try {
    const src = path.join(dir, "src", "packs", "x_bp", "scripts");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "packs", "x_bp", "manifest.json"), "{}");
    fs.writeFileSync(path.join(src, "main.js"), 'import { world } from "@minecraft/server";\nworld;\n');
    run([path.join(HOOKS, "owed-probe.mjs"), path.join(dir, "out"), "x_bp", path.join(dir, "src")]);
    const main = fs.readFileSync(path.join(dir, "out", "x_bp", "scripts", "main.js"), "utf8").split("\n");
    assert.equal(main[0], 'import "./harness_owed_probe.js";');
    assert.equal(main[1], 'import { world } from "@minecraft/server";');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("milestones-rejoin: the probe is appended in the pack's module scope and uses names the pack defines", () => {
  const dir = tmp();
  try {
    run([path.join(HOOKS, "milestones-rejoin.mjs"), path.join(dir, "packs")]);
    const file = path.join(dir, "packs", "milestones_bp", "scripts", "main.js");
    parses(file);
    const text = fs.readFileSync(file, "utf8");
    const shipped = fs.readFileSync(path.join(ROOT, "packs", "milestones_bp", "scripts", "main.js"), "utf8");
    assert.ok(text.startsWith(shipped), "the shipped code is kept as it is");
    for (const name of [/^let cache\b/m, /^const dirty = /m, /^const backfilled = /m, /^function check\(/m, /^function flush\(/m, /^const RECORD_PREFIX = /m])
      assert.match(shipped, name, `the pack still defines ${name} (the probe resets it as a fresh start would)`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("expedition-queue-rejoin: the probe is appended in the pack's module scope and uses names the pack defines", () => {
  const dir = tmp();
  try {
    run([path.join(HOOKS, "expedition-queue-rejoin.mjs"), path.join(dir, "packs")]);
    const file = path.join(dir, "packs", "expedition_bp", "scripts", "main.js");
    parses(file);
    const text = fs.readFileSync(file, "utf8");
    const shipped = fs.readFileSync(path.join(ROOT, "packs", "expedition_bp", "scripts", "main.js"), "utf8");
    assert.ok(text.startsWith(shipped), "the shipped code is kept as it is");
    assert.match(text.slice(shipped.length), /ExpQueueProbeSource\.Server/, "console only");
    assert.match(text.slice(shipped.length), /namespaces: \["harness"\]/);
    // The line lives in queue.js; main.js brings queue and queueRejoined into its module scope from createQueue.
    assert.match(shipped, /^const \{ queue,[^}]*\bqueueRejoined\b[^}]*\} = createQueue\(\{/m, "main.js still names queue and queueRejoined (the probe reads them)");
    const queueJs = fs.readFileSync(path.join(ROOT, "packs", "expedition_bp", "scripts", "queue.js"), "utf8");
    assert.match(queueJs, /^export const PROP_QUEUE = "expedition:queue";/m, "the line is still saved where the probe reads it");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("stash-loads: the page-load counter comes right after diag.js and counts structure loads only", () => {
  const dir = tmp();
  try {
    run([path.join(HOOKS, "stash-loads.mjs"), path.join(dir, "packs")]);
    const main = fs.readFileSync(path.join(dir, "packs", "stash_bp", "scripts", "main.js"), "utf8").split("\n");
    assert.equal(main[0], 'import "./diag.js";');
    assert.equal(main[1], 'import "./harness_stash_loads.js";');
    const probe = path.join(dir, "packs", "stash_bp", "scripts", "harness_stash_loads.js");
    parses(probe);
    assert.match(fs.readFileSync(probe, "utf8"), /startsWith\("structure load "\)/);
    assert.match(fs.readFileSync(path.join(ROOT, "packs", "stash_bp", "scripts", "page-store.js"), "utf8"), /runCommand\(`structure load /, "stash_bp still loads its saved pages with the structure load command");
    assert.ok(fs.existsSync(path.join(dir, "packs", "refill_bp", "manifest.json")), "refill_bp is copied along");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("elite-remove: the spawn remover comes right after diag.js and subscribes after the pack's own entitySpawn handler", () => {
  const dir = tmp();
  try {
    run([path.join(HOOKS, "elite-remove.mjs"), path.join(dir, "packs")]);
    const main = fs.readFileSync(path.join(dir, "packs", "elite_bp", "scripts", "main.js"), "utf8").split("\n");
    assert.equal(main[0], 'import "./diag.js";');
    assert.equal(main[1], 'import "./harness_elite_remove.js";');
    const shipped = fs.readFileSync(path.join(ROOT, "packs", "elite_bp", "scripts", "main.js"), "utf8");
    assert.deepEqual([main[0], ...main.slice(2)], shipped.split("\n"), "nothing else changes");
    assert.match(shipped, /^world\.afterEvents\.entitySpawn\.subscribe\(/m, "elite_bp subscribes its spawn handler while loading (so the probe's, on the first tick, runs after it)");
    assert.match(shipped, /system\.runTimeout\(\(\) => \{\s*try \{\s*convert\(entity\);/, "elite_bp still converts a tick after the spawn");
    const probe = path.join(dir, "packs", "elite_bp", "scripts", "harness_elite_remove.js");
    parses(probe);
    const text = fs.readFileSync(probe, "utf8");
    assert.match(text, /system\.run\(\(\) => \{\s*world\.afterEvents\.entitySpawn\.subscribe/, "subscribes on the first tick");
    assert.match(text, /ScriptEventSource\.Server/, "console only");
    assert.match(text, /namespaces: \["harness"\]/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("elite-remove: works on a source tree from before the guards", () => {
  const dir = tmp();
  try {
    const src = path.join(dir, "src", "packs", "elite_bp", "scripts");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, "main.js"), 'import "./diag.js";\nimport { world } from "@minecraft/server";\nworld;\n');
    run([path.join(HOOKS, "elite-remove.mjs"), path.join(dir, "out"), path.join(dir, "src")]);
    const main = fs.readFileSync(path.join(dir, "out", "elite_bp", "scripts", "main.js"), "utf8").split("\n");
    assert.deepEqual(main.slice(0, 3), ['import "./diag.js";', 'import "./harness_elite_remove.js";', 'import { world } from "@minecraft/server";']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("claims-taps: the tap probe comes right after diag.js, before main.js subscribes its tap handlers", () => {
  const dir = tmp();
  try {
    run([path.join(HOOKS, "claims-taps.mjs"), path.join(dir, "packs")]);
    const main = fs.readFileSync(path.join(dir, "packs", "claims_bp", "scripts", "main.js"), "utf8").split("\n");
    assert.equal(main[0], 'import "./diag.js";');
    assert.equal(main[1], 'import "./harness_claims_taps.js";');
    const shipped = fs.readFileSync(path.join(ROOT, "packs", "claims_bp", "scripts", "main.js"), "utf8");
    assert.deepEqual([main[0], ...main.slice(2)], shipped.split("\n"), "nothing else changes");
    assert.match(shipped, /^world\.beforeEvents\.playerInteractWithEntity\.subscribe\(/m, "claims_bp subscribes its entity tap handler while loading");
    assert.match(shipped, /^world\.beforeEvents\.playerInteractWithBlock\.subscribe\(/m, "claims_bp subscribes its block tap handler while loading");
    const probe = path.join(dir, "packs", "claims_bp", "scripts", "harness_claims_taps.js");
    parses(probe);
    const text = fs.readFileSync(probe, "utf8");
    assert.match(text, /"playerInteractWithEntity"/);
    assert.match(text, /"playerInteractWithBlock"/);
    assert.match(text, /const sig = world\.beforeEvents\[name\];\s*const subscribe = sig\.subscribe;\s*sig\.subscribe = /, "wraps the signal object's own subscribe, where diag.js puts its wrapper");
    assert.match(fs.readFileSync(path.join(ROOT, "tools", "diag-shared.js"), "utf8"), /sig\.subscribe = function/, "diag.js still replaces each signal's own subscribe");
    assert.match(text, /isFirstEvent: true/, "the block tap is a first tap, like a real player's");
    assert.match(text, /ScriptEventSource\.Server/, "console only");
    assert.match(text, /namespaces: \["harness"\]/);
    assert.throws(() => run([path.join(HOOKS, "claims-taps.mjs"), path.join(dir, "packs")]), "an existing output folder is refused");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
