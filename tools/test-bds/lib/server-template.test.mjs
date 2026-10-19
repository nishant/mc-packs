import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import * as server from "./server.mjs";
import { T, readLevelDat, writeLevelDat } from "./nbt.mjs";

const harnessDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function fixture(t, name) {
  const cache = path.join(harnessDir, ".cache");
  fs.mkdirSync(cache, { recursive: true });
  const dir = fs.mkdtempSync(path.join(cache, name));
  const previous = process.env.BDS_HARNESS_CACHE;
  process.env.BDS_HARNESS_CACHE = dir;
  t.after(() => {
    if (previous === undefined) delete process.env.BDS_HARNESS_CACHE;
    else process.env.BDS_HARNESS_CACHE = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

const levelDat = (spawnAt = { x: 261, y: 5, z: 5 }) => writeLevelDat({
  version: 10, rootName: "",
  root: { LevelName: { type: T.STRING, value: "world" }, SpawnX: { type: T.INT, value: spawnAt.x }, SpawnY: { type: T.INT, value: spawnAt.y }, SpawnZ: { type: T.INT, value: spawnAt.z } },
});
const writeWorld = (dir, spawnAt) => {
  fs.mkdirSync(path.join(dir, "db"), { recursive: true });
  fs.writeFileSync(path.join(dir, "db", "CURRENT"), "MANIFEST-000001\n");
  fs.writeFileSync(path.join(dir, "level.dat"), levelDat(spawnAt));
};
const deadPid = () => {
  const r = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  return Number(r.stdout);
};

test("pins a flat world's spawn to 0,0 in the template and in every run's copy", async (t) => {
  fixture(t, "spawn-");
  const dest = await server.ensureTemplate({ seed: 1, flat: true, generate: async ({ staging }) => writeWorld(staging, { x: 261, y: 5, z: 5 }) });
  assert.deepEqual(server.readSpawn(path.join(dest, "level.dat")), server.FLAT_SPAWN);
  assert.equal(server.FLAT_SPAWN.x, 0);
  assert.equal(server.FLAT_SPAWN.z, 0);
  // A template whose spawn drifted (an old cache, a hand edit) is still pinned when a run copies it.
  server.pinSpawn(path.join(dest, "level.dat"), { x: 261, y: 5, z: 5 });
  assert.equal(server.isTemplateReady(dest, { flat: true }), false, "a flat template with another spawn is not ready");
  const world = path.join(path.dirname(dest), "run-world");
  server.copyTemplate(dest, world, { flat: true });
  assert.deepEqual(server.readSpawn(path.join(world, "level.dat")), server.FLAT_SPAWN);
  assert.equal(fs.existsSync(path.join(world, "template.ready.json")), false, "the ready marker is not copied into the world");
  // Seed worlds keep the spawn the game chose.
  const seeded = await server.ensureTemplate({ seed: 7, flat: false, generate: async ({ staging }) => writeWorld(staging, { x: 163, y: 70, z: 170 }) });
  assert.deepEqual(server.readSpawn(path.join(seeded, "level.dat")), { x: 163, y: 70, z: 170 });
});

test("patchLevelDat pins the spawn of a flat template and leaves a seeded one alone", (t) => {
  const dir = fixture(t, "patch-");
  const file = path.join(dir, "level.dat");
  fs.writeFileSync(file, levelDat());
  server.patchLevelDat(file, { flat: true });
  assert.deepEqual(server.readSpawn(file), server.FLAT_SPAWN);
  assert.equal(readLevelDat(fs.readFileSync(file)).root.Generator.value, 2);
  fs.writeFileSync(file, levelDat());
  server.patchLevelDat(file, { flat: false });
  assert.deepEqual(server.readSpawn(file), { x: 261, y: 5, z: 5 });
});

test("concurrent cold-cache requests generate once, and nobody sees an unready template", async (t) => {
  fixture(t, "race-");
  let generations = 0;
  const dest = server.templatePath(server.templateKey({ seed: 1, flat: true }));
  let sawUnready = false;
  const watcher = setInterval(() => { if (fs.existsSync(dest) && !server.isTemplateReady(dest, { flat: true })) sawUnready = true; }, 1);
  t.after(() => clearInterval(watcher));
  const generate = async ({ staging }) => {
    generations++;
    await new Promise((r) => setTimeout(r, 150));
    writeWorld(staging);
  };
  const got = await Promise.all([1, 2, 3, 4].map(() => server.ensureTemplate({ seed: 1, flat: true, generate, pollMs: 10 })));
  assert.equal(generations, 1);
  assert.deepEqual([...new Set(got)], [dest]);
  assert.equal(sawUnready, false);
  assert.deepEqual(fs.readdirSync(path.dirname(dest)).filter((n) => /\.lock$|\.tmp-/.test(n)), []);
});

test("separate processes on a cold cache: one generation, one ready folder, no leftovers", () => {
  for (const flag of [[], ["--flat"]]) {
    const r = spawnSync(process.execPath, [path.join(harnessDir, "template-race.mjs"), "--workers", "3", "--gen-ms", "500", ...flag], { encoding: "utf8" });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /3 workers, 1 generated, ok/);
  }
});

test("a template folder without a ready marker is never consumed: legacy ones are adopted, broken ones rebuilt", async (t) => {
  fixture(t, "unready-");
  const key = (flat) => server.templatePath(server.templateKey({ seed: 2, flat }));
  // Legacy seed template (finished before the marker existed): adopted as it is.
  writeWorld(key(false));
  const adopted = await server.ensureTemplate({ seed: 2, flat: false, generate: async () => assert.fail("must not regenerate a finished legacy template"), log: () => {} });
  assert.equal(adopted, key(false));
  assert.equal(server.isTemplateReady(adopted), true);
  // A folder that never got its level.dat: removed and regenerated.
  const broken = key(true);
  fs.mkdirSync(path.join(broken, "db"), { recursive: true });
  fs.writeFileSync(path.join(broken, "db", "partial"), "x");
  let regenerated = 0;
  const lines = [];
  await server.ensureTemplate({ seed: 2, flat: true, log: (l) => lines.push(l), generate: async ({ staging }) => { regenerated++; writeWorld(staging); } });
  assert.equal(regenerated, 1);
  assert.equal(fs.existsSync(path.join(broken, "db", "partial")), false);
  assert.ok(lines.some((l) => /removing an unfinished or unusable world template folder/.test(l)));
  assert.equal(server.isTemplateReady(broken, { flat: true }), true);
});

test("cleans up after a crashed generator and never clobbers a live one", async (t) => {
  const cache = fixture(t, "crash-");
  const dest = server.templatePath(server.templateKey({ seed: 3, flat: false }));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const staging = `${dest}.tmp-dead`;
  fs.mkdirSync(staging);
  fs.writeFileSync(path.join(staging, "half-copied"), "x");
  fs.mkdirSync(`${dest}.lock`);
  fs.writeFileSync(path.join(`${dest}.lock`, "owner.json"), JSON.stringify({ pid: deadPid(), staging, token: "dead", bdsPid: deadPid() }));
  const lines = [];
  await server.ensureTemplate({ seed: 3, flat: false, log: (l) => lines.push(l), generate: async ({ staging: s }) => writeWorld(s) });
  assert.ok(lines.some((l) => /removing the stale template lock .* is gone/.test(l)), lines.join("\n"));
  assert.equal(fs.existsSync(staging), false, "the dead owner's staging folder is removed");
  assert.equal(server.isTemplateReady(dest), true);
  assert.equal(fs.existsSync(`${dest}.lock`), false);

  // A live owner (this process) keeps its lock: the waiter gives up instead of taking it over.
  const other = server.templatePath(server.templateKey({ seed: 4, flat: false }));
  fs.mkdirSync(`${other}.lock`);
  fs.writeFileSync(path.join(`${other}.lock`, "owner.json"), JSON.stringify({ pid: process.pid, token: "live" }));
  await assert.rejects(() => server.ensureTemplate({ seed: 4, flat: false, generate: async () => assert.fail("a live lock must be respected"), lockTimeoutMs: 300, pollMs: 20 }), /timed out after .* waiting for the template lock/);
  assert.equal(fs.existsSync(`${other}.lock`), true);

  // A generator that throws releases the lock and leaves no template behind; the next call regenerates.
  const third = server.templatePath(server.templateKey({ seed: 5, flat: false }));
  await assert.rejects(() => server.ensureTemplate({ seed: 5, flat: false, generate: async ({ staging: s }) => { writeWorld(s); throw new Error("BDS crashed"); } }), /BDS crashed/);
  assert.deepEqual(fs.readdirSync(path.dirname(third)).filter((n) => n.startsWith(path.basename(third))), []);
  await server.ensureTemplate({ seed: 5, flat: false, generate: async ({ staging: s }) => writeWorld(s) });
  assert.equal(server.isTemplateReady(third), true);
  assert.ok(cache);
});

test("reserves distinct port pairs for concurrent runs and reuses a dead run's reservation", async (t) => {
  fixture(t, "ports-");
  const sameSpot = () => 0.5;
  const taken = await Promise.all([1, 2, 3, 4, 5].map(() => server.reservePort({ random: sameSpot, isFree: async () => true })));
  const ports = taken.map((r) => r.port);
  assert.equal(new Set(ports).size, 5, ports.join(","));
  assert.ok(ports.every((p) => p % 2 === 0 && p >= 20000 && p < 40000));
  for (const r of taken) r.release();
  // The OS says the pair is busy: that port is skipped, the next one is used.
  const busy = 20000 + 2 * Math.floor(0.5 * 19000);
  const next = await server.reservePort({ random: sameSpot, isFree: async (p) => p !== busy });
  assert.equal(next.port, busy + 2);
  next.release();
  // A lock whose process is gone is replaced; a live one is not.
  const dir = path.join(process.env.BDS_HARNESS_CACHE, "ports");
  fs.writeFileSync(path.join(dir, `${busy}.lock`), JSON.stringify({ pid: deadPid() }));
  const reused = await server.reservePort({ random: sameSpot, isFree: async () => true });
  assert.equal(reused.port, busy);
  const skipped = await server.reservePort({ random: sameSpot, isFree: async () => true });
  assert.notEqual(skipped.port, busy, "a live reservation is never shared");
  reused.release();
  skipped.release();
  assert.deepEqual(fs.readdirSync(dir), []);
});

test("process ownership is by exact pid", () => {
  assert.equal(server.pidAlive(process.pid), true);
  assert.equal(server.pidAlive(deadPid()), false);
  assert.equal(server.pidAlive(0), false);
  assert.equal(server.pidAlive(-5), false);
  assert.equal(server.pidAlive(NaN), false);
});
