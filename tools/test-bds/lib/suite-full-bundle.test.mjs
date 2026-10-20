import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const suite = path.resolve(import.meta.dirname, "..", "suite.mjs");
const root = path.resolve(import.meta.dirname, "..", "..", "..");

test("the official suite prepares the genuine cancellation bundle instead of running a header placeholder", () => {
  const result = spawnSync(process.execPath, [suite, "--list", "--filter", "^full-bundle-protocols$"], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /<stage>|skipped|no run command/i);
  assert.match(result.stdout, /full-bundle-protocols: run\.mjs .*--strict .*--bundle /);
  assert.match(result.stdout, /bds-suite-hooks-XXXXXX[\\/]full-bundle-protocols[\\/]realm_bundle/);
  assert.match(result.stdout, /builds and stages the genuine 67-member cancellation bundle/);
  assert.match(result.stdout, /--scenario tools[\\/]test-bds[\\/]examples[\\/]full-bundle-protocols\.js/);
});

test("the official welcome case prepares the genuine bundle instead of a literal stage placeholder", () => {
  const result = spawnSync(process.execPath, [suite, "--list", "--filter", "^welcome-generic-bundle$"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /<stage>|skipped|no run command/i);
  assert.match(result.stdout, /bds-suite-hooks-XXXXXX[\\/]welcome-generic-bundle[\\/]realm_bundle/);
  assert.match(result.stdout, /--scenario tools[\\/]test-bds[\\/]examples[\\/]welcome-generic-bundle\.js/);
});

test("special persistence cases keep their own scenario instead of silently running the default", () => {
  const result = spawnSync(process.execPath, [suite, "--list", "--filter", "^stash-(recover-restart|page-transfer-restart)$"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  for (const name of ["stash-recover-restart", "stash-page-transfer-restart"]) {
    const line = result.stdout.split(/\r?\n/).find((line) => line.startsWith(name + ":"));
    assert.ok(line, name);
    assert.match(line, /node stash-persistence\.mjs --scenario /);
    assert.ok(line.includes(name + ".js"), `${name} must dispatch its actual scenario: ${line}`);
  }
});
