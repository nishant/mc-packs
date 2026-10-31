import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { BDS_BIN } from "./server.mjs";
import { setup } from "../setup.mjs";

const harnessDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const workflow = fs.readFileSync(path.join(harnessDir, "..", "..", ".github", "workflows", "check.yml"), "utf8").replace(/\r\n/g, "\n");

function bdsDirFixture(t) {
  const cache = path.join(harnessDir, ".cache");
  fs.mkdirSync(cache, { recursive: true });
  const root = fs.mkdtempSync(path.join(cache, "setup-"));
  const previous = process.env.BDS_DIR;
  process.env.BDS_DIR = path.join(root, "bds");
  t.after(() => {
    if (previous === undefined) delete process.env.BDS_DIR;
    else process.env.BDS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, dir: process.env.BDS_DIR };
}
const quiet = (fn) => { const log = console.log; console.log = () => {}; try { return fn(); } finally { console.log = log; } };

test("an interrupted unpack leaves no half-installed server, and the next setup completes", (t) => {
  const { root, dir } = bdsDirFixture(t);
  const download = (zip) => fs.writeFileSync(zip, "zip");
  assert.throws(() => quiet(() => setup({ download, extract: (zip, to) => { fs.writeFileSync(path.join(to, "partial.txt"), "x"); throw new Error("disk full"); } })), /disk full/);
  assert.equal(fs.existsSync(dir), false);
  assert.deepEqual(fs.readdirSync(root), [], "the staging folder is removed too");
  quiet(() => setup({ download, extract: (zip, to) => { fs.writeFileSync(path.join(to, BDS_BIN), "binary"); fs.mkdirSync(path.join(to, "behavior_packs")); } }));
  assert.equal(fs.readFileSync(path.join(dir, BDS_BIN), "utf8"), "binary");
  assert.equal(fs.existsSync(path.join(dir, "bds.zip")), false);
  assert.deepEqual(fs.readdirSync(root), ["bds"]);
});

test("an archive without the server binary is not installed, and an unfinished folder is replaced", (t) => {
  const { root, dir } = bdsDirFixture(t);
  const download = (zip) => fs.writeFileSync(zip, "zip");
  assert.throws(() => quiet(() => setup({ download, extract: () => {} })), /did not contain/);
  assert.equal(fs.existsSync(dir), false);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "half-unpacked.txt"), "x"); // an older setup died here
  quiet(() => setup({ download, extract: (zip, to) => fs.writeFileSync(path.join(to, BDS_BIN), "ok") }));
  assert.deepEqual(fs.readdirSync(dir).filter((n) => n !== BDS_BIN), []);
  assert.deepEqual(fs.readdirSync(root), ["bds"]);
});

test("a finished install is left alone: no download, nothing rewritten", (t) => {
  const { dir } = bdsDirFixture(t);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, BDS_BIN), "pristine");
  quiet(() => setup({ download: () => assert.fail("must not download"), extract: () => assert.fail("must not unpack") }));
  assert.equal(fs.readFileSync(path.join(dir, BDS_BIN), "utf8"), "pristine");
});

test("CI runs the Realm Bundle smoke test after check and build, bounded, on a supported OS", () => {
  const smoke = workflow.slice(workflow.indexOf("\n  bds-smoke:"));
  assert.match(workflow, /\n  check:\n[\s\S]*npm run check\n[\s\S]*npm run build\n/, "the offline check and build job stays");
  assert.match(smoke, /needs: check\n/);
  assert.match(smoke, /runs-on: ubuntu-24\.04/);
  assert.match(smoke, /timeout-minutes: 25\n/);
  assert.match(smoke, /echo "BDS_DIR=\$RUNNER_TEMP\/bds"/, "BDS lives under the allocated runner's temp, not /home/user");
  assert.ok(smoke.indexOf("node tools/test-bds/setup.mjs") < smoke.indexOf("node tools/bundle.mjs --all"));
  assert.ok(smoke.indexOf("node tools/bundle.mjs --all") < smoke.indexOf("node tools/test-bds/run.mjs"));
  const header = fs.readFileSync(path.join(harnessDir, "examples", "bundle-smoke.js"), "utf8").replace(/\r\n/g, "\n").match(/node tools\/test-bds\/run\.mjs (.*)/)[1];
  const step = smoke.match(/node tools\/test-bds\/run\.mjs (.*)/)[1];
  assert.equal(step, header, "CI runs exactly the command in the scenario's header");
  assert.match(step, /--bundle dist\/realm_bundle\.mcpack/);
  assert.match(smoke, /run: node tools\/test-bds\/run\.mjs[^\n]*\n\s+timeout-minutes: 10\n/);
  assert.match(smoke, /if: always\(\)\n\s+uses: actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow, /secrets\.|--allow-dirty|publish-packs|upload.*realm/i, "CI never publishes or uploads to the Realm");
});
