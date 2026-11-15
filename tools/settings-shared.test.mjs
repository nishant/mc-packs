import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("./settings-shared.js", import.meta.url), "utf8");

/** The factory with its imports and export removed, so it can run in a fresh context that supplies world, Player and system. */
const factory = source.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");

function fixture(defaultOn = true) {
  const worldProps = new Map();
  const writes = [];
  const playerProps = new Map();
  class Player {
    getDynamicProperty(key) {
      return playerProps.get(key);
    }
    setDynamicProperty(key, value) {
      writes.push({ key, value });
      if (value === undefined) playerProps.delete(key);
      else playerProps.set(key, value);
    }
  }
  const player = new Player();
  const handlers = [];
  const context = {
    Player,
    system: { sendScriptEvent() {} },
    world: {
      getDynamicProperty: (key) => worldProps.get(key),
      setDynamicProperty(key, value) {
        if (value === undefined) worldProps.delete(key);
        else worldProps.set(key, value);
      },
      getEntity: () => undefined,
    },
    console,
    handlers,
  };
  runInNewContext(
    `${factory}
globalThis.api = createSettings({
  PACK: "stats_bp",
  PREFIX: "stats",
  TITLE: "Stats",
  BASE: { tickerDefaultOn: ${defaultOn} },
  OPTIONS: [
    { key: "tickerDefaultOn", scope: "world", type: "bool" },
    { key: "ticker", scope: "player", type: "bool", base: "tickerDefaultOn", sticky: true },
    { key: "ordinary", scope: "player", type: "bool", base: "tickerDefaultOn" },
    { key: "ownProperty", scope: "player", type: "bool", base: "tickerDefaultOn", prop: "stats:oldTicker", sticky: true },
  ],
  onScriptEvent: (ids, fn) => handlers.push({ ids, fn }),
});`,
    context,
  );
  return { api: context.api, player, playerProps, writes, handlers, worldProps };
}

test("the factory returns the helper's exports and subscribes once to the settings events", () => {
  const { api, handlers } = fixture(true);
  assert.deepEqual(Object.keys(api).sort(), ["get", "getFor", "onChange", "reset", "set", "setFor"]);
  assert.equal(handlers.length, 1);
  assert.deepEqual([...handlers[0].ids], ["realm:cfg_ping", "realm:cfg_set", "realm:cfg_reset"]);
});

test("two calls of the factory keep independent state", () => {
  const a = fixture(true);
  const b = fixture(true);
  const seen = [];
  a.api.onChange((key) => seen.push(key));
  assert.equal(a.api.set("tickerDefaultOn", false), undefined);
  assert.equal(a.api.get("tickerDefaultOn"), false);
  assert.equal(b.api.get("tickerDefaultOn"), true, "the other copy still has the config.js value");
  assert.deepEqual(seen, ["tickerDefaultOn"]);
  b.api.set("tickerDefaultOn", false);
  assert.deepEqual(seen, ["tickerDefaultOn"], "listeners belong to one instance");
  assert.equal(a.handlers.length, 1);
  assert.equal(b.handlers.length, 1);
});

test("an explicit ticker on remains on after the realm default changes", () => {
  const { api, player, playerProps } = fixture(true);
  assert.equal(api.setFor(player, "ticker", true), undefined);
  assert.equal(typeof playerProps.get("stats:pref"), "string", "the explicit matching choice is saved");
  assert.equal(JSON.parse(playerProps.get("stats:pref")).ticker, true);
  assert.equal(api.set("tickerDefaultOn", false), undefined);
  assert.equal(api.getFor(player, "ticker"), true);
});

test("an explicit ticker off remains off after an off default changes", () => {
  const { api, player, playerProps } = fixture(false);
  assert.equal(api.setFor(player, "ticker", false), undefined);
  assert.equal(typeof playerProps.get("stats:pref"), "string", "the explicit matching choice is saved");
  assert.equal(JSON.parse(playerProps.get("stats:pref")).ticker, false);
  assert.equal(api.set("tickerDefaultOn", true), undefined);
  assert.equal(api.getFor(player, "ticker"), false);
});

test("ordinary preferences still follow later defaults when the chosen value matches", () => {
  const { api, player, playerProps } = fixture(true);
  assert.equal(api.setFor(player, "ordinary", true), undefined);
  assert.equal(playerProps.has("stats:pref"), false);
  api.set("tickerDefaultOn", false);
  assert.equal(api.getFor(player, "ordinary"), false);
});

test("sticky own-property options retain their original property and explicit value", () => {
  const { api, player, playerProps } = fixture(true);
  api.setFor(player, "ownProperty", true);
  assert.equal(playerProps.get("stats:oldTicker"), true);
  api.set("tickerDefaultOn", false);
  assert.equal(api.getFor(player, "ownProperty"), true);
  assert.equal(playerProps.has("stats:pref"), false);
});

test("stored legacy choices and unknown preference fields are preserved", () => {
  const { api, player, playerProps } = fixture(true);
  playerProps.set("stats:pref", JSON.stringify({ ticker: false, legacy: { kept: 7 } }));
  assert.equal(api.getFor(player, "ticker"), false);
  api.setFor(player, "ticker", true);
  assert.deepEqual(JSON.parse(playerProps.get("stats:pref")), { ticker: true, legacy: { kept: 7 } });
  api.reset();
  assert.equal(api.getFor(player, "ticker"), true);
});

test("absent historical choices remain absent rather than inventing a migration", () => {
  const { api, player, playerProps, writes } = fixture(true);
  assert.equal(api.getFor(player, "ticker"), true);
  assert.equal(api.getFor(player, "ticker"), true);
  assert.equal(playerProps.has("stats:pref"), false);
  assert.equal(writes.length, 0);
});

test("invalid sticky values are rejected without writes and changes notify once", () => {
  const { api, player, writes } = fixture(true);
  const changed = [];
  api.onChange((key, target) => changed.push({ key, target }));
  assert.equal(api.setFor(player, "ticker", "off"), "must be enabled or disabled");
  assert.equal(writes.length, 0);
  assert.equal(changed.length, 0);
  assert.equal(api.setFor(player, "ticker", true), undefined);
  assert.equal(writes.length, 1);
  assert.deepEqual(changed, [{ key: "ticker", target: player }]);
});

test("only the ticker on/off choice opts into sticky behavior and its realm switch is an allowance", () => {
  const settings = readFileSync(new URL("../packs/stats_bp/scripts/settings.js", import.meta.url), "utf8");
  const header = settings.slice(0, settings.indexOf("// ---- Shared:"));
  const ticker = header.split("\n").find((line) => line.includes('key: "ticker",'));
  assert.match(ticker, /sticky: true/);
  assert.equal((header.match(/sticky: true/g) ?? []).length, 1);
  assert.match(header, /key: "tickerEnabled"[^\n]*label: "Allow the stats ticker"/);
});

test("the Large profile allows personal tickers with this Realm's enabled default", () => {
  const presets = readFileSync(new URL("../packs/admin_bp/scripts/presets.js", import.meta.url), "utf8");
  for (const key of ["tickerEnabled", "tickerDefaultOn"]) {
    assert.match(presets, new RegExp(`pack: "stats_bp", key: "${key}", large: true`));
  }
});

/** The answer to one realm:cfg_ping, as the old code built it: the whole envelope stringified again for every option. */
function oldAnswer(req, pack, title, described) {
  const bytes = (s) => {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? 2 : 3;
    }
    return n;
  };
  const envelope = (options, part, parts) => JSON.stringify({ id: req.id, pack, title, part, parts, options });
  const parts = [[]];
  for (const o of described) {
    const last = parts.at(-1);
    if (last.length && bytes(envelope([...last, o], 99, 99)) > 2048) parts.push([o]);
    else last.push(o);
  }
  return parts.map((options, i) => envelope(options, i + 1, parts.length));
}

function schemaFixture(count) {
  const sent = [];
  const handlers = [];
  const options = [];
  for (let i = 0; i < count; i++) {
    const help = `Option ${i} ${"é".repeat(i % 7)}${"x".repeat((i * 37) % 160)} §7gray`;
    if (i % 3 === 0) options.push({ key: `p${i}`, scope: "player", type: "bool", label: `Player ${i}`, help, default: i % 2 === 0 });
    else options.push({ key: `w${i}`, scope: "world", type: "int", label: `World ${i}`, help, min: 0, max: 100 + i });
  }
  const BASE = Object.fromEntries(options.filter((o) => o.scope === "world").map((o, i) => [o.key, i]));
  class Player {
    getDynamicProperty(key) {
      return key === "big:pref" ? JSON.stringify({ p0: false, p3: true }) : undefined;
    }
  }
  const player = new Player();
  const context = {
    Player,
    system: { sendScriptEvent: (id, message) => sent.push({ id, message }) },
    world: { getDynamicProperty: () => undefined, setDynamicProperty() {}, getEntity: (id) => (id === "P1" ? player : undefined) },
    console,
    handlers,
    OPTS: options,
    BASE,
  };
  runInNewContext(`${factory}
globalThis.api = createSettings({ PACK: "big_bp", PREFIX: "big", TITLE: "Big Pack", BASE, OPTIONS: OPTS, onScriptEvent: (ids, fn) => handlers.push({ ids, fn }) });`, context);
  const ping = (req) => {
    sent.length = 0;
    for (const h of handlers) if (h.ids.includes("realm:cfg_ping")) h.fn({ id: "realm:cfg_ping", message: JSON.stringify(req) });
    return sent.filter((e) => e.id === "realm:cfg_schema").map((e) => e.message);
  };
  return { ping, options };
}

test("cfg_schema parts are byte-identical to the old whole-envelope packing", () => {
  for (const count of [0, 1, 5, 40, 120]) {
    const { ping } = schemaFixture(count);
    for (const req of [{ id: "a1" }, { id: "b2", player: "P1" }, { player: "P1" }]) {
      const got = ping(req);
      const described = got.flatMap((m) => JSON.parse(m).options);
      assert.deepEqual(got, oldAnswer(req, "big_bp", "Big Pack", described), `${count} options, ${JSON.stringify(req)}`);
      assert.ok(got.every((m) => Buffer.byteLength(m) <= 2048), "every part fits");
      if (count >= 40) assert.ok(got.length > 1, "a long answer comes in parts");
    }
  }
});

test("a cfg_ping that names other packs gets no answer from this one", () => {
  const { ping } = schemaFixture(5);
  assert.equal(ping({ id: "x", pack: "other_bp" }).length, 0);
  assert.equal(ping({ id: "x", packs: ["other_bp", "more_bp"] }).length, 0);
  assert.equal(ping({ id: "x", pack: "big_bp" }).length, 1);
  assert.equal(ping({ id: "x", packs: ["other_bp", "big_bp"] }).length, 1);
  assert.equal(ping({ id: "x" }).length, 1);
});

test("a player's answer reads their saved preferences", () => {
  const { ping } = schemaFixture(6);
  const opts = ping({ id: "p", player: "P1" }).flatMap((m) => JSON.parse(m).options);
  assert.equal(opts.find((o) => o.key === "p0").value, false);
  assert.equal(opts.find((o) => o.key === "p3").value, true);
});

test("a cfg_ping with a scope gets only that scope's options, and silence from a pack without any", () => {
  const { ping } = schemaFixture(9);
  const opts = (req) => ping(req).flatMap((m) => JSON.parse(m).options);
  assert.ok(opts({ id: "w", player: "P1", scope: "world" }).every((o) => o.scope === "world"));
  assert.ok(opts({ id: "p", player: "P1", scope: "player" }).every((o) => o.scope === "player"));
  assert.equal(opts({ id: "p", player: "P1", scope: "player" }).length, 3);
  const { ping: one } = schemaFixture(1); // a single player option, no world ones
  assert.equal(one({ id: "w", scope: "world" }).length, 0);
});
