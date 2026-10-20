import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("./settings-shared.js", import.meta.url), "utf8");

function fixture(defaultOn = true) {
  const worldProps = new Map();
  const writes = [];
  const playerProps = new Map();
  const player = {
    getDynamicProperty: (key) => playerProps.get(key),
    setDynamicProperty(key, value) {
      writes.push({ key, value });
      if (value === undefined) playerProps.delete(key);
      else playerProps.set(key, value);
    },
  };
  const context = {
    PREFIX: "stats",
    BASE: { tickerDefaultOn: defaultOn },
    OPTIONS: [
      { key: "tickerDefaultOn", scope: "world", type: "bool" },
      { key: "ticker", scope: "player", type: "bool", base: "tickerDefaultOn", sticky: true },
      { key: "ordinary", scope: "player", type: "bool", base: "tickerDefaultOn" },
      { key: "ownProperty", scope: "player", type: "bool", base: "tickerDefaultOn", prop: "stats:oldTicker", sticky: true },
    ],
    world: {
      getDynamicProperty: (key) => worldProps.get(key),
      setDynamicProperty(key, value) {
        if (value === undefined) worldProps.delete(key);
        else worldProps.set(key, value);
      },
    },
    console,
  };
  const end = source.indexOf("// Realm Settings protocol");
  assert(end > 0, "use the real shared preference code before the event protocol");
  runInNewContext(
    source.slice(0, end).replace(/^export /gm, "") + "\nglobalThis.api = { getFor, setFor, set, reset, onChange };",
    context,
  );
  return { api: context.api, player, playerProps, writes };
}

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
