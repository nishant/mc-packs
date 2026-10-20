// F19: a tornado's wind restart is one stopsound for everyone near it, not one command per listener; every listener
// still gets their own wind clip from their own direction, after the stop. Runs the production everySecond.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

const src = readFileSync(join(import.meta.dirname, "..", "packs", "tornado_bp", "scripts", "main.js"), "utf8").replace(/\r\n/g, "\n");
const fn = (name) => {
  const m = new RegExp(`^function ${name}\\(`, "m").exec(src);
  if (!m) return "";
  return src.slice(m.index, src.indexOf("\n}\n", m.index) + 3);
};

function run(n) {
  /** @type {string[]} */
  const log = [];
  const players = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    isValid: true,
    location: { x: 10 + i, y: 64, z: 0 },
    sendMessage() {},
    runCommand(c) { log.push(`player ${c}`); },
    playSound(id, o) { log.push(`sound ${id} ${o.volume.toFixed(2)}`); },
  }));
  const dim = { getPlayers: () => players, runCommand(c) { log.push(`dim ${c}`); return { successCount: 1 }; } };
  const ctx = {
    console, Math,
    rand: () => 0, groundAt: () => undefined, PATH_POINTS: 10, get: () => 200, compass: () => "N", sendJournal() {},
    CONFIG: { warnDistance: 150, hornEvery: 20, sounds: { horn: "raid.horn", wind: "wind.loop", rumble: "ambient.weather.thunder" } },
    WIND_RANGE: 48, RUMBLE_RANGE: 100, WIND_EVERY: 5, RUMBLE_EVERY: 6, SOUND_BAND: 8,
  };
  vm.createContext(ctx);
  vm.runInContext([fn("everySecond"), fn("volumeAt"), fn("bandVolume"), fn("soundToward")].join("\n") + "\nglobalThis.everySecond = everySecond;", ctx);
  const t = { x: 0, z: 0, y: 64, groundY: 64, heading: 0, path: [], viewers: [], seen: new Set(), warned: new Set(), hornIn: 5, windIn: 1, rumbleIn: 5 };
  ctx.everySecond(t, dim);
  return log;
}

test("one stopsound for all wind listeners, before their new clips", () => {
  const log = run(30);
  const stops = log.filter((l) => l.includes("stopsound"));
  assert.equal(stops.length, 1, `stopsound commands for 30 listeners (${stops.length})`);
  assert.match(stops[0], /^dim stopsound @a\[x=-48,y=-64,z=-48,dx=97,dy=384,dz=97\] wind\.loop$/);
  const winds = log.filter((l) => l.startsWith("sound wind.loop"));
  assert.equal(winds.length, 30, "each listener within 48 blocks still gets the wind");
  assert.ok(log.indexOf(stops[0]) < log.indexOf(winds[0]), "the stop comes before the new clips");
});

test("volume falls off with distance, never below 0.15", () => {
  const log = run(2);
  const vols = log.filter((l) => l.startsWith("sound wind.loop")).map((l) => Number(l.split(" ")[2]));
  assert.deepEqual(vols, [0.79, 0.77]);
});

test("no listener in range: no command", () => {
  const log = run(0);
  assert.equal(log.length, 0);
});
