import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
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

test("the bed adapter turns the suite's port into options the official run.mjs accepts, without starting a server", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "build-beds-port-"));
  try {
    const tools = path.join(temp, "tools", "test-bds");
    fs.mkdirSync(path.join(tools, "hooks"), { recursive: true });
    for (const folder of ["build_bp", "build_rp"]) fs.mkdirSync(path.join(temp, "packs", folder, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(temp, "packs", "build_bp", "scripts", "main.js"), "");
    fs.copyFileSync(path.join(root, "tools", "test-bds", "build-beds.mjs"), path.join(tools, "build-beds.mjs"));
    fs.writeFileSync(path.join(tools, "hooks", "build-bed-pipeline.js"), "// fixture\n");
    // The official parser answers --help right after reading the options: it rejects any option it does not know.
    const official = JSON.stringify(path.join(root, "tools", "test-bds", "run.mjs"));
    fs.writeFileSync(path.join(tools, "run.mjs"), [
      'import { spawnSync } from "node:child_process";',
      `const r = spawnSync(process.execPath, [${official}, ...process.argv.slice(2), "--help"], { encoding: "utf8" });`,
      "console.log(JSON.stringify({ status: r.status, args: process.argv.slice(2), out: r.stdout.slice(0, 80), err: r.stderr.slice(0, 200) }));",
      "",
    ].join("\n"));
    const result = spawnSync(process.execPath, [path.join(tools, "build-beds.mjs"), "--port", "19642"], {
      cwd: temp, encoding: "utf8", env: { ...process.env, BDS_HARNESS_CACHE: path.join(temp, "cache") },
    });
    assert.equal(result.status, 0, result.stderr);
    const seen = JSON.parse(result.stdout.trim());
    assert.equal(seen.status, 0, `official run.mjs rejected the forwarded options: ${seen.out} ${seen.err}`);
    assert.ok(!seen.args.includes("--port"), "run.mjs has no --port");
    assert.equal(seen.args[seen.args.indexOf("server-port=19642") - 1], "--prop");
    assert.ok(seen.args.includes("server-portv6=19643"));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
