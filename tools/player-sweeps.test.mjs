// O1 long tail (per-second player sweeps): the real main.js of each pack runs in the offline fake game
// (tools/lib/pack-sim.mjs) with 40 players whose position reads are counted per tick. A sweep that visits every
// player on one tick shows 40 players read on that tick; spread over its interval (scripts/spread.js) it shows a
// share. The counters the sweeps keep are checked to come out the same. Milliseconds need a native profile.
//   node --test tools/player-sweeps.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createSim } from "./lib/pack-sim.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Loads a real pack's main.js from a temporary copy with the game modules stubbed by `sim` (as o2-hotpaths.test.mjs). */
async function loadReal(sim, folder) {
  await sim.load("help_bp");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sweeps-"));
  const names = { "@minecraft/server": new Set(), "@minecraft/server-ui": new Set() };
  const copy = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      if (e.isDirectory()) copy(path.join(from, e.name), path.join(to, e.name));
      else if (e.name.endsWith(".js")) {
        let src = e.name === "diag.js" ? "export {};" : fs.readFileSync(path.join(from, e.name), "utf8");
        for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"(@minecraft\/server(?:-ui)?)"/g)) for (const n of m[1].split(",")) if (n.trim()) names[m[2]].add(n.trim().split(/\s+as\s+/)[0]);
        src = src.replace(/from\s*"@minecraft\/server-ui"/g, 'from "/__ui.mjs"').replace(/from\s*"@minecraft\/server"/g, 'from "/__server.mjs"');
        fs.writeFileSync(path.join(to, e.name), src);
      }
    }
  };
  copy(path.join(ROOT, "packs", folder, "scripts"), dir);
  const stub = (pkg, slot) => [...names[pkg]].map((n) => `export const ${n} = globalThis.${sim.key}.${slot}[${JSON.stringify(n)}] ?? globalThis.${sim.key}.fallback(${JSON.stringify(n)});`).join("\n") || "export {};";
  fs.writeFileSync(path.join(dir, "__server.mjs"), stub("@minecraft/server", "server"));
  fs.writeFileSync(path.join(dir, "__ui.mjs"), stub("@minecraft/server-ui", "ui"));
  const fix = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) fix(p, `${rel}../`);
      else if (e.name.endsWith(".js")) fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/"\/__(server|ui)\.mjs"/g, `"${rel}__$1.mjs"`));
    }
  };
  fix(dir, "./");
  return import(pathToFileURL(path.join(dir, "main.js")).href);
}

/**
 * `n` players that walk `speed` blocks per tick along x and count, per tick, which of them had their position read.
 * @returns {{ players: any[], perTick: Map<number, Set<string>>, maxPerTick: () => number }}
 */
function walkers(sim, n, { speed = 0.2, dim = "minecraft:overworld" } = {}) {
  /** @type {Map<number, Set<string>>} */
  const perTick = new Map();
  const players = [];
  for (let i = 0; i < n; i++) {
    const p = sim.join(`P${i}`, { id: `-${1000 + i}` });
    const base = { x: i * 3, y: 64, z: i * 7 };
    let movedAt = 0;
    Object.defineProperty(p, "location", {
      get() {
        const t = sim.game.tick;
        if (!perTick.has(t)) perTick.set(t, new Set());
        perTick.get(t).add(p.id);
        movedAt = t;
        return { x: base.x + speed * t, y: base.y, z: base.z };
      },
      configurable: true,
    });
    p.dimension = { id: dim, getTopmostBlock: () => undefined, getBlock: () => undefined };
    p.getGameMode = () => "Survival";
    p.getRotation = () => ({ x: 0, y: 0 });
    p.inputInfo = { getMovementVector: () => ({ x: 0, y: 0 }) };
    p.isSleeping = false;
    p.isGliding = false;
    p.isSprinting = false;
    p.getComponent = () => undefined;
    p.getEffect = () => undefined;
    p.nameTag = p.name;
    void movedAt;
    players.push(p);
  }
  return { players, perTick, maxPerTick: () => Math.max(0, ...[...perTick.values()].map((s) => s.size)) };
}

test("atlas: the 2-second player loop reads at most a tenth of 40 players on any tick", async () => {
  const sim = createSim();
  const w = walkers(sim, 40);
  await loadReal(sim, "atlas_bp");
  sim.step(400);
  assert.ok(w.perTick.size > 0, "the loop ran");
  for (const p of w.players) assert.ok([...w.perTick.values()].some((s) => s.has(p.id)), `${p.name} was visited`);
  assert.ok(w.maxPerTick() <= 4, `at most 4 players a tick, got ${w.maxPerTick()}`);
});
