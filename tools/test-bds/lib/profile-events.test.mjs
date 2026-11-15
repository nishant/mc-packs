// The profiler counts script events by id: each pack's sends (system.sendScriptEvent) and its scriptEventReceive
// listeners' calls and ms per id, and the report sums them over the packs per tick (who sends realm:side, what
// realm:actionbar costs the listeners). Runs the real lib/profile.js against a small fake of @minecraft/server.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { scriptEventTotals } from "./profile-report.mjs";

const source = readFileSync(new URL("./profile.js", import.meta.url), "utf8");

function fakeGame(clock = Date) {
  const logs = [];
  class Signal {
    constructor() { this.subs = []; }
    subscribe(cb) { this.subs.push(cb); return cb; }
    unsubscribe(cb) { this.subs = this.subs.filter((x) => x !== cb); }
    fire(ev) { for (const f of [...this.subs]) f(ev); }
  }
  class System {
    constructor() { this.currentTick = 100; this.afterEvents = { scriptEventReceive: new Signal(), other: new Signal() }; this.beforeEvents = {}; }
    run() {}
    runTimeout() {}
    runInterval() {}
    runJob() {}
    sendScriptEvent(id, message) { this.afterEvents.scriptEventReceive.fire({ id, message }); }
  }
  class World { setDynamicProperty() {} }
  const system = new System();
  const world = Object.assign(new World(), { afterEvents: {}, beforeEvents: {} });
  const context = {
    console: { warn: (l) => logs.push(l) },
    Date: clock,
    __mc: { world, system, System, World, Entity: class {}, ItemStack: class {}, ScreenDisplay: class {}, Dimension: class {}, CustomCommandRegistry: class {} },
    globalThis: {},
  };
  context.globalThis = context;
  vm.createContext(context);
  const code = source
    .replace(/^import \{([^}]*)\} from "@minecraft\/server";/m, (_, names) => `const {${names}} = __mc;`)
    .replace("const PACK = __PACK__;", 'const PACK = "side_bp";');
  vm.runInContext(code, context);
  return { system, logs };
}

test("sends and handled events are counted per id in the PROFILE line", () => {
  const { system, logs } = fakeGame();
  // The pack's own listener, subscribed after the profiler wrapped the signal.
  system.afterEvents.scriptEventReceive.subscribe(() => {});
  for (let k = 0; k < 3; k++) system.sendScriptEvent("realm:side", "{}");
  system.sendScriptEvent("realm:actionbar", "{}");
  system.currentTick += 10;
  system.afterEvents.scriptEventReceive.fire({ id: "harness:profile_dump", message: "{}" });
  const line = logs.find((l) => l.startsWith("PROFILE "));
  assert.ok(line, "a PROFILE line");
  const obj = JSON.parse(line.slice("PROFILE ".length));
  assert.deepEqual(obj.scriptEventsSent, { "realm:side": 3, "realm:actionbar": 1 });
  assert.equal(obj.scriptEventsHandled["realm:side"].calls, 3);
  assert.equal(obj.scriptEventsHandled["realm:actionbar"].calls, 1);
  assert.equal(obj.scriptEventsHandled["harness:profile_dump"], undefined); // the profiler dumps before the pack sees the dump
  assert.ok(Array.isArray(obj.slowest), "the longest single calls are listed too (hitches)");
});

test("a callback subscribed to two signals can be unsubscribed from each (PIPE-20)", () => {
  const { system } = fakeGame();
  const cb = () => {};
  system.afterEvents.scriptEventReceive.subscribe(cb);
  system.afterEvents.other.subscribe(cb);
  system.afterEvents.scriptEventReceive.unsubscribe(cb);
  system.afterEvents.other.unsubscribe(cb);
  // The profiler's own listener stays on scriptEventReceive; the pack's wrapper is gone from both.
  assert.equal(system.afterEvents.scriptEventReceive.subs.length, 1);
  assert.equal(system.afterEvents.other.subs.length, 0);
});

test("the final dump sends every timed callback and every call of 1 ms or more, in parts it announces", () => {
  let clock = 1000;
  const { system, logs } = fakeGame({ now: () => clock });
  // Each call to the pack's listener takes 2 ms on the fake clock.
  system.afterEvents.other.subscribe(() => { clock += 2; });
  system.afterEvents.other.fire({});
  system.currentTick += 1;
  system.afterEvents.other.fire({});
  system.currentTick += 5;
  system.afterEvents.scriptEventReceive.fire({ id: "harness:profile_dump", message: '{"final":true}' });
  const of = (type) => logs.filter((l) => l.startsWith(type + " ")).map((l) => JSON.parse(l.slice(type.length + 1)));
  const row = of("PROFILE")[0];
  assert.equal(row.final, true);
  assert.deepEqual(row.parts, { ticks: 1, callbacks: 1, heavy: 1 });
  const cbs = JSON.parse(of("PROFILE_CALLBACKS").map((p) => p.d).join(""));
  assert.equal(cbs.length, 1);
  assert.equal(cbs[0].calls, 2);
  assert.equal(cbs[0].ms, 4);
  const heavy = of("PROFILE_HEAVY").map((p) => p.d).join("").split(",");
  assert.deepEqual(heavy, ["100:2:0", "101:2:0"]);
});

test("the report sums the packs per tick, with who sends each id", () => {
  const rows = [
    { pack: "map_bp", scriptEventsSent: { "realm:side": 30, "realm:actionbar": 4 }, scriptEventsHandled: { "realm:actionbar": { calls: 4, ms: 2 } } },
    { pack: "hud_bp", scriptEventsSent: { "realm:side": 10 }, scriptEventsHandled: { "realm:side": { calls: 40, ms: 6 }, "realm:actionbar": { calls: 4, ms: 1 } } },
    { pack: "old_bp" },
  ];
  const e = scriptEventTotals(rows, 20);
  assert.equal(e.sentTotalPerTick, 44 / 20);
  assert.deepEqual(Object.keys(e.sentPerTick), ["realm:side", "realm:actionbar"]);
  assert.equal(e.sentPerTick["realm:side"], 2);
  assert.deepEqual(e.senders["realm:side"], { map_bp: 30, hud_bp: 10 });
  assert.deepEqual(e.handledPerTick["realm:side"], { calls: 2, ms: 0.3 });
  assert.deepEqual(e.handledPerTick["realm:actionbar"], { calls: 0.4, ms: 0.15 });
  assert.deepEqual(Object.keys(e.handledPerTick), ["realm:side", "realm:actionbar"]);
});
