import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import * as server from "./server.mjs";
import { BDS_URL, setup } from "../setup.mjs";

const isWin = process.platform === "win32";
const binary = isWin ? "bedrock_server.exe" : "bedrock_server";
const harnessDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("uses native file paths for the harness directory", () => {
  assert.equal(server.HERE, harnessDir);
});

test("selects the platform binary and download", () => {
  assert.equal(server.IS_WIN, isWin);
  assert.equal(server.BDS_BIN, binary);
  assert.equal(BDS_URL, `https://www.minecraft.net/bedrockdedicatedserver/bin-${isWin ? "win" : "linux"}/bedrock-server-${server.BDS_VERSION}.zip`);
});

test("defaults to the platform installation directory and honors BDS_DIR", (t) => {
  const previous = process.env.BDS_DIR;
  t.after(() => {
    if (previous === undefined) delete process.env.BDS_DIR;
    else process.env.BDS_DIR = previous;
  });
  delete process.env.BDS_DIR;
  assert.equal(server.bdsDir(), isWin ? path.join(os.homedir(), ".bds") : "/home/user/bds");
  process.env.BDS_DIR = path.join(harnessDir, "custom-bds");
  assert.equal(server.bdsDir(), process.env.BDS_DIR);
});

test("isolates writable server files while sharing runtime assets", async (t) => {
  const cache = path.join(harnessDir, ".cache");
  fs.mkdirSync(cache, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(cache, "server test-"));
  const src = path.join(fixture, "source");
  const runs = path.join(fixture, "runs");
  fs.mkdirSync(src);
  fs.mkdirSync(runs);
  const previous = { BDS_DIR: process.env.BDS_DIR, BDS_HARNESS_TMP: process.env.BDS_HARNESS_TMP };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(fixture, { recursive: true, force: true });
  });
  process.env.BDS_DIR = src;
  process.env.BDS_HARNESS_TMP = runs;
  fs.writeFileSync(path.join(src, binary), "binary");
  fs.writeFileSync(path.join(src, "runtime.dll"), "runtime");
  fs.writeFileSync(path.join(src, "server.properties"), "server-name=original\n");
  for (const name of ["behavior_packs", "resource_packs", "definitions", "data", "worlds"]) {
    fs.mkdirSync(path.join(src, name));
    fs.writeFileSync(path.join(src, name, "asset"), name);
  }
  const dir = server.makeServerDir();
  assert.equal(setup(), src);
  assert.equal(fs.readFileSync(path.join(dir, binary), "utf8"), "binary");
  assert.equal(fs.statSync(path.join(dir, binary)).ino, fs.statSync(path.join(src, binary)).ino);
  assert.equal(fs.readFileSync(path.join(dir, "runtime.dll"), "utf8"), "runtime");
  if (isWin) {
    assert.equal(fs.statSync(path.join(dir, "runtime.dll")).ino, fs.statSync(path.join(src, "runtime.dll")).ino);
    assert.ok(fs.lstatSync(path.join(dir, "data")).isSymbolicLink());
  }
  assert.ok(fs.statSync(path.join(dir, "development_behavior_packs")).isDirectory());
  assert.ok(fs.statSync(path.join(dir, "development_resource_packs")).isDirectory());
  assert.equal(fs.existsSync(path.join(dir, "worlds")), false);
  server.writeProps(dir, { "server-name": "test" });
  assert.equal(fs.readFileSync(path.join(src, "server.properties"), "utf8"), "server-name=original\n");
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(fs.readFileSync(path.join(src, "data", "asset"), "utf8"), "data");
  await t.test("copies runtime assets when Windows linking is unavailable", { skip: !isWin }, (t) => {
    const unavailable = () => { throw Object.assign(new Error("cross-device link"), { code: "EXDEV" }); };
    t.mock.method(fs, "linkSync", unavailable);
    t.mock.method(fs, "symlinkSync", unavailable);
    const copied = server.makeServerDir();
    assert.equal(fs.readFileSync(path.join(copied, binary), "utf8"), "binary");
    assert.equal(fs.readFileSync(path.join(copied, "runtime.dll"), "utf8"), "runtime");
    assert.equal(fs.readFileSync(path.join(copied, "data", "asset"), "utf8"), "data");
    assert.notEqual(fs.statSync(path.join(copied, binary)).ino, fs.statSync(path.join(src, binary)).ino);
    assert.equal(fs.lstatSync(path.join(copied, "data")).isSymbolicLink(), false);
    fs.rmSync(copied, { recursive: true, force: true });
    assert.equal(fs.readFileSync(path.join(src, "data", "asset"), "utf8"), "data");
  });
});
