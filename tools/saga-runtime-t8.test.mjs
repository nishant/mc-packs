// Saga T8: num() thousands separators, Hollis favors gated on g:hollis, removeActor cleanup. No Minecraft server.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { FAVORS } from "../packs/saga_bp/scripts/stories/favors.js";

const SCRIPTS = path.join(import.meta.dirname, "..", "packs", "saga_bp", "scripts");
const read = (f) => fs.readFileSync(path.join(SCRIPTS, f), "utf8");

test("num() groups thousands itself and keeps the sign", () => {
  const src = read("util.js").match(/^export const num = [\s\S]*?^\};$/m)?.[0];
  assert.ok(src, "num() not found");
  const num = vm.runInNewContext(`${src.replace("export const num", "const num")}; num`);
  assert.equal(num(1234), "1,234");
  assert.equal(num(999), "999");
  assert.equal(num(1234567.6), "1,234,568");
  assert.equal(num(-1234), "-1,234");
  assert.equal(num(-12), "-12");
  assert.equal(num(0), "0");
});

test("the Hollis favors are not offered once Hollis is lost", () => {
  const hollis = FAVORS.filter((f) => f.npc === "hollis");
  assert.equal(hollis.length, 4);
  for (const f of hollis) assert.deepEqual(f.when, { "g:hollis": "!lost" }, f.id);
  assert.ok(read("data.js").includes("matches(f.when, saga, `fv:${npc}`)"), "favorOfDay filters by when");
});

test("removeActor clears dressing and tendActors' catch uses it", () => {
  const src = read("actors.js");
  const fn = src.match(/export function removeActor[\s\S]*?\n\}\n/)[0];
  assert.match(fn, /dressing\.delete\(id\)/);
  assert.match(src, /catch \{\n\s*removeActor\(id\);/);
});
