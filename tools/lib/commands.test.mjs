// registeredNames reads every script of a pack, not just main.js (commands registered from a helper module count).
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { registeredNames } from "./commands.mjs";

const ROOT = join(import.meta.dirname, "..", "..");

test("map_bp: realm:minimap is registered outside main.js and nothing is unresolved", () => {
  const r = registeredNames(join(ROOT, "packs", "map_bp"));
  assert.ok(r.commands.includes("realm:minimap"), `commands: ${r.commands.join(", ")}`);
  assert.equal(r.unresolved, 0);
});

test("a pack with its commands in main.js only still lists them", () => {
  const r = registeredNames(join(ROOT, "packs", "afk_bp"));
  assert.ok(r.commands.length > 0, "afk_bp registers commands from main.js");
  assert.equal(r.unresolved, 0);
});

test("helper modules, single quotes and unreadable names; synced copies and _shared are skipped", () => {
  const dir = mkdtempSync(join(tmpdir(), "cmds-"));
  try {
    const s = join(dir, "scripts");
    mkdirSync(join(s, "sub"), { recursive: true });
    mkdirSync(join(s, "_shared"));
    writeFileSync(join(s, "main.js"), `registry.registerCommand({ name: "realm:a", x: 1 });\nregistry.registerEnum("realm:E", []);\n`);
    writeFileSync(join(s, "sub", "more.js"), `registry.registerCommand({ name: 'realm:b' });\nregistry.registerEnum('realm:F', []);\n`);
    writeFileSync(join(s, "diag-core.js"), `registry.registerCommand({ name: "realm:skipped" });\n`);
    writeFileSync(join(s, "_shared", "x.js"), `registry.registerCommand({ name: "realm:skipped2" });\n`);
    let r = registeredNames(dir);
    assert.deepEqual(r.commands, ["realm:a", "realm:b"]);
    assert.deepEqual(r.enums, ["realm:E", "realm:F"]);
    assert.equal(r.unresolved, 0);
    writeFileSync(join(s, "sub", "bad.js"), `registry.registerCommand({ name: someVar });\n`);
    r = registeredNames(dir);
    assert.equal(r.unresolved, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
