import assert from "node:assert/strict";
import { test } from "node:test";
import { checkManifest } from "./check-manifests.mjs";

const U = (/** @type {number} */ n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function bp(/** @type {any} */ over = {}) {
  return {
    format_version: 2,
    header: { name: "Good", description: "A good pack.", uuid: U(1), version: [1, 0, 0], min_engine_version: [1, 21, 100] },
    modules: [
      { type: "data", uuid: U(2), version: [1, 0, 0] },
      { type: "script", language: "javascript", uuid: U(3), version: [1, 0, 0], entry: "scripts/main.js" },
    ],
    dependencies: [
      { module_name: "@minecraft/server", version: "2.1.0" },
      { module_name: "@minecraft/server-ui", version: "2.0.0" },
    ],
    ...over,
  };
}

function rp() {
  return {
    format_version: 2,
    header: { name: "Good RP", description: "A good resource pack.", uuid: U(10), version: [1, 0, 0], min_engine_version: [1, 21, 100] },
    modules: [{ type: "resources", uuid: U(11), version: [1, 0, 0] }],
  };
}

const ctx = (/** @type {any} */ over = {}) => ({ uuids: new Map(), headerUuids: new Set([U(1), U(10)]), importsUi: true, entryExists: true, ...over });

test("a good behavior pack and a good resource pack have no problems", () => {
  assert.deepEqual(checkManifest("good_bp", bp(), ctx()), []);
  assert.deepEqual(checkManifest("good_rp", rp(), ctx()), []);
});

test("a duplicate uuid across packs is reported", () => {
  const shared = ctx();
  assert.deepEqual(checkManifest("a_bp", bp(), shared), []);
  const other = bp();
  other.header.uuid = U(99);
  other.modules[0].uuid = U(2); // same as a_bp's data module
  const problems = checkManifest("b_bp", other, shared);
  assert.ok(problems.length >= 1);
  assert.match(problems[0], /already used by a_bp/);
});

test("a wrong script entry or language is reported", () => {
  const m = bp();
  m.modules[1].entry = "scripts/index.js";
  assert.match(checkManifest("x_bp", m, ctx()).join("\n"), /entry must be "scripts\/main\.js"/);
  assert.match(checkManifest("x_bp", bp(), ctx({ entryExists: false })).join("\n"), /does not exist/);
});

test("an unknown module or version is reported", () => {
  const m = bp({ dependencies: [{ module_name: "@minecraft/server", version: "2.2.0-beta" }, { module_name: "@minecraft/server-ui", version: "2.0.0" }] });
  assert.match(checkManifest("x_bp", m, ctx()).join("\n"), /@minecraft\/server must be version 2\.1\.0/);
  const unknown = bp({ dependencies: [{ module_name: "@minecraft/server", version: "2.1.0" }, { module_name: "@minecraft/debug-utilities", version: "1.0.0" }] });
  assert.match(checkManifest("x_bp", unknown, ctx({ importsUi: false })).join("\n"), /not one of/);
});

test("server-ui is a dependency exactly when a script imports it", () => {
  assert.match(checkManifest("x_bp", bp(), ctx({ importsUi: false })).join("\n"), /no script imports it/);
  const noUi = bp({ dependencies: [{ module_name: "@minecraft/server", version: "2.1.0" }] });
  assert.match(checkManifest("x_bp", noUi, ctx()).join("\n"), /doesn't depend on it/);
});

test("folder, format, versions and ASCII are checked", () => {
  const m = bp({ format_version: 1 });
  m.header.name = "Café";
  m.header.version = [1, 0];
  const text = checkManifest("odd", m, ctx()).join("\n");
  assert.match(text, /_bp or _rp/);
  assert.match(text, /format_version must be 2/);
  assert.match(text, /plain ASCII/);
  assert.match(text, /header\.version/);
  assert.match(checkManifest("x_rp", { ...rp(), modules: [{ type: "script", uuid: U(11), version: [1, 0, 0] }] }, ctx()).join("\n"), /"resources"/);
});
