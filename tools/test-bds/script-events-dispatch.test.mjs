import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const scenarioFile = path.join(import.meta.dirname, "examples", "script-events-dispatch.js");
const scenario = (await import(pathToFileURL(scenarioFile).href)).default;

// The Realm Bundle's 68 behavior packs in one script context: 66 stand-ins, map_bp and probe_bp.
const BUNDLE = [...Array.from({ length: 66 }, (_, i) => `pack${String(i).padStart(2, "0")}_bp`), "map_bp", "probe_bp"];
const STANDALONE = ["afk_bp", "stats_bp", "maps_bp", "storm_bp", "settings_bp", "admin_bp"];
const PROBE_ERROR = "Error: probe handler c failed on purpose    at <anonymous> (probe_bp/main.js:10)";
const PROBE_ROW = "system.after.scriptEventReceive scriptEvents @ probe_bp/script-events.js:80";
// The windowed diagnostics of the native run: the probe 24 ms in 11 calls, and map_bp 10 ms of its own work (the
// name of map_bp's row is a stand-in: the run only reported its ms).
const ROWS = {
  probe_bp: { ms: 24, calls: 11, top: [{ k: PROBE_ROW, ms: 24, n: 11 }] },
  map_bp: { ms: 10, calls: 4, top: [{ k: "system.after.scriptEventReceive scriptEvents @ map_bp/script-events.js:80", ms: 10, n: 4 }] },
};
const helpFailures = (r) => r.failures.filter((m) => /\/realm:help/.test(m));

/**
 * A stand-in for the harness's `t` and the server: a tick clock, script events delivered one tick after they are sent
 * (to the scenario's listener and to the packs that answer them), and the packs' answers from the fixture.
 * faults: silent / double (packs that never / twice answer realm:help_ping), extraAfter (a pack's realm:help_ping this
 * many ticks after each of the scenario's), hideOwn (the listener does not hear the scenario's own sends), extraError
 * (a script error that no allowError covers), rows (the windowed diagnostics answers per pack).
 */
function fakeRealm({ bundle = true, faults = {}, rows = ROWS } = {}) {
  const packs = bundle ? BUNDLE : STANDALONE;
  let tick = 0;
  let queue = [];
  const subs = [];
  const checks = [];
  const failures = [];
  const logs = [];
  const allowed = [];
  const errors = [];
  const chats = [];
  const order = [];
  let droppedOff = false;
  let late = 0;
  let lateAt = 0;
  if (faults.extraError) errors.push(faults.extraError);

  const json = (message) => {
    try {
      return JSON.parse(message || "null");
    } catch {
      return undefined;
    }
  };
  /** What the packs send back for one script event (only realm: and harness: ids reach them). */
  const answer = (id, message) => {
    switch (id) {
      case "harness:events_report":
        return bundle
          ? [{ id: "harness:events_reply", message: JSON.stringify({ total: BUNDLE.length, packs: BUNDLE.length, notOne: [], direct: [], unsubs: 0, ns: ["realm"] }) }]
          : [];
      case "realm:help_ping": {
        const out = [];
        for (const pack of packs) {
          if (faults.silent?.includes(pack)) continue;
          out.push({ id: "realm:help_pong", message: pack });
          if (faults.double?.includes(pack)) out.push({ id: "realm:help_pong", message: pack });
        }
        return out;
      }
      case "realm:cfg_ping":
        return packs
          .filter((p) => p !== "probe_bp" && p !== "pack00_bp")
          .map((pack) => ({ id: "realm:cfg_schema", message: JSON.stringify({ id: json(message)?.id, pack }) }));
      case "realm:diag_ping":
        return packs.map((pack) => ({
          id: "realm:diag_pong",
          message: JSON.stringify({ id: json(message)?.id, pack, ...(rows[pack] ?? { ms: 0, calls: 0, top: [] }) }),
        }));
      case "realm:probe_order":
        order.push("a", `b:${id}`, "c");
        errors.push(PROBE_ERROR);
        order.push("d");
        return [];
      case "realm:probe_other":
        order.push(`b:${id}`);
        return [];
      case "realm:probe_drop":
        if (!droppedOff) order.push("dropped");
        return [];
      case "realm:probe_late":
        if (lateAt) late++;
        return [];
      case "realm:probe_ask":
        if (message === "drop") droppedOff = true;
        if (message === "clear") order.length = 0;
        return [{ id: "realm:probe_state", message: JSON.stringify({ order: order.slice(-12), late, lateAt, routed: true }) }];
      default:
        return [];
    }
  };
  const deliver = (batch) => {
    for (const ev of batch) {
      const ns = ev.id.split(":")[0];
      for (const sub of subs) {
        if (!sub.namespaces.includes(ns)) continue;
        if (ev.from === "scenario" && faults.hideOwn) continue;
        sub.cb({ id: ev.id, message: ev.message });
      }
      if (ns === "realm" || ns === "harness") {
        for (const r of answer(ev.id, ev.message)) queue.push({ ...r, from: "pack", due: tick + 1 });
      }
    }
  };
  const step = () => {
    tick++;
    if (!lateAt && tick >= 15) lateAt = tick; // the probe's handler registers from an await after startup
    const batch = queue.filter((e) => e.due <= tick);
    queue = queue.filter((e) => e.due > tick);
    deliver(batch);
  };
  const sendScriptEvent = (id, message) => {
    queue.push({ id, message, from: "scenario", due: tick + 1 });
    if (id === "realm:help_ping" && faults.extraAfter) {
      queue.push({ id, message: "", from: "pack", due: tick + 1 + faults.extraAfter });
    }
  };

  const t = {
    packs,
    get tick() {
      return tick;
    },
    system: {
      afterEvents: {
        scriptEventReceive: {
          subscribe: (cb, opts = {}) => {
            subs.push({ cb, namespaces: opts.namespaces ?? [] });
            return cb;
          },
          unsubscribe() {},
        },
      },
      sendScriptEvent,
    },
    async player(name, opts = {}) {
      return { name, ...opts };
    },
    async wait(n = 1) {
      for (let i = 0; i < Math.max(1, Math.floor(n)); i++) step();
    },
    async waitUntil(fn, { timeout = 200, interval = 1, message } = {}) {
      const end = tick + timeout;
      for (;;) {
        let v;
        try {
          v = await fn();
        } catch {
          v = undefined;
        }
        if (v) return v;
        if (tick >= end) throw new Error(message || `waitUntil timed out after ${timeout} ticks`);
        await t.wait(interval);
      }
    },
    cmd(op, text) {
      if (text.startsWith("/realm:maps_give")) {
        chats.push({ tick, plain: 'You received a treasure map! The first clue: "Mind your coordinates."' });
      }
      return { ok: true };
    },
    async console(text) {
      if (text.startsWith("scriptevent realm:maps_test") && text.includes('"found"')) {
        chats.push({ tick, plain: "You found the treasure, washed up and half buried! Its contents are yours." });
      }
    },
    messages: (_op, { since = 0 } = {}) => chats.filter((m) => m.tick >= since),
    waitMessage: (op, re, { since = 0, timeout = 100 } = {}) =>
      t.waitUntil(() => t.messages(op, { since }).some((m) => re.test(m.plain)), { timeout, message: `no message ${re}` }),
    assert(cond, msg = "assertion failed") {
      if (!cond) throw new Error(`assert: ${msg}`);
      checks.push({ ok: true, msg });
    },
    check(cond, msg = "check failed") {
      checks.push({ ok: !!cond, msg });
      if (!cond) failures.push(msg);
      return !!cond;
    },
    log: (...a) => {
      logs.push(a.join(" "));
    },
    allowError: (pattern) => {
      allowed.push(pattern);
    },
  };
  return { t, checks, failures, logs, allowed, errors, get ticks() { return tick; } };
}

/** Runs the scenario once against the fake realm. A throw from the scenario (a timed-out wait) is returned, not rethrown. */
async function run(opts) {
  const realm = fakeRealm(opts);
  let error;
  try {
    await scenario(realm.t);
  } catch (e) {
    error = e;
  }
  const unallowed = realm.errors.filter((e) => !realm.allowed.some((re) => re.test(e)));
  return { ...realm, error, unallowed };
}

test("two requests in one round (the scenario's and a pack's startup ping), each answered once by all 68 packs, pass the /realm:help checks", async () => {
  const r = await run({ faults: { extraAfter: 3 } });
  assert.equal(r.error, undefined, String(r.error));
  assert.deepEqual(helpFailures(r), []);
  assert.ok(r.logs.some((l) => /\/realm:help round: 2 requests/.test(l)), r.logs.join("\n"));
});

test("the same round when the listener does not hear the scenario's own request still counts it, and passes", async () => {
  const r = await run({ faults: { extraAfter: 3, hideOwn: true } });
  assert.equal(r.error, undefined, String(r.error));
  assert.deepEqual(helpFailures(r), []);
  assert.ok(r.logs.some((l) => /\/realm:help round: 2 requests/.test(l)), r.logs.join("\n"));
});

test("a pack that answers /realm:help twice in one round fails the check, and the failure names the pack", async () => {
  const r = await run({ faults: { double: ["pack07_bp"] } });
  assert.equal(r.error, undefined, String(r.error));
  assert.ok(helpFailures(r).some((m) => /pack07_bp/.test(m)), JSON.stringify(r.failures));
});

test("a pack that never answers /realm:help fails the check, and the round still ends", async () => {
  const r = await run({ faults: { silent: ["pack11_bp"] } });
  assert.equal(r.error, undefined, String(r.error));
  assert.ok(helpFailures(r).length > 0, JSON.stringify(r.failures));
});

test("the late handler's 24 ms is the probe's; map_bp's own 10 ms is logged as unrelated and fails nothing", async () => {
  const r = await run({});
  assert.equal(r.error, undefined, String(r.error));
  assert.deepEqual(r.failures, []);
  assert.ok(r.logs.some((l) => /unrelated work over 10 ms.*map_bp 10 ms/.test(l)), r.logs.join("\n"));
});

test("a pack whose rows name the probe's handler fails the attribution check, even when its own time is under 10 ms", async () => {
  const rows = { ...ROWS, map_bp: { ms: 1, calls: 1, top: [{ k: PROBE_ROW, ms: 1, n: 1 }] } };
  const r = await run({ rows });
  assert.equal(r.error, undefined, String(r.error));
  assert.ok(r.failures.some((m) => /map_bp/.test(m)), JSON.stringify(r.failures));
});

test("the probe's own row must name its script event callback", async () => {
  const rows = { ...ROWS, probe_bp: { ms: 24, calls: 11, top: [{ k: "system.after.sendScriptEvent @ probe_bp/main.js:12", ms: 24, n: 11 }] } };
  const r = await run({ rows });
  assert.ok(r.failures.some((m) => /script event callback/.test(m)), JSON.stringify(r.failures));
});

test("allowError covers only the probe handler's error: another error on purpose still fails the run", async () => {
  const unrelated = "Error: unrelated on purpose    at <anonymous> (map_bp/main.js:3)";
  const r = await run({ faults: { extraError: unrelated } });
  assert.equal(r.error, undefined, String(r.error));
  assert.equal(r.allowed.length, 1);
  assert.deepEqual(r.unallowed, [unrelated]);
  assert.ok(r.allowed[0].test(PROBE_ERROR));
});

test("standalone packs (no counter, no probe): each answers once and the protocol checks pass", async () => {
  const r = await run({ bundle: false });
  assert.equal(r.error, undefined, String(r.error));
  assert.deepEqual(r.failures, []);
  assert.ok(r.logs.some((l) => /no counter in this run/.test(l)), r.logs.join("\n"));
});

test("standalone: a pack's startup ping in the round is counted, not taken for a duplicate", async () => {
  const r = await run({ bundle: false, faults: { extraAfter: 3 } });
  assert.equal(r.error, undefined, String(r.error));
  assert.deepEqual(helpFailures(r), []);
});
