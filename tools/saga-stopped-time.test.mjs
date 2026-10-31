import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../packs/saga_bp/scripts/objectives.js", import.meta.url), "utf8");
const start = source.indexOf("export const isNight");
assert.ok(start >= 0, "isNight exists");
const dayMs = source.indexOf("const DAY_MS");
const headSource = source.slice(start, dayMs >= 0 ? source.indexOf("\n", dayMs) : source.indexOf("\n}\n", start) + 3);
const waitStart = source.indexOf("export function waitDays");
const waitSource = waitStart >= 0 ? source.slice(waitStart, source.indexOf("/** Seconds left on a timed objective")) : "";
const winStart = source.indexOf("export function timeWait");
const winSource = source.slice(winStart, source.indexOf("\n}\n", winStart) + 3);

function make({ cycle = true, tod = 0, abs = 0 } = {}) {
  const state = { cycle, tod, abs };
  const world = {
    getTimeOfDay: () => state.tod,
    getAbsoluteTime: () => state.abs,
    gameRules: { get doDayLightCycle() { return state.cycle; } },
  };
  const strip = (s) => s.replaceAll("export ", "");
  const api = runInNewContext(`${strip(headSource)}\n${strip(waitSource)}\n${strip(winSource)}
    ({ isNight, timeWait, ${waitSource ? "waitDays," : ""} ${source.includes("function nightMet") ? "nightMet," : ""} ${source.includes("function inWindow") ? "inWindow," : ""} })`, { world });
  return { state, ...api };
}

const vigil = { type: "vigil", timeOfDay: [13000, 23000] };

test("a night window is met when the daylight cycle is stopped", () => {
  const { inWindow, timeWait } = make({ cycle: false, tod: 6000 });
  assert.equal(inWindow?.(vigil), true);
  assert.equal(timeWait(vigil), undefined, "no waiting line and no false countdown");
});

test("with the cycle running, a day-time vigil still waits with a countdown", () => {
  const { inWindow, timeWait } = make({ cycle: true, tod: 6000 });
  assert.equal(inWindow?.(vigil), false);
  assert.match(timeWait(vigil), /in about \d+ min/);
});

test("night-only defeats count while time is stopped, and not by day with the cycle on", () => {
  assert.equal(make({ cycle: false, tod: 6000 }).nightMet?.(), true);
  assert.equal(make({ cycle: true, tod: 6000 }).nightMet?.(), false);
  assert.equal(make({ cycle: true, tod: 15000 }).nightMet?.(), true);
});

test("wait days fall back to 20 real minutes a day while the cycle is stopped", () => {
  const { waitDays } = make({ cycle: false });
  const x = {};
  const obj = { type: "wait", days: 2 };
  let dirty = 0;
  const mark = () => dirty++;
  assert.equal(waitDays?.(x, "3", obj, 5000, 0, mark, {}), false);
  assert.equal(x["3"], 5000, "saved world start unchanged");
  assert.equal(waitDays(x, "3", obj, 5000, 39 * 60000, mark, {}), false);
  assert.equal(waitDays(x, "3", obj, 5000, 40 * 60000, mark, {}), true);
});

test("wait days use the world clock when the cycle runs, and never the wall clock", () => {
  const { waitDays } = make({ cycle: true });
  const x = {};
  const obj = { type: "wait", days: 1 };
  waitDays?.(x, "0", obj, 1000, 0, () => {}, {});
  assert.equal(waitDays(x, "0", obj, 1000 + 23999, 99 * 3600000, () => {}, {}), false);
  assert.equal(waitDays(x, "0", obj, 1000 + 24000, 0, () => {}, {}), true);
});

test("progress saved before the fallback existed counts from the first stopped tick", () => {
  const { waitDays } = make({ cycle: false });
  const x = { 1: 100 };
  const obj = { type: "wait", days: 1 };
  assert.equal(waitDays?.(x, "1", obj, 100, 7e9, () => {}, {}), false);
  assert.equal(waitDays(x, "1", obj, 100, 7e9 + 20 * 60000, () => {}, {}), true);
});

test("toggling the cycle back on resumes the world clock without losing the start", () => {
  const m = make({ cycle: false });
  const x = {};
  const obj = { type: "wait", days: 1 };
  m.waitDays?.(x, "0", obj, 0, 0, () => {}, {});
  m.state.cycle = true;
  assert.equal(m.waitDays(x, "0", obj, 24000, 1, () => {}, {}), true);
});

test("a wait that starts while the clock runs does not finish from real time after the clock stops", () => {
  const m = make({ cycle: true });
  const x = {};
  const obj = { type: "wait", days: 1 };
  m.waitDays(x, "0", obj, 1000, 0, () => {}, {});
  assert.equal(x.w0, undefined, "no real-time start is kept while the clock moves");
  m.state.cycle = false;
  assert.equal(m.waitDays(x, "0", obj, 1000, 20 * 60000 + 5, () => {}, {}), false, "stopping later does not count the time spent offline");
  assert.equal(x.w0, 20 * 60000 + 5, "the fallback starts at the first stopped tick");
  assert.equal(m.waitDays(x, "0", obj, 1000, 2 * 20 * 60000 + 5, () => {}, {}), true);
});

const bedStart = source.indexOf("/** Is a block a bed?");
const bedSource = source.slice(bedStart, source.indexOf("world.afterEvents.playerInteractWithBlock.subscribe"));

function bed({ cycle = false, counting = true, steps = [{ e: {}, i: 7, obj: { type: "sleep", vision: [{ title: "Dream" }] } }] } = {}) {
  const bumps = [];
  const dreams = new Map();
  const api = runInNewContext(`${bedSource.replaceAll("export ", "")}\n({ bedWhileStopped })`, {
    timeMoves: () => cycle,
    counting: () => counting,
    open: (_p, type) => (type === "sleep" ? steps : []),
    bump: (_p, _e, i, n) => bumps.push([i, n]),
    dreams,
  });
  return { ...api, bumps, dreams };
}

test("a bed tap with time stopped finishes the open sleep step and queues its vision", () => {
  const b = bed();
  b.bedWhileStopped({ id: "p1" }, { typeId: "minecraft:bed" });
  assert.deepEqual(b.bumps, [[7, 1]]);
  assert.equal(b.dreams.get("p1").length, 1, "the dream plays once the player is up, through the dream queue");
});

test("a bed tap while the clock runs, a non-bed tap or a player who is not counting does nothing", () => {
  const p = { id: "p1" };
  const run = bed({ cycle: true });
  run.bedWhileStopped(p, { typeId: "minecraft:bed" });
  const chest = bed();
  chest.bedWhileStopped(p, { typeId: "minecraft:chest" });
  const away = bed({ counting: false });
  away.bedWhileStopped(p, { typeId: "minecraft:bed" });
  assert.deepEqual([run.bumps, chest.bumps, away.bumps], [[], [], []]);
});

test("the pinned bed family counts, Java color beds and bedrock do not", () => {
  const p = { id: "p1" };
  const hit = (id) => { const w = bed(); w.bedWhileStopped(p, { typeId: id }); return w.bumps.length; };
  assert.equal(hit("minecraft:bed"), 1);
  assert.equal(hit("minecraft:straw_bed"), 1);
  assert.equal(hit("minecraft:red_bed"), 0);
  assert.equal(hit("minecraft:bedrock"), 0);
});

test("the interact handler calls the bed path, and the tick keeps the real isSleeping path", () => {
  assert.match(source, /touched\(player, block\);\s*bedWhileStopped\(player, block\);/);
  assert.match(source, /case "sleep":\s*if \(counts && player\.isSleeping\)/);
});
