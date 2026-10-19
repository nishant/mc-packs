import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { findBash, forward, recipeVariableS, runRecipe, shellQuote, stageRecipe, stageWord } from "./recipe.mjs";

const harnessDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = path.resolve(harnessDir, "..", "..");

function fixtureDir(t, name) {
  const cache = path.join(harnessDir, ".cache");
  fs.mkdirSync(cache, { recursive: true });
  const dir = fs.mkdtempSync(path.join(cache, name));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("quotes a stage path with spaces and apostrophes in every quoting context", () => {
  const stage = "C:\\Users\\Jo O'Neil\\Temp\\bds hooks\\title-hold";
  const out = stageRecipe(`mkdir -p /tmp/th && printf 'a' > "/tmp/th/b" && node -e 'x("/tmp/th/c")' /tmp/th`, stage);
  assert.equal(
    out,
    `mkdir -p 'C:/Users/Jo O'\\''Neil/Temp/bds hooks/title-hold/'th && printf 'a' > "C:/Users/Jo O'Neil/Temp/bds hooks/title-hold/th/b" && node -e 'x("C:/Users/Jo O'\\''Neil/Temp/bds hooks/title-hold/th/c")' 'C:/Users/Jo O'\\''Neil/Temp/bds hooks/title-hold/'th`,
  );
  assert.equal(forward(stage), "C:/Users/Jo O'Neil/Temp/bds hooks/title-hold");
});

test("refuses a stage path it cannot quote safely", () => {
  const bad = ['C:\\x"y', "/a/$HOME", "/a/`b`", "/a/b\nc"];
  if (process.platform !== "win32") bad.push("/a/b\\c"); // a backslash is a file name character off Windows
  for (const dir of bad) assert.throws(() => stageRecipe("mkdir /tmp/x", dir), /cannot be put into a recipe safely/, dir);
});

test("copies a here-document body literally and keeps its quotes out of the quote tracking", () => {
  const recipe = ["cat >> /tmp/rr/main.js <<'HOOK'", "const a = \"it's\"; // it's a hook", "const dir = '/tmp/rr/x';", "HOOK", "echo done > /tmp/rr/done"].join("\n");
  const out = stageRecipe(recipe, "/work/stage one");
  assert.equal(out.split("\n")[1], "const a = \"it's\"; // it's a hook");
  assert.equal(out.split("\n")[2], "const dir = '/work/stage one/rr/x';");
  assert.equal(out.split("\n")[4], "echo done > '/work/stage one/'rr/done");
});

test("maps /tmp/ and $S in a run command to the native stage path", () => {
  const recipe = "S=/tmp/claimtaps; rm -rf $S && mkdir -p $S/mini_bp";
  assert.equal(recipeVariableS(recipe), "/tmp/claimtaps");
  assert.equal(recipeVariableS("S='/tmp/a b' && true"), "/tmp/a b");
  assert.equal(stageWord("$S", recipe, "C:\\Temp\\my stage\\x"), "C:/Temp/my stage/x/claimtaps");
  assert.equal(stageWord("/tmp/mc", "", "C:\\Temp\\my stage\\x"), "C:/Temp/my stage/x/mc");
  assert.equal(stageWord("--timeout", recipe, "/s"), "--timeout");
});

test("a staged recipe builds its files in a folder with spaces and an apostrophe", async (t) => {
  const dir = fixtureDir(t, "recipe stage's ");
  const recipe = [
    "S=/tmp/swe; rm -rf $S && mkdir -p $S/pk",
    "printf 'one' > $S/pk/one.txt",
    `node -e 'require("fs").writeFileSync("/tmp/swe/pk/two.txt", "two")'`,
    "cat >> /tmp/swe/pk/three.txt <<'HOOK'",
    "three \"quoted\" it's",
    "HOOK",
  ].join("\n");
  const r = runRecipe(stageRecipe(recipe, dir), { cwd: root });
  assert.equal(r.status, 0, `${r.stderr}${r.stdout}`);
  const pk = path.join(dir, "swe", "pk");
  assert.equal(fs.readFileSync(path.join(pk, "one.txt"), "utf8"), "one");
  assert.equal(fs.readFileSync(path.join(pk, "two.txt"), "utf8"), "two");
  assert.equal(fs.readFileSync(path.join(pk, "three.txt"), "utf8"), "three \"quoted\" it's\n");
  assert.equal(path.resolve(stageWord("$S", recipe, dir)), path.join(dir, "swe"));
});

test("shellQuote round-trips through bash", (t) => {
  const dir = fixtureDir(t, "quote ");
  const odd = "a b 'c' \"d\" $e `f` g\\h";
  const r = runRecipe(`printf %s ${shellQuote(odd)} > ${shellQuote(forward(path.join(dir, "out.txt")))}`, { cwd: root });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(dir, "out.txt"), "utf8"), odd);
});

test("findBash on Windows takes Git for Windows' bash and never the WSL launcher", () => {
  const git = "C:\\Program Files\\Git\\bin\\bash.exe";
  const present = new Set([git, "C:\\Windows\\System32\\bash.exe", "C:\\Program Files\\Git\\cmd\\git.exe"].map((p) => p.toLowerCase()));
  const exists = (p) => present.has(p.toLowerCase());
  const env = { PATH: "C:\\Windows\\System32;C:\\Program Files\\Git\\cmd" };
  assert.equal(findBash({ platform: "win32", env, exists }), git);
  assert.throws(() => findBash({ platform: "win32", env: { PATH: "C:\\Windows\\System32" }, exists: (p) => p.toLowerCase() === "c:\\windows\\system32\\bash.exe" }), /install Git for Windows/);
  assert.equal(findBash({ platform: "linux", env: {}, exists }), "bash");
  assert.throws(() => findBash({ platform: "linux", env: { BDS_HARNESS_BASH: "/nope/bash" }, exists }), /does not exist/);
});
